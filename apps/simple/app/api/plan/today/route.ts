/** `GET /api/plan/today?d=YYYY-MM-DD` — the day in the order it runs. */
import { planTodayBody } from "@/lib/api-contract";
import { currentUserId } from "@/lib/auth";
import { localDay } from "@/lib/daily";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  const asked = new URL(req.url).searchParams.get("d");
  if (asked && !DAY.test(asked))
    return Response.json({ error: "bad day" }, { status: 400 });
  return Response.json(await planTodayBody(userId, asked ?? localDay()));
}
