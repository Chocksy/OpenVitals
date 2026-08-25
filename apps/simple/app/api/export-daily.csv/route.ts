import { asc, eq } from "drizzle-orm";
import { getDb, dailyLogs } from "@/db";
import { currentUserId } from "@/lib/auth";
import { toCsv } from "@/lib/daily";

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rows = await getDb()
    .select()
    .from(dailyLogs)
    .where(eq(dailyLogs.userId, userId))
    .orderBy(asc(dailyLogs.day));

  return new Response(
    toCsv(
      ["day", "sleep_hours", "weight_kg", "steps", "exercise_min", "alcohol_units", "fasting_hours", "energy", "mood", "notes"],
      rows.map((r) => [
        r.day,
        r.sleepHours,
        r.weightKg,
        r.steps,
        r.exerciseMin,
        r.alcoholUnits,
        r.fastingHours,
        r.energy,
        r.mood,
        r.notes,
      ]),
    ),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="openvitals-daily.csv"',
      },
    },
  );
}
