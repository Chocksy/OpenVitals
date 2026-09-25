/**
 * `GET /api/score/days?to=YYYY-MM-DD&n=91`: the score per day, oldest first.
 * Phase 37 task A3. `n` is clamped to 1–91 and `to` defaults to today.
 */
import { currentUserId } from "@/lib/auth";
import { localDay } from "@/lib/daily";
import { scoreDays } from "@/lib/score-days";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams;
  const to = q.get("to") ?? localDay();
  if (!DAY.test(to))
    return Response.json({ error: "bad day" }, { status: 400 });
  const asked = Math.round(Number(q.get("n") ?? 91));
  const n = Math.min(91, Math.max(1, Number.isFinite(asked) ? asked : 91));

  return Response.json(await scoreDays(userId, to, n));
}
