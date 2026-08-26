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
import { model } from "./extract";
import { computeGraphState, type GraphState } from "./graph-state";
import { matchPatterns, type PatternMatch, type PatternQuestion } from "./patterns";
import { overCeiling, VECTORS, type Rule } from "./vectors";

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
  (Math.min(Math.max(Math.round(v) || 1, 1), hi) as 1 | 2 | 3 | 4 | 5);

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
  /** Opinion actions. Required and at least three, so the model cannot hide behind "science" only. */
  personal: z
    .array(actionSchema)
    .min(3)
    .describe(
      "At least 3 actions that only THIS person's values, history and habits justify. basis is always opinion; reasoning quotes the values.",
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

DISCUSSION: the USER CONTEXT AND DISCUSSION section is what this person told you about the actions in the last plan, and what you answered. Treat it as fact about them and carry it into this plan.

REGISTERS: "why" is one plain sentence for a smart adult. "eli5" is two sentences with exactly one concrete metaphor and no numbers unless the number is the action itself.

OPINION IS THE POINT. The rule-driven tests are the floor, not the plan. Write at least 3 "opinion" actions that only this person's numbers, history and habits justify: which lever to pull first and why for them, sequencing ("fix D before judging testosterone"), personal dose adjustments, what their family history changes about the target. Each one quotes the values in "reasoning".

PATTERNS: when a pattern is matched, its management text is your starting point. State the controversy in one sentence in the system verdict, then say what decides it for this person. Fill "patterns" with one entry per matched pattern: its id, its stage, and your verdict.

TRACEABILITY: every opinion action's "reasoning" names at least one graph element by id (an edge id like "tsh->ldl_cholesterol" or "pattern:hashimoto") from the HOT GRAPH or ACTIVE EDGES sections, plus the values.

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
            `- ${r.id}: ${r.suggest}\n  why: ${r.why}\n  reference: ${r.ref ?? "guideline"}`,
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
}

export interface ReportContext {
  input: ModelInput;
  cov: CoverageRow[];
  /** Fired rules plus the escalations of every matched pattern. */
  rules: Rule[];
  patterns: PatternMatch[];
  graph: GraphState;
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
  const graph = computeGraphState(input, { focus, adoptedCodes });

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
    questions: openPatternQuestions(patterns, input),
    context,
  };
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
  return buildContextFromInput(input, { tracker, previous });
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

/**
 * Drop anything over a dose ceiling and ask about it instead, add a test
 * action for every rule the model forgot, then keep the eight that matter
 * most.
 */
export function postProcess(body: ReportBody, rules: Rule[]): ReportBody {
  const kept: ReportAction[] = [];
  const questions = [...body.questions];

  for (const raw of body.actions) {
    const action: ReportAction = { ...raw, weight: clamp(raw.weight, 5) };
    const ceiling = overCeiling(action);
    if (!ceiling) {
      kept.push(action);
      continue;
    }
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
  const words = (a: ReportAction) => new Set(norm(a.title).split(" ").filter((w) => w.length > 3));
  const deduped = kept.filter((a, i) =>
    !kept.slice(0, i).some((b) => {
      const wa = words(a), wb = words(b);
      const shared = [...wa].filter((w) => wb.has(w)).length;
      return shared >= 3 && shared / Math.max(1, Math.min(wa.size, wb.size)) >= 0.75;
    }),
  );

  const actions = deduped
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_ACTIONS);

  return {
    ...body,
    summary: body.summary.slice(0, 3),
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
  );
}

export async function generateReport(
  userId: string,
  trigger: ReportTrigger,
): Promise<Report> {
  const { rules, context, questions } = await buildReportContext(userId);
  const body = await generateFromContext(context, rules);

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
