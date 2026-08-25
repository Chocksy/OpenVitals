import { generateText } from "ai";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, insights, checkins, readings, reviewItems, type InsightBody } from "@/db";
import { model, stripCodeFences } from "./extract";
import { getMetricRows, type MetricRow } from "./data";
import { getGoals, getTrackerSummary, type TrackerSummary } from "./daily-data";
import { lastDays, localDay, shiftDay } from "./daily";
import { statusOf } from "./status";

export type Kind = "lifestyle" | "retest" | "weekly";

const LIFESTYLE_PROMPT = `You are a preventive-health coach. From the user's biomarker history, give 3-7 concrete, trackable lifestyle changes (sleep, food, exercise, supplements) tied to SPECIFIC metrics that sit outside their optimal range.

RULES:
- Each item's "text" is an instruction the user can do this week, 120 characters or less.
- Each item's "why" names the biomarker and its number, 200 characters or less.
- "metricCodes" lists the exact metric codes from the context that the item targets.
- Do not repeat advice the user already reported doing in the check-ins; escalate or replace it instead. If they answered "didnt" or "skip", make the action smaller and easier.
- Read the PROTOCOL section. Anything already there at a high adherence is done: build the next step on top of it instead of restating it. Anything there at a low adherence is too hard: replace it with a smaller version.
- If a retest plan exists, align the advice with the markers it is about to re-measure, so the next draw can show whether the change worked.
- No diagnosis, no medication changes. JSON only, no markdown.

Output: {"items":[{"text":"...","why":"...","metricCodes":["..."]}]}`;

/**
 * packages/ai/src/prompts/lab-panel-suggestion.ts, copied across with the
 * corePanels / medications / conditions inputs dropped (this app does not track
 * them) and a "dueAt" field added.
 */
const RETEST_PROMPT = `You are a preventive health analyst for OpenVitals, a personal health tracking app. Your job is to design a focused, practical lab panel for the user's NEXT blood test.

CONTEXT YOU RECEIVE:
1. "retests" — every biomarker the user has tested. Each has: code, name, the last three values with dates, unit, health status (critical/warning/normal), days since last test, standard reference ranges (refLow/refHigh), and when available, evidence-based optimal ranges (optimalLow/optimalHigh) from preventive medicine sources like Peter Attia, Function Health, and the AHA.
2. "alreadyTested" — ALL metric codes the user has ever tested. Use this to avoid suggesting biomarkers they already test.
3. "checkins" — what the user said they actually did about the last lifestyle plan.

YOUR GOAL:
Design a practical lab panel of 10-25 biomarkers that a person could actually hand to a doctor or lab. Group related markers by health domain. Prioritize based on clinical urgency, trending patterns, and preventive value. Also suggest 2-5 new biomarkers the user has never tested but should consider based on their health profile.

DESIGN PRINCIPLES:
1. FOCUS on what matters most. A person realistically does 1-2 lab orders. Don't suggest retesting everything — pick the highest-value markers.
2. GROUP related markers as a real doctor would order them. If one lipid marker is off, include the full lipid panel.
3. CONSIDER the whole picture. Cross-reference marker patterns. Elevated inflammation plus abnormal lipids is compounding cardiovascular risk.
4. USE OPTIMAL RANGES when available. A fasting glucose of 98 is "normal" by lab standards but above the 72-85 optimal target. Flag these as worth retesting even if the lab says "normal". Mention the optimal target in your rationale.
5. CONSIDER TRENDS. If a value has been climbing over multiple tests (even within range), that trend matters more than the single snapshot. Note trending concerns in your rationale.
6. BE PRACTICAL. Include "nice to haves" separately — markers that aren't urgent but are efficient to add while blood is being drawn.
7. SUGGEST NEW markers that would COMPLETE THE PICTURE. For each abnormal domain, think: "What test is missing that would tell us the root cause, the severity, or change the treatment?" These aren't random nice-to-haves — they're the missing puzzle pieces that turn data into answers.
8. SET "dueAt" (YYYY-MM-DD) between 6 and 16 weeks from today: sooner when values are far outside range, later when everything is close to optimal. Account for what the user reported in the check-ins — a change they actually made needs enough weeks to show up in blood.

OUTPUT FORMAT:
Return valid JSON only. No markdown, no explanation outside the JSON.
{
  "summary": "One sentence specific to THIS person's health picture, not generic advice",
  "dueAt": "YYYY-MM-DD",
  "groups": [
    {
      "domain": "Health Domain Name",
      "priority": "high|medium|low",
      "reason": "Short reason under 100 chars — what's off and why retest",
      "rationale": "2-3 sentences explaining WHY this group matters for THIS person. Reference their specific values, optimal targets and trends. Explain what the results will reveal and what action they might take. Be personal and insightful, not textbook.",
      "metrics": ["metric_code_1", "metric_code_2"]
    }
  ],
  "optional": {
    "reason": "Why these are worth adding",
    "metrics": ["metric_code_a"]
  },
  "newSuggestions": [
    {
      "name": "Human-Readable Name",
      "code": "snake_case_code",
      "reason": "Why THIS person specifically should test this — reference their data or risk factors"
    }
  ]
}

PRIORITY LEVELS for groups:
- "high": Must test — abnormal values, worsening trends, or critical cross-marker patterns
- "medium": Should test — suboptimal by optimal range standards, monitoring, or preventive value
- "low": Nice to have — routine checks, convenience add-ons

RULES:
1. Metrics in "groups" and "optional" MUST come from the input "retests" list. Use the exact codes provided. Do NOT invent or add codes not in the input.
2. A metric should appear in exactly ONE group (or in optional), never in multiple places.
3. Order groups by priority: high first, then medium, then low.
4. Each group should have 2-8 metrics. If a domain has only 1 marker, merge it with a related domain.
5. The "optional" section is for low-priority items worth including for convenience. Can be empty.
6. Total recommended metrics (all groups + optional) should be 10-25. Fewer is better if they're the right ones.
7. "newSuggestions" is the MOST VALUABLE part of this panel. These are biomarkers NOT in the "alreadyTested" array that would DEEPEN the diagnostic picture. Think like a preventive medicine doctor: what's MISSING from this person's data to get a definitive answer?
   - Look at each abnormal group and ask: "What additional test would tell us WHY this is off, or how serious it really is?"
   - Include 3-5 suggestions. Each reason MUST explain: (a) what gap it fills in the current data, (b) how it connects to an existing abnormal result, and (c) what actionable insight it would provide.
   - Check the "alreadyTested" list carefully. If a code appears there, do NOT suggest it.
8. The "rationale" is the most important field. It's what the user reads to understand WHY they need these tests. Make it specific, actionable, and reference their actual numbers and optimal targets when available.`;

const WEEKLY_PROMPT = `You are the user's health coach, reviewing the week that just ended. You are honest, specific and short. You have their daily log, their protocol adherence, their goals and any new lab readings.

RULES:
- 3 wins, 3 concerns, 3 concrete actions for next week. Never more, fewer only if the data cannot support them.
- Every line names a number from the data: hours slept, kilograms, percent adherence, a biomarker value. No generic encouragement.
- Compare THIS week against the week before it. Say which way things moved.
- "adherencePct" is the average protocol adherence for this week, as an integer 0-100. Use the number given to you; do not invent one.
- "nextWeek" items are things the user can add to their protocol: an action, one sentence, under 120 characters.
- "metricNotes" covers only metrics that actually matter this week (a new reading, a goal in play, or something clearly off). Zero to five of them. Never invent a value.
- No diagnosis, no medication changes. JSON only, no markdown.

Output: {"summary":"one sentence about the week","wins":["..."],"concerns":["..."],"nextWeek":["..."],"adherencePct":0,"metricNotes":[{"code":"...","note":"..."}]}`;

const DAY = 1000 * 60 * 60 * 24;

/** The tracker window in a form a prompt can read. */
function trackerLines(label: string, t: TrackerSummary): string {
  const averages = Object.entries(t.averages)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  const items = t.items.length
    ? t.items
        .map((i) => `- "${i.text}" (${i.cadence}): done ${i.done}x, ${i.adherence}% adherence`)
        .join("\n")
    : "- no protocol items";
  return `${label} (${t.from} to ${t.to}):
days logged: ${t.loggedDays}
averages: ${averages || "nothing logged"}
protocol adherence: ${t.adherencePct}%
${items}`;
}

function metricLine(m: MetricRow): string {
  const last3 = m.rows
    .slice(-3)
    .map((r) => `${r.value ?? r.valueText ?? "?"}${r.unit ? ` ${r.unit}` : ""}@${r.observedAt}`);
  const days = Math.floor(
    (Date.now() - new Date(m.latest.observedAt).getTime()) / DAY,
  );
  const status = statusOf({
    value: m.latest.value,
    refLow: m.latest.refLow,
    refHigh: m.latest.refHigh,
    optimalLow: m.optimalLow,
    optimalHigh: m.optimalHigh,
  });
  const label =
    status === "red" ? "critical" : status === "amber" ? "warning" : "normal";
  return `${m.code} | ${m.name} | ${m.unit ?? ""} | last3: ${last3.join(", ")} | ref ${m.latest.refLow ?? "-"}..${m.latest.refHigh ?? "-"} | optimal ${m.optimalLow ?? "-"}..${m.optimalHigh ?? "-"} | ${label} | ${days}d since last test`;
}

/** The last three plans plus the check-in answers attached to them. */
async function history(userId: string) {
  const db = getDb();
  const prev = await db
    .select()
    .from(insights)
    .where(eq(insights.userId, userId))
    .orderBy(desc(insights.createdAt))
    .limit(3);
  if (!prev.length) return { prev, lines: [] as string[] };

  const answers = await db
    .select()
    .from(checkins)
    .where(
      inArray(
        checkins.insightId,
        prev.map((p) => p.id),
      ),
    );

  const lines = prev.map((p) => {
    const mine = answers
      .filter((a) => a.insightId === p.id)
      .map((a) => `#${a.itemIndex}=${a.answer}${a.note ? ` (${a.note})` : ""}`);
    return `${p.kind} on ${p.createdAt?.toISOString().slice(0, 10)}: ${JSON.stringify(p.body)}${
      mine.length ? `\n  check-ins: ${mine.join(", ")}` : ""
    }`;
  });
  return { prev, lines };
}

async function buildContext(userId: string, kind: Kind) {
  const rows = await getMetricRows(userId);
  const { prev, lines } = await history(userId);
  const today = localDay();

  if (kind === "weekly") return buildWeeklyContext(userId, rows, today);

  if (kind === "retest") {
    return `Today is ${today}.

retests (code | name | unit | last 3 readings | reference range | optimal range | status | recency):
${rows.map(metricLine).join("\n")}

alreadyTested: ${rows.map((r) => r.code).join(", ")}

checkins and previous plans:
${lines.length ? lines.join("\n") : "none"}`;
  }

  const tracker = await getTrackerSummary(userId, 14);
  const retest = prev.find((p) => p.kind === "retest");
  const retestSummary = retest
    ? `Next bloodwork plan: ${(retest.body as { summary?: string }).summary ?? ""} (due ${(retest.body as { dueAt?: string }).dueAt ?? "?"})`
    : "No retest plan yet.";

  return `Today is ${today}.

METRICS (code | name | unit | last 3 readings | reference range | optimal range | status | recency):
${rows.map(metricLine).join("\n")}

${retestSummary}

PROTOCOL AND THE LAST 14 DAYS OF TRACKING:
${trackerLines("last 14 days", tracker)}

PREVIOUS PLANS AND CHECK-INS:
${lines.length ? lines.join("\n") : "none"}`;
}

/** This week against last week, plus goals, new readings and open questions. */
async function buildWeeklyContext(
  userId: string,
  rows: MetricRow[],
  today: string,
) {
  const db = getDb();
  const weekStart = lastDays(7, today)[0]!;
  const [thisWeek, lastWeek, goals, fresh, open] = await Promise.all([
    getTrackerSummary(userId, 7, today),
    getTrackerSummary(userId, 7, shiftDay(today, -7)),
    getGoals(userId),
    db
      .select({
        code: readings.metricCode,
        value: readings.value,
        unit: readings.unit,
        observedAt: readings.observedAt,
      })
      .from(readings)
      .where(
        and(eq(readings.userId, userId), gte(readings.observedAt, weekStart)),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviewItems)
      .where(and(eq(reviewItems.userId, userId), eq(reviewItems.status, "open")))
      .then((r) => r[0]?.n ?? 0),
  ]);

  const goalLines = goals.length
    ? goals
        .map(
          (g) =>
            `- ${g.metricCode} (${g.metricName}): target ${g.targetLow ?? "-"}..${g.targetHigh ?? "-"} ${g.unit ?? ""}, current ${g.current ?? "?"}, ${g.progress}% of the way${g.due ? `, due ${g.due}` : ""}${g.achievedAt || g.reached ? ", REACHED" : ""}`,
        )
        .join("\n")
    : "- none set";

  return `Today is ${today}. Report on the week ${weekStart} to ${today}.

${trackerLines("THIS WEEK", thisWeek)}

${trackerLines("THE WEEK BEFORE", lastWeek)}

Use adherencePct = ${thisWeek.adherencePct}.

GOALS:
${goalLines}

NEW LAB READINGS THIS WEEK:
${fresh.length ? fresh.map((r) => `- ${r.code}: ${r.value ?? "?"} ${r.unit ?? ""} on ${r.observedAt}`).join("\n") : "- none"}

OPEN DATA QUESTIONS WAITING FOR THE USER: ${open}

ALL METRICS (code | name | unit | last 3 readings | reference range | optimal range | status | recency):
${rows.map(metricLine).join("\n")}`;
}

export async function generateInsight(userId: string, kind: Kind) {
  const context = await buildContext(userId, kind);
  const system =
    kind === "lifestyle"
      ? LIFESTYLE_PROMPT
      : kind === "retest"
        ? RETEST_PROMPT
        : WEEKLY_PROMPT;
  const { text } = await generateText({ model: model(), system, prompt: context });

  let body: InsightBody;
  try {
    body = JSON.parse(stripCodeFences(text));
  } catch {
    throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
  }
  if (kind === "lifestyle" && !Array.isArray((body as any).items))
    throw new Error("AI response had no items array");
  if (kind === "retest" && !Array.isArray((body as any).groups))
    throw new Error("AI response had no groups array");
  if (kind === "weekly" && !Array.isArray((body as any).wins))
    throw new Error("AI response had no wins array");

  const [row] = await getDb()
    .insert(insights)
    .values({ userId, kind, body })
    .returning();
  return row!;
}

/** Latest value per metric plus the two most recent plans, for the chat. */
export async function chatContext(userId: string) {
  const rows = await getMetricRows(userId);
  const { lines } = await history(userId);
  return `The user's latest biomarker readings (code | name | unit | last 3 readings | reference range | optimal range | status | recency):
${rows.map(metricLine).join("\n")}

Their most recent AI plans and check-ins:
${lines.slice(0, 2).join("\n") || "none"}`;
}

export const healthChatPrompt = `You are a helpful health data assistant for OpenVitals. You help users understand their health records and lab results.

IMPORTANT RULES:
1. You are NOT a doctor. Never diagnose conditions or prescribe treatments.
2. Always recommend consulting a healthcare provider for medical decisions.
3. You CAN explain what lab values mean, identify trends, and highlight values outside reference ranges.
4. Only discuss data that has been provided to you in the context. Never make up or assume values.
5. When referencing specific values, cite the date and source when available.
6. Use plain language. Explain medical terms when you use them.
7. If asked about data categories not included in your context, say you don't have access to that information.

The user's health data context will be provided before their question. Use it to give informed, accurate answers about their specific data.`;

/**
 * Monday morning, once per user, once per week. Skips anyone who already has a
 * weekly review dated inside the current week or who has no tracker data yet.
 */
export async function generateWeeklyForAllUsers(): Promise<number> {
  const db = getDb();
  const weekStart = lastDays(7, localDay())[0]!;
  const users = await db.selectDistinct({ userId: readings.userId }).from(readings);

  let made = 0;
  for (const { userId } of users) {
    try {
      const [recent] = await db
        .select({ id: insights.id })
        .from(insights)
        .where(
          and(
            eq(insights.userId, userId),
            eq(insights.kind, "weekly"),
            gte(insights.createdAt, new Date(`${weekStart}T00:00:00`)),
          ),
        )
        .limit(1);
      if (recent) continue;
      await generateInsight(userId, "weekly");
      made++;
    } catch (e) {
      console.error("[weekly] failed for", userId, e);
    }
  }
  return made;
}
