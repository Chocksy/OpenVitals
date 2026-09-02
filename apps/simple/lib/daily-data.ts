/**
 * Queries behind the Body check-in, /protocol, /goals and /labs. Pages stay
 * thin: they call one loader here and render. Everything is scoped to one
 * user. The Body page's own day list and trend series live in `body-data.ts`.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  getDb,
  checkinPosts,
  checkins,
  dailyLogs,
  goals,
  habitLogs,
  insights,
  metrics,
  protocolItems,
  readings,
  uploads,
  type DailyLog,
  type DailyNutrition,
  type DailyWearable,
  type LifestyleBody,
} from "@/db";
import {
  adherence,
  goalGap,
  goalProgress,
  heatmapBucket,
  humanLogged,
  inGoal,
  lastDays,
  localDay,
  shiftDay,
  streak,
  type HabitView,
  type LogValues,
} from "./daily";

export type { HabitView, LogValues } from "./daily";
import { getMetricRows, type MetricRow, type Point } from "./data";
import { statusOf, type Status } from "./status";

export interface TodayView {
  day: string;
  values: LogValues;
  /** Phase 23c: what the phone sent for this day, when it sent anything. */
  wearable: DailyWearable | null;
  nutrition: DailyNutrition | null;
  habits: HabitView[];
  streak: number;
  /**
   * Phase 24b: yesterday, when today is not over. A complete day above the
   * partial one, so "49 steps" at 06:18 never reads as a finished day.
   */
  yesterday: {
    day: string;
    values: LogValues;
    wearable: DailyWearable | null;
  } | null;
  /**
   * `bucket` is what the person did (habits, numbers they typed, notes,
   * posts); `phone` is the days a sync landed. The heatmap toggles between
   * them and the streak follows `bucket`.
   */
  heat: { day: string; bucket: number; phone: number }[];
  series: {
    day: string;
    sleep: number | null;
    weight: number | null;
    steps: number | null;
  }[];
}

const HEAT_DAYS = 364;

const toValues = (log: DailyLog | undefined): LogValues =>
  log
    ? {
        sleepHours: log.sleepHours,
        weightKg: log.weightKg,
        steps: log.steps,
        exerciseMin: log.exerciseMin,
        alcoholUnits: log.alcoholUnits,
        fastingHours: log.fastingHours,
        energy: log.energy,
        mood: log.mood,
        notes: log.notes,
      }
    : {};

/** Everything /today renders, plus the 30-day strips /protocol reuses. */
export async function getToday(
  userId: string,
  day = localDay(),
): Promise<TodayView> {
  const db = getDb();
  const from = lastDays(HEAT_DAYS, day)[0]!;

  const [logs, items, habits, posts] = await Promise.all([
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
    db
      .select()
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      )
      .orderBy(asc(protocolItems.createdAt)),
    db
      .select()
      .from(habitLogs)
      .where(
        and(
          eq(habitLogs.userId, userId),
          eq(habitLogs.done, true),
          gte(habitLogs.day, from),
          lte(habitLogs.day, day),
        ),
      ),
    db
      .select({ createdAt: checkinPosts.createdAt })
      .from(checkinPosts)
      .where(eq(checkinPosts.userId, userId)),
  ]);

  const window30 = lastDays(30, day);
  const week = new Set(lastDays(7, day));
  const doneByItem = new Map<string, Set<string>>();
  for (const h of habits) {
    if (!doneByItem.has(h.itemId)) doneByItem.set(h.itemId, new Set());
    doneByItem.get(h.itemId)!.add(h.day);
  }

  const habitViews: HabitView[] = items.map((it) => {
    const done = doneByItem.get(it.id) ?? new Set<string>();
    return {
      id: it.id,
      text: it.text,
      why: it.why,
      metricCodes: it.metricCodes ?? [],
      cadence: it.cadence,
      doneToday: done.has(day),
      weekCount: [...done].filter((d) => week.has(d)).length,
      adherence30: adherence(done, window30),
      strip30: window30.map((d) => (done.has(d) ? 1 : 0)),
    };
  });

  const doneCount = new Map<string, number>();
  for (const h of habits) doneCount.set(h.day, (doneCount.get(h.day) ?? 0) + 1);

  const byDay = new Map(logs.map((l) => [l.day, l]));
  const heatWindow = lastDays(HEAT_DAYS, day);
  const postDays = new Set(
    posts
      .map((p) => (p.createdAt ? localDay(p.createdAt) : ""))
      .filter(Boolean),
  );

  // Phase 24b: a day is "active" because a person did something on it. A
  // phone that logs 3,260 days in a row would otherwise paint the whole grid
  // blue and call it a streak.
  const human = (d: string) => {
    const l = byDay.get(d);
    return (
      (doneCount.get(d) ?? 0) > 0 ||
      postDays.has(d) ||
      humanLogged(toValues(l), (l?.wearable as DailyWearable | null)?.wrote)
    );
  };
  const active = new Set(heatWindow.filter(human));

  const log = byDay.get(day);
  const prev = byDay.get(shiftDay(day, -1));
  return {
    day,
    values: toValues(log),
    wearable: (log?.wearable as DailyWearable | null) ?? null,
    nutrition: (log?.nutrition as DailyNutrition | null) ?? null,
    habits: habitViews,
    streak: streak(active, day),
    yesterday: prev
      ? {
          day: prev.day,
          values: toValues(prev),
          wearable: (prev.wearable as DailyWearable | null) ?? null,
        }
      : null,
    heat: heatWindow.map((d) => ({
      day: d,
      bucket: items.length
        ? Math.max(
            heatmapBucket((doneCount.get(d) ?? 0) / items.length),
            active.has(d) ? 1 : 0,
          )
        : heatmapBucket(active.has(d) ? 1 : 0),
      phone: heatmapBucket(byDay.get(d)?.wearable ? 1 : 0),
    })),
    series: lastDays(30, day).map((d) => {
      const l = byDay.get(d);
      return {
        day: d,
        sleep: l?.sleepHours ?? null,
        weight: l?.weightKg ?? null,
        steps: l?.steps ?? null,
      };
    }),
  };
}

/** Active and archived protocol items with their 30-day strips. */
export async function getProtocol(userId: string) {
  const db = getDb();
  const day = localDay();
  const window30 = lastDays(30, day);
  const [items, habits] = await Promise.all([
    db
      .select()
      .from(protocolItems)
      .where(eq(protocolItems.userId, userId))
      .orderBy(desc(protocolItems.active), asc(protocolItems.createdAt)),
    db
      .select()
      .from(habitLogs)
      .where(
        and(
          eq(habitLogs.userId, userId),
          eq(habitLogs.done, true),
          gte(habitLogs.day, window30[0]!),
        ),
      ),
  ]);

  const doneByItem = new Map<string, Set<string>>();
  for (const h of habits) {
    if (!doneByItem.has(h.itemId)) doneByItem.set(h.itemId, new Set());
    doneByItem.get(h.itemId)!.add(h.day);
  }

  return items.map((it) => {
    const done = doneByItem.get(it.id) ?? new Set<string>();
    return {
      ...it,
      metricCodes: it.metricCodes ?? [],
      adherence30: adherence(done, window30),
      strip30: window30.map((d) => (done.has(d) ? 1 : 0)),
    };
  });
}

/**
 * ponytail: one-time bootstrap. The first time /protocol loads with nothing in
 * it, every lifestyle item the user already answered "did" becomes a protocol
 * item. After that the page never writes on read again.
 */
export async function bootstrapProtocol(userId: string): Promise<number> {
  const db = getDb();
  const [existing] = await db
    .select({ id: protocolItems.id })
    .from(protocolItems)
    .where(eq(protocolItems.userId, userId))
    .limit(1);
  if (existing) return 0;

  const [plan] = await db
    .select()
    .from(insights)
    .where(and(eq(insights.userId, userId), eq(insights.kind, "lifestyle")))
    .orderBy(desc(insights.createdAt))
    .limit(1);
  const items = (plan?.body as LifestyleBody | undefined)?.items;
  if (!plan || !items?.length) return 0;

  const answers = await db
    .select()
    .from(checkins)
    .where(eq(checkins.insightId, plan.id));
  const didIt = new Set(
    answers.filter((a) => a.answer === "did").map((a) => a.itemIndex),
  );
  const adopt = items.filter((_, i) => didIt.has(i));
  if (!adopt.length) return 0;

  await db.insert(protocolItems).values(
    adopt.map((it) => ({
      userId,
      text: it.text,
      why: it.why,
      metricCodes: it.metricCodes ?? [],
      sourceInsightId: plan.id,
    })),
  );
  return adopt.length;
}

export interface GoalView {
  id: string;
  metricCode: string;
  metricName: string;
  unit: string | null;
  targetLow: number | null;
  targetHigh: number | null;
  due: string | null;
  note: string | null;
  achievedAt: Date | null;
  current: number | null;
  currentAt: string | null;
  start: number | null;
  gap: number;
  progress: number;
  reached: boolean;
}

function toGoalView(
  g: typeof goals.$inferSelect,
  m: MetricRow | undefined,
): GoalView {
  const created = (g.createdAt ?? new Date()).toISOString().slice(0, 10);
  const withValues = (m?.rows ?? []).filter((r) => r.value != null);
  const latest = withValues[withValues.length - 1];
  // Where the user stood when the goal was set: the last reading before it,
  // or the first one after if the goal predates every reading.
  const start =
    [...withValues].reverse().find((r) => r.observedAt <= created) ??
    withValues[0];

  const current = latest?.value ?? null;
  return {
    id: g.id,
    metricCode: g.metricCode,
    metricName: m?.name ?? g.metricCode.replace(/_/g, " "),
    unit: latest?.unit ?? m?.unit ?? null,
    targetLow: g.targetLow,
    targetHigh: g.targetHigh,
    due: g.due,
    note: g.note,
    achievedAt: g.achievedAt,
    current,
    currentAt: latest?.observedAt ?? null,
    start: start?.value ?? null,
    gap: current == null ? 0 : goalGap(current, g.targetLow, g.targetHigh),
    progress: goalProgress(start?.value, current, g.targetLow, g.targetHigh),
    reached: inGoal(current, g.targetLow, g.targetHigh),
  };
}

export async function getGoals(userId: string): Promise<GoalView[]> {
  const [rows, metricRows] = await Promise.all([
    getDb()
      .select()
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(asc(goals.due)),
    getMetricRows(userId),
  ]);
  const byCode = new Map(metricRows.map((m) => [m.code, m]));
  return rows.map((g) => toGoalView(g, byCode.get(g.metricCode)));
}

export async function getGoalFor(userId: string, code: string) {
  const [g] = await getDb()
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.metricCode, code)));
  return g ?? null;
}

export interface DrawView {
  day: string;
  count: number;
  flagged: number;
  critical: number;
  fileName: string | null;
  rows: {
    code: string;
    name: string;
    value: number | null;
    valueText: string | null;
    unit: string | null;
    refLow: number | null;
    refHigh: number | null;
    status: Status;
  }[];
}

/** A reading as `groupDraws` needs it: the row plus the band it is judged by. */
export interface DrawReading {
  observedAt: string;
  metricCode: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  uploadId: string | null;
  name: string;
  optimalLow: number | null;
  optimalHigh: number | null;
  /** Null is a lab draw. Anything else is a device and is not a draw. */
  source?: string | null;
}

/**
 * Readings into one card per day.
 *
 * Phase 24b: a draw is blood, so anything that names a source is dropped here
 * as well as in the query. A year of resting heart rates is a time series and
 * lives on the Phone tab; it is not 3,266 blood draws.
 */
export function groupDraws(
  rows: DrawReading[],
  fileById: Map<string, string | null> = new Map(),
): DrawView[] {
  const byDay = new Map<string, DrawView>();
  for (const r of rows) {
    if (r.source != null) continue;
    const status = statusOf({
      value: r.value,
      refLow: r.refLow,
      refHigh: r.refHigh,
      optimalLow: r.optimalLow,
      optimalHigh: r.optimalHigh,
    });
    const draw =
      byDay.get(r.observedAt) ??
      ({
        day: r.observedAt,
        count: 0,
        flagged: 0,
        critical: 0,
        fileName: null,
        rows: [],
      } satisfies DrawView);
    draw.count++;
    if (status === "red") draw.critical++;
    if (status === "red" || status === "amber") draw.flagged++;
    if (!draw.fileName && r.uploadId)
      draw.fileName = fileById.get(r.uploadId) ?? null;
    draw.rows.push({
      code: r.metricCode,
      name: r.name,
      value: r.value,
      valueText: r.valueText,
      unit: r.unit,
      refLow: r.refLow,
      refHigh: r.refHigh,
      status,
    });
    byDay.set(r.observedAt, draw);
  }

  for (const draw of byDay.values())
    draw.rows.sort(
      (a, b) =>
        (a.status === "red" ? 0 : a.status === "amber" ? 1 : 2) -
          (b.status === "red" ? 0 : b.status === "amber" ? 1 : 2) ||
        a.name.localeCompare(b.name),
    );

  return [...byDay.values()];
}

/** One card per blood draw, newest first. Lab rows only. */
export async function getDraws(userId: string): Promise<DrawView[]> {
  const db = getDb();
  const rows = await db
    .select({
      observedAt: readings.observedAt,
      metricCode: readings.metricCode,
      value: readings.value,
      valueText: readings.valueText,
      unit: readings.unit,
      refLow: readings.refLow,
      refHigh: readings.refHigh,
      uploadId: readings.uploadId,
      name: metrics.name,
      optimalLow: metrics.optimalLow,
      optimalHigh: metrics.optimalHigh,
    })
    .from(readings)
    .innerJoin(metrics, eq(metrics.code, readings.metricCode))
    .where(and(eq(readings.userId, userId), isNull(readings.source)))
    .orderBy(desc(readings.observedAt), asc(metrics.name));

  const uploadIds = [
    ...new Set(rows.map((r) => r.uploadId).filter((id): id is string => !!id)),
  ];
  const files = uploadIds.length
    ? await db
        .select({ id: uploads.id, fileName: uploads.fileName })
        .from(uploads)
        .where(inArray(uploads.id, uploadIds))
    : [];
  const fileById = new Map(files.map((f) => [f.id, f.fileName]));

  return groupDraws(rows, fileById);
}

/* ── phase 24b: the Phone tab ─────────────────────────────────────────── */

/** One wearable signal: its daily line, how long it has run, its band. */
export interface PhoneMetric {
  /** The metric code, or the `daily_logs` field for the four activity rows. */
  code: string;
  name: string;
  unit: string | null;
  /** `/m/<code>` for a real metric; null for the activity rows, which have none. */
  href: string | null;
  count: number;
  since: string;
  latest: number | null;
  latestAt: string | null;
  optimalLow: number | null;
  optimalHigh: number | null;
  status: Status;
  /** "nights" for sleep, "days" for everything else. */
  noun: string;
  /** The last 90 days, one point per day, oldest first. */
  points: Point[];
}

/** The order the Phone tab reads in: heart, sleep, body, then activity. */
const PHONE_ORDER = [
  "resting_heart_rate",
  "hrv_sdnn",
  "sleep_duration",
  "spo2",
  "respiratory_rate",
  "walking_hr_avg",
  "hr_recovery_1min",
  "vo2max_est",
  "weight",
  "body_fat_pct",
  "waist_cm",
  "wrist_temp",
  "glucose",
  "bp_systolic",
  "bp_diastolic",
];

const PHONE_DAYS = 90;

/** The four numbers that live in `daily_logs` rather than in `readings`. */
const ACTIVITY: { code: string; name: string; unit: string | null }[] = [
  { code: "steps", name: "Steps", unit: null },
  { code: "exerciseMin", name: "Exercise", unit: "min" },
  { code: "activeEnergyKcal", name: "Active energy", unit: "kcal" },
  { code: "workouts", name: "Workouts", unit: "a day" },
];

const toPhoneMetric = (
  base: Omit<PhoneMetric, "count" | "since" | "latest" | "latestAt" | "points">,
  points: Point[],
  from: string,
): PhoneMetric | null => {
  if (!points.length) return null;
  const last = points[points.length - 1]!;
  return {
    ...base,
    count: points.length,
    since: points[0]!.date,
    latest: last.value,
    latestAt: last.date,
    points: points.filter((p) => p.date >= from),
  };
};

/**
 * Every signal the phone sends, as a row with its own daily line.
 *
 * Phase 24b: these are time series, not blood draws. The readings half comes
 * out of `getMetricRows` (device rows only, so a lab weight stays a lab
 * weight); the activity half comes out of `daily_logs`, where steps, exercise
 * minutes, active energy and workouts actually live.
 */
export async function getPhoneMetrics(userId: string): Promise<PhoneMetric[]> {
  const from = lastDays(PHONE_DAYS)[0]!;
  const [rows, daily] = await Promise.all([
    getMetricRows(userId),
    getDb()
      .select({
        day: dailyLogs.day,
        steps: dailyLogs.steps,
        exerciseMin: dailyLogs.exerciseMin,
        activeEnergyKcal: sql<
          number | null
        >`(${dailyLogs.wearable} ->> 'activeEnergyKcal')::real`,
        workouts: sql<
          number | null
        >`jsonb_array_length(${dailyLogs.wearable} -> 'workouts')`,
      })
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.userId, userId),
          sql`${dailyLogs.wearable} is not null`,
        ),
      )
      .orderBy(asc(dailyLogs.day)),
  ]);

  const out: PhoneMetric[] = [];
  for (const m of rows) {
    const points = m.rows
      .filter((r) => r.source != null && r.value != null)
      .map((r) => ({ date: r.observedAt, value: r.value! }));
    const row = toPhoneMetric(
      {
        code: m.code,
        name: m.name,
        unit: m.unit,
        href: `/m/${m.code}`,
        optimalLow: m.optimalLow,
        optimalHigh: m.optimalHigh,
        status: "gray",
        noun: m.code === "sleep_duration" ? "nights" : "days",
      },
      points,
      from,
    );
    if (row)
      out.push({
        ...row,
        status: statusOf({
          value: row.latest,
          refLow: null,
          refHigh: null,
          optimalLow: m.optimalLow,
          optimalHigh: m.optimalHigh,
        }),
      });
  }

  for (const a of ACTIVITY) {
    const points = daily
      .map((d) => ({
        date: d.day,
        value: d[a.code as keyof typeof d] as number | null,
      }))
      .filter((p): p is Point => p.value != null);
    const row = toPhoneMetric(
      {
        ...a,
        href: null,
        optimalLow: null,
        optimalHigh: null,
        status: "gray",
        noun: "days",
      },
      points,
      from,
    );
    if (row) out.push(row);
  }

  const rank = (code: string) => {
    const i = PHONE_ORDER.indexOf(code);
    return i === -1 ? PHONE_ORDER.length : i;
  };
  return out.sort(
    (a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name),
  );
}

/** The two small home cards: today's progress and the nearest goals. */
export async function getHomeExtras(userId: string) {
  const [today, goalViews] = await Promise.all([
    getToday(userId),
    getGoals(userId),
  ]);
  return {
    streak: today.streak,
    habitsDone: today.habits.filter((h) => h.doneToday).length,
    habitCount: today.habits.length,
    logged: Object.values(today.values).some((v) => v != null && v !== ""),
    goals: goalViews
      .filter((g) => !g.achievedAt)
      .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))
      .slice(0, 3),
  };
}

export interface TrackerSummary {
  from: string;
  to: string;
  /** One row per active protocol item, with how often it was actually done. */
  items: {
    text: string;
    cadence: string;
    done: number;
    adherence: number;
    /** What this item is meant to move; feeds the graph's action boost. */
    metricCodes?: string[];
  }[];
  /** Mean of every number the user logged, over the days they logged it. */
  averages: Record<string, number | null>;
  loggedDays: number;
  adherencePct: number;
}

const AVERAGED = [
  "sleepHours",
  "weightKg",
  "steps",
  "exerciseMin",
  "alcoholUnits",
  "fastingHours",
  "energy",
  "mood",
] as const;

/** A window of the tracker squashed into numbers the prompts can read. */
export async function getTrackerSummary(
  userId: string,
  days: number,
  end: string = localDay(),
): Promise<TrackerSummary> {
  const db = getDb();
  const window = lastDays(days, end);
  const from = window[0]!;

  const [logs, items, habits] = await Promise.all([
    db
      .select()
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.userId, userId),
          gte(dailyLogs.day, from),
          lte(dailyLogs.day, end),
        ),
      ),
    db
      .select()
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      ),
    db
      .select()
      .from(habitLogs)
      .where(
        and(
          eq(habitLogs.userId, userId),
          eq(habitLogs.done, true),
          gte(habitLogs.day, from),
          lte(habitLogs.day, end),
        ),
      ),
  ]);

  const doneByItem = new Map<string, string[]>();
  for (const h of habits)
    doneByItem.set(h.itemId, [...(doneByItem.get(h.itemId) ?? []), h.day]);

  const rows = items.map((it) => {
    const done = doneByItem.get(it.id) ?? [];
    return {
      text: it.text,
      cadence: it.cadence,
      done: done.length,
      adherence: adherence(done, window),
      metricCodes: it.metricCodes ?? [],
    };
  });

  const averages = Object.fromEntries(
    AVERAGED.map((k) => {
      const values = logs
        .map((l) => l[k])
        .filter((v): v is number => v != null);
      return [
        k,
        values.length
          ? Math.round(
              (values.reduce((s, v) => s + v, 0) / values.length) * 100,
            ) / 100
          : null,
      ];
    }),
  );

  return {
    from,
    to: end,
    items: rows,
    averages,
    loggedDays: logs.length,
    adherencePct: rows.length
      ? Math.round(rows.reduce((s, r) => s + r.adherence, 0) / rows.length)
      : 0,
  };
}
