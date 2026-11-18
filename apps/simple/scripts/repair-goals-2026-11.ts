/**
 * Batch 5A: repair what the old adopt left in `goals` and `protocol_items`.
 *
 *   tsx --env-file=.env scripts/repair-goals-2026-11.ts [--user <id>] [--apply]
 *
 * Dry run by default. Every step for every user runs inside one transaction
 * and prints each change as it makes it; without `--apply` the transaction is
 * rolled back, so the dry run prints exactly what `--apply` would do, later
 * steps seeing the earlier ones.
 *
 * The steps, in order:
 *  a. a goal closed with no reading stored between its `created_at` and its
 *     `achieved_at` closed on old news (the 2026-10-06 psyllium goal): it is
 *     reopened, and the nightly `goal_check` closes it again on real news;
 *  b. a goal whose note says "<a> to about <b>" aims at <b> (`goalTarget`),
 *     not at <a>; its `due` comes from the note's "by YYYY-MM-DD" if any;
 *  c. `protocol_items.started_at` is the day the row was written, where NULL;
 *  d. an item with no `metric_codes` gets its intervention's markers
 *     (`markersOf`), when it matches one;
 *  e. projections for active matched items (`makeProjections`), then any a
 *     draw already answers are resolved (`resolveProjections`).
 *
 * Step e reads accepted `hkb_interventions`, so the berberine rows need
 * `pnpm hkb:seed` first.
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  getDb,
  goals,
  hkbInterventions,
  pool,
  protocolItems,
  readings,
} from "@/db";
import { goalTarget } from "@/lib/adopt";
import {
  makeProjections,
  markersOf,
  resolveProjections,
} from "@/lib/projections";

/** "Psyllium husk ...: 131 to about 118 mg/dL by 2026-12-01" */
const TO_ABOUT =
  /(\d+(?:\.\d+)?)\s*(?:[a-zµ%/]+\s*)?to about\s*(\d+(?:\.\d+)?)/i;
const BY_DAY = /\bby (\d{4}-\d{2}-\d{2})\b/;

/**
 * Pure: the band and date a "<a> to about <b>" note says, or null for any
 * other note. Down when <b> is below <a>.
 */
export function noteRepair(note: string | null): {
  targetLow: number | null;
  targetHigh: number | null;
  due: string | null;
} | null {
  const hit = note ? TO_ABOUT.exec(note) : null;
  if (!hit) return null;
  const direction = Number(hit[2]) < Number(hit[1]) ? "down" : "up";
  const target = goalTarget(hit[0], direction, null);
  if (target == null) return null;
  return {
    targetLow: direction === "up" ? target : null,
    targetHigh: direction === "down" ? target : null,
    due: BY_DAY.exec(note!)?.[1] ?? null,
  };
}

/** Pure: a closed goal that no reading stored in its lifetime could close. */
export function closedOnOldNews(
  goal: { createdAt: Date | null; achievedAt: Date | null },
  stored: (Date | null)[],
): boolean {
  if (!goal.achievedAt) return false;
  const made = goal.createdAt ?? new Date(0);
  return !stored.some((t) => t != null && t > made && t <= goal.achievedAt!);
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

class DryRun extends Error {}

async function repairUser(
  tx: Tx,
  userId: string,
  catalog: { name: string; outcomeFeatureId: string | null }[],
): Promise<number> {
  let changes = 0;
  const say = (line: string) => {
    changes++;
    console.log(`  ${line}`);
  };

  // a + b
  const mine = await tx.select().from(goals).where(eq(goals.userId, userId));
  for (const g of mine) {
    if (g.achievedAt) {
      const stored = await tx
        .select({ createdAt: readings.createdAt })
        .from(readings)
        .where(
          and(
            eq(readings.userId, userId),
            eq(readings.metricCode, g.metricCode),
          ),
        );
      if (
        closedOnOldNews(
          g,
          stored.map((r) => r.createdAt),
        )
      ) {
        await tx
          .update(goals)
          .set({ achievedAt: null })
          .where(eq(goals.id, g.id));
        say(
          `a ${g.metricCode}: reopened (closed ${g.achievedAt.toISOString().slice(0, 10)} with no new reading)`,
        );
      }
    }
    const fix = noteRepair(g.note);
    if (!fix) continue;
    const next = {
      targetLow: fix.targetLow,
      targetHigh: fix.targetHigh,
      due: fix.due ?? g.due,
    };
    if (
      next.targetLow === g.targetLow &&
      next.targetHigh === g.targetHigh &&
      next.due === g.due
    )
      continue;
    await tx.update(goals).set(next).where(eq(goals.id, g.id));
    say(
      `b ${g.metricCode}: target ${g.targetLow ?? "-"}..${g.targetHigh ?? "-"} -> ${next.targetLow ?? "-"}..${next.targetHigh ?? "-"}, due ${g.due ?? "none"} -> ${next.due ?? "none"}`,
    );
  }

  // c
  const undated = await tx
    .update(protocolItems)
    .set({ startedAt: sql`(${protocolItems.createdAt})::date` })
    .where(
      and(
        eq(protocolItems.userId, userId),
        isNull(protocolItems.startedAt),
        isNotNull(protocolItems.createdAt),
      ),
    )
    .returning({
      text: protocolItems.text,
      startedAt: protocolItems.startedAt,
    });
  for (const r of undated)
    say(`c "${r.text.slice(0, 50)}": started ${r.startedAt}`);

  // d
  const items = await tx
    .select({
      id: protocolItems.id,
      text: protocolItems.text,
      metricCodes: protocolItems.metricCodes,
    })
    .from(protocolItems)
    .where(eq(protocolItems.userId, userId));
  for (const it of items) {
    if (it.metricCodes?.length) continue;
    const codes = markersOf(it.text, catalog);
    if (!codes.length) continue;
    await tx
      .update(protocolItems)
      .set({ metricCodes: codes })
      .where(eq(protocolItems.id, it.id));
    say(`d "${it.text.slice(0, 50)}": markers ${codes.join(", ")}`);
  }

  // e
  for (const p of await makeProjections(userId, tx))
    say(
      `e ${p.code}: projected ${p.from} -> ${p.expected} (${p.low}-${p.high}) from ${p.fromDate}, retest ${p.retestAt}`,
    );
  const closed = await resolveProjections(userId, tx);
  if (closed) say(`e ${closed} projection(s) resolved by a draw on file`);

  return changes;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const only = args.includes("--user")
    ? args[args.indexOf("--user") + 1]
    : null;
  const db = getDb();

  const users = only
    ? [only]
    : [
        ...new Set(
          [
            ...(await db.select({ u: goals.userId }).from(goals)),
            ...(await db
              .select({ u: protocolItems.userId })
              .from(protocolItems)),
          ].map((r) => r.u),
        ),
      ].sort();
  const catalog = await db
    .select({
      name: hkbInterventions.name,
      outcomeFeatureId: hkbInterventions.outcomeFeatureId,
    })
    .from(hkbInterventions)
    .where(eq(hkbInterventions.status, "accepted"));

  let total = 0;
  try {
    await db.transaction(async (tx) => {
      for (const userId of users) {
        console.log(`user ${userId}`);
        const n = await repairUser(tx, userId, catalog);
        console.log(`  ${n} changes`);
        total += n;
      }
      if (!apply) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }
  console.log(
    `[repair-goals-2026-11] ${total} changes ${apply ? "applied" : "pending (dry run; --apply writes them)"}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  main()
    .then(() => pool().end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
