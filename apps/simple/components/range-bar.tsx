/**
 * One reading against its bands: the lab reference range, the optimal range,
 * where the value sits, where it was, and the goal. Ported from the range bar
 * in docs/mockups/systems-map.html onto the theme tokens.
 *
 * ponytail: no scale library and no measuring. `components/range-scale.ts`
 * decides where each number sits and percentages go straight into
 * `left`/`width`.
 *
 * Phase 26 item 9: a value far outside its band no longer flattens the band.
 * The scale stays linear over the band and twice its width either side and
 * compresses the rest into a tail with a visible break, and the value is
 * printed beside its marker always — the old bar carried it in a `title`,
 * which is to say nowhere a phone can reach.
 */
import { statusColor, statusOf } from "@/lib/status";
import { rangeScale } from "./range-scale";

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

  /** The widest band there is: what the scale keeps in shape. */
  const bandLow = num(optimalLow)
    ? num(refLow)
      ? Math.min(optimalLow, refLow)
      : optimalLow
    : num(refLow)
      ? refLow
      : null;
  const bandHigh = num(optimalHigh)
    ? num(refHigh)
      ? Math.max(optimalHigh, refHigh)
      : optimalHigh
    : num(refHigh)
      ? refHigh
      : null;

  const { at, breakHigh, breakLow } = rangeScale({ marks, bandLow, bandHigh });
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

  /** The label hugs the marker, and turns in at either end of the track. */
  const here = at(value);
  const anchor =
    here > 82 ? "translateX(-100%)" : here < 18 ? "none" : "translateX(-50%)";

  /** The axis break: two slashes where the scale stops being to scale. */
  const AxisBreak = ({ at: x }: { at: number }) => (
    <span
      aria-hidden="true"
      title="the scale is compressed past here"
      className="t-meta absolute -top-[3px] h-[14px] -translate-x-1/2 select-none text-[11px] leading-[14px] text-neutral-400"
      style={{ left: `${x.toFixed(1)}%` }}
    >
      //
    </span>
  );

  return (
    <div className="w-full pt-4">
      <div className="relative h-2.5 border border-neutral-200 bg-neutral-100">
        <span
          className="t-num absolute -top-[15px] whitespace-nowrap text-[10px] text-neutral-700"
          style={{ left: pct(value), transform: anchor }}
        >
          {trim(value)}
          {unit ? ` ${unit}` : ""}
        </span>
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
        />
        {breakLow != null && <AxisBreak at={breakLow} />}
        {breakHigh != null && <AxisBreak at={breakHigh} />}
      </div>
      {/* 25b: the words are sans, the numbers are mono. One sentence, one
          voice, and the bands still line up because only digits are tabular. */}
      <div className="t-meta mt-1 flex justify-between gap-2 text-[11px]">
        {normal ? (
          <span>
            normal <span className="t-num">{bandLabel(refLow, refHigh)}</span>
          </span>
        ) : (
          <span />
        )}
        {optimal && (
          <span className="text-[var(--color-health-optimal)]">
            optimal{" "}
            <span className="t-num">
              {bandLabel(optimalLow, optimalHigh)}
            </span>
          </span>
        )}
        {num(goal) && (
          <span className="text-accent-500">
            goal <span className="t-num">{trim(goal)}</span>
          </span>
        )}
      </div>
    </div>
  );
}
