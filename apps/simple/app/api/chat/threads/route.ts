/**
 * The threads a person has: list one, read one, delete one, seed one.
 *
 * Phase 28c. Threads live in our Postgres under our deletion policy. Every
 * hosted thread store on the market marks that exact feature ineligible for
 * zero data retention and for a BAA, which for a blood-panel app is the wrong
 * trade, so we keep the table and the two queries.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, threads, threadMessages } from "@/db";
import { currentUserId } from "@/lib/auth";
import { titleOf } from "@/lib/thread-turn";
import { PROFILE_QUESTIONS } from "@/lib/vectors";
import type { Acts } from "@/lib/lookup";

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
    .orderBy(threadMessages.createdAt);
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

/**
 * "Continue this": one answer the composer already gave, turned into a thread.
 *
 * The answer is not re-asked. The paragraph and the chips the person is
 * looking at become the first assistant turn, so the follow-up they type next
 * is answered with that turn in the history.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { question, answer, about } = (await req.json()) as {
    question?: string;
    answer?: { reply?: string; acts?: Acts };
    about?: string;
  };
  const q = (question ?? "").trim();
  const reply = (answer?.reply ?? "").trim();
  if (!q || !reply)
    return Response.json({ error: "nothing to continue" }, { status: 400 });

  const db = getDb();
  const [thread] = await db
    .insert(threads)
    .values({ userId, title: titleOf(q), about: about ?? null })
    .returning();
  if (!thread) return Response.json({ error: "no thread" }, { status: 500 });

  const acts = answer?.acts;
  await db.insert(threadMessages).values([
    {
      threadId: thread.id,
      role: "user",
      ui: {
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text: q }],
      },
      model: [{ role: "user", content: q }],
    },
    {
      threadId: thread.id,
      role: "assistant",
      ui: {
        id: randomUUID(),
        role: "assistant",
        parts: [
          { type: "text", text: reply },
          ...(acts
            ? [
                {
                  type: "tool-offer",
                  toolCallId: randomUUID(),
                  state: "output-available",
                  input: { prose_done: true },
                  output: {
                    ...acts,
                    options: Object.fromEntries(
                      acts.questions.map((q) => [
                        q.key,
                        PROFILE_QUESTIONS[q.key]?.options ?? [],
                      ]),
                    ),
                  },
                },
              ]
            : []),
        ],
      },
      model: [
        { role: "assistant", content: [{ type: "text", text: reply }] },
      ],
    },
  ]);
  return Response.json({ id: thread.id });
}
