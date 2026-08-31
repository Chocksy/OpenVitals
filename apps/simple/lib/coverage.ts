/**
 * The job. It answers three questions with no LLM anywhere in sight:
 *
 *  - what do we know about this person (`buildModelInput`),
 *  - which vectors are current, stale, never measured or not applicable
 *    (`coverage`),
 *  - what should be escalated (`fireRules`) and asked (`profileQuestions`).
 *
 * Everything except `buildModelInput` and `queueProfileQuestions` is pure, so
 * the whole model is testable without a database.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  getDb,
  profileFacts,
  readings,
  reviewItems,
  type ReviewSubject,
} from "@/db";
import { toCountryCode } from "./countries";
import { CYCLE_FACT, profileAt, writeFact } from "./facts";
import { localDay } from "./daily";
import { getMetricRows } from "./data";
import { deriveAll, egfr, slopePerYear, type Slope } from "./derived";
import { applyPatternTargets } from "./patterns";
import { statusOf, type Status } from "./status";
import {
  LIST_FACTS,
  PROFILE_QUESTIONS,
  RULES,
  DEFAULT_REF_HIGH,
  SEX_RANGES,
  VECTORS,
  type Rule,
  type Sex,
  type Vector,
} from "./vectors";

export interface LatestValue {
  value: number | null;
  unit: string | null;
  date: string;
  status: Status;
  optimalLow: number | null;
  optimalHigh: number | null;
  refLow: number | null;
  refHigh: number | null;
  /** The reading before the latest one, for "rising" rules and deltas. */
  prev?: number | null;
  /** Set when a matched pattern moved the optimal band. */
  note?: string;
  /**
   * Least squares through the last five years of this marker, when there are
   * at least three readings in the window. Phase 17: a direction is evidence
   * in its own right, and "TSH rising 0.8 a year" is a different fact from
   * "TSH is 3.1".
   */
  slope?: Slope;
}

export interface ModelInput {
  today: string;
  /** Profile facts by key. */
  profile: Record<string, unknown>;
  sex?: Sex;
  age?: number;
  latest: Record<string, LatestValue>;
  derived: {
    egfr?: number;
    homaIr?: number;
    tgHdl?: number;
    nonHdl?: number;
    fib4?: number;
    phenoAge?: number;
  };
  /**
   * The direction a derived number is moving, keyed the same way `derived` is.
   * Only eGFR is filled today, because KDIGO defines rapid progression on the
   * eGFR slope and nothing else here has a published slope threshold.
   */
  slopes?: Partial<Record<keyof ModelInput["derived"], Slope>>;
}

export interface CoverageRow {
  vector: Vector;
  state: "current" | "stale" | "never" | "n/a";
  lastDate?: string;
  detail?: string;
}

const DAY = 86_400_000;

const daysBetweenDates = (from: string, to: string) =>
  Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY);

/** "male"/"female" from whatever the answer was stored as. */
export function toSex(value: unknown): Sex | undefined {
  const s = String(value ?? "").toLowerCase();
  if (s.startsWith("m")) return "male";
  if (s.startsWith("f")) return "female";
  return undefined;
}

/** Age in whole years from the birth-year fact. */
export function toAge(value: unknown, today: string): number | undefined {
  const year = Number(String(value ?? "").match(/\d{4}/)?.[0]);
  if (!Number.isFinite(year)) return undefined;
  const age = Number(today.slice(0, 4)) - year;
  return age >= 0 && age < 130 ? age : undefined;
}

/** A band this user decided on, or had decided for them, by metric code. */
export type OptimalOverrides = Map<string, [number | null, number | null]>;

/**
 * The optimal band for a code: the user's own override first, then the
 * sex-specific default, then the shared catalog columns. Never touches the lab
 * range.
 */
/**
 * The reference top for a marker: what the lab printed, else the marker's own
 * default cut-off. Without it `statusOf` calls a positive serology "gray" and
 * every rule that reads a status becomes unanswerable.
 */
export const refHighFor = (
  code: string,
  printed: number | null | undefined,
): number | null => printed ?? DEFAULT_REF_HIGH[code] ?? null;

export function optimalFor(
  code: string,
  sex: Sex | undefined,
  fallback: [number | null, number | null],
  overrides?: OptimalOverrides,
): [number | null, number | null] {
  const mine = overrides?.get(code);
  if (mine) return mine;
  const bySex = sex ? SEX_RANGES[code]?.[sex] : undefined;
  return bySex ?? fallback;
}

/**
 * `getMetricRows` plus `profile_facts`, folded into one plain object.
 *
 * `asOf` runs the whole thing as it stood on a day: the facts come out of
 * `profile_fact_history` at that date instead of out of the current view, so
 * the ledger can say why a conclusion looked different then.
 */
export async function buildModelInput(
  userId: string,
  asOf?: string,
): Promise<ModelInput> {
  const today = asOf ?? localDay();
  const [rows, facts] = await Promise.all([
    getMetricRows(userId),
    asOf
      ? profileAt(userId, asOf)
      : getDb()
          .select()
          .from(profileFacts)
          .where(eq(profileFacts.userId, userId)),
  ]);

  const profile: Record<string, unknown> = Array.isArray(facts)
    ? Object.fromEntries(facts.map((f) => [f.key, f.value]))
    : facts;

  const sex = toSex(profile.sex);
  const age = toAge(profile.birth_year, today);

  const latest: Record<string, LatestValue> = {};
  for (const m of rows) {
    const withValue = m.rows.filter((r) => r.value != null);
    // `getMetricRows` already resolved override -> sex -> catalog.
    const [optimalLow, optimalHigh] = [m.optimalLow, m.optimalHigh];
    const refHigh = refHighFor(m.code, m.latest.refHigh);
    latest[m.code] = {
      value: m.latest.value,
      unit: m.latest.unit ?? m.unit,
      date: m.latest.observedAt,
      status: statusOf({
        value: m.latest.value,
        refLow: m.latest.refLow,
        refHigh,
        optimalLow,
        optimalHigh,
      }),
      optimalLow,
      optimalHigh,
      refLow: m.latest.refLow,
      refHigh,
      prev: withValue[withValue.length - 2]?.value ?? null,
      slope: slopePerYear(m.points, today),
    };
  }

  const derived = deriveAll(latest, sex, age);

  // eGFR has a published slope threshold and no reading of its own on most
  // panels, so it is refitted from the creatinine series. ponytail: the age
  // term uses today's age for every point; over a five-year window that costs
  // about 0.03 mL/min/1.73m2 per year, well inside the -3 threshold.
  const creatinine = rows.find((m) => m.code === "creatinine");
  const egfrSlope = creatinine
    ? slopePerYear(
        creatinine.points.flatMap((p) => {
          const value = egfr({ creatinine: p.value, age, sex });
          return value == null ? [] : [{ date: p.date, value }];
        }),
        today,
      )
    : undefined;

  // Patterns can move an optimal band (Hashimoto's ferritin floor, the
  // suspended LDL goal in LMHR), so the ranges every caller sees are already
  // the ones the pattern says apply.
  return applyPatternTargets({
    today,
    profile,
    sex,
    age,
    latest,
    derived,
    ...(egfrSlope ? { slopes: { egfr: egfrSlope } } : {}),
  });
}

/**
 * Does this vector apply to this person? `"unknown"` while sex or age are
 * still missing, so the page can say "answer sex and age first" instead of
 * pretending the vector does not exist.
 */
function applicability(
  vector: Vector,
  input: ModelInput,
): "yes" | "no" | "unknown" {
  const gate = vector.appliesTo;
  if (!gate) return "yes";
  if (gate.sex) {
    if (!input.sex) return "unknown";
    if (input.sex !== gate.sex) return "no";
  }
  if (gate.minAge != null || gate.maxAge != null) {
    if (input.age == null) return "unknown";
    if (gate.minAge != null && input.age < gate.minAge) return "no";
    if (gate.maxAge != null && input.age > gate.maxAge) return "no";
  }
  return "yes";
}

const hasFact = (input: ModelInput, key: string) => {
  const v = input.profile[key];
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== "";
};

/** One row per vector: what we have, how old it is, or that we never had it. */
export function coverage(input: ModelInput): CoverageRow[] {
  return VECTORS.map((vector): CoverageRow => {
    const applies = applicability(vector, input);
    if (applies === "unknown")
      return { vector, state: "n/a", detail: "answer sex and age first" };
    if (applies === "no")
      return { vector, state: "n/a", detail: "does not apply to you" };

    if (vector.fact) {
      return hasFact(input, vector.fact)
        ? { vector, state: "current", detail: "answered" }
        : { vector, state: "never", detail: "never answered" };
    }

    const dates = (vector.codes ?? [])
      .map((code) => input.latest[code]?.date)
      .filter((d): d is string => !!d)
      .sort();
    const lastDate = dates[dates.length - 1];
    if (!lastDate) return { vector, state: "never", detail: "never measured" };

    const age = daysBetweenDates(lastDate, input.today);
    return age > vector.staleDays
      ? {
          vector,
          state: "stale",
          lastDate,
          detail: `last ${lastDate.slice(0, 7)}`,
        }
      : { vector, state: "current", lastDate, detail: `last ${lastDate}` };
  });
}

/** Every escalation rule whose condition holds right now. */
export function fireRules(input: ModelInput): Rule[] {
  return RULES.filter((r) => {
    try {
      return r.when(input);
    } catch {
      return false;
    }
  });
}

export interface FactQuestion {
  key: string;
  question: string;
  options?: string[];
  free?: boolean;
}

/**
 * The tier-0 facts we still do not have, in priority order (the order of
 * `VECTORS`), with the ones that do not apply to this person dropped. Sex and
 * birth year sit at the top of the list, so they are always asked first.
 */
export function profileQuestions(input: ModelInput): FactQuestion[] {
  const out: FactQuestion[] = [];
  for (const vector of VECTORS) {
    if (vector.tier !== 0 || !vector.fact) continue;
    if (applicability(vector, input) !== "yes") continue;
    if (hasFact(input, vector.fact)) continue;
    const q = PROFILE_QUESTIONS[vector.fact];
    if (!q) continue;
    out.push({ key: vector.fact, ...q });
  }
  return out;
}

const MAX_OPEN_QUESTIONS = 3;

/**
 * Questions that only mean something together. Waist without height is not a
 * ratio, so asking one queues the other whatever the room limit says.
 */
const PAIRS: Record<string, string> = {
  waist_cm: "height_cm",
  height_cm: "waist_cm",
  sym_phq2_interest: "sym_phq2_down",
  sym_phq2_down: "sym_phq2_interest",
};

/**
 * Queue up to three open `profile_question` items, deduped on `subject.key`
 * exactly the way the curator dedupes its own questions: a key that was ever
 * asked is never asked twice.
 */
export async function queueFactQuestions(
  userId: string,
  asks: FactQuestion[],
): Promise<number> {
  if (!asks.length) return 0;
  const db = getDb();
  const existing = await db
    .select({ subject: reviewItems.subject, status: reviewItems.status })
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(reviewItems.kind, "profile_question"),
      ),
    );

  const asked = new Set(existing.map((i) => i.subject?.key ?? ""));
  const open = existing.filter((i) => i.status === "open").length;
  let room = MAX_OPEN_QUESTIONS - open;
  let queued = 0;

  const write = async (ask: FactQuestion) => {
    const subject: ReviewSubject = {
      key: ask.key,
      factKey: ask.key,
      options: ask.options,
      free: ask.options?.length ? undefined : true,
    };
    await db.insert(reviewItems).values({
      userId,
      kind: "profile_question",
      subject,
      question: ask.question,
      options: ask.options ?? [],
    });
    asked.add(ask.key);
    queued++;
  };

  for (const ask of asks) {
    if (room <= 0) break;
    if (asked.has(ask.key)) continue;
    await write(ask);
    room--;
    const partner = asks.find(
      (a) => a.key === PAIRS[ask.key] && !asked.has(a.key),
    );
    if (partner) await write(partner);
  }
  return queued;
}

/** The curator calls this at the end of every run; so does /plan on first load. */
export async function queueProfileQuestions(userId: string): Promise<number> {
  const input = await buildModelInput(userId);
  return queueFactQuestions(userId, profileQuestions(input));
}

const split = (s: string, on: RegExp) =>
  s
    .split(on)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * A list answer into its items. Newlines and semicolons always separate items.
 * Commas only do when the answer looks like a list rather than prose: no
 * sentence break in it and short. Anything else stays whole, because people
 * paste paragraphs into these boxes and a paragraph is one fact, not five.
 */
export function splitListFact(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parts = split(trimmed, /[\n;]+/);
  if (parts.length > 1) return parts;
  if (!trimmed.includes(". ") && trimmed.length < 120)
    return split(trimmed, /,/);
  return [trimmed];
}

/**
 * Write one answered fact. List facts become string arrays, and the country
 * answer is normalised to its ISO-3166 alpha-2 code on the way in, so every
 * reader downstream compares two-letter codes and nothing else.
 */
export async function saveFact(
  userId: string,
  key: string,
  raw: string,
  edit: { kind?: "changed" | "corrected"; date?: string; note?: string } = {},
): Promise<void> {
  const trimmed = raw.trim();
  const value: unknown = LIST_FACTS.has(key)
    ? splitListFact(trimmed)
    : key === "sex"
      ? trimmed.toLowerCase()
      : key === "country"
        ? (toCountryCode(trimmed) ?? trimmed)
        : trimmed;

  // The cycle answer is about one blood draw, so its period starts on the day
  // of that draw and not on the day it was typed in.
  const date =
    edit.date ??
    (key === CYCLE_FACT ? await lastDrawDate(userId) : undefined) ??
    undefined;

  await writeFact(userId, key, value, { ...edit, date, source: "user" });
}

/** The newest observation this person has, whatever the marker. */
async function lastDrawDate(userId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ observedAt: readings.observedAt })
    .from(readings)
    .where(eq(readings.userId, userId))
    .orderBy(desc(readings.observedAt))
    .limit(1);
  return row?.observedAt;
}
