/**
 * The queries behind `/body`, phase 30b.
 *
 * Two things live here and nothing else:
 *
 *  - **the day**, one row per HealthKit type the app can take, each carrying
 *    the name, the full HealthKit identifier, the device that wrote it, the
 *    day the value is actually for, a note that compares it with its own
 *    ninety days, the value with its unit, and one word. A type the phone
 *    never sent still gets a row, because a blank waist has to read as a
 *    permission that is off and not as a zero;
 *  - **the daily series**, one entry per signal with real values and real
 *    dates, so the trend line can be drawn by hand on real scales.
 *
 * Nothing here formats colours or classes; the components do that.
 */
import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  dailyLogs,
  getDb,
  readings,
  type DailyNutrition,
  type DailyWearable,
} from "@/db";
import { lastDays, localDay } from "./daily";
import { getMetricRows, type MetricRow, type Point } from "./data";
import { HK_TYPES, type HkMapping } from "./healthkit";
import { statusOf, type Status } from "./status";

/** How far back a note looks when it compares today with the usual. */
export const NOTE_DAYS = 90;

/** Below this many readings a mean is not a mean, so the note says so. */
const ENOUGH = 5;

/**
 * The three HealthKit types that are categories rather than quantities. The
 * short name is all we store, so the prefix is reconstructed here to print
 * the identifier the phone actually asked permission for.
 */
const CATEGORY_TYPES = new Set([
  "AppleStandHour",
  "SleepAnalysis",
  "MindfulSession",
]);

/** `StepCount` → `HKQuantityTypeIdentifierStepCount`. */
export const identifierOf = (shortName: string): string =>
  `${CATEGORY_TYPES.has(shortName) ? "HKCategoryTypeIdentifier" : "HKQuantityTypeIdentifier"}${shortName}`;

/** One line of "The day". */
export interface DayRow {
  /** the metric code or the `daily_logs` field: unique on the page */
  key: string;
  name: string;
  /** the full HealthKit identifier this row comes from */
  identifier: string;
  /**
   * Who wrote it: the sample's own bundle identifier (`com.apple.health`,
   * `com.dexcom.g7`), or null when nothing said. Phase 32a — this used to be
   * `source`, which is the pipeline and reads "healthkit" on every phone row.
   */
  device: string | null;
  /** the day the value is for, or null when there has never been one */
  date: string | null;
  /** the comparison with this signal's own ninety days */
  note: string;
  /** the digits, already formatted; "—" when there is no value */
  value: string;
  /** the unit slot, which is fixed-width in the row */
  unit: string;
  /** the last column: one word, or "" when there is nothing to say */
  word: string;
  status: Status;
}

export interface BodyDay {
  day: string;
  rows: DayRow[];
  /** the sync's own name for itself, e.g. `healthkit` */
  source: string | null;
  /** ISO instant of the last sync that touched this day */
  syncedAt: string | null;
  /**
   * ISO instant of the newest HealthKit row on the account, whatever day it
   * is for. Phase 32a: a day the phone has not written today still has a last
   * sync, and `synced.lastAt` on `/api/body` is that one.
   */
  lastSyncAt: string | null;
  /** how many of the types the app can take have ever sent a value */
  typesSeen: number;
  typesKnown: number;
}

/* ── formatting ───────────────────────────────────────────────────────── */

/** 7.2 stays 7.2; 8412 becomes "8\u2009412" on a thin space; no trailing zeros. */
export function digits(v: number): string {
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  const [whole, fraction] = String(rounded).split(".");
  const spaced = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return fraction ? `${spaced}.${fraction}` : spaced;
}

/** 432 minutes of sleep reads as 7:12, because nobody thinks in minutes. */
const clock = (minutes: number) =>
  `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;

const mean = (values: number[]) =>
  values.reduce((s, v) => s + v, 0) / values.length;

/**
 * The note: this value against its own ninety days, written the way the
 * headline value is written.
 *
 * The comparison uses the same formatter and the same unit as the number at
 * the end of the row, so a night of sleep never reads "7:00 h" beside "the
 * mean of 420". A value sitting on its own mean says so and does not repeat
 * the number.
 *
 * It never guesses a direction. "3 bpm below the mean" is arithmetic;
 * "better" would be an opinion about resting heart rate that this file has no
 * business holding.
 */
export function noteFor(
  value: number,
  history: number[],
  unit: string,
  noun = "days",
  /** how a value of this signal is written; sleep is a clock, not minutes */
  show: (v: number) => string = digits,
): string {
  const past = history.filter((v) => Number.isFinite(v));
  if (past.length < ENOUGH)
    return past.length
      ? `${past.length} ${past.length === 1 ? "reading" : "readings"} in ${NOTE_DAYS} ${noun}`
      : "the first one";
  const m = mean(past);
  const delta = value - m;
  if (Math.abs(delta) < (Math.abs(m) || 1) * 0.02)
    return `at your ${NOTE_DAYS}-day mean`;
  const u = unit ? ` ${unit}` : "";
  const size = `${show(Math.abs(delta))}${u}`;
  const middle = delta > 0 ? "above" : "below";
  return `${size} ${middle} the ${NOTE_DAYS}-day mean of ${show(m)}${u}`;
}

/* ── the day ──────────────────────────────────────────────────────────── */

/** Where a `lands: "daily"` field actually sits in the row. */
type DailyPick = (row: {
  log: typeof dailyLogs.$inferSelect | undefined;
  wearable: DailyWearable | null;
  nutrition: DailyNutrition | null;
}) => number | null;

const DAILY_PICK: Record<string, DailyPick> = {
  steps: (r) => r.log?.steps ?? null,
  exerciseMin: (r) => r.log?.exerciseMin ?? null,
  activeEnergyKcal: (r) => r.wearable?.activeEnergyKcal ?? null,
  standHours: (r) => r.wearable?.standHours ?? null,
  distanceKm: (r) => r.wearable?.distanceKm ?? null,
  flights: (r) => r.wearable?.flights ?? null,
  mindfulMin: (r) => r.wearable?.mindfulMin ?? null,
  kcal: (r) => r.nutrition?.kcal ?? null,
  proteinG: (r) => r.nutrition?.proteinG ?? null,
  carbsG: (r) => r.nutrition?.carbsG ?? null,
  fatG: (r) => r.nutrition?.fatG ?? null,
};

/**
 * The unit slot for the three counts HealthKit stores without a unit. This is
 * a label, not a conversion: `StepCount` is stored as a plain count and the
 * row still has to say what it counted.
 */
const COUNT_NOUN: Record<string, string> = {
  steps: "steps",
  standHours: "hours",
  flights: "flights",
};

const unpack = (log: typeof dailyLogs.$inferSelect | undefined) => ({
  log,
  wearable: (log?.wearable as DailyWearable | null) ?? null,
  nutrition: (log?.nutrition as DailyNutrition | null) ?? null,
});

/** The word the last column carries: only what the engine actually judged. */
const wordFor = (status: Status, measured: boolean): string =>
  !measured
    ? "never measured"
    : status === "red"
      ? "off"
      : status === "amber"
        ? "borderline"
        : "";

function readingRow(
  m: HkMapping,
  metric: MetricRow | undefined,
  day: string,
  from: string,
): DayRow {
  const phone = (metric?.rows ?? []).filter(
    (r) => r.source != null && r.value != null && r.observedAt <= day,
  );
  const last = phone[phone.length - 1];
  const history = phone
    .filter((r) => r.observedAt >= from && r !== last)
    .map((r) => r.value!);
  const unit = last?.unit ?? metric?.unit ?? m.unit ?? "";
  const sleep = m.key === "sleep_duration";
  const status = last
    ? statusOf({
        value: last.value,
        refLow: last.refLow,
        refHigh: last.refHigh,
        optimalLow: metric?.optimalLow ?? null,
        optimalHigh: metric?.optimalHigh ?? null,
      })
    : "gray";

  return {
    key: m.key,
    name: metric?.name ?? m.name,
    identifier: identifierOf(m.type),
    device: last?.device ?? null,
    date: last?.observedAt ?? null,
    note: last
      ? noteFor(
          last.value!,
          history,
          sleep ? "h" : unit,
          sleep ? "nights" : "days",
          sleep ? clock : digits,
        )
      : "",
    value: last ? (sleep ? clock(last.value!) : digits(last.value!)) : "—",
    unit: last ? (sleep ? "h" : unit) : "",
    word: wordFor(status, !!last),
    status,
  };
}

function dailyRow(
  m: HkMapping,
  today: ReturnType<typeof unpack>,
  window: { day: string; value: number | null }[],
  day: string,
): DayRow {
  const pick = DAILY_PICK[m.key];
  const value = pick ? pick(today) : null;
  const history = window
    .filter((r) => r.day !== day && r.value != null)
    .map((r) => r.value!);
  return {
    key: m.key,
    name: m.name,
    identifier: identifierOf(m.type),
    device: today.wearable?.device ?? null,
    date: value == null ? null : day,
    note: value == null ? "" : noteFor(value, history, m.unit ?? ""),
    value: value == null ? "—" : digits(value),
    unit: value == null ? "" : (m.unit ?? COUNT_NOUN[m.key] ?? ""),
    word: wordFor("gray", value != null),
    status: "gray",
  };
}

/**
 * One day of the phone, every type named, sourced and dated.
 *
 * A type with no value at all still gets a row once the phone has ever sent
 * anything, which is the whole point of the source column: the app asked for
 * this type, and it is empty.
 */
export async function getBodyDay(
  userId: string,
  day: string = localDay(),
): Promise<BodyDay> {
  const window = lastDays(NOTE_DAYS, day);
  const from = window[0]!;
  const db = getDb();

  const [metrics, logs, phoneWrite] = await Promise.all([
    getMetricRows(userId),
    db
      .select()
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.userId, userId),
          gte(dailyLogs.day, from),
          lte(dailyLogs.day, day),
        ),
      )
      .orderBy(asc(dailyLogs.day)),
    // The newest HealthKit reading on the account, for `synced.lastAt`. One
    // scalar, so a day the phone did not touch still knows when it last did.
    db
      .select({ at: sql<string | null>`max(${readings.createdAt})` })
      .from(readings)
      .where(and(eq(readings.userId, userId), isNotNull(readings.source))),
  ]);
  const lastPhoneWrite = phoneWrite[0]?.at
    ? new Date(phoneWrite[0].at).toISOString()
    : null;

  const byCode = new Map(metrics.map((m) => [m.code, m]));
  const byDay = new Map(logs.map((l) => [l.day, l]));
  const today = unpack(byDay.get(day));

  const windowRows = (key: string) => {
    const pick = DAILY_PICK[key];
    return logs.map((l) => ({
      day: l.day,
      value: pick ? pick(unpack(l)) : null,
    }));
  };

  const rows = HK_TYPES.map((m) =>
    m.lands === "reading"
      ? readingRow(m, byCode.get(m.key), day, from)
      : m.lands === "daily"
        ? dailyRow(m, today, windowRows(m.key), day)
        : null,
  ).filter((r): r is DayRow => r != null);

  const typesSeen = rows.filter((r) => r.date != null).length;
  // Nothing has ever arrived from a phone: the list would be a wall of
  // dashes, so it is empty and the page says so instead.
  const connected = typesSeen > 0;

  return {
    day,
    rows: connected ? rows : [],
    source: today.wearable?.source ?? null,
    syncedAt: today.wearable?.syncedAt ?? null,
    lastSyncAt: lastSyncOf(logs, lastPhoneWrite),
    typesSeen,
    typesKnown: rows.length,
  };
}

/**
 * The newest moment a phone wrote anything, whatever day it wrote it for.
 *
 * Two clocks say it: the `syncedAt` a wearable blob carries, and the
 * `createdAt` of a HealthKit reading. The later of the two is the answer, and
 * null means no phone has ever written.
 *
 * Pure over what `getBodyDay` already fetched, so it costs no query.
 */
export function lastSyncOf(
  logs: { wearable: DailyWearable | null }[],
  lastPhoneWrite: string | null,
): string | null {
  let best: string | null = lastPhoneWrite;
  for (const l of logs) {
    const at = l.wearable?.syncedAt;
    if (at && (best == null || at > best)) best = at;
  }
  return best;
}

/* ── the series behind the trend line ─────────────────────────────────── */

export interface BodySeries {
  id: string;
  label: string;
  unit: string;
  /** oldest first, one point per day that has a value */
  points: Point[];
  /** where it comes from, printed on the chart's own head */
  source: string;
}

export interface BodyTrends {
  series: BodySeries[];
  /** the days a blood draw landed, inside the window */
  draws: string[];
  days: number;
}

/** The `daily_logs` columns no HealthKit reading covers. */
const TYPED: {
  id: keyof typeof dailyLogs.$inferSelect;
  label: string;
  unit: string;
}[] = [
  { id: "steps", label: "Steps", unit: "" },
  { id: "exerciseMin", label: "Exercise", unit: "min" },
  { id: "alcoholUnits", label: "Alcohol", unit: "units" },
  { id: "energy", label: "Energy", unit: "1–5" },
  { id: "mood", label: "Mood", unit: "1–5" },
];

/** The order the trend tabs read in: heart, sleep, body, then what you typed. */
const SERIES_ORDER = [
  "resting_heart_rate",
  "hrv_sdnn",
  "sleep_duration",
  "spo2",
  "respiratory_rate",
  "walking_hr_avg",
  "vo2max_est",
  "weight",
  "body_fat_pct",
  "waist_cm",
  "wrist_temp",
  "bp_systolic",
  "bp_diastolic",
];

/**
 * Every daily signal with at least two points in the window, plus the days a
 * draw landed so a step in a line can be read against one.
 */
export async function getBodyTrends(
  userId: string,
  days: number,
  end: string = localDay(),
): Promise<BodyTrends> {
  const window = lastDays(days, end);
  const from = window[0]!;
  const db = getDb();

  const [metrics, logs, draws] = await Promise.all([
    getMetricRows(userId),
    db
      .select()
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.userId, userId),
          gte(dailyLogs.day, from),
          lte(dailyLogs.day, end),
        ),
      )
      .orderBy(asc(dailyLogs.day)),
    db
      .selectDistinct({ day: readings.observedAt })
      .from(readings)
      .where(
        and(
          eq(readings.userId, userId),
          isNull(readings.source),
          gte(readings.observedAt, from),
          lte(readings.observedAt, end),
        ),
      ),
  ]);

  const fromPhone: BodySeries[] = metrics
    .map((m) => {
      const points = m.rows
        .filter(
          (r) =>
            r.source != null &&
            r.value != null &&
            r.observedAt >= from &&
            r.observedAt <= end,
        )
        .map((r) => ({ date: r.observedAt, value: r.value! }));
      return {
        id: m.code,
        label: m.name,
        unit: m.unit ?? "",
        points,
        source: "Apple Health",
      };
    })
    .filter((s) => s.points.length >= 2)
    .sort((a, b) => {
      const rank = (id: string) => {
        const i = SERIES_ORDER.indexOf(id);
        return i === -1 ? SERIES_ORDER.length : i;
      };
      return rank(a.id) - rank(b.id) || a.label.localeCompare(b.label);
    });

  const typed: BodySeries[] = TYPED.map((t) => ({
    id: String(t.id),
    label: t.label,
    unit: t.unit,
    points: logs
      .map((l) => ({ date: l.day, value: l[t.id] as number | null }))
      .filter((p): p is Point => p.value != null),
    source: "what you logged",
  })).filter((s) => s.points.length >= 2);

  return {
    series: [...fromPhone, ...typed],
    draws: draws.map((d) => d.day).sort(),
    days,
  };
}

/** The habit strip and the streak already live in `daily-data.ts`. */
export const dayCount = (rows: { value: string }[]) =>
  rows.filter((r) => r.value !== "—").length;

/** Used by the page to keep the SQL out of the component. */
export const wearableDays = async (userId: string): Promise<number> => {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(dailyLogs)
    .where(
      and(eq(dailyLogs.userId, userId), sql`${dailyLogs.wearable} is not null`),
    );
  return row?.n ?? 0;
};
