/**
 * The AI doctor. One `generateObject` call over a context pack that already
 * contains every deterministic answer the app can work out on its own, so the
 * model spends its budget on judgement rather than on arithmetic.
 *
 * Everything the model is not allowed to get wrong is enforced in code after
 * the call: dose ceilings, one test action per fired rule, at most eight
 * actions. See `postProcess`.
 */
import { generateObject } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  hkbInterventions,
  readings,
  reports,
  type Report,
  type ReportAction,
  type ReportBody,
} from "@/db";
import {
  buildModelInput,
  coverage,
  fireRules,
  profileQuestions,
  queueFactQuestions,
  type CoverageRow,
  type ModelInput,
} from "./coverage";
import { getTrackerSummary, type TrackerSummary } from "./daily-data";
import {
  documentLines,
  documentSummaries,
  type DocumentSummary,
} from "./documents";
import { model } from "./extract";
import { computeGraphState, type GraphState } from "./graph-state";
import { loadGraph, type Graph } from "./kg";
import { loadCatalog } from "./hkb";
import { isConclusion, mattersOf } from "./ledger";
import {
  scoreHypotheses,
  type Catalog,
  type HypothesisResult,
} from "./hypotheses";
import {
  matchPatterns,
  type PatternMatch,
  type PatternQuestion,
} from "./patterns";
import { CEILINGS, overCeiling, VECTORS, type Rule } from "./vectors";

export type ReportTrigger = "manual" | "upload" | "daily";

const MAX_ACTIONS = 10;
const REPORT_EVERY_DAYS = 30;

/* ── the schema the model must fill ───────────────────────────────────── */

/**
 * ponytail: the schema asks for plain numbers where the type wants 1..5 and
 * 1..3. Literal unions come out of the provider as `anyOf` and models miss
 * them; `clamp` in `postProcess` is one line and never fails.
 */
const clamp = (v: number, hi: number) =>
  Math.min(Math.max(Math.round(v) || 1, 1), hi) as 1 | 2 | 3 | 4 | 5;

const actionSchema = z.object({
  title: z.string(),
  kind: z.enum([
    "supplement",
    "food",
    "exercise",
    "sleep",
    "test",
    "doctor",
    "stop",
    "habit",
  ]),
  weight: z.number(),
  basis: z.enum(["science", "opinion", "anecdotal"]),
  why: z.string(),
  reasoning: z.string(),
  dose: z
    .object({
      amount: z.string(),
      form: z.string().optional(),
      schedule: z.string(),
      duration: z.string().optional(),
      ceiling: z.string().optional(),
    })
    .optional(),
  timing: z.string().optional(),
  interactions: z
    .array(z.object({ with: z.string(), rule: z.string() }))
    .optional(),
  targets: z.array(
    z.object({
      code: z.string(),
      direction: z.enum(["up", "down"]),
      expect: z.string(),
      measureAfterWeeks: z.number(),
    }),
  ),
  evidence: z.array(
    z.object({
      kind: z.enum(["guideline", "meta", "rct", "observational", "anecdotal"]),
      title: z.string(),
      source: z.string().optional(),
    }),
  ),
  followUp: z.array(z.object({ afterDays: z.number(), ask: z.string() })),
  tier: z.enum(["established", "early", "experimental"]).optional(),
  notes: z
    .array(z.object({ q: z.string(), a: z.string(), at: z.string() }))
    .optional(),
});

const reportSchema = z.object({
  summary: z.array(z.string()),
  eli5: z.string(),
  systems: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      verdict: z.string(),
      eli5: z.string(),
      priority: z.number(),
    }),
  ),
  actions: z.array(actionSchema),
  /** Opinion actions. Three of them when the graph is hot, none when it is empty. */
  personal: z
    .array(actionSchema)
    .describe(
      "Actions that only THIS person's values, history and habits justify: at least 3 when HOT GRAPH has nodes, none when it is empty. basis is always opinion; reasoning quotes the values.",
    ),
  questions: z.array(
    z.object({
      key: z.string(),
      text: z.string(),
      why: z.string(),
      options: z.array(z.string()).optional(),
    }),
  ),
  /** One entry per pattern in MATCHED PATTERNS. Omitted when none matched. */
  patterns: z
    .array(
      z.object({
        id: z.string(),
        stage: z.string().optional(),
        verdict: z.string(),
      }),
    )
    .optional(),
});

export const SYSTEM_PROMPT = `You are this person's physician. You have their blood work, their profile answers, their daily tracker and a list of rules that already fired. Write the plan you would write for a patient you know well.

COMMIT. Every action names the dose, the form, the schedule, the duration, and what you expect to change, with a number and a date. No "consider", no "may help", no hedging in the prose.

LABEL every action with exactly one basis:
- "science": a guideline, meta-analysis, RCT or large cohort supports it for a person like this. Needs at least one evidence item of kind guideline, meta, rct or observational.
- "opinion": you inferred it from THIS person's values. Then "reasoning" must quote the exact values, dates and facts you used. If a value you need is missing, do not guess: emit a "test" action to measure it instead.
- "anecdotal": people report it and no study settles it. Needs an evidence item with a "source". Never a dose above a science ceiling.

CEILINGS you never exceed: vitamin D 10000 IU/day, vitamin A 3000 µg/day, zinc 40 mg/day, magnesium 400 mg/day elemental. Iron only when ferritin is below 50, and say so. Potassium supplements never. Niacin never without a doctor.

PRESCRIPTION DRUGS use kind "doctor". Say what to ask for, the usual dose range from the label, and what the doctor will want to check first.

ADAPT to sex and age. The optimal ranges you are given are already sex-adjusted; use those, not textbook ones. Prefer the cheapest lever first: food, sleep and movement before a supplement, a supplement before a drug.

FIRED RULES: every rule in the FIRED RULES section becomes its own "test" action, one per rule, never bundled. Use the rule's "suggest" text verbatim as the title, its "why" as the action's "why", and its reference as an evidence item. Basis "science".

DISMISSED: never propose anything in the DISMISSED ACTIONS list again.

FACTS ARE NOT ACTIONS: missing interview facts are asked as questions by the app, never as actions; do not write actions like "report your height".

DISCUSSION: the USER CONTEXT AND DISCUSSION section is what this person told you about the actions in the last plan, and what you answered. Treat it as fact about them and carry it into this plan.

REGISTERS: "why" is one plain sentence for a smart adult. "eli5" is two sentences with exactly one concrete metaphor and no numbers unless the number is the action itself.

OPINION IS THE POINT. The rule-driven tests are the floor, not the plan. Write at least 3 "opinion" actions when HOT GRAPH has nodes; when it is empty write none, there is nothing to reason from. An opinion action is one that only this person's numbers, history and habits justify: which lever to pull first and why for them, sequencing ("fix D before judging testosterone"), personal dose adjustments, what their family history changes about the target. Each one quotes the values in "reasoning".

HYPOTHESES are scored by the app; do not re-score them, explain them and order tests by the path given.

CONCLUSIONS: write one plain sentence per conclusion in "systems[].verdict", keyed by the condition id in "systems[].id".

PATTERNS: when a pattern is matched, its management text is a list of mandatory actions: each numbered intervention in it becomes an action with the pattern's dose (e.g. selenium 200 µg/day) unless a listed contraindication applies; say which basis it has. State the controversy in one sentence in the system verdict, then say what decides it for this person. Fill "patterns" with one entry per matched pattern: its id, its stage, and your verdict.

NOTHING WRONG: a person with every marker in optimal and no pattern gets at most 4 actions and no supplement; say so in the summary.

TRACEABILITY: every opinion action's "reasoning" names at least one graph element by id (an edge id like "tsh->ldl_cholesterol" or "pattern:hashimoto") from the HOT GRAPH or ACTIVE EDGES sections, plus the values.

WHAT MIGHT HELP: the section of that name lists what papers report for these
conditions, each with a grade. A and B are candidate actions, tier
"established". C is tier "early": say it is early in the "why". D and E are
tier "experimental" and an experimental item is only offered with a measurement
plan — name the marker and when to remeasure it in "targets" — or it is not
offered at all. Set "tier" on any action that came out of that section, and on
no other action.

LIMITS: at most 10 actions, at most 3 summary lines, at most 3 questions. Sort nothing; give each action a weight from 1 to 5 for how much it matters to this person now. End with the questions whose answers would change the plan most.`;

/* ── the context pack ─────────────────────────────────────────────────── */

const num = (v: number | null | undefined) => (v == null ? "-" : String(v));

function factLines(input: ModelInput): string {
  const keys = Object.keys(input.profile).sort();
  if (!keys.length) return "- nothing answered yet";
  return keys
    .map((k) => {
      const v = input.profile[k];
      return `- ${k}: ${Array.isArray(v) ? v.join("; ") : String(v)}`;
    })
    .join("\n");
}

/** Metrics grouped by the tier-1 vector they belong to. */
function metricLines(input: ModelInput): string {
  const out: string[] = [];
  for (const vector of VECTORS) {
    if (vector.tier !== 1 || !vector.codes?.length) continue;
    const rows = vector.codes
      .filter((code) => input.latest[code])
      .map((code) => {
        const r = input.latest[code]!;
        const delta =
          r.value != null && r.prev != null
            ? `${r.value - r.prev > 0 ? "+" : ""}${Math.round((r.value - r.prev) * 100) / 100}`
            : "-";
        return `    ${code}: ${num(r.value)} ${r.unit ?? ""} | optimal ${num(r.optimalLow)}..${num(r.optimalHigh)} | lab ${num(r.refLow)}..${num(r.refHigh)} | ${r.status} | delta ${delta} | ${r.date}${r.note ? `\n      note: ${r.note}` : ""}`;
      });
    if (rows.length)
      out.push(`  ${vector.name} (${vector.id}):\n${rows.join("\n")}`);
  }
  return out.join("\n") || "  no lab values yet";
}

function derivedLines(input: ModelInput): string {
  const d = input.derived;
  const rows = [
    ["eGFR (CKD-EPI 2021, mL/min/1.73m2)", d.egfr],
    ["HOMA-IR", d.homaIr],
    ["triglyceride/HDL", d.tgHdl],
    ["non-HDL cholesterol", d.nonHdl],
    ["FIB-4", d.fib4],
    ["PhenoAge (years)", d.phenoAge],
  ].filter(([, v]) => v != null);
  return rows.length
    ? rows.map(([k, v]) => `- ${k}: ${v}`).join("\n")
    : "- not computable yet";
}

function gapLines(rows: CoverageRow[]): string {
  const gaps = rows.filter((r) => r.state === "never" || r.state === "stale");
  return gaps.length
    ? gaps
        .map(
          (r) =>
            `- ${r.vector.id} (${r.vector.name}, tier ${r.vector.tier}): ${r.state}${r.lastDate ? `, last ${r.lastDate}` : ""} — ${r.vector.why}`,
        )
        .join("\n")
    : "- nothing missing";
}

function ruleLines(rules: Rule[]): string {
  return rules.length
    ? rules
        .map(
          (r) =>
            `- ${r.suggest} (rule ${r.id})\n  why: ${r.why}\n  reference: ${r.ref ?? "guideline"}`,
        )
        .join("\n")
    : "- none fired";
}

/** What the person said back about the last plan's actions, and your replies. */
function discussionLines(previous: Report | null): string {
  const rows = (previous?.body.actions ?? []).flatMap((a) =>
    (a.notes ?? []).map(
      (n) =>
        `- on "${a.title}" (${n.at.slice(0, 10)}):\n  they said: ${n.q}\n  you replied: ${n.a}`,
    ),
  );
  return rows.join("\n") || "- nothing discussed yet";
}

/** The pattern questions this person has not answered yet. */
function openPatternQuestions(
  matches: PatternMatch[],
  input: ModelInput,
): PatternQuestion[] {
  const out: PatternQuestion[] = [];
  for (const match of matches) {
    if (match.matched)
      for (const q of match.pattern.effects.questions)
        if (input.profile[q.key] == null) out.push(q);
    for (const q of match.pendingQuestions ?? [])
      if (input.profile[q.key] == null) out.push(q);
  }
  return out;
}

function patternLines(matches: PatternMatch[], input: ModelInput): string {
  const rows = matches
    .filter((p) => p.matched)
    .map(({ pattern, stage, reasons }) => {
      const open = pattern.effects.questions
        .filter((q) => input.profile[q.key] == null)
        .map((q) => q.text);
      return `- ${pattern.id}${stage ? ` (stage: ${stage})` : ""}: ${pattern.summary} | controversy: ${pattern.controversy} | management: ${pattern.management}
  reasons: ${reasons.join("; ") || "detector matched"}
  escalations not yet done: ${pattern.effects.escalations.map((e) => `${e.suggest} (${e.why})`).join(" ; ")}
  open questions: ${open.join(" ") || "none"}`;
    });
  const pending = matches.flatMap((m) => m.pendingQuestions ?? []);
  if (pending.length)
    rows.push(
      `- undecided: ask ${pending.map((q) => `"${q.text}"`).join(" ")} before calling a pattern.`,
    );
  return rows.join("\n") || "- none matched";
}

/**
 * The top scored hypotheses, with the evidence that moved each one.
 *
 * ponytail: eight is what a clinician holds in their head, and with a
 * thirty-two condition catalog printing them all would be most of the pack.
 * The rest go on one line with their probabilities, so the model can see that
 * they were scored and dismissed rather than never considered.
 */
const TOP_HYPOTHESES = 8;

function hypothesisLines(rows: HypothesisResult[]): string {
  const one = (h: HypothesisResult) => {
    const side = (
      list: { input: string; value: string; lr: number; grade: string }[],
    ) =>
      list
        .map((e) => `${e.input} ${e.value} (LR ${e.lr}, ${e.grade})`)
        .join("; ") || "none";
    const next = h.nextTests[0];
    return `- ${h.id} ${h.score} ${h.state} (prior ${h.prior})
  for: ${side(h.for)}
  against: ${side(h.against)}
  next test: ${next ? `${next.test} (cost ${next.cost}, expected shift ${next.expectedShift})` : "nothing left that would move it"}`;
  };
  if (!rows.length) return "- nothing scored yet";
  const head = rows.slice(0, TOP_HYPOTHESES).map(one).join("\n");
  const tail = rows.slice(TOP_HYPOTHESES);
  return tail.length
    ? `${head}\n- ${tail.length} more, all scored below ${rows[TOP_HYPOTHESES - 1]!.score}: ` +
        tail.map((h) => `${h.id} ${h.score}`).join(", ")
    : head;
}

/**
 * The same rows again, cut to the ones the home ledger shows as cards, in the
 * order it ranks them. The model writes one sentence per id into `systems`.
 */
const TOP_CONCLUSIONS = 6;

function conclusionLines(rows: HypothesisResult[]): string {
  const head = (list: { input: string; value: string; lr: number }[]) =>
    list
      .slice(0, 2)
      .map((e) => `${e.input} ${e.value} (LR ${e.lr})`)
      .join("; ") || "none";
  const picked = rows.filter((h) => isConclusion(h)).slice(0, TOP_CONCLUSIONS);
  if (!picked.length) return "- nothing rises to a conclusion yet";
  return picked
    .map(
      (h) =>
        `- ${h.id} (${h.name}) | ${h.state} | p ${h.score} | matters ${mattersOf(h)}
  for: ${head(h.for)}
  against: ${head(h.against)}`,
    )
    .join("\n");
}

/** The node id without its kind prefix: "metric:tsh" reads as "tsh". */
const short = (id: string) => id.slice(id.indexOf(":") + 1);

function graphLines(graph: GraphState): string {
  const hot = graph.hot
    .map(
      (n) =>
        `- ${n.id} ${n.importance} (${n.reasons.join("; ") || "no reason recorded"})`,
    )
    .join("\n");
  const edges = graph.activeEdges
    .map(
      (e) =>
        `- ${e.id} ${e.relation} ${short(e.to)} | strength ${e.strength} | ${e.confidence} | ${e.basis} |${e.when?.pattern ? ` pattern:${e.when.pattern} |` : ""} mechanism: ${e.mechanism} | evidence: ${e.evidence.map((x) => x.title).join(", ")}`,
    )
    .join("\n");
  return `HOT GRAPH (top ${graph.hot.length} nodes by importance for this person):
${hot || "- nothing is hot yet"}

ACTIVE EDGES:
${edges || "- none active"}`;
}

export interface ContextExtras {
  tracker: TrackerSummary;
  previous?: Report | null;
  /** Derived from `tracker` and `previous` when not given. */
  protocol?: string;
  discussion?: string;
  dismissed?: string[];
  adoptedCodes?: string[];
  /** The rows out of `hkb_*`; `HYPOTHESES` when the caller has none. */
  catalog?: Catalog;
  /** The last five medical documents, for the DOCUMENTS section. */
  documents?: DocumentSummary[];
  /** `hkb_interventions` for the conditions that scored, ranked by grade. */
  interventions?: InterventionSummary[];
  /** `kg_nodes` / `kg_edges`; the in-code graph when the caller has none. */
  graph?: Graph;
}

/** One row of `hkb_interventions`, cut to what the prompt reads. */
export interface InterventionSummary {
  conditionId: string;
  name: string;
  dose: string | null;
  duration: string | null;
  effect: string | null;
  direction: string;
  outcomeFeatureId: string | null;
  grade: string;
  paperTitle?: string | null;
}

/** A/B are established, C is early, D and E are the horizon. */
export const tierOf = (grade: string): NonNullable<ReportAction["tier"]> =>
  grade === "A" || grade === "B"
    ? "established"
    : grade === "C"
      ? "early"
      : "experimental";

const GRADE_ORDER = ["A", "B", "C", "D", "E"];

/** The best-graded interventions for the conditions that actually scored. */
export function helpLines(
  rows: InterventionSummary[],
  hypotheses: HypothesisResult[],
): string {
  const loud = new Set(hypotheses.filter((h) => isConclusion(h)).map((h) => h.id));
  const picked = rows
    .filter((r) => loud.has(r.conditionId))
    .sort(
      (a, b) =>
        GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, MAX_HELP);
  if (!picked.length) return "- nothing read yet";
  return picked
    .map(
      (r) =>
        `- ${r.conditionId} | ${r.name}${r.dose ? ` ${r.dose}` : ""}` +
        `${r.duration ? ` for ${r.duration}` : ""} | grade ${r.grade} (${tierOf(r.grade)})` +
        ` | ${r.direction}${r.effect ? ` ${r.effect}` : ""}` +
        `${r.outcomeFeatureId ? ` in ${short(r.outcomeFeatureId)}` : ""}` +
        `${r.paperTitle ? ` | ${r.paperTitle}` : ""}`,
    )
    .join("\n");
}

/** How many rows of `hkb_interventions` the prompt can carry. */
const MAX_HELP = 20;

export interface ReportContext {
  input: ModelInput;
  cov: CoverageRow[];
  /** Fired rules plus the escalations of every matched pattern. */
  rules: Rule[];
  patterns: PatternMatch[];
  graph: GraphState;
  /** Scored hypotheses, highest first. The model explains them, never re-scores. */
  hypotheses: HypothesisResult[];
  /** Pattern questions to queue, on top of the model's own. */
  questions: PatternQuestion[];
  context: string;
}

/**
 * Everything the model reads, from an input that is already loaded. Pure, so
 * the evals build a persona in memory and get the same context pack the job
 * would have built from the database.
 */
export function buildContextFromInput(
  input: ModelInput,
  extras: ContextExtras,
): ReportContext {
  const { tracker, previous = null } = extras;
  const cov = coverage(input);
  const patterns = matchPatterns(input);
  const matched = patterns.filter((p) => p.matched);
  const rules = [
    ...fireRules(input),
    ...matched.flatMap((p) => p.pattern.effects.escalations),
  ];
  const focus = String(input.profile.focus ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const adoptedCodes =
    extras.adoptedCodes ?? tracker.items.flatMap((i) => i.metricCodes ?? []);
  const graph = computeGraphState(input, {
    focus,
    adoptedCodes,
    graph: extras.graph,
  });
  const hypotheses = scoreHypotheses(input, { catalog: extras.catalog });

  const open = profileQuestions(input);
  const dismissed =
    extras.dismissed ??
    (Array.isArray(input.profile.dismissed_actions)
      ? (input.profile.dismissed_actions as string[])
      : []);

  const protocol =
    extras.protocol ??
    (tracker.items.length
      ? tracker.items
          .map(
            (i) =>
              `- "${i.text}" (${i.cadence}): done ${i.done}x, ${i.adherence}% adherence`,
          )
          .join("\n")
      : "- nothing adopted yet");

  const averages = Object.entries(tracker.averages)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  const context = `Today is ${input.today}.

PROFILE FACTS:
${factLines(input)}
sex: ${input.sex ?? "unknown"} | age: ${input.age ?? "unknown"}

DOCUMENTS (the last 5 uploaded, with what the user accepted out of them):
${documentLines(extras.documents ?? [])}

LAB VALUES BY VECTOR (optimal ranges are already adjusted for sex):
${metricLines(input)}

DERIVED:
${derivedLines(input)}

MISSING OR STALE VECTORS:
${gapLines(cov)}

FIRED RULES (each one must become a "test" action):
${ruleLines(rules)}

MATCHED PATTERNS:
${patternLines(patterns, input)}

WHAT MIGHT HELP (from the papers, per condition; A/B established, C early, D/E experimental and only with a measurement plan):
${helpLines(extras.interventions ?? [], hypotheses)}

CONCLUSIONS (the home ledger, in rank order; write one verdict sentence per id):
${conclusionLines(hypotheses)}

HYPOTHESES (scored by the app; explain them, do not re-score them):
${hypothesisLines(hypotheses)}

${graphLines(graph)}

PROTOCOL AND ADHERENCE, LAST 30 DAYS (${tracker.from} to ${tracker.to}):
${protocol}
days logged: ${tracker.loggedDays} | averages: ${averages || "nothing logged"} | overall adherence ${tracker.adherencePct}%

QUESTIONS ALREADY WAITING FOR AN ANSWER: ${open.map((q) => q.key).join(", ") || "none"}

DISMISSED ACTIONS (never propose these again): ${dismissed.join("; ") || "none"}

USER CONTEXT AND DISCUSSION ON PREVIOUS ACTIONS:
${extras.discussion ?? discussionLines(previous)}

PREVIOUS REPORT SUMMARY: ${previous ? (previous.body as ReportBody).summary.join(" ") : "none"}`;

  if (process.env.DEBUG_PLAN)
    console.log(
      "[plan] context:\n" +
        context.split("\n").slice(0, 20).join("\n") +
        "\n[plan] hot graph:\n" +
        graphLines(graph).split("\n").slice(0, 20).join("\n"),
    );

  return {
    input,
    cov,
    rules,
    patterns,
    graph,
    hypotheses,
    questions: openPatternQuestions(patterns, input),
    context,
  };
}

/** Everything `hkb_interventions` carries that is still standing. */
export async function interventionSummaries(): Promise<InterventionSummary[]> {
  const rows = await getDb()
    .select()
    .from(hkbInterventions)
    .where(eq(hkbInterventions.status, "accepted"));
  return rows.map((r) => ({
    conditionId: r.conditionId,
    name: r.name,
    dose: r.dose,
    duration: r.duration,
    effect: r.effect,
    direction: r.direction,
    outcomeFeatureId: r.outcomeFeatureId,
    grade: r.grade,
    paperTitle: r.paper?.title ?? null,
  }));
}

/** The database half: load the person, then build the same context pack. */
export async function buildReportContext(
  userId: string,
): Promise<ReportContext> {
  const input = await buildModelInput(userId);
  const [tracker, previous] = await Promise.all([
    getTrackerSummary(userId, 30),
    latestReport(userId),
  ]);
  const catalog = await loadCatalog();
  return buildContextFromInput(input, {
    tracker,
    previous,
    catalog,
    graph: await loadGraph(),
    documents: await documentSummaries(userId),
    interventions: await interventionSummaries(),
  });
}

/* ── the safety net ───────────────────────────────────────────────────── */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Is this rule already covered by one of the model's own test actions? */
function ruleCovered(rule: Rule, actions: ReportAction[]): boolean {
  const why = norm(rule.why).slice(0, 40);
  const suggest = norm(rule.suggest);
  return actions.some(
    (a) =>
      (a.kind === "test" || a.kind === "doctor") &&
      (norm(a.why).includes(why) || norm(a.title).includes(suggest)),
  );
}

function ruleAction(rule: Rule): ReportAction {
  const weightByTier = { 1: 5, 2: 4, 3: 3 } as const;
  return {
    title: rule.suggest,
    kind: "test",
    weight: weightByTier[rule.tier],
    basis: "science",
    why: rule.why,
    reasoning: "",
    targets: [],
    evidence: [{ kind: "guideline", title: rule.ref ?? rule.suggest }],
    followUp: [],
  };
}

/** What this person's graph actually contains, for the traceability check. */
export interface GraphFacts {
  matchedPatternIds: string[];
  activeEdgeIds: string[];
  hotNodeIds: string[];
  /** False when the person has no lab value at all. */
  hasReadings: boolean;
}

/**
 * Every graph id an opinion action claims to have used, with whether it is
 * real for this person. The model writes both "->" and "→"; both parse.
 */
function citedIds(reasoning: string, graph: GraphFacts) {
  const text = reasoning.replace(/\u2192/g, "->");
  const cited: { token: string; ok: boolean }[] = [];
  const add = (token: string, ok: boolean) => {
    if (!cited.some((c) => c.token === token)) cited.push({ token, ok });
  };

  for (const m of text.matchAll(/\bpattern:([a-z0-9_]+)/gi))
    add(m[0], graph.matchedPatternIds.includes(m[1]!.toLowerCase()));
  for (const m of text.matchAll(/\bmetric:([a-z0-9_]+)/gi))
    add(m[0], graph.hotNodeIds.includes(`metric:${m[1]!.toLowerCase()}`));
  // No parentheses in the class: node ids never contain them, and prose does
  // ("(edge insulin->ogtt_insulin)").
  for (const m of text.matchAll(/\b([a-z0-9_]+)\s*->\s*([a-z0-9_]+)/gi))
    add(
      m[0],
      graph.activeEdgeIds.includes(
        `${m[1]!.toLowerCase()}->${m[2]!.toLowerCase()}`,
      ),
    );

  return cited;
}

const tidy = (s: string) =>
  s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([;,.])/g, "$1")
    .replace(/(^|[;,])\s*(?=[;,])/g, "")
    .trim();

/**
 * An opinion action has to name a graph element that is real for this person.
 * A made-up id is stripped and flagged; no id at all is flagged. The action
 * survives either way, labelled so the reader can see the difference.
 */
function verifyTrace(action: ReportAction, graph: GraphFacts): ReportAction {
  if (action.basis !== "opinion") return action;
  const cited = citedIds(action.reasoning ?? "", graph);
  const bogus = cited.filter((c) => !c.ok);

  if (bogus.length) {
    let reasoning = action.reasoning ?? "";
    for (const c of bogus) reasoning = reasoning.split(c.token).join("");
    console.warn(
      `[plan] "${action.title}" cited graph ids that are not active for this person: ${bogus.map((c) => c.token).join(", ")}`,
    );
    return {
      ...action,
      basis: "opinion",
      reasoning: `[unverified graph reference removed] ${tidy(reasoning)}`,
    };
  }

  if (!cited.length) {
    console.warn(
      `[plan] "${action.title}" is an opinion with no graph reference`,
    );
    return {
      ...action,
      reasoning: `[no graph reference] ${tidy(action.reasoning ?? "")}`,
    };
  }
  return action;
}

/**
 * A fact the app already asks for as a question, dressed up as an action.
 * "Report your height" is not advice, it is the interview leaking into the plan.
 */
const FACT_NOT_ACTION =
  /(report|provide|tell|answer|share|enter|gather|collect)\b.*(height|weight|waist|family history|medication|supplement|conditions|questions)/i;

/** Words too ordinary to identify an action. */
const COMMON = new Set([
  "with",
  "from",
  "your",
  "this",
  "that",
  "then",
  "when",
  "once",
  "only",
  "every",
  "before",
  "after",
  "daily",
  "take",
  "start",
  "stop",
  "keep",
  "high",
  "more",
  "less",
]);

/** The first two words that could name this action, for the prose scrub. */
const titleWords = (title: string) =>
  norm(title)
    .split(" ")
    .filter((w) => w.length > 3 && !COMMON.has(w))
    .slice(0, 2);

/**
 * Does this sentence talk about an action that is no longer in the plan? The
 * substance regexes catch "vitamin D 4000 IU/day" in prose that never repeats
 * the action's title; the title words catch everything else.
 */
function namesDropped(sentence: string, dropped: ReportAction[]): boolean {
  const text = norm(sentence);
  return dropped.some((a) => {
    const dose = a.dose?.amount ?? "";
    if (
      CEILINGS.some(
        (c) =>
          (c.substance.test(a.title) || c.substance.test(dose)) &&
          c.substance.test(sentence),
      )
    )
      return true;
    const words = titleWords(a.title);
    return words.length > 0 && words.every((w) => text.includes(w));
  });
}

const NOTHING_LEFT = "Nothing to act on beyond the tests listed.";

/**
 * The summary and the eli5 are written before anything is dropped, so a plan
 * can end up promising a supplement it no longer contains. Any line that names
 * a dropped action goes with it.
 */
function scrubProse(
  body: ReportBody,
  dropped: ReportAction[],
): Pick<ReportBody, "summary" | "eli5"> {
  if (!dropped.length) return { summary: body.summary, eli5: body.eli5 };
  const summary = body.summary.filter((line) => !namesDropped(line, dropped));
  const eli5 = (body.eli5 ?? "")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim() && !namesDropped(s, dropped))
    .join(" ");
  return {
    summary: summary.length ? summary : [NOTHING_LEFT],
    eli5: eli5 || NOTHING_LEFT,
  };
}

/** "thyroid_workup: Repeat TSH" is the context pack's id leaking into a title. */
function stripRuleId(title: string, ids: Set<string>): string {
  const hit = title.match(/^([a-z][a-z0-9_]*)\s*:\s*(.+)$/i);
  if (!hit) return title;
  const [, id, rest] = hit;
  return ids.has(id!.toLowerCase()) || id!.includes("_") ? rest!.trim() : title;
}

/**
 * Drop what the model should never have written, drop anything over a dose
 * ceiling and ask about it instead, add a test action for every rule the model
 * forgot, check that opinions cite a real graph element, then cap the advice.
 *
 * Three drops happen before anything else:
 *  - an opinion action when nothing in the graph is hot: there is nothing to
 *    reason from, so the "opinion" would be invention,
 *  - an action that just asks for an interview fact,
 *  - everything except a test when the person has no readings at all: with no
 *    numbers, the only honest plan is the fired rules and the questions.
 *
 * Tests and doctor actions are never capped: the escalation ladder is the
 * floor of the plan, and a rule that fired has to end up somewhere. Only the
 * things the person does themselves compete for the ten slots.
 */
export function postProcess(
  body: ReportBody,
  rules: Rule[],
  graph?: GraphFacts,
): ReportBody {
  const kept: ReportAction[] = [];
  const questions = [...body.questions];

  const coldGraph = graph != null && graph.hotNodeIds.length === 0;
  const noReadings = graph != null && !graph.hasReadings;
  const dropped = { opinion: 0, fact: 0, unmeasured: 0 };
  const gone: ReportAction[] = [];

  const proposed = body.actions.filter((a) => {
    if (coldGraph && a.basis === "opinion") dropped.opinion++;
    else if (FACT_NOT_ACTION.test(a.title)) dropped.fact++;
    else if (noReadings && a.kind !== "test") dropped.unmeasured++;
    else return true;
    gone.push(a);
    return false;
  });

  if (dropped.opinion || dropped.fact || dropped.unmeasured)
    console.warn(
      `[plan] dropped ${dropped.opinion} opinion actions with a cold graph, ${dropped.fact} actions that only ask for a fact, ${dropped.unmeasured} non-test actions for a person with no readings`,
    );

  const ruleIds = new Set(rules.map((r) => r.id.toLowerCase()));

  for (const raw of proposed) {
    const weighted: ReportAction = {
      ...raw,
      title: raw.kind === "test" ? stripRuleId(raw.title, ruleIds) : raw.title,
      weight: clamp(raw.weight, 5),
    };
    const action = graph ? verifyTrace(weighted, graph) : weighted;
    const ceiling = overCeiling(action);
    if (!ceiling) {
      kept.push(action);
      continue;
    }
    gone.push(action);
    questions.push({
      key: `ceiling_${norm(action.title).replace(/ /g, "_").slice(0, 40)}`,
      text: `"${action.title}" was suggested at ${action.dose?.amount ?? "an unstated dose"}, which is over the safe ceiling of ${ceiling.max} ${ceiling.unit}. Have you discussed this dose with a doctor?`,
      why: "The app will not print a dose above its ceiling without a doctor in the loop.",
      options: ["Yes", "No"],
    });
  }

  for (const rule of rules)
    if (!ruleCovered(rule, kept)) kept.push(ruleAction(rule));

  // ponytail: word-overlap dedupe; the model sometimes writes the same test twice.
  const words = (a: ReportAction) =>
    new Set(
      norm(a.title)
        .split(" ")
        .filter((w) => w.length > 3),
    );
  const deduped = kept.filter(
    (a, i) =>
      !kept.slice(0, i).some((b) => {
        const wa = words(a),
          wb = words(b);
        const shared = [...wa].filter((w) => wb.has(w)).length;
        return (
          shared >= 3 &&
          shared / Math.max(1, Math.min(wa.size, wb.size)) >= 0.75
        );
      }),
  );

  const sorted = [...deduped].sort((a, b) => b.weight - a.weight);
  const toOrder = (a: ReportAction) => a.kind === "test" || a.kind === "doctor";
  const actions = [
    ...sorted.filter((a) => !toOrder(a)).slice(0, MAX_ACTIONS),
    ...sorted.filter(toOrder),
  ];

  const prose = scrubProse(body, gone);

  return {
    ...body,
    summary: prose.summary.slice(0, 3),
    eli5: prose.eli5,
    systems: body.systems.map((s) => ({
      ...s,
      priority: clamp(s.priority, 3) as 1 | 2 | 3,
    })),
    actions,
    questions: questions.slice(0, 3),
  };
}

/* ── the call ─────────────────────────────────────────────────────────── */

export async function latestReport(userId: string): Promise<Report | null> {
  const [row] = await getDb()
    .select()
    .from(reports)
    .where(eq(reports.userId, userId))
    .orderBy(desc(reports.createdAt))
    .limit(1);
  return row ?? null;
}

/** One model call plus the safety net. No database, so the evals can use it. */
export async function generateFromContext(
  context: string,
  rules: Rule[],
  modelId?: string,
  graph?: GraphFacts,
): Promise<ReportBody> {
  const { object } = await generateObject({
    model: model(modelId),
    schema: reportSchema,
    system: SYSTEM_PROMPT,
    prompt: context,
  });

  const { personal, ...rest } = object;
  return postProcess(
    {
      ...rest,
      actions: [
        ...rest.actions,
        ...personal.map((a) => ({ ...a, basis: "opinion" as const })),
      ],
    } as ReportBody,
    rules,
    graph,
  );
}

/** The three id lists `postProcess` checks opinion reasoning against. */
export function graphFacts(
  patterns: PatternMatch[],
  graph: GraphState,
  input: ModelInput,
): GraphFacts {
  return {
    matchedPatternIds: patterns
      .filter((p) => p.matched)
      .map((p) => p.pattern.id),
    activeEdgeIds: graph.activeEdges.map((e) => e.id),
    hotNodeIds: graph.hot.map((n) => n.id),
    hasReadings: Object.values(input.latest).some((r) => r.value != null),
  };
}

export async function generateReport(
  userId: string,
  trigger: ReportTrigger,
): Promise<Report> {
  const { rules, context, questions, patterns, graph, input } =
    await buildReportContext(userId);
  const body = await generateFromContext(
    context,
    rules,
    undefined,
    graphFacts(patterns, graph, input),
  );

  const [row] = await getDb()
    .insert(reports)
    .values({ userId, trigger, body })
    .returning();

  await queueFactQuestions(userId, [
    ...body.questions.map((q) => ({
      key: q.key,
      question: q.text,
      options: q.options,
      free: !q.options?.length,
    })),
    ...questions.map((q) => ({
      key: q.key,
      question: q.text,
      options: q.options,
      free: !q.options?.length,
    })),
  ]);

  return row!;
}

/**
 * The daily tick: anyone whose newest report is older than 30 days, or who
 * has readings and no report at all, gets a fresh one.
 */
export async function generateStaleReports(): Promise<number> {
  const db = getDb();
  const users = await db
    .selectDistinct({ userId: readings.userId })
    .from(readings);
  const cutoff = new Date(Date.now() - REPORT_EVERY_DAYS * 86_400_000);

  let made = 0;
  for (const { userId } of users) {
    try {
      const newest = await latestReport(userId);
      if (newest?.createdAt && newest.createdAt > cutoff) continue;
      await generateReport(userId, "daily");
      made++;
    } catch (e) {
      console.error("[plan] daily report failed for", userId, e);
    }
  }
  return made;
}
