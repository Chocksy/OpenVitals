import { currentUserId } from "@/lib/auth";
import { confirmFact, skipFact } from "@/lib/facts";
import { PROFILE_QUESTIONS } from "@/lib/vectors";

/**
 * "Still true" and "not now": the two answers that change nothing about the
 * past.
 *
 * A confirmation writes no history row, because no new value became true. It
 * moves `revisit_at` forward and leaves a tick on the open row so `/history`
 * can show that somebody looked. A skip is the same thing for a month.
 * Changing the answer is `/api/facts`, which is a different sentence about the
 * past and therefore a different endpoint.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { key, action } = (await req.json()) as {
    key?: string;
    action?: string;
  };
  if (!key || !PROFILE_QUESTIONS[key])
    return Response.json({ error: "unknown question" }, { status: 400 });
  if (action !== "confirm" && action !== "skip")
    return Response.json({ error: "unknown action" }, { status: 400 });

  const result =
    action === "confirm"
      ? await confirmFact(userId, key)
      : await skipFact(userId, key);
  if (!result)
    return Response.json({ error: "nothing on file" }, { status: 404 });

  return Response.json({ ok: true, key, action, ...result });
}
