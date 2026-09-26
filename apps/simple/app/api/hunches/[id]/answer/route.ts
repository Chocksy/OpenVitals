/**
 * `POST /api/hunches/[id]/answer` `{ chip }`: one tapped chip re-weights the
 * explanations and chooses the test again. Returns the case. Phase 39 S7.
 */
import { hunchBody } from "@/lib/api-contract";
import { currentUserId } from "@/lib/auth";
import { answerHunch } from "@/lib/hunches";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { chip?: unknown } | null;
  if (typeof body?.chip !== "string")
    return Response.json({ error: "a chip id" }, { status: 400 });
  const got = await answerHunch(userId, id, body.chip);
  if ("error" in got)
    return Response.json(got, { status: got.error === "not found" ? 404 : 409 });
  return Response.json(await hunchBody(userId, id));
}
