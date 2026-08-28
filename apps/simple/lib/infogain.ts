/**
 * What to ask or measure next, chosen by how much it would shrink the whole
 * differential rather than by how much it moves one card.
 *
 * Every candidate is simulated: the outcome is written into a copy of the
 * input with the same overlay the Simulate button uses, the engine re-scores,
 * and the drop in entropy is the gain. Divide by cost and the ordering falls
 * out. Pure, deterministic, no LLM and no clock.
 */
import { profileQuestions, type ModelInput } from "./coverage";
import { GENOME_CATALOG } from "./genome-catalog";
import {
  countryOf,
  scoreHypotheses,
  type Catalog,
  type Discriminator,
  type EvidenceRule,
  type HypothesisResult,
  type Lens,
} from "./hypotheses";
import { priceOf, ratioOf } from "./prices";
import { applyOverlay, EMPTY_OVERLAY, type Overlay } from "./sample";
import { SYMPTOMS } from "./symptoms";
import { PROFILE_QUESTIONS } from "./vectors";

export interface Belief {
  id: string;
  p: number;
}

export interface Move {
  kind: "question" | "test";
  /** the feature answered, or the test's primary feature */
  featureId: string;
  testId?: string;
  /** the question or the test name, so the page needs no catalog */
  label: string;
  howTo?: string;
  /** questions 0, a euro list price when we have one, else the 1–4 cost band */
  cost: number;
  /** true when `cost` is euros, so the page prints "€57" and not "cost 2" */
  priced?: boolean;
  outcomes: {
    label: string;
    prob: number;
    beliefs: Belief[];
    /** what Simulate would write for this outcome, so the tree can replay it */
    apply: Overlay;
  }[];
  entropyBefore: number;
  entropyAfter: number;
  gain: number;
  /** gain per euro when the test is priced, gain per cost band when it is not */
  ratio: number;
  /**
   * Expected movement per condition, absolute, biggest five first. ponytail:
   * the expected posterior is the prior by construction, so `to` is where the
   * branch that moves this condition most would take it.
   */
  moves: { id: string; from: number; to: number }[];
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** `stateFor` in lib/hypotheses.ts calls anything at or above this "possible". */
const POSSIBLE = 0.25;

/** Shannon entropy of one binary belief, in bits. */
const bits = (p: number) =>
  p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));

/**
 * A naive-Bayes differential is a row of independent binary beliefs, so its
 * entropy is the sum of theirs. A condition the gate dropped is p = 0, which
 * adds nothing, so the vectors never need aligning.
 */
export const entropyOf = (beliefs: Belief[]) =>
  beliefs.reduce((sum, b) => sum + bits(b.p), 0);

export const beliefsOf = (rows: HypothesisResult[]): Belief[] =>
  rows.map((r) => ({ id: r.id, p: r.score }));

/**
 * Sensitivity and specificity from a pair of likelihood ratios. LR+ = sens /
 * (1 − spec) and LR− = (1 − sens) / spec is two equations in two unknowns, so
 * there is exactly one answer.
 */
export function sensSpec(lrPos: number, lrNeg: number) {
  const clamp = (v: number) => Math.min(0.99, Math.max(0.01, v));
  if (!(lrPos > 1 && lrNeg > 0 && lrNeg < 1)) return { sens: 0.7, spec: 0.7 };
  return {
    spec: clamp((lrPos - 1) / (lrPos - lrNeg)),
    sens: clamp((lrPos * (1 - lrNeg)) / (lrPos - lrNeg)),
  };
}

/**
 * ponytail: three rules read a number nobody stores, so the question that
 * feeds it is the candidate instead of the number itself.
 */
const FEEDS: Record<string, string[]> = {
  waist_height_ratio: ["waist_cm", "height_cm"],
  bp_systolic: ["bp_home"],
  lh_fsh_ratio: [],
};

/**
 * ponytail: a free-text question has no options to branch on, so it gets two
 * believable answers instead. Only the questions an evidence rule reads need
 * one.
 */
const SAMPLE_ANSWERS: Record<string, [string, string]> = {
  waist_cm: ["104", "78"],
  height_cm: ["165", "185"],
  bp_home: ["146/92", "118/74"],
  resting_hr: ["82", "58"],
  family_history: ["type 2 diabetes, father 58", "none"],
};

const overlayOf = (patch: Partial<Overlay>): Overlay => ({
  ...EMPTY_OVERLAY,
  ...patch,
});

interface Candidate {
  kind: Move["kind"];
  featureId: string;
  testId?: string;
  label: string;
  howTo?: string;
  cost: number;
  priced?: boolean;
  /** the conditions that read this feature, for the outcome probability */
  readers: string[];
  outcomes: { label: string; apply: Overlay }[];
}

/** The symptom items this person could still answer. Same shape as a vector question. */
function openSymptoms(m: ModelInput) {
  const has = (key: string) => {
    const v = m.profile[key];
    return v != null && String(v).trim() !== "";
  };
  return SYMPTOMS.filter((s) => {
    if (has(s.key)) return false;
    const gate = s.appliesTo;
    if (!gate) return true;
    if (gate.sex && m.sex !== gate.sex) return false;
    if (gate.minAge != null && (m.age == null || m.age < gate.minAge))
      return false;
    if (gate.maxAge != null && (m.age == null || m.age > gate.maxAge))
      return false;
    return true;
  }).map((s) => ({ key: s.key, question: s.question, options: s.options }));
}

/** Every unanswered tier-0 fact, and every open symptom item, that a rule reads. */
function questionCandidates(m: ModelInput, catalog: Catalog): Candidate[] {
  const out: Candidate[] = [];
  const asks = [...profileQuestions(m), ...openSymptoms(m)];
  const seen = new Set<string>();
  for (const q of asks) {
    if (seen.has(q.key)) continue;
    seen.add(q.key);
    const readers: string[] = [];
    const rules: EvidenceRule[] = [];
    for (const h of catalog)
      for (const rule of h.evidence) {
        const fact = rule.input.fact;
        if (!fact) continue;
        if (fact !== q.key && !(FEEDS[fact] ?? []).includes(q.key)) continue;
        rules.push(rule);
        if (!readers.includes(h.id)) readers.push(h.id);
      }
    if (!rules.length) continue;

    const answers =
      PROFILE_QUESTIONS[q.key]?.options ?? SAMPLE_ANSWERS[q.key] ?? null;
    if (!answers) continue;

    out.push({
      kind: "question",
      featureId: `fact:${q.key}`,
      label: q.question,
      howTo: "Free: one answer, no draw.",
      cost: 0,
      readers,
      outcomes: answers.map((a) => ({
        label: a,
        apply: overlayOf({ facts: { [q.key]: a } }),
      })),
    });
  }
  return out;
}

/**
 * "Upload a genome file", once and only once it would pay for itself: some
 * condition that a genome rule reads has to be at least possible already.
 * Cost band 2. One candidate per catalog row that qualifies, because which
 * row moves the differential most is only known after the simulation;
 * `nextMoves` keeps the best of them and drops the rest.
 */
function genomeCandidates(
  m: ModelInput,
  catalog: Catalog,
  beliefs: Map<string, number>,
): Candidate[] {
  const answered = GENOME_CATALOG.some(
    (r) => String(m.profile[r.factKey] ?? "").trim() !== "",
  );
  if (answered) return [];

  return GENOME_CATALOG.filter(
    (r) =>
      r.sample &&
      r.conditions.some((id) => (beliefs.get(id) ?? 0) >= POSSIBLE) &&
      catalog.some(
        (h) =>
          h.evidence.some((e) => e.input.fact === r.factKey) ||
          h.priors.modifiers.some(
            (mod) => (mod.when as { fact?: string }).fact === r.factKey,
          ),
      ),
  ).map((row) => ({
    kind: "test" as const,
    featureId: `fact:${row.factKey}`,
    testId: "genome_file",
    label: "Upload a genome file",
    howTo: `A 23andMe or AncestryDNA raw file answers ${GENOME_CATALOG.length} catalog rows at once, ${row.gene} among them, and never has to be repeated.`,
    cost: 2,
    readers: row.conditions.filter((id) => beliefs.has(id)),
    outcomes: row.sample!.map((value) => ({
      label: `${row.gene} ${value}`,
      apply: overlayOf({ facts: { [row.factKey]: value } }),
    })),
  }));
}

/** A test still worth ordering: unmeasured, or repeatable. */
const stillOpen = (d: Discriminator, m: ModelInput) =>
  d.repeatable || !d.codes.every((c) => m.latest[c]?.value != null);

/** Every test in the catalog whose markers are not on file yet. */
function testCandidates(
  m: ModelInput,
  catalog: Catalog,
  today: string,
): Candidate[] {
  const country = countryOf(m);
  const byCodes = new Map<string, { d: Discriminator; readers: string[] }>();
  for (const h of catalog)
    for (const d of h.discriminators) {
      if (!stillOpen(d, m)) continue;
      if (d.typicalPos == null || d.typicalNeg == null) continue;
      const key = d.codes.slice().sort().join("+");
      const found = byCodes.get(key);
      if (!found) byCodes.set(key, { d, readers: [h.id] });
      else {
        found.readers.push(h.id);
        // The strongest reading of the same draw sets its cost and its LRs.
        if (d.lrPos > found.d.lrPos) found.d = d;
      }
    }

  return [...byCodes.values()].map(({ d, readers }) => {
    const price = priceOf(d, country);
    return {
      kind: "test" as const,
      featureId: `metric:${d.codes[0]}`,
      testId: slug(d.test),
      label: d.test,
      howTo: d.howTo,
      cost: price ?? d.cost,
      priced: price != null,
      readers,
      outcomes: [
        { label: "positive", apply: reading(d, d.typicalPos!, today) },
        { label: "negative", apply: reading(d, d.typicalNeg!, today) },
      ],
    };
  });
}

/** Same id `hkb_tests` uses, so a move points at a row. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const reading = (d: Discriminator, value: number, date: string): Overlay =>
  overlayOf({
    readings: d.codes.map((code) => ({ code, value, unit: d.unit, date })),
  });

/**
 * How likely each outcome is, given what the engine says it would do.
 *
 * The one rule that matters: the outcomes have to average back to where the
 * differential started, or the "gain" is an artefact of the weights and a
 * question can look like it costs information. For two outcomes that is the
 * spec's formula exactly, P(pos) = p·sens + (1 − p)·(1 − spec), with sens and
 * spec read off the likelihood ratios the simulation actually produced rather
 * than the ones the catalog declares (a test whose marker an evidence rule
 * also reads moves by the rule, not by the test's own LR). For a question with
 * three options it is the same constraint, solved as the most even weights
 * that satisfy it.
 */
function outcomeProbs(p: number, ps: number[]): number[] {
  const n = ps.length;
  if (n < 2) return ps.map(() => 1);
  const odds = (v: number) => v / (1 - v);
  const mean = ps.reduce((sum, x) => sum + x, 0) / n;
  const spread = Math.max(...ps) - Math.min(...ps);
  if (spread < 1e-9 || p <= 0 || p >= 1) return ps.map(() => 1 / n);

  if (n === 2) {
    const hi = ps[0]! >= ps[1]! ? 0 : 1;
    const lrHi = odds(ps[hi]!) / odds(p);
    const lrLo = odds(ps[1 - hi]!) / odds(p);
    if (lrHi > 1 && lrLo > 0 && lrLo < 1) {
      const { sens, spec } = sensSpec(lrHi, lrLo);
      const w = Math.min(0.99, Math.max(0.01, p * sens + (1 - p) * (1 - spec)));
      return hi === 0 ? [w, 1 - w] : [1 - w, w];
    }
  }

  const varSum = ps.reduce((sum, x) => sum + (x - mean) ** 2, 0);
  const lambda = varSum > 0 ? (p - mean) / varSum : 0;
  const raw = ps.map((x) => Math.max(0.01, 1 / n + lambda * (x - mean)));
  const total = raw.reduce((sum, x) => sum + x, 0);
  return raw.map((x) => x / total);
}

/** The differential after every move worth making, best first. */
export function nextMoves(
  m: ModelInput,
  catalog: Catalog,
  opts: { lens?: Lens; exclude?: string[]; max?: number } = {},
): Move[] {
  const lens = opts.lens;
  const exclude = new Set(opts.exclude ?? []);
  const base = beliefsOf(scoreHypotheses(m, { catalog, lens }));
  const baseP = new Map(base.map((b) => [b.id, b.p]));
  const entropyBefore = entropyOf(base);

  const moves: Move[] = [];
  for (const c of [
    ...questionCandidates(m, catalog),
    ...testCandidates(m, catalog, m.today),
    ...genomeCandidates(m, catalog, baseP),
  ]) {
    if (exclude.has(c.featureId) || (c.testId && exclude.has(c.testId)))
      continue;

    const sims = c.outcomes.map((o) => ({
      ...o,
      beliefs: beliefsOf(
        scoreHypotheses(applyOverlay(m, o.apply), { catalog, lens }),
      ),
    }));

    // The move is about the condition its outcomes pull furthest apart, and
    // that is the one the weights have to stay honest about.
    const pOf = (beliefs: Belief[], id: string) =>
      beliefs.find((b) => b.id === id)?.p ?? 0;
    const ref = c.readers
      .filter((id) => baseP.has(id))
      .map((id) => {
        const ps = sims.map((s) => pOf(s.beliefs, id));
        return { id, ps, spread: Math.max(...ps) - Math.min(...ps) };
      })
      .sort((a, b) => b.spread - a.spread)[0];

    const probs = outcomeProbs(
      ref ? baseP.get(ref.id)! : 0,
      ref ? ref.ps : sims.map(() => 0),
    );
    const outcomes = sims.map((s, i) => ({
      label: s.label,
      prob: round3(probs[i]!),
      beliefs: s.beliefs,
      apply: s.apply,
    }));

    const entropyAfter = outcomes.reduce(
      (sum, o) => sum + o.prob * entropyOf(o.beliefs),
      0,
    );
    const gain = entropyBefore - entropyAfter;
    if (gain <= 0.0005) continue;

    const ids = [
      ...new Set([
        ...baseP.keys(),
        ...outcomes.flatMap((o) => o.beliefs.map((b) => b.id)),
      ]),
    ];
    const movement = ids
      .map((id) => {
        const from = baseP.get(id) ?? 0;
        const ps = outcomes.map((o) => ({
          p: o.beliefs.find((b) => b.id === id)?.p ?? 0,
          prob: o.prob,
        }));
        const shift = ps.reduce(
          (sum, x) => sum + x.prob * Math.abs(x.p - from),
          0,
        );
        const furthest = ps.reduce((best, x) =>
          Math.abs(x.p - from) > Math.abs(best.p - from) ? x : best,
        );
        return { id, from: round3(from), to: round3(furthest.p), shift };
      })
      .filter((x) => x.shift >= 0.001)
      .sort((a, b) => b.shift - a.shift)
      .slice(0, 5)
      .map(({ id, from, to }) => ({ id, from, to }));

    moves.push({
      kind: c.kind,
      featureId: c.featureId,
      testId: c.testId,
      label: c.label,
      howTo: c.howTo,
      cost: c.cost,
      ...(c.priced ? { priced: true } : {}),
      outcomes,
      entropyBefore: round3(entropyBefore),
      entropyAfter: round3(entropyAfter),
      gain: round3(gain),
      ratio: round3(ratioOf(gain, c.cost, !!c.priced)),
      moves: movement,
    });
  }

  moves.sort((a, b) => b.ratio - a.ratio || b.gain - a.gain);
  // One genome upload answers every row at once, so only the best-scoring of
  // its candidates survives the sort.
  let genome = false;
  const out = moves.filter((move) => {
    if (move.testId !== "genome_file") return true;
    if (genome) return false;
    genome = true;
    return true;
  });
  return opts.max != null ? out.slice(0, opts.max) : out;
}
