import { currentUserId } from "@/lib/auth";
import { setupBody, setupPost, type SetupPost } from "@/lib/setup-server";

/**
 * Phase 43A: the setup flow. GET is the screen to draw now; POST saves one
 * screen's answers and returns the next GET body. Web and iOS draw the same
 * JSON (`SetupBody` in lib/setup-server.ts).
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await setupBody(userId));
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as SetupPost | null;
  if (!body || typeof body !== "object")
    return Response.json({ error: "no body" }, { status: 400 });
  const out = await setupPost(userId, body);
  if ("error" in out) return Response.json(out, { status: 400 });
  return Response.json(out);
}
