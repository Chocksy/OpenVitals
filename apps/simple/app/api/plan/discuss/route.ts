import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { getDb, reports } from "@/db";
import { currentUserId } from "@/lib/auth";
import { model } from "@/lib/extract";
import { buildReportContext } from "@/lib/report";

export const maxDuration = 120;

const MAX_MESSAGE = 1000;

const SYSTEM_PROMPT = `You are the physician who wrote this plan. The person is replying about one action in it.

Answer them directly, in under 150 words, in plain language. No greeting, no sign-off, no disclaimer about seeing a doctor unless the answer really is "see a doctor".

Keep the three basis labels: say whether what you tell them is science, your opinion from their values, or anecdotal. Never print a dose above the ceilings in the plan.

If what they just told you changes the recommendation, say what changes and why, with the new dose or schedule. If it does not change, say so and why in one line.`;

/**
 * One reply about one action, appended to that action's `notes` so the next
 * plan is written with it in the context pack.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { reportId, actionIndex, message } = (await req.json()) as {
    reportId?: string;
    actionIndex?: number;
    message?: string;
  };
  const text = (message ?? "").trim().slice(0, MAX_MESSAGE);
  if (!reportId || typeof actionIndex !== "number" || !text)
    return Response.json({ error: "no message" }, { status: 400 });

  const db = getDb();
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report || report.userId !== userId)
    return Response.json({ error: "not found" }, { status: 404 });

  const action = report.body.actions[actionIndex];
  if (!action) return Response.json({ error: "not found" }, { status: 404 });

  try {
    const { context } = await buildReportContext(userId);
    const { text: reply } = await generateText({
      model: model(),
      system: SYSTEM_PROMPT,
      prompt: `${context}

THE ACTION THEY ARE REPLYING TO:
${JSON.stringify(action, null, 2)}

WHAT THEY SAID:
${text}`,
    });

    const body = structuredClone(report.body);
    const target = body.actions[actionIndex]!;
    target.notes = [
      ...(target.notes ?? []),
      { q: text, a: reply.trim(), at: new Date().toISOString() },
    ];
    await db.update(reports).set({ body }).where(eq(reports.id, reportId));

    return Response.json({ reply: reply.trim() });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[plan] discuss failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
