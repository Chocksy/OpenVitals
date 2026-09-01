/**
 * The ask box: "Ask about anything — a disease, a symptom, a word".
 *
 * Trigger 5 of the five in `lib/wake.ts`, and the only one a person pulls
 * rather than the data pushing. Free text goes in, and what comes back is
 * deterministic: what it matched in the ontology, where that sits for this
 * person (which ring, woken or not, the probability if it is scored), and the
 * questions or tests that would move it. One optional LLM sentence rewrites
 * the answer in plain language; it never decides any of it.
 *
 * Search resolution: Postgres `pg_trgm` over `hkb_terms.name` and its
 * synonyms. No embeddings and no pgvector — a disease name is a short string
 * and trigram similarity is what short strings are for. `rankTerms` is pure,
 * so the whole ranking is testable with no database.
 */
import { generateObject, generateText } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  hkbAnnotations,
  hkbConditions,
  hkbEvidence,
  hkbInterventions,
  hkbTerms,
  userConditions,
} from "@/db";
import { actionLine, actionsFor, type PlanLine } from "./actions";
import { chatContext } from "./ai";
import {
  CITES_SOURCES,
  questionKind,
  termQuery,
  type QuestionKind,
} from "./ask-intent";
import { settlesOf } from "./bubbles";
import { buildModelInput, profileQuestions, type ModelInput } from "./coverage";
import { explainKey } from "./explain";
import { model } from "./extract";
import { catalogFor } from "./hkb";
import { FREQUENT, frequencyOf } from "./hpoa";
import { scoreHypotheses, type HState } from "./hypotheses";
import { nextMoves, type Move } from "./infogain";
import { loadGraph } from "./kg";
import { displayNameOf, metricCodesOf } from "./ledger";
import { RETEST_WEEKS } from "./projection";
import { ledgerLine, projectionsFor } from "./projections";
import { symptomByKey } from "./symptoms";
import { PROFILE_QUESTIONS } from "./vectors";
import { backgroundFor, ensureRing2, wake } from "./wake";

/* ── the pure half ────────────────────────────────────────────────────── */

export interface TermRow {
  id: string;
  ontology: string;
  name: string;
  synonyms: string[] | null;
}

export interface RankedTerm extends TermRow {
  score: number;
  /** the synonym that matched, when the primary name did not */
  via?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Names MONDO carries for animals and for research models. A person typing
 * "haemochromatosis" does not mean the dog one, and trigram similarity has no
 * opinion about that, so this does.
 */
const NOT_HUMAN =
  /\b(dog|cat|canine|feline|bovine|equine|murine|mouse|rat|porcine|avian|zebrafish)\b/;

/** Crude but honest: how much of the query the candidate actually contains. */
function overlap(query: string, candidate: string): number {
  const q = norm(query);
  const c = norm(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(`${q} `) || c.endsWith(` ${q}`) || c.includes(` ${q} `))
    return 0.9;
  if (c.includes(q)) return 0.8;
  const words = q.split(" ");
  const hit = words.filter((w) => w.length > 2 && c.includes(w)).length;
  return words.length ? (hit / words.length) * 0.6 : 0;
}

/**
 * Rank the candidates the database found.
 *
 * An exact name wins, then a name that contains the query, then a synonym that
 * does. Shorter names win ties, because MONDO's short names are the diseases
 * and its long ones are the subtypes. Animal diseases are pushed to the bottom
 * rather than dropped: somebody may actually mean them.
 */
export function rankTerms(query: string, rows: TermRow[]): RankedTerm[] {
  const out: RankedTerm[] = [];
  for (const row of rows) {
    const byName = overlap(query, row.name);
    let best = byName;
    let via: string | undefined;
    for (const s of row.synonyms ?? []) {
      // A synonym is a second-class match: two diseases can share one.
      const score = overlap(query, s) * 0.95;
      if (score > best) ((best = score), (via = s));
    }
    if (best <= 0) continue;
    const penalty = NOT_HUMAN.test(row.name.toLowerCase()) ? 0.3 : 1;
    const brevity = 1 / (1 + norm(row.name).length / 120);
    out.push({
      ...row,
      via,
      score: Math.round(best * penalty * brevity * 1000) / 1000,
    });
  }
  return out
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.name.length - b.name.length ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 8);
}

/**
 * The same word on both sides of the Atlantic. MONDO writes "hemochromatosis"
 * and the catalog writes "haemochromatosis"; without this the ask box tells a
 * person their own ring-1 condition is not in the engine.
 */
const spelling = (s: string) =>
  norm(s)
    .replace(/ae/g, "e")
    .replace(/oe/g, "e")
    .replace(/\bdisorder\b/g, "disease");

/* ── the search ───────────────────────────────────────────────────────── */

/**
 * The candidates, from `pg_trgm`. The `%` operator rides the GIN index built
 * in migration 0013; the synonym half rides the one in 0014.
 */
export async function searchTerms(query: string): Promise<RankedTerm[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const rows = await getDb()
    .select({
      id: hkbTerms.id,
      ontology: hkbTerms.ontology,
      name: hkbTerms.name,
      synonyms: hkbTerms.synonyms,
    })
    .from(hkbTerms)
    .where(
      sql`lower(${hkbTerms.name}) % ${q}
        or lower(${hkbTerms.name}) like ${`%${q}%`}
        or lower(${hkbTerms.synonyms}::text) like ${`%${q}%`}`,
    )
    .limit(200);
  return rankTerms(query, rows as TermRow[]);
}

/* ── the answer ───────────────────────────────────────────────────────── */

export interface AskAnswer {
  /** what the search matched, best first */
  matches: RankedTerm[];
  term: RankedTerm | null;
  /** the `hkb_conditions` row, when the term is one */
  condition: {
    id: string;
    name: string;
    ring: number;
    inCatalog: boolean;
    prior: number | null;
    priorSource: string | null;
  } | null;
  /** awake | dismissed | null */
  woken: { status: string; trigger: string; note: string | null } | null;
  probability: number | null;
  state: HState | null;
  /** the questions and tests that would move it, cheapest first */
  moves: { kind: string; label: string; cost: number; why: string }[];
  /** for an HPO term: whether this person already answers it */
  finding: { present: boolean | null; because: string | null } | null;
  /** can "Consider this for me" do anything? */
  canConsider: boolean;
  /** one plain sentence, when the model wrote one */
  sentence?: string;
  /** the grounded reply, when the box was asked a question rather than a word */
  reply?: string;
  /**
   * Where the named condition stands for this person, right now: the one row
   * the question route prints above the answer. Never an ontology header.
   */
  now?: {
    id: string;
    name: string;
    state: HState;
    probability: number;
  } | null;
  /** the actions the answer was written from, so the UI can offer them */
  actions?: PlanLine[];
  /** what the answer told them to do, as things the buttons can actually do */
  acts?: Acts;
  /** which question was asked, decided in code by `questionKind` */
  kind?: QuestionKind;
  /** the rows the answer cited, after the guard: the "Sources" line */
  sources?: SourceCandidate[];
  /** every row the answer was allowed to cite, for `pnpm eval:ask` */
  sourcesOffered?: SourceCandidate[];
  /** what each offered test would settle, in the words the prompt used */
  settlesOffered?: string[];
  /** what the router did with the input: a word, or a question */
  route?: "term" | "question";
}

/** No word was looked up at all: what Discuss hands the question route. */
export const emptyAnswer = (): AskAnswer => ({
  matches: [],
  term: null,
  condition: null,
  woken: null,
  probability: null,
  state: null,
  moves: [],
  finding: null,
  canConsider: false,
});

/**
 * Everything the reply prints, computed from the engine and nothing else.
 *
 * A MONDO term that is already ring 1 answers with its live probability. One
 * that is ring 2 and awake answers the same way. One that is asleep answers
 * with its prior and the questions that would move it, which is exactly the
 * information the "Consider this for me" button is asking you to spend.
 */
export async function answerAsk(
  userId: string,
  query: string,
): Promise<AskAnswer> {
  const matches = await searchTerms(query);
  const term = matches[0] ?? null;
  const empty: AskAnswer = {
    matches,
    term,
    condition: null,
    woken: null,
    probability: null,
    state: null,
    moves: [],
    finding: null,
    canConsider: false,
  };
  if (!term) return empty;

  const db = getDb();
  const input = await buildModelInput(userId);

  if (term.ontology === "HP") {
    const back = backgroundFor(term.id);
    let present: boolean | null = null;
    let because: string | null = null;
    if (back) {
      if (back.featureId.startsWith("metric:")) {
        const code = back.featureId.slice("metric:".length);
        const v = input.latest[code]?.value ?? null;
        present =
          v == null
            ? null
            : (back.when.above == null || v > (back.when.above as number)) &&
              (back.when.below == null || v < (back.when.below as number));
        because = v == null ? null : `${code.replace(/_/g, " ")} ${v}`;
      } else {
        const key = back.featureId.slice("fact:".length);
        const raw = input.profile[key];
        because = raw == null ? null : String(raw);
        present = raw == null ? null : true;
      }
    }
    return { ...empty, finding: { present, because } };
  }

  const [byMondo] = await db
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      ring: hkbConditions.ring,
      inCatalog: hkbConditions.inCatalog,
    })
    .from(hkbConditions)
    .where(eq(hkbConditions.mondoId, term.id))
    .limit(1);

  // MONDO splits what a person means into a family: "haemochromatosis" is
  // MONDO:0006507 and the catalog row is MONDO:0021001, type 1. So when the
  // exact id is not a condition, the ring-1 catalog is matched by name — the
  // same rule a document diagnosis goes through in `lib/documents.ts`.
  const ringOne = byMondo
    ? []
    : await db
        .select({
          id: hkbConditions.id,
          name: hkbConditions.name,
          ring: hkbConditions.ring,
          inCatalog: hkbConditions.inCatalog,
          mondoId: hkbConditions.mondoId,
        })
        .from(hkbConditions)
        .where(eq(hkbConditions.ring, 1));
  const condition =
    byMondo ??
    ringOne.find(
      (c) =>
        spelling(term.name) === spelling(c.name) ||
        spelling(term.name).includes(spelling(c.name)),
    );

  const [woken] = condition
    ? await db
        .select({
          status: userConditions.status,
          trigger: userConditions.trigger,
          note: userConditions.note,
        })
        .from(userConditions)
        .where(
          and(
            eq(userConditions.userId, userId),
            eq(userConditions.conditionId, condition.id),
          ),
        )
        .limit(1)
    : [];

  const catalog = await catalogFor(userId);
  const spec = condition ? catalog.find((h) => h.id === condition.id) : null;
  const scored = spec ? scoreHypotheses(input, { catalog }) : [];
  const mine = spec ? scored.find((h) => h.id === spec.id) : null;

  const live = spec
    ? nextMoves(input, catalog)
        .filter((m) => m.moves.some((x) => x.id === spec.id))
        .slice(0, 5)
        .map((m) => ({
          kind: m.kind,
          label: m.label,
          cost: m.cost,
          why: whyMove(m, spec.id),
        }))
    : [];
  // A woken rare disease often has no discriminator priced in `hkb_tests` yet,
  // so the information-gain engine has nothing to offer. Its own HPOA
  // phenotypes still do: those are the questions the box promised.
  const moves = live.length ? live : await sleepingMoves(term.id, input);

  return {
    ...empty,
    condition: condition
      ? {
          ...condition,
          prior: mine?.prior ?? null,
          priorSource: mine?.priorSource ?? null,
        }
      : null,
    woken: woken ?? null,
    probability: mine?.score ?? null,
    state: mine?.state ?? null,
    moves,
    canConsider: !mine || woken?.status === "dismissed",
  };
}

/**
 * What a still-asleep disease would ask you, without waking it: its own HPOA
 * phenotypes, over the questions this app already knows how to ask.
 */
async function sleepingMoves(
  mondoId: string,
  m: ModelInput,
): Promise<AskAnswer["moves"]> {
  const db = getDb();
  const [term] = await db
    .select({ xrefs: hkbTerms.xrefs })
    .from(hkbTerms)
    .where(eq(hkbTerms.id, mondoId))
    .limit(1);
  const diseaseIds = (term?.xrefs ?? [])
    .map((x) => x.replace("Orphanet:", "ORPHA:"))
    .filter((x) => x.startsWith("OMIM:") || x.startsWith("ORPHA:"));
  if (!diseaseIds.length) return [];

  const rows = await db
    .select({
      hpoId: hkbAnnotations.hpoId,
      frequency: hkbAnnotations.frequency,
    })
    .from(hkbAnnotations)
    .where(sql`${hkbAnnotations.diseaseId} in ${diseaseIds}`);

  const seen = new Set<string>();
  const out: AskAnswer["moves"] = [];
  for (const r of rows) {
    const f = frequencyOf(r.frequency ?? undefined);
    if (f == null || f < FREQUENT) continue;
    const back = backgroundFor(r.hpoId);
    if (!back || seen.has(back.featureId)) continue;
    seen.add(back.featureId);
    if (back.featureId.startsWith("fact:")) {
      const key = back.featureId.slice("fact:".length);
      const q = PROFILE_QUESTIONS[key];
      if (!q) continue;
      // Never preview a question this person cannot be asked: the cycle
      // question does not exist for a man.
      const gate = symptomByKey(key)?.appliesTo;
      if (gate?.sex && m.sex !== gate.sex) continue;
      out.push({
        kind: "question",
        label: q.question,
        cost: 0,
        why: `${Math.round(f * 100)} % of people with this disease answer yes; ${Math.round(back.p * 100)} % of everybody does.`,
      });
    } else {
      const code = back.featureId.slice("metric:".length);
      out.push({
        kind: "test",
        label: code.replace(/_/g, " "),
        cost: 1,
        why: `${Math.round(f * 100)} % of people with this disease are outside the band; ${Math.round(back.p * 100)} % of everybody is.`,
      });
    }
  }
  return out.sort((a, b) => a.cost - b.cost).slice(0, 6);
}

/** "moves it from 4 % to 22 %", straight off the information-gain result. */
const whyMove = (m: Move, conditionId: string): string => {
  const hit = m.moves.find((x) => x.id === conditionId);
  return hit
    ? `moves it from ${(hit.from * 100).toFixed(1)} % to ${(hit.to * 100).toFixed(1)} %${m.howTo ? `. ${m.howTo}` : ""}`
    : (m.howTo ?? "");
};

/* ── the one optional sentence ────────────────────────────────────────── */

const ASK_SYSTEM =
  "You are explaining one line of a health app to its owner. You are given a question and the engine's own answer as JSON. Write ONE sentence, under 30 words, plain English, no hedging boilerplate, no advice. State what the thing is and where it stands for this person. Never invent a number: use only the numbers in the JSON.";

/**
 * Plain language over the top of the answer, and nothing else. The engine has
 * already decided every number; if the model is unavailable the box still
 * works, which is why every caller catches.
 */
export async function plainSentence(
  query: string,
  answer: AskAnswer,
): Promise<string | undefined> {
  if (!process.env.OPENROUTER_API_KEY) return undefined;
  const { text } = await generateText({
    model: model(),
    system: ASK_SYSTEM,
    prompt: `THE QUESTION: ${query}\n\nTHE ENGINE'S ANSWER:\n${JSON.stringify(
      {
        matched: answer.term?.name,
        ontology: answer.term?.ontology,
        ring: answer.condition?.ring,
        inCatalog: answer.condition?.inCatalog,
        woken: answer.woken?.status ?? null,
        probability: answer.probability,
        state: answer.state,
        prior: answer.condition?.prior,
        finding: answer.finding,
        movesItMost: answer.moves[0]?.label ?? null,
      },
      null,
      1,
    )}`,
  });
  return text.trim().split("\n")[0];
}

/* ── "Consider this for me" ───────────────────────────────────────────── */

/* ── phase 27: the candidates, and the closed set they are ────────────── */

/** One marker the answer may say to measure, with the wait the engine keeps. */
export interface TestCandidate {
  code: string;
  /** the name a person reads: "Ferritin", "OGTT with insulin" */
  name: string;
  /** `RETEST_WEEKS` for this marker, or the default */
  weeks: number;
  /** false when only a doctor can order it: cost band 3 or 4 */
  selfOrder: boolean;
}

/**
 * One row the answer is allowed to cite: an `hkb_evidence` rule or an
 * `hkb_interventions` row, with the name a person would recognise.
 *
 * Phase 28a. "What does the research say?" used to be answered out of the
 * model's own memory, because the prompt never carried a paper. Now it does,
 * and the guard is the same one phase 27 put on actions: the model returns
 * ids, and an id it was not given is dropped rather than printed.
 */
export interface SourceCandidate {
  /** `hkb_evidence.id` or `hkb_interventions.id` */
  id: string;
  /** "ATA 2014 hypothyroidism guideline", or the paper's title */
  name: string;
  year: number | null;
  grade: string;
  kind: "evidence" | "intervention";
  /** what the row actually says, for the prompt */
  says: string;
  /** the sentence the intake kept, for the hover */
  quote: string | null;
}

/** One `kg_edges` row as the one line a "why" answer reads it from. */
export interface MechanismLine {
  id: string;
  from: string;
  to: string;
  relation: string;
  /** the graph writes no grade on a few edges; those sort last */
  grade?: string;
  mechanism: string;
}

/** Everything the answer is allowed to name, by id, by code and by key. */
export interface AskCandidates {
  actions: PlanLine[];
  tests: TestCandidate[];
  questions: { key: string; question: string }[];
  /** the papers and guidelines a research or prognosis answer may cite */
  sources: SourceCandidate[];
}

/** What the answer actually named, with the labels the buttons print. */
export interface Acts {
  actions: PlanLine[];
  tests: TestCandidate[];
  questions: { key: string; question: string }[];
  /** the rows the answer cited, in the order it cited them */
  sources: SourceCandidate[];
  /** every id, code or key the model returned that was never on offer */
  dropped: string[];
}

/** The model's half of it, before the guard has been anywhere near it. */
export interface RawActs {
  actions?: string[];
  tests?: { code?: string; weeks?: number }[];
  questions?: string[];
  sources?: string[];
}

/** How much of each list the prompt may carry. */
const MAX_TESTS = 30;
const MAX_QUESTIONS = 12;
/** The spec's number: the eight best-graded rows for the named condition. */
const MAX_SOURCES = 8;
/** A marker with no entry in `RETEST_WEEKS`: three months, like most of them. */
const DEFAULT_WEEKS = 12;
/** Two years. Anything past it is the model inventing a schedule. */
const MAX_WEEKS = 104;

/**
 * The closed set, assembled from what the engine already knows.
 *
 * Pure. The tests are the information-gain moves first — those are the ones
 * the engine would spend money on next — and then every marker this person has
 * a value for, because "measure it again" only means something for a number
 * that already exists. A move carries the discriminator's own 1–4 band, and
 * band 3 or 4 is the one thing a person cannot walk into a lab and buy.
 */
export function askCandidates({
  actions,
  measured,
  moves,
  questions,
  sources = [],
}: {
  actions: PlanLine[];
  /** every marker code this person has a value for */
  measured: string[];
  moves: Move[];
  questions: { key: string; question: string }[];
  sources?: SourceCandidate[];
}): AskCandidates {
  const tests = new Map<string, TestCandidate>();
  const add = (code: string, name: string, selfOrder: boolean) => {
    if (!code || tests.has(code) || tests.size >= MAX_TESTS) return;
    tests.set(code, {
      code,
      name,
      weeks: RETEST_WEEKS[code] ?? DEFAULT_WEEKS,
      selfOrder,
    });
  };
  for (const m of moves) {
    if (m.kind !== "test" || !m.featureId.startsWith("metric:")) continue;
    add(m.featureId.slice("metric:".length), m.label, (m.band ?? 1) <= 2);
  }
  for (const code of [...measured].sort()) add(code, explainKey(code), true);
  return {
    actions,
    tests: [...tests.values()],
    questions: questions.slice(0, MAX_QUESTIONS),
    sources: sources.slice(0, MAX_SOURCES),
  };
}

/**
 * The guard. Principle 3, as a function: the model chooses from the ids it was
 * given and the engine owns every button, so anything it returns that was not
 * on offer is dropped here and counted in `dropped`, which `pnpm eval:ask`
 * reads as a violation.
 */
export function pickActs(raw: RawActs, c: AskCandidates): Acts {
  const dropped: string[] = [];
  const byId = new Map(c.actions.map((a) => [a.id, a]));
  const byCode = new Map(c.tests.map((t) => [t.code, t]));
  const byKey = new Map(c.questions.map((q) => [q.key, q]));

  const actions: PlanLine[] = [];
  for (const raw_id of raw.actions ?? []) {
    const id = String(raw_id ?? "");
    const hit = byId.get(id);
    if (!hit) dropped.push(id);
    else if (!actions.includes(hit)) actions.push(hit);
  }

  const tests: TestCandidate[] = [];
  for (const t of raw.tests ?? []) {
    const code = String(t?.code ?? "");
    const hit = byCode.get(code);
    if (!hit) {
      dropped.push(code);
      continue;
    }
    if (tests.some((x) => x.code === code)) continue;
    const weeks = Number(t?.weeks);
    tests.push({
      ...hit,
      weeks:
        Number.isFinite(weeks) && weeks >= 1 && weeks <= MAX_WEEKS
          ? Math.round(weeks)
          : hit.weeks,
    });
  }

  const questions: { key: string; question: string }[] = [];
  for (const raw_key of raw.questions ?? []) {
    const key = String(raw_key ?? "");
    const hit = byKey.get(key);
    if (!hit) dropped.push(key);
    else if (!questions.includes(hit)) questions.push(hit);
  }

  const bySource = new Map(c.sources.map((s) => [s.id, s]));
  const sources: SourceCandidate[] = [];
  for (const raw_source of raw.sources ?? []) {
    const id = String(raw_source ?? "");
    const hit = bySource.get(id);
    if (!hit) dropped.push(id);
    else if (!sources.includes(hit)) sources.push(hit);
  }

  return { actions, tests, questions, sources, dropped };
}

/** Nothing to act on: the row renders nothing at all. */
export const noActs = (a?: Acts | null): boolean =>
  !a || (!a.actions.length && !a.tests.length && !a.questions.length);

/* ── phase 28a: the rows a research or prognosis answer reads from ────── */

/** A/B/C/D/E, best first; anything else sorts last. */
const GRADE_RANK = (g?: string) => {
  const i = "ABCDE".indexOf((g ?? "").toUpperCase());
  return i < 0 ? 9 : i;
};

/** The year in a seed's own sentence: "ATA 2014 hypothyroidism guideline". */
const yearIn = (s: string): number | null => {
  const m = /\b(19|20)\d{2}\b/.exec(s ?? "");
  return m ? Number(m[0]) : null;
};

/**
 * One `hkb_evidence` row as a citation.
 *
 * The seeds write the source as "Rodondi 2010 JAMA: TSH above 4.5 is …", so
 * the name is what comes before the colon and the claim is what comes after.
 * A row with no colon is its own name and its own claim.
 */
export function evidenceSource(r: {
  id: string;
  source: string | null;
  grade: string;
  featureId: string;
  lrPos: number | string | null;
  paper?: unknown;
}): SourceCandidate {
  const text = (r.source ?? "").trim();
  const cut = text.indexOf(":");
  const name = (cut > 0 ? text.slice(0, cut) : text) || r.featureId;
  const says = cut > 0 ? text.slice(cut + 1).trim() : text;
  const paper = (r.paper ?? null) as { year?: number; title?: string } | null;
  return {
    id: r.id,
    name: paper?.title ? name || paper.title : name,
    year: paper?.year ?? yearIn(name),
    grade: r.grade,
    kind: "evidence",
    says: `${explainKey(r.featureId.replace(/^(metric|fact):/, ""))}: ${says}${
      r.lrPos == null ? "" : ` (LR+ ${r.lrPos})`
    }`,
    quote: null,
  };
}

/** One `hkb_interventions` row as a citation. */
export function interventionSource(r: {
  id: string;
  name: string;
  effect: string | null;
  dose: string | null;
  grade: string;
  population: string | null;
  quote: string | null;
  paper?: unknown;
}): SourceCandidate {
  const paper = (r.paper ?? null) as { year?: number; title?: string } | null;
  return {
    id: r.id,
    name: paper?.title ?? r.name,
    year: paper?.year ?? null,
    grade: r.grade,
    kind: "intervention",
    says: [r.name, r.dose, r.effect, r.population ? `in ${r.population}` : null]
      .filter(Boolean)
      .join(" · "),
    quote: r.quote,
  };
}

/** Best grade first, then the newer paper. Ties keep the database's order. */
export const rankSources = (rows: SourceCandidate[]): SourceCandidate[] =>
  [...rows].sort(
    (a, b) =>
      GRADE_RANK(a.grade) - GRADE_RANK(b.grade) ||
      (b.year ?? 0) - (a.year ?? 0),
  );

/**
 * Which markers the question actually named.
 *
 * "why is my LDL high?" has to reach `ldl_cholesterol` and not `hdl_
 * cholesterol`, so a code scores one point per word of its own name that is in
 * the question, and only the best-scoring codes come back. Pure.
 */
export function codesNamedIn(question: string, codes: string[]): string[] {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const scored = codes.map((code) => ({
    code,
    score: code
      .split("_")
      .filter((w) => w.length >= 3)
      .filter((w) => q.includes(` ${w} `)).length,
  }));
  const best = Math.max(0, ...scored.map((s) => s.score));
  return best === 0
    ? []
    : scored.filter((s) => s.score === best).map((s) => s.code);
}

/**
 * The mechanism edges that touch one of these markers, best grade first.
 *
 * The graph already carries a sentence of mechanism on every edge, written for
 * a person to read. A "why" question is that sentence; nothing else needs to
 * be generated for it.
 */
export function mechanismsFor(
  graph: { nodes: { id: string; name: string }[]; edges: MechanismLine[] },
  codes: string[],
  limit = 6,
): MechanismLine[] {
  const ids = new Set(codes.map((c) => `metric:${c}`));
  const name = new Map(graph.nodes.map((n) => [n.id, n.name]));
  return graph.edges
    .filter((e) => ids.has(e.from) || ids.has(e.to))
    .sort((a, b) => GRADE_RANK(a.grade) - GRADE_RANK(b.grade))
    .slice(0, limit)
    .map((e) => ({
      ...e,
      from: name.get(e.from) ?? e.from,
      to: name.get(e.to) ?? e.to,
    }));
}

/** "HbA1c: type 2 diabetes 30 % → 92 % if high, → 5 % if normal". */
export function settlesLine(
  move: Move,
  nameOf: (id: string) => string,
): string {
  const pct = (p: number) => `${Math.round(p * 100)} %`;
  const parts = settlesOf(move, nameOf).map(
    (s) =>
      `${s.name} ${pct(s.from)} → ${s.outcomes
        .map((o) => `${pct(o.to)} if ${o.label}`)
        .join(", ")}`,
  );
  return `${move.label}: ${parts.join("; ") || "nothing it would settle"}`;
}

/** The eight best-graded rows on file for one condition. */
export async function sourcesFor(
  conditionId: string | null,
): Promise<SourceCandidate[]> {
  if (!conditionId) return [];
  const db = getDb();
  const [evidence, interventions] = await Promise.all([
    db
      .select()
      .from(hkbEvidence)
      .where(eq(hkbEvidence.conditionId, conditionId)),
    db
      .select()
      .from(hkbInterventions)
      .where(
        and(
          eq(hkbInterventions.conditionId, conditionId),
          eq(hkbInterventions.status, "accepted"),
        ),
      ),
  ]);
  return rankSources([
    ...evidence
      .filter((r) => r.status !== "rejected")
      .map((r) => evidenceSource({ ...r, lrPos: r.lrPos })),
    ...interventions.map(interventionSource),
  ]).slice(0, MAX_SOURCES);
}

/** The shape `generateObject` is held to. Ids only; no prose in the lists. */
const actsSchema = z.object({
  prose: z.string().describe("the answer, as one paragraph"),
  actions: z
    .array(z.string())
    .describe("ids of the actions the paragraph named, copied exactly"),
  tests: z
    .array(
      z.object({
        code: z.string().describe("a marker code from the candidate list"),
        weeks: z.number().describe("how many weeks to wait before measuring"),
      }),
    )
    .describe("the markers the paragraph says to measure"),
  questions: z
    .array(z.string())
    .describe("keys of the questions the paragraph says would help"),
  sources: z
    .array(z.string())
    .describe("ids of the rows in WHAT THE EVIDENCE SAYS the paragraph cited"),
});

/**
 * The old prompt ended every answer with "reviewing these lab trends with a
 * healthcare provider is the best way to determine an individualized plan",
 * because it was told not to prescribe and not to name a dose. That is the
 * opposite of the owner's standing rule: this app commits, and every claim
 * carries its label. So the model is handed the actions that already exist for
 * this person — their own plan and the graded intervention rows — and is
 * allowed to name any of them, with the source's own dose, and nothing else.
 */
export const QUESTION_SYSTEM = `You are this person's doctor, and the kind of friend who answers straight. You have their numbers, the plan already written for them, and the graded interventions on file. Answer the question they just asked, and only that question.

ONE paragraph. No greeting, no sign-off, no bullet list, no headings, no line breaks. Six sentences at most, and fewer when the shape below says fewer.

EVERY ACTION YOU NAME COMES FROM THE CONTEXT. The sections THEIR PLAN and WHAT THE PAPERS SAY are the only actions that exist. Never invent an action, a supplement, a drug or a dose, and never change a dose that is given. Copy each action's bracketed label exactly as it is printed there: [science, A], [science, C], [opinion], [anecdotal, E].

If neither section has anything for this question, say that in one sentence and name the test or the question that would fill the gap. Do not fill the space with general advice.

USE ONLY THE NUMBERS GIVEN. Never invent a value, a probability, a date or a diagnosis, and never contradict the states in WHAT THE ENGINE CONCLUDES.

NO FILLER. Never write "talk to your healthcare provider", "consult a professional", "consider", "may help" or "individualised plan". If an action needs a prescriber, say which kind of doctor and what to ask them for.

THEN SAY WHAT YOU JUST NAMED, AS IDS. Alongside the paragraph, list the ids of what it used and nothing else: \`actions\` are the ids printed after "id" in THEIR PLAN and WHAT THE PAPERS SAY, \`tests\` are the codes in MARKERS THEY COULD MEASURE AGAIN with the number of weeks your paragraph gave, \`questions\` are the keys in QUESTIONS THEY COULD ANSWER. Copy every id, code and key exactly as it is printed. The ids are for these lists ONLY: the paragraph never prints an id, and it still carries every action's bracketed label. List every action your paragraph named and nothing your paragraph did not name. An id that is not on those lists is thrown away, so inventing one loses the button. \`sources\` are the ids printed after "id" in WHAT THE EVIDENCE SAYS: list the ones your paragraph read from, and nothing else. Never name a paper, a guideline, an author or a year that is not printed in that section.`;

/**
 * The shape, per kind. Phase 28a.
 *
 * "Will I ever be able to solve this? What does the research say?" came back
 * as numbers → do this → measure that, i.e. the answer to "how do I fix it?",
 * because one prompt forced one shape on every question. `questionKind` picks
 * the shape in code before the model sees the question, and the shape is the
 * only part of the prompt that changes.
 */
export const QUESTION_SHAPES: Record<QuestionKind, string> = {
  status: `THE SHAPE FOR THIS QUESTION — they asked where they stand.
TWO OR THREE SENTENCES. Give the values they asked about, each with its unit and whether it is off, borderline or fine against the band you are given, then one sentence on what that means for them. Name no action and no test: they did not ask for one.`,

  howto: `THE SHAPE FOR THIS QUESTION — they asked what to do.
SIX SENTENCES AT MOST, in this order.
1. What their own numbers say about the question: the values, and whether each one is off, borderline or fine against the band you are given.
2. What to do: two or three actions, each with its label in brackets and its dose when the source has one.
3. What to measure and when: name the marker and the number of weeks.`,

  prognosis: `THE SHAPE FOR THIS QUESTION — they asked how this goes from here.
FOUR SENTENCES AT MOST, in this order.
1. What the rows in WHAT THE EVIDENCE SAYS say about the course: reversible, controllable with treatment, or lifelong, and what kind of control is realistic. Read it off what those rows show treatment can and cannot move, and name the paper or guideline with its year.
2. What in THEIR OWN numbers argues either way.
3. At most ONE action, with its bracketed label and its dose.
Never promise a cure and never rule one out further than the rows do. Never open by saying the rows are silent: the rows you are given are what is known here, so answer from what they do show, and say how thin that is when it is thin.`,

  research: `THE SHAPE FOR THIS QUESTION — they asked what the research says.
TWO OR THREE SENTENCES. Give the strongest rows in WHAT THE EVIDENCE SAYS: what each one found, its grade, the name of the paper or guideline with its year, and the size of the effect when the row has one. Finish with one sentence on how sure the field is: grade A or B is settled, grade C to E is thin, one small trial is one small trial. Name no action: they asked what is known, not what to do.`,

  why: `THE SHAPE FOR THIS QUESTION — they asked why.
THREE SENTENCES AT MOST. Explain the mechanism from the rows in HOW THESE ARE CONNECTED, in plain words, naming the marker at each end and reading the row's own sentence rather than your own knowledge. Then one sentence on which of those causes their own numbers actually support. Name no action.`,

  "next-test": `THE SHAPE FOR THIS QUESTION — they asked what to measure next.
THREE SENTENCES AT MOST. Name the one or two best moves from WHAT EACH TEST WOULD SETTLE and say what each would settle, copying the numbers exactly as they are printed there ("HbA1c: type 2 diabetes 30 % → 92 % if high, → 5 % if normal"). Say which one to do first and after how many weeks. Name no action other than the tests themselves.`,
};

/** The whole system prompt for one kind: the rules, then the shape. */
export const systemFor = (kind: QuestionKind): string =>
  `${QUESTION_SYSTEM}\n\n${QUESTION_SHAPES[kind]}`;

/**
 * The one model that answers questions, chosen by `pnpm eval:ask` and set in
 * `AI_ASK_MODEL`. Falls back to `AI_DEFAULT_MODEL` through `model()`.
 */
export const askModel = (id?: string) => model(id ?? process.env.AI_ASK_MODEL);

const actionBlock = (rows: PlanLine[], head: string, empty: string): string =>
  rows.length
    ? `${head}\n${rows.map((p) => `- id ${p.id} · ${actionLine(p)}${p.why ? `\n  why: ${p.why}` : ""}`).join("\n")}`
    : `${head}\n- ${empty}`;

/**
 * A question, answered from this person's own picture.
 *
 * The engine still decides every number: the conclusions come from
 * `scoreHypotheses`, "right now" is that condition's own live score, and every
 * action the answer may name is a row from `actionsFor` — this person's plan
 * first, the graded `hkb_interventions` after. The model writes the prose and
 * nothing else; with no key the box still answers with the rows below.
 *
 * `about` is a condition id handed in by a card's Discuss button. It replaces
 * the ontology lookup entirely, so the composer never has to put a condition
 * name in the text box where the fact reader would read it as a phenotype.
 */
export interface AskOptions {
  /** the condition id a card's "Discuss" opened the box about */
  about?: string;
  /** the candidate model, for `pnpm eval:ask`; otherwise `AI_ASK_MODEL` */
  modelId?: string;
}

export async function answerQuestion(
  userId: string,
  question: string,
  { about, modelId }: AskOptions = {},
): Promise<AskAnswer> {
  const named = about
    ? emptyAnswer()
    : await answerAsk(userId, termQuery(question));
  const [input, catalog] = await Promise.all([
    buildModelInput(userId),
    catalogFor(userId),
  ]);
  const scored = scoreHypotheses(input, { catalog });

  const conditionId = about ?? named.condition?.id ?? null;
  const mine = conditionId ? scored.find((h) => h.id === conditionId) : null;
  const now = mine
    ? {
        id: mine.id,
        name: displayNameOf(mine),
        state: mine.state,
        probability: mine.score,
      }
    : null;

  /**
   * The actions the answer is allowed to name. When the question named a
   * condition that has nothing written for it yet, the rest of the plan is
   * still theirs and still labelled — "what should I do to lower my LDL?"
   * answered "neither your plan nor the papers have anything" while three
   * lipid actions sat on the plan under another condition's name.
   */
  let actions = await actionsFor(userId, conditionId, 6);
  if (!actions.length && conditionId)
    actions = await actionsFor(userId, null, 6);
  const kind = questionKind(question);
  const base: AskAnswer = {
    ...named,
    route: "question",
    now,
    actions,
    kind,
  };
  if (!process.env.OPENROUTER_API_KEY) return base;

  /**
   * Phase 28a. The prompt only carries the block its kind reads from: papers
   * for research and prognosis, graph edges for why, the settles-what table
   * for next-test. A model that is handed no paper cannot cite one, which is
   * half of the sources guard; `pickActs` is the other half.
   */
  const [context, projections, sources, graph] = await Promise.all([
    chatContext(userId).catch(() => ""),
    projectionsFor(userId).catch(() => []),
    CITES_SOURCES.includes(kind)
      ? sourcesFor(conditionId).catch(() => [] as SourceCandidate[])
      : Promise.resolve([] as SourceCandidate[]),
    kind === "why" ? loadGraph().catch(() => null) : Promise.resolve(null),
  ]);
  const conclusions = scored
    .filter((h) => h.score >= 0.05)
    .slice(0, 8)
    .map(
      (h) =>
        `${displayNameOf(h)}: ${h.state.replace("_", " ")} (${Math.round(h.score * 100)} %)`,
    );

  const plan = actions.filter((a) => a.source === "plan");
  const papers = actions.filter((a) => a.source === "papers");
  const open = projections
    .slice(0, 6)
    .map((p) => `- ${ledgerLine(p)}`)
    .join("\n");

  /**
   * Phase 27. The buttons under the answer are not parsed out of the prose:
   * the model returns the ids it used, from these lists and no others, and
   * `pickActs` throws away anything else. The prose and the row can then never
   * disagree, which is the whole point of the eval's new checks.
   */
  const moves = nextMoves(input, catalog);
  const candidates = askCandidates({
    actions,
    measured: Object.keys(input.latest),
    moves,
    questions: profileQuestions(input).map((q) => ({
      key: q.key,
      question: q.question,
    })),
    sources,
  });

  /**
   * The block this kind reads from, and no other. A `howto` answer never sees
   * a paper row, so it cannot cite one; a `research` answer sees nothing else,
   * so it has to.
   */
  const nameOf = (id: string) => {
    const hit = scored.find((h) => h.id === id);
    return hit ? displayNameOf(hit) : id.replace(/_/g, " ");
  };
  const spec = conditionId ? catalog.find((h) => h.id === conditionId) : null;
  const namedCodes = codesNamedIn(question, Object.keys(input.latest));
  const mechanisms = graph
    ? mechanismsFor(
        graph,
        namedCodes.length ? namedCodes : spec ? metricCodesOf(spec) : [],
      )
    : [];
  /**
   * The information-gain lines a `next-test` answer is written from, kept so
   * `pnpm eval:ask` can show the judge what was on offer. Without them the
   * judge read a correctly copied "PHQ-9 · Depression 33 % → 74 %" as an
   * invented probability and scored the best answer 0/5.
   */
  const settles = moves
    .filter((m) => m.kind === "test")
    .slice(0, 5)
    .map((m) => settlesLine(m, nameOf));

  const kindBlock = CITES_SOURCES.includes(kind)
    ? `WHAT THE EVIDENCE SAYS (id · name · year · grade · what it found; the ONLY papers you may cite):
${
  candidates.sources
    .map(
      (s) =>
        `- id ${s.id} · ${s.name} · ${s.year ?? "no year"} · grade ${s.grade} · ${s.says}`,
    )
    .join("\n") || "- no graded row on file for this condition"
}`
    : kind === "why"
      ? `HOW THESE ARE CONNECTED (the graph's own mechanism rows):
${
  mechanisms
    .map(
      (e) =>
        `- ${e.from} ${e.relation} ${e.to} (grade ${e.grade}): ${e.mechanism}`,
    )
    .join("\n") || "- no mechanism row touches this marker"
}`
      : kind === "next-test"
        ? `WHAT EACH TEST WOULD SETTLE (best information gain first; copy these numbers exactly):
${
  settles.map((line) => `- ${line}`).join("\n") ||
  "- nothing on the table would settle anything"
}`
        : "";

  const { object } = await generateObject({
    model: askModel(modelId),
    schema: actsSchema,
    system: systemFor(kind),
    prompt: `THEIR QUESTION: ${question}

WHAT THE ENGINE CONCLUDES ABOUT THEM RIGHT NOW:
${conclusions.join("\n") || "nothing is on the table yet"}

${
  now
    ? `RIGHT NOW FOR THE THING THEY ASKED ABOUT:\n- ${now.name}: ${now.state.replace("_", " ")}, ${Math.round(now.probability * 100)} %`
    : "THEY NAMED NO CONDITION THE ENGINE SCORES."
}

${actionBlock(plan, "THEIR PLAN (actions already written for them; the index is theirs):", "nothing on their plan touches this")}

${actionBlock(papers, "WHAT THE PAPERS SAY (graded rows on file for this condition):", "no graded intervention on file for this")}

PROJECTIONS ON FILE:
${open || "- none open"}

MARKERS THEY COULD MEASURE AGAIN (code · name · the usual wait, in weeks):
${
  candidates.tests
    .map(
      (t) =>
        `- ${t.code} · ${t.name} · ${t.weeks}${t.selfOrder ? "" : " · needs a doctor to order it"}`,
    )
    .join("\n") || "- none"
}

QUESTIONS THEY COULD ANSWER (key · question):
${
  candidates.questions.map((q) => `- ${q.key} · ${q.question}`).join("\n") ||
  "- none"
}

${kindBlock}

${context}`,
  });

  const acts = pickActs(object, candidates);
  return {
    ...base,
    reply: object.prose.trim(),
    acts,
    sources: acts.sources,
    sourcesOffered: candidates.sources,
    settlesOffered: settles,
  };
}

/**
 * Wake what the person typed. A ring-3 name is promoted to ring 2 first, so
 * anything in MONDO can be considered once, scored honestly against its own
 * prior, and dropped again by the auto-dismiss rule when it goes nowhere.
 */
export async function considerTerm(
  userId: string,
  mondoId: string,
  query: string,
): Promise<{ conditionId: string; name: string } | null> {
  const row = await ensureRing2(mondoId);
  if (!row) return null;
  const woken = await wake(userId, row.id, "user", {
    asked: query,
    mondoId,
  });
  return woken ? { conditionId: woken.conditionId, name: woken.name } : null;
}
