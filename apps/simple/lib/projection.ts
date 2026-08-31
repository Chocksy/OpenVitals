/**
 * Where a marker should land by the next draw, and whether it did.
 *
 * The engine already knows what has been adopted (`protocol_items`), how often
 * it is actually done (`habit_logs`), and what the papers say each of those
 * things does to which marker (`hkb_interventions`). A projection is those
 * three multiplied together and written down *before* the draw, so the result
 * can be judged rather than explained afterwards.
 *
 * The arithmetic, all of it:
 *
 *  - each intervention contributes its published effect in the marker's own
 *    unit, shrunk by grade (A and B in full, C halved, D and E excluded),
 *    scaled by adherence and by how much of its own duration the horizon
 *    covers;
 *  - the contributions add up, because that is what the trials measured
 *    separately and nobody has measured the combination;
 *  - the total is bounded by `MAX_CHANGE`, what a marker can physiologically
 *    move in twelve weeks;
 *  - the band comes from the grades: a C-graded contribution is allowed to be
 *    seventy per cent wrong, an A one thirty.
 *
 * Pure. No database, no clock, no network.
 */
import type { Grade } from "./hypotheses";

export interface EffectSource {
  /** `hkb_interventions.id` */
  id: string;
  name: string;
  /** `metric:hba1c`, `derived:homaIr` */
  outcomeFeatureId: string;
  /** the effect as the paper prints it, e.g. "-0.47 % (95% CI -0.63 to -0.31)" */
  effect: string | null;
  direction: "up" | "down" | "none";
  grade: Grade;
  /** the paper's own duration, e.g. "12 weeks" */
  duration: string | null;
  source: string;
}

export interface AdoptedAction {
  itemId: string;
  text: string;
  /** the day it was adopted, so the projection starts there */
  adoptedAt: string;
  /** 0..1, from `habit_logs`; 1 when nothing is logged yet */
  adherence?: number;
  /** null when the intervention table has nothing for this pair */
  effect: EffectSource | null;
}

export interface Projection {
  code: string;
  unit: string;
  from: number;
  fromDate: string;
  horizonWeeks: number;
  expected: number;
  low: number;
  high: number;
  contributions: {
    intervention: string;
    delta: number;
    grade: Grade;
    source: string;
    adherence?: number;
  }[];
  assumptions: string[];
  retestAt: string;
  /** pairs with no effect size on file, so the research job can be queued */
  gaps: string[];
}

export type Verdict = "better" | "as_expected" | "worse" | "unmeasured";

/** A and B count in full, C is halved, D and E never project. */
export const GRADE_WEIGHT: Record<Grade, number> = {
  A: 1,
  B: 1,
  C: 0.5,
  D: 0,
  E: 0,
};

/** How wrong a contribution of each grade is allowed to be, as a fraction. */
export const GRADE_SPREAD: Record<Grade, number> = {
  A: 0.3,
  B: 0.4,
  C: 0.7,
  D: 1,
  E: 1,
};

/**
 * The most a marker moves in twelve weeks of anything short of surgery, in its
 * own unit. A projection is clamped to it, because three interventions that
 * each claim half a point of HbA1c do not add up to a point and a half.
 */
export const MAX_CHANGE: Record<string, number> = {
  // Lean 2018 Lancet (DiRECT): the whole first year of a 15 kg weight-loss
  // programme moved HbA1c about 1 %; twelve weeks of anything else moves less.
  hba1c: 1,
  // Mensink 2003 Am J Clin Nutr (meta-analysis of 60 diet trials): the largest
  // achievable diet effect on LDL is about a quarter of it.
  ldl_cholesterol: 50,
  triglycerides: 80,
  hdl_cholesterol: 12,
  apolipoprotein_b: 40,
  // Camaschella 2015 NEJM: oral iron repletion moves ferritin tens of ng/mL a
  // quarter, not hundreds.
  ferritin: 50,
  // Heaney 2003 Am J Clin Nutr dose-response: 1000 IU/day for twelve weeks
  // raises 25-OH-D by roughly 10 ng/mL; 25 is the ceiling for sane doses.
  vitamin_d: 25,
  // Biondi 2019 Endocr Rev: outside levothyroxine, twelve weeks moves TSH little.
  tsh: 1.5,
  insulin: 8,
  homaIr: 2,
  glucose: 25,
  hs_crp: 2,
  alt: 25,
  ggt: 30,
  uric_acid: 1.5,
  // Appel 1997 NEJM (DASH) and the TOHP trials: diet and salt together move
  // systolic pressure about 11 mmHg at most.
  bp_systolic: 12,
  weight_kg: 8,
};

/**
 * When a marker can be judged again, in weeks. Drawing an HbA1c six weeks
 * after a change measures the six weeks before the change as much as the six
 * after it.
 */
export const RETEST_WEEKS: Record<string, number> = {
  // ADA Standards of Care: HbA1c reflects about three months of glycaemia.
  hba1c: 12,
  // WHO/BSG iron guidance: ferritin is re-checked at three months of treatment.
  ferritin: 12,
  transferrin_saturation: 12,
  // ESC/EAS 2019: lipids are re-measured 4 to 12 weeks after a change.
  ldl_cholesterol: 8,
  hdl_cholesterol: 8,
  triglycerides: 8,
  apolipoprotein_b: 8,
  total_cholesterol: 8,
  // ATA 2014: thyroid function is re-checked six weeks after a change.
  tsh: 6,
  free_t4: 6,
  insulin: 6,
  homaIr: 6,
  glucose: 6,
  // Pearson 2003 Circulation: hs-CRP is repeated after two weeks to average.
  hs_crp: 4,
  alt: 12,
  ggt: 12,
  vitamin_d: 12,
  uric_acid: 8,
  bp_systolic: 4,
  weight_kg: 4,
};

/** The assay noise a band is never narrower than, in the marker's unit. */
const FLOOR: Record<string, number> = {
  hba1c: 0.1,
  ldl_cholesterol: 5,
  ferritin: 5,
  vitamin_d: 3,
  tsh: 0.2,
  insulin: 1,
  glucose: 4,
  hs_crp: 0.3,
  alt: 3,
  bp_systolic: 3,
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export const addWeeks = (day: string, weeks: number): string =>
  new Date(new Date(day).getTime() + weeks * 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

export const weeksBetween = (from: string, to: string): number =>
  (new Date(to).getTime() - new Date(from).getTime()) / (7 * 86_400_000);

/** The number of weeks a duration string names, or null. */
export function durationWeeks(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const m = /([\d.]+)\s*(day|week|month|year)/i.exec(duration);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (!Number.isFinite(n)) return null;
  return unit === "day"
    ? n / 7
    : unit === "week"
      ? n
      : unit === "month"
        ? n * 4.35
        : n * 52;
}

/**
 * The signed change the paper reports, in the marker's own unit.
 *
 * `effect` is free text written by the extractor from the abstract
 * ("MD -0.50, 95% CI -0.73 to -0.26", "~0.3-0.5%", "-35.25 U/L"), so the first
 * number in it is the point estimate and `direction` supplies the sign when
 * the paper printed it without one. A percentage that is a relative change
 * ("12 % lower") cannot be read in the marker's unit and returns null.
 */
export function parseEffect(
  effect: string | null | undefined,
  direction: EffectSource["direction"],
): number | null {
  if (!effect || direction === "none") return null;
  const m = /(-?\d+(?:\.\d+)?)/.exec(effect.replace(/95\s*%\s*ci/i, ""));
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value === 0) return null;
  const size = Math.abs(value);
  return direction === "down" ? -size : size;
}

/**
 * Which way is good, for the markers a projection is ever made about.
 *
 * The optimal band alone cannot say: HbA1c has a band at both ends (4.8-5.4)
 * and yet 5.2 is better than 5.9, while ferritin has a band at both ends and
 * 20 is worse than 90. These are the markers where a person is trying to move
 * a number, and the direction they are trying to move it in.
 */
export const BETTER_LOW = new Set([
  "hba1c",
  "glucose",
  "insulin",
  "homaIr",
  "ldl_cholesterol",
  "non_hdl_cholesterol",
  "apolipoprotein_b",
  "total_cholesterol",
  "triglycerides",
  "alt",
  "ast",
  "ggt",
  "hs_crp",
  "uric_acid",
  "bp_systolic",
  "weight_kg",
  "lp_a",
]);

export const BETTER_HIGH = new Set([
  "hdl_cholesterol",
  "vitamin_d",
  "ferritin",
  "vitamin_b12",
  "vo2max_est",
  "grip_kg",
  "testosterone",
]);

export function betterDirection(
  code: string | null | undefined,
  optimalLow: number | null | undefined,
  optimalHigh: number | null | undefined,
): "lower" | "higher" | "middle" {
  if (code && BETTER_LOW.has(code)) return "lower";
  if (code && BETTER_HIGH.has(code)) return "higher";
  if (optimalHigh != null && optimalLow == null) return "lower";
  if (optimalLow != null && optimalHigh == null) return "higher";
  return "middle";
}

export interface ProjectInput {
  code: string;
  unit: string;
  from: number;
  fromDate: string;
  actions: AdoptedAction[];
  /** defaults to the marker's own retest window */
  horizonWeeks?: number;
  /** the person's overall adherence, used when an action has none of its own */
  adherence?: number;
  /** the marker's optimal band, which is as far as a projection may travel */
  optimalLow?: number | null;
  optimalHigh?: number | null;
}

export function project(input: ProjectInput): Projection {
  const { code, unit, from, fromDate } = input;
  const retestWeeks = RETEST_WEEKS[code] ?? 12;
  const horizonWeeks = input.horizonWeeks ?? retestWeeks;

  const contributions: Projection["contributions"] = [];
  const gaps: string[] = [];
  let total = 0;
  let variance = 0;

  // Somebody already inside the optimal band is not the person these trials
  // recruited, so their numbers say nothing about them.
  const inBand =
    (input.optimalHigh != null && input.from <= input.optimalHigh) &&
    (input.optimalLow == null || input.from >= input.optimalLow);

  for (const action of input.actions) {
    if (inBand) break;
    if (!action.effect) {
      gaps.push(action.text);
      continue;
    }
    const e = action.effect;
    if (e.outcomeFeatureId !== `metric:${code}` && e.outcomeFeatureId !== `derived:${code}`)
      continue;
    const raw = parseEffect(e.effect, e.direction);
    const weight = GRADE_WEIGHT[e.grade] ?? 0;
    if (raw == null || weight === 0) {
      if (raw == null) gaps.push(`${action.text} (no number in "${e.effect ?? "no effect stated"}")`);
      continue;
    }
    const adherence = action.adherence ?? input.adherence ?? 1;
    // A twelve-week trial read at six weeks has delivered about half of it.
    const trial = durationWeeks(e.duration) ?? retestWeeks;
    const reached = Math.min(1, horizonWeeks / Math.max(trial, 1));
    const delta = round2(raw * weight * adherence * reached);
    if (delta === 0) continue;
    total += delta;
    variance += (delta * (GRADE_SPREAD[e.grade] ?? 1)) ** 2;
    contributions.push({
      intervention: e.name,
      delta,
      grade: e.grade,
      source: e.source,
      ...(adherence !== 1 ? { adherence } : {}),
    });
  }

  // What a body can do in the time available.
  const cap = (MAX_CHANGE[code] ?? Infinity) * Math.min(1, horizonWeeks / 12);
  const bounded = Math.max(-cap, Math.min(cap, total));
  const capped = bounded !== total;

  const width = Math.max(Math.sqrt(variance), FLOOR[code] ?? 0);

  // A projection stops at the optimal band. Every trial these effect sizes
  // come from recruited people who were outside it, and none of them measured
  // what happens to somebody who is already inside: three actions on an HbA1c
  // of 5.0 do not produce a 4.5.
  const raw = from + bounded;
  const edge =
    bounded < 0 && input.optimalLow != null && from > input.optimalLow
      ? Math.max(raw, input.optimalLow)
      : bounded > 0 && input.optimalHigh != null && from < input.optimalHigh
        ? Math.min(raw, input.optimalHigh)
        : raw;
  const expected = round2(edge);
  const stopped = round2(edge) !== round2(raw);

  const assumptions: string[] = [];
  if (inBand)
    assumptions.push(
      `${code} is already inside its optimal band, and every effect size here comes from a trial that recruited people outside it: nothing is projected`,
    );
  const stated = input.actions
    .map((a) => a.adherence ?? input.adherence)
    .filter((a): a is number => a != null);
  if (stated.length)
    assumptions.push(
      `assumes ${Math.round(Math.max(...stated) * 100)} % adherence`,
    );
  assumptions.push(
    `${code} reflects about ${retestWeeks} weeks, so it is judged at ${addWeeks(fromDate, retestWeeks)}`,
  );
  if (stopped)
    assumptions.push(
      `stopped at the optimal band: the trials behind these numbers recruited people outside it, so nothing here predicts what happens inside it`,
    );
  if (capped)
    assumptions.push(
      `the effects added to ${round2(total)} ${unit}, capped at ${round2(bounded)}: the most this marker moves in ${horizonWeeks} weeks`,
    );
  if (gaps.length)
    assumptions.push(
      `no effect size on file for ${gaps.join(", ")}, so it is not counted`,
    );

  return {
    code,
    unit,
    from,
    fromDate,
    horizonWeeks,
    expected,
    low: round2(expected - width),
    high: round2(expected + width),
    contributions,
    assumptions,
    retestAt: addWeeks(fromDate, retestWeeks),
    gaps,
  };
}

/**
 * What the draw said about the projection.
 *
 * Inside the band is `as_expected`. Outside it, "better" and "worse" are read
 * in the direction that is good for this marker: an HbA1c under the band is
 * better, a ferritin under it is worse.
 */
export function verdictOf(
  p: Projection,
  value: number,
  betterIs: "lower" | "higher" | "middle",
): Verdict {
  if (value >= p.low && value <= p.high) return "as_expected";
  const under = value < p.low;
  if (betterIs === "middle") return "as_expected";
  return under === (betterIs === "lower") ? "better" : "worse";
}

/** "Expected 5.6 (5.4-5.8) by 2026-11-20", the sentence every page prints. */
export const projectionLine = (p: Projection): string =>
  `Expected ${p.expected} ${p.unit} (${p.low}–${p.high}) by ${p.retestAt}` +
  (p.contributions.length
    ? `: ${p.contributions
        .map((c) => `${c.intervention} ${c.delta > 0 ? "+" : ""}${c.delta} (${c.grade})`)
        .join(", ")}`
    : ": nothing adopted that moves it");
