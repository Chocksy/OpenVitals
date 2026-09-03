import { and, eq, sql } from "drizzle-orm";
import { getDb, habitLogs, protocolItems } from "@/db";
import { currentUserId } from "@/lib/auth";

/** Tick or untick one protocol item for one day. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { itemId, day, done } = (await req.json()) as {
    itemId?: string;
    day?: string;
    done?: boolean;
  };
  if (!itemId || !day) return Response.json({ error: "bad body" }, { status: 400 });

  const db = getDb();
  const [owned] = await db
    .select({ id: protocolItems.id })
    .from(protocolItems)
    .where(and(eq(protocolItems.id, itemId), eq(protocolItems.userId, userId)));
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  const [row] = await db
    .insert(habitLogs)
    .values({ userId, itemId, day, done: done !== false })
    .onConflictDoUpdate({
      target: [habitLogs.itemId, habitLogs.day],
      set: { done: sql`excluded.done` },
    })
    .returning();
  /**
   * Phase 32a section 6 writes this route's reply as `{ ok: true }`, and the
   * native app reads that field. The row it always returned stays beside it:
   * `components/checkin.tsx` and `components/plan-tick.tsx` read the row back,
   * and a contract is a promise about what is there, not about what is not.
   */
  return Response.json({ ok: true, ...row });
}
