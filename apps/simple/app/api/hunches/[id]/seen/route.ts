/** `POST /api/hunches/[id]/seen`: good news, "Got it". Phase 39 S7. */
import { currentUserId } from "@/lib/auth";
import { seeHunch } from "@/lib/hunches";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const got = await seeHunch(userId, (await params).id);
  if ("error" in got) return Response.json(got, { status: 404 });
  return Response.json(got);
}
