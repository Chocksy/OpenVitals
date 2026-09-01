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
  shapeTotals,
  WEARABLE_ROW,
  type Totals,
  type TotalsRow,
} from "@/lib/healthkit-totals";

const TTL = 60_000;
const cache = new Map<string, { at: number; totals: Totals }>();

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
