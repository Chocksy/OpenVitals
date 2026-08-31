/**
 * What to ask or measure next, chosen by how much it would shrink the whole
 * differential rather than by how much it moves one card.
 *
 * Every candidate is simulated: the outcome is written into a copy of the
 * input with the same overlay the Simulate button uses, the engine re-scores,
 * and the drop in entropy is the gain. Divide by cost and the ordering falls
 * out. Pure, deterministic, no LLM and no clock.
 */
import { coverage, profileQuestions, type ModelInput } from "./coverage";
import { GENOME_CATALOG } from "./genome-catalog";
import {
  countryOf,
  discriminatorApplies,
  scoreHypotheses,
  type Catalog,
  type Discriminator,
  type EvidenceRule,
  type HypothesisResult,
  type Lens,
} from "./hypotheses";
import { BAND_EUR, MIN_EUR, priceOf, ratioOf } from "./prices";
import { applyOverlay, EMPTY_OVERLAY, type Overlay } from "./sample";
import { SYMPTOMS } from "./symptoms";
import { PROFILE_QUESTIONS } from "./vectors";

export interface Belief {
  id: string;
  p: number;
}

export interface Move {
  kind: "question" | "test";
  /** a test that is not on any one condition's list: the exome, so far */
  specialPath?: "exome";
  /**
   * This move follows a signal: some condition is already several times above
   * its own base rate and this test would settle it either way.
   */
  pursue?: true;
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
   * How much probability this move is expected to move in total, summed over
   * every condition: the size of the answer in the units the cards print,
   * rather than in bits. The quiet floor divides it by the price.
   */
  shift: number;
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

/**
 * A signal, and a test that would settle it.
 *
 * Information gain over the whole differential is measured in bits, and bits
 * belong to whatever sits nearest a coin flip. A condition at seven in a
 * thousand contributes six hundredths of a bit however lethal it is, so a
 * morning cortisol for somebody with a low sodium, a high potassium and salt
 * craving ranked below a repeat TSH: the arithmetic could see the thyroid and
 * could not see Addison's.
 *
 * So a move is "pursuing" when both halves are true: something the person's
 * own data has already lifted several times above its base rate, and a test
 * whose two answers are at least twenty-fold apart for that same condition.
 * Pursuing moves are ranked first, and among themselves by gain per euro as
 * before. It is what a clinician does with a signal, and it is the only place
 * the ordering is not pure information theory.
 */
const PURSUE_LIFT = 2.5;
const PURSUE_SPREAD = 20;

/**
 * When to stop asking a well person questions.
 *
 * `lib/tree.ts` has had this floor since phase 10: below `QUIET_BELIEF` there
 * is nothing on the table, and a move that shifts the whole differential by
 * less than `QUIET_GAIN` bits is not worth a needle. `nextMoves` never applied
 * it, so a healthy 28-year-old with a complete normal panel was still offered
 * an OGTT, a FibroScan and a VO2max: €357 of tests to find nothing. The same
 * two numbers now gate the path, and `QUIET_RATIO` drops the tests whose
 * expected movement per euro is dust.
 */
export const QUIET_BELIEF = 0.25;
export const QUIET_GAIN = 0.15;
/**
 * Expected probability movement per euro, not bits per euro. At 0.005 a €10
 * blood test has to be worth five points of probability and an €80 scan forty,
 * which is the difference between "worth a look" and "selling a well person a
 * CT". Only ever applied while nothing is above its own base rate.
 */
export const QUIET_RATIO = 0.005;

/**
 * How much of the tier-0 and tier-1 core has to be on file before "nothing is
 * happening" means anything. Four fifths: a person with a full annual panel
 * and three gaps has been looked at; a person with nothing has not.
 */
export const LOOKED = 0.8;

/** What a move costs in euros: a list price, else the cost band's nominal one. */
export const eurOf = (move: Pick<Move, "cost" | "priced">): number =>
  move.priced ? move.cost : (BAND_EUR[move.cost] ?? move.cost * 30);

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
  specialPath?: Move["specialPath"];
  /** lrPos/lrNeg for a test: how decisive the answer is, either way */
  spread?: number;
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

/**
 * Sequencing as a move of its own.
 *
 * It belongs to no single condition, so no discriminator can carry it: it is
 * proposed when the differential itself says a single-gene disease is on the
 * table, which is exactly when a specialist would order it. The row lives in
 * `hkb_tests` like any other test (the seed writes it), and the page prints
 * it with a "special path" chip rather than in the ordinary queue.
 */
export const EXOME_TEST = {
  id: "exome_sequencing",
  name: "Exome sequencing",
  /** invasiveness band 4: a blood tube, but a decision that needs consent */
  cost: 4 as const,
  costByCountry: { RO: 600 },
  lrPos: 20,
  lrNeg: 0.3,
  howTo:
    "A blood tube and a consent conversation, reported in six to twelve weeks by a genetics service. It answers every single-gene disease at once, including the ones nobody thought of, and it is the only test on this list that can come back with something you did not ask about.",
};

/**
 * The gene each single-gene catalog condition is answered by, and the registry
 * of which conditions those are. It lives in code rather than on the condition
 * row because it is the exome's own list: a condition is "monogenic" here
 * exactly when sequencing would settle it.
 */
const MONOGENIC_GENE: Record<string, string> = {
  fabry: "gla",
  wilson: "atp7b",
  a1at_deficiency: "serpina1",
};

/**
 * How far above its own base rate a single-gene disease has to be lifted
 * before sequencing is a reasonable thing to propose: ten-fold for two of
 * them at once, thirty-fold for one on its own, or ten-fold for one alongside
 * a red marker nothing in ring 1 explains.
 */
const RAISED = 10;
const RAISED_ALONE = 30;

/**
 * The exome, once the differential has earned it: two single-gene diseases
 * lifted well above their base rates, or one of them plus a red marker that
 * nothing in ring 1 explains. Below that it is a €600 answer to a question
 * nobody asked.
 */
function exomeCandidates(
  m: ModelInput,
  catalog: Catalog,
  rows: HypothesisResult[],
): Candidate[] {
  const answered = Object.keys(MONOGENIC_GENE).some(
    (id) =>
      String(m.profile[`genome:${MONOGENIC_GENE[id]}`] ?? "").trim() !== "",
  );
  if (answered) return [];

  const byId = new Map(rows.map((r) => [r.id, r]));

  const raised = catalog.filter((h) => {
    const r = byId.get(h.id);
    return (
      MONOGENIC_GENE[h.id] != null && r != null && r.score >= r.prior * RAISED
    );
  });
  const explained = new Set(
    rows.flatMap((r) => (r.score >= POSSIBLE ? r.for.map((f) => f.input) : [])),
  );
  const unresolved = Object.entries(m.latest).some(
    ([code, v]) => v.status === "red" && !explained.has(code),
  );
  const first = raised[0] ? byId.get(raised[0].id) : undefined;
  const alone =
    raised.length === 1 &&
    (unresolved ||
      (first != null && first.score >= first.prior * RAISED_ALONE));
  if (raised.length < 2 && !alone) return [];

  const country = countryOf(m);
  const price = country ? EXOME_TEST.costByCountry[country as "RO"] : undefined;
  return raised.map((h) => ({
    kind: "test" as const,
    specialPath: "exome" as const,
    featureId: `fact:genome:${MONOGENIC_GENE[h.id]}`,
    testId: EXOME_TEST.id,
    label: EXOME_TEST.name,
    howTo: `${EXOME_TEST.howTo} Here it is on the table because ${raised
      .map((x) => x.name)
      .join(" and ")} would each be settled by it.`,
    cost: price ?? EXOME_TEST.cost,
    priced: price != null,
    readers: raised.map((x) => x.id),
    spread: EXOME_TEST.lrPos / EXOME_TEST.lrNeg,
    outcomes: [
      {
        label: `pathogenic ${MONOGENIC_GENE[h.id]!.toUpperCase()} variant`,
        apply: overlayOf({
          facts: {
            [`genome:${MONOGENIC_GENE[h.id]}`]: `pathogenic variant in ${MONOGENIC_GENE[h.id]!.toUpperCase()}`,
          },
        }),
      },
      {
        label: "nothing reportable",
        apply: overlayOf({
          facts: {
            [`genome:${MONOGENIC_GENE[h.id]}`]: "no reportable variant",
          },
        }),
      },
    ],
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
      // A test the person is not a candidate for is not a move. Same gate the
      // engine scores with, so the path and the cards agree.
      if (!discriminatorApplies(d, m)) continue;
      if (d.typicalPos == null || d.typicalNeg == null) continue;
      const key = d.codes.slice().sort().join("+");
      const found = byCodes.get(key);
      if (!found) byCodes.set(key, { d, readers: [h.id] });
      else {
        found.readers.push(h.id);
        // One draw, several readings of it: the one a person would actually
        // buy sets the label and the price, and that is the cheapest. Ties go
        // to the stronger likelihood ratio. ponytail: taking the strongest
        // instead used to file the everyday lipid panel under "Repeat LDL off
        // any treatment" at twice the price, which is how a €10 panel ended up
        // ranked below a €80 CT.
        const price = (x: Discriminator) =>
          priceOf(x, country) ?? BAND_EUR[x.cost] ?? x.cost * 30;
        const cheaper = price(d) - price(found.d);
        if (cheaper < 0 || (cheaper === 0 && d.lrPos > found.d.lrPos))
          found.d = d;
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
      spread: d.lrNeg > 0 ? d.lrPos / d.lrNeg : Infinity,
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
  const rows = scoreHypotheses(m, { catalog, lens });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Markers that are out of range and that no condition at "possible" or
  // better reads. `lib/wake.ts` asks the same question of the same numbers.
  const base = beliefsOf(rows);
  const baseP = new Map(base.map((b) => [b.id, b.p]));
  const entropyBefore = entropyOf(base);

  const moves: Move[] = [];
  for (const c of [
    ...questionCandidates(m, catalog),
    ...testCandidates(m, catalog, m.today),
    ...genomeCandidates(m, catalog, baseP),
    ...exomeCandidates(m, catalog, rows),
  ]) {
    if (exclude.has(c.featureId) || (c.testId && exclude.has(c.testId)))
      continue;

    const pursued =
      c.spread != null &&
      c.spread >= PURSUE_SPREAD &&
      c.readers.some((id) => {
        const r = byId.get(id);
        return r != null && r.prior > 0 && r.score >= r.prior * PURSUE_LIFT;
      });

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
    // A question costs nothing, so any answer at all is worth having: the
    // floor here is what used to drop "do your hands burn in the heat?" for a
    // disease sitting at one in forty thousand, which is the only question
    // that would ever have lifted it.
    // The floor is for tests nobody is following. A question costs nothing, and
    // a test that would settle a signal is worth listing however few bits it
    // buys: a ceruloplasmin for a Wilson disease at one in thirty thousand
    // moves the whole differential by a ten-thousandth of a bit.
    if (c.cost > 0 && !pursued && gain <= 0.0005) continue;

    const ids = [
      ...new Set([
        ...baseP.keys(),
        ...outcomes.flatMap((o) => o.beliefs.map((b) => b.id)),
      ]),
    ];
    let total = 0;
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
        total += shift;
        return { id, from: round3(from), to: round3(furthest.p), shift };
      })
      .filter((x) => x.shift >= 0.001)
      .sort((a, b) => b.shift - a.shift)
      .slice(0, 5)
      .map(({ id, from, to }) => ({ id, from, to }));

    moves.push({
      kind: c.kind,
      ...(pursued ? { pursue: true as const } : {}),
      ...(c.specialPath ? { specialPath: c.specialPath } : {}),
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
      shift: round3(total),
      moves: movement,
    });
  }

  // Nothing on the table: only a move that would really move something is
  // worth making. A free question still counts, because it costs nothing.
  //
  // "On the table" means something this person's own data lifted to possible.
  // A standing risk that sits at its base rate for everybody (`ascvd_risk` is
  // 25 % the day you are born) is not a finding, and counting it kept the
  // floor from ever closing: a healthy 28-year-old with a normal panel was
  // still sold a sleep study, an OGTT with insulin and a liver ultrasound.
  //
  // And it only closes once somebody has actually looked: a person with no
  // annual panel at all is quiet the way an unopened envelope is quiet, so a
  // tier-0 or tier-1 vector that has never been measured keeps the floor open.
  //
  // And a live belief only keeps it open while something on the list would
  // actually move it. Phase 21: gating mammography to women left a
  // 41-year-old man with "your screening is overdue" at 80 % and no test he
  // is old enough to take, and that unsettleable belief then justified an
  // OGTT, a liver ultrasound and a colonoscopy — €600 of looking at the wrong
  // thing. A question nobody can answer is not a reason to keep testing.
  const core = coverage(m).filter((r) => r.vector.tier <= 1);
  const seen = core.filter((r) => r.state !== "never").length;
  const unlooked = !core.length || seen / core.length < LOOKED;
  const movable = new Set(moves.flatMap((mv) => mv.moves.map((x) => x.id)));
  const quiet =
    !unlooked &&
    !rows.some(
      (r) =>
        r.score >= QUIET_BELIEF &&
        r.score > r.prior + 1e-9 &&
        movable.has(r.id),
    );
  const worthIt = (move: Move) =>
    !quiet ||
    move.pursue ||
    move.cost === 0 ||
    (move.gain >= QUIET_GAIN &&
      move.shift / Math.max(eurOf(move), MIN_EUR) >= QUIET_RATIO);

  // A signal first, then everything that is free, then everything that is
  // paid for. A question costs a minute and no euros, so any question worth
  // asking at all is worth asking before a needle goes in.
  //
  // Inside the pursuing bucket the order is by price, cheapest first, and not
  // by gain per euro: bits belong to whatever is nearest a coin flip, so a
  // €96 genotype for a condition at four in a thousand will always out-score
  // a €10 ceruloplasmin for one at three in a hundred thousand. Following a
  // signal means taking the cheapest decisive test first.
  const rank = (mv: Move) => (mv.pursue ? 2 : mv.cost === 0 ? 1 : 0);
  moves.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      (a.pursue && b.pursue ? eurOf(a) - eurOf(b) : 0) ||
      b.ratio - a.ratio ||
      b.gain - a.gain,
  );
  // One genome upload answers every row at once, so only the best-scoring of
  // its candidates survives the sort.
  let genome = false;
  let exome = false;
  const out = moves.filter((move) => {
    if (!worthIt(move)) return false;
    if (move.testId === EXOME_TEST.id) {
      if (exome) return false;
      exome = true;
      return true;
    }
    if (move.testId !== "genome_file") return true;
    if (genome) return false;
    genome = true;
    return true;
  });
  return opts.max != null ? out.slice(0, opts.max) : out;
}
