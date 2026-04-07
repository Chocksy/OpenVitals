import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createRouter, protectedProcedure } from "../init";
import {
  createImportJob,
  getImportJobStatus,
  listImportJobs,
  deleteImportJob,
  getReviewQueue,
  listObservationsByImportJob,
  resetImportJobsForReprocessing,
  findImportJobByContentHash,
  resetImportJob,
} from "@openvitals/database";

export const importJobsRouter = createRouter({
  create: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        blobPath: z.string(),
        contentHash: z.string(),
        fileSize: z.number(),
        dataSourceId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate document
      const existing = await findImportJobByContentHash(ctx.db, {
        userId: ctx.userId,
        contentHash: input.contentHash,
      });

      if (existing) {
        return {
          duplicate: true as const,
          existingJobId: existing.importJobId,
          existingStatus: existing.status,
          existingFileName: existing.fileName,
        };
      }

      const result = await createImportJob(ctx.db, {
        userId: ctx.userId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        blobPath: input.blobPath,
        contentHash: input.contentHash,
        fileSize: input.fileSize,
        dataSourceId: input.dataSourceId,
      });

      // Trigger ingestion worker
      const workerUrl =
        process.env.RENDER_WORKER_URL ?? "http://localhost:4000";
      const webhookSecret =
        process.env.RENDER_WEBHOOK_SECRET ?? "dev-secret-change-me";
      fetch(`${workerUrl}/api/workflows/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify({
          importJobId: result.importJobId,
          artifactId: result.sourceArtifactId,
          userId: ctx.userId,
        }),
      }).catch((err) => {
        console.error(
          "[importJobs.create] Failed to trigger worker:",
          err.message,
        );
      });

      return { duplicate: false as const, importJobId: result.importJobId };
    }),

  getStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await getImportJobStatus(ctx.db, {
        id: input.id,
        userId: ctx.userId,
      });

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found",
        });
      }

      return {
        status: job.status,
        classifiedType: job.classifiedType,
        classificationConfidence: job.classificationConfidence,
        extractionCount: job.extractionCount ?? 0,
        needsReview: job.needsReview ?? false,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt!,
        parseCompletedAt: job.parseCompletedAt,
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const items = await listImportJobs(ctx.db, {
        userId: ctx.userId,
        limit: input.limit,
        status: input.status,
      });
      return { items };
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await getImportJobStatus(ctx.db, {
        id: input.id,
        userId: ctx.userId,
      });
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found",
        });
      }
      const observations = await listObservationsByImportJob(ctx.db, {
        importJobId: input.id,
        userId: ctx.userId,
      });

      // Fetch flagged extractions (unmatched items)
      const flaggedResult = await ctx.db.execute(
        `SELECT id, analyte, value_numeric, value_text, unit, reference_range_low, reference_range_high, reference_range_text, is_abnormal, observed_at, flag_reason, flag_details, resolved, resolved_metric_code
         FROM flagged_extractions
         WHERE import_job_id = '${input.id}' AND user_id = '${ctx.userId}'
         ORDER BY analyte`,
      );
      const flaggedExtractions = (flaggedResult as any).rows ?? [];

      // Filter out duplicates using multiple strategies:
      // 1. Exact value+unit match against stored observations
      // 2. Analyte name similarity (e.g., "Basophils (%)" is duplicate of basophils_pct)
      // 3. Same numeric value with compatible units (e.g., % matches %)
      const storedLookup = observations.map((o) => ({
        code: o.metricCode,
        value: o.valueNumeric,
        unit: o.unit,
      }));

      const genuinelyUnmatched = flaggedExtractions.filter((f: any) => {
        const fVal = f.value_numeric;
        const fUnit = f.unit?.toLowerCase() ?? "";
        const fName =
          f.analyte?.toLowerCase().replace(/[()%]/g, "").trim() ?? "";

        return !storedLookup.some((s) => {
          // Strategy 1: exact value + unit match
          if (s.value === fVal && s.unit?.toLowerCase() === fUnit) return true;

          // Strategy 2: analyte name stem matches metric code stem
          // e.g., "basophils" from "Basophils (%)" matches "basophils" from "basophils_abs"
          // Don't require value match since % and absolute are different numbers
          const codeStem = s.code.replace(/_pct$/, "").replace(/_abs$/, "");
          if (codeStem.length >= 3 && fName.includes(codeStem)) return true;

          // Strategy 3: metric code contains a word from the analyte name
          // e.g., "total serum proteins" → check if any code contains "protein"
          const fWords = fName
            .split(/\s+/)
            .filter((w: string) => w.length >= 4);
          if (fWords.some((w: string) => s.code.includes(w))) return true;

          return false;
        });
      });

      return { job, observations, flaggedExtractions: genuinelyUnmatched };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await deleteImportJob(ctx.db, {
        id: input.id,
        userId: ctx.userId,
      });
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found",
        });
      }
      return { success: true };
    }),

  reviewQueue: protectedProcedure.query(async ({ ctx }) => {
    const items = await getReviewQueue(ctx.db, { userId: ctx.userId });
    return { items };
  }),

  resolveFlagged: protectedProcedure
    .input(
      z.object({
        flaggedId: z.string().uuid(),
        metricCode: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Get the flagged extraction
      const flaggedResult = await ctx.db.execute(
        `SELECT * FROM flagged_extractions WHERE id = '${input.flaggedId}' AND user_id = '${ctx.userId}'`,
      );
      const flagged = (flaggedResult as any).rows?.[0];
      if (!flagged)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Flagged extraction not found",
        });

      // 2. Get the target metric definition for unit info
      const [metric] = await ctx.db
        .select()
        .from((await import("@openvitals/database")).metricDefinitions)
        .where(
          eq(
            (await import("@openvitals/database")).metricDefinitions.id,
            input.metricCode,
          ),
        )
        .limit(1);
      if (!metric)
        throw new TRPCError({ code: "NOT_FOUND", message: "Metric not found" });

      // 3. Try unit conversion if needed
      let finalValue = flagged.value_numeric;
      let finalUnit = flagged.unit ?? metric.unit ?? "";
      if (
        flagged.unit &&
        metric.unit &&
        flagged.unit.toLowerCase() !== metric.unit.toLowerCase()
      ) {
        const convResult = await ctx.db.execute(
          `SELECT multiplier, "offset" FROM unit_conversions WHERE lower(from_unit) = lower('${flagged.unit}') AND lower(to_unit) = lower('${metric.unit}') AND (metric_code = '${input.metricCode}' OR metric_code IS NULL) ORDER BY metric_code NULLS LAST LIMIT 1`,
        );
        const conv = (convResult as any).rows?.[0];
        if (conv) {
          finalValue = finalValue * conv.multiplier + conv.offset;
          finalUnit = metric.unit;
        }
      }

      // 4. Create observation from the flagged extraction
      const obs = await ctx.db
        .insert((await import("@openvitals/database")).observations)
        .values({
          userId: ctx.userId,
          metricCode: input.metricCode,
          category: metric.category,
          valueNumeric: finalValue,
          valueText: flagged.value_text,
          unit: finalUnit,
          referenceRangeLow: flagged.reference_range_low,
          referenceRangeHigh: flagged.reference_range_high,
          referenceRangeText: flagged.reference_range_text,
          isAbnormal: flagged.is_abnormal,
          status: "confirmed",
          confidenceScore: 0.9,
          observedAt: flagged.observed_at
            ? new Date(flagged.observed_at)
            : new Date(),
          importJobId: flagged.import_job_id,
        })
        .returning({
          id: (await import("@openvitals/database")).observations.id,
        });

      // 5. Mark flagged as resolved
      await ctx.db.execute(
        `UPDATE flagged_extractions SET resolved = true, resolved_metric_code = '${input.metricCode}' WHERE id = '${input.flaggedId}'`,
      );

      // 6. Add analyte name as alias for future auto-matching
      const analyte = flagged.analyte;
      if (analyte) {
        const existingAliases = (metric.aliases as string[]) ?? [];
        if (
          !existingAliases.some(
            (a: string) => a.toLowerCase() === analyte.toLowerCase(),
          )
        ) {
          await ctx.db.execute(
            `UPDATE metric_definitions SET aliases = aliases::jsonb || '["${analyte.replace(/"/g, '\\"')}"]'::jsonb WHERE id = '${input.metricCode}'`,
          );
        }
      }

      // 7. Update extraction count on import job
      await ctx.db.execute(
        `UPDATE import_jobs SET extraction_count = extraction_count + 1 WHERE id = '${flagged.import_job_id}'`,
      );

      return { observationId: obs[0]!.id, metricCode: input.metricCode };
    }),

  reprocess: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await resetImportJob(ctx.db, {
        id: input.id,
        userId: ctx.userId,
      });

      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Import job not found",
        });
      }

      const workerUrl =
        process.env.RENDER_WORKER_URL ?? "http://localhost:4000";
      const webhookSecret =
        process.env.RENDER_WEBHOOK_SECRET ?? "dev-secret-change-me";

      fetch(`${workerUrl}/api/workflows/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify({
          importJobId: job.id,
          artifactId: job.sourceArtifactId,
          userId: ctx.userId,
        }),
      }).catch((err) => {
        console.error(
          `[importJobs.reprocess] Failed to trigger worker for job=${job.id}:`,
          err.message,
        );
      });

      return { importJobId: job.id };
    }),

  reprocessAll: protectedProcedure.mutation(async ({ ctx }) => {
    const result = await resetImportJobsForReprocessing(ctx.db, {
      userId: ctx.userId,
    });

    if (result.count === 0) {
      return { count: 0 };
    }

    // Trigger worker for each reset job
    const workerUrl = process.env.RENDER_WORKER_URL ?? "http://localhost:4000";
    const webhookSecret =
      process.env.RENDER_WEBHOOK_SECRET ?? "dev-secret-change-me";

    for (const job of result.jobs!) {
      fetch(`${workerUrl}/api/workflows/trigger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${webhookSecret}`,
        },
        body: JSON.stringify({
          importJobId: job.id,
          artifactId: job.sourceArtifactId,
          userId: ctx.userId,
        }),
      }).catch((err) => {
        console.error(
          `[importJobs.reprocessAll] Failed to trigger worker for job=${job.id}:`,
          err.message,
        );
      });
    }

    return { count: result.count };
  }),
});
