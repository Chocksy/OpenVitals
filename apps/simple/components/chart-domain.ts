/**
 * The y-domain a trend chart draws against, pulled out of `trend-chart.tsx`
 * so the data the chart receives can be tested without a browser.
 *
 * Phase 24d: the spear card on Home printed "glucose, 45 draws" under a blank
 * 140 px box. The blank came from `ResponsiveContainer` (see the note in
 * `trend-chart.tsx`), but the audit could not tell that from a bad domain,
 * because a NaN domain looks exactly the same. This function is the answer to
 * the second half: given the points a card hands the chart, say whether the
 * chart can draw them, and with what bounds.
 *
 * Pure. No React, no recharts.
 */

export interface ChartPoint {
  date: string;
  value: number;
}

export interface ChartBands {
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  optimalRangeLow?: number | null;
  optimalRangeHigh?: number | null;
  goalLow?: number | null;
  goalHigh?: number | null;
}

export interface ChartDomain {
  /** the points recharts can actually plot: a finite value and a date */
  points: ChartPoint[];
  yMin: number;
  yMax: number;
  /** false when there is nothing to draw, so the card says so instead */
  drawable: boolean;
}

/** How much air the line gets above and below the widest band. */
const PAD = 0.15;

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** A band edge only widens the domain when it is a real number. */
const bandValues = (b: ChartBands): number[] =>
  [
    b.referenceRangeLow,
    b.referenceRangeHigh,
    b.optimalRangeLow,
    b.optimalRangeHigh,
    b.goalLow,
    b.goalHigh,
  ].filter(finite);

/**
 * The domain, and the points worth plotting.
 *
 * A point with a non-finite value is dropped rather than allowed to poison
 * `Math.min`: one NaN in 45 draws used to make the whole domain NaN, which
 * recharts draws as nothing at all.
 */
export function chartDomain(
  points: readonly ChartPoint[],
  bands: ChartBands = {},
): ChartDomain {
  const clean = points.filter(
    (p) => finite(p.value) && typeof p.date === "string" && p.date !== "",
  );
  if (clean.length === 0)
    return { points: [], yMin: 0, yMax: 1, drawable: false };

  const all = [...clean.map((p) => p.value), ...bandValues(bands)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const padding = (max - min) * PAD || 1;
  return {
    points: clean,
    yMin: Math.floor(min - padding),
    yMax: Math.ceil(max + padding),
    drawable: true,
  };
}
