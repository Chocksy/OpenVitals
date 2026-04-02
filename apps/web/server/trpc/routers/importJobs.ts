import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, protectedProcedure } from "../init";
import {
  createImportJob,
  getImportJobStatus,
  listImportJobs,
  deleteImportJob,
  getReviewQueue,
  listObservationsByImportJob,
  resetImportJobsForReprocessing,
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

      return { importJobId: result.importJobId };
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
         ORDER BY analyte`
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
        const fUnit = f.unit?.toLowerCase() ?? '';
        const fName = f.analyte?.toLowerCase() ?? '';

        return !storedLookup.some((s) => {
          // Strategy 1: exact value + unit match
          if (s.value === fVal && s.unit?.toLowerCase() === fUnit) return true;

          // Strategy 2: name contains metric code stem
          // e.g., "basophils (%)" contains "basophils", stored code is "basophils_pct"
          const codeStem = s.code.replace(/_pct$/, '').replace(/_abs$/, '');
          if (fName.includes(codeStem) && Math.abs((s.value ?? 0) - (fVal ?? -1)) < 0.01) return true;

          // Strategy 3: same value, compatible unit category
          if (s.value === fVal && fUnit === '%' && s.unit === '%') return true;

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
