import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, habitLogs, protocolItems } from "@/db";
import { currentUserId } from "@/lib/auth";
import { missingDays, startOf } from "@/lib/changes";
import { localDay } from "@/lib/daily";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Batch 5B: "I took it most days". A done tick for each day from the item's
 * start (`started_at`, else the day it was added) to `until`, the draw date,
 * that has no `habit_logs` row yet. A day already logged, ticked or not, is
 * kept as the person left it. Owner-only, same auth as `POST /api/habits`.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { itemId, until } = (await req.json()) as {
    itemId?: string;
    until?: string;
  };
  if (!itemId || !until || !DATE.test(until))
    return Response.json({ error: "bad body" }, { status: 400 });

  const db = getDb();
  const [item] = await db
    .select({
      startedAt: protocolItems.startedAt,
      createdAt: protocolItems.createdAt,
    })
    .from(protocolItems)
    .where(and(eq(protocolItems.id, itemId), eq(protocolItems.userId, userId)));
  if (!item) return Response.json({ error: "not found" }, { status: 404 });

  const start = startOf(item);
  const today = localDay();
  const end = until > today ? today : until;
  if (!start || start > end) return Response.json({ ok: true, written: 0 });

  const have = await db
    .select({ day: habitLogs.day })
    .from(habitLogs)
    .where(
      and(
        eq(habitLogs.itemId, itemId),
        gte(habitLogs.day, start),
        lte(habitLogs.day, end),
      ),
    );
  const days = missingDays(
    start,
    end,
    have.map((h) => h.day),
  );
  if (days.length)
    await db
      .insert(habitLogs)
      .values(days.map((day) => ({ userId, itemId, day, done: true })))
      .onConflictDoNothing({ target: [habitLogs.itemId, habitLogs.day] });

  return Response.json({ ok: true, written: days.length });
}
