import { eq, inArray } from "drizzle-orm";
import {
  getDb,
  goals,
  metrics,
  protocolItems,
  reports,
  reviewItems,
  type ReportAction,
} from "@/db";
import { currentUserId } from "@/lib/auth";

const DAY = 86_400_000;

/** The first number in "LDL down to 70 mg/dL". */
const firstNumber = (text: string): number | null => {
  const hit = text.replace(/[,\s](?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/);
  return hit ? Number(hit[0]) : null;
};

const doseSummary = (a: ReportAction) =>
  a.dose ? `${a.title} — ${a.dose.amount}, ${a.dose.schedule}` : a.title;

/**
 * Take one action off the plan and turn it into everything that makes it real:
 * a protocol item to tick, a check-in for each follow-up dated in the future,
 * and a goal for every target whose expected value is a number.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { reportId, actionIndex } = (await req.json()) as {
    reportId?: string;
    actionIndex?: number;
  };
  if (!reportId || typeof actionIndex !== "number")
    return Response.json({ error: "no action" }, { status: 400 });

  const db = getDb();
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report || report.userId !== userId)
    return Response.json({ error: "not found" }, { status: 404 });

  const action = report.body.actions[actionIndex];
  if (!action) return Response.json({ error: "not found" }, { status: 404 });

  await db.insert(protocolItems).values({
    userId,
    text: doseSummary(action).slice(0, 300),
    why: action.why.slice(0, 500),
    metricCodes: action.targets.map((t) => t.code),
    cadence: /week/i.test(action.dose?.schedule ?? "") ? "weekly" : "daily",
  });

  for (const [i, f] of action.followUp.entries())
    await db.insert(reviewItems).values({
      userId,
      kind: "check_in",
      subject: {
        key: `${reportId}:${actionIndex}:${i}`,
        reportId,
        actionIndex,
        ask: f.ask,
        detail: `${action.title} · day ${f.afterDays}`,
      },
      question: f.ask,
      options: ["Yes", "No", "Note…"],
      createdAt: new Date(Date.now() + f.afterDays * DAY),
    });

  const codes = action.targets.map((t) => t.code);
  const known = codes.length
    ? new Set(
        (
          await db
            .select({ code: metrics.code })
            .from(metrics)
            .where(inArray(metrics.code, codes))
        ).map((m) => m.code),
      )
    : new Set<string>();

  for (const t of action.targets) {
    if (!known.has(t.code)) continue;
    const target = firstNumber(t.expect);
    if (target == null) continue;
    const band =
      t.direction === "down"
        ? { targetLow: null, targetHigh: target }
        : { targetLow: target, targetHigh: null };
    await db
      .insert(goals)
      .values({
        userId,
        metricCode: t.code,
        ...band,
        note: `${action.title}: ${t.expect}`,
      })
      .onConflictDoUpdate({
        target: [goals.userId, goals.metricCode],
        set: {
          ...band,
          note: `${action.title}: ${t.expect}`,
          achievedAt: null,
        },
      });
  }

  return Response.json({ ok: true });
}
