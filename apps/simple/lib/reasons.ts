/**
 * The engine's own reason strings, said out loud.
 *
 * `computeGraphState` records why a node is hot as the shortest thing it can
 * write: `glucose 87 mg/dL amber against optimal 72..85`,
 * `pattern:insulin_resistance_early`, `via glucose->hba1c`. Those are notes to
 * itself. The graph printed them verbatim, so Hot nodes read like a log file:
 * a column of codes, band syntax and the word "amber", which is a status enum
 * and not a word anybody says.
 *
 * One formatter, here, turns each of those shapes into a sentence: markers are
 * named through `explainKey`, a band is `optimal 72–85`, a status is the word
 * the rest of the app uses (off / borderline / optimal / never measured), a
 * pattern id is the pattern's own name, and an edge id is its two endpoints
 * with an arrow between them. Anything the formatter does not recognise comes
 * back untouched, so a sentence that was already English stays as it was.
 *
 * Pure: plain data in, a string out. No database, no clock.
 */
import { explainKey } from "./explain";
import { NODES } from "./graph";
import { PATTERNS } from "./patterns";

/** The four states, in the words the state word uses everywhere else. */
const STATE_WORD: Record<string, string> = {
  red: "off",
  amber: "borderline",
  green: "optimal",
  gray: "never measured",
};

const NODE_NAME = new Map(NODES.map((n) => [n.id, n.name]));
const PATTERN_NAME = new Map(PATTERNS.map((p) => [p.id, p.name]));

/** A node id, a metric code or a bare key, as a person would read it. */
const nameOf = (id: string): string =>
  NODE_NAME.get(id) ?? explainKey(id.replace(/^[a-z]+:/, ""));

/**
 * `72..85` is a band; `-..85` is a ceiling and `50..-` is a floor, because the
 * engine writes a missing end as a dash. An en dash joins two real ends.
 */
function band(low: string, high: string): string {
  const lo = low.trim();
  const hi = high.trim();
  const noLo = !lo || lo === "-";
  const noHi = !hi || hi === "-";
  if (noLo && noHi) return "no band on file";
  if (noLo) return `under ${hi}`;
  if (noHi) return `over ${lo}`;
  return `${lo}–${hi}`;
}

/** `glucose 87 mg/dL amber against optimal 72..85` */
const READING =
  /^([a-z0-9_]+) (-?[\d.,]+)(?: (\S+))? (red|amber|green|gray) against optimal (\S+?)(?:\.\.|,|–)(\S*)$/;

/** `moved away from optimal, was 81` */
const MOVED = /^moved (away from|toward) optimal, was (\S+)$/;

/** `pattern:insulin_resistance_early`, and the `pattern x` the clauses write */
const PATTERN = /^pattern[: ](\S+)$/;

/** `via glucose->hba1c` */
const VIA = /^via (\S+?)->(\S+)$/;

/**
 * One reason, in words. Unrecognised text is returned as it came in: this is a
 * translator for the shapes the engine writes, not a rewriter of English.
 */
export function sayReason(reason: string): string {
  const text = reason.trim();

  const reading = READING.exec(text);
  if (reading) {
    const [, code, value, unit, status, low, high] = reading;
    const measured = `${nameOf(code!)} ${value}${unit ? ` ${unit}` : ""}`;
    return `${measured}, ${STATE_WORD[status!]} against optimal ${band(low!, high!)}`;
  }

  const moved = MOVED.exec(text);
  if (moved)
    return `was ${moved[2]}, moving ${moved[1] === "toward" ? "toward" : "away from"} optimal`;

  const pattern = PATTERN.exec(text);
  if (pattern) {
    const id = pattern[1]!;
    return `part of the ${PATTERN_NAME.get(id) ?? id.replace(/_/g, " ")} pattern`;
  }

  const via = VIA.exec(text);
  if (via) return `through ${nameOf(via[1]!)} → ${nameOf(via[2]!)}`;

  return text;
}

/** The whole list, in the order the engine recorded it. */
export const sayReasons = (reasons: string[]): string[] =>
  reasons.map(sayReason);

/** The list as one line, which is how a row prints it. */
export const reasonLine = (reasons: string[]): string =>
  sayReasons(reasons).join("; ");
