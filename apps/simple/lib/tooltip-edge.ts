/**
 * Where a glossary tooltip goes when the word it belongs to is at an edge.
 *
 * Phase 25b drew the tooltips in pure CSS: the bubble is centred on its word
 * with `left: 50%; transform: translateX(-50%)`, which is right until the word
 * is the first one on a line. Then half the bubble is off the screen and the
 * sentence explaining "ALP" is unreadable exactly where somebody would want
 * it. Phase 26 item 8.
 *
 * The whole decision is this function: pure arithmetic over four numbers, so
 * it is tested without a browser. The client half (`components/term-edges.tsx`)
 * only measures and writes two attributes; `app/globals.css` does the moving.
 */

/** Which side of the word the bubble hangs from, or centred when null. */
export type Edge = "left" | "right" | null;

export interface Placement {
  edge: Edge;
  /** true when there is no room above the word */
  below: boolean;
}

export interface Anchor {
  /** the horizontal middle of the word, in viewport pixels */
  center: number;
  /** the top of the word, in viewport pixels */
  top: number;
  /** the bottom of the word, in viewport pixels */
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** How close to the edge of the window the bubble may come. */
const PAD = 8;

/**
 * Centred unless that would put the bubble off the screen, and above unless
 * there is no room. A bubble wider than the whole window is left centred:
 * shifting it would only move which half is lost.
 */
export function placeTip(
  anchor: Anchor,
  tip: Size,
  view: Size,
  pad = PAD,
): Placement {
  const half = tip.width / 2;
  const wider = tip.width + pad * 2 > view.width;
  const edge: Edge = wider
    ? null
    : anchor.center - half < pad
      ? "left"
      : anchor.center + half > view.width - pad
        ? "right"
        : null;
  const above = anchor.top - tip.height - pad;
  const below = above < 0 && anchor.bottom + tip.height + pad <= view.height;
  return { edge, below };
}
