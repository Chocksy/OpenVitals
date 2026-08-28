/**
 * The four key-trend charts on Home, derived on the server from the metric
 * rows.
 *
 * ponytail: the counters, the score and the attention list moved into
 * `lib/ledger.ts` with the phase-12 rewrite, so this file is one function now.
 */
import type { MetricRow } from "./data";
import { healthStatus, type HealthStatus } from "./status";

/** The bands a reading is judged against, i.e. the range bar's props. */
export interface Bands {
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
}

export interface TrendMetric extends Bands {
  metricCode: string;
  metricName: string;
  unit: string | null;
  status: HealthStatus;
  points: { date: string; value: number }[];
  latestValue: number;
  prevValue: number | null;
  goalLow: number | null;
  goalHigh: number | null;
}

const bandsOf = (m: MetricRow): Bands => ({
  refLow: m.latest.refLow,
  refHigh: m.latest.refHigh,
  optimalLow: m.optimalLow,
  optimalHigh: m.optimalHigh,
});

const rowStatus = (m: MetricRow): HealthStatus =>
  healthStatus({ value: m.latest.value, ...bandsOf(m) });

/** One key-trend chart: the line, its bands and the goal tick. */
export function buildTrend(
  m: MetricRow,
  goal?: { targetLow: number | null; targetHigh: number | null } | null,
): TrendMetric | null {
  if (m.points.length < 3 || m.latest.value == null) return null;
  const values = m.rows.filter((r) => r.value != null);
  return {
    metricCode: m.code,
    metricName: m.name,
    unit: m.latest.unit ?? m.unit,
    status: rowStatus(m),
    points: m.points,
    latestValue: m.latest.value,
    prevValue: values[values.length - 2]?.value ?? null,
    goalLow: goal?.targetLow ?? null,
    goalHigh: goal?.targetHigh ?? null,
    ...bandsOf(m),
  };
}
