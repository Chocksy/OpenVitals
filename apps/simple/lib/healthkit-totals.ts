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
import { HK_TYPES, WORKOUT } from "@/lib/healthkit";

/** The sentinel `metric_code` the daily-log branch of the union carries. */
export const WEARABLE_ROW = "__wearable__";

/** What a per-field daily row of the union carries in front of its field. */
export const DAILY_PREFIX = "daily:";

/**
 * Where a daily field actually lands, as the SQL that says "this row holds
 * one". `d` is the `daily_logs` alias the totals query uses.
 *
 * Two of them are columns of their own and four are summed into the nutrition
 * blob; everything else is a key in the `wearable` jsonb, which is the default
 * below.
 */
const DAILY_PRESENCE: Record<string, string> = {
  steps: "d.steps is not null",
  exerciseMin: "d.exercise_min is not null",
  kcal: "d.nutrition->>'kcal' is not null",
  proteinG: "d.nutrition->>'proteinG' is not null",
  carbsG: "d.nutrition->>'carbsG' is not null",
  fatG: "d.nutrition->>'fatG' is not null",
};

const inWearable = (field: string) => `jsonb_exists(d.wearable, '${field}')`;

/**
 * Phase 34a: every daily field the sync writes, with the HealthKit type the
 * phone lists it under.
 *
 * The Sync tab asks the server what it holds *per type*, and the daily half of
 * the union only ever answered with one `__wearable__` day count. So Steps,
 * Active energy, Exercise minutes, Stand hours, Distance, Flights climbed and
 * Workouts all read as "nothing on the server" however many days had been
 * synced. One row each fixes it, and the type on the row is the key the phone
 * looks the row up by.
 */
export const DAILY_FIELDS: {
  field: string;
  /** The HealthKit type, without the identifier prefix. */
  type: string;
  /** A SQL boolean over the `daily_logs` alias `d`. */
  present: string;
}[] = [
  ...HK_TYPES.filter((m) => m.lands === "daily").map((m) => ({
    field: m.key,
    type: m.type,
    present: DAILY_PRESENCE[m.key] ?? inWearable(m.key),
  })),
  // A workout is a list, not one number a day, so it is not in `HK_TYPES` at
  // all — it has its own little pipeline. The phone still lists it, under the
  // wire type it sends, and expects to be told what the server holds.
  {
    field: "workouts",
    type: WORKOUT,
    // a day with an empty list is not a day with a workout
    present: "jsonb_array_length(coalesce(d.wearable->'workouts', '[]'::jsonb)) > 0",
  },
];

/** daily field → the HealthKit type the phone looks it up by. */
const TYPE_OF_FIELD = new Map(DAILY_FIELDS.map((f) => [f.field, f.type]));

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
 * count from `daily_logs`, and a `daily:` code is one field of it. Everything
 * else is one metric.
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
    } else if (row.code.startsWith(DAILY_PREFIX)) {
      // Keyed by the HealthKit type rather than by the field, because the
      // field name is a private detail of `daily_logs` and the type is what
      // the phone asked about. A readings row carries the same type beside it.
      const type = TYPE_OF_FIELD.get(row.code.slice(DAILY_PREFIX.length));
      if (!type) continue;
      out.perType[type] = {
        count: row.n,
        first: row.lo,
        last: row.hi,
        type,
      };
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
