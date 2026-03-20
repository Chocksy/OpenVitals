import type { HealthStatus } from "@/components/health/status-badge";

export function deriveStatus(obs: {
  isAbnormal?: boolean | null;
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  valueNumeric?: number | null;
}): HealthStatus {
  if (obs.isAbnormal === true) {
    if (
      obs.valueNumeric != null &&
      obs.referenceRangeLow != null &&
      obs.referenceRangeHigh != null
    ) {
      const distFromLow = obs.referenceRangeLow - obs.valueNumeric;
      const distFromHigh = obs.valueNumeric - obs.referenceRangeHigh;
      const rangeSpan = obs.referenceRangeHigh - obs.referenceRangeLow;
      if (
        rangeSpan > 0 &&
        (distFromLow > rangeSpan * 0.5 || distFromHigh > rangeSpan * 0.5)
      ) {
        return "critical";
      }
    }
    return "warning";
  }
  return "normal";
}

export function formatRelativeTime(date: Date | string): string {
  const now = Date.now();
  const then =
    typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diffMs = now - then;
  const absSec = Math.floor(Math.abs(diffMs) / 1000);

  if (absSec < 60) return "just now";
  const min = Math.floor(absSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  // For older dates, use formatted date
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type OptimalStatus = "optimal" | "suboptimal" | "unknown";

export function deriveOptimalStatus(obs: {
  valueNumeric?: number | null;
  optimalRangeLow?: number | null;
  optimalRangeHigh?: number | null;
}): OptimalStatus {
  if (obs.valueNumeric == null) return "unknown";
  if (obs.optimalRangeLow == null && obs.optimalRangeHigh == null)
    return "unknown";

  const val = obs.valueNumeric;
  if (obs.optimalRangeLow != null && val < obs.optimalRangeLow)
    return "suboptimal";
  if (obs.optimalRangeHigh != null && val > obs.optimalRangeHigh)
    return "suboptimal";
  return "optimal";
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
