/**
 * One-time, idempotent import of the legacy OpenVitals tables into the lean
 * schema. Reads `metric_definitions`, `optimal_ranges`, `source_artifacts`,
 * `import_jobs` and `observations`. Never writes to them.
 *
 * Duplicate catalog entries (`mch`/`mean_corpuscular_hemoglobin`, ...) collapse
 * onto one canonical code, so a biomarker has a single trend line.
 */
import { pool } from "../db";
import { canonicalCode } from "./merge-metrics";

interface LegacyMetric {
  id: string;
  name: string;
  category: string | null;
  unit: string | null;
  aliases: unknown;
  sort_order: number | null;
}

/** One `source_artifacts` row plus its latest `import_jobs.status`. */
export interface LegacyArtifact {
  id: string;
  user_id: string;
  file_name: string | null;
  created_at: Date | string | null;
  raw_text_extracted: string | null;
  blob_path: string | null;
  content_hash: string | null;
  job_status: string | null;
}

/**
 * Pure: a legacy artifact → the `uploads` row. The id is reused, so importing
 * twice updates instead of duplicating.
 */
export function legacyUploadRow(a: LegacyArtifact) {
  return {
    id: a.id,
    userId: a.user_id,
    fileName: a.file_name,
    status:
      a.job_status === "completed"
        ? "done"
        : a.job_status === "review_needed"
          ? "needs_review"
          : "failed",
    createdAt: a.created_at,
    rawText: a.raw_text_extracted,
    blobPath: a.blob_path,
    sha256: a.content_hash,
    source: "legacy" as const,
  };
}

const chunk = <T>(rows: T[], size: number): T[][] =>
  rows.length ? [rows.slice(0, size), ...chunk(rows.slice(size), size)] : [];

export async function importLegacy({ reset = false } = {}) {
  const db = pool();

  if (reset) {
    // Only the two tables this importer owns. uploads / simple_insights /
    // checkins reference neither, so nothing else is touched.
    await db.query("TRUNCATE readings, metrics");
    console.log("[import-legacy] reset: truncated readings, metrics");
  }

  const defs = (
    await db.query<LegacyMetric>(
      "SELECT id, name, category, unit, aliases, sort_order FROM metric_definitions",
    )
  ).rows;

  /** legacy code -> canonical code */
  const canon = new Map(defs.map((d) => [d.id, canonicalCode(d.id, d.name)]));

  const groups = new Map<string, { row: LegacyMetric; aliases: Set<string> }>();
  for (const d of defs) {
    const code = canon.get(d.id)!;
    const g = groups.get(code);
    const aliases = g?.aliases ?? new Set<string>();
    for (const a of Array.isArray(d.aliases) ? d.aliases : []) {
      if (typeof a === "string") aliases.add(a);
    }
    if (d.id !== code) {
      aliases.add(d.id);
      aliases.add(d.name);
    }
    // the row that owns the canonical code wins; otherwise first one in
    groups.set(code, {
      row: !g || d.id === code ? d : g.row,
      aliases,
    });
  }

  let metricsInserted = 0;
  for (const [code, { row, aliases }] of groups) {
    const res = await db.query(
      `INSERT INTO metrics (code, name, category, unit, aliases, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (code) DO NOTHING`,
      [
        code,
        row.name,
        row.category ?? "other",
        row.unit,
        JSON.stringify([...aliases]),
        row.sort_order ?? 0,
      ],
    );
    metricsInserted += res.rowCount ?? 0;
  }

  const optimal = (
    await db.query<{
      metric_code: string;
      range_low: number | null;
      range_high: number | null;
    }>(
      `SELECT DISTINCT ON (metric_code) metric_code, range_low, range_high
       FROM optimal_ranges ORDER BY metric_code, (sex IS NULL) DESC, id`,
    )
  ).rows;
  const seenOptimal = new Set<string>();
  for (const o of optimal) {
    const code = canon.get(o.metric_code) ?? o.metric_code;
    if (seenOptimal.has(code)) continue;
    seenOptimal.add(code);
    await db.query(
      "UPDATE metrics SET optimal_low = $2, optimal_high = $3 WHERE code = $1",
      [code, o.range_low, o.range_high],
    );
  }

  /* One `uploads` row per legacy file, before the readings that point at it. */
  const artifacts = (
    await db.query<LegacyArtifact>(
      `SELECT a.id, a.user_id, a.file_name, a.created_at, a.raw_text_extracted,
              a.blob_path, a.content_hash,
              (SELECT j.status FROM import_jobs j
                WHERE j.source_artifact_id = a.id
                ORDER BY j.created_at DESC LIMIT 1) AS job_status
         FROM source_artifacts a`,
    )
  ).rows;

  /** Files the user deleted here. A re-import must not resurrect them. */
  const dropped = new Set(
    (
      await db.query<{ id: string }>(
        "SELECT id FROM uploads WHERE status = 'deleted'",
      )
    ).rows.map((r) => r.id),
  );

  let uploadsUpserted = 0;
  for (const a of artifacts) {
    if (dropped.has(a.id)) continue;
    const u = legacyUploadRow(a);
    const res = await db.query(
      `INSERT INTO uploads (id, user_id, file_name, status, created_at,
                            raw_text, blob_path, sha256, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         file_name = EXCLUDED.file_name, status = EXCLUDED.status,
         created_at = EXCLUDED.created_at, raw_text = EXCLUDED.raw_text,
         blob_path = EXCLUDED.blob_path, sha256 = EXCLUDED.sha256,
         source = EXCLUDED.source`,
      [
        u.id,
        u.userId,
        u.fileName,
        u.status,
        u.createdAt,
        u.rawText,
        u.blobPath,
        u.sha256,
        u.source,
      ],
    );
    uploadsUpserted += res.rowCount ?? 0;
  }

  const observations = (
    await db.query<Record<string, any>>(
      `SELECT o.id, o.user_id, o.metric_code, o.value_numeric, o.value_text, o.unit,
              o.reference_range_low, o.reference_range_high,
              o.observed_at::date AS observed_at, o.created_at,
              o.source_artifact_id,
              COALESCE(o.metadata_json->>'source', '') AS source
       FROM observations o`,
    )
  ).rows;

  let calculated = 0;
  let unknown = 0;
  const values: unknown[][] = [];
  for (const o of observations) {
    if (o.source === "calculated") {
      calculated++;
      continue;
    }
    const code = canon.get(o.metric_code);
    if (!code || !groups.has(code)) {
      unknown++;
      continue;
    }
    if (dropped.has(o.source_artifact_id)) continue;
    values.push([
      o.id,
      o.user_id,
      code,
      o.value_numeric,
      o.value_text,
      o.unit,
      o.reference_range_low,
      o.reference_range_high,
      o.observed_at,
      o.created_at,
      o.source_artifact_id,
    ]);
  }

  const COLS = 11;
  let readingsInserted = 0;
  for (const batch of chunk(values, 100)) {
    const params = batch.flat();
    const tuples = batch
      .map(
        (_, i) =>
          `(${Array.from({ length: COLS }, (_, j) => `$${i * COLS + j + 1}`).join(", ")})`,
      )
      .join(", ");
    // DO UPDATE, not DO NOTHING: rows imported before uploads existed still
    // need their upload_id.
    const res = await db.query(
      `INSERT INTO readings (id, user_id, metric_code, value, value_text, unit,
                             ref_low, ref_high, observed_at, created_at, upload_id)
       VALUES ${tuples}
       ON CONFLICT (id) DO UPDATE SET upload_id = EXCLUDED.upload_id
        WHERE readings.upload_id IS NULL AND EXCLUDED.upload_id IS NOT NULL`,
      params,
    );
    readingsInserted += res.rowCount ?? 0;
  }

  await db.query(
    `UPDATE uploads u
        SET readings_count = (SELECT count(*) FROM readings r WHERE r.upload_id = u.id)
      WHERE u.source = 'legacy'`,
  );

  const totals = (
    await db.query(
      `SELECT (SELECT count(*) FROM metrics) AS metrics,
              (SELECT count(*) FROM readings) AS readings,
              (SELECT count(*) FROM readings WHERE upload_id IS NOT NULL) AS linked,
              (SELECT count(*) FROM uploads) AS uploads`,
    )
  ).rows[0];
  console.log(
    `[import-legacy] catalog=${defs.length} canonical=${groups.size} merged_away=${defs.length - groups.size} ` +
      `metrics_inserted=${metricsInserted} readings_inserted=${readingsInserted} ` +
      `uploads_upserted=${uploadsUpserted} ` +
      `skipped_calculated=${calculated} skipped_unknown_metric=${unknown} ` +
      `totals: metrics=${totals.metrics} readings=${totals.readings} ` +
      `uploads=${totals.uploads} readings_linked=${totals.linked}`,
  );
  return {
    metrics: Number(totals.metrics),
    readings: Number(totals.readings),
    uploads: Number(totals.uploads),
    linked: Number(totals.linked),
  };
}

let ensured: Promise<unknown> | null = null;

/** Auto-import on the first request when `readings` is still empty. */
export function ensureImported() {
  ensured ??= (async () => {
    const { rows } = await pool().query(
      "SELECT count(*)::int AS n FROM readings",
    );
    if (rows[0].n === 0) await importLegacy();
  })().catch((e) => {
    ensured = null;
    console.error("[import-legacy] auto-import failed:", e);
  });
  return ensured;
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  for (const f of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(f);
    } catch {}
  }
  importLegacy({ reset: process.argv.includes("--reset") })
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
