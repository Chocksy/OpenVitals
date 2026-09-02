/**
 * One thread, rehydrated from our own rows.
 *
 * The `ui` column holds the message exactly as the client rendered it, so a
 * reload puts the same chips back on screen without asking the model again.
 */
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { getDb } from "@/db";
import { threadMessages, threads } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { Thread } from "@/components/chat";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  // ponytail: the id goes straight into a uuid column, so a junk path segment
  // would be a database error rather than a 404.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [thread] = await getDb()
    .select()
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.userId, userId)));
  if (!thread) notFound();

  const rows = await getDb()
    .select()
    .from(threadMessages)
    .where(eq(threadMessages.threadId, thread.id))
    .orderBy(asc(threadMessages.createdAt));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* No title above the thread: a thread is titled by the question it
          opens with, and `chat.html` prints that question once, as the
          `.qline` at the top of the thread. */}
      <div>
        <a href="/chat" className="b b-text b-sm">
          <ChevronLeft className="ic" aria-hidden="true" />
          Everything you asked
        </a>
      </div>
      <Thread
        id={thread.id}
        about={thread.about ?? undefined}
        /**
         * The row id is the key React renders on. The SDK hands the assistant
         * message back without one, so two stored answers would collide.
         */
        initial={rows.map((r) => ({ ...(r.ui as UIMessage), id: r.id }))}
      />
    </div>
  );
}
