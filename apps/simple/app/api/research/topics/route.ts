/**
 * The topic watch list, for the person signed in. Phase 35 section B1.
 *
 * A topic is a named thing you take, do, or wonder about. Most arrive on
 * their own — an active protocol item that names a supplement becomes one on
 * the nightly pass — and this route is the fourth case: you read something and
 * you want to know.
 */
import { currentUserId } from "@/lib/auth";
import { topicsBody } from "@/lib/api-contract";
import {
  addTopic,
  normalizeTopic,
  relevanceOf,
  removeTopic,
  topicPerson,
} from "@/lib/topic-watch";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await topicsBody(userId));
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    label?: string;
    origin?: string;
  } | null;
  const label = body?.label?.trim() ?? "";
  if (normalizeTopic(label).length < 3)
    return Response.json({ error: "no topic" }, { status: 400 });

  const origin = ["adopted", "goal", "asked", "typed"].includes(
    body?.origin ?? "",
  )
    ? body!.origin!
    : "typed";
  const row = await addTopic(userId, label, origin);
  if (!row) return Response.json({ error: "no topic" }, { status: 400 });

  return Response.json(
    {
      topic: row.topic,
      label: row.label,
      origin: row.origin,
      lastRunAt: row.lastRunAt?.toISOString().slice(0, 10) ?? null,
      outcomes: 0,
      papers: 0,
      found: 0,
      // the same sentence the list and the page print, computed the same way
      relevance: relevanceOf(row, await topicPerson(userId)),
    },
    { status: 201 },
  );
}

/**
 * Stop watching. The findings stay on file: this stops the next run, it does
 * not delete a paper somebody already read.
 */
export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as { topic?: string } | null;
  const topic = body?.topic ?? url.searchParams.get("topic") ?? "";
  if (!topic) return Response.json({ error: "no topic" }, { status: 400 });

  const gone = await removeTopic(userId, topic);
  return Response.json({ ok: gone }, { status: gone ? 200 : 404 });
}
