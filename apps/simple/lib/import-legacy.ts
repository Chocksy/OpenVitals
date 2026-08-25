/**
 * One-time, idempotent import of the legacy OpenVitals tables into the lean
 * schema. Reads `metric_definitions`, `optimal_ranges` and `observations`.
 * Never writes to them.
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

const chunk = <T,>(rows: T[], size: number): T[][] =>
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

  const observations = (
    await db.query<Record<string, any>>(
      `SELECT o.id, o.user_id, o.metric_code, o.value_numeric, o.value_text, o.unit,
              o.reference_range_low, o.reference_range_high,
              o.observed_at::date AS observed_at, o.created_at,
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
    ]);
  }

  let readingsInserted = 0;
  for (const batch of chunk(values, 100)) {
    const params = batch.flat();
    const tuples = batch
      .map(
        (_, i) =>
          `(${Array.from({ length: 10 }, (_, j) => `$${i * 10 + j + 1}`).join(", ")})`,
      )
      .join(", ");
    const res = await db.query(
      `INSERT INTO readings (id, user_id, metric_code, value, value_text, unit,
                             ref_low, ref_high, observed_at, created_at)
       VALUES ${tuples} ON CONFLICT (id) DO NOTHING`,
      params,
    );
    readingsInserted += res.rowCount ?? 0;
  }

  const totals = (
    await db.query(
      "SELECT (SELECT count(*) FROM metrics) AS metrics, (SELECT count(*) FROM readings) AS readings",
    )
  ).rows[0];
  console.log(
    `[import-legacy] catalog=${defs.length} canonical=${groups.size} merged_away=${defs.length - groups.size} ` +
      `metrics_inserted=${metricsInserted} readings_inserted=${readingsInserted} ` +
      `skipped_calculated=${calculated} skipped_unknown_metric=${unknown} ` +
      `totals: metrics=${totals.metrics} readings=${totals.readings}`,
  );
  return { metrics: Number(totals.metrics), readings: Number(totals.readings) };
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
