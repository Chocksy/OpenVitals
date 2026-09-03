/**
 * Read the schedule off the lines already on people's protocols.
 *
 * Phase 32a section 2 added six columns to `protocol_items` and taught
 * `adopt()` to fill them, which covers everything adopted from now on and
 * nothing adopted before. Without this, the month strip, the supplements
 * table and the Today column are empty for every row that already existed —
 * a feature that only works for people who start again.
 *
 * It invents nothing: `scheduleOf` reads the row's own `text`, which is the
 * same string `adopt()` reads. It only ever writes a column that is null, so
 * a schedule somebody edited by hand survives, and running it twice does
 * nothing the second time.
 *
 *   pnpm exec tsx --env-file=.env scripts/backfill-schedules.ts [--write]
 */
import { eq, isNull, and } from "drizzle-orm";
import { getDb, protocolItems } from "@/db";
import { localDay } from "@/lib/daily";
import { addMonths, scheduleOf } from "@/lib/plan-line";

async function main() {
  const write = process.argv.includes("--write");
  const db = getDb();
  const rows = await db
    .select()
    .from(protocolItems)
    .where(
      and(isNull(protocolItems.timeOfDay), isNull(protocolItems.daysOfWeek)),
    );

  let touched = 0;
  for (const row of rows) {
    const s = scheduleOf(row.text);
    const set: Partial<typeof protocolItems.$inferInsert> = {};
    if (row.timeOfDay == null && s.timeOfDay != null)
      set.timeOfDay = s.timeOfDay;
    if (row.daysOfWeek == null && s.daysOfWeek != null)
      set.daysOfWeek = s.daysOfWeek;
    if (row.doseAmount == null && s.doseAmount != null)
      set.doseAmount = String(s.doseAmount);
    if (row.doseUnit == null && s.doseUnit != null) set.doseUnit = s.doseUnit;
    if (row.withWhat == null && s.withWhat != null) set.withWhat = s.withWhat;
    // The stop date counts from the day the person started, and failing that
    // from the day the row was written. Counting it from today would give a
    // six-month course adopted last year another six months.
    const from =
      row.startedAt ?? row.createdAt?.toISOString().slice(0, 10) ?? localDay();
    if (row.endsAt == null && s.months != null)
      set.endsAt = addMonths(from, s.months);
    if (!Object.keys(set).length) continue;
    touched++;
    console.log(
      `${row.id.slice(0, 8)} ${row.text.slice(0, 50)} → ${JSON.stringify(set)}`,
    );
    if (write)
      await db
        .update(protocolItems)
        .set(set)
        .where(eq(protocolItems.id, row.id));
  }
  console.log(
    `${rows.length} rows without a schedule, ${touched} their own line can fill${
      write ? " (written)" : " (dry run; pass --write)"
    }`,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
