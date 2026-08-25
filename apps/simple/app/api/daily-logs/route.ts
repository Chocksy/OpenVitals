import { sql } from "drizzle-orm";
import { getDb, dailyLogs } from "@/db";
import { currentUserId } from "@/lib/auth";

const NUMBERS = [
  "sleepHours",
  "weightKg",
  "steps",
  "exerciseMin",
  "alcoholUnits",
  "fastingHours",
  "energy",
  "mood",
] as const;

const num = (v: unknown) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Upsert the whole row for one day. The form autosaves, so this runs often. */
export async function PUT(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const day = String(body.day ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    return Response.json({ error: "bad day" }, { status: 400 });

  const values = Object.fromEntries(NUMBERS.map((k) => [k, num(body[k])]));
  const notes = body.notes == null ? null : String(body.notes).slice(0, 2000);

  const [row] = await getDb()
    .insert(dailyLogs)
    .values({ userId, day, ...values, notes })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.day],
      set: { ...values, notes, updatedAt: sql`now()` },
    })
    .returning();
  return Response.json(row);
}
