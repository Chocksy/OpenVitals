/**
 * When a settled answer is worth asking about again.
 *
 * Phase 20. The interview stopped being a form the day it got a history: an
 * answer holds for a period, and the only honest reasons to ask it again are
 * that enough time has passed for it to have changed, or that something just
 * made it matter. Both live here, and both are arithmetic — `PROFILE_QUESTIONS`
 * carries `revisitDays` per fact and `dueFacts` carries the triggers.
 *
 * Everything in this file is pure. No database, no clock: `today` is an
 * argument, so the cadence is testable to the day.
 */
import type { ModelInput } from "./coverage";
import { symptomByKey } from "./symptoms";
import { LIST_FACTS, PROFILE_QUESTIONS, type Sex } from "./vectors";

const DAY = 86_400_000;

/**
 * `CYCLE_FACT` spelt out rather than imported: `lib/facts.ts` calls this file
 * from `writeFact`, and importing back would be a module cycle for one string.
 */
const CYCLE_FACT = "cycle_phase_at_last_draw";

/** "2026-09-01" plus n days, as a date string. */
export const addDays = (date: string, n: number): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY)
    .toISOString()
    .slice(0, 10);

/**
 * Days until this answer is worth re-asking, or null for "never on a clock".
 *
 * `menopause_status` is the one value-dependent case in the table: pre and peri
 * both move, post never does, so the answer decides its own cadence.
 */
export function revisitDaysOf(key: string, value?: unknown): number | null {
  if (key === "menopause_status" && /post/i.test(String(value ?? "")))
    return null;
  const days = PROFILE_QUESTIONS[key]?.revisitDays;
  return days == null || days <= 0 ? null : days;
}

/** The `profile_facts.revisit_at` an answer written on `from` earns. */
export const revisitAtFor = (
  key: string,
  from: string,
  value?: unknown,
): string | null => {
  const days = revisitDaysOf(key, value);
  return days == null ? null : addDays(from, days);
};

/** A skipped re-ask waits a month, whatever its own cadence says. */
export const SKIP_DAYS = 30;

export interface DueFact {
  key: string;
  /**
   * What the row asks, in words. "Still yes? SYM COLD" was the engine talking
   * to itself, so this is the question the interview asked — a list answer is
   * re-asked as itself, because "Still: Non-alcoholic fatty liver disease?" is
   * the whole question.
   */
  question: string;
  /** the question as the interview first asked it, one tap away */
  original: string;
  options: string[];
  /** the value on file */
  current: string;
  /** validFrom of the open row */
  since: string;
  why: "due" | "draw" | "action" | "event" | "gain";
}

export interface RevisitRow {
  key: string;
  value: unknown;
  validFrom: string;
  revisitAt: string | null;
}

export interface RevisitTriggers {
  /** the newest draw, when it is newer than the fact's own `validFrom` */
  newDrawSince?: string;
  /** the text of every adopted protocol item */
  adopted?: string[];
  /** `tagsOfEvent` over the life events that are going on */
  eventTags?: string[];
  /** fact keys `nextMoves` puts in the top moves right now */
  gainKeys?: string[];
}

/**
 * The answers a blood draw is about: which half of the cycle it was taken in,
 * and the two habits that move the numbers on the sheet.
 */
const DRAW_FACTS = new Set([CYCLE_FACT, "coffee_last_hour", "last_meal_hour"]);

/**
 * An adopted action that names a fact makes that fact worth re-asking: "cut
 * the coffee after 14:00" is a claim about `coffee_last_hour` and the only way
 * to know whether it happened is to ask.
 */
const ACTION_WORDS: Record<string, RegExp> = {
  coffee_last_hour: /coffee|caffeine|espresso/i,
  last_meal_hour:
    /dinner|last meal|eat(ing)? (late|earlier)|time-restricted|fasting window/i,
  bedtime_hour: /bed|sleep|lights out/i,
  dairy_daily: /dairy|milk|yoghurt|yogurt|cheese|lactose/i,
  smoking: /smok|vap|nicotine/i,
  waist_cm: /waist|weight|kilo|belly/i,
  supplements: /supplement|vitamin|magnesium|omega|creatine|iron\b/i,
  medications: /statin|metformin|levothyroxine|dose|medication/i,
};

/** A life event makes some answers stale the day it starts. */
const EVENT_FACTS: Record<string, string[]> = {
  pregnancy: [
    CYCLE_FACT,
    "sym_cycle",
    "menopause_status",
    "waist_cm",
    "medications",
  ],
  acute_illness: [
    "sym_energy",
    "sym_weight",
    "sym_bowel",
    "sym_energy_duration",
  ],
  post_viral: ["sym_energy", "sym_breathless", "sym_energy_duration"],
  heavy_training: ["resting_hr", "waist_cm", "sym_energy"],
};

/** The same gate `lib/ask.ts` uses, so one list decides who a question is for. */
const applies = (
  gate: { sex?: Sex; minAge?: number; maxAge?: number } | undefined,
  m: ModelInput,
) => {
  if (!gate) return true;
  if (gate.sex && m.sex !== gate.sex) return false;
  if (gate.minAge != null && (m.age == null || m.age < gate.minAge))
    return false;
  if (gate.maxAge != null && (m.age == null || m.age > gate.maxAge))
    return false;
  return true;
};

const text = (v: unknown) =>
  Array.isArray(v) ? v.join(", ") : String(v ?? "").trim();

/**
 * The re-ask, in the words the person was asked the first time.
 *
 * A list of things they were diagnosed with is read back item by item
 * ("Still: Non-alcoholic fatty liver disease?"); everything else re-asks its
 * own question, and the surface prints the answer on file next to it.
 */
const reAsk = (key: string, question: string, value: string): string =>
  LIST_FACTS.has(key) ? `Still: ${value}?` : question;

const RANK: Record<DueFact["why"], number> = {
  gain: 0,
  draw: 1,
  action: 2,
  event: 3,
  due: 4,
};

/**
 * Up to `max` answers worth re-asking today, best reason first.
 *
 * A reason that is about right now (`gain`, `draw`, `event`) beats the clock
 * and is allowed to ask early; `action` and `due` wait for `revisit_at`. The
 * cap is the whole point: an interview that re-asks two things a day is a
 * relationship, and one that re-asks twenty is a form.
 */
export function dueFacts(
  m: ModelInput,
  rows: RevisitRow[],
  triggers: RevisitTriggers,
  today: string,
  max = 2,
): DueFact[] {
  const adopted = (triggers.adopted ?? []).join(" · ");
  const gain = new Set(triggers.gainKeys ?? []);
  const eventKeys = new Set(
    (triggers.eventTags ?? []).flatMap((t) => EVENT_FACTS[t] ?? []),
  );

  const out: DueFact[] = [];
  for (const row of rows) {
    const q = PROFILE_QUESTIONS[row.key];
    const current = text(row.value);
    if (!q || !current) continue;
    // An answer that no longer applies to this person is not re-asked: a
    // cycle question after 55 is a question about somebody else.
    if (!applies(symptomByKey(row.key)?.appliesTo, m)) continue;
    // A never-fact only ever comes back because something asked for it.
    const never = revisitDaysOf(row.key, row.value) == null;
    const ripe = row.revisitAt != null && row.revisitAt <= today;

    const why: DueFact["why"] | null = gain.has(row.key)
      ? "gain"
      : DRAW_FACTS.has(row.key) &&
          triggers.newDrawSince != null &&
          triggers.newDrawSince > row.validFrom
        ? "draw"
        : eventKeys.has(row.key)
          ? "event"
          : !never && ripe && ACTION_WORDS[row.key]?.test(adopted)
            ? "action"
            : !never && ripe
              ? "due"
              : null;
    if (!why) continue;

    const options = q.options ?? [];
    out.push({
      key: row.key,
      question: reAsk(row.key, q.question, current),
      original: q.question,
      options,
      current,
      since: row.validFrom,
      why,
    });
  }

  return out
    .sort(
      (a, b) =>
        RANK[a.why] - RANK[b.why] ||
        a.since.localeCompare(b.since) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, Math.max(0, max));
}

/**
 * The answers that are settled today: on file, and not due to be asked again.
 *
 * Phase 31a item 4. `/plan` kept "Any heart attack, stroke, diabetes,
 * dementia or cancer in your parents or siblings?" in "Answer these" long
 * after it was answered — the row was queued once, and nothing ever closed it.
 * A key is settled when it has a value and its own clock has not come round:
 * `family_history` has a 365-day cadence, so the day after it is answered it
 * is not a question any more.
 */
export function settledFacts(rows: RevisitRow[], today: string): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (text(row.value) === "") continue;
    const at = row.revisitAt ?? revisitAtFor(row.key, row.validFrom, row.value);
    if (at == null || at > today) out.add(row.key);
  }
  return out;
}

/** Which of `keys` this person has never answered, so nothing re-asks them. */
export const unanswered = (m: ModelInput, keys: string[]): string[] =>
  keys.filter((k) => text(m.profile[k]) === "");
