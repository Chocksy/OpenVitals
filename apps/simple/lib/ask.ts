/**
 * What to put in the review queue. The tier-0 interview always; the twelve
 * symptom items only when they would actually settle something.
 *
 * Kept out of `lib/coverage.ts` because it reads the catalog and runs the
 * information-gain engine, and `lib/infogain.ts` already reads coverage.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, profileFacts, profileFactHistory, reviewItems } from "@/db";
import {
  buildModelInput,
  profileQuestions,
  queueFactQuestions,
  type FactQuestion,
} from "./coverage";
import { revisitAtFor, settledFacts } from "./revisit";
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
 * Close every open interview question this person has already answered.
 *
 * Phase 31a item 4. A `profile_question` row is written once and `/plan`
 * prints every open one, so a fact answered anywhere else — the Today card,
 * the thread's `record_fact`, the interview itself — left its question sitting
 * in "Answer these" forever. `settledFacts` decides: a value on file and a
 * re-ask date that has not come round yet closes the row.
 *
 * Returns how many rows it closed, so a caller can log it.
 */
export async function closeAnsweredQuestions(userId: string): Promise<number> {
  const db = getDb();
  const [facts, history, open] = await Promise.all([
    db.select().from(profileFacts).where(eq(profileFacts.userId, userId)),
    db
      .select()
      .from(profileFactHistory)
      .where(eq(profileFactHistory.userId, userId)),
    db
      .select({ id: reviewItems.id, subject: reviewItems.subject })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.userId, userId),
          eq(reviewItems.kind, "profile_question"),
          eq(reviewItems.status, "open"),
        ),
      ),
  ]);
  if (!open.length) return 0;

  const openFrom = new Map<string, string>();
  for (const h of history)
    if (h.changeKind !== "corrected" && h.validTo == null)
      openFrom.set(h.key, h.validFrom);

  const today = new Date().toISOString().slice(0, 10);
  const settled = settledFacts(
    facts.map((f) => {
      const validFrom =
        openFrom.get(f.key) ??
        (f.answeredAt ?? new Date()).toISOString().slice(0, 10);
      return {
        key: f.key,
        value: f.value,
        validFrom,
        revisitAt: f.revisitAt ?? revisitAtFor(f.key, validFrom, f.value),
      };
    }),
    today,
  );

  const stale = open
    .filter((i) => {
      const key = i.subject?.factKey ?? i.subject?.key;
      return !!key && settled.has(key);
    })
    .map((i) => i.id);
  if (!stale.length) return 0;

  await db
    .update(reviewItems)
    .set({ status: "answered" })
    .where(inArray(reviewItems.id, stale));
  return stale.length;
}

/**
 * The curator, `/plan` and `/graph` all call this. Interview first, then the
 * symptom items the differential is actually waiting on, then the answers a
 * conditional edge needs.
 */
export async function queueQuestions(userId: string): Promise<number> {
  await closeAnsweredQuestions(userId);
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
