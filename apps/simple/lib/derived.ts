/**
 * The numbers no lab prints but every one of them can be computed from the
 * ones that are printed: eGFR, FIB-4, PhenoAge, plus the three cheap ratios.
 *
 * Every function takes plain numbers in a named unit and returns `undefined`
 * when an input is missing, so callers never have to null-check the inputs.
 * Tested against one published vector each in `derived.test.ts`.
 */
import type { LatestValue, ModelInput } from "./coverage";
import type { Sex } from "./vectors";

type Maybe = number | null | undefined;

const ok = (v: Maybe): v is number => typeof v === "number" && Number.isFinite(v);

/** Every input present and finite, or nothing. */
const allOk = (xs: Maybe[]): xs is number[] => xs.every(ok);

const round2 = (v: number) => Math.round(v * 100) / 100;

/* ── unit conversions, from what the database actually stores ─────────── */

/** mg/dL → µmol/L. */
export const creatinineToUmolL = (mgdl: number) => mgdl * 88.4;
/** mg/dL → mmol/L. */
export const glucoseToMmolL = (mgdl: number) => mgdl / 18.0182;
/** g/dL → g/L. */
export const albuminToGL = (gdl: number) => gdl * 10;

/**
 * CKD-EPI 2021, the race-free creatinine equation.
 *
 *   eGFR = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^-1.200 × 0.9938^age × 1.012 (female)
 *
 * `creatinine` in mg/dL. Needs both sex and age, so it stays undefined until
 * the profile questions are answered.
 */
export function egfr(input: {
  creatinine?: number | null;
  age?: number | null;
  sex?: Sex;
}): number | undefined {
  const { sex } = input;
  const parts: Maybe[] = [input.creatinine, input.age];
  if (!sex || !allOk(parts)) return undefined;
  const [creatinine, age] = parts;
  if (creatinine <= 0) return undefined;
  const k = sex === "female" ? 0.7 : 0.9;
  const a = sex === "female" ? -0.241 : -0.302;
  const ratio = creatinine / k;
  const value =
    142 *
    Math.min(ratio, 1) ** a *
    Math.max(ratio, 1) ** -1.2 *
    0.9938 ** age *
    (sex === "female" ? 1.012 : 1);
  return round2(value);
}

/**
 * FIB-4 = (age × AST) / (platelets × √ALT). Platelets in 10^9/L, which is the
 * same number as the 10^3/µL the lab prints. Above 1.3 means look at the liver.
 */
export function fib4(input: {
  age?: number | null;
  ast?: number | null;
  alt?: number | null;
  platelets?: number | null;
}): number | undefined {
  const parts: Maybe[] = [input.age, input.ast, input.alt, input.platelets];
  if (!allOk(parts)) return undefined;
  const [age, ast, alt, platelets] = parts;
  if (alt <= 0 || platelets <= 0) return undefined;
  return round2((age * ast) / (platelets * Math.sqrt(alt)));
}

/**
 * PhenoAge, Levine 2018 (Aging 10:573). Nine blood values plus chronological
 * age, in the units the paper used. CRP enters as the natural log of the value
 * in mg/dL, so the mg/L the lab prints is scaled by 0.1 first.
 *
 * Returns undefined when any of the ten inputs is missing: a partial PhenoAge
 * is worse than none.
 */
export function phenoAge(input: {
  albuminGL?: number | null;
  creatinineUmolL?: number | null;
  glucoseMmolL?: number | null;
  crpMgL?: number | null;
  lymphocytePct?: number | null;
  mcv?: number | null;
  rdw?: number | null;
  alp?: number | null;
  wbc?: number | null;
  age?: number | null;
}): number | undefined {
  const parts: Maybe[] = [
    input.albuminGL,
    input.creatinineUmolL,
    input.glucoseMmolL,
    input.crpMgL,
    input.lymphocytePct,
    input.mcv,
    input.rdw,
    input.alp,
    input.wbc,
    input.age,
  ];
  if (!allOk(parts)) return undefined;
  const [
    albuminGL,
    creatinineUmolL,
    glucoseMmolL,
    crpMgL,
    lymphocytePct,
    mcv,
    rdw,
    alp,
    wbc,
    age,
  ] = parts;
  if (crpMgL <= 0) return undefined;

  const xb =
    -19.9067 +
    albuminGL * -0.0336 +
    creatinineUmolL * 0.0095 +
    glucoseMmolL * 0.1953 +
    Math.log(crpMgL * 0.1) * 0.0954 +
    lymphocytePct * -0.012 +
    mcv * 0.0268 +
    rdw * 0.3306 +
    alp * 0.0019 +
    wbc * 0.0554 +
    age * 0.0804;

  const g = 0.0076927;
  const mortality = 1 - Math.exp((-Math.exp(xb) * (Math.exp(120 * g) - 1)) / g);
  if (!(mortality > 0 && mortality < 1)) return undefined;
  const value =
    141.50225 + Math.log(-0.00553 * Math.log(1 - mortality)) / 0.09165;
  return Number.isFinite(value) ? round2(value) : undefined;
}

/** glucose × insulin / 405, both as the lab prints them (mg/dL, µIU/mL). */
export function homaIr(glucose?: Maybe, insulin?: Maybe): number | undefined {
  if (!ok(glucose) || !ok(insulin)) return undefined;
  return round2((glucose * insulin) / 405);
}

/** Triglycerides over HDL, same unit on both sides. Above 2 flags insulin resistance. */
export function tgHdl(triglycerides?: Maybe, hdl?: Maybe): number | undefined {
  if (!ok(triglycerides) || !ok(hdl) || hdl <= 0) return undefined;
  return round2(triglycerides / hdl);
}

/** Everything that is not HDL: the cholesterol that can end up in a wall. */
export function nonHdl(total?: Maybe, hdl?: Maybe): number | undefined {
  if (!ok(total) || !ok(hdl)) return undefined;
  return round2(total - hdl);
}

/* ── the whole set, from one `latest` map ─────────────────────────────── */

/** hs-CRP in mg/L, whichever of the two codes carried it. */
function crpMgL(latest: Record<string, LatestValue>): number | null {
  for (const code of ["hs_crp", "crp"]) {
    const row = latest[code];
    if (row?.value == null) continue;
    return /mg\/dl/i.test(row.unit ?? "") ? row.value * 10 : row.value;
  }
  return null;
}

/**
 * The six derived numbers for one person. The model input, the eval personas
 * and the /brain sampler all call this, so they cannot drift apart.
 */
export function deriveAll(
  latest: Record<string, LatestValue>,
  sex: Sex | undefined,
  age: number | undefined,
): ModelInput["derived"] {
  const v = (code: string) => latest[code]?.value ?? null;
  return {
    egfr: egfr({ creatinine: v("creatinine"), age, sex }),
    homaIr: latest.homa_ir?.value ?? homaIr(v("glucose"), v("insulin")),
    tgHdl:
      latest.triglyceride_hdl_ratio?.value ??
      tgHdl(v("triglycerides"), v("hdl_cholesterol")),
    nonHdl:
      latest.non_hdl_cholesterol?.value ??
      nonHdl(v("total_cholesterol"), v("hdl_cholesterol")),
    fib4: fib4({
      age,
      ast: v("ast"),
      alt: v("alt"),
      platelets: v("platelets"),
    }),
    phenoAge: phenoAge({
      albuminGL: v("albumin") == null ? null : albuminToGL(v("albumin")!),
      creatinineUmolL:
        v("creatinine") == null ? null : creatinineToUmolL(v("creatinine")!),
      glucoseMmolL: v("glucose") == null ? null : glucoseToMmolL(v("glucose")!),
      crpMgL: crpMgL(latest),
      lymphocytePct: v("lymphocytes_pct"),
      mcv: v("mcv"),
      rdw: v("rdw") ?? v("rdw_cv"),
      alp: v("alp"),
      wbc: v("wbc"),
      age,
    }),
  };
}

/* ── trends (phase 17, section 4) ─────────────────────────────────────── */

/** One reading on a date, the shape `lib/data.ts` already keeps. */
export interface TrendPoint {
  date: string;
  value: number;
}

export interface Slope {
  /** change in the metric's own unit per year */
  perYear: number;
  /** how many years the fitted window spans */
  years: number;
  /** how many readings went into it */
  n: number;
}

const YEAR_MS = 365.25 * 86_400_000;

/** The most recent window a slope is fitted over. */
export const TREND_YEARS = 5;
/** Fewer than this and a line through them says nothing. */
export const TREND_MIN_POINTS = 3;

/**
 * Least squares through the last five years of one marker.
 *
 * Two readings are a difference, not a trend, so three is the floor. Anything
 * older than five years is dropped rather than fitted: a thyroid that drifted
 * a decade ago is a different question from one drifting now, and the whole
 * point of a slope rule is that it reads the direction the person is moving
 * today.
 *
 * `undefined` when there is not enough, or when every reading is on one day
 * (the fit would divide by zero).
 */
export function slopePerYear(
  points: TrendPoint[],
  asOf?: string,
): Slope | undefined {
  const end = asOf ? new Date(asOf).getTime() : Date.now();
  const window = points
    .filter((p) => {
      const t = new Date(p.date).getTime();
      return Number.isFinite(t) && Number.isFinite(p.value) && end - t <= TREND_YEARS * YEAR_MS;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (window.length < TREND_MIN_POINTS) return undefined;

  const xs = window.map((p) => new Date(p.date).getTime() / YEAR_MS);
  const ys = window.map((p) => p.value);
  const meanX = xs.reduce((s, x) => s + x, 0) / xs.length;
  const meanY = ys.reduce((s, y) => s + y, 0) / ys.length;
  let top = 0;
  let bottom = 0;
  for (let i = 0; i < xs.length; i++) {
    top += (xs[i]! - meanX) * (ys[i]! - meanY);
    bottom += (xs[i]! - meanX) ** 2;
  }
  if (bottom === 0) return undefined;
  return {
    perYear: round2(top / bottom),
    years: round2(xs[xs.length - 1]! - xs[0]!),
    n: window.length,
  };
}

/** "rising: +0.8/yr over 3 years", the line a card prints under a slope rule. */
export const slopeText = (slope: Slope, unit?: string | null): string =>
  `${slope.perYear > 0 ? "rising" : slope.perYear < 0 ? "falling" : "flat"}: ` +
  `${slope.perYear > 0 ? "+" : ""}${slope.perYear}${unit ? ` ${unit}` : ""}/yr ` +
  `over ${slope.years} year${slope.years === 1 ? "" : "s"} (${slope.n} draws)`;
