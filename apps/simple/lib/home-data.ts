/**
 * Everything the home dashboard shows, derived on the server from the metric
 * rows. Ported from the old app's home page `useMemo` blocks (health score,
 * attention list, rule-based insights, what-changed, panel cards) minus the
 * tRPC queries, medications, conditions and import jobs.
 */
import type { MetricRow } from "./data";
import type { RetestBody } from "@/db";
import { PANELS } from "./panel-config";
import {
  formatRange,
  healthStatus,
  isTrendImproving,
  type HealthStatus,
} from "./status";

export interface AttentionMetric {
  metricCode: string;
  metricName: string;
  latestValue: number | null;
  unit: string | null;
  status: HealthStatus;
  sparkData: number[];
  daysSinceTest: number | null;
}

export interface HealthInsight {
  id: string;
  type: "improvement" | "decline" | "alert" | "milestone";
  title: string;
  description: string;
  metricCode?: string;
  status: HealthStatus;
}

export interface ChangeItem {
  metricCode: string;
  name: string;
  oldValue: number;
  newValue: number;
  unit: string;
  percentChange: number;
  improved: boolean;
}

export interface PanelMetric {
  type: "filled" | "empty";
  metricCode: string;
  name: string;
  reason?: string;
  value?: number;
  unit?: string;
  sparkData?: number[];
  trendDelta?: number | null;
  trendImproving?: boolean | null;
  optimalRange?: string;
  status?: HealthStatus;
}

export interface PanelView {
  id: string;
  label: string;
  metrics: PanelMetric[];
  inRangeCount: number;
  warningCount: number;
  criticalCount: number;
  totalTested: number;
  totalMetrics: number;
}

export interface RetestPreview {
  dueAt: string;
  items: { metricCode: string; metricName: string; domain: string; priority: string }[];
}

const DAY = 1000 * 60 * 60 * 24;
const daysSince = (date: string) =>
  Math.floor((Date.now() - new Date(date).getTime()) / DAY);

const rowStatus = (m: MetricRow, index = m.rows.length - 1): HealthStatus => {
  const r = m.rows[index]!;
  return healthStatus({
    value: r.value,
    refLow: r.refLow,
    refHigh: r.refHigh,
    optimalLow: m.optimalLow,
    optimalHigh: m.optimalHigh,
  });
};

const isFlagged = (s: HealthStatus) => s === "warning" || s === "critical";

/** Normal counts full, warning half, critical nothing. */
export function calculateHealthScore(
  normalCount: number,
  warningCount: number,
  criticalCount: number,
): number {
  const total = normalCount + warningCount + criticalCount;
  if (total === 0) return 100;
  return Math.round(
    ((normalCount + warningCount * 0.5) / total) * 100,
  );
}

/** Rule-based improvement / decline / alert / milestone notes from trends. */
export function generateInsights(rows: MetricRow[]): HealthInsight[] {
  const insights: HealthInsight[] = [];

  for (const m of rows) {
    if (m.rows.length < 2) continue;
    const latest = m.rows[m.rows.length - 1]!;
    const previous = m.rows[m.rows.length - 2]!;
    if (latest.value == null || previous.value == null) continue;

    const latestFlagged = isFlagged(rowStatus(m));
    const prevFlagged = isFlagged(rowStatus(m, m.rows.length - 2));
    const changePct =
      Math.abs(previous.value) > 0
        ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
        : 0;

    if (prevFlagged && !latestFlagged) {
      insights.push({
        id: `normalized-${m.code}`,
        type: "improvement",
        title: `${m.name} is back in range`,
        description: `Moved from ${previous.value} to ${latest.value} — now within range.`,
        metricCode: m.code,
        status: "normal",
      });
      continue;
    }

    if (!prevFlagged && latestFlagged) {
      insights.push({
        id: `abnormal-${m.code}`,
        type: "alert",
        title: `${m.name} is now outside its range`,
        description: `Changed from ${previous.value} to ${latest.value} — now flagged.`,
        metricCode: m.code,
        status: "warning",
      });
      continue;
    }

    const low = m.optimalLow ?? latest.refLow;
    const high = m.optimalHigh ?? latest.refHigh;
    if (latestFlagged && low != null && high != null) {
      const mid = (low + high) / 2;
      const prevDist = Math.abs(previous.value - mid);
      const latDist = Math.abs(latest.value - mid);
      if (latDist < prevDist && (prevDist - latDist) / prevDist > 0.1) {
        insights.push({
          id: `improving-${m.code}`,
          type: "improvement",
          title: `${m.name} is trending toward normal`,
          description: `Improved ${Math.abs(Math.round(changePct))}% — moving closer to the target range.`,
          metricCode: m.code,
          status: "info",
        });
        continue;
      }
    }

    if (Math.abs(changePct) > 15 && latestFlagged) {
      insights.push({
        id: `decline-${m.code}`,
        type: "decline",
        title: `${m.name} changed ${Math.abs(Math.round(changePct))}%`,
        description: `Went from ${previous.value} to ${latest.value} and remains flagged.`,
        metricCode: m.code,
        status: "warning",
      });
      continue;
    }

    if (m.rows.length >= 3 && !latestFlagged) {
      const last3 = m.rows.slice(-3);
      if (last3.every((_, i) => !isFlagged(rowStatus(m, m.rows.length - 3 + i)))) {
        const values = last3.map((r) => r.value).filter((v): v is number => v != null);
        if (values.length === 3) {
          const avg = values.reduce((s, v) => s + v, 0) / 3;
          const spread = Math.max(...values.map((v) => Math.abs(v - avg)));
          if (Math.abs(avg) === 0 || spread / Math.abs(avg) < 0.05) {
            insights.push({
              id: `stable-${m.code}`,
              type: "milestone",
              title: `${m.name} is consistently normal`,
              description: "Stable across your last 3 results.",
              metricCode: m.code,
              status: "normal",
            });
          }
        }
      }
    }
  }

  const order = { alert: 0, decline: 1, improvement: 2, milestone: 3 };
  return insights.sort((a, b) => order[a.type] - order[b.type]);
}

function buildPanels(byCode: Map<string, MetricRow>): PanelView[] {
  return PANELS.map((panel) => {
    const metrics: PanelMetric[] = [];
    let inRangeCount = 0;
    let warningCount = 0;
    let criticalCount = 0;
    let totalTested = 0;

    for (const def of panel.metrics) {
      const m =
        byCode.get(def.code) ??
        (def.aliases ?? []).map((a) => byCode.get(a)).find(Boolean);
      const withValues = m?.rows.filter((r) => r.value != null) ?? [];

      if (!m || withValues.length === 0) {
        metrics.push({
          type: "empty",
          metricCode: def.code,
          name: m?.name ?? def.code.replace(/_/g, " "),
          reason: def.reason,
        });
        continue;
      }

      const latest = withValues[withValues.length - 1]!;
      const previous = withValues[withValues.length - 2];
      const status = healthStatus({
        value: latest.value,
        refLow: latest.refLow,
        refHigh: latest.refHigh,
        optimalLow: m.optimalLow,
        optimalHigh: m.optimalHigh,
      });

      totalTested++;
      if (status === "critical") criticalCount++;
      else if (status === "warning") warningCount++;
      else inRangeCount++;

      const hasOptimal = m.optimalLow != null || m.optimalHigh != null;
      const ranges = {
        refLow: latest.refLow,
        refHigh: latest.refHigh,
        optimalLow: m.optimalLow,
        optimalHigh: m.optimalHigh,
      };
      const trendDelta =
        previous?.value != null && previous.value !== 0
          ? ((latest.value! - previous.value) / Math.abs(previous.value)) * 100
          : null;

      metrics.push({
        type: "filled",
        metricCode: m.code,
        name: m.name,
        value: latest.value!,
        unit: latest.unit ?? m.unit ?? "",
        sparkData: withValues.slice(-8).map((r) => r.value!),
        trendDelta,
        trendImproving:
          trendDelta != null
            ? isTrendImproving(trendDelta, ranges, latest.value!)
            : null,
        optimalRange: `${hasOptimal ? "optimal" : "ref"} ${formatRange(
          m.optimalLow ?? latest.refLow,
          m.optimalHigh ?? latest.refHigh,
          latest.unit ?? m.unit,
        )}`,
        status,
      });
    }

    return {
      id: panel.id,
      label: panel.label,
      metrics,
      inRangeCount,
      warningCount,
      criticalCount,
      totalTested,
      totalMetrics: panel.metrics.length,
    };
  });
}

function buildChanges(rows: MetricRow[]) {
  const dates = [...new Set(rows.flatMap((m) => m.rows.map((r) => r.observedAt)))]
    .sort()
    .reverse();
  if (dates.length < 2) return { changes: [], previousDate: "", currentDate: "" };

  const [currentDate, previousDate] = dates as [string, string];
  const changes: ChangeItem[] = [];

  for (const m of rows) {
    const now = m.rows.find((r) => r.observedAt === currentDate);
    const before = m.rows.find((r) => r.observedAt === previousDate);
    if (now?.value == null || !before?.value) continue;

    const pct = ((now.value - before.value) / Math.abs(before.value)) * 100;
    if (Math.abs(pct) < 5) continue;

    const improving = isTrendImproving(
      pct,
      {
        refLow: now.refLow,
        refHigh: now.refHigh,
        optimalLow: m.optimalLow,
        optimalHigh: m.optimalHigh,
      },
      now.value,
    );
    changes.push({
      metricCode: m.code,
      name: m.name,
      oldValue: before.value,
      newValue: now.value,
      unit: now.unit ?? m.unit ?? "",
      percentChange: pct,
      improved: improving ?? !isFlagged(healthStatus({
        value: now.value,
        refLow: now.refLow,
        refHigh: now.refHigh,
        optimalLow: m.optimalLow,
        optimalHigh: m.optimalHigh,
      })),
    });
  }

  changes.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return { changes, previousDate: fmt(previousDate), currentDate: fmt(currentDate) };
}

/** The latest retest plan, flattened for the home card. */
export function buildRetestPreview(
  body: RetestBody | undefined,
  byCode: Map<string, MetricRow>,
): RetestPreview | null {
  if (!body?.groups?.length) return null;
  const items = body.groups.flatMap((g) =>
    (g.metrics ?? []).map((code) => ({
      metricCode: code,
      metricName: byCode.get(code)?.name ?? code.replace(/_/g, " "),
      domain: g.domain,
      priority: g.priority,
    })),
  );
  return { dueAt: body.dueAt, items };
}

export function buildHome(rows: MetricRow[]) {
  const byCode = new Map(rows.map((m) => [m.code, m]));
  let normalCount = 0;
  let warningCount = 0;
  let criticalCount = 0;
  const attention: AttentionMetric[] = [];

  for (const m of rows) {
    const status = rowStatus(m);
    if (status === "critical") criticalCount++;
    else if (status === "warning") warningCount++;
    else normalCount++;
    if (!isFlagged(status)) continue;

    attention.push({
      metricCode: m.code,
      metricName: m.name,
      latestValue: m.latest.value,
      unit: m.latest.unit ?? m.unit,
      status,
      sparkData: m.points.slice(-8).map((p) => p.value),
      daysSinceTest: daysSince(m.latest.observedAt),
    });
  }

  const severity: Record<string, number> = { critical: 0, warning: 1 };
  attention.sort(
    (a, b) => (severity[a.status] ?? 2) - (severity[b.status] ?? 2),
  );

  const flagged = warningCount + criticalCount;
  const totalResults = rows.reduce((n, m) => n + m.rows.length, 0);
  const summaryParts = [];
  if (rows.length) summaryParts.push(`${rows.length} metrics`);
  if (flagged > 0) summaryParts.push(`${flagged} flagged`);

  return {
    stats: { normalCount, warningCount, criticalCount },
    score: calculateHealthScore(normalCount, warningCount, criticalCount),
    metricCount: rows.length,
    totalResults,
    abnormalCount: flagged,
    summaryLine: summaryParts.length
      ? summaryParts.join(" · ")
      : "Upload your first lab report to get started",
    attention: attention.slice(0, 6),
    insights: generateInsights(rows).slice(0, 5),
    changed: buildChanges(rows),
    panels: buildPanels(byCode),
  };
}

export type HomeData = ReturnType<typeof buildHome>;
