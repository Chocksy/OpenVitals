import { and, eq } from "drizzle-orm";
import { getDb, optimalOverrides } from "@/db";
import { currentUserId } from "@/lib/auth";
import { saveOptimalOverride } from "@/lib/curator";

const num = (v: unknown) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The user's own optimal band for one metric. One row per (user, metric). */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const b = (await req.json()) as Record<string, unknown>;
  const metricCode = String(b.metricCode ?? "");
  const low = num(b.low);
  const high = num(b.high);
  if (!metricCode || (low == null && high == null))
    return Response.json({ error: "need a band" }, { status: 400 });

  const row = await saveOptimalOverride(userId, metricCode, {
    low,
    high,
    unit: b.unit ? String(b.unit) : null,
    source: "user",
    basis: "opinion",
    rationale: b.rationale ? String(b.rationale).slice(0, 300) : null,
  });
  return Response.json(row);
}

/** Drop the override; the sex default or the catalog band takes over again. */
export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const code = new URL(req.url).searchParams.get("code");
  if (!code) return Response.json({ error: "no code" }, { status: 400 });

  const deleted = await getDb()
    .delete(optimalOverrides)
    .where(
      and(
        eq(optimalOverrides.userId, userId),
        eq(optimalOverrides.metricCode, code),
      ),
    )
    .returning({ id: optimalOverrides.id });
  if (!deleted.length)
    return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
