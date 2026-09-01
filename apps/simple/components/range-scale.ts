/**
 * Where each number on a range bar sits, when one of them is nowhere near the
 * others.
 *
 * TPO antibodies 320 against a 0–34 band used to paint the marker hard against
 * the right edge with the whole band squashed into the first tenth of the
 * track: a picture that says "off the scale" and nothing else, and no number
 * anywhere on it. Phase 26 item 9.
 *
 * So the scale is linear over the band and twice its width either side, and
 * everything past that is compressed into a short tail with a visible break in
 * the axis. The band keeps its shape, the value keeps its place, and the break
 * says out loud that the last stretch is not to scale.
 *
 * Pure: `components/range-scale.test.ts` is the whole contract.
 */

export interface ScaleOptions {
  /** every number the bar draws: value, previous, goal, band bounds */
  marks: number[];
  /** the widest band the bar has, either side; null when it has none */
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
}

/** How much of the track a compressed tail is allowed to take. */
const TAIL = 14;

/** How far past the band the scale stays linear, as multiples of its width. */
const REACH = 2;

/** The air the tail keeps at its far end, so the marker never hugs the edge. */
const TAIL_PAD = 0.12;

const num = (v: number): boolean => Number.isFinite(v);

export function rangeScale({ marks, bandLow, bandHigh }: ScaleOptions): Scale {
  const finite = marks.filter(num);
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);

  const width =
    bandLow != null && bandHigh != null && bandHigh > bandLow
      ? bandHigh - bandLow
      : null;

  /** With no band there is nothing to keep in shape: one straight line. */
  if (width == null) {
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
    const min = lo - pad;
    const span = hi + pad - min || 1;
    return {
      at: (v) => ((v - min) / span) * 100,
      breakHigh: null,
      breakLow: null,
    };
  }

  const capHigh = bandHigh! + REACH * width;
  const capLow = bandLow! - REACH * width;
  const highTail = hi > capHigh;
  const lowTail = lo < capLow;

  const innerLo = lowTail ? capLow : lo;
  const innerHi = highTail ? capHigh : hi;
  const pad = (innerHi - innerLo) * 0.12 || 1;
  const min = innerLo - (lowTail ? 0 : pad);
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
  };
}
