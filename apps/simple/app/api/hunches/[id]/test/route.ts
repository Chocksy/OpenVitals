/**
 * `POST /api/hunches/[id]/test`: "Write it down". Stores what each
 * explanation predicts, moves the hunch to testing and plans the test on the
 * next draw. Returns the case. Phase 39 S7.
 */
import { hunchBody } from "@/lib/api-contract";
import { currentUserId } from "@/lib/auth";
import { acceptTest } from "@/lib/hunches";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const got = await acceptTest(userId, id);
  if ("error" in got)
    return Response.json(got, { status: got.error === "not found" ? 404 : 409 });
  return Response.json(await hunchBody(userId, id));
}
