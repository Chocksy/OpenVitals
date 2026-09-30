/**
 * Phase 44A: old answers count less.
 *
 * A "No" to cold hands given a year ago says little about today, so the
 * scorer pulls each fact's log-odds by a weight that halves every half-life.
 * Sex and family history never fade. The class of a key sets its half-life,
 * and "No" (the rule's `lrNeg` fired) can fade faster than "Yes" (`lr`
 * fired): a symptom that was there tends to linger, one that was absent can
 * start any week.
 *
 * Pure. No database, no clock.
 */
import { SYMPTOMS } from "./symptoms";
import { PROFILE_QUESTIONS } from "./vectors";

export type FadeClass = "fixed" | "symptom" | "habit" | "followup";

/** Days until an answer counts half; `null` = never fades. */
export const HALF_LIFE: Record<
  FadeClass,
  { no: number | null; yes: number | null }
> = {
  fixed: { no: null, yes: null }, // does not change, so it never fades
  // ponytail: judgment, not papers. Upgrade to per-condition half-lives from natural-history studies once the KB carries them.
  symptom: { no: 90, yes: 180 },
  // ponytail: judgment, not papers. Upgrade to per-condition half-lives from natural-history studies once the KB carries them.
  habit: { no: 180, yes: 180 },
  // ponytail: judgment, not papers. Upgrade to per-condition half-lives from natural-history studies once the KB carries them.
  followup: { no: 60, yes: 60 },
};

/**
 * The explicit class of each question key, reviewed by the owner on
 * 2026-09-30. A key missing here falls back to `revisitDays === 0` → fixed;
 * the test fails on any other key without a class.
 */
const CLASS: Record<string, FadeClass> = {
  ...Object.fromEntries(
    [
      "sex",
      "birth_year",
      "country",
      "ancestry",
      "height_cm",
      "cycle_phase_at_last_draw",
      "glucose_when",
      "finding_since",
      "setup_goal",
      "family_history",
      "conditions",
      "screening_dates",
      "cac_score",
      "dexa",
    ].map((k) => [k, "fixed" as const]),
  ),
  ...Object.fromEntries(
    [
      ...SYMPTOMS.map((s) => s.key),
      "sleep_snoring",
      "sleep_apnoea_witnessed",
      "energy_when",
      "sym_energy_duration",
      "sym_weight_amount",
      "cycle_length_days",
    ].map((k) => [k, "symptom" as const]),
  ),
  ...Object.fromEntries(
    [
      "smoking",
      "exercise_days_week",
      "diet",
      "coffee_last_hour",
      "last_meal_hour",
      "bedtime_hour",
      "dairy_daily",
      "medications",
      "supplements",
      "waist_cm",
      "bp_home",
      "resting_hr",
      "grip_kg",
      "neck_cm",
      "menopause_status",
      // A habit though it lives in SYMPTOMS; listed after them so it wins.
      "sym_alcohol",
    ].map((k) => [k, "habit" as const]),
  ),
};

/** The class of a fact key, or `null` for a key nobody classed. */
export function fadeClassOf(key: string): FadeClass | null {
  // Phase 44B follow-ups carry the plan item id after the colon.
  if (key.startsWith("followup_")) return "followup";
  const cls = CLASS[key];
  if (cls) return cls;
  if (PROFILE_QUESTIONS[key]?.revisitDays === 0) return "fixed";
  return null;
}

/** Days until the answer counts half; `null` = never fades or unknown key. */
export function halfLifeOf(key: string, hit: boolean): number | null {
  const cls = fadeClassOf(key);
  if (!cls) return null;
  return hit ? HALF_LIFE[cls].yes : HALF_LIFE[cls].no;
}

/** How much of the fact still counts: 1 = full, 0.5 at one half-life. */
export function fadeWeight(key: string, hit: boolean, ageDays: number): number {
  const h = halfLifeOf(key, hit);
  return h == null || ageDays <= 0 ? 1 : 0.5 ** (ageDays / h);
}

/** The weight as the cards say it: "counting half". */
export function fadeWords(weight: number): "almost fully" | "half" | "little" {
  if (weight >= 0.75) return "almost fully";
  if (weight >= 0.35) return "half";
  return "little";
}

const DAY_MS = 86_400_000;

/** Whole days from one YYYY-MM-DD to another, floored, never below 0. */
export const daysBetween = (from: string, to: string): number =>
  Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / DAY_MS));
