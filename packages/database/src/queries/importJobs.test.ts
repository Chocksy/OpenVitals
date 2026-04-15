import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, type Database } from "../client";
import { users } from "../schema/users";
import { sourceArtifacts, importJobs } from "../schema/sources";
import { observations } from "../schema/observations";
import { conditions } from "../schema/conditions";
import { medications } from "../schema/medications";
import { encounters } from "../schema/encounters";
import { deleteImportJob } from "./importJobs";

const TEST_USER_ID = "test-delete-import-job-user";

describe("deleteImportJob", () => {
  let db: Database;

  beforeAll(async () => {
    db = getDb();

    // Ensure test user exists
    await db
      .insert(users)
      .values({
        id: TEST_USER_ID,
        email: `${TEST_USER_ID}@test.local`,
        name: "Test User",
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    // Clean up test user (cascades to all child records)
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
  });

  it("deletes an import job that has dependent observations, conditions, medications, and encounters", async () => {
    // 1. Create a source artifact
    const [artifact] = await db
      .insert(sourceArtifacts)
      .values({
        userId: TEST_USER_ID,
        fileName: "test-delete.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
        contentHash: `test-delete-${Date.now()}`,
        blobPath: "/test/delete.pdf",
      })
      .returning();

    // 2. Create an import job
    const [job] = await db
      .insert(importJobs)
      .values({
        userId: TEST_USER_ID,
        sourceArtifactId: artifact!.id,
        status: "completed",
      })
      .returning();

    const jobId = job!.id;

    // 3. Create dependent records in all four referencing tables
    await db.insert(observations).values({
      userId: TEST_USER_ID,
      metricCode: "glucose",
      category: "metabolic",
      valueNumeric: 95,
      unit: "mg/dL",
      status: "confirmed",
      observedAt: new Date(),
      importJobId: jobId,
    });

    await db.insert(conditions).values({
      userId: TEST_USER_ID,
      name: "Test Condition",
      importJobId: jobId,
    });

    await db.insert(medications).values({
      userId: TEST_USER_ID,
      name: "Test Medication",
      importJobId: jobId,
    });

    await db.insert(encounters).values({
      userId: TEST_USER_ID,
      type: "lab_visit",
      encounterDate: "2025-01-01",
      importJobId: jobId,
    });

    // 4. Delete should succeed despite dependent records
    const result = await deleteImportJob(db, {
      id: jobId,
      userId: TEST_USER_ID,
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(jobId);

    // 5. Verify the import job is actually gone
    const remaining = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, jobId));
    expect(remaining).toHaveLength(0);

    // 6. Verify dependent records are cleaned up
    const remainingObs = await db
      .select()
      .from(observations)
      .where(eq(observations.importJobId, jobId));
    expect(remainingObs).toHaveLength(0);
  });
});
