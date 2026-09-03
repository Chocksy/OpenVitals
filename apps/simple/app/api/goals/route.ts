import { and, eq, sql } from "drizzle-orm";
import { getDb, goals } from "@/db";
import { currentUserId } from "@/lib/auth";

const num = (v: unknown) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * One goal per metric, so this is an upsert.
 *
 * Phase 34 section 1 asked whether the web only had a form action here. It
 * did not: this is already JSON in and JSON out, `components/tracker.tsx`'s
 * `GoalForm` posts it, and the phone posts exactly the same body. The only
 * change is that the reply no longer echoes the user id back.
 *
 * A goal is a target, a date, or both. Phase 27: "Plan retest: HbA1c in 12
 * weeks" is a date with no number behind it — the answer said when to measure,
 * not what to reach — and the Next draw tile reads exactly that.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const b = (await req.json()) as Record<string, unknown>;
  const metricCode = String(b.metricCode ?? "");
  const targetLow = num(b.targetLow);
  const targetHigh = num(b.targetHigh);
  const due = b.due ? String(b.due) : null;
  if (!metricCode)
    return Response.json({ error: "need a marker" }, { status: 400 });
  if (targetLow == null && targetHigh == null && !due)
    return Response.json({ error: "need a target or a date" }, { status: 400 });

  const set = {
    targetLow,
    targetHigh,
    due,
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
  /* Phase 34 section 1: the phone posts this too, and the owner is the
     session. `toApiPaper` drops the id for the same reason. */
  const { userId: _mine, ...saved } = row!;
  return Response.json(saved);
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
