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

/* ------------------------------------------------------------------ *
 * The month: what one plan line says about when to do it
 * ------------------------------------------------------------------ */

/**
 * Phase 32a section 2. `plan-month.html` prints a day in clock order, a
 * supplements table with a dose, a slot, a "with what" and an "until", and a
 * month strip. None of it had a column: `protocol_items.cadence` was one text
 * field holding "daily" or "weekly", and the dose was one flattened string.
 *
 * The columns exist now. This is the reader that fills them: one pure function
 * over the line the app already stores (`protocol_items.text`), and one pure
 * expander over the columns. Nothing is materialised — there is no occurrence
 * table, and `habit_logs` stays one tick per item per day.
 */
export type Slot =
  | "morning"
  | "breakfast"
  | "midday"
  | "afternoon"
  | "dinner"
  | "evening"
  | "bedtime";

/** The seven slots, in the order a day runs. */
export const SLOTS: readonly Slot[] = [
  "morning",
  "breakfast",
  "midday",
  "afternoon",
  "dinner",
  "evening",
  "bedtime",
];

/**
 * Where a slot sits on a clock, for sorting and for a placement time only.
 *
 * A slot is not an alarm: "with breakfast" is a slot because the person's
 * breakfast is their own. These minutes order the day and let a UI print a
 * placement; they are never written back as data, which is why `Occurrence.time`
 * stays null unless the line carried a literal `HH:MM`.
 */
export const SLOT_MINUTES: Record<Slot, number> = {
  morning: 7 * 60,
  breakfast: 8 * 60,
  midday: 12 * 60 + 30,
  afternoon: 15 * 60,
  dinner: 19 * 60,
  evening: 20 * 60 + 30,
  bedtime: 22 * 60,
};

/** The word a page prints for a slot. */
export const SLOT_LABEL: Record<Slot, string> = {
  morning: "Morning",
  breakfast: "Breakfast",
  midday: "Midday",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
  bedtime: "Bedtime",
};

/**
 * The four columns the supplements table has room for: M, N, E, B.
 *
 * The letters themselves are the table's, not the data's — this only says
 * which of the four a slot falls in.
 */
export function slotBucket(
  slot: string | null | undefined,
): "M" | "N" | "E" | "B" | null {
  switch (slot) {
    case "morning":
    case "breakfast":
      return "M";
    case "midday":
    case "afternoon":
      return "N";
    case "dinner":
    case "evening":
      return "E";
    case "bedtime":
      return "B";
    default:
      return null;
  }
}

export interface Schedule {
  /** a named slot, or "HH:MM" when the line gave a clock time, or null */
  timeOfDay: string | null;
  /** ISO weekdays 1..7 (1 = Monday), or null for every day */
  daysOfWeek: number[] | null;
  doseAmount: number | null;
  doseUnit: string | null;
  withWhat: string | null;
  /** months the line said it runs for, or null; the caller turns it into a date */
  months: number | null;
}

/** Both micro signs, and the way people type it when they have neither. */
const MICRO = /[µμ]/g;

/** The units a plan line actually writes, longest first so "mg" beats "g". */
const UNIT =
  /(\d+(?:[ \u00A0\u202F\u2009]\d{3})*(?:[.,]\d+)?)\s*(mcg|µg|μg|mg|g|IU|iu|mL|ml|L)\b/;

/** "10 000" and "10 000,5" are one number; the spaces are typography. */
const numberOf = (raw: string): number =>
  Number(raw.replace(/[ \u00A0\u202F\u2009]/g, "").replace(",", "."));

/** One spelling per unit, so "mcg" and "μg" sort with "µg". */
function unitOf(raw: string): string {
  const u = raw.replace(MICRO, "µ");
  if (u === "mcg") return "µg";
  if (u.toLowerCase() === "iu") return "IU";
  if (u.toLowerCase() === "ml") return "ml";
  if (u.toLowerCase() === "l") return "L";
  return u;
}

/** A literal clock time beats every slot word: 21:00 is not "evening-ish". */
const CLOCK = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;

/** The slot words, and the fact that the earliest one in the line wins. */
const SLOT_WORDS: [Slot, RegExp][] = [
  ["morning", /\bmornings?\b/i],
  ["breakfast", /\bbreakfast\b/i],
  ["midday", /\b(?:midday|lunch(?:time)?|noon)\b/i],
  ["afternoon", /\bafternoons?\b/i],
  ["dinner", /\b(?:dinner|supper)\b/i],
  ["evening", /\bevenings?\b/i],
  ["bedtime", /\b(?:bedtime|before bed|at night)\b/i],
];

/** "3x/week", "3 times a week", "twice weekly", "3 tins a week". */
const PER_WEEK = [
  /\b(\d+)\s*(?:x|×)\s*(?:\/|per|a|each)?\s*week(?:ly)?\b/i,
  /\b(\d+)\s*times?\s*(?:a|per|each)?\s*week(?:ly)?\b/i,
  /\b(once|twice|three|four|five|six|seven)\s*(?:times?\s*)?(?:a|per|each)?\s*week(?:ly)?\b/i,
  /\b(\d+|once|twice|three|four|five|six|seven)\s+[a-z]+\s*(?:\/|per|a|each)\s*week(?:ly)?\b/i,
];

const WORD_COUNT: Record<string, number> = {
  once: 1,
  twice: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

/**
 * A default spread for "three times a week": Mon, Wed, Fri.
 *
 * The line says how often, never which days, so the days are evenly spaced
 * from Monday. A person who trains Tue/Thu/Sat edits the row; nothing here
 * pretends to have read that off the line.
 */
export const spreadDays = (n: number): number[] =>
  Array.from({ length: Math.min(Math.max(n, 1), 7) }, (_, i) =>
    Math.floor((i * 7) / Math.min(Math.max(n, 1), 7)) + 1,
  );

/**
 * "every other day" and "alternate days" are a parity, not a weekday set.
 *
 * `days_of_week` cannot express one — a two-day cycle drifts across the week —
 * and phase 32a did not add an `interval` column for it, so these lines keep
 * `daysOfWeek: null` (every day) and the row prints alternate days as a note.
 * That is the build-cost gap `plan-month.html` names under the iron row.
 */
const ALTERNATE =
  /\bevery other day\b|\balternat(?:e|ing)\s+days?\b|\balt\.?\s*days?\b/i;

/** "on an empty stomach" / "with breakfast": the phrase exactly as written. */
const WITH_WHAT = /\b(?:with|on an empty stomach|on empty stomach)\b/gi;

/** Where a "with …" phrase stops. */
const WITH_END = /\s+(?:for|until|and at least)\b|[·,;.]|$/;

function withWhatOf(line: string): string | null {
  const found: string[] = [];
  for (const m of line.matchAll(WITH_WHAT)) {
    const word = m[0].toLowerCase();
    if (word.startsWith("on")) {
      found.push(m[0].trim());
      continue;
    }
    const rest = line.slice((m.index ?? 0) + m[0].length);
    const stop = WITH_END.exec(rest);
    const tail = rest.slice(0, stop ? stop.index : rest.length).trim();
    if (tail) found.push(`with ${tail}`);
  }
  return found.length ? found.join(" · ") : null;
}

/**
 * Everything one plan line says about when and how much.
 *
 * Tested on the owner's real lines in `plan-line.test.ts`. Nothing is guessed:
 * a line with no time gets no time, a line with no dose gets no dose, and the
 * only default in here is which weekdays "three times a week" lands on.
 */
export function scheduleOf(line: string): Schedule {
  const text = (line ?? "").trim();

  const clock = CLOCK.exec(text);
  let timeOfDay: string | null = clock
    ? `${clock[1]!.padStart(2, "0")}:${clock[2]}`
    : null;
  if (!timeOfDay) {
    let best: { slot: Slot; at: number } | null = null;
    for (const [slot, re] of SLOT_WORDS) {
      const hit = re.exec(text);
      if (hit && (best == null || hit.index < best.at))
        best = { slot, at: hit.index };
    }
    timeOfDay = best?.slot ?? null;
  }

  let daysOfWeek: number[] | null = null;
  if (!ALTERNATE.test(text))
    for (const re of PER_WEEK) {
      const hit = re.exec(text);
      if (!hit) continue;
      const raw = hit[1]!;
      const n = WORD_COUNT[raw.toLowerCase()] ?? Number(raw);
      if (Number.isFinite(n) && n >= 1 && n <= 7) {
        daysOfWeek = spreadDays(n);
        break;
      }
    }

  const dose = UNIT.exec(text);
  const months = /\bfor\s+(\d+)\s*months?\b/i.exec(text);

  return {
    timeOfDay,
    daysOfWeek,
    doseAmount: dose ? numberOf(dose[1]!) : null,
    doseUnit: dose ? unitOf(dose[2]!) : null,
    withWhat: withWhatOf(text),
    months: months ? Number(months[1]) : null,
  };
}

/** `day` plus `months` calendar months, clamped to the end of the month. */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const last = new Date(y, m - 1 + months + 1, 0).getDate();
  const end = new Date(y, m - 1 + months, Math.min(d, last));
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

export interface OccurrenceItem {
  id: string;
  title: string;
  timeOfDay: string | null;
  daysOfWeek: number[] | null;
  startedAt: string | null;
  endsAt: string | null;
  active: boolean;
}

export interface Occurrence {
  itemId: string;
  day: string;
  /** only when the item carried a literal `HH:MM`; a slot is not a time */
  time: string | null;
  slot: string | null;
  /** clock order within the day, from 0 */
  order: number;
}

/** A stored `time_of_day` is a time only when it is a literal `HH:MM`. */
const CLOCK_ONLY = /^([01]\d|2[0-3]):[0-5]\d$/;

const isSlot = (s: string | null): s is Slot =>
  s != null && (SLOTS as readonly string[]).includes(s);

/** Minutes past midnight for sorting only: a slot's are a placement. */
function minutesOf(timeOfDay: string | null): number {
  if (isSlot(timeOfDay)) return SLOT_MINUTES[timeOfDay];
  const hit = timeOfDay ? /^(\d{1,2}):(\d{2})$/.exec(timeOfDay) : null;
  return hit ? Number(hit[1]) * 60 + Number(hit[2]) : Number.MAX_SAFE_INTEGER;
}

/** ISO weekday, 1 = Monday, from a local `YYYY-MM-DD`. */
function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const wd = new Date(y, m - 1, d).getDay();
  return wd === 0 ? 7 : wd;
}

function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/**
 * Every (item, day) the columns imply between `from` and `to`, both included.
 *
 * Pure, no clock and no table: the month strip, the Today column and the week
 * all read this rather than a materialised occurrence row, which is why an
 * edit to an item's days changes the past as well as the future. `habit_logs`
 * is still the only record of what actually happened.
 */
export function occurrences(
  items: OccurrenceItem[],
  from: string,
  to: string,
): Occurrence[] {
  if (from > to) return [];
  const out: Occurrence[] = [];
  for (let day = from; day <= to; day = nextDay(day)) {
    const wd = isoWeekday(day);
    const due = items.filter(
      (it) =>
        it.active &&
        (it.startedAt == null || it.startedAt <= day) &&
        (it.endsAt == null || it.endsAt >= day) &&
        (it.daysOfWeek == null ||
          it.daysOfWeek.length === 0 ||
          it.daysOfWeek.includes(wd)),
    );
    due
      .map((it) => ({ it, at: minutesOf(it.timeOfDay) }))
      .sort((a, b) => a.at - b.at || a.it.title.localeCompare(b.it.title))
      .forEach(({ it }, order) =>
        out.push({
          itemId: it.id,
          day,
          time: CLOCK_ONLY.test(it.timeOfDay ?? "") ? it.timeOfDay : null,
          slot: isSlot(it.timeOfDay) ? it.timeOfDay : null,
          order,
        }),
      );
  }
  return out;
}
