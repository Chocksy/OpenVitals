/**
 * `GET /api/sync/healthkit/totals` — what the server holds from this phone.
 *
 * Phase 24f. The Sync tab used to show its own tally of what it believed it
 * had sent, which a reinstall resets and an interrupted resync undercounts:
 * 12,119 readings read as "7 things". This is the same number the database
 * would give you, so the tab can stop guessing.
 *
 * One statement, one round trip: a `grouping sets` roll-up over `readings`
 * gives both the per-metric rows and the overall totals, and the wearable day
 * count from `daily_logs` rides along on a `union all`. Cached a minute per
 * user, because the phone asks after every sync and the answer barely moves.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { currentUserId } from "@/lib/auth";
import {
  DAILY_FIELDS,
  DAILY_PREFIX,
  shapeTotals,
  WEARABLE_ROW,
  type Totals,
  type TotalsRow,
} from "@/lib/healthkit-totals";

const TTL = 60_000;
const cache = new Map<string, { at: number; totals: Totals }>();

/**
 * The daily fields as rows a `lateral` can walk: one `(field, present)` pair
 * per field, so one pass over `daily_logs` answers for all of them. Built from
 * a constant table, which is why `sql.raw` is safe here.
 */
const DAILY_VALUES = sql.raw(
  DAILY_FIELDS.map((f) => `('${f.field}', ${f.present})`).join(", "),
);

async function totalsFor(userId: string): Promise<Totals> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL) return hit.totals;

  const result = await getDb().execute(sql`
    select metric_code as code,
           count(*)::int as n,
           min(observed_at)::text as lo,
           max(observed_at)::text as hi,
           count(distinct observed_at)::int as days
      from readings
     where user_id = ${userId} and source = 'healthkit'
     group by grouping sets ((metric_code), ())
    union all
    select ${WEARABLE_ROW}, count(*)::int, min(day)::text, max(day)::text,
           count(*)::int
      from daily_logs
     where user_id = ${userId} and wearable is not null
    union all
    select ${DAILY_PREFIX}::text || f.field, count(*)::int, min(d.day)::text,
           max(d.day)::text, count(*)::int
      from daily_logs d
      cross join lateral (values ${DAILY_VALUES}) as f(field, present)
     where d.user_id = ${userId} and d.wearable is not null and f.present
     group by f.field
  `);

  const totals = shapeTotals(result.rows as unknown as TotalsRow[]);
  cache.set(userId, { at: Date.now(), totals });
  return totals;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await totalsFor(userId));
}
