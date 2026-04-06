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
      return { job, observations };
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
