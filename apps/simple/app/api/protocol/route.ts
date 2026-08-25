import { and, eq } from "drizzle-orm";
import { getDb, protocolItems } from "@/db";
import { currentUserId } from "@/lib/auth";

/** Add an item, by hand or adopted from a lifestyle plan. */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const b = (await req.json()) as {
    text?: string;
    why?: string;
    cadence?: string;
    metricCodes?: string[];
    sourceInsightId?: string;
  };
  const text = (b.text ?? "").trim();
  if (!text) return Response.json({ error: "no text" }, { status: 400 });

  const [row] = await getDb()
    .insert(protocolItems)
    .values({
      userId,
      text: text.slice(0, 300),
      why: b.why?.slice(0, 500) ?? null,
      cadence: b.cadence === "weekly" ? "weekly" : "daily",
      metricCodes: Array.isArray(b.metricCodes) ? b.metricCodes : [],
      sourceInsightId: b.sourceInsightId ?? null,
    })
    .returning();
  return Response.json(row);
}

/** Archive or restore. Nothing is ever deleted, so the history stays readable. */
export async function PATCH(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id, active } = (await req.json()) as { id?: string; active?: boolean };
  if (!id) return Response.json({ error: "no id" }, { status: 400 });

  const [row] = await getDb()
    .update(protocolItems)
    .set({ active: active === true })
    .where(and(eq(protocolItems.id, id), eq(protocolItems.userId, userId)))
    .returning();
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(row);
}
