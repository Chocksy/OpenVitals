/**
 * One topic: the verdict strip, the trials, the associations and the papers.
 * Phase 35 section B and the `topic.html` mockup.
 */
import { currentUserId } from "@/lib/auth";
import { topicBody } from "@/lib/api-contract";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topic: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { topic } = await params;
  const body = await topicBody(userId, decodeURIComponent(topic));
  if (!body) return Response.json({ error: "not watched" }, { status: 404 });
  return Response.json(body);
}
