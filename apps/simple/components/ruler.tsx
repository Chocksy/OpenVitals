/**
 * The ruler: one reading against its own bands, drawn once and used
 * everywhere — the marker page, the marker rows on Blood, the drawer, Key
 * trends and the conclusion cards on Home.
 *
 * Phase 30c. It replaces `range-bar.tsx`, which drew a thin bordered box on
 * the old neutral scale and carried "was" in a `title` — which is to say
 * nowhere a phone can reach. This is `docs/mockups/v4/system.css` section 10:
 * a thick track, the normal and optimal bands inside it, the axis broken
 * where the scale stops being to scale, the current value as a white-ringed
 * mark that prints its own number and unit, the previous draw as a hollow
 * mark with its date, and a target as a tick with a hatched pace zone and the
 * date it is aimed at.
 *
 * A server component: it holds no state and measures nothing. `rangeScale`
 * below decides where every number sits and the percentages go straight into
 * `left` / `width`; `components/range-scale.test.ts` is its whole contract.
 */
import { Fragment } from "react";
import { statusOf } from "@/lib/status";
import { dayLabel } from "@/lib/utils";
import {
  ChartHover,
  type ChartHoverProps,
  flipOf,
  hoverLabel,
} from "./chart-hover";

/* ── the scale ─────────────────────────────────────────────────────────
 * Moved here from `components/range-scale.ts` in phase 30c, unchanged, so
 * the scale and the thing it draws live in one file.
 *
 * TPO antibodies 320 against a 0–34 band used to paint the mark hard against
 * the right edge with the whole band squashed into the first tenth of the
 * track: a picture that says "off the scale" and nothing else. So the scale
 * is linear over the band and twice its width either side, and everything
 * past that is compressed into a short tail with a visible break in the axis.
 * Phase 26 item 9.
 */

export interface ScaleOptions {
  /** every number the ruler draws: value, previous, target, band bounds */
  marks: number[];
  /** the widest band it has, either side; null when it has none */
  bandLow: number | null;
  bandHigh: number | null;
}

export interface Scale {
  /** where a number sits on the track, 0..100 */
  at: (v: number) => number;
  /** where the axis breaks on the high side, 0..100, or null */
  breakHigh: number | null;
  /** where it breaks on the low side, 0..100, or null */
  breakLow: number | null;
  /** the lowest and highest number the track carries, for the printed ends */
  lo: number;
  hi: number;
}

/** How much of the track a compressed tail is allowed to take. */
const TAIL = 14;

/** How far past the band the scale stays linear, as multiples of its width. */
const REACH = 2;

/** The air the tail keeps at its far end, so the mark never hugs the edge. */
const TAIL_PAD = 0.12;

const finite = (v: number): boolean => Number.isFinite(v);

export function rangeScale({ marks, bandLow, bandHigh }: ScaleOptions): Scale {
  const values = marks.filter(finite);
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  const width =
    bandLow != null && bandHigh != null && bandHigh > bandLow
      ? bandHigh - bandLow
      : null;

  /* A concentration has no negative half, so the padding never takes the
     axis below zero: "−24 U/L" is not a number this app can print. */
  const floorAt = (v: number) => (lo >= 0 ? Math.max(0, v) : v);

  /** With no band there is nothing to keep in shape: one straight line. */
  if (width == null) {
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
    const min = floorAt(lo - pad);
    const span = hi + pad - min || 1;
    return {
      at: (v) => ((v - min) / span) * 100,
      breakHigh: null,
      breakLow: null,
      lo: min,
      hi: hi + pad,
    };
  }

  const capHigh = bandHigh! + REACH * width;
  const capLow = bandLow! - REACH * width;
  const highTail = hi > capHigh;
  const lowTail = lo < capLow;

  const innerLo = lowTail ? capLow : lo;
  const innerHi = highTail ? capHigh : hi;
  const pad = (innerHi - innerLo) * 0.12 || 1;
  const min = floorAt(innerLo - (lowTail ? 0 : pad));
  const max = innerHi + (highTail ? 0 : pad);

  const tailLow = lowTail ? TAIL : 0;
  const tailHigh = highTail ? TAIL : 0;
  const middle = 100 - tailLow - tailHigh;
  const span = max - min || 1;

  const at = (v: number): number => {
    if (lowTail && v < min) {
      const out = min - lo || 1;
      const into = (tailLow * (1 - TAIL_PAD) * (v - lo)) / out;
      return Math.max(0, tailLow * TAIL_PAD + into);
    }
    if (highTail && v > max) {
      const out = hi - max || 1;
      const into = (tailHigh * (1 - TAIL_PAD) * (v - max)) / out;
      return Math.min(100, 100 - tailHigh + into);
    }
    const inside = tailLow + (middle * (v - min)) / span;
    return Math.min(100, Math.max(0, inside));
  };

  return {
    at,
    breakHigh: highTail ? 100 - tailHigh : null,
    breakLow: lowTail ? tailLow : null,
    lo: lowTail ? lo : min,
    hi: highTail ? hi : max,
  };
}

/* ── nice axis ends ─────────────────────────────────────────────────────
 * The padded end of a scale is arithmetic, not a reading: "146.72 mg/dL"
 * under a bar reads as a second value. So the end an axis prints is rounded
 * outward to the nearest preferred number — the R10 ladder plus the halves
 * and thirds an axis actually wants — and never to more decimals than the
 * marker's own readings carry.
 */

/** Mantissas an axis end is allowed to land on, 1 ≤ n < 10. */
const NICE = [1, 1.2, 1.5, 1.6, 2, 2.5, 3, 4, 5, 6, 8];

/** Float noise: 3 × 0.1 is 0.30000000000000004 and 3.0000001 is not 3.1. */
const EPS = 1e-9;
const clean = (v: number) => Number(v.toPrecision(12));

/**
 * The nearest preferred number outward from `v`: the smallest one at or above
 * it going up, the largest one at or below it going down. Zero stays zero, and
 * a negative end mirrors, so the floor of a scale that dips below zero is as
 * round as its ceiling.
 */
export function niceEnd(v: number, dir: "up" | "down", decimals = 3): number {
  if (!Number.isFinite(v) || v === 0) return 0;
  if (v < 0) return -niceEnd(-v, dir === "up" ? "down" : "up", decimals);
  const base = 10 ** Math.floor(Math.log10(v));
  const m = v / base;
  const nice =
    dir === "up"
      ? (NICE.find((n) => n >= m - EPS) ?? 10) * base
      : [...NICE].reverse().find((n) => n <= m + EPS)! * base;
  const q = 10 ** decimals;
  return clean(
    dir === "up" ? Math.ceil(nice * q) / q : Math.floor(nice * q) / q,
  );
}

/** How many decimals this marker's own numbers use, capped at three. */
export function decimalsOf(values: (number | null | undefined)[]): number {
  const used = values
    .filter((v): v is number => v != null && Number.isFinite(v))
    .map((v) => {
      const s = String(v);
      const dot = s.indexOf(".");
      return dot === -1 ? 0 : s.length - dot - 1;
    });
  return Math.min(3, used.length ? Math.max(...used) : 0);
}

/* ── the element ───────────────────────────────────────────────────────── */

export interface RulerProps {
  value: number | null | undefined;
  /** the day this reading was taken, for the hover */
  valueDate?: string | null;
  /** the draw before this one, drawn hollow with its date */
  prev?: number | null;
  prevDate?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  /** the goal this marker is aimed at, and the day it is due */
  target?: number | null;
  /**
   * Phase 31a item 5. A goal with two bounds is a band, not a point. The LDL
   * goal is 70–100 by Dec 1 2026 and the ruler drew a tick at 100 labelled
   * "target 100", which is not the goal that was set. Both bounds draw the
   * band; one bound keeps the tick.
   */
  targetLow?: number | null;
  targetHigh?: number | null;
  targetDate?: string | null;
  unit?: string | null;
  /** `row` is the 8 px version that rides inside a list row */
  size?: "full" | "row";
  /** the sentence under the track on the marker page */
  say?: React.ReactNode;
}

const num = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);

/** 34 stays 34, 16.29 stays 16.29, 5.6000001 becomes 5.6. */
export const digits = (v: number): string =>
  Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);

/**
 * A band with one open side reads as the bound it actually has: "under 34",
 * never "…–34", which looked like a truncated number.
 */
const bandLabel = (
  lo: number | null | undefined,
  hi: number | null | undefined,
): string =>
  num(lo) && num(hi)
    ? `${digits(lo)}–${digits(hi)}`
    : num(hi)
      ? `under ${digits(hi)}`
      : num(lo)
        ? `over ${digits(lo)}`
        : "";

/**
 * The number a plan is actually aimed at.
 *
 * A one-sided goal is its own bound. A goal with two bounds is aimed at the
 * edge the value has to reach: the low edge from below, the high edge from
 * above, and the value itself once it is inside, which is how a reached goal
 * draws no pace zone at all.
 */
export function goalAim(
  value: number,
  low: number | null,
  high: number | null,
): number | null {
  if (low != null && high != null)
    return value < low ? low : value > high ? high : value;
  return high ?? low ?? null;
}

/** "70–100", "100", "over 70": the goal in the words the legend prints. */
export const goalWords = (low: number | null, high: number | null): string =>
  low != null && high != null
    ? `${digits(low)}–${digits(high)}`
    : high != null
      ? digits(high)
      : low != null
        ? `over ${digits(low)}`
        : "";

/** The four states, as the design system's own tone words. */
export const STATE_TONE = {
  red: "off",
  amber: "border",
  green: "on",
  gray: "none",
} as const;

/** The word a reading's own state goes by, as Blood already prints it. */
export const STATE_WORD = {
  red: "off",
  amber: "borderline",
  green: "optimal",
  gray: "no band",
} as const;

/**
 * What one mark reads out on hover: "Apr 23 2026 · 131 mg/dL · off".
 *
 * Phase 31a item 6. Every mark on a chart carried its number and nothing
 * else, so the only way to learn when a reading was taken was to count along
 * the axis. Pure, so the wording is a test rather than a screenshot.
 */
export function markTitle(
  value: number,
  unit: string | null | undefined,
  date?: string | null,
  state?: string | null,
): string {
  return [
    date ? dayLabel(date, true) : null,
    `${digits(value)}${unit ? ` ${unit}` : ""}`,
    state ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}

interface Seg {
  a: number;
  b: number;
}

/** A label near either end turns in, so it never runs off the gutter. */
const edge = (local: number): "start" | "end" | undefined =>
  local > 82 ? "end" : local < 18 ? "start" : undefined;

const pct = (n: number) => `${n.toFixed(2)}%`;

export function Ruler({
  value,
  valueDate,
  prev,
  prevDate,
  refLow,
  refHigh,
  optimalLow,
  optimalHigh,
  target,
  targetLow,
  targetHigh,
  targetDate,
  unit,
  size = "full",
  say,
}: RulerProps) {
  const marks = [
    value,
    prev,
    target,
    targetLow,
    targetHigh,
    refLow,
    refHigh,
    optimalLow,
    optimalHigh,
  ].filter(num);
  const hasBand =
    num(refLow) || num(refHigh) || num(optimalLow) || num(optimalHigh);
  if (!num(value) || marks.length < 2) return null;

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

  const scale = rangeScale({ marks, bandLow, bandHigh });
  /* The ends the axis prints are rounded to preferred numbers; the marks keep
     their true places on the padded scale, because the padding is the air the
     mark needs and the label is only there to say which way is up. */
  const places = decimalsOf(marks);
  const { at, breakLow, breakHigh } = scale;

  /** The track, cut where the scale stops being to scale. */
  const cuts = [
    0,
    ...(breakLow != null ? [breakLow] : []),
    ...(breakHigh != null ? [breakHigh] : []),
    100,
  ];
  const segs: Seg[] = cuts.slice(0, -1).map((a, i) => ({ a, b: cuts[i + 1]! }));
  const widest = segs.reduce(
    (best, s, i) => (s.b - s.a > segs[best]!.b - segs[best]!.a ? i : best),
    0,
  );

  /** Which segment a track position belongs to, and where inside it. */
  const place = (p: number): { seg: number; local: number } => {
    const i = Math.max(
      0,
      segs.findIndex((s, k) => p <= s.b || k === segs.length - 1),
    );
    const s = segs[i]!;
    return { seg: i, local: ((p - s.a) / (s.b - s.a)) * 100 };
  };

  /** A band clipped into each segment it crosses. */
  const bandIn = (
    seg: Seg,
    lo: number | null | undefined,
    hi: number | null | undefined,
  ) => {
    if (!num(lo) && !num(hi)) return null;
    const a = Math.max(seg.a, num(lo) ? at(lo) : 0);
    const b = Math.min(seg.b, num(hi) ? at(hi) : 100);
    if (b <= a) return null;
    return {
      "--a": pct(((a - seg.a) / (seg.b - seg.a)) * 100),
      "--b": pct(((b - seg.a) / (seg.b - seg.a)) * 100),
    } as React.CSSProperties;
  };

  const status = statusOf({ value, refLow, refHigh, optimalLow, optimalHigh });
  const tone = STATE_TONE[status];
  const state = STATE_WORD[status];
  const here = place(at(value));
  const ghost = num(prev) ? place(at(prev)) : null;
  /**
   * The goal, one shape or the other. `targetLow` and `targetHigh` are the
   * goal as it was written; `target` is the single number this took before
   * phase 31a and still draws a tick.
   */
  const gLow = num(targetLow) ? targetLow : null;
  const gHigh = num(targetHigh) ? targetHigh : null;
  const band = gLow != null && gHigh != null && gHigh > gLow;
  const aim = band
    ? goalAim(value, gLow, gHigh)
    : num(target)
      ? target
      : goalAim(value, gLow, gHigh);
  const shortLabel = `target ${band ? goalWords(gLow, gHigh) : digits(aim!)}`;
  const label = `${shortLabel}${
    targetDate ? ` · ${dayLabel(targetDate, true)}` : ""
  }`;
  const goal =
    aim != null ? place(at(band ? (gLow! + gHigh!) / 2 : aim)) : null;
  /* The target's date and the previous draw's date both hang under the track.
     Within this much of each other they run into one another, so the older of
     the two takes the second line. */
  const stacked = num(prev) && aim != null && Math.abs(at(prev) - at(aim)) < 26;

  /** The stretch a target still has to close, hatched, from now to then. */
  const paceLo = aim != null ? Math.min(value, aim) : null;
  const paceHi = aim != null ? Math.max(value, aim) : null;

  const mid = [
    hasBand && (num(refLow) || num(refHigh))
      ? `normal ${bandLabel(refLow, refHigh)}`
      : "",
    num(optimalLow) || num(optimalHigh)
      ? `optimal ${bandLabel(optimalLow, optimalHigh)}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  /**
   * Phase 32a, `docs/mockups/v4/chart-hover.html` section 03. The ruler has
   * three things to point at — the value, the "was" ghost and the target — and
   * each answers with the same card. The mark is judged against the goal band
   * when there is one, and against its own normal and optimal bands when there
   * is not; the target carries a date instead of a state word, because a
   * target has no state. The card never flips below on a ruler: an 18 px track
   * has nothing under it but its own scale row.
   */
  const goalBandSaid = band ? `goal band ${goalWords(gLow, gHigh)}` : null;
  const markCard: ChartHoverProps = {
    date: valueDate ?? null,
    value,
    unit,
    state,
    tone,
    band: goalBandSaid ?? (mid || null),
    was: num(prev) ? { value: prev, date: prevDate ?? null } : null,
    stemRight: flipOf(at(value), 100).stemRight,
  };
  const ghostCard: ChartHoverProps | null = num(prev)
    ? {
        date: prevDate ?? null,
        value: prev,
        unit,
        state:
          STATE_WORD[
            statusOf({ value: prev, refLow, refHigh, optimalLow, optimalHigh })
          ],
        tone: STATE_TONE[
          statusOf({ value: prev, refLow, refHigh, optimalLow, optimalHigh })
        ],
        band: mid || null,
        stemRight: flipOf(at(prev), 100).stemRight,
      }
    : null;
  const goalCard: ChartHoverProps | null =
    aim != null
      ? {
          date: targetDate ?? null,
          value: aim,
          unit,
          state: "",
          tone: "none",
          /* a two-sided goal says the whole band, because the value line can
             only carry the edge the plan is aimed at */
          band: band ? shortLabel : mid || null,
          stemRight: flipOf(at(band ? (gLow! + gHigh!) / 2 : aim), 100)
            .stemRight,
        }
      : null;

  return (
    <div className={size === "row" ? "ruler row" : "ruler"}>
      <div className="ruler-track">
        {segs.map((seg, i) => {
          const normal = bandIn(seg, refLow, refHigh);
          const optimal = bandIn(seg, optimalLow, optimalHigh);
          const pace = paceLo != null ? bandIn(seg, paceLo, paceHi) : null;
          const goalBand = band ? bandIn(seg, gLow, gHigh) : null;
          return (
            <Fragment key={seg.a}>
              {i > 0 && <div className="brk" aria-hidden="true" />}
              <div
                className="seg"
                style={
                  i === widest
                    ? { flex: "1 1 auto" }
                    : { flex: `0 0 ${(seg.b - seg.a).toFixed(2)}%` }
                }
              >
                <div className="seg-bands">
                  {normal && <div className="band normal" style={normal} />}
                  {optimal && <div className="band optimal" style={optimal} />}
                  {pace && <div className="band pace" style={pace} />}
                  {goalBand && (
                    <div className="band goal-in" style={goalBand} />
                  )}
                </div>
                {goal?.seg === i && goalCard && (
                  <div
                    className={
                      band && goalBand
                        ? "goal wide hovermark"
                        : "goal hovermark"
                    }
                    tabIndex={0}
                    role="img"
                    aria-label={hoverLabel(goalCard)}
                    data-align={edge(goal.local)}
                    /* The band's own clipped edges, so it never spills past
                       a broken axis; a one-sided goal is still one tick. */
                    style={
                      band && goalBand
                        ? goalBand
                        : ({ "--t": pct(goal.local) } as React.CSSProperties)
                    }
                    data-label={label}
                    /* the phone drops the date: the line above the ruler
                       already says "target by Dec 1 2026 · 31 to go" */
                    data-short={shortLabel}
                    data-hover={`${label}${unit ? ` ${unit}` : ""}`}
                  >
                    <ChartHover {...goalCard} />
                  </div>
                )}
                {ghost?.seg === i && ghostCard && (
                  <div
                    className="ghost hovermark"
                    tabIndex={0}
                    role="img"
                    aria-label={hoverLabel(ghostCard)}
                    data-align={edge(ghost.local)}
                    data-row={stacked ? "2" : undefined}
                    style={{ "--g": pct(ghost.local) } as React.CSSProperties}
                    data-label={`was ${digits(prev!)}${
                      prevDate ? ` · ${dayLabel(prevDate)}` : ""
                    }`}
                    data-hover={markTitle(
                      prev!,
                      unit,
                      prevDate,
                      "the draw before",
                    )}
                  >
                    <ChartHover {...ghostCard} />
                  </div>
                )}
                {here.seg === i && (
                  <div
                    className={`mark ${tone} hovermark`}
                    tabIndex={0}
                    role="img"
                    aria-label={hoverLabel(markCard)}
                    data-align={edge(here.local)}
                    style={{ "--p": pct(here.local) } as React.CSSProperties}
                    data-hover={markTitle(value, unit, valueDate, state)}
                  >
                    <span className="mval">
                      {digits(value)}
                      {unit && <em>{unit}</em>}
                    </span>
                    <ChartHover {...markCard} />
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
      <div className="ruler-scale">
        <span>{digits(niceEnd(scale.lo, "down", places))}</span>
        {mid && <span className="mid">{mid}</span>}
        <span>
          {digits(niceEnd(scale.hi, "up", places))}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      {say && <p className="ruler-say">{say}</p>}
    </div>
  );
}
