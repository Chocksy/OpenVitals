import { currentUserId } from "@/lib/auth";
import {
  checkinBody,
  checkinPost,
  type CheckinPost,
} from "@/lib/checkin-server";

/**
 * Phase 44B: the check-in. GET is the screen to draw now (or `due: false`
 * and when it comes back); POST saves one answer, a snooze, a skip or the
 * closing tap and returns the next GET body. Web and iOS draw the same JSON
 * (`CheckinBody` in lib/checkin-server.ts).
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await checkinBody(userId));
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as CheckinPost | null;
  if (!body || typeof body !== "object")
    return Response.json({ error: "no body" }, { status: 400 });
  const out = await checkinPost(userId, body);
  if ("error" in out) return Response.json(out, { status: 400 });
  return Response.json(out);
}
