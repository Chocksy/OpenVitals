/** `GET /api/today` — Home as one JSON body. Phase 32a section 6. */
import { todayBody } from "@/lib/api-contract";
import { currentUserId } from "@/lib/auth";
import { withRequestMemo } from "@/lib/request-memo";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  // One read of the metric rows and goals for every helper `todayBody` calls.
  return Response.json(await withRequestMemo(() => todayBody(userId)));
}
