/**
 * `POST /api/compose/reread` — read the notes that were kept while the reader
 * was down, for the signed-in person.
 *
 * The daily pass does the same thing for everybody (`lib/curator.ts`); this is
 * the button behind it, so a person whose provider came back does not wait for
 * midnight. `{ "seen": true }` clears the "N notes read since your last visit"
 * line instead, which is what the Home card calls once it has printed it.
 */
import { currentUserId } from "@/lib/auth";
import { markNotesSeen, rereadPosts } from "@/lib/compose";

export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { seen?: boolean };
  if (body?.seen === true) {
    await markNotesSeen(userId);
    return Response.json({ ok: true, seen: true });
  }

  const { read, stillDown } = await rereadPosts(userId);
  return Response.json({ ok: true, read, stillDown });
}
