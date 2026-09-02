/**
 * Everything you asked.
 *
 * Phase 28c. The chat page was one stateless box; it is now the list of
 * threads, with a fresh one started from the box at the bottom.
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { threads } from "@/db/schema";
import { requireUserId } from "@/lib/auth";
import { Thread, ThreadList } from "@/components/chat";
import { plural } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const userId = await requireUserId();
  const rows = await getDb()
    .select()
    .from(threads)
    .where(eq(threads.userId, userId))
    .orderBy(desc(threads.lastTurnAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="t-title text-[length:var(--type-xl)] leading-none">
          Ask
        </h1>
        <p className="t-meta mt-2">
          Questions about your own lab data. Not medical advice.
        </p>
      </div>

      <Thread />

      <section className="panel">
        <div className="panel-head">
          <h3>Everything you asked</h3>
          <span className="r">{plural(rows.length, "thread")}</span>
        </div>
        <ThreadList
          threads={rows.map((t) => ({
            id: t.id,
            title: t.title,
            about: t.about,
            lastTurnAt: t.lastTurnAt?.toISOString() ?? null,
          }))}
        />
      </section>
    </div>
  );
}
