/** `GET /api/hunches/[id]`: the case behind one row. Phase 39 S7. */
import { hunchBody } from "@/lib/api-contract";
import { currentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await hunchBody(userId, (await params).id);
  if (!body) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(body);
}
