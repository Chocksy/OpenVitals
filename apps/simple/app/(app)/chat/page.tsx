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
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Ask
        </h1>
        <p className="mt-1 font-body text-[13px] text-neutral-500">
          Questions about your own lab data. Not medical advice.
        </p>
      </div>

      <Thread />

      <h2 className="t-meta text-[11px] tracking-[0.08em] text-neutral-400">
        EVERYTHING YOU ASKED
      </h2>
      <ThreadList
        threads={rows.map((t) => ({
          id: t.id,
          title: t.title,
          about: t.about,
          lastTurnAt: t.lastTurnAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
