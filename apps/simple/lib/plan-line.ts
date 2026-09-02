import { dayLabel, plural } from "./utils";

/**
 * What a plan row is allowed to print, as pure functions.
 *
 * Split out of `lib/actions.ts` in phase 30d for one reason: `WhatToDo` is a
 * client component and `lib/actions.ts` reaches the database, so importing
 * these helpers from there pulled `pg` into the browser bundle. Same rule as
 * `lib/evidence.ts`: pure, no database, no clock, client-safe.
 */

/** "Selenium 200 µg/day" and "200 µg · once daily" compare on this. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The dose, with every part the title already says taken out.
 *
 * UX note 5: "Selenium 200 µg/day as selenomethionine for 6 months" followed
 * by "200 µg · capsule · once daily · for 6 months" printed the same dose
 * twice and read as one run-on line. The parts come from
 * `ReportAction.dose` on Plan and from the `PlanLine` string on Home, so both
 * go through here.
 */
export function doseParts(
  title: string,
  parts: (string | null | undefined)[],
): string | null {
  const t = norm(title);
  const kept = parts
    .map((p) => (p ?? "").trim())
    .filter((p) => p !== "" && !t.includes(norm(p)));
  return kept.length ? kept.join(" · ") : null;
}

/** The dose line one plan row prints under its title, or nothing. */
export const doseLine = (l: {
  title: string;
  dose: string | null;
}): string | null => (l.dose ? doseParts(l.title, l.dose.split("·")) : null);

/** The `why` a papers row gets when the import knew nothing but its grade. */
const GENERIC_WHY = /^what the papers report for this condition, grade [A-E]$/i;

/**
 * True when the row says something on its own: it carries a dose, or a
 * sentence somebody wrote.
 *
 * UX note 7: "dihydromyricetin ● A · alt down" is a supplement name, a glyph
 * and a direction. It does not render on Home; it goes to Plan's horizon
 * shelf, where the grade and the label are the point.
 */
export const saysSomething = (l: {
  dose: string | null;
  why: string;
}): boolean => l.dose != null || !GENERIC_WHY.test(l.why.trim());

/* ── what a target reads like to a person ──────────────────────────────
 * Phase 30d, UX note 6. The cards printed the engine's own grammar —
 * "tpo antibodies down → <100 IU/mL, measure after 24 weeks" — which is a
 * variable name, an arrow and a comparison operator. A person reads
 * "under", "over" or "to", the marker's real name, and a date they can act
 * on. Nothing is invented: every word comes off the target the plan wrote.
 */

/** "<=", "≤" and "<" all mean the same thing to a reader: "under". */
const OP = /^(<=|≤|<|>=|≥|>)\s*/;

/** A plain numeric range keeps its en dash: "45–55 ng/mL". */
const RANGE = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\b/;

/** The plan writer sometimes puts the day inside `expect`: "45 ng/mL by
 *  2026-11-01". An ISO date is a machine's date, so it goes through
 *  `dayLabel` like every other date on the page. */
const ISO = /\d{4}-\d{2}-\d{2}/;

/** Every ISO day in a sentence, in the words the rest of the app prints. */
const dated = (text: string) =>
  text.replace(/\d{4}-\d{2}-\d{2}/g, (d) => dayLabel(d, true));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "aim: TPO antibodies under 100 IU/mL · retest in 24 weeks".
 *
 * The marker's name is passed in, not looked up: `explainKey` reaches
 * `lib/graph.ts`, which reaches the database, and this module is compiled
 * into the browser bundle. `aimOf` in `lib/actions.ts` is the server-side
 * wrapper that does the lookup.
 *
 * The plan writer is inconsistent about `expect`: sometimes a bare value
 * ("45-55 ng/mL"), sometimes the whole clause ("HOMA-IR <=1.0"). Printing
 * both gave "aim: HOMA-IR to HOMA-IR <=1.0", so the name comes off the front
 * of the value when it is already there.
 */
export function aimLine(name: string, expect: string, weeks: number): string {
  /* A target that already names the day owns the deadline: printing
     "by Nov 1 2026 · retest in 12 weeks" gives a reader two dates for one
     thing, and only one of them is the one the plan committed to. */
  const raw = expect.trim();
  const carriesADate = ISO.test(raw);
  const tail = (word: string) =>
    !carriesADate && weeks > 0 ? ` · ${word} ${plural(weeks, "week")}` : "";

  const whole = dated(raw);
  /* A target with no number in it is a finding, not a value: it is printed
     whole, with no marker name and no direction in front of it. */
  if (!/\d/.test(raw)) return `aim: ${whole}${tail("in")}`;

  let rest = whole.replace(new RegExp(`^${escapeRe(name)}\\s*`, "i"), "").trim();
  const op = OP.exec(rest);
  const word = op ? (/[<\u2264]/.test(op[1]!) ? "under" : "over") : "to";
  if (op) rest = rest.slice(op[0].length).trim();
  rest = rest.replace(RANGE, "$1\u2013$2");
  return `aim: ${name} ${word} ${rest}${tail("retest in")}`;
}
