/**
 * A journey: a scripted person with a hidden truth, run through the engine
 * step by step where **the engine chooses every step itself**.
 *
 * The loop is the whole idea. Score the differential, ask `nextMoves` for the
 * best move per euro under what is left of the budget, take it, and let the
 * world answer it out of the hidden truth: a question by its answer, a test by
 * the values the person really has. Repeat until the true conditions are
 * likely, or nothing is worth asking, or the money runs out.
 *
 * What comes back is a curve per condition from the prior to discovery, plus
 * everything that went wrong on the way: false alarms, euros spent, and the
 * moves that moved nothing.
 *
 * Deterministic and pure over the engine. No LLM, no clock, no database except
 * the catalog the caller passes in (or `loadCatalog`, which falls back to the
 * in-code catalog offline).
 */
import { personaToInput } from "@/evals/persona";
import { loadCatalog } from "./hkb";
import { scoreHypotheses, type Catalog } from "./hypotheses";
import { nextMoves, type Move } from "./infogain";
import { BAND_EUR } from "./prices";
import { applyOverlay, type Overlay } from "./sample";
import { wakeInMemory } from "./wake";

import ckd3 from "@/evals/journeys/ckd3_male_70.json";
import haemochromatosis from "@/evals/journeys/haemochromatosis_ferritin_m52.json";
import hashimotoEarly from "@/evals/journeys/hashimoto_early_female_36.json";
import hashimotoScratch from "@/evals/journeys/hashimoto_from_scratch_f34_ro.json";
import healthy from "@/evals/journeys/healthy_male_28.json";
import insulinResistant from "@/evals/journeys/insulin_resistant_male_45.json";
import ironGi from "@/evals/journeys/iron_gi_cause_m45.json";
import ironLow from "@/evals/journeys/iron_low_female_30.json";
import lmhr from "@/evals/journeys/lmhr_male_38.json";
import lmhrScratch from "@/evals/journeys/lmhr_from_scratch_m38.json";

export interface JourneyReading {
  code: string;
  value: number;
  unit?: string;
  date: string;
  prev?: number;
}

export interface Journey {
  id: string;
  title: string;
  /** fixed, so two runs a week apart are the same run */
  today: string;
  start: { facts: Record<string, unknown>; readings: JourneyReading[] };
  truth: {
    /** what this person really has, for "false alarm" and for the colours */
    conditions: string[];
    /** what they answer, keyed by the fact the question writes */
    answers: Record<string, string>;
    /** what a draw would find, keyed by metric code */
    labs: Record<string, number>;
    /** anything not in `answers` */
    defaultAnswer: string;
    /** anything not in `labs`: the test's own typical negative */
    defaultLab: "typicalNeg";
  };
  /** euros the engine may spend over the whole journey */
  budget?: number;
  maxSteps: number;
  expect: {
    discover: string[];
    withinSteps?: number;
    withinEur?: number;
    noFalseLikely?: boolean;
    stop?: JourneyResult["stop"];
    /** something has to wake by this step (the ring-2 path) */
    wakeWithin?: number;
    /** substrings of move labels the run has to contain, e.g. "ApoB" */
    orders?: string[];
  };
}

export interface JourneyStep {
  n: number;
  move: Move;
  outcome: string;
  costEur: number;
  cumEur: number;
  beliefs: Record<string, number>;
  woken: string[];
  note?: string;
}

export interface JourneyResult {
  id: string;
  /** the differential before the first move, so the track starts at step 0 */
  prior: Record<string, number>;
  /** what the account already woke before the engine moved at all */
  priorWoken: string[];
  steps: JourneyStep[];
  discoveredAt: Record<string, number | null>;
  falseLikely: { id: string; step: number; p: number }[];
  totalEur: number;
  stop: "discovered" | "exhausted" | "budget" | "maxSteps";
  pass: boolean;
  failed: string[];
}

/** The ten journeys, statically imported so the bundler and the CLI share them. */
export const JOURNEYS: Journey[] = [
  ckd3,
  haemochromatosis,
  hashimotoEarly,
  hashimotoScratch,
  healthy,
  insulinResistant,
  ironGi,
  ironLow,
  lmhr,
  lmhrScratch,
].map((j) => j as unknown as Journey);

export const journeyById = (id: string): Journey | undefined =>
  JOURNEYS.find((j) => j.id === id);

/** "likely" starts here. Same number `stateFor` uses. */
const LIKELY = 0.6;

/** A move worth making at all. */
const MIN_GAIN = 0.01;

/**
 * What a move costs in euros. A priced test is its list price; an unpriced one
 * is its cost band's nominal price, the same scale `ratioOf` ranks on. A
 * question is free.
 */
export const eurOf = (move: Move): number =>
  move.priced ? move.cost : (BAND_EUR[move.cost] ?? move.cost * 30);

const round3 = (v: number) => Math.round(v * 1000) / 1000;

const beliefsOf = (rows: { id: string; score: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.id, round3(r.score)]));

/** The last outcome of a test is its typical negative, by construction in `lib/infogain.ts`. */
const negative = (move: Move) => move.outcomes[move.outcomes.length - 1]!.apply;

/**
 * The world's answer to one move, as an overlay patch and a sentence.
 *
 * A question is answered from `truth.answers`, everything else with
 * `defaultAnswer`. A test writes, for every code it draws, the person's real
 * value when the truth names one and the test's own typical negative when it
 * does not. A genome upload is a test that writes facts rather than readings,
 * so it reads `truth.answers` with the same fallback.
 */
function answerMove(move: Move, j: Journey, date: string) {
  const facts: Record<string, unknown> = {};
  const readings: JourneyReading[] = [];
  const said: string[] = [];

  const positive = move.outcomes[0]!.apply;
  const fallback = negative(move);

  for (const key of Object.keys(positive.facts)) {
    const value =
      j.truth.answers[key] ??
      (move.kind === "question"
        ? j.truth.defaultAnswer
        : String(fallback.facts[key] ?? j.truth.defaultAnswer));
    facts[key] = value;
    said.push(move.kind === "question" ? value : `${key} ${value}`);
  }

  for (const r of positive.readings) {
    const fromTruth = j.truth.labs[r.code];
    const value =
      fromTruth ??
      fallback.readings.find((x) => x.code === r.code)?.value ??
      r.value;
    readings.push({ code: r.code, value, unit: r.unit, date });
    said.push(`${r.code} ${value}`);
  }

  return { facts, readings, said: said.join(", ") };
}

/** Did every expectation hold? */
function verdict(j: Journey, r: Omit<JourneyResult, "pass" | "failed">) {
  const failed: string[] = [];
  for (const id of j.expect.discover)
    if (r.discoveredAt[id] == null) failed.push(`${id} never reached likely`);
  if (j.expect.withinSteps != null) {
    if (r.steps.length > j.expect.withinSteps)
      failed.push(
        `took ${r.steps.length} steps, allowed ${j.expect.withinSteps}`,
      );
    for (const [id, at] of Object.entries(r.discoveredAt))
      if (at != null && at > j.expect.withinSteps)
        failed.push(
          `${id} found at step ${at}, allowed ${j.expect.withinSteps}`,
        );
  }
  if (j.expect.withinEur != null && r.totalEur > j.expect.withinEur)
    failed.push(`spent €${r.totalEur}, allowed €${j.expect.withinEur}`);
  if (j.expect.noFalseLikely && r.falseLikely.length)
    failed.push(
      `false likely: ${r.falseLikely
        .map((f) => `${f.id} ${Math.round(f.p * 100)}% at step ${f.step}`)
        .join(", ")}`,
    );
  if (j.expect.stop && r.stop !== j.expect.stop)
    failed.push(`stopped "${r.stop}", expected "${j.expect.stop}"`);
  if (
    j.expect.wakeWithin != null &&
    !r.priorWoken.length &&
    !r.steps.some((s) => s.n <= j.expect.wakeWithin! && s.woken.length)
  )
    failed.push(`nothing woke by step ${j.expect.wakeWithin}`);
  for (const want of j.expect.orders ?? [])
    if (!r.steps.some((s) => s.move.label.includes(want)))
      failed.push(`never ordered ${want}`);
  return failed;
}

export async function runJourney(
  j: Journey,
  catalog?: Catalog,
): Promise<JourneyResult> {
  const rules = catalog ?? (await loadCatalog());
  const base = personaToInput({
    today: j.today,
    facts: j.start.facts,
    readings: j.start.readings,
  });

  // ponytail: the overlay's readings are appended, never replaced by code, so
  // a repeated draw leaves the earlier value as `prev` — which is what the
  // "twice" wake rules read.
  const overlay: Overlay = { readings: [], facts: {}, confounders: {} };
  const steps: JourneyStep[] = [];
  const discoveredAt: Record<string, number | null> = Object.fromEntries(
    j.expect.discover.map((id) => [id, null]),
  );
  const falseLikely: JourneyResult["falseLikely"] = [];
  const truth = new Set(j.truth.conditions);
  const seenWake = new Set<string>();
  const taken = new Map<string, number>();

  /** Everything that crossed "likely" at this step, true or false. */
  const record = (beliefs: Record<string, number>, n: number) => {
    for (const [id, p] of Object.entries(beliefs)) {
      if (p < LIKELY) continue;
      if (id in discoveredAt && discoveredAt[id] == null) discoveredAt[id] = n;
      if (!truth.has(id) && !falseLikely.some((f) => f.id === id))
        falseLikely.push({ id, step: n, p });
    }
  };
  const allFound = () =>
    j.expect.discover.length > 0 &&
    j.expect.discover.every((id) => discoveredAt[id] != null);

  let cumEur = 0;
  let stop: JourneyResult["stop"] = "maxSteps";
  let input = applyOverlay(base, overlay);
  const prior = beliefsOf(scoreHypotheses(input, { catalog: rules }));
  const priorWoken = wakeInMemory(input);
  for (const w of priorWoken) seenWake.add(w);
  // The account may already hold the answer: that is a discovery at step 0.
  record(prior, 0);
  if (allFound()) stop = "discovered";

  for (let n = 1; !allFound() && n <= j.maxSteps; n++) {
    // ponytail: a repeatable test is worth a second draw (that is how a
    // "twice" rule ever fires) and never a third, which is also what stops
    // the loop spending the whole budget on one marker.
    const exclude = [...taken].filter(([, c]) => c >= 2).map(([k]) => k);
    const moves = nextMoves(input, rules, { exclude }).filter(
      (m) => m.gain >= MIN_GAIN,
    );
    if (!moves.length) {
      stop = "exhausted";
      break;
    }
    const left = j.budget == null ? Infinity : j.budget - cumEur;
    const move = moves.find((m) => eurOf(m) <= left);
    if (!move) {
      stop = "budget";
      break;
    }

    const key = move.testId ?? move.featureId;
    taken.set(key, (taken.get(key) ?? 0) + 1);
    const repeat = taken.get(key)! > 1;

    const answer = answerMove(move, j, j.today);
    overlay.facts = { ...overlay.facts, ...answer.facts };
    overlay.readings = [...overlay.readings, ...answer.readings];
    input = applyOverlay(base, overlay);

    const scored = scoreHypotheses(input, { catalog: rules });
    const beliefs = beliefsOf(scored);
    const costEur = eurOf(move);
    cumEur = Math.round((cumEur + costEur) * 100) / 100;

    const woken = wakeInMemory(input).filter((w) => !seenWake.has(w));
    for (const w of woken) seenWake.add(w);

    steps.push({
      n,
      move,
      outcome: answer.said,
      costEur,
      cumEur,
      beliefs,
      woken,
      ...(repeat ? { note: "repeat draw" } : {}),
    });

    record(beliefs, n);
    if (allFound()) stop = "discovered";
  }

  const partial = {
    id: j.id,
    prior,
    priorWoken,
    steps,
    discoveredAt,
    falseLikely,
    totalEur: cumEur,
    stop,
  };
  const failed = verdict(j, partial);
  return { ...partial, pass: failed.length === 0, failed };
}
