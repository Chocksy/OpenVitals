/**
 * One reading against its bands: the lab reference range, the optimal range,
 * where the value sits, where it was, and the goal. Ported from the range bar
 * in docs/mockups/systems-map.html onto the theme tokens.
 *
 * ponytail: no scale library and no measuring. One linear map from the widest
 * number to the narrowest, percentages straight into `left`/`width`.
 */
import { statusColor, statusOf } from "@/lib/status";

export interface RangeBarProps {
  value: number | null | undefined;
  prev?: number | null;
  refLow?: number | null;
  refHigh?: number | null;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  goal?: number | null;
  unit?: string | null;
}

const num = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);

const trim = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * A band with one open side reads as the bound it actually has: "optimal under
 * 20", never "optimal …-20", which looked like a truncated number.
 */
const bandLabel = (
  lo: number | null | undefined,
  hi: number | null | undefined,
): string =>
  num(lo) && num(hi)
    ? `${trim(lo)}–${trim(hi)}`
    : num(hi)
      ? `under ${trim(hi)}`
      : num(lo)
        ? `over ${trim(lo)}`
        : "";

export function RangeBar({
  value,
  prev,
  refLow,
  refHigh,
  optimalLow,
  optimalHigh,
  goal,
  unit,
}: RangeBarProps) {
  const marks = [
    value,
    prev,
    goal,
    refLow,
    refHigh,
    optimalLow,
    optimalHigh,
  ].filter(num);
  const hasBand =
    num(refLow) || num(refHigh) || num(optimalLow) || num(optimalHigh);
  if (!num(value) || !hasBand || marks.length < 2) return null;

  const low = Math.min(...marks);
  const high = Math.max(...marks);
  const pad = (high - low) * 0.12 || Math.abs(value) * 0.1 || 1;
  const min = low - pad;
  const span = high + pad - min;
  const at = (v: number) => ((v - min) / span) * 100;
  const pct = (v: number) => `${at(v).toFixed(1)}%`;

  /** A band with one open side runs to that edge of the track. */
  const band = (
    lo: number | null | undefined,
    hi: number | null | undefined,
  ) => {
    if (!num(lo) && !num(hi)) return null;
    const a = num(lo) ? at(lo) : 0;
    const b = num(hi) ? at(hi) : 100;
    return { left: `${a.toFixed(1)}%`, width: `${(b - a).toFixed(1)}%` };
  };

  const normal = band(refLow, refHigh);
  const optimal = band(optimalLow, optimalHigh);
  const dot = statusOf({ value, refLow, refHigh, optimalLow, optimalHigh });

  return (
    <div className="w-full">
      <div className="relative h-2.5 border border-neutral-200 bg-neutral-100">
        {normal && (
          <span
            className="absolute inset-y-0 bg-[var(--color-health-normal-bg)]"
            style={normal}
          />
        )}
        {optimal && (
          <span
            className="absolute inset-y-0 bg-[var(--color-health-optimal-bg)]"
            style={optimal}
          />
        )}
        {num(prev) && (
          <span
            className="absolute top-[3px] size-[6px] -translate-x-1/2 rounded-full bg-neutral-400"
            style={{ left: pct(prev) }}
            title={`was ${prev}`}
          />
        )}
        {num(goal) && (
          <span
            className="absolute -top-[3px] h-[14px] w-[2px] -translate-x-1/2 bg-accent-500"
            style={{ left: pct(goal) }}
            title={`goal ${goal}`}
          />
        )}
        <span
          className={`absolute -top-[4px] h-4 w-[4px] -translate-x-1/2 ${statusColor[dot]}`}
          style={{ left: pct(value) }}
          title={`${value}${unit ? ` ${unit}` : ""}`}
        />
      </div>
      <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] tabular-nums text-neutral-400">
        {normal ? (
          <span>ref {bandLabel(refLow, refHigh)}</span>
        ) : (
          <span />
        )}
        {optimal && (
          <span className="text-[var(--color-health-optimal)]">
            optimal {bandLabel(optimalLow, optimalHigh)}
          </span>
        )}
        {num(goal) && (
          <span className="text-accent-500">goal {trim(goal)}</span>
        )}
      </div>
    </div>
  );
}
