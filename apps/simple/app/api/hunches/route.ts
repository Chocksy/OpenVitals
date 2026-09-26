/**
 * `GET /api/hunches`: open, good news and closed. Phase 39 S7. The first call
 * for a person with no rows runs `refreshHunches`.
 */
import { hunchesBody } from "@/lib/api-contract";
import { currentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await hunchesBody(userId));
}
