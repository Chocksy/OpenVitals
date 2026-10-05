/**
 * The threads a person has: list one, read one, delete one.
 *
 * Phase 28c. Threads live in our Postgres under our deletion policy. Every
 * hosted thread store on the market marks that exact feature ineligible for
 * zero data retention and for a BAA, which for a blood-panel app is the wrong
 * trade, so we keep the table and the two queries.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, threads, threadMessages } from "@/db";
import { currentUserId } from "@/lib/auth";

export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    const rows = await db
      .select({
        id: threads.id,
        title: threads.title,
        about: threads.about,
        lastTurnAt: threads.lastTurnAt,
      })
      .from(threads)
      .where(eq(threads.userId, userId))
      .orderBy(desc(threads.lastTurnAt));
    return Response.json({ threads: rows });
  }

  const [thread] = await db
    .select()
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, userId)));
  if (!thread) return Response.json({ error: "not found" }, { status: 404 });

  const rows = await db
    .select({ ui: threadMessages.ui })
    .from(threadMessages)
    .where(eq(threadMessages.threadId, id))
    .orderBy(
      // One insert writes a turn's question and answer with the same
      // timestamp; "user" sorts after "assistant", so desc puts the question first.
      asc(threadMessages.createdAt),
      desc(threadMessages.role),
    );
  return Response.json({
    thread: {
      id: thread.id,
      title: thread.title,
      about: thread.about,
      lastTurnAt: thread.lastTurnAt,
    },
    messages: rows.map((r) => r.ui),
  });
}

export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "no id" }, { status: 400 });
  const gone = await getDb()
    .delete(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, userId)))
    .returning({ id: threads.id });
  if (!gone.length) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
