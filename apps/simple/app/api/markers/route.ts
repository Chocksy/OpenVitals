import { markersBody } from "@/lib/api-contract";
import { currentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Every marker, with the history behind it. Phase 34 section 2.
 *
 * `?days=` trims each series from the newest end and defaults to a year, the
 * window the Markers tab's own charts draw.
 */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 3650) : 365;
  return Response.json(await markersBody(userId, days));
}
