import { and, eq, sql } from "drizzle-orm";
import { getDb, goals } from "@/db";
import { currentUserId } from "@/lib/auth";

const num = (v: unknown) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** One goal per metric, so this is an upsert. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const b = (await req.json()) as Record<string, unknown>;
  const metricCode = String(b.metricCode ?? "");
  const targetLow = num(b.targetLow);
  const targetHigh = num(b.targetHigh);
  if (!metricCode || (targetLow == null && targetHigh == null))
    return Response.json({ error: "need a target" }, { status: 400 });

  const set = {
    targetLow,
    targetHigh,
    due: b.due ? String(b.due) : null,
    note: b.note ? String(b.note).slice(0, 300) : null,
    // A new target restarts the clock.
    achievedAt: null,
  };
  const [row] = await getDb()
    .insert(goals)
    .values({ userId, metricCode, ...set })
    .onConflictDoUpdate({
      target: [goals.userId, goals.metricCode],
      set: { ...set, createdAt: sql`now()` },
    })
    .returning();
  return Response.json(row);
}

export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const code = new URL(req.url).searchParams.get("code");
  if (!code) return Response.json({ error: "no code" }, { status: 400 });

  const deleted = await getDb()
    .delete(goals)
    .where(and(eq(goals.userId, userId), eq(goals.metricCode, code)))
    .returning({ id: goals.id });
  if (!deleted.length)
    return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
