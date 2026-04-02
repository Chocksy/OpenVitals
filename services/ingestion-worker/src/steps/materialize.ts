import { getDb } from '@openvitals/database/client';
import { importJobs, observations } from '@openvitals/database';
import { eq } from 'drizzle-orm';
import { emitEvent } from '@openvitals/events';
import type { WorkflowContext } from '../workflow';
import type { NormalizationResult } from '@openvitals/ingestion';

export async function materialize(
  ctx: WorkflowContext,
  normalization: NormalizationResult
): Promise<void> {
  const db = getDb();

  const { normalized, flagged } = normalization;

  if (normalized.length > 0) {
    // Batch insert observations
    const rows = normalized.map((obs) => ({
      userId: ctx.userId,
      metricCode: obs.metricCode,
      category: obs.category,
      valueNumeric: obs.valueNumeric,
      valueText: obs.valueText,
      unit: obs.unit,
      referenceRangeLow: obs.referenceRangeLow,
      referenceRangeHigh: obs.referenceRangeHigh,
      referenceRangeText: obs.referenceRangeText,
      isAbnormal: obs.isAbnormal,
      status: 'extracted' as const,
      confidenceScore: obs.confidenceScore,
      observedAt: obs.observedAt,
      sourceArtifactId: ctx.artifactId,
      importJobId: ctx.importJobId,
    }));

    const inserted = await db.insert(observations).values(rows).returning({ id: observations.id });

    // Emit events for each observation
    for (const row of inserted) {
      emitEvent({
        type: 'observation.created',
        payload: {
          observationId: row.id,
          metricCode: '',
          category: '',
          importJobId: ctx.importJobId,
        },
        userId: ctx.userId,
        timestamp: new Date(),
      });
    }
  }

  // Save flagged extractions to DB so the UI can show them
  if (flagged.length > 0) {
    const flaggedRows = flagged.map((f) => ({
      importJobId: ctx.importJobId,
      userId: ctx.userId,
      analyte: f.extraction.analyte,
      valueNumeric: f.extraction.value,
      valueText: f.extraction.valueText,
      unit: f.extraction.unit,
      referenceRangeLow: f.extraction.referenceRangeLow,
      referenceRangeHigh: f.extraction.referenceRangeHigh,
      referenceRangeText: f.extraction.referenceRangeText,
      isAbnormal: f.extraction.isAbnormal,
      observedAt: f.extraction.observedAt ? new Date(f.extraction.observedAt) : null,
      flagReason: f.reason,
      flagDetails: f.details,
    }));

    // Use raw SQL since this table isn't in the Drizzle schema yet
    const rawDb = getDb();
    for (const row of flaggedRows) {
      await rawDb.execute(
        `INSERT INTO flagged_extractions (import_job_id, user_id, analyte, value_numeric, value_text, unit, reference_range_low, reference_range_high, reference_range_text, is_abnormal, observed_at, flag_reason, flag_details) VALUES ('${row.importJobId}', '${row.userId}', '${row.analyte.replace(/'/g, "''")}', ${row.valueNumeric ?? 'NULL'}, ${row.valueText ? `'${row.valueText.replace(/'/g, "''")}'` : 'NULL'}, ${row.unit ? `'${row.unit}'` : 'NULL'}, ${row.referenceRangeLow ?? 'NULL'}, ${row.referenceRangeHigh ?? 'NULL'}, ${row.referenceRangeText ? `'${row.referenceRangeText.replace(/'/g, "''")}'` : 'NULL'}, ${row.isAbnormal ?? 'NULL'}, ${row.observedAt ? `'${row.observedAt.toISOString().split('T')[0]}'` : 'NULL'}, '${row.flagReason}', '${(row.flagDetails ?? '').replace(/'/g, "''")}')`
      );
    }
    console.log(`[materialize] Saved ${flaggedRows.length} flagged extractions to DB`);
  }

  // Determine final status
  const needsReview = flagged.length > 0;
  const finalStatus = needsReview ? 'review_needed' : 'completed';

  await db.update(importJobs)
    .set({
      status: finalStatus,
      extractionCount: normalized.length,
      needsReview,
      completedAt: new Date(),
    })
    .where(eq(importJobs.id, ctx.importJobId));

  emitEvent({
    type: 'import.completed',
    payload: {
      importJobId: ctx.importJobId,
      observationCount: normalized.length,
    },
    userId: ctx.userId,
    timestamp: new Date(),
  });

  console.log(
    `[materialize] Inserted ${normalized.length} observations, ` +
    `${flagged.length} flagged. Status: ${finalStatus}`
  );
}
