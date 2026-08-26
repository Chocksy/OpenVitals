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
import { getTrackerSummary } from "./daily-data";
import { model } from "./extract";
import { overCeiling, VECTORS, type Rule } from "./vectors";

export type ReportTrigger = "manual" | "upload" | "daily";

const MAX_ACTIONS = 8;
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
  questions: z.array(
    z.object({
      key: z.string(),
      text: z.string(),
      why: z.string(),
      options: z.array(z.string()).optional(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are this person's physician. You have their blood work, their profile answers, their daily tracker and a list of rules that already fired. Write the plan you would write for a patient you know well.

COMMIT. Every action names the dose, the form, the schedule, the duration, and what you expect to change, with a number and a date. No "consider", no "may help", no hedging in the prose.

LABEL every action with exactly one basis:
- "science": a guideline, meta-analysis, RCT or large cohort supports it for a person like this. Needs at least one evidence item of kind guideline, meta, rct or observational.
- "opinion": you inferred it from THIS person's values. Then "reasoning" must quote the exact values, dates and facts you used. If a value you need is missing, do not guess: emit a "test" action to measure it instead.
- "anecdotal": people report it and no study settles it. Needs an evidence item with a "source". Never a dose above a science ceiling.

CEILINGS you never exceed: vitamin D 10000 IU/day, vitamin A 3000 µg/day, zinc 40 mg/day, magnesium 400 mg/day elemental. Iron only when ferritin is below 50, and say so. Potassium supplements never. Niacin never without a doctor.

PRESCRIPTION DRUGS use kind "doctor". Say what to ask for, the usual dose range from the label, and what the doctor will want to check first.

ADAPT to sex and age. The optimal ranges you are given are already sex-adjusted; use those, not textbook ones. Prefer the cheapest lever first: food, sleep and movement before a supplement, a supplement before a drug.

FIRED RULES: every rule in the FIRED RULES section becomes a "test" action, basis "science", using that rule's "why" as the action's "why" and its reference as an evidence item.

DISMISSED: never propose anything in the DISMISSED ACTIONS list again.

DISCUSSION: the USER CONTEXT AND DISCUSSION section is what this person told you about the actions in the last plan, and what you answered. Treat it as fact about them and carry it into this plan.

REGISTERS: "why" is one plain sentence for a smart adult. "eli5" is two sentences with exactly one concrete metaphor and no numbers unless the number is the action itself.

LIMITS: at most 8 actions, at most 3 summary lines, at most 3 questions. Sort nothing; give each action a weight from 1 to 5 for how much it matters to this person now. End with the questions whose answers would change the plan most.`;

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
        return `    ${code}: ${num(r.value)} ${r.unit ?? ""} | optimal ${num(r.optimalLow)}..${num(r.optimalHigh)} | lab ${num(r.refLow)}..${num(r.refHigh)} | ${r.status} | delta ${delta} | ${r.date}`;
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

export async function buildReportContext(userId: string) {
  const input = await buildModelInput(userId);
  const cov = coverage(input);
  const rules = fireRules(input);
  const [tracker, previous] = await Promise.all([
    getTrackerSummary(userId, 30),
    latestReport(userId),
  ]);
  const open = profileQuestions(input);
  const dismissed = Array.isArray(input.profile.dismissed_actions)
    ? (input.profile.dismissed_actions as string[])
    : [];

  const protocol = tracker.items.length
    ? tracker.items
        .map(
          (i) =>
            `- "${i.text}" (${i.cadence}): done ${i.done}x, ${i.adherence}% adherence`,
        )
        .join("\n")
    : "- nothing adopted yet";

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

PROTOCOL AND ADHERENCE, LAST 30 DAYS (${tracker.from} to ${tracker.to}):
${protocol}
days logged: ${tracker.loggedDays} | averages: ${averages || "nothing logged"} | overall adherence ${tracker.adherencePct}%

QUESTIONS ALREADY WAITING FOR AN ANSWER: ${open.map((q) => q.key).join(", ") || "none"}

DISMISSED ACTIONS (never propose these again): ${dismissed.join("; ") || "none"}

USER CONTEXT AND DISCUSSION ON PREVIOUS ACTIONS:
${discussionLines(previous)}

PREVIOUS REPORT SUMMARY: ${previous ? (previous.body as ReportBody).summary.join(" ") : "none"}`;

  return { input, cov, rules, context };
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

  const actions = kept
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

export async function generateReport(
  userId: string,
  trigger: ReportTrigger,
): Promise<Report> {
  const { rules, context } = await buildReportContext(userId);

  const { object } = await generateObject({
    model: model(),
    schema: reportSchema,
    system: SYSTEM_PROMPT,
    prompt: context,
  });

  const body = postProcess(object as ReportBody, rules);

  const [row] = await getDb()
    .insert(reports)
    .values({ userId, trigger, body })
    .returning();

  await queueFactQuestions(
    userId,
    body.questions.map((q) => ({
      key: q.key,
      question: q.text,
      options: q.options,
      free: !q.options?.length,
    })),
  );

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
