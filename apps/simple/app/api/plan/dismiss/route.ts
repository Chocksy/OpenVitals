import { and, eq } from "drizzle-orm";
import { getDb, profileFacts, reports } from "@/db";
import { currentUserId } from "@/lib/auth";
import { recordBeliefs } from "@/lib/ledger";

/**
 * "Not for me". The title lands in the `dismissed_actions` fact, which the
 * context pack repeats back to the model so it stops proposing it.
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

  const [existing] = await db
    .select()
    .from(profileFacts)
    .where(
      and(
        eq(profileFacts.userId, userId),
        eq(profileFacts.key, "dismissed_actions"),
      ),
    );
  const titles = new Set(
    Array.isArray(existing?.value) ? (existing.value as string[]) : [],
  );
  titles.add(action.title);
  const value = [...titles];

  await db
    .insert(profileFacts)
    .values({ userId, key: "dismissed_actions", value, source: "user" })
    .onConflictDoUpdate({
      target: [profileFacts.userId, profileFacts.key],
      set: { value, answeredAt: new Date() },
    });

  await recordBeliefs(userId);
  return Response.json({ ok: true });
}
