import { currentUserId } from "@/lib/auth";
import { saveFact } from "@/lib/coverage";
import { recordBeliefs } from "@/lib/ledger";
import { PROFILE_QUESTIONS } from "@/lib/vectors";

/** One answered profile fact. The only writer the "How do you feel" page needs. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { key, value } = (await req.json()) as { key?: string; value?: string };
  if (!key || !PROFILE_QUESTIONS[key])
    return Response.json({ error: "unknown question" }, { status: 400 });
  if (typeof value !== "string" || !value.trim())
    return Response.json({ error: "no answer" }, { status: 400 });

  const options = PROFILE_QUESTIONS[key].options;
  if (options && !options.includes(value))
    return Response.json({ error: "not one of the options" }, { status: 400 });

  await saveFact(userId, key, value);
  await recordBeliefs(userId);
  return Response.json({ ok: true, key, value });
}
