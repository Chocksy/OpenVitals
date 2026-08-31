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
import { generateText } from "ai";
import { and, eq, sql } from "drizzle-orm";
import {
  getDb,
  hkbAnnotations,
  hkbConditions,
  hkbTerms,
  userConditions,
} from "@/db";
import { buildModelInput, type ModelInput } from "./coverage";
import { model } from "./extract";
import { catalogFor } from "./hkb";
import { FREQUENT, frequencyOf } from "./hpoa";
import { scoreHypotheses, type HState } from "./hypotheses";
import { nextMoves, type Move } from "./infogain";
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
}

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
