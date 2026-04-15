import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
import { sourceArtifacts, importJobs } from "../schema/sources";
import { observations } from "../schema/observations";
import { conditions } from "../schema/conditions";
import { medications } from "../schema/medications";
import { encounters } from "../schema/encounters";
import type { Database } from "../client";

export async function createImportJob(
  db: Database,
  params: {
    userId: string;
    fileName: string;
    mimeType: string;
    blobPath: string;
    contentHash: string;
    fileSize: number;
    dataSourceId?: string;
  },
) {
  return db.transaction(async (tx) => {
    const [artifact] = await tx
      .insert(sourceArtifacts)
      .values({
        userId: params.userId,
        fileName: params.fileName,
        mimeType: params.mimeType,
        blobPath: params.blobPath,
        contentHash: params.contentHash,
        fileSize: params.fileSize,
        dataSourceId: params.dataSourceId,
      })
      .returning();

    const [job] = await tx
      .insert(importJobs)
      .values({
        userId: params.userId,
        sourceArtifactId: artifact!.id,
        status: "pending",
      })
      .returning();

    return { importJobId: job!.id, sourceArtifactId: artifact!.id };
  });
}

export async function getImportJobStatus(
  db: Database,
  params: {
    id: string;
    userId: string;
  },
) {
  const rows = await db
    .select()
    .from(importJobs)
    .where(
      and(eq(importJobs.id, params.id), eq(importJobs.userId, params.userId)),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function listImportJobs(
  db: Database,
  params: {
    userId: string;
    limit?: number;
    status?: string;
  },
) {
  const conditions: SQL[] = [eq(importJobs.userId, params.userId)];
  if (params.status) conditions.push(eq(importJobs.status, params.status));

  return db
    .select({
      id: importJobs.id,
      status: importJobs.status,
      classifiedType: importJobs.classifiedType,
      classificationConfidence: importJobs.classificationConfidence,
      extractionCount: importJobs.extractionCount,
      needsReview: importJobs.needsReview,
      errorMessage: importJobs.errorMessage,
      createdAt: importJobs.createdAt,
      parseCompletedAt: importJobs.parseCompletedAt,
      completedAt: importJobs.completedAt,
      fileName: sourceArtifacts.fileName,
      mimeType: sourceArtifacts.mimeType,
      fileSize: sourceArtifacts.fileSize,
    })
    .from(importJobs)
    .innerJoin(
      sourceArtifacts,
      eq(importJobs.sourceArtifactId, sourceArtifacts.id),
    )
    .where(and(...conditions))
    .orderBy(desc(importJobs.createdAt))
    .limit(params.limit ?? 20);
}

export async function deleteImportJob(
  db: Database,
  params: {
    id: string;
    userId: string;
  },
) {
  return db.transaction(async (tx) => {
    // Verify the job belongs to the user and get artifact ID
    const [job] = await tx
      .select({
        id: importJobs.id,
        sourceArtifactId: importJobs.sourceArtifactId,
      })
      .from(importJobs)
      .where(
        and(eq(importJobs.id, params.id), eq(importJobs.userId, params.userId)),
      )
      .limit(1);

    if (!job) return null;

    // Delete dependent records that reference this import job
    await tx.delete(observations).where(eq(observations.importJobId, job.id));
    await tx.delete(conditions).where(eq(conditions.importJobId, job.id));
    await tx.delete(medications).where(eq(medications.importJobId, job.id));
    await tx.delete(encounters).where(eq(encounters.importJobId, job.id));

    // Now delete the import job itself (flagged_extractions cascade automatically)
    await tx.delete(importJobs).where(eq(importJobs.id, job.id));

    // Delete the source artifact
    await tx
      .delete(sourceArtifacts)
      .where(eq(sourceArtifacts.id, job.sourceArtifactId));

    return { id: job.id, sourceArtifactId: job.sourceArtifactId };
  });
}

export async function getReviewQueue(
  db: Database,
  params: {
    userId: string;
  },
) {
  return db
    .select({
      id: importJobs.id,
      status: importJobs.status,
      classifiedType: importJobs.classifiedType,
      classificationConfidence: importJobs.classificationConfidence,
      extractionCount: importJobs.extractionCount,
      errorMessage: importJobs.errorMessage,
      createdAt: importJobs.createdAt,
      fileName: sourceArtifacts.fileName,
      mimeType: sourceArtifacts.mimeType,
    })
    .from(importJobs)
    .innerJoin(
      sourceArtifacts,
      eq(importJobs.sourceArtifactId, sourceArtifacts.id),
    )
    .where(
      and(
        eq(importJobs.userId, params.userId),
        eq(importJobs.needsReview, true),
      ),
    )
    .orderBy(desc(importJobs.createdAt));
}

export async function findImportJobByContentHash(
  db: Database,
  params: {
    userId: string;
    contentHash: string;
  },
) {
  const rows = await db
    .select({
      importJobId: importJobs.id,
      status: importJobs.status,
      fileName: sourceArtifacts.fileName,
      createdAt: importJobs.createdAt,
    })
    .from(sourceArtifacts)
    .innerJoin(importJobs, eq(importJobs.sourceArtifactId, sourceArtifacts.id))
    .where(
      and(
        eq(sourceArtifacts.userId, params.userId),
        eq(sourceArtifacts.contentHash, params.contentHash),
      ),
    )
    .orderBy(desc(importJobs.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function resetImportJob(
  db: Database,
  params: {
    id: string;
    userId: string;
  },
) {
  return db.transaction(async (tx) => {
    // Verify the job belongs to the user
    const [job] = await tx
      .select({
        id: importJobs.id,
        sourceArtifactId: importJobs.sourceArtifactId,
      })
      .from(importJobs)
      .where(
        and(eq(importJobs.id, params.id), eq(importJobs.userId, params.userId)),
      )
      .limit(1);

    if (!job) return null;

    // Delete existing observations for this job
    await tx.delete(observations).where(eq(observations.importJobId, job.id));

    // Reset the job to pending
    const [updated] = await tx
      .update(importJobs)
      .set({
        status: "pending",
        classifiedType: null,
        classificationConfidence: null,
        parserId: null,
        parserVersion: null,
        extractionCount: 0,
        needsReview: false,
        errorMessage: null,
        errorDetailJson: null,
        startedAt: null,
        classifyCompletedAt: null,
        parseCompletedAt: null,
        normalizeCompletedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))
      .returning({
        id: importJobs.id,
        sourceArtifactId: importJobs.sourceArtifactId,
      });

    return updated ?? null;
  });
}

export async function resetImportJobsForReprocessing(
  db: Database,
  params: {
    userId: string;
  },
) {
  return db.transaction(async (tx) => {
    // Find all import jobs for this user that have been processed
    const jobs = await tx
      .select({
        id: importJobs.id,
        sourceArtifactId: importJobs.sourceArtifactId,
      })
      .from(importJobs)
      .where(eq(importJobs.userId, params.userId));

    if (jobs.length === 0) return { count: 0 };

    const jobIds = jobs.map((j) => j.id);

    // Delete all observations linked to these import jobs
    await tx
      .delete(observations)
      .where(inArray(observations.importJobId, jobIds));

    // Reset all import jobs to pending
    await tx
      .update(importJobs)
      .set({
        status: "pending",
        classifiedType: null,
        classificationConfidence: null,
        parserId: null,
        parserVersion: null,
        extractionCount: 0,
        needsReview: false,
        errorMessage: null,
        errorDetailJson: null,
        startedAt: null,
        classifyCompletedAt: null,
        parseCompletedAt: null,
        normalizeCompletedAt: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.userId, params.userId));

    return { count: jobs.length, jobs };
  });
}
