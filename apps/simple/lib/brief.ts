/**
 * The facts at hand: everything one answer is written from, assembled once.
 *
 * Phase 28c. `answerQuestion` used to build the prompt, call the model and
 * apply the guard in one function, so a thread could not reuse any of it. The
 * assembly is now `briefFor` and it is the only place that decides what the
 * model is allowed to see: the question's kind, the system prompt for that
 * kind, the facts block, and the closed sets `pickActs` checks against.
 *
 * Both callers use the same brief. The composer's single-shot ask adds one
 * `generateObject` call; the thread route adds `streamText` with tools. What
 * the model may name is identical either way, which is the point.
 */
import { generateObject } from "ai";
import { CITES_SOURCES, questionKind, termQuery } from "./ask-intent";
import type { QuestionKind } from "./ask-intent";
import { actionLine, actionsFor, type PlanLine } from "./actions";
import { chatContext } from "./ai";
import { buildModelInput, profileQuestions } from "./coverage";
import { catalogFor } from "./hkb";
import { scoreHypotheses } from "./hypotheses";
import { nextMoves } from "./infogain";
import { loadGraph } from "./kg";
import { displayNameOf, metricCodesOf } from "./ledger";
import { ledgerLine, projectionsFor } from "./projections";
import {
  actsSchema,
  answerAsk,
  askCandidates,
  askModel,
  codesNamedIn,
  emptyAnswer,
  mechanismsFor,
  pickActs,
  settlesLine,
  sourcesFor,
  systemFor,
  type AskAnswer,
  type AskCandidates,
  type AskOptions,
  type SourceCandidate,
} from "./lookup";

/** One conversation turn's whole world, before any model has seen it. */
export interface Brief {
  kind: QuestionKind;
  /** `systemFor(kind)`: the rules and the shape this kind of question wants */
  system: string;
  /** the prompt body below "THEIR QUESTION:", exactly as it has always read */
  facts: string;
  /** the ids, codes and keys an answer may name, and nothing else */
  candidates: AskCandidates;
  now: AskAnswer["now"];
  actions: PlanLine[];
  /** the information-gain lines, kept so an eval can show a judge the offer */
  settles: string[];
  /** the term lookup result, unchanged */
  named: AskAnswer;
}

const actionBlock = (rows: PlanLine[], head: string, empty: string): string =>
  rows.length
    ? `${head}\n${rows.map((p) => `- id ${p.id} · ${actionLine(p)}${p.why ? `\n  why: ${p.why}` : ""}`).join("\n")}`
    : `${head}\n- ${empty}`;

/** One mechanism row off the graph, as the `why` block prints it. */
export interface MechanismLine {
  from: string;
  to: string;
  relation: string;
  grade?: string;
  mechanism: string;
}

/**
 * The facts block, as a string. Pure: no database, no clock, no model.
 *
 * The order is the order it has always been in, because `pnpm eval:ask` scores
 * the answers this block produces and a reordered prompt is a different prompt.
 */
export function factsBlock({
  conclusions,
  now,
  plan,
  papers,
  open,
  candidates,
  kindBlock,
  context,
}: {
  conclusions: string[];
  now: AskAnswer["now"];
  plan: PlanLine[];
  papers: PlanLine[];
  open: string;
  candidates: AskCandidates;
  kindBlock: string;
  context: string;
}): string {
  return `WHAT THE ENGINE CONCLUDES ABOUT THEM RIGHT NOW:
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

${context}`;
}

/**
 * The block this kind reads from, and no other. Pure.
 *
 * A `howto` answer never sees a paper row, so it cannot cite one; a `research`
 * answer sees nothing else, so it has to.
 */
export function kindBlockFor(
  kind: QuestionKind,
  {
    sources,
    mechanisms,
    settles,
  }: {
    sources: SourceCandidate[];
    mechanisms: MechanismLine[];
    settles: string[];
  },
): string {
  if (CITES_SOURCES.includes(kind))
    return `WHAT THE EVIDENCE SAYS (id · name · year · grade · what it found; the ONLY papers you may cite):
${
  sources
    .map(
      (s) =>
        `- id ${s.id} · ${s.name} · ${s.year ?? "no year"} · grade ${s.grade} · ${s.says}`,
    )
    .join("\n") || "- no graded row on file for this condition"
}`;
  if (kind === "why")
    return `HOW THESE ARE CONNECTED (the graph's own mechanism rows):
${
  mechanisms
    .map(
      (e) =>
        `- ${e.from} ${e.relation} ${e.to} (grade ${e.grade}): ${e.mechanism}`,
    )
    .join("\n") || "- no mechanism row touches this marker"
}`;
  if (kind === "next-test")
    return `WHAT EACH TEST WOULD SETTLE (best information gain first; copy these numbers exactly):
${
  settles.map((line) => `- ${line}`).join("\n") ||
  "- nothing on the table would settle anything"
}`;
  return "";
}

/**
 * Everything one question is answered from.
 *
 * `about` is a condition id handed in by a card's Discuss button. It replaces
 * the ontology lookup entirely, so the composer never has to put a condition
 * name in the text box where the fact reader would read it as a phenotype.
 */
export async function briefFor(
  userId: string,
  question: string,
  about?: string,
): Promise<Brief> {
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
   * `pickActs` throws away anything else.
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
  const settles = moves
    .filter((m) => m.kind === "test")
    .slice(0, 5)
    .map((m) => settlesLine(m, nameOf));

  return {
    kind,
    system: systemFor(kind),
    facts: factsBlock({
      conclusions,
      now,
      plan,
      papers,
      open,
      candidates,
      kindBlock: kindBlockFor(kind, {
        sources: candidates.sources,
        mechanisms,
        settles,
      }),
      context,
    }),
    candidates,
    now,
    actions,
    settles,
    named,
  };
}

/**
 * A question, answered from this person's own picture.
 *
 * The engine still decides every number: the conclusions come from
 * `scoreHypotheses`, "right now" is that condition's own live score, and every
 * action the answer may name is a row from `actionsFor`. The model writes the
 * prose and nothing else; with no key the box still answers with the rows.
 *
 * ponytail: with no OpenRouter key the brief is still built and then thrown
 * away. One extra read on a path that only runs in a keyless dev box, against
 * one assembly function instead of two copies of it.
 */
export async function answerQuestion(
  userId: string,
  question: string,
  { about, modelId }: AskOptions = {},
): Promise<AskAnswer> {
  const brief = await briefFor(userId, question, about);
  const base: AskAnswer = {
    ...brief.named,
    route: "question",
    now: brief.now,
    actions: brief.actions,
    kind: brief.kind,
  };
  if (!process.env.OPENROUTER_API_KEY) return base;

  const { object } = await generateObject({
    model: askModel(modelId),
    schema: actsSchema,
    system: brief.system,
    prompt: `THEIR QUESTION: ${question}\n\n${brief.facts}`,
  });

  const acts = pickActs(object, brief.candidates);
  return {
    ...base,
    reply: object.prose.trim(),
    acts,
    sources: acts.sources,
    sourcesOffered: brief.candidates.sources,
    settlesOffered: brief.settles,
  };
}
