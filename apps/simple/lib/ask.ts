/**
 * What to put in the review queue. The tier-0 interview always; the twelve
 * symptom items only when they would actually settle something.
 *
 * Kept out of `lib/coverage.ts` because it reads the catalog and runs the
 * information-gain engine, and `lib/infogain.ts` already reads coverage.
 */
import {
  buildModelInput,
  profileQuestions,
  queueFactQuestions,
  type FactQuestion,
} from "./coverage";
import { BEDTIME_FACT, evaluateWhen } from "./graph-state";
import { catalogFor, loadCatalog } from "./hkb";
import { CODE_GRAPH, loadGraph, type Graph } from "./kg";
import { scoreHypotheses } from "./hypotheses";
import { nextMoves } from "./infogain";
import { matchPatterns } from "./patterns";
import { SYMPTOMS } from "./symptoms";
import { CONDITIONAL_FACTS, PROFILE_QUESTIONS, type Sex } from "./vectors";
import type { ModelInput } from "./coverage";

const applies = (
  gate: { sex?: Sex; minAge?: number; maxAge?: number } | undefined,
  m: ModelInput,
) => {
  if (!gate) return true;
  if (gate.sex && m.sex !== gate.sex) return false;
  if (gate.minAge != null && (m.age == null || m.age < gate.minAge)) return false;
  if (gate.maxAge != null && (m.age == null || m.age > gate.maxAge)) return false;
  return true;
};

const answered = (m: ModelInput, key: string) => {
  const v = m.profile[key];
  return v != null && String(v).trim() !== "";
};

/** The symptom items this person could still answer, in spec order. */
export function symptomQuestions(m: ModelInput): FactQuestion[] {
  return SYMPTOMS.filter((s) => applies(s.appliesTo, m) && !answered(m, s.key)).map(
    (s) => ({ key: s.key, question: s.question, options: s.options }),
  );
}

/** unlikely and possible: the band where one more answer still changes things. */
const LIVE = { low: 0.05, high: 0.6 };

/**
 * The symptom items worth asking right now: only the ones that are a top move
 * by information gain, and only while some hypothesis sits between unlikely
 * and possible. With nothing in that band, the questionnaire waits for the
 * user to open "How do you feel" themselves.
 */
export async function symptomAsks(
  m: ModelInput,
  userId?: string,
): Promise<FactQuestion[]> {
  const open = new Set(symptomQuestions(m).map((q) => q.key));
  if (!open.size) return [];

  const catalog = userId ? await catalogFor(userId) : await loadCatalog();
  const live = new Set(
    scoreHypotheses(m, { catalog })
      .filter((r) => r.score >= LIVE.low && r.score < LIVE.high)
      .map((r) => r.id),
  );
  if (!live.size) return [];

  return nextMoves(m, catalog, { max: 12 })
    .filter((mv) => mv.kind === "question")
    .map((mv) => mv.featureId.replace(/^fact:/, ""))
    .filter((key, i, all) => open.has(key) && all.indexOf(key) === i)
    .map((key) => ({ key, ...PROFILE_QUESTIONS[key]! }));
}

/**
 * The timing and habit answers a conditional edge is waiting on.
 *
 * An edge is worth asking about when everything it reads that the person
 * cannot answer already holds: the genotype is called, the pattern matches,
 * the sex is right. Then the one missing answer is the whole difference
 * between "coffee costs you an hour of sleep" and silence. Nothing else in the
 * interview works this way, which is why these four facts are not vectors.
 */
export function conditionalAsks(
  m: ModelInput,
  graph: Graph = CODE_GRAPH,
): FactQuestion[] {
  const matched = new Set(
    matchPatterns(m)
      .filter((p) => p.matched)
      .map((p) => p.pattern.id),
  );
  const out: FactQuestion[] = [];

  for (const edge of graph.edges) {
    const w = edge.when;
    if (!w) continue;
    const keys = [
      w.fact?.key,
      w.hoursBefore?.eventFact,
      w.hoursBefore ? BEDTIME_FACT : undefined,
    ].filter((k): k is string => !!k && CONDITIONAL_FACTS.has(k));
    const wanted = keys.filter((k) => !answered(m, k));
    if (!wanted.length) continue;

    // Everything except the answers themselves has to hold already.
    const { fact: _f, hoursBefore: _h, ...rest } = w;
    if (!evaluateWhen({ ...edge, when: rest }, m, matched, graph.nodes).holds)
      continue;

    for (const key of wanted)
      if (PROFILE_QUESTIONS[key] && !out.some((q) => q.key === key))
        out.push({ key, ...PROFILE_QUESTIONS[key]! });
  }
  return out;
}

/**
 * The curator, `/plan` and `/graph` all call this. Interview first, then the
 * symptom items the differential is actually waiting on, then the answers a
 * conditional edge needs.
 */
export async function queueQuestions(userId: string): Promise<number> {
  const m = await buildModelInput(userId);
  const interview = await queueFactQuestions(userId, profileQuestions(m));
  const symptoms = await queueFactQuestions(
    userId,
    await symptomAsks(m, userId),
  );
  const conditional = await queueFactQuestions(
    userId,
    conditionalAsks(m, await loadGraph()),
  );
  return interview + symptoms + conditional;
}
