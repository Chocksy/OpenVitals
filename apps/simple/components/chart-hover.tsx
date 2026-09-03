/**
 * The chart hover card: one card, two triggers.
 *
 * Phase 32a, `docs/mockups/v4/chart-hover.html`. Every mark on every history
 * chart and every mark on every ruler answers the same five questions when you
 * point at it or tab to it: what day, what number, in what unit, what state
 * that is, and what it was before. Nothing on a chart is a number without a
 * date any more.
 *
 * The interaction is CSS only. `.hovercard` and the `.hovermark` reveal rules
 * live in `app/globals.css` section 15 and this file binds to those names: the
 * mark holds the card, the mark is focusable, and `:hover` / `:focus-within`
 * on the mark reveals it. No state, no effect, no handler, no `document`, so
 * `no-dom-mutation.test.ts` stays green; nothing animates, so there is nothing
 * for a reduced-motion guard to turn off.
 *
 * The pointer cannot reach a card on a phone and a screen reader cannot reach
 * one at all, so `hoverLabel` says the same five facts as one sentence and
 * every mark carries it as its `aria-label`.
 */
import { dayLabel } from "@/lib/utils";
import { StateWord, type StateTone } from "./ui-kit";
import { digits } from "./ruler";

export interface ChartHoverProps {
  /** YYYY-MM-DD; the card prints it as "Sat Aug 1 2026" */
  date: string | null;
  /** null means "no value yet" */
  value: number | null;
  unit?: string | null;
  /** "off" | "borderline" | "optimal" | "planned"; "" for a target, which has none */
  state: string;
  tone: StateTone;
  /** "normal 0–34 · optimal 0–9" or "goal band 70–100" */
  band?: string | null;
  /** the previous value and its date, or null */
  was?: { value: number; date: string | null } | null;
  /** the card flips below the mark when the mark is above the plot midline */
  below?: boolean;
  /** the stem slides right when the mark is near the right edge */
  stemRight?: boolean;
}

/** A mark above this much of the plot's height flips its card underneath. */
const MIDLINE = 50;

/** A mark this far across the plot anchors its card by the right corner. */
const RIGHT_EDGE = 70;

/**
 * Which way one mark's card faces, from the mark's own percentages.
 *
 * `y` is measured from the top of the plot the way `--y` is, so a small `y` is
 * a high mark: it has no room above it and the card goes below. Pure, so the
 * flip is a test rather than a screenshot.
 */
export function flipOf(
  x: number,
  y: number,
): { below: boolean; stemRight: boolean } {
  return { below: y < MIDLINE, stemRight: x > RIGHT_EDGE };
}

/**
 * The move between two readings as a whole percentage: 412 → 320 is "−22 %".
 *
 * A previous value of zero has no percentage to give, so the card prints the
 * two numbers and stops rather than printing an infinity.
 */
export function movePct(from: number, to: number): string | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  const n = Math.round(((to - from) / Math.abs(from)) * 100);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n)} %`;
}

/** "Sat Aug 1 2026": the weekday, then the date the whole app prints. */
export function cardDate(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday} ${dayLabel(day, true)}`;
}

/** The value and its unit, or the words a mark with no value goes by. */
const valueSaid = (
  value: number | null,
  unit: string | null | undefined,
): string =>
  value == null ? "no value yet" : `${digits(value)}${unit ? ` ${unit}` : ""}`;

/** "was 412 on Dec 9 2025 · −22 %", or null when there is nothing before. */
function wasSaid(
  was: ChartHoverProps["was"],
  value: number | null,
): string | null {
  if (!was) return null;
  const move = value == null ? null : movePct(was.value, value);
  return [
    `was ${digits(was.value)}${was.date ? ` on ${dayLabel(was.date, true)}` : ""}`,
    move,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The same five facts as one plain sentence, for the mark's `aria-label`.
 *
 * The card is a hover surface; this is the only version of it a screen reader
 * or a phone's focus ring ever gets, so it drops nothing the card carries.
 */
export function hoverLabel(props: ChartHoverProps): string {
  return [
    props.date ? cardDate(props.date) : null,
    valueSaid(props.value, props.unit),
    props.state || null,
    props.band || null,
    wasSaid(props.was, props.value),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ChartHover({
  date,
  value,
  unit,
  state,
  tone,
  band,
  was,
  below,
  stemRight,
}: ChartHoverProps): React.JSX.Element {
  const was_ = wasSaid(was, value);
  const cls = ["hovercard", below ? "below" : "", stemRight ? "stem-right" : ""]
    .filter(Boolean)
    .join(" ");
  /* `.hovercard` is positioned by the mark that holds it, and the mark is the
     card's own containing block: the stem sits 21 px in from whichever corner
     anchored it, so the card offsets by that much to put the stem on the mark. */
  const style: React.CSSProperties = {
    ...(stemRight ? { right: "-21px" } : { left: "-21px" }),
    ...(below ? { top: "13px" } : { bottom: "13px" }),
  };
  return (
    <div className={cls} style={style} aria-hidden="true">
      {date && <div className="hdate">{cardDate(date)}</div>}
      <div className="hval">
        {value == null ? "no value yet" : digits(value)}
        {value != null && unit && <em>{unit}</em>}
      </div>
      {(state || band) && (
        <div className="hrow">
          {state && <StateWord tone={tone}>{state}</StateWord>}
          {band && (
            <span className="t-meta" style={{ fontSize: "var(--type-xs)" }}>
              {band}
            </span>
          )}
        </div>
      )}
      {was_ && <div className="hwas">{was_}</div>}
    </div>
  );
}
