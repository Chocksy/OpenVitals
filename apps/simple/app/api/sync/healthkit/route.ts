/**
 * `POST /api/sync/healthkit` — the phone's half of phase 23.
 *
 * The watch sends raw samples and nothing else: no daily totals, no units of
 * our choosing, no opinion about what a night of sleep came to. Every number
 * below is computed here by `lib/healthkit.ts`, which is pure and tested, so
 * two phones sending the same day in different orders write the same rows.
 *
 * Dedupe is `(user, metric, day, source)`, a partial unique index that only
 * exists for rows that name a source. A lab draw has none, so a wearable row
 * can never collide with one, and `getMetricRows` keeps the draw as the day's
 * latest value.
 *
 * **One POST carries whole days.** Every write below replaces the day it
 * touches rather than adding to it, because a resync sends the same day again
 * and adding would double it. The arithmetic is therefore only right when a
 * day's samples all arrive in the same POST, which is the phone's job:
 * `HK.batches` cuts on day boundaries and holds the newest day back until the
 * page that finishes it. A client that posts half a day stores half a day.
 */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  dailyLogs,
  getDb,
  habitLogs,
  metrics,
  profileFacts,
  protocolItems,
  readings,
  type DailyNutrition,
  type DailyWearable,
} from "@/db";
import { currentUserId } from "@/lib/auth";
import { localDay, shiftDay } from "@/lib/daily";
import { writeFact } from "@/lib/facts";
import {
  aggregate,
  EXERCISE_FACT,
  EXERCISE_WINDOW,
  exerciseDaysWeek,
  factsFromReadings,
  HK_METRICS,
  mergeDaily,
  mergeNutrition,
  NUTRITION_KEYS,
  workoutTicks,
  type NutritionKey,
  type Sample,
} from "@/lib/healthkit";

export const maxDuration = 120;

/** One batch. More than this is a first sync, and a first sync can page. */
const MAX_SAMPLES = 20000;

const SOURCE = "healthkit";

/** A habit these words name is the one a mindful session ticks. */
const MINDFUL = /mindful|meditat|breath|box breathing/i;

/**
 * The catalog rows HealthKit needs. The new ones are minted once; the ones
 * that already exist only ever gain an optimal band, and only when they had
 * none — a band the curator or the person chose is theirs, and `coalesce`
 * says exactly that in one line.
 */
async function ensureMetrics(): Promise<Set<string>> {
  const db = getDb();
  await db
    .insert(metrics)
    .values(HK_METRICS)
    .onConflictDoUpdate({
      target: metrics.code,
      set: {
        optimalLow: sql`coalesce(${metrics.optimalLow}, excluded.optimal_low)`,
        optimalHigh: sql`coalesce(${metrics.optimalHigh}, excluded.optimal_high)`,
        optimalSource: sql`coalesce(${metrics.optimalSource}, excluded.optimal_source)`,
      },
    });
  const rows = await db.select({ code: metrics.code }).from(metrics);
  return new Set(rows.map((r) => r.code));
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    samples?: Sample[];
  } | null;
  const samples = Array.isArray(body?.samples) ? body!.samples! : null;
  if (!samples)
    return Response.json(
      { error: "samples must be an array" },
      { status: 400 },
    );
  if (samples.length > MAX_SAMPLES)
    return Response.json(
      { error: `too many samples in one batch (max ${MAX_SAMPLES})` },
      { status: 413 },
    );

  const db = getDb();
  const agg = aggregate(samples);
  const known = await ensureMetrics();

  /* ── readings: one row per (metric, day), upserted on its own source ─── */
  const rows = agg.readings.filter((r) => known.has(r.code));
  const skipped = [
    ...new Set(
      agg.readings.filter((r) => !known.has(r.code)).map((r) => r.code),
    ),
  ];
  if (rows.length)
    await db
      .insert(readings)
      .values(
        rows.map((r) => ({
          userId,
          metricCode: r.code,
          value: r.value,
          valueText: String(r.value),
          unit: r.unit || null,
          observedAt: r.day,
          source: SOURCE,
          // "self_reported" is what every non-lab reading already carries, so
          // the curator and /m/[code] treat these the way they treat a number
          // typed into the composer.
          flags: ["self_reported", SOURCE, `n=${r.samples}`],
        })),
      )
      .onConflictDoUpdate({
        target: [
          readings.userId,
          readings.metricCode,
          readings.observedAt,
          readings.source,
        ],
        targetWhere: sql`${readings.source} is not null`,
        set: {
          value: sql`excluded.value`,
          valueText: sql`excluded.value_text`,
          unit: sql`excluded.unit`,
          flags: sql`excluded.flags`,
        },
      });

  /* ── daily logs: columns the person has not typed over ───────────────── */
  const byDay = new Map<string, Record<string, number>>();
  for (const d of agg.daily) {
    const slot = byDay.get(d.day) ?? {};
    slot[d.field] = d.value;
    byDay.set(d.day, slot);
  }
  for (const s of agg.stages) {
    const slot = byDay.get(s.day) ?? {};
    byDay.set(s.day, slot);
  }
  // Sleep is a reading and a daily number: the minutes are the same minutes.
  for (const r of agg.readings.filter((x) => x.code === "sleep_duration")) {
    const slot = byDay.get(r.day) ?? {};
    slot.sleepHours = Math.round((r.value / 60) * 100) / 100;
    byDay.set(r.day, slot);
  }
  for (const r of agg.readings.filter((x) => x.code === "weight")) {
    const slot = byDay.get(r.day) ?? {};
    slot.weightKg = Math.round((r.value / 2.20462) * 100) / 100;
    byDay.set(r.day, slot);
  }
  const stagesByDay = new Map(agg.stages.map((s) => [s.day, s.stages]));
  const workoutsByDay = new Map(agg.workouts.map((w) => [w.day, w.workouts]));
  // A day with nothing but a workout on it still gets a row.
  for (const day of workoutsByDay.keys())
    if (!byDay.has(day)) byDay.set(day, {});

  const days = [...byDay.keys()].sort();
  const existing = days.length
    ? await db
        .select()
        .from(dailyLogs)
        .where(and(eq(dailyLogs.userId, userId), inArray(dailyLogs.day, days)))
    : [];
  const existingByDay = new Map(existing.map((e) => [e.day, e]));

  let dailyWritten = 0;
  for (const day of days) {
    const got = byDay.get(day)!;
    const was = existingByDay.get(day);
    const nutrition = NUTRITION_KEYS.some((k) => got[k] != null)
      ? mergeNutrition(
          (was?.nutrition as DailyNutrition | null) ?? null,
          {
            label: "logged in Health",
            source: SOURCE,
            estimated: false,
            ...Object.fromEntries(
              NUTRITION_KEYS.filter((k) => got[k] != null).map((k) => [
                k,
                got[k as NutritionKey],
              ]),
            ),
          },
          { replaceSource: true },
        )
      : ((was?.nutrition as DailyNutrition | null) ?? null);

    const merged = mergeDaily(
      was
        ? {
            row: {
              steps: was.steps,
              exerciseMin: was.exerciseMin,
              sleepHours: was.sleepHours,
              weightKg: was.weightKg,
            },
            wearable: (was.wearable as DailyWearable | null) ?? null,
          }
        : null,
      {
        columns: {
          steps: got.steps ?? null,
          exerciseMin: got.exerciseMin ?? null,
          sleepHours: got.sleepHours ?? null,
          weightKg: got.weightKg ?? null,
        },
        wearable: {
          ...(got.activeEnergyKcal != null
            ? { activeEnergyKcal: got.activeEnergyKcal }
            : {}),
          ...(got.standHours != null ? { standHours: got.standHours } : {}),
          ...(got.mindfulMin != null ? { mindfulMin: got.mindfulMin } : {}),
          ...(got.distanceKm != null ? { distanceKm: got.distanceKm } : {}),
          ...(got.flights != null ? { flights: got.flights } : {}),
          ...(workoutsByDay.has(day)
            ? { workouts: workoutsByDay.get(day)! }
            : {}),
          ...(stagesByDay.has(day)
            ? { sleepStages: stagesByDay.get(day)! }
            : {}),
          syncedAt: new Date().toISOString(),
        },
      },
    );

    const values = {
      ...merged.row,
      wearable: merged.wearable as DailyWearable,
      ...(nutrition ? { nutrition } : {}),
    };
    await db
      .insert(dailyLogs)
      .values({ userId, day, ...values })
      .onConflictDoUpdate({
        target: [dailyLogs.userId, dailyLogs.day],
        set: { ...values, updatedAt: sql`now()` },
      });
    dailyWritten++;
  }

  /* ── the habit ticks a session earns, when there is a habit for it ───── */
  // A mindful session ticks "meditate"; a workout ticks the habit it names.
  // Adherence is what the projections read, so training counts without a tap.
  const mindfulDays = agg.daily
    .filter((d) => d.field === "mindfulMin" && d.value > 0)
    .map((d) => d.day);
  const ticks: { itemId: string; day: string }[] = [];
  if (mindfulDays.length || agg.workouts.length) {
    const items = await db
      .select()
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      );
    const mindfulItem = items.find((i) => MINDFUL.test(i.text));
    if (mindfulItem)
      for (const day of mindfulDays)
        ticks.push({ itemId: mindfulItem.id, day });
    ticks.push(...workoutTicks(agg.workouts, items));
  }
  const uniqueTicks = [
    ...new Map(ticks.map((t) => [`${t.itemId}|${t.day}`, t])).values(),
  ];
  if (uniqueTicks.length)
    await db
      .insert(habitLogs)
      .values(uniqueTicks.map((t) => ({ userId, ...t, done: true })))
      .onConflictDoNothing();

  /* ── facts: the cycle answer, and the three the interview also asks ──── */
  // Waist, resting heart rate and VO2max are tier-0 facts as well as readings,
  // so the watch answering them is what takes those vectors off "never
  // measured".
  const facts = [
    ...factsFromReadings(rows),
    ...Object.entries(agg.facts).map(([key, value]) => ({
      key,
      value,
      day: undefined as string | undefined,
    })),
  ];
  // A sync runs every day and a waist does not move every day: a fact is only
  // written when the answer actually changed, or the history would fill with
  // rows saying the same thing.
  const current = await db
    .select()
    .from(profileFacts)
    .where(eq(profileFacts.userId, userId));
  const held = new Map(current.map((f) => [f.key, String(f.value ?? "")]));
  const wrote: string[] = [];
  for (const { key, value, day } of facts) {
    if (held.get(key) === value) continue;
    await writeFact(userId, key, value, {
      kind: "changed",
      date: day,
      note: "from Apple Health",
      source: "system",
    });
    wrote.push(key);
  }

  /* ── the exercise answer, from the trailing 28 days of workouts ──────── */
  // The batch only knows its own days, so the window is read back out of
  // `daily_logs` — including the rows this sync has just written.
  const today = localDay();
  // A day wider than the window; `exerciseDaysWeek` does the exact cut.
  const windowFrom = shiftDay(today, -EXERCISE_WINDOW);
  let exercise: string | null = null;
  if (agg.workouts.length) {
    const window = await db
      .select({ day: dailyLogs.day, wearable: dailyLogs.wearable })
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.userId, userId),
          gte(dailyLogs.day, windowFrom),
          lte(dailyLogs.day, today),
        ),
      );
    exercise = exerciseDaysWeek(
      window.map((r) => ({
        day: r.day,
        workouts: (r.wearable as DailyWearable | null)?.workouts,
      })),
      today,
    );
    // A system write never fights an answer the person gave: theirs holds
    // until its own `revisit_at` comes round, and a fact with no clock holds
    // for good. After that the watch may refresh it, and only when the bucket
    // actually moved — so the history stays a list of changes, not of syncs.
    const row = current.find((f) => f.key === EXERCISE_FACT);
    const manualHolds =
      row?.source === "user" &&
      (row.revisitAt == null || row.revisitAt > today);
    if (exercise && !manualHolds && held.get(EXERCISE_FACT) !== exercise) {
      await writeFact(userId, EXERCISE_FACT, exercise, {
        kind: "changed",
        note: `from ${EXERCISE_WINDOW} days of Apple Health workouts`,
        source: "system",
      });
      wrote.push(EXERCISE_FACT);
    }
  }

  return Response.json({
    ok: true,
    samples: samples.length,
    days: agg.days,
    readings: rows.length,
    dailyLogs: dailyWritten,
    facts: wrote,
    habitTicks: uniqueTicks.length,
    workouts: agg.workouts.reduce((n, w) => n + w.workouts.length, 0),
    /** The bucket the trailing window says, whether or not it was written. */
    exercise,
    dropped: agg.dropped,
    skipped,
    /** Take all, use what we can, hide nothing: the Sync tab lists these. */
    seenNotUsed: agg.unmapped,
  });
}
