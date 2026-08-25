import { asc, eq } from "drizzle-orm";
import { getDb, metrics, readings, type Metric } from "@/db";
import { ensureImported } from "./import-legacy";
import { statusOf, type Status } from "./status";

export interface Point {
  date: string;
  value: number;
}

export interface MetricRow {
  code: string;
  name: string;
  category: string;
  unit: string | null;
  optimalLow: number | null;
  optimalHigh: number | null;
  sortOrder: number;
  derived: boolean;
  points: Point[];
  rows: {
    observedAt: string;
    value: number | null;
    valueText: string | null;
    unit: string | null;
    refLow: number | null;
    refHigh: number | null;
  }[];
  latest: MetricRow["rows"][number];
  status: Status;
}

/** value = glucose * insulin / 405, and total cholesterol minus HDL. */
const DERIVED: Record<
  string,
  { inputs: [string, string]; f: (a: number, b: number) => number }
> = {
  homa_ir: { inputs: ["glucose", "insulin"], f: (g, i) => (g * i) / 405 },
  non_hdl_cholesterol: {
    inputs: ["total_cholesterol", "hdl_cholesterol"],
    f: (tc, hdl) => tc - hdl,
  },
};

function toRow(m: Metric, rows: MetricRow["rows"], derived = false): MetricRow {
  const latest = rows[rows.length - 1]!;
  return {
    code: m.code,
    name: m.name,
    category: m.category,
    unit: m.unit,
    optimalLow: m.optimalLow,
    optimalHigh: m.optimalHigh,
    sortOrder: m.sortOrder ?? 0,
    derived,
    points: rows
      .filter((r) => r.value != null)
      .map((r) => ({ date: r.observedAt, value: r.value! })),
    rows,
    latest,
    status: statusOf({
      value: latest.value,
      refLow: latest.refLow,
      refHigh: latest.refHigh,
      optimalLow: m.optimalLow,
      optimalHigh: m.optimalHigh,
    }),
  };
}

/** Every metric the user has data for, oldest reading first, plus derived rows. */
export async function getMetricRows(userId: string): Promise<MetricRow[]> {
  await ensureImported();
  const db = getDb();
  const [defs, all] = await Promise.all([
    db.select().from(metrics),
    db
      .select()
      .from(readings)
      .where(eq(readings.userId, userId))
      .orderBy(asc(readings.observedAt)),
  ]);
  const byCode = new Map(defs.map((m) => [m.code, m]));

  const grouped = new Map<string, MetricRow["rows"]>();
  for (const r of all) {
    if (!grouped.has(r.metricCode)) grouped.set(r.metricCode, []);
    grouped.get(r.metricCode)!.push({
      observedAt: r.observedAt,
      value: r.value,
      valueText: r.valueText,
      unit: r.unit,
      refLow: r.refLow,
      refHigh: r.refHigh,
    });
  }

  const out: MetricRow[] = [];
  for (const [code, rows] of grouped) {
    const m = byCode.get(code);
    if (m) out.push(toRow(m, rows));
  }

  // Derived metrics are computed at read time and never stored.
  for (const [code, { inputs, f }] of Object.entries(DERIVED)) {
    const m = byCode.get(code);
    if (!m || grouped.has(code)) continue;
    const a = grouped.get(inputs[0]);
    const b = grouped.get(inputs[1]);
    if (!a || !b) continue;
    const bByDate = new Map(b.map((r) => [r.observedAt, r]));
    const rows = a
      .filter(
        (r) => r.value != null && bByDate.get(r.observedAt)?.value != null,
      )
      .map((r) => ({
        observedAt: r.observedAt,
        value:
          Math.round(f(r.value!, bByDate.get(r.observedAt)!.value!) * 100) /
          100,
        valueText: null,
        unit: m.unit,
        refLow: null,
        refHigh: null,
      }));
    if (rows.length) out.push(toRow(m, rows, true));
  }

  return out.sort(
    (x, y) =>
      x.category.localeCompare(y.category) ||
      x.sortOrder - y.sortOrder ||
      x.name.localeCompare(y.name),
  );
}

/** code -> display name, for chips that reference metrics by code. */
export async function getMetricNames(): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ code: metrics.code, name: metrics.name })
    .from(metrics);
  return new Map(rows.map((m) => [m.code, m.name]));
}

export function groupByCategory(rows: MetricRow[]) {
  const map = new Map<string, MetricRow[]>();
  for (const r of rows) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return [...map.entries()];
}


export interface BiomarkerRow {
  code: string;
  name: string;
  category: string;
  unit: string | null;
  derived: boolean;
  status: Status;
  value: string;
  observedAt: string;
  spark: number[];
}

/** Flat row for the /biomarkers list. */
export function toBiomarkerRow(m: MetricRow): BiomarkerRow {
  return {
    code: m.code,
    name: m.name,
    category: m.category,
    unit: m.latest.unit ?? m.unit,
    derived: m.derived,
    status: m.status,
    value: String(m.latest.value ?? m.latest.valueText ?? "\u2014"),
    observedAt: m.latest.observedAt,
    spark: m.points.slice(-8).map((p) => p.value),
  };
}

/** Categories that are mostly one-off swabs and dipsticks go last. */
const LAST_CATEGORIES = new Set([
  "urine",
  "urinalysis",
  "microbiology",
  "susceptibility",
  "immunology",
]);

export function sortForBiomarkerList(rows: BiomarkerRow[]): BiomarkerRow[] {
  const rank = (c: string) => (LAST_CATEGORIES.has(c) ? 1 : 0);
  return [...rows].sort(
    (a, b) =>
      rank(a.category) - rank(b.category) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name),
  );
}
