import { asc, eq, sql } from "drizzle-orm";
import {
  getDb,
  metrics,
  optimalOverrides,
  profileFacts,
  readings,
  type Metric,
  type ReadingFlag,
} from "@/db";
import { optimalFor, toSex, type OptimalOverrides } from "./coverage";
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
  /** Where the band came from: a guideline, an author, "user", "lab range". */
  optimalSource: string | null;
  /** `science` when a guideline or a meta-analysis backs it, else `opinion`. */
  optimalBasis: string | null;
  optimalRationale: string | null;
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
    /** Phase 24b: null is a lab draw, `healthkit` is the phone. */
    source?: string | null;
    /** Phase 32a: who wrote it, as the sample's own bundle identifier. */
    device?: string | null;
    /** Curator breadcrumbs; `unverified` is the one the engine reads. */
    flags?: ReadingFlag[] | null;
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

/** The band in force for one person, with the provenance to print next to it. */
export interface Band {
  low: number | null;
  high: number | null;
  source: string | null;
  basis: string | null;
  rationale: string | null;
}

const catalogBand = (m: Metric): Band => ({
  low: m.optimalLow,
  high: m.optimalHigh,
  // The catalog rows carry an "auto:" prefix from an older curator run.
  source: m.optimalSource?.replace(/^auto:/, "") ?? null,
  basis: null,
  rationale: null,
});

function toRow(
  m: Metric,
  rows: MetricRow["rows"],
  derived = false,
  band: Band = catalogBand(m),
): MetricRow {
  const latest = rows[rows.length - 1]!;
  return {
    code: m.code,
    name: m.name,
    category: m.category,
    unit: m.unit,
    optimalLow: band.low,
    optimalHigh: band.high,
    optimalSource: band.source,
    optimalBasis: band.basis,
    optimalRationale: band.rationale,
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
      optimalLow: band.low,
      optimalHigh: band.high,
    }),
  };
}

/** Every metric the user has data for, oldest reading first, plus derived rows. */
export async function getMetricRows(userId: string): Promise<MetricRow[]> {
  await ensureImported();
  const db = getDb();
  const [defs, all, overrides, sexFact] = await Promise.all([
    db.select().from(metrics),
    db
      .select()
      .from(readings)
      .where(eq(readings.userId, userId))
      // Oldest first, and within one day the lab draw last: `latest` is the
      // final row, and a wearable row must never shadow a draw taken the same
      // day. `source` is null for a draw, so "source is null" is false for a
      // device row (sorted first) and true for a draw (sorted last).
      .orderBy(asc(readings.observedAt), sql`${readings.source} is null`),
    db
      .select()
      .from(optimalOverrides)
      .where(eq(optimalOverrides.userId, userId)),
    db
      .select()
      .from(profileFacts)
      .where(eq(profileFacts.userId, userId))
      .then((rows) => rows.find((f) => f.key === "sex")?.value),
  ]);
  const byCode = new Map(defs.map((m) => [m.code, m]));

  const sex = toSex(sexFact);
  const mine = new Map(overrides.map((o) => [o.metricCode, o]));
  const bands: OptimalOverrides = new Map(
    overrides.map((o) => [
      o.metricCode,
      [o.low, o.high] as [number | null, number | null],
    ]),
  );

  /** Override, then the sex-specific default, then the shared catalog row. */
  const bandFor = (m: Metric): Band => {
    const own = mine.get(m.code);
    if (own)
      return {
        low: own.low,
        high: own.high,
        source: own.source,
        basis: own.basis,
        rationale: own.rationale,
      };
    const [low, high] = optimalFor(
      m.code,
      sex,
      [m.optimalLow, m.optimalHigh],
      bands,
    );
    return low === m.optimalLow && high === m.optimalHigh
      ? catalogBand(m)
      : {
          low,
          high,
          source: `${sex} reference`,
          basis: "science",
          rationale: null,
        };
  };

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
      source: r.source,
      device: r.device,
      flags: r.flags,
    });
  }

  const out: MetricRow[] = [];
  for (const [code, rows] of grouped) {
    const m = byCode.get(code);
    if (m) out.push(toRow(m, rows, false, bandFor(m)));
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
    if (rows.length) out.push(toRow(m, rows, true, bandFor(m)));
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
  /** Phase 24b: the latest value came from a device, not from a lab sheet. */
  phone: boolean;
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
    phone: m.latest.source != null,
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
