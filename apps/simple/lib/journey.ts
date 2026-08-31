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
import { eurOf, nextMoves, type Move } from "./infogain";
import { applyOverlay, type Overlay } from "./sample";

export { eurOf };
import { wakeInMemory } from "./wake";

import a1at from "@/evals/journeys/a1at_female_41.json";
import addisons from "@/evals/journeys/addisons_female_38.json";
import ckd3 from "@/evals/journeys/ckd3_male_70.json";
import fabry from "@/evals/journeys/fabry_male_33.json";
import gilbert from "@/evals/journeys/gilbert_male_30.json";
import mcas from "@/evals/journeys/mcas_female_29.json";
import pernicious from "@/evals/journeys/pernicious_anaemia_female_52.json";
import sibo from "@/evals/journeys/sibo_male_44.json";
import wilson from "@/evals/journeys/wilson_male_24.json";
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
  /** euros the journey is meant to stay inside. A guide, never a gate. */
  budget?: number;
  maxSteps: number;
  expect: {
    discover: string[];
    /**
     * Draws, not steps: a step that costs nothing is a question, and the
     * engine is not rationed on questions. This is how many times somebody
     * has to be stuck with a needle or booked into a scanner.
     */
    withinDraws?: number;
    withinEur?: number;
    noFalseLikely?: boolean;
    stop?: JourneyResult["stop"];
    /** something has to wake by this step (the ring-2 path) */
    wakeWithin?: number;
    /** substrings of move labels the run has to contain, e.g. "ApoB" */
    orders?: string[];
    /** substrings of move labels the run must never contain */
    notOrders?: string[];
    /**
     * A condition that cannot reach "likely" from a one-in-ten-thousand base
     * rate, and the probability the run does have to lift it to. Mast cell
     * disease with a raised tryptase is a referral at one per cent, not a
     * diagnosis at sixty.
     */
    reaches?: Record<string, number>;
  };
}

export interface JourneyStep {
  n: number;
  move: Move;
  outcome: string;
  costEur: number;
  cumEur: number;
  /** this step took the run past the budget guide */
  overBudget?: boolean;
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
  stop: "discovered" | "exhausted" | "maxSteps";
  pass: boolean;
  failed: string[];
}

/** The ten journeys, statically imported so the bundler and the CLI share them. */
export const JOURNEYS: Journey[] = [
  a1at,
  addisons,
  ckd3,
  fabry,
  gilbert,
  haemochromatosis,
  hashimotoEarly,
  hashimotoScratch,
  healthy,
  insulinResistant,
  ironGi,
  ironLow,
  lmhr,
  lmhrScratch,
  mcas,
  pernicious,
  sibo,
  wilson,
].map((j) => j as unknown as Journey);

export const journeyById = (id: string): Journey | undefined =>
  JOURNEYS.find((j) => j.id === id);

/** "likely" starts here. Same number `stateFor` uses. */
const LIKELY = 0.6;

/** A move worth making at all. */
const MIN_GAIN = 0.01;

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
  if (j.expect.withinDraws != null) {
    const draws = r.steps.filter((s) => s.costEur > 0).length;
    if (draws > j.expect.withinDraws)
      failed.push(`took ${draws} draws, allowed ${j.expect.withinDraws}`);
  }
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
  for (const never of j.expect.notOrders ?? [])
    if (r.steps.some((s) => s.move.label.includes(never)))
      failed.push(`ordered ${never}, which it should not have`);
  for (const [id, want] of Object.entries(j.expect.reaches ?? {})) {
    const peak = Math.max(
      r.prior[id] ?? 0,
      ...r.steps.map((s) => s.beliefs[id] ?? 0),
    );
    if (peak < want)
      failed.push(`${id} only reached ${(peak * 100).toFixed(2)} %, wanted ${(want * 100).toFixed(2)} %`);
  }
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
    // The floor is for tests. A question costs nothing, so it is worth asking
    // even when the answer only moves a one-in-forty-thousand disease: that is
    // the only kind of move that ever raises one.
    const moves = nextMoves(input, rules, { exclude }).filter(
      (m) => m.cost === 0 || m.pursue || m.gain >= MIN_GAIN,
    );
    if (!moves.length) {
      stop = "exhausted";
      break;
    }
    // The budget ranks and never gates: an expensive test that answers the
    // question is still the right next move, and the run says so.
    const move = moves[0]!;

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
      ...(j.budget != null && cumEur > j.budget ? { overBudget: true } : {}),
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
