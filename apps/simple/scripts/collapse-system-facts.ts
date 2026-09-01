/**
 * Collapse the fact-history rows the phone sync wrote every day.
 *
 *   pnpm --filter simple tsx --env-file=.env scripts/collapse-system-facts.ts
 *   ... --apply     # actually delete; without it the script only reports
 *
 * Until phase 24b the HealthKit sync wrote `resting_hr`, `vo2max_est` and
 * `waist_cm` as dated facts on every sync where the value differed, which for
 * a heart rate is every day, so `/history` became a wall of struck-through
 * numbers. The sync no longer does that (`lib/coverage.ts` derives them at
 * read time), and this clears the noise it already left.
 *
 * Rules, deliberately narrow:
 *  - only rows with `source = 'system'`, only these four keys;
 *  - the first and the latest row per (user, key) always stay, so the timeline
 *    still says when the phone started and what it says now;
 *  - the surviving first row is closed the day before the last one, so the
 *    timeline has no hole where the deleted rows used to be;
 *  - anything else that would be touched aborts the run.
 *
 * Idempotent: a second run finds nothing to delete.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, profileFactHistory } from "@/db";
import { dayBefore } from "@/lib/facts";

/** The continuous signals. `exercise_days_week` is a bucket and churned too. */
const KEYS = ["resting_hr", "vo2max_est", "waist_cm", "exercise_days_week"];

const SOURCE = "system";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  const rows = await db
    .select()
    .from(profileFactHistory)
    .where(inArray(profileFactHistory.key, KEYS))
    .orderBy(asc(profileFactHistory.validFrom), asc(profileFactHistory.id));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.source !== SOURCE) continue;
    const id = `${r.userId}|${r.key}`;
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }

  const doomed: typeof rows = [];
  const closes: { id: string; validTo: string }[] = [];
  console.log(`before: ${rows.length} rows on ${KEYS.join(", ")}`);
  for (const [id, list] of [...groups].sort()) {
    const first = list[0]!;
    const last = list[list.length - 1]!;
    const middle = list.slice(1, -1);
    console.log(
      `  ${id}: ${list.length} system rows, ${first.validFrom} … ${last.validFrom}, dropping ${middle.length}`,
    );
    doomed.push(...middle);
    if (middle.length && first.id !== last.id && first.validTo !== null)
      closes.push({ id: first.id, validTo: dayBefore(last.validFrom) });
  }

  // The abort: nothing outside the four keys and `source = 'system'` may go.
  const wrong = doomed.filter(
    (r) => r.source !== SOURCE || !KEYS.includes(r.key),
  );
  if (wrong.length) {
    console.error(`refusing: ${wrong.length} rows are not system rows`);
    process.exit(1);
  }

  console.log(
    `${doomed.length} row${doomed.length === 1 ? "" : "s"} to delete, ${closes.length} to re-close`,
  );
  if (!apply) {
    console.log("dry run; pass --apply to delete");
    return;
  }

  if (doomed.length)
    await db.delete(profileFactHistory).where(
      and(
        inArray(
          profileFactHistory.id,
          doomed.map((r) => r.id),
        ),
        eq(profileFactHistory.source, SOURCE),
        inArray(profileFactHistory.key, KEYS),
      ),
    );
  for (const c of closes)
    await db
      .update(profileFactHistory)
      .set({ validTo: c.validTo })
      .where(eq(profileFactHistory.id, c.id));

  const after = await db
    .select({ id: profileFactHistory.id })
    .from(profileFactHistory)
    .where(inArray(profileFactHistory.key, KEYS));
  console.log(`after: ${after.length} rows on ${KEYS.join(", ")}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
