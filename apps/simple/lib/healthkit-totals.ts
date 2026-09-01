/**
 * What the server actually holds from a phone, shaped for the Sync tab.
 *
 * Phase 24f: the tab used to count what the phone remembered sending, which is
 * a per-run tally that a fresh install or a crashed resync resets to nothing.
 * The honest number is on the server, so the tab asks for it.
 *
 * The SQL is one statement (see the route): a `grouping sets` roll-up over
 * `readings` plus the wearable day count, unioned on. Everything below is the
 * pure half — the row shape in, the JSON out — so it can be tested without a
 * database.
 */
import { HK_TYPES } from "@/lib/healthkit";

/** The sentinel `metric_code` the daily-log branch of the union carries. */
export const WEARABLE_ROW = "__wearable__";

/** One row of the aggregate. `code` is null on the roll-up row. */
export interface TotalsRow {
  code: string | null;
  n: number;
  lo: string | null;
  hi: string | null;
  days: number;
}

export interface TypeTotal {
  count: number;
  first: string | null;
  last: string | null;
  /**
   * The HealthKit type this metric came from, without the identifier prefix.
   * The phone reads it so it does not need a copy of the mapping table.
   */
  type: string | null;
}

export interface Totals {
  readings: number;
  days: number;
  firstDay: string | null;
  lastDay: string | null;
  /** Days with a `daily_logs.wearable` blob: steps, energy, stand hours. */
  wearableDays: number;
  perType: Record<string, TypeTotal>;
}

/** metric code → the HealthKit type that writes it. Readings only. */
const TYPE_OF_CODE = new Map(
  HK_TYPES.filter((m) => m.lands === "reading").map((m) => [m.key, m.type]),
);

export const EMPTY: Totals = {
  readings: 0,
  days: 0,
  firstDay: null,
  lastDay: null,
  wearableDays: 0,
  perType: {},
};

/**
 * The aggregate rows as the phone reads them.
 *
 * A null `code` is the roll-up: every healthkit reading, however many distinct
 * days they cover, and the first and last of them. `__wearable__` is the day
 * count from `daily_logs`. Everything else is one metric.
 */
export function shapeTotals(rows: TotalsRow[]): Totals {
  const out: Totals = { ...EMPTY, perType: {} };
  for (const row of rows) {
    if (row.code === null) {
      out.readings = row.n;
      out.days = row.days;
      out.firstDay = row.lo;
      out.lastDay = row.hi;
    } else if (row.code === WEARABLE_ROW) {
      out.wearableDays = row.n;
      // A phone that only ever sent steps has no readings at all, so the span
      // comes from whichever half of the union knows about the older day.
      if (!out.firstDay || (row.lo && row.lo < out.firstDay))
        out.firstDay = row.lo;
      if (!out.lastDay || (row.hi && row.hi > out.lastDay))
        out.lastDay = row.hi;
    } else {
      out.perType[row.code] = {
        count: row.n,
        first: row.lo,
        last: row.hi,
        type: TYPE_OF_CODE.get(row.code) ?? null,
      };
    }
  }
  return out;
}
