/**
 * Everything the home dashboard shows, derived on the server from the metric
 * rows: the three counters, the health score, the list that needs attention
 * and the four key trends.
 *
 * ponytail: the panel grid, the rule-based insight strings and the
 * what-changed table went with the phase-8 rewrite. Home is six sections now,
 * so this file is only what those six read.
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

export interface AttentionMetric extends Bands {
  metricCode: string;
  metricName: string;
  latestValue: number | null;
  prevValue: number | null;
  unit: string | null;
  status: HealthStatus;
  daysSinceTest: number | null;
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

const DAY = 1000 * 60 * 60 * 24;
const daysSince = (date: string) =>
  Math.floor((Date.now() - new Date(date).getTime()) / DAY);

const bandsOf = (m: MetricRow): Bands => ({
  refLow: m.latest.refLow,
  refHigh: m.latest.refHigh,
  optimalLow: m.optimalLow,
  optimalHigh: m.optimalHigh,
});

const rowStatus = (m: MetricRow): HealthStatus =>
  healthStatus({ value: m.latest.value, ...bandsOf(m) });

/** Normal counts full, warning half, critical nothing. */
export function calculateHealthScore(
  optimalCount: number,
  normalCount: number,
  offCount: number,
): number {
  const total = optimalCount + normalCount + offCount;
  if (total === 0) return 100;
  return Math.round(((optimalCount + normalCount * 0.5) / total) * 100);
}

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

export function buildHome(rows: MetricRow[]) {
  let optimalCount = 0;
  let normalCount = 0;
  let offCount = 0;
  const attention: AttentionMetric[] = [];

  for (const m of rows) {
    // green inside the optimal band, amber inside the lab range only, red out.
    if (m.status === "red") offCount++;
    else if (m.status === "amber") normalCount++;
    else if (m.status === "green") optimalCount++;

    const status = rowStatus(m);
    if (status !== "warning" && status !== "critical") continue;
    const values = m.rows.filter((r) => r.value != null);
    attention.push({
      metricCode: m.code,
      metricName: m.name,
      latestValue: m.latest.value,
      prevValue: values[values.length - 2]?.value ?? null,
      unit: m.latest.unit ?? m.unit,
      status,
      daysSinceTest: daysSince(m.latest.observedAt),
      ...bandsOf(m),
    });
  }

  const severity: Record<string, number> = { critical: 0, warning: 1 };
  attention.sort(
    (a, b) => (severity[a.status] ?? 2) - (severity[b.status] ?? 2),
  );

  const flagged = normalCount + offCount;
  const lastDraw =
    rows
      .map((m) => m.latest.observedAt)
      .sort()
      .pop() ?? null;
  const summaryParts = [];
  if (rows.length) summaryParts.push(`${rows.length} markers`);
  if (flagged > 0) summaryParts.push(`${flagged} off optimal`);

  return {
    stats: { optimalCount, normalCount, offCount },
    score: calculateHealthScore(optimalCount, normalCount, offCount),
    metricCount: rows.length,
    abnormalCount: offCount,
    lastDraw,
    summaryLine: summaryParts.length
      ? summaryParts.join(" · ")
      : "Upload your first lab report to get started",
    attention: attention.slice(0, 6),
  };
}

export type HomeData = ReturnType<typeof buildHome>;
