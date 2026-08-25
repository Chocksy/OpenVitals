/**
 * Queries behind /today, /protocol, /goals, /trends and /labs. Pages stay thin:
 * they call one loader here and render. Everything is scoped to one user.
 */
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  getDb,
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
  type LifestyleBody,
} from "@/db";
import {
  adherence,
  goalGap,
  goalProgress,
  heatmapBucket,
  inGoal,
  lastDays,
  localDay,
  streak,
  type HabitView,
  type LogValues,
} from "./daily";

export type { HabitView, LogValues } from "./daily";
import { getMetricRows, type MetricRow } from "./data";
import { statusOf, type Status } from "./status";

export interface TodayView {
  day: string;
  values: LogValues;
  habits: HabitView[];
  streak: number;
  heat: { day: string; bucket: number }[];
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

  const [logs, items, habits] = await Promise.all([
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

  // A day counts toward the streak when anything was logged on it.
  const active = new Set<string>([
    ...logs.map((l) => l.day),
    ...habits.map((h) => h.day),
  ]);
  const doneCount = new Map<string, number>();
  for (const h of habits) doneCount.set(h.day, (doneCount.get(h.day) ?? 0) + 1);

  const byDay = new Map(logs.map((l) => [l.day, l]));
  const heatWindow = lastDays(HEAT_DAYS, day);

  return {
    day,
    values: toValues(byDay.get(day)),
    habits: habitViews,
    streak: streak(active, day),
    heat: heatWindow.map((d) => ({
      day: d,
      bucket: items.length
        ? heatmapBucket((doneCount.get(d) ?? 0) / items.length)
        : heatmapBucket(active.has(d) ? 1 : 0),
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

/** Daily logs for the trends page, plus the dates of every lab draw. */
export async function getTrends(userId: string, days: number) {
  const db = getDb();
  const window = lastDays(days);
  const [logs, draws] = await Promise.all([
    db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.userId, userId), gte(dailyLogs.day, window[0]!)))
      .orderBy(asc(dailyLogs.day)),
    db
      .selectDistinct({ day: readings.observedAt })
      .from(readings)
      .where(
        and(eq(readings.userId, userId), gte(readings.observedAt, window[0]!)),
      ),
  ]);

  const byDay = new Map(logs.map((l) => [l.day, l]));
  return {
    days: window,
    rows: window.map((d) => {
      const l = byDay.get(d);
      return {
        day: d,
        sleepHours: l?.sleepHours ?? null,
        weightKg: l?.weightKg ?? null,
        steps: l?.steps ?? null,
        exerciseMin: l?.exerciseMin ?? null,
        alcoholUnits: l?.alcoholUnits ?? null,
        energy: l?.energy ?? null,
        mood: l?.mood ?? null,
      };
    }),
    draws: draws.map((d) => d.day).filter((d) => window.includes(d)),
  };
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

/** One card per blood draw, newest first. */
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
    .where(eq(readings.userId, userId))
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

  const byDay = new Map<string, DrawView>();
  for (const r of rows) {
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
  items: { text: string; cadence: string; done: number; adherence: number }[];
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
          ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) /
            100
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
