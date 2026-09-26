/**
 * You against you. Phase 39 part A.
 *
 * The person's own draws make a band (median and spread), and three small
 * readings sit on it: where the last value falls (`zOf`), whether the last few
 * draws moved to a new level (`stepOf`), and the slope of the last three draws
 * (`recentSlope`). Pure, so every number on the case screen is testable.
 */
import type { MetricRow } from "./data";

export interface Band {
  median: number;
  sd: number;
  /** the draws the band was made from */
  n: number;
  /** 4 draws: drawn dashed, raises a signal only inside a cluster */
  provisional: boolean;
}

/** One lab draw of one marker: same-day values averaged. */
export interface LabPoint {
  date: string;
  value: number;
  refLow: number | null;
  refHigh: number | null;
  unit: string | null;
}

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/**
 * Analytical floor on the spread, as a fraction of the median: the desirable
 * imprecision (half the within-person biological CV) from the EFLM biological
 * variation database (Aarsand et al., biologicalvariation.eu; the Ricós/
 * Westgard table before it). A person whose draws happen to sit close
 * together never gets a band narrower than the assay can tell apart.
 */
export const ASSAY_CV: Record<string, number> = {
  ldl_cholesterol: 0.042,
  hba1c: 0.017,
  ferritin: 0.071,
  crp: 0.211,
  hs_crp: 0.211,
  tsh: 0.097,
  eosinophils_abs: 0.105,
};
// ponytail: 5 % for every code not in the table, a round number with no
// source; add a row when a marker's band looks too tight on /brain.
const DEFAULT_CV = 0.05;

/** The lab draws of one metric, one per day, oldest first. */
export function labPoints(rows: MetricRow["rows"]): LabPoint[] {
  const byDay = new Map<string, MetricRow["rows"]>();
  for (const r of rows) {
    if (r.source != null || r.value == null) continue;
    const day = r.observedAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rs]) => {
      const last = rs[rs.length - 1]!;
      return {
        date,
        value: rs.reduce((s, r) => s + r.value!, 0) / rs.length,
        refLow: last.refLow,
        refHigh: last.refHigh,
        unit: last.unit,
      };
    });
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};

/**
 * Median and spread of the person's own draws, by default the ones before the
 * last. `sd = max(1.4826 × MAD, CV × |median|)`. Five draws make a band, four
 * a provisional one, fewer none.
 */
export function bandOf(
  points: { value: number }[],
  { excludeLast = true, code }: { excludeLast?: boolean; code?: string } = {},
): Band | undefined {
  const vs = (excludeLast ? points.slice(0, -1) : points).map((p) => p.value);
  if (vs.length < 4) return undefined;
  const m = median(vs);
  const mad = median(vs.map((v) => Math.abs(v - m)));
  const cv = (code ? ASSAY_CV[code] : undefined) ?? DEFAULT_CV;
  return {
    median: m,
    sd: Math.max(1.4826 * mad, cv * Math.abs(m)) || 1e-9,
    n: vs.length,
    provisional: vs.length < 5,
  };
}

export const zOf = (value: number, band: Band) =>
  (value - band.median) / band.sd;

/**
 * The last k ≥ 2 draws all above every earlier draw, or all below, with at
 * least three earlier draws to compare to. The largest such k wins, so
 * `since` is where the new level began.
 */
export function stepOf(points: { date: string; value: number }[]):
  | {
      dir: "up" | "down";
      since: string;
      k: number;
      priorMax: number;
      priorMin: number;
    }
  | undefined {
  let best: ReturnType<typeof stepOf>;
  for (let k = 2; points.length - k >= 3; k++) {
    const prior = points.slice(0, -k).map((p) => p.value);
    const last = points.slice(-k).map((p) => p.value);
    const priorMax = Math.max(...prior);
    const priorMin = Math.min(...prior);
    const since = points[points.length - k]!.date;
    if (last.every((v) => v > priorMax))
      best = { dir: "up", since, k, priorMax, priorMin };
    else if (last.every((v) => v < priorMin))
      best = { dir: "down", since, k, priorMax, priorMin };
  }
  return best;
}

/** Least squares over the last three draws inside 24 months of `today`. */
export function fitOf(
  points: { date: string; value: number }[],
  today: string,
) {
  const w = points
    .filter((p) => t(p.date) <= t(today) && t(today) - t(p.date) <= 2 * YEAR_MS)
    .slice(-3);
  if (w.length < 3) return undefined;
  const xs = w.map((p) => t(p.date) / YEAR_MS);
  const ys = w.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b) / 3;
  const my = ys.reduce((a, b) => a + b) / 3;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
  });
  if (!sxx) return undefined;
  const b = sxy / sxx;
  return {
    perYear: b,
    from: w[0]!.date,
    to: w[2]!.date,
    at: (d: string) => my + b * (t(d) / YEAR_MS - mx),
  };
}

export function recentSlope(
  points: { date: string; value: number }[],
  today: string,
): { perYear: number; n: 3; from: string; to: string } | undefined {
  const f = fitOf(points, today);
  return f && { perYear: f.perYear, n: 3, from: f.from, to: f.to };
}

/** The last draw's reference range or unit differs from the draw before. */
export function labChange(points: LabPoint[]): boolean {
  const [a, b] = points.slice(-2);
  if (!a || !b) return false;
  const differs = (x: number | string | null, y: number | string | null) =>
    x != null && y != null && x !== y;
  return (
    differs(a.refLow, b.refLow) ||
    differs(a.refHigh, b.refHigh) ||
    differs(a.unit?.toLowerCase() ?? null, b.unit?.toLowerCase() ?? null)
  );
}
