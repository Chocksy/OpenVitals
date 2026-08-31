/**
 * The composer: free text in, dated facts out, and one reply that remembers.
 *
 * Phase 20. Three layers, in this order, and the order is the whole design:
 *
 *  1. **Rules** (`understandRules`, pure): numbers with units through
 *     `lib/units.ts`, clock times against the timing facts, relative and
 *     absolute dates, and a synonym list per option of `PROFILE_QUESTIONS`.
 *     Nothing here needs a model, a network or a clock.
 *  2. **Ontology** (`phenotypeChips`, pure over a term list): the phrases the
 *     rules did not know, ranked against HPO with the ask box's own ranker.
 *  3. **Model** (`understand`, one `generateObject`): only the words the first
 *     two layers left, only keys from a closed list, and every chip carries a
 *     verbatim quote that has to appear in the text or the chip is dropped.
 *
 * `followUp` picks at most one question back, and `replyPack` collects
 * everything the reply says — the chips, which conclusions moved, which graph
 * edges came alive, one suggestion and the memory of what was said before —
 * so the model writes a paragraph and decides nothing.
 *
 * ROADMAP principle 3: inference in code, prose by the LLM. Every number,
 * date, threshold and ordering below is computed here. The box works with the
 * model switched off.
 */
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import {
  checkinPosts,
  getDb,
  hkbInterventions,
  profileFactHistory,
  type CheckinPost,
} from "@/db";
import { conditionalAsks } from "./ask";
import { localDay } from "./daily";
import { type FactQuestion, type ModelInput } from "./coverage";
import { model } from "./extract";
import { EVENT_TAGS } from "./facts";
import { computeGraphState, parseHour, type ActiveEdge } from "./graph-state";
import { gradeOfEdge, type GraphEdge } from "./graph";
import { catalogFor } from "./hkb";
import { scoreHypotheses, type Catalog, type Grade } from "./hypotheses";
import { nextMoves, QUIET_GAIN } from "./infogain";
import { CODE_GRAPH, loadGraph, type Graph } from "./kg";
import { searchTerms, type RankedTerm } from "./lookup";
import { applyOverlay } from "./sample";
import { SYMPTOM_KEYS } from "./symptoms";
import { claimFrom, claimLabel } from "./trends";
import { convert, normalizeUnit } from "./units";
import { buildModelInput } from "./coverage";
import { LIST_FACTS, PROFILE_QUESTIONS } from "./vectors";

export interface Chip {
  kind:
    | "fact"
    | "symptom"
    | "reading"
    | "event"
    | "phenotype"
    /**
     * Hearsay: a sentence about the world, not about this person. It writes no
     * fact, no reading and no event — it goes to the trends inbox
     * (`lib/trends.ts`), which files it as a labelled horizon item.
     */
    | "claim"
    /**
     * Phase 23: food off a photo. It writes a `daily_logs` nutrition entry and
     * never a reading, because it is an estimate and no evidence rule may read
     * it. `lib/capture.ts` makes these; the text composer never does.
     */
    | "nutrition"
    | "unknown";
  /** fact key, metric code, life-event kind, HP id */
  key: string;
  /** "tired · afternoons", "glucose 98 mg/dL", "last coffee 16:00" */
  label: string;
  value: unknown;
  /** the day the fact starts holding: today unless the text says otherwise */
  date: string;
  /** the words it came from, verbatim */
  quote: string;
  confidence: number;
  by: "rule" | "model";
  /** readings only: the unit the value is in, after conversion */
  unit?: string;
}

const DAY = 86_400_000;
const addDays = (date: string, n: number) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY)
    .toISOString()
    .slice(0, 10);

/* ── dates: "yesterday", "since Monday", "for two weeks", "on 12 Aug" ──── */

const WORD_NUMBER: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const UNIT_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

export interface WhenFound {
  date: string;
  quote: string;
}

/**
 * The one date the post is about, when the words carry one.
 *
 * A post is about a moment, not a spreadsheet, so the first date found governs
 * every chip in it. "Since Monday" and "for two weeks" both mean the same
 * thing to a fact with a history: the day it started holding.
 */
export function whenOf(text: string, today: string): WhenFound | null {
  const t = text.toLowerCase();

  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return { date: iso[1]!, quote: iso[0] };

  if (/\bthe day before yesterday\b/.test(t))
    return { date: addDays(today, -2), quote: "the day before yesterday" };
  const yesterday = t.match(/\byesterday\b/);
  if (yesterday) return { date: addDays(today, -1), quote: "yesterday" };

  const ago = t.match(
    /\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\s+(day|week|month|year)s?\s+ago\b/,
  );
  if (ago) {
    const n = WORD_NUMBER[ago[1]!] ?? Number(ago[1]);
    return { date: addDays(today, -n * UNIT_DAYS[ago[2]!]!), quote: ago[0] };
  }

  const span = t.match(
    /\b(?:for|since|over)\s+(?:the\s+)?(?:last\s+|past\s+)?(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\s+(day|week|month|year)s?\b/,
  );
  if (span) {
    const n = WORD_NUMBER[span[1]!] ?? Number(span[1]);
    return { date: addDays(today, -n * UNIT_DAYS[span[2]!]!), quote: span[0] };
  }

  const named = t.match(
    /\b(?:since|on|from|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (named) {
    const want = WEEKDAYS.indexOf(named[1]!);
    const now = new Date(`${today}T00:00:00Z`).getUTCDay();
    // The most recent one that has already happened; "since Monday" said on a
    // Monday means today, not a week ago.
    const back = (now - want + 7) % 7;
    return { date: addDays(today, -back), quote: named[0] };
  }

  if (/\blast week\b/.test(t))
    return { date: addDays(today, -7), quote: "last week" };
  if (/\blast month\b/.test(t))
    return { date: addDays(today, -30), quote: "last month" };

  const dayMonth = t.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/,
  );
  const monthDay = t.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  );
  const parts = dayMonth
    ? { day: Number(dayMonth[1]), month: dayMonth[2]!, quote: dayMonth[0] }
    : monthDay
      ? { day: Number(monthDay[2]), month: monthDay[1]!, quote: monthDay[0] }
      : null;
  if (parts && parts.day >= 1 && parts.day <= 31) {
    const month = MONTHS.indexOf(parts.month) + 1;
    const pad = (n: number) => String(n).padStart(2, "0");
    let year = Number(today.slice(0, 4));
    let date = `${year}-${pad(month)}-${pad(parts.day)}`;
    // A date in the future is last year's: nobody posts about next August.
    if (date > today) date = `${--year}-${pad(month)}-${pad(parts.day)}`;
    return { date, quote: parts.quote };
  }

  return null;
}

/* ── clock times: "coffee at 4pm", "in bed by 23:30" ──────────────────── */

interface TimeToken {
  index: number;
  text: string;
  hour: number;
}

/**
 * Every clock time in the text, with where it sits.
 *
 * A bare number is not a time: "waist 94" is a measurement. A match counts
 * only when it carries am/pm, a colon, or a preposition that can only be
 * followed by a time.
 */
export function timeTokens(text: string): TimeToken[] {
  const out: TimeToken[] = [];
  const re =
    /\b(?:(at|by|around|about|before|after|until|till)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  for (const m of text.matchAll(re)) {
    const [whole, prep, hh, mm, ampm] = m;
    if (!ampm && !mm && !prep) continue;
    const hour = parseHour(`${hh}${mm ? `:${mm}` : ""}${ampm ?? ""}`);
    if (hour == null || hour > 24) continue;
    out.push({ index: m.index ?? 0, text: whole.trim(), hour });
  }
  return out;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/** 16.5 as "16:30", which is what the timing facts already store. */
export const asClock = (hour: number): string =>
  `${pad2(Math.floor(hour) % 24)}:${pad2(Math.round((hour % 1) * 60))}`;

/** The three timing answers a conditional edge reads, and what names them. */
const TIME_FACTS: { key: string; words: RegExp; label: string }[] = [
  {
    key: "coffee_last_hour",
    words: /coffee|espresso|latte|cappuccino|americano|caffeine|energy drink/i,
    label: "last coffee",
  },
  {
    key: "bedtime_hour",
    words: /\b(bed|asleep|lights out|turn in|went to sleep|go to sleep)\b/i,
    label: "bedtime",
  },
  {
    key: "last_meal_hour",
    words: /\b(dinner|supper|last meal|ate|eating|had lunch|lunch)\b/i,
    label: "last meal",
  },
];

/* ── numbers with units ───────────────────────────────────────────────── */

interface SelfMetric {
  code: string;
  words: RegExp;
  /** the catalog's own unit, which is what the reading is stored in */
  unit: string;
  /** units to try, in order, when the person wrote none */
  assume: string[];
  /** plausible range in the catalog unit; outside it the guess was wrong */
  plausible: [number, number];
  name: string;
}

/**
 * What a person types into a check-in box, rather than what a lab prints. The
 * unit is the catalog's, so a home glucose sits on the same axis as the one
 * the lab drew, and the conversion is `lib/units.ts` and nothing local.
 */
export const SELF_METRICS: SelfMetric[] = [
  {
    code: "glucose",
    words: /\b(blood\s+)?(glucose|blood sugar|sugar)\b/i,
    unit: "mg/dL",
    assume: ["mg/dl", "mmol/l"],
    plausible: [40, 600],
    name: "glucose",
  },
  {
    code: "hba1c",
    words: /\b(hba1c|a1c|glycated h[ae]moglobin)\b/i,
    unit: "%",
    assume: ["%"],
    plausible: [3, 20],
    name: "HbA1c",
  },
  {
    code: "weight",
    words: /\b(weigh|weighs|weighed|weight)\b/i,
    unit: "lbs",
    assume: ["kg", "lbs"],
    plausible: [66, 660],
    name: "weight",
  },
  {
    code: "sleep_duration",
    words: /\b(slept|sleep|sleeping)\b/i,
    unit: "min",
    assume: ["h", "min"],
    plausible: [120, 900],
    name: "sleep",
  },
];

/** Facts that are one number, with the range that says the guess was right. */
const NUMBER_FACTS: {
  key: string;
  words: RegExp;
  plausible: [number, number];
  label: string;
}[] = [
  {
    key: "waist_cm",
    words: /\bwaist\b/i,
    plausible: [40, 200],
    label: "waist",
  },
  {
    key: "resting_hr",
    words: /\b(resting (heart rate|hr|pulse)|rhr)\b/i,
    plausible: [30, 130],
    label: "resting heart rate",
  },
  {
    key: "height_cm",
    words: /\b(height|tall)\b/i,
    plausible: [100, 230],
    label: "height",
  },
  {
    key: "grip_kg",
    words: /\bgrip( strength)?\b/i,
    plausible: [5, 120],
    label: "grip",
  },
];

const UNIT_WORDS =
  /(mg\/dl|mmol\/l|mmol|kgs?|kilos?|kilograms?|lbs?|pounds?|hours?|hrs?|h|minutes?|mins?|min|cm|%|bpm)/i;

/**
 * The first `number unit?` next to a keyword, with what it matched.
 *
 * The keyword's own characters are blanked out first, because "hba1c" carries a
 * digit and a letter that looks like a unit, and a rule that reads its own
 * trigger word is a rule that reads nonsense.
 */
function numberNear(
  text: string,
  start: number,
  end: number,
  window = 45,
): { value: number; unit: string; quote: string } | null {
  const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${UNIT_WORDS.source}?`, "i");
  // After the word first ("glucose 98"), and only then before it ("82 kg, my
  // weight"). The other way round, "slept 6h ... hba1c 5.4%" reads the 6.
  const m =
    text.slice(end, end + window).match(re) ??
    text.slice(Math.max(0, start - 20), start).match(re);
  if (!m) return null;
  const value = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return { value, unit: normalizeUnit(m[2] ?? ""), quote: m[0].trim() };
}

/** The value in the catalog's unit, or null when no assumption is plausible. */
function inCatalogUnit(
  metric: SelfMetric,
  value: number,
  written: string,
): number | null {
  const tries = written ? [written] : metric.assume;
  for (const unit of tries) {
    const converted = convert(value, unit, metric.unit, metric.code);
    if (converted == null) continue;
    if (converted >= metric.plausible[0] && converted <= metric.plausible[1])
      return converted;
  }
  return null;
}

/* ── option words: the synonym list per answer ────────────────────────── */

/**
 * The words a person uses for an answer the interview writes as an option.
 *
 * Hand-written and deliberately narrow: a wrong chip is worse than a missing
 * one, because a missing one is what the model layer is for. Every entry is
 * one option of one `PROFILE_QUESTIONS` key, so nothing here can invent a
 * value the question does not offer.
 */
export const SYNONYMS: Record<string, [string, RegExp][]> = {
  sym_energy: [
    [
      "Yes",
      /\b(tired|exhausted|fatigued?|knackered|wiped out|shattered|no energy|low energy|drained|worn out|feel flat|feeling flat|running on empty)\b/i,
    ],
    ["No", /\b(energy is (good|back|fine)|not tired any ?more)\b/i],
  ],
  sym_cold: [
    [
      "Yes",
      /\b(always cold|cold hands|cold feet|feel the cold|freezing when)\b/i,
    ],
  ],
  sym_weight: [
    ["Gained", /\b(gained weight|put on weight|weight is up)\b/i],
    ["Lost", /\b(lost weight|losing weight|weight is down)\b/i],
  ],
  sym_hair_skin: [
    [
      "Yes",
      /\b(hair (is )?(thinning|falling out|shedding)|dry skin|skin is (very )?dry)\b/i,
    ],
  ],
  sleep_snoring: [
    ["Most nights", /\b(snor\w+ (every|most) night|I snore a lot)\b/i],
    ["Sometimes", /\b(snore sometimes|snore now and then|I snore)\b/i],
  ],
  sym_sleepiness: [
    [
      "Yes",
      /\b(fall asleep (during|in) the day|dozing off|nod(ding)? off|sleepy (all|during the) day)\b/i,
    ],
  ],
  sym_bowel: [
    ["Constipation", /\b(constipated|constipation)\b/i],
    [
      "Diarrhoea and bloating",
      /\b(diarrh(o)?ea|loose stools|urgent stools)\b/i,
    ],
  ],
  sym_cycle: [
    [
      "Irregular",
      /\b(irregular periods?|cycle is irregular|periods? (are |have been |has been |were )?all over)\b/i,
    ],
    ["Heavy", /\b(heavy periods?|heavy bleeding|flooding)\b/i],
    ["Absent", /\b(no periods?|periods? stopped|missed my period)\b/i],
  ],
  // The second Rotterdam criterion, next to the cycle above it. "Breaking out"
  // is how people say persistent acne; the hair words are the hirsutism half.
  hirsutism_acne: [
    [
      "Yes",
      /\b(break(ing)? out|acne|spots on my (chin|jaw|face)|dark hairs?|facial hair|hair on my (chin|face|chest|stomach)|hirsut\w*)\b/i,
    ],
  ],
  diet: [
    ["Vegan", /\b(vegan|plant-?based)\b/i],
    ["Vegetarian", /\b(vegetarian|I do not eat meat|no meat)\b/i],
    ["Pescatarian", /\b(pescatarian|only fish)\b/i],
    ["Low-carb or keto", /\b(low-?carb|keto(genic)?)\b/i],
    ["Mediterranean", /\b(mediterranean diet)\b/i],
  ],
  sym_joint: [
    ["Yes", /\b(gout|swollen (big )?toe|hot swollen joint|podagra)\b/i],
  ],
  sym_thirst: [
    [
      "Yes",
      /\b(very thirsty|so thirsty|drinking (all the time|litres)|peeing (a lot|all night)|urinating more)\b/i,
    ],
  ],
  sym_tingling: [
    [
      "Yes",
      /\b(pins and needles|tingl\w+|numbness|numb (hands|feet|fingers|toes))\b/i,
    ],
  ],
  sym_tremor: [["Yes", /\b(shaky hands|hands shake|tremor)\b/i]],
  sym_breathless: [
    ["Yes", /\b(short of breath|breathless|out of breath on)\b/i],
  ],
  sym_flushing: [["Yes", /\b(flushing|face goes red|hot flushes)\b/i]],
  sym_hives: [["Yes", /\b(hives|urticaria|itchy (weals|welts|blotches))\b/i]],
  sym_bloating: [["Yes", /\b(bloat\w+|distended|abdomen swells)\b/i]],
  sym_salt_craving: [["Yes", /\b(crav\w+ salt|salt cravings?)\b/i]],
  sym_dizzy_standing: [
    ["Yes", /\b(dizzy when I stand|grey out|light-?headed (when|on) stand)\b/i],
  ],
  smoking: [
    ["Current", /\b(I smoke|smoking again|back on the cigarettes)\b/i],
    [
      "Former",
      /\b(quit smoking|stopped smoking|ex-?smoker|gave up smoking)\b/i,
    ],
    ["Never", /\b(never smoked)\b/i],
  ],
  dairy_daily: [
    ["Yes", /\b((milk|yoghurt|yogurt|cheese) (every day|daily|most days))\b/i],
    ["No", /\b(no dairy|cut out dairy|dairy ?-?free)\b/i],
  ],
  // Last, because `SYNONYM_NEEDS` reads the chips written above it: the time of
  // day only counts once the same post has said there is tiredness to place.
  energy_when: [
    ["Mornings", /\b(mornings?|before lunch|first thing)\b/i],
    ["Afternoons", /\b(afternoons?|after lunch|mid-?afternoon|3 ?pm slump)\b/i],
    ["Evenings", /\b(evenings?|at night|end of the day)\b/i],
    ["All day", /\b(all day|the whole day|from the moment I wake)\b/i],
  ],
  sym_energy_duration: [
    [
      "Over a month",
      /\b(for (months|years)|over a month|since (last )?(spring|winter|summer|autumn))\b/i,
    ],
    ["Under a month", /\b(for (a few days|a week|two weeks)|this week)\b/i],
  ],
};

/**
 * Answers that only mean something next to another one.
 *
 * "This morning" is not a claim about when somebody is tired, and "all day" on
 * its own is not either. `energy_when` is only read when the same post already
 * said there is tiredness to place.
 */
const SYNONYM_NEEDS: Record<string, string[]> = {
  energy_when: ["sym_energy", "sym_sleepiness"],
};

const label = (key: string) => key.replace(/^sym_/, "").replace(/_/g, " ");

/* ── the rules layer ──────────────────────────────────────────────────── */

/**
 * Everything the rules can read out of one post, dated.
 *
 * Pure and offline: same text, same day, same chips, for ever. This is the
 * layer the composer is allowed to depend on, so the box keeps working when
 * the model is off, rate-limited or wrong.
 */
export function understandRules(
  text: string,
  m: ModelInput,
  today: string,
): Chip[] {
  const out: Chip[] = [];
  const when = whenOf(text, today);
  const date = when?.date ?? today;
  const seen = new Set<string>();
  const push = (chip: Chip) => {
    if (seen.has(chip.key)) return;
    seen.add(chip.key);
    out.push(chip);
  };

  // 1. clock times against the three timing facts. The time that belongs to a
  // word is the next one after it; only when there is none does the one just
  // before it count, or "in bed by 23:30 and dinner at 21:00" gives the dinner
  // the bedtime.
  const times = timeTokens(text);
  const claimed = new Set<number>();
  for (const fact of TIME_FACTS) {
    const km = fact.words.exec(text);
    if (!km) continue;
    const free = times.filter((t) => !claimed.has(t.index));
    const near =
      free.find((t) => t.index >= km.index && t.index < km.index + 60) ??
      free.find((t) => t.index < km.index && t.index > km.index - 30);
    if (!near) continue;
    claimed.add(near.index);
    const value = asClock(near.hour);
    push({
      kind: "fact",
      key: fact.key,
      label: `${fact.label} ${value}`,
      value,
      date,
      quote: `${km[0]} ${near.text}`.trim(),
      confidence: 0.9,
      by: "rule",
    });
  }

  // 2. blood pressure, before the plain numbers: "128/82" is two readings
  const bp = text.match(/\b(\d{2,3})\s*\/\s*(\d{2,3})\b/);
  if (bp) {
    const sys = Number(bp[1]);
    const dia = Number(bp[2]);
    if (sys >= 70 && sys <= 260 && dia >= 40 && dia <= 160 && sys > dia) {
      push({
        kind: "reading",
        key: "bp_systolic",
        label: `blood pressure ${sys}/${dia} mmHg`,
        value: sys,
        unit: "mmHg",
        date,
        quote: bp[0],
        confidence: 0.9,
        by: "rule",
      });
      push({
        kind: "reading",
        key: "bp_diastolic",
        label: `diastolic ${dia} mmHg`,
        value: dia,
        unit: "mmHg",
        date,
        quote: bp[0],
        confidence: 0.9,
        by: "rule",
      });
    }
  }

  // 3. numbers with units, through the catalog's own unit
  for (const metric of SELF_METRICS) {
    const km = metric.words.exec(text);
    if (!km) continue;
    const found = numberNear(text, km.index, km.index + km[0].length);
    if (!found) continue;
    const value = inCatalogUnit(metric, found.value, found.unit);
    if (value == null) continue;
    push({
      kind: "reading",
      key: metric.code,
      label: `${metric.name} ${value} ${metric.unit}`,
      value,
      unit: metric.unit,
      date,
      quote: `${km[0]} ${found.quote}`.trim(),
      confidence: 0.8,
      by: "rule",
    });
  }

  // 4. the facts that are one plain number
  for (const fact of NUMBER_FACTS) {
    const km = fact.words.exec(text);
    if (!km) continue;
    const found = numberNear(text, km.index, km.index + km[0].length);
    if (!found) continue;
    if (found.value < fact.plausible[0] || found.value > fact.plausible[1])
      continue;
    push({
      kind: "fact",
      key: fact.key,
      label: `${fact.label} ${found.value}`,
      value: String(found.value),
      date,
      quote: `${km[0]} ${found.quote}`.trim(),
      confidence: 0.8,
      by: "rule",
    });
  }

  // 5. option words, one option of one question at a time
  for (const [key, options] of Object.entries(SYNONYMS)) {
    if (!PROFILE_QUESTIONS[key]) continue;
    const needs = SYNONYM_NEEDS[key];
    if (needs && !needs.some((k) => seen.has(k))) continue;
    for (const [option, words] of options) {
      const km = words.exec(text);
      if (!km) continue;
      push({
        kind: SYMPTOM_KEYS.has(key) ? "symptom" : "fact",
        key,
        label: `${label(key)} · ${option.toLowerCase()}`,
        value: option,
        date,
        quote: km[0],
        confidence: 0.8,
        by: "rule",
      });
      break;
    }
  }

  // 6. life events, from the same word lists the confounder tags use
  for (const tag of EVENT_TAGS) {
    const km = tag.words.exec(text);
    if (!km) continue;
    push({
      kind: "event",
      key: tag.tag,
      label: `${tag.tag.replace(/_/g, " ")} · ${km[0]}`,
      value: sentenceAround(text, km.index),
      date,
      quote: km[0],
      confidence: 0.7,
      by: "rule",
    });
  }

  // 7. hearsay. "I heard sardines lower triglycerides" is a sentence about the
  // world, so nothing in it may be written about the person: every chip whose
  // words sit inside the claim's own sentence is dropped, and the claim goes to
  // the trends inbox instead.
  const claim = claimFrom(text);
  if (!claim) return out;
  const said = claim.text.toLowerCase();
  const kept = out.filter(
    (c) => !c.quote || !said.includes(c.quote.toLowerCase()),
  );
  kept.push({
    kind: "claim",
    key: `claim:${claim.intervention
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")}`,
    label: claimLabel(claim),
    value: claim,
    date,
    quote: claim.text,
    confidence: 0.7,
    by: "rule",
  });
  return kept;
}

/** The sentence a match sits in, so a life event keeps its own words. */
function sentenceAround(text: string, at: number): string {
  const start = Math.max(
    0,
    ...[". ", "! ", "? ", "\n"].map((s) => text.lastIndexOf(s, at) + 1),
  );
  const ends = [". ", "! ", "? ", "\n"]
    .map((s) => text.indexOf(s, at))
    .filter((i) => i > -1);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end).trim();
}

/* ── the ontology layer ───────────────────────────────────────────────── */

/** Below this a trigram match is a coincidence, not a finding. */
export const PHENOTYPE_FLOOR = 0.6;

/**
 * The phrases the rules did not know, against HPO.
 *
 * Pure over a term list, so the whole thing is testable with a fixed handful
 * of terms; `understand` is what goes to Postgres for them. MONDO is excluded
 * on purpose: a person describing what they feel is naming a finding, and
 * naming a disease is what the ask box is for.
 */
export function phenotypeChips(
  text: string,
  terms: RankedTerm[],
  today: string,
  date = today,
): Chip[] {
  const seen = new Set<string>();
  const out: Chip[] = [];
  for (const term of terms) {
    if (term.ontology !== "HP") continue;
    if (term.score < PHENOTYPE_FLOOR) continue;
    if (seen.has(term.id)) continue;
    seen.add(term.id);
    out.push({
      kind: "phenotype",
      key: term.id,
      label: `${term.name} · a finding the engine reads`,
      value: "present",
      date,
      quote: term.via ?? term.name,
      confidence: Math.min(1, term.score),
      by: "rule",
    });
  }
  return out.slice(0, 2);
}

/* ── the model layer ──────────────────────────────────────────────────── */

/** Words no chip's quote covered, which is the only thing the model sees. */
export function leftover(text: string, chips: Chip[]): string {
  let rest = text;
  for (const chip of chips)
    if (chip.quote)
      rest = rest.replace(
        new RegExp(chip.quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
        " ",
      );
  return rest.replace(/\s+/g, " ").trim();
}

const STOP =
  /^(i|a|an|the|and|but|my|me|is|am|are|was|were|been|be|to|of|in|on|at|for|with|have|has|had|do|does|did|it|its|this|that|so|very|really|just|feel|feeling|felt|think|about|since|today|day|days)$/i;

/** Enough real words left to be worth a model call. */
export const worthModelling = (rest: string): boolean =>
  rest.split(/\s+/).filter((w) => w.length > 2 && !STOP.test(w)).length >= 3;

export const COMPOSE_PROMPT = `You are reading one short note a person wrote about their own health, in a health app they own.

Your only job is to map words onto keys that already exist. You never invent a key, a number or a date.

RULES:
1. Use only keys from the KEYS list below, copied exactly. A word that fits no key produces nothing.
2. Every item must carry \`quote\`: a verbatim substring of the note, copied character for character. An item whose quote is not in the note is thrown away.
3. \`value\` for a fact key must be one of the options listed next to it. For a metric code it is the number only. For a life event it is the person's own sentence. For an HP: id it is always "present".
4. Do not repeat anything in the ALREADY UNDERSTOOD list.
5. \`confidence\` is 0..1: how sure you are that the note says this.
6. Say nothing about causes, diagnoses or what they should do.`;

interface ModelChip {
  kind: "fact" | "reading" | "event" | "phenotype";
  key: string;
  value: string;
  quote: string;
  confidence: number;
}

const LIFE_EVENT_KINDS = EVENT_TAGS.map((t) => t.tag);

function keyList(candidates: RankedTerm[]): string {
  const facts = Object.entries(PROFILE_QUESTIONS)
    .map(
      ([key, q]) =>
        `${key} | fact | ${q.options?.length ? q.options.join(" / ") : "free text"} | ${q.question}`,
    )
    .join("\n");
  const metrics = SELF_METRICS.map(
    (s) => `${s.code} | reading | number in ${s.unit} | ${s.name}`,
  ).join("\n");
  const events = LIFE_EVENT_KINDS.map(
    (k) => `${k} | event | the person's own sentence`,
  ).join("\n");
  const hp = candidates
    .filter((c) => c.ontology === "HP")
    .map((c) => `${c.id} | phenotype | present | ${c.name}`)
    .join("\n");
  return `\n\nKEYS (key | kind | allowed value | what it means):\n${facts}\n${metrics}\n${events}\n${hp}`;
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The model's chips, after the server has checked every one of them.
 *
 * A chip survives only when its key is on the closed list, its value is one of
 * that key's options, and its quote appears in the text verbatim. Anything
 * else is dropped without comment: the model is a mapper here, not a source.
 */
export function verifyModelChips(
  raw: ModelChip[],
  text: string,
  candidates: RankedTerm[],
  date: string,
): Chip[] {
  const hay = normalise(text);
  const hpIds = new Set(
    candidates.filter((c) => c.ontology === "HP").map((c) => c.id),
  );
  const out: Chip[] = [];
  for (const c of raw) {
    if (!c?.quote || !normalise(c.quote) || !hay.includes(normalise(c.quote)))
      continue;
    const confidence = Math.min(1, Math.max(0, Number(c.confidence) || 0.5));

    if (c.kind === "phenotype") {
      if (!hpIds.has(c.key)) continue;
      const name = candidates.find((x) => x.id === c.key)?.name ?? c.key;
      out.push({
        kind: "phenotype",
        key: c.key,
        label: `${name} · a finding the engine reads`,
        value: "present",
        date,
        quote: c.quote,
        confidence,
        by: "model",
      });
      continue;
    }

    if (c.kind === "reading") {
      const metric = SELF_METRICS.find((s) => s.code === c.key);
      const value = Number(String(c.value).replace(",", "."));
      if (!metric || !Number.isFinite(value)) continue;
      if (value < metric.plausible[0] || value > metric.plausible[1]) continue;
      out.push({
        kind: "reading",
        key: metric.code,
        label: `${metric.name} ${value} ${metric.unit}`,
        value,
        unit: metric.unit,
        date,
        quote: c.quote,
        confidence,
        by: "model",
      });
      continue;
    }

    if (c.kind === "event") {
      if (!LIFE_EVENT_KINDS.includes(c.key)) continue;
      out.push({
        kind: "event",
        key: c.key,
        label: `${c.key.replace(/_/g, " ")} · ${c.value}`,
        value: c.value,
        date,
        quote: c.quote,
        confidence,
        by: "model",
      });
      continue;
    }

    const q = PROFILE_QUESTIONS[c.key];
    if (!q) continue;
    if (q.options?.length && !q.options.includes(c.value)) continue;
    out.push({
      kind: SYMPTOM_KEYS.has(c.key) ? "symptom" : "fact",
      key: c.key,
      label: `${label(c.key)} · ${String(c.value).toLowerCase()}`,
      value: c.value,
      date,
      quote: c.quote,
      confidence,
      by: "model",
    });
  }
  return out;
}

/**
 * Rules, then the ontology, then the model on whatever is left.
 *
 * The model layer is skipped when there is no key, when the rules already ate
 * the sentence, or when the call fails: a composer that stops working because
 * OpenRouter is down is not a composer.
 */
export async function understand(
  text: string,
  m: ModelInput,
  opts: { model?: boolean } = {},
): Promise<Chip[]> {
  const today = m.today ?? localDay();
  const chips = understandRules(text, m, today);
  const date = chips[0]?.date ?? whenOf(text, today)?.date ?? today;

  let candidates: RankedTerm[] = [];
  const rest = leftover(text, chips);
  if (rest.length >= 3) {
    candidates = await searchTerms(rest.slice(0, 80)).catch(() => []);
    for (const chip of phenotypeChips(rest, candidates, today, date))
      if (!chips.some((c) => c.key === chip.key)) chips.push(chip);
  }

  const useModel =
    (opts.model ?? true) &&
    !!process.env.OPENROUTER_API_KEY &&
    worthModelling(leftover(text, chips));
  if (!useModel) return chips;

  try {
    const { object } = await generateObject({
      model: model(),
      schema: z.object({
        chips: z.array(
          z.object({
            kind: z.enum(["fact", "reading", "event", "phenotype"]),
            key: z.string(),
            value: z.string(),
            quote: z
              .string()
              .describe("verbatim substring of the note, copied exactly"),
            confidence: z.number(),
          }),
        ),
      }),
      system: COMPOSE_PROMPT + keyList(candidates),
      prompt: `THE NOTE:\n${text.slice(0, 2000)}\n\nALREADY UNDERSTOOD: ${
        chips.map((c) => `${c.key}=${String(c.value)}`).join(", ") || "nothing"
      }`,
    });
    for (const chip of verifyModelChips(
      object.chips as ModelChip[],
      text,
      candidates,
      date,
    ))
      if (!chips.some((c) => c.key === chip.key)) chips.push(chip);
  } catch (e) {
    console.error("[compose] the model layer failed, rules stand:", e);
  }
  return chips;
}

/* ── the follow-up: at most one question back ─────────────────────────── */

export interface Clarifier {
  key: string;
  when: (chips: Chip[], m: ModelInput) => boolean;
}

const has = (chips: Chip[], key: string, value?: string) =>
  chips.some(
    (c) => c.key === key && (value == null || String(c.value) === value),
  );

const answered = (m: ModelInput, key: string) =>
  String(m.profile[key] ?? "").trim() !== "";

/** True when nothing in the post carried a date other than today. */
const undated = (chips: Chip[], m: ModelInput) =>
  chips.every((c) => c.date === m.today);

/**
 * The facts whose meaning depends on one more detail, and where that detail
 * feeds a rule or an edge. In priority order: the first one whose `when` holds
 * is the question asked back.
 */
export const CLARIFIERS: Clarifier[] = [
  {
    // The caffeine edge is gated on this answer, so without it the mechanism
    // cannot be argued either way.
    key: "energy_when",
    when: (chips, m) =>
      has(chips, "sym_energy", "Yes") && !answered(m, "energy_when"),
  },
  {
    // "Over a month" is what turns tiredness into the symptom the rules score;
    // under a month the post is kept and the fact is not written.
    key: "sym_energy_duration",
    when: (chips, m) =>
      has(chips, "sym_energy", "Yes") &&
      !answered(m, "sym_energy_duration") &&
      undated(chips, m),
  },
  {
    key: "sym_weight_amount",
    when: (chips, m) =>
      (has(chips, "sym_weight", "Gained") ||
        has(chips, "sym_weight", "Lost")) &&
      !answered(m, "sym_weight_amount"),
  },
  {
    key: "sleep_apnoea_witnessed",
    when: (chips, m) =>
      chips.some((c) => c.key === "sleep_snoring" && c.value !== "No") &&
      !answered(m, "sleep_apnoea_witnessed"),
  },
  {
    key: "cycle_length_days",
    when: (chips, m) =>
      has(chips, "sym_cycle", "Irregular") && !answered(m, "cycle_length_days"),
  },
  {
    // A home glucose means nothing until it says which meal it is next to.
    key: "glucose_when",
    when: (chips) => has(chips, "glucose"),
  },
  {
    key: "finding_since",
    when: (chips, m) =>
      chips.some((c) => c.kind === "phenotype") && undated(chips, m),
  },
];

const asQuestion = (key: string): FactQuestion | null => {
  const q = PROFILE_QUESTIONS[key];
  return q ? { key, ...q } : null;
};

/** The chips as an overlay, so the engine can be asked "and now?". */
export function applyChips(m: ModelInput, chips: Chip[]): ModelInput {
  const facts: Record<string, unknown> = {};
  const readings: {
    code: string;
    value: number;
    unit?: string;
    date: string;
  }[] = [];
  for (const c of chips) {
    if (c.kind === "reading" && typeof c.value === "number")
      readings.push({
        code: c.key,
        value: c.value,
        unit: c.unit,
        date: c.date,
      });
    else if (c.kind === "phenotype") facts[`hp:${c.key}`] = "present";
    else if (c.kind === "fact" || c.kind === "symptom")
      facts[c.key] = LIST_FACTS.has(c.key) ? [String(c.value)] : c.value;
  }
  return applyOverlay(m, { facts, readings, confounders: {} });
}

/** A belief that moved this many points is a belief this post changed. */
const MOVED = 0.05;

/**
 * Chips the engine understood but will not write yet, by key.
 *
 * "I feel tired" is not `sym_energy = Yes`: that question asks about over a
 * month, and a post written today says nothing about a month. So the chip is
 * shown, kept on the post, and written the moment either the post's own date
 * or the duration clarifier says it has been long enough. Under a month, the
 * post is stored and the symptom is not.
 */
export function heldChips(chips: Chip[], m: ModelInput): Set<string> {
  const held = new Set<string>();
  const monthAgo = addDays(m.today, -30);
  for (const c of chips) {
    if (c.key !== "sym_energy" || c.value !== "Yes") continue;
    const longEnough =
      c.date <= monthAgo ||
      String(m.profile.sym_energy_duration ?? "") === "Over a month";
    if (!longEnough) held.add(c.key);
  }
  return held;
}

/**
 * One question back, or none. Three sources, first hit wins: a clarifier the
 * post itself needs, a conditional edge that is now one answer away, and a
 * question whose information gain touches a conclusion this post actually
 * moved. Nothing else — a post about a bruise must not open the questionnaire.
 */
export function followUp(
  chips: Chip[],
  m: ModelInput,
  catalog: Catalog,
  graph: Graph = CODE_GRAPH,
): FactQuestion | null {
  if (!chips.length) return null;
  const after = applyChips(m, chips);

  for (const c of CLARIFIERS)
    if (c.when(chips, after)) {
      const q = asQuestion(c.key);
      if (q) return q;
    }

  // 2. a conditional edge that touches what the post changed
  const touched = new Set(
    chips.flatMap((c) =>
      c.kind === "reading"
        ? [`metric:${c.key}`]
        : c.kind === "fact" || c.kind === "symptom"
          ? [`fact:${c.key}`]
          : [],
    ),
  );
  // An edge is "near" the post when the post moved one of its endpoints, or
  // when it answered one of the clauses that make the edge apply at all. The
  // second half is the point: answering `energy_when` is what makes the
  // caffeine edge relevant, and `energy_when` is a clause, not a node.
  const answeredKeys = new Set(
    chips
      .filter((c) => c.kind === "fact" || c.kind === "symptom")
      .map((c) => c.key),
  );
  const clauseKeys = (e: (typeof graph.edges)[number]) =>
    [e.when?.fact?.key, ...(e.when?.facts ?? []).map((f) => f.key)].filter(
      (k): k is string => !!k,
    );
  const near = {
    nodes: graph.nodes,
    edges: graph.edges.filter(
      (e) =>
        touched.has(e.from) ||
        touched.has(e.to) ||
        clauseKeys(e).some((k) => answeredKeys.has(k)),
    ),
  };
  const conditional = conditionalAsks(after, near).filter(
    (q) => !answered(after, q.key),
  );
  if (conditional[0]) return conditional[0];

  // 3. a question that moves a conclusion this post moved
  const before = new Map(
    scoreHypotheses(m, { catalog }).map((r) => [r.id, r.score]),
  );
  const movedIds = new Set(
    scoreHypotheses(after, { catalog })
      .filter((r) => Math.abs(r.score - (before.get(r.id) ?? 0)) >= MOVED)
      .map((r) => r.id),
  );
  if (!movedIds.size) return null;

  for (const mv of nextMoves(after, catalog, { max: 6 })) {
    if (mv.kind !== "question" || mv.gain < QUIET_GAIN) continue;
    if (!mv.moves.some((x) => movedIds.has(x.id))) continue;
    const key = mv.featureId.replace(/^fact:/, "");
    if (answered(after, key)) continue;
    const q = asQuestion(key);
    if (q) return q;
  }
  return null;
}

/* ── the reply: computed first, then one paragraph with memory ────────── */

export interface ReplyPack {
  today: string;
  /** what was written, with the date each fact starts holding */
  wrote: { label: string; date: string; quote: string }[];
  /** the conclusions this post moved, in points */
  moved: { id: string; from: number; to: number; points: number }[];
  /** the graph edges that came alive because of this post */
  edges: {
    id: string;
    mechanism: string;
    grade: Grade;
    source: string;
    reasons: string[];
  }[];
  suggestion: { text: string; grade: Grade; basis: string } | null;
  memory: {
    posts: { date: string; text: string; chips: number }[];
    facts: { key: string; value: string; said: string }[];
  };
  followUp: { question: string; answer: string } | null;
}

const pct = (p: number) => Math.round(p * 100);

/**
 * A suggestion for a behaviour edge, out of the edge's own `when`.
 *
 * "Coffee after 15:00" gated on `coffee_last_hour above 15` is already a
 * sentence: move it before 15:00. Nothing is written per edge, so an edge a
 * research run adds tomorrow gets the same suggestion for free.
 */
export function edgeSuggestion(
  edge: GraphEdge,
  nodeName: string,
): string | null {
  const above = edge.when?.fact?.above;
  if (!edge.from.startsWith("behavior:") || above == null) return null;
  return `Move your ${nodeName.toLowerCase().replace(/ after \d+:?\d*$/, "")} before ${pad2(Math.floor(above))}:00 for two weeks, then post how it went.`;
}

/**
 * Everything the reply is allowed to say, computed by the engine.
 *
 * `before` is the belief map from before the post was written; the caller has
 * it because it scored the person to decide the follow-up. Without it the
 * moved list is empty and the reply is shorter, which is the right failure.
 */
export async function replyPack(
  userId: string,
  post: Pick<CheckinPost, "id" | "text" | "chips" | "followUp">,
  before?: Record<string, number>,
): Promise<ReplyPack> {
  const db = getDb();
  const [m, catalog, graph] = await Promise.all([
    buildModelInput(userId),
    catalogFor(userId),
    loadGraph(),
  ]);
  const chips = (post.chips ?? []) as unknown as Chip[];

  const rows = scoreHypotheses(m, { catalog });
  const moved = before
    ? rows
        .map((r) => ({
          id: r.id,
          from: before[r.id] ?? 0,
          to: r.score,
          points: pct(r.score) - pct(before[r.id] ?? 0),
        }))
        .filter((r) => Math.abs(r.points) >= pct(MOVED))
        .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
        .slice(0, 3)
    : [];

  // The edges that are live now and were not before this post's chips.
  const chipKeys = new Set(chips.map((c) => c.key));
  const withoutPost: ModelInput = {
    ...m,
    profile: Object.fromEntries(
      Object.entries(m.profile).filter(
        ([k]) => !chipKeys.has(k) && !chipKeys.has(k.replace(/^hp:/, "")),
      ),
    ),
  };
  const wasActive = new Set(
    computeGraphState(withoutPost, { graph }).activeEdges.map((e) => e.id),
  );
  const nowActive = computeGraphState(m, { graph }).activeEdges;
  // Only the edges this post switched on. With no fallback: an edge that was
  // already live says nothing about what was just written, and a mechanism
  // sentence about something else is worse than no mechanism sentence.
  const edges = nowActive.filter((e) => !wasActive.has(e.id)).slice(0, 3);

  const nodeName = (id: string) =>
    graph.nodes.find((n) => n.id === id)?.name ?? id;

  const suggestion = await bestSuggestion(
    moved.map((x) => x.id),
    edges,
    nodeName,
  );

  const posts = await db
    .select()
    .from(checkinPosts)
    .where(eq(checkinPosts.userId, userId))
    .orderBy(desc(checkinPosts.createdAt))
    .limit(6);

  const touched = new Set<string>([
    ...chips.map((c) => c.key),
    ...edges.flatMap((e) =>
      [e.when?.fact?.key, ...(e.when?.facts ?? []).map((f) => f.key)].filter(
        (k): k is string => !!k,
      ),
    ),
  ]);
  const history = await db
    .select()
    .from(profileFactHistory)
    .where(eq(profileFactHistory.userId, userId));
  const facts = history
    .filter((h) => h.validTo == null && touched.has(h.key))
    .map((h) => ({
      key: h.key,
      value: Array.isArray(h.value)
        ? h.value.join(", ")
        : String(h.value ?? ""),
      said: h.validFrom,
    }));

  return {
    today: m.today,
    wrote: chips.map((c) => ({
      label: c.label,
      date: c.date,
      quote: c.quote,
    })),
    moved,
    edges: edges.map((e) => ({
      id: e.id,
      mechanism: e.mechanism,
      grade: gradeOfEdge(e),
      source: e.evidence[0]?.title ?? e.source,
      reasons: e.whenReasons ?? [],
    })),
    suggestion,
    memory: {
      posts: posts
        .filter((p) => p.id !== post.id)
        .slice(0, 5)
        .map((p) => ({
          date: (p.createdAt ?? new Date()).toISOString().slice(0, 10),
          text: p.text,
          chips: (p.chips ?? []).length,
        })),
      facts,
    },
    followUp: post.followUp?.answer
      ? { question: post.followUp.question, answer: post.followUp.answer }
      : null,
  };
}

/** The highest-grade intervention for a moved condition, else the edge's own. */
async function bestSuggestion(
  conditionIds: string[],
  edges: ActiveEdge[],
  nodeName: (id: string) => string,
): Promise<ReplyPack["suggestion"]> {
  const ORDER: Grade[] = ["A", "B", "C", "D", "E"];
  if (conditionIds.length) {
    const rows = (
      await Promise.all(
        conditionIds.map((id) =>
          getDb()
            .select()
            .from(hkbInterventions)
            .where(
              and(
                eq(hkbInterventions.conditionId, id),
                eq(hkbInterventions.status, "accepted"),
              ),
            ),
        ),
      )
    ).flat();
    const best = rows.sort(
      (a, b) =>
        ORDER.indexOf(a.grade as Grade) - ORDER.indexOf(b.grade as Grade),
    )[0];
    if (best)
      return {
        text: `${best.name}${best.dose ? `, ${best.dose}` : ""}${best.duration ? `, for ${best.duration}` : ""}`,
        grade: best.grade as Grade,
        basis: "science",
      };
  }
  for (const edge of edges) {
    const text = edgeSuggestion(edge, nodeName(edge.from));
    if (text) return { text, grade: gradeOfEdge(edge), basis: edge.basis };
  }
  return null;
}

export const REPLY_SYSTEM = `You are writing the reply to one check-in in a health app the person owns.

The engine has already decided everything. You are given its pack as JSON and you write at most three sentences, in this order:
1. Acknowledge what they wrote, in their own words, using the quotes in "wrote".
2. One mechanism sentence, from edges[0].mechanism, cut down to plain English.
3. One suggestion: exactly the one in "suggestion", with its grade in brackets.

RULES:
- Use only the numbers, names, dates and words that appear in the pack. Never add a number.
- Never name a condition that is not in "moved".
- Never ask a question. The app asks its own.
- No greeting, no sign-off, no hedging boilerplate, no advice beyond "suggestion".
- When "suggestion" is null, stop after the mechanism sentence.
- Second person, plain English, under 60 words in total.`;

/** The pack as three plain lines: what the reply says with the model off. */
export function plainReply(pack: ReplyPack): string {
  const lines: string[] = [];
  if (pack.wrote.length)
    lines.push(
      `Written down: ${pack.wrote.map((w) => `${w.label} (from ${w.date})`).join(", ")}.`,
    );
  if (pack.edges[0]) lines.push(pack.edges[0].mechanism);
  if (pack.suggestion)
    lines.push(`${pack.suggestion.text} [${pack.suggestion.grade}]`);
  return lines.join("\n");
}

/**
 * The paragraph. One model call over a pack it cannot add to; anything that
 * goes wrong falls back to the three plain lines, which say the same thing in
 * a worse voice.
 */
export async function writeReply(pack: ReplyPack): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) return plainReply(pack);
  try {
    const { text } = await generateText({
      model: model(),
      system: REPLY_SYSTEM,
      prompt: `THE PACK:\n${JSON.stringify(pack, null, 1)}`,
    });
    return text.trim() || plainReply(pack);
  } catch (e) {
    console.error("[compose] the reply model failed, plain lines stand:", e);
    return plainReply(pack);
  }
}

/** Both scoring passes the composer needs, so the route runs one function. */
export const beliefsNow = (m: ModelInput, catalog: Catalog) =>
  Object.fromEntries(
    scoreHypotheses(m, { catalog }).map((r) => [r.id, r.score]),
  );
