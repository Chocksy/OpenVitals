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
import { loadCatalog } from "./hkb";
import { scoreHypotheses } from "./hypotheses";
import { nextMoves } from "./infogain";
import { SYMPTOMS } from "./symptoms";
import { PROFILE_QUESTIONS, type Sex } from "./vectors";
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
export async function symptomAsks(m: ModelInput): Promise<FactQuestion[]> {
  const open = new Set(symptomQuestions(m).map((q) => q.key));
  if (!open.size) return [];

  const catalog = await loadCatalog();
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
 * The curator, `/plan` and `/graph` all call this. Interview first, then the
 * symptom items the differential is actually waiting on.
 */
export async function queueQuestions(userId: string): Promise<number> {
  const m = await buildModelInput(userId);
  const interview = await queueFactQuestions(userId, profileQuestions(m));
  const symptoms = await queueFactQuestions(userId, await symptomAsks(m));
  return interview + symptoms;
}
