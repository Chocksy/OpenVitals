/**
 * A synthetic person in memory. `personaToInput` mirrors `buildModelInput`
 * without the database: statuses through `statusOf`, sex-adjusted optimal
 * bands through `optimalFor`, the same derived numbers, and the same pattern
 * target overrides applied at the end.
 */
import {
  optimalFor,
  toAge,
  toSex,
  type LatestValue,
  type ModelInput,
} from "@/lib/coverage";
import type { TrackerSummary } from "@/lib/daily-data";
import {
  albuminToGL,
  creatinineToUmolL,
  egfr,
  fib4,
  glucoseToMmolL,
  homaIr,
  nonHdl,
  phenoAge,
  tgHdl,
} from "@/lib/derived";
import { applyPatternTargets } from "@/lib/patterns";
import { statusOf } from "@/lib/status";
import type { Assertion } from "./assert";

export interface PersonaReading {
  code: string;
  value: number;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  optimalLow?: number;
  optimalHigh?: number;
  date: string;
  /** The reading before this one, for the "rising" rules. */
  prev?: number;
}

export interface Persona {
  today: string;
  facts: Record<string, unknown>;
  readings: PersonaReading[];
  tracker?: {
    days?: number;
    averages?: Record<string, number | null>;
    adherencePct?: number;
    items?: TrackerSummary["items"];
  };
}

export interface EvalCase {
  id: string;
  persona: Persona;
  must: Assertion[];
  mustNot: Assertion[];
  /** Scored and printed, but never fails the run. */
  should?: Assertion[];
  judge?: string;
}

const shiftDays = (day: string, by: number) =>
  new Date(new Date(day).getTime() + by * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** hs-CRP in mg/L, whichever of the two codes carried it. */
function crpMgL(latest: Record<string, LatestValue>): number | null {
  for (const code of ["hs_crp", "crp"]) {
    const row = latest[code];
    if (row?.value == null) continue;
    return /mg\/dl/i.test(row.unit ?? "") ? row.value * 10 : row.value;
  }
  return null;
}

export function personaToInput(p: Persona): ModelInput {
  const profile = { ...p.facts };
  const sex = toSex(profile.sex);
  const age = toAge(profile.birth_year, p.today);

  const latest: Record<string, LatestValue> = {};
  for (const r of p.readings) {
    const [optimalLow, optimalHigh] = optimalFor(r.code, sex, [
      r.optimalLow ?? null,
      r.optimalHigh ?? null,
    ]);
    latest[r.code] = {
      value: r.value,
      unit: r.unit ?? null,
      date: r.date,
      status: statusOf({
        value: r.value,
        refLow: r.refLow ?? null,
        refHigh: r.refHigh ?? null,
        optimalLow,
        optimalHigh,
      }),
      optimalLow,
      optimalHigh,
      refLow: r.refLow ?? null,
      refHigh: r.refHigh ?? null,
      prev: r.prev ?? null,
    };
  }

  const v = (code: string) => latest[code]?.value ?? null;
  const derived: ModelInput["derived"] = {
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

  return applyPatternTargets({
    today: p.today,
    profile,
    sex,
    age,
    latest,
    derived,
  });
}

export function personaTracker(p: Persona): TrackerSummary {
  const days = p.tracker?.days ?? 30;
  return {
    from: shiftDays(p.today, -(days - 1)),
    to: p.today,
    items: p.tracker?.items ?? [],
    averages: p.tracker?.averages ?? {},
    loggedDays: p.tracker?.averages ? days : 0,
    adherencePct: p.tracker?.adherencePct ?? 0,
  };
}
