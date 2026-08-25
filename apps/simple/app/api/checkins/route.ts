import { and, eq } from "drizzle-orm";
import { getDb, checkins, insights } from "@/db";
import { currentUserId } from "@/lib/auth";

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { insightId, itemIndex, answer, note } = await req.json();
  if (!["did", "didnt", "skip"].includes(answer))
    return Response.json({ error: "bad answer" }, { status: 400 });

  const db = getDb();
  const [owned] = await db
    .select({ id: insights.id })
    .from(insights)
    .where(and(eq(insights.id, insightId), eq(insights.userId, userId)));
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  const [row] = await db
    .insert(checkins)
    .values({ userId, insightId, itemIndex, answer, note: note ?? null })
    .returning();
  return Response.json(row);
}
