import { asc, eq } from "drizzle-orm";
import { getDb, metrics, readings } from "@/db";
import { currentUserId } from "@/lib/auth";
import { toCsv } from "@/lib/daily";

/** Every reading, flags included, so the data can leave this app at any time. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const rows = await getDb()
    .select({
      observedAt: readings.observedAt,
      code: readings.metricCode,
      name: metrics.name,
      value: readings.value,
      valueText: readings.valueText,
      unit: readings.unit,
      refLow: readings.refLow,
      refHigh: readings.refHigh,
      flags: readings.flags,
    })
    .from(readings)
    .innerJoin(metrics, eq(metrics.code, readings.metricCode))
    .where(eq(readings.userId, userId))
    .orderBy(asc(readings.observedAt), asc(metrics.name));

  const body = toCsv(
      ["date", "code", "metric", "value", "value_text", "unit", "ref_low", "ref_high", "flags"],
      rows.map((r) => [
        r.observedAt,
        r.code,
        r.name,
        r.value,
        r.valueText,
        r.unit,
        r.refLow,
        r.refHigh,
        (r.flags ?? []).filter((f) => typeof f === "string").join(" "),
      ]),
  );

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="openvitals-readings.csv"',
    },
  });
}
