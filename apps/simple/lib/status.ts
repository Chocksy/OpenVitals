export type Status = "red" | "amber" | "green" | "gray";

export interface RangeInput {
  value: number | null | undefined;
  refLow?: number | null;
  refHigh?: number | null;
  optimalLow?: number | null;
  optimalHigh?: number | null;
}

const outside = (v: number, lo?: number | null, hi?: number | null) =>
  (lo != null && v < lo) || (hi != null && v > hi);

/**
 * Red when outside the lab reference range, amber when inside it but outside
 * the optimal range, green when inside both, gray when there is nothing to
 * compare against.
 */
export function statusOf({
  value,
  refLow,
  refHigh,
  optimalLow,
  optimalHigh,
}: RangeInput): Status {
  if (value == null || Number.isNaN(value)) return "gray";
  const hasRef = refLow != null || refHigh != null;
  const hasOpt = optimalLow != null || optimalHigh != null;
  if (!hasRef && !hasOpt) return "gray";
  if (hasRef && outside(value, refLow, refHigh)) return "red";
  if (hasOpt && outside(value, optimalLow, optimalHigh)) return "amber";
  return "green";
}

export const statusColor: Record<Status, string> = {
  red: "bg-[var(--color-health-critical)]",
  amber: "bg-[var(--color-health-warning)]",
  green: "bg-[var(--color-health-normal)]",
  gray: "bg-neutral-300",
};

export const statusStroke: Record<Status, string> = {
  red: "var(--color-health-critical)",
  amber: "var(--color-health-warning)",
  green: "var(--color-health-normal)",
  gray: "var(--color-neutral-300)",
};

/* ------------------------------------------------------------------ *
 * Ported from apps/web/lib/health-utils.ts + components/health/status-badge.
 * `useDynamicStatus` is gone: everything is a pure function over the ranges
 * that already travel with a reading.
 * ------------------------------------------------------------------ */

export type HealthStatus =
  | "normal"
  | "warning"
  | "critical"
  | "info"
  | "neutral";

/**
 * normal inside every range, warning outside one of them, critical when the
 * value sits more than half a range-span outside.
 */
export function healthStatus(r: RangeInput): HealthStatus {
  const dot = statusOf(r);
  if (dot === "gray") return "neutral";
  if (dot === "green") return "normal";

  const value = r.value!;
  const low = r.optimalLow ?? r.refLow;
  const high = r.optimalHigh ?? r.refHigh;
  if (low != null && high != null) {
    const span = high - low;
    if (span > 0 && (low - value > span * 0.5 || value - high > span * 0.5))
      return "critical";
  }
  return "warning";
}

export function formatRange(
  low: number | null | undefined,
  high: number | null | undefined,
  unit?: string | null,
): string {
  const u = unit ?? "";
  if (low != null && high != null) return `${low} – ${high} ${u}`.trim();
  if (low != null) return `> ${low} ${u}`.trim();
  if (high != null) return `< ${high} ${u}`.trim();
  return "—";
}

/**
 * Only a high bound (LDL < 70): lower is better. Only a low bound (HDL > 50):
 * higher is better. Both bounds: moving toward the middle is better.
 */
export function isTrendImproving(
  delta: number,
  ranges: Pick<RangeInput, "refLow" | "refHigh" | "optimalLow" | "optimalHigh">,
  currentValue: number,
): boolean | null {
  if (delta === 0) return null;
  const low = ranges.optimalLow ?? ranges.refLow ?? null;
  const high = ranges.optimalHigh ?? ranges.refHigh ?? null;
  if (high != null && low == null) return delta < 0;
  if (low != null && high == null) return delta > 0;
  if (low != null && high != null) {
    const center = (low + high) / 2;
    const previous = currentValue / (1 + delta / 100);
    return Math.abs(currentValue - center) < Math.abs(previous - center);
  }
  return null;
}
