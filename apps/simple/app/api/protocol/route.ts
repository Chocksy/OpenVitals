import { and, eq } from "drizzle-orm";
import { getDb, protocolItems } from "@/db";
import { currentUserId } from "@/lib/auth";
import { SLOTS } from "@/lib/plan-line";

/** `time_of_day` is one of the seven slots or a literal `HH:MM`, nothing else. */
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT = new Set<string>(SLOTS);

const bad = (error: string) => Response.json({ error }, { status: 400 });

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
    timeOfDay?: string | null;
    daysOfWeek?: number[] | null;
    doseAmount?: number | null;
    doseUnit?: string | null;
    withWhat?: string | null;
    endsAt?: string | null;
  };
  const text = (b.text ?? "").trim();
  if (!text) return Response.json({ error: "no text" }, { status: 400 });

  /**
   * Phase 32a section 2. The form asks for a slot, the weekdays, the dose and
   * an "until", and a schedule the engine cannot read is worse than none: the
   * month expands these columns straight onto the page. So anything that is
   * not one of the seven slots, a clock time, an ISO day, a weekday 1-7 or a
   * finite amount is a 400 rather than a row.
   */
  const timeOfDay = (b.timeOfDay ?? "").trim() || null;
  if (timeOfDay && !SLOT.has(timeOfDay) && !CLOCK.test(timeOfDay))
    return bad("bad time of day");

  let daysOfWeek: number[] | null = null;
  if (b.daysOfWeek != null) {
    if (!Array.isArray(b.daysOfWeek)) return bad("bad days of week");
    if (b.daysOfWeek.some((d) => !Number.isInteger(d) || d < 1 || d > 7))
      return bad("bad days of week");
    daysOfWeek = b.daysOfWeek.length
      ? [...new Set(b.daysOfWeek)].sort((x, y) => x - y)
      : null;
  }

  if (b.doseAmount != null && !(Number.isFinite(b.doseAmount) && b.doseAmount >= 0))
    return bad("bad dose");

  const endsAt = (b.endsAt ?? "").trim() || null;
  if (endsAt && !DATE.test(endsAt)) return bad("bad end date");

  const [row] = await getDb()
    .insert(protocolItems)
    .values({
      userId,
      text: text.slice(0, 300),
      why: b.why?.slice(0, 500) ?? null,
      cadence: b.cadence === "weekly" ? "weekly" : "daily",
      metricCodes: Array.isArray(b.metricCodes) ? b.metricCodes : [],
      sourceInsightId: b.sourceInsightId ?? null,
      timeOfDay,
      daysOfWeek,
      doseAmount: b.doseAmount == null ? null : String(b.doseAmount),
      doseUnit: b.doseUnit?.trim().slice(0, 20) || null,
      withWhat: b.withWhat?.trim().slice(0, 200) || null,
      endsAt,
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
