/**
 * One food photo as one meal row, and the day's meals back out.
 *
 * Phase 32a section 6. `lib/capture.ts` is the reader: it classifies the photo
 * and estimates the plate item by item, and `mealTotals()` there is the only
 * place the arithmetic and the plausibility floor live. This file does not
 * re-add anything — it reshapes what `mealTotals()` returned into the row the
 * `meals` table holds and the JSON the contract promises.
 *
 * Two stores, one sum. `daily_logs.nutrition` stays the day total the graph
 * reads, written through `mergeNutrition` exactly as `writeCaptureChips` does;
 * `meals` is the per-meal detail the native app prints as a card. There is one
 * arithmetic (`mergeNutrition`) and one totalling (`mealTotals`), not two of
 * either.
 *
 * Every number in here came out of one vision call off a picture, so every
 * item and every total carries `estimated: true` and never loses it.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import {
  dailyLogs,
  getDb,
  meals,
  type DailyNutrition,
  type Meal,
  type MealItem,
  type MealMove,
  type MealTotalsRow,
} from "@/db";
import { mealTotals, type CaptureExtract } from "./capture";
import type { Chip } from "./compose";
import { mergeNutrition, NUTRITION_KEYS } from "./healthkit";

/**
 * A meal row before it has an owner. `user_id` is the caller's, never the
 * body's, which is why it is not part of what the pure builders return.
 */
export type NewMeal = Omit<typeof meals.$inferInsert, "userId">;

/** The `GET /api/meals` meal, in the contract's own field names. */
export interface ApiMealItem {
  name: string;
  portion: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  estimated: boolean;
}

export interface ApiTotals {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  estimated: boolean;
}

export interface ApiMove {
  what: string;
  line: string;
}

export interface ApiMeal {
  id: string;
  time: string | null;
  photo: string | null;
  label: string;
  items: ApiMealItem[];
  totals: ApiTotals;
  moves: ApiMove[];
}

export interface MealsView {
  day: string;
  meals: ApiMeal[];
  totals: ApiTotals;
}

/** A finite, non-negative number, or null. Never a guess, never a zero-fill. */
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * What a meal moves, when the stored record can say so.
 *
 * It is always `[]` today, and that is the honest answer rather than a gap.
 * A move is "this meal put you over/under something you are actually aiming
 * at": the person's protein or kcal target for the day. Nothing stores one.
 * `goals` are per blood-marker code (`goals.metric_code` references
 * `metrics.code`) with a `target_low`/`target_high` band, and no protocol item
 * carries a daily macro number either. Writing "protein and fibre first" off a
 * plate of salmon would be the model talking about diets, which rule 8 of the
 * capture prompt forbids and which principle 3 forbids twice over.
 *
 * When a macro target lands in the record — a goal on a nutrition key, or a
 * protocol item with a dose in grams — this is where it gets computed, from
 * the day's stored total against that stored target, and printed with both
 * numbers. Until then: no move.
 */
const movesOf = (): MealMove[] => [];

/**
 * One `CaptureExtract` into one row. Pure: the same extract, day and time give
 * the same row for ever, which is what `meals.test.ts` checks with no model
 * and no database in the loop.
 *
 * Null when the plate has nothing on it — an extract with no items is not a
 * meal, and `mealTotals()` says so first.
 */
export function mealRowOf(
  doc: CaptureExtract,
  opts: {
    day: string;
    time: string | null;
    photoKey: string | null;
    source?: string;
  },
): NewMeal | null {
  const totals = mealTotals(doc);
  if (!totals) return null;

  const items: MealItem[] = (doc.items ?? [])
    .filter((i) => i?.name)
    .map((i) => ({
      name: String(i.name),
      portion: String(i.portion ?? ""),
      kcal: num(i.kcal),
      protein_g: num(i.proteinG),
      carbs_g: num(i.carbsG),
      fat_g: num(i.fatG),
      // Off a photograph. Never dropped, here or in the UI.
      estimated: true,
    }));

  const row: MealTotalsRow = {
    kcal: totals.kcal,
    protein_g: totals.proteinG,
    carbs_g: totals.carbsG,
    fat_g: totals.fatG,
    estimated: true,
  };

  return {
    day: opts.day,
    time: opts.time,
    photoKey: opts.photoKey,
    label: totals.label,
    items,
    totals: row,
    moves: movesOf(),
    source: opts.source ?? "capture",
  };
}

/**
 * The same row out of the chips a person confirmed.
 *
 * `/api/capture`'s JSON branch never sees the extract again — the client sends
 * back the four nutrition chips it kept or edited, and those are what gets
 * written. So the meal is built from them, and `items` is empty rather than
 * invented: the per-item breakdown did not survive the round trip, and making
 * one up from a total is exactly the arithmetic this app refuses to do.
 */
export function mealRowFromChips(
  chips: Chip[],
  opts: {
    day: string;
    time: string | null;
    label: string;
    photoKey?: string | null;
    source?: string;
  },
): NewMeal | null {
  const food = chips.filter(
    (c) =>
      c.kind === "nutrition" &&
      (NUTRITION_KEYS as readonly string[]).includes(c.key),
  );
  if (!food.length) return null;
  const of = (key: (typeof NUTRITION_KEYS)[number]) =>
    num(food.find((c) => c.key === key)?.value);

  return {
    day: opts.day,
    time: opts.time,
    photoKey: opts.photoKey ?? null,
    label: opts.label.slice(0, 200) || "a photo",
    items: [],
    totals: {
      kcal: of("kcal"),
      protein_g: of("proteinG"),
      carbs_g: of("carbsG"),
      fat_g: of("fatG"),
      estimated: true,
    },
    moves: movesOf(),
    source: opts.source ?? "capture",
  };
}

/**
 * The row in, the stored meal out, and the day's total kept in step.
 *
 * `logDay: false` is for the one caller that already summed these same numbers
 * into `daily_logs` a line earlier (`/api/capture`'s JSON branch, through
 * `writeCaptureChips`); adding them again would double the day.
 */
export async function saveMeal(
  userId: string,
  row: NewMeal,
  { logDay = true } = {},
): Promise<Meal> {
  const db = getDb();
  const [saved] = await db
    .insert(meals)
    .values({ ...row, userId })
    .returning();

  if (logDay) await addToDay(userId, saved!);
  return saved!;
}

/**
 * The meal's totals into `daily_logs.nutrition`, through the one arithmetic.
 *
 * `daily_logs.nutrition` stays the day total the graph and the engine read;
 * `meals` is the per-meal detail. `mergeNutrition` recomputes the day from its
 * entries, so the sum is never kept in two places.
 */
async function addToDay(userId: string, meal: Meal): Promise<void> {
  const db = getDb();
  const day = meal.day;
  const [existing] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.day, day)));

  const t = meal.totals;
  const nutrition = mergeNutrition(
    (existing?.nutrition as DailyNutrition | null) ?? null,
    {
      ...(meal.time ? { at: meal.time } : {}),
      label: meal.label,
      source: meal.source,
      estimated: true,
      kcal: t.kcal,
      proteinG: t.protein_g,
      carbsG: t.carbs_g,
      fatG: t.fat_g,
    },
  ) as DailyNutrition;

  await db
    .insert(dailyLogs)
    .values({ userId, day, nutrition })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.day],
      set: { nutrition, updatedAt: sql`now()` },
    });
}

/** The stored meal in the contract's field names. Pure. */
export function toApiMeal(m: Meal): ApiMeal {
  const t = m.totals;
  return {
    id: m.id,
    time: m.time,
    // Where a client can fetch the picture, the way an upload's file is served.
    photo: m.photoKey ? `/api/meals/${m.id}/photo` : null,
    label: m.label,
    items: (m.items ?? []).map((i) => ({
      name: i.name,
      portion: i.portion,
      kcal: i.kcal,
      protein_g: i.protein_g,
      carbs_g: i.carbs_g,
      fat_g: i.fat_g,
      estimated: i.estimated !== false,
    })),
    totals: {
      kcal: t?.kcal ?? null,
      protein_g: t?.protein_g ?? null,
      carbs_g: t?.carbs_g ?? null,
      fat_g: t?.fat_g ?? null,
      estimated: t?.estimated !== false,
    },
    moves: (m.moves ?? []).map((v) => ({ what: v.what, line: v.line })),
  };
}

/**
 * The day's total, as the sum of the meals on the card above it.
 *
 * Null where no meal carried the macro, never zero: "we did not read it" and
 * "there was none of it" are different sentences.
 */
export function dayTotals(rows: ApiMeal[]): ApiTotals {
  const sum = (key: "kcal" | "protein_g" | "carbs_g" | "fat_g") => {
    const xs = rows
      .map((r) => r.totals[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0)) : null;
  };
  return {
    kcal: sum("kcal"),
    protein_g: sum("protein_g"),
    carbs_g: sum("carbs_g"),
    fat_g: sum("fat_g"),
    estimated: rows.some((r) => r.totals.estimated),
  };
}

/** `GET /api/meals` for one person and one day, oldest first. */
export async function getMeals(
  userId: string,
  day: string,
): Promise<MealsView> {
  const rows = await getDb()
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.day, day)))
    .orderBy(asc(meals.time), asc(meals.createdAt));

  const out = rows.map(toApiMeal);
  return { day, meals: out, totals: dayTotals(out) };
}

/** One meal row, scoped to its owner, the way `findUpload` scopes an upload. */
export async function findMeal(
  userId: string,
  id: string,
): Promise<Meal | null> {
  const [row] = await getDb()
    .select()
    .from(meals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)))
    .limit(1);
  return row ?? null;
}
