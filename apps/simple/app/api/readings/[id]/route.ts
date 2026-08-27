import { and, eq, sql } from "drizzle-orm";
import { getDb, metrics, readings, type ReadingFlag } from "@/db";
import { currentUserId } from "@/lib/auth";

/** `""` from an emptied input means "no value", not zero. */
const num = (v: unknown) =>
  v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;

async function mine(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(readings)
    .where(and(eq(readings.id, id), eq(readings.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Hand-correct one reading. Every edit leaves an `edited` breadcrumb. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await mine(userId, id);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as Record<string, unknown>;
  const db = getDb();

  let metricCode = row.metricCode;
  if (typeof body.metricCode === "string" && body.metricCode !== metricCode) {
    const [target] = await db
      .select({ code: metrics.code })
      .from(metrics)
      .where(eq(metrics.code, body.metricCode))
      .limit(1);
    if (!target)
      return Response.json(
        { error: `no metric called ${body.metricCode}` },
        { status: 400 },
      );
    metricCode = target.code;
  }

  const flags: ReadingFlag[] = [...(row.flags ?? [])];
  if (!flags.includes("edited")) flags.push("edited");

  const [updated] = await db
    .update(readings)
    .set({
      metricCode,
      value: "value" in body ? num(body.value) : row.value,
      unit: "unit" in body ? (body.unit as string) || null : row.unit,
      refLow: "refLow" in body ? num(body.refLow) : row.refLow,
      refHigh: "refHigh" in body ? num(body.refHigh) : row.refHigh,
      observedAt:
        typeof body.observedAt === "string" && body.observedAt
          ? body.observedAt
          : row.observedAt,
      flags,
    })
    .where(eq(readings.id, id))
    .returning();

  return Response.json(updated);
}

/** Discard: the reading goes, and so do the questions asked about it. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await mine(userId, id);
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  const db = getDb();
  await db.execute(
    sql`delete from review_items
         where user_id = ${userId} and subject->>'readingId' = ${id}`,
  );
  await db.delete(readings).where(eq(readings.id, id));
  return Response.json({ ok: true });
}
