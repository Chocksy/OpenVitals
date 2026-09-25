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
import { basename } from "node:path";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
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
import { classifyPhoto, mealTotals, type CaptureExtract } from "./capture";
import type { Chip } from "./compose";
import {
  mergeNutrition,
  NUTRITION_KEYS,
  type NutritionEntryLike,
} from "./healthkit";

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
  /** how many of the plate: `items` are one plate, `totals` are times this */
  servings: number;
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
 * The reader's items in the row's shape. The one mapping: `mealRowOf` calls it
 * on the extract, and `/api/capture`'s JSON branch on the items the phone sent
 * back from that same extract. Pure; an item with no name is dropped.
 */
export function mealItemsOf(
  items: CaptureExtract["items"] | null | undefined,
): MealItem[] {
  return (items ?? [])
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
}

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

  const items = mealItemsOf(doc.items);

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
    servings: 1,
    source: opts.source ?? "capture",
  };
}

/**
 * The same row out of the chips a person confirmed.
 *
 * `/api/capture`'s JSON branch never sees the extract again — the client sends
 * back the four nutrition chips it kept or edited, and those are what gets
 * written, so the totals come from them. `items` are the reader's own, sent
 * back beside the chips and mapped through `mealItemsOf`; a client that sends
 * none gets `[]` rather than items invented from a total, which is exactly the
 * arithmetic this app refuses to do.
 */
export function mealRowFromChips(
  chips: Chip[],
  opts: {
    day: string;
    time: string | null;
    label: string;
    photoKey?: string | null;
    items?: MealItem[];
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
    items: opts.items ?? [],
    totals: {
      kcal: of("kcal"),
      protein_g: of("proteinG"),
      carbs_g: of("carbsG"),
      fat_g: of("fatG"),
      estimated: true,
    },
    moves: movesOf(),
    servings: 1,
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

  const nutrition = mergeNutrition(
    (existing?.nutrition as DailyNutrition | null) ?? null,
    entryOf(meal),
  ) as DailyNutrition;

  await db
    .insert(dailyLogs)
    .values({ userId, day, nutrition })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.day],
      set: { nutrition, updatedAt: sql`now()` },
    });
}

/**
 * One plate's totals times the servings eaten. Pure.
 *
 * Rounded to the whole unit the reader's own totals are in, and null stays
 * null: half of "we did not read it" is still not a number.
 */
export function scaleTotals(t: MealTotalsRow, servings: number): MealTotalsRow {
  const x = (v: number | null) => (v == null ? null : Math.round(v * servings));
  return {
    kcal: x(t.kcal),
    protein_g: x(t.protein_g),
    carbs_g: x(t.carbs_g),
    fat_g: x(t.fat_g),
    estimated: t.estimated,
  };
}

/** The meal as one entry on the day's food, at the servings eaten. Pure. */
export function entryOf(meal: Meal): NutritionEntryLike {
  const t = scaleTotals(meal.totals, meal.servings ?? 1);
  return {
    ...(meal.time ? { at: meal.time } : {}),
    label: meal.label,
    source: meal.source,
    estimated: true,
    kcal: t.kcal,
    proteinG: t.protein_g,
    carbsG: t.carbs_g,
    fatG: t.fat_g,
  };
}

/** The stored meal in the contract's field names. Pure. */
export function toApiMeal(m: Meal): ApiMeal {
  const servings = m.servings ?? 1;
  const t = m.totals ? scaleTotals(m.totals, servings) : null;
  return {
    id: m.id,
    time: m.time,
    // Where a client can fetch the picture, the way an upload's file is served.
    photo: m.photoKey ? `/api/meals/${m.id}/photo` : null,
    label: m.label,
    servings,
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
 * Each meal's `totals` are already at its servings (`toApiMeal` scales them),
 * so the day adds what was eaten, not what was photographed.
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

/* ── phase 37: edit, delete, read again ───────────────────────────────── */

/**
 * One item as the phone sends it back: the `MealItem` shape, checked. A
 * number is a finite non-negative one or null, never a string.
 */
const macro = z.number().finite().min(0).nullable();
export const mealItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  portion: z.string().max(200),
  kcal: macro,
  protein_g: macro,
  carbs_g: macro,
  fat_g: macro,
  estimated: z.boolean(),
});

/** 0.5 to 4, in halves. A third of a plate is a guess nobody can check. */
export const servingsOk = (n: number): boolean =>
  Number.isFinite(n) && n >= 0.5 && n <= 4 && Number.isInteger(n * 2);

export const mealPatchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  servings: z.number().refine(servingsOk, "0.5 to 4, in steps of 0.5").optional(),
  /** replaces the list; an empty list is a delete, and says so */
  items: z.array(mealItemSchema).min(1).optional(),
});

export type MealPatch = z.infer<typeof mealPatchSchema>;

/**
 * What a PATCH writes. Pure.
 *
 * A new item list is totalled by `mealTotals`, the one totalling and the one
 * plausibility floor, exactly as the reader's list was. The list replaces the
 * items and nothing else: the label changes only when the request sends one.
 * An empty patch is an empty object, which the route refuses before it
 * reaches `.set()`.
 */
export function patchOf(
  patch: MealPatch,
): Partial<Pick<NewMeal, "label" | "time" | "servings" | "items" | "totals">> {
  const out: ReturnType<typeof patchOf> = {};
  if (patch.time !== undefined) out.time = patch.time;
  if (patch.servings !== undefined) out.servings = patch.servings;
  if (patch.items) {
    const totals = mealTotals({
      kind: "meal",
      basis: "",
      confidence: 1,
      // null is "not read": NaN keeps it out of the sum, where 0 would count.
      items: patch.items.map((i) => ({
        name: i.name,
        portion: i.portion,
        kcal: i.kcal ?? NaN,
        proteinG: i.protein_g ?? NaN,
        carbsG: i.carbs_g ?? NaN,
        fatG: i.fat_g ?? NaN,
        confidence: 1,
      })),
    })!;
    out.items = patch.items;
    out.totals = {
      kcal: totals.kcal,
      protein_g: totals.proteinG,
      carbs_g: totals.carbsG,
      fat_g: totals.fatG,
      estimated: patch.items.some((i) => i.estimated),
    };
  }
  if (patch.label !== undefined) out.label = patch.label;
  return out;
}

/**
 * The day's food with its capture entries rebuilt from the capture meals
 * that are left. Pure.
 *
 * The first meal goes in through `mergeNutrition` with `replaceSource`, which
 * drops every old capture entry; the rest are added after it. Entries from any
 * other source (HealthKit's own food log) are never touched. With no capture
 * meal left the capture entries simply go, and the totals are recomputed over
 * what stays by the same arithmetic. Null when nothing is left at all.
 */
export function rebuildNutrition(
  existing: DailyNutrition | null,
  dayMeals: Meal[],
): DailyNutrition | null {
  const entries = dayMeals
    .filter((m) => m.source === "capture")
    .map(entryOf);
  if (!entries.length)
    return (
      ((existing?.entries ?? [])
        .filter((e) => e.source !== "capture")
        .reduce<ReturnType<typeof mergeNutrition> | null>(
          (acc, e) => mergeNutrition(acc, e),
          null,
        ) as DailyNutrition | null) ?? null
    );
  return entries.reduce<ReturnType<typeof mergeNutrition> | null>(
    (acc, e, i) => mergeNutrition(acc, e, { replaceSource: i === 0 }),
    existing,
  ) as DailyNutrition;
}

/** Rewrite one day's `daily_logs.nutrition` from its meals, after any write. */
export async function rebuildDay(userId: string, day: string): Promise<void> {
  const db = getDb();
  const [dayMeals, [existing]] = await Promise.all([
    db
      .select()
      .from(meals)
      .where(and(eq(meals.userId, userId), eq(meals.day, day))),
    db
      .select()
      .from(dailyLogs)
      .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.day, day))),
  ]);
  const nutrition = rebuildNutrition(
    (existing?.nutrition as DailyNutrition | null) ?? null,
    dayMeals,
  );
  if (!existing && !nutrition) return;
  await db
    .insert(dailyLogs)
    .values({ userId, day, nutrition })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.day],
      set: { nutrition, updatedAt: sql`now()` },
    });
}

/**
 * The PATCH itself: one owned row, written, and its day rebuilt. A PATCH
 * cannot change the day, so one day is rebuilt. Null when the row went between
 * the route's `findMeal` and this write (a delete in another request); the
 * delete has rebuilt the day already.
 */
export async function updateMeal(
  userId: string,
  meal: Meal,
  set: ReturnType<typeof patchOf>,
): Promise<Meal | null> {
  const [saved] = await getDb()
    .update(meals)
    .set(set)
    .where(and(eq(meals.id, meal.id), eq(meals.userId, userId)))
    .returning();
  if (!saved) return null;
  await rebuildDay(userId, meal.day);
  return saved;
}

/** The row goes, and its day is rebuilt without it. The photo is the route's. */
export async function deleteMeal(userId: string, meal: Meal): Promise<void> {
  await getDb()
    .delete(meals)
    .where(and(eq(meals.id, meal.id), eq(meals.userId, userId)));
  await rebuildDay(userId, meal.day);
}

/**
 * The stored photo read again with the person's note beside it.
 *
 * `classifyPhoto` with the note as its caption, then `mealRowOf`, the same two
 * steps `POST /api/meals` takes; servings go back to 1 because the new read is
 * of the plate as the note describes it. Null when the read finds no plate,
 * and the caller leaves the meal as it was.
 */
export async function rereadOf(
  meal: Meal,
  buffer: Buffer,
  note: string,
): Promise<Pick<NewMeal, "items" | "label" | "totals" | "servings"> | null> {
  const doc = await classifyPhoto(
    buffer,
    basename(meal.photoKey ?? "photo.jpg"),
    note,
  );
  if (doc.kind !== "meal") return null;
  const row = mealRowOf(doc, {
    day: meal.day,
    time: meal.time,
    photoKey: meal.photoKey,
    source: meal.source,
  });
  if (!row) return null;
  return { items: row.items, label: row.label, totals: row.totals, servings: 1 };
}
