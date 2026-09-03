import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mealTotals, type CaptureExtract } from "./capture";
import type { Chip } from "./compose";
import {
  dayTotals,
  mealRowFromChips,
  mealRowOf,
  toApiMeal,
  type ApiMeal,
  type MealsView,
} from "./meals";
import type { Meal } from "@/db";

const DAY = "2026-08-31";

/** The same plate `capture.test.ts` reads, so one photo has one meaning. */
const plate = (over: Partial<CaptureExtract> = {}): CaptureExtract => ({
  kind: "meal",
  basis: "grilled salmon, white rice, green beans",
  confidence: 0.7,
  items: [
    {
      name: "grilled salmon",
      portion: "150 g",
      kcal: 310,
      proteinG: 34,
      carbsG: 0,
      fatG: 19,
      confidence: 0.7,
    },
    {
      name: "white rice",
      portion: "200 g cooked",
      kcal: 260,
      proteinG: 5,
      carbsG: 57,
      fatG: 1,
      confidence: 0.6,
    },
    {
      name: "green beans",
      portion: "100 g",
      kcal: 35,
      proteinG: 2,
      carbsG: 7,
      fatG: 0,
      confidence: 0.8,
    },
  ],
  ...over,
});

/** A stored row out of a built one, without a database in the way. */
const stored = (over: Partial<Meal> = {}): Meal => {
  const row = mealRowOf(plate(), {
    day: DAY,
    time: "13:05",
    photoKey: null,
  })!;
  return {
    ...row,
    id: "0f6c1b3a-7d24-4a1e-9c58-2b8f5d0e4a71",
    userId: "someone",
    time: row.time ?? null,
    photoKey: row.photoKey ?? null,
    moves: row.moves ?? [],
    source: row.source ?? "capture",
    createdAt: new Date(`${DAY}T13:05:00Z`),
    ...over,
  } as Meal;
};

describe("one photo becomes one row", () => {
  it("keeps the reader's items and adds nothing to them", () => {
    const row = mealRowOf(plate(), {
      day: DAY,
      time: "13:05",
      photoKey: "./data/uploads/u/1.jpg",
    })!;
    expect(row.items).toHaveLength(3);
    expect(row.items[0]).toEqual({
      name: "grilled salmon",
      portion: "150 g",
      kcal: 310,
      protein_g: 34,
      carbs_g: 0,
      fat_g: 19,
      estimated: true,
    });
    expect(row.label).toBe("grilled salmon, white rice, green beans");
    expect(row.day).toBe(DAY);
    expect(row.time).toBe("13:05");
    expect(row.photoKey).toBe("./data/uploads/u/1.jpg");
    expect(row.source).toBe("capture");
  });

  it("takes its totals from mealTotals and does no second arithmetic", () => {
    const doc = plate();
    const t = mealTotals(doc)!;
    const row = mealRowOf(doc, { day: DAY, time: null, photoKey: null })!;
    expect(row.totals).toEqual({
      kcal: t.kcal,
      protein_g: t.proteinG,
      carbs_g: t.carbsG,
      fat_g: t.fatG,
      estimated: true,
    });
    expect(row.totals.kcal).toBe(605);
  });

  it("labels every number an estimate, item by item and in the total", () => {
    const row = mealRowOf(plate(), { day: DAY, time: null, photoKey: null })!;
    expect(row.items.every((i) => i.estimated)).toBe(true);
    expect(row.totals.estimated).toBe(true);
  });

  it("keeps the plausibility floor mealTotals draws", () => {
    const row = mealRowOf(
      plate({
        items: [
          {
            name: "a typo",
            portion: "1 bowl",
            kcal: 90000,
            proteinG: 12,
            carbsG: 20,
            fatG: 4,
            confidence: 0.4,
          },
        ],
      }),
      { day: DAY, time: null, photoKey: null },
    )!;
    expect(row.totals.kcal).toBeNull();
    expect(row.totals.protein_g).toBe(12);
  });

  it("is nothing at all when the plate is empty", () => {
    expect(
      mealRowOf(plate({ items: [] }), {
        day: DAY,
        time: null,
        photoKey: null,
      }),
    ).toBeNull();
  });

  it("invents no move it cannot compute from the record", () => {
    const row = mealRowOf(plate(), { day: DAY, time: null, photoKey: null })!;
    expect(row.moves).toEqual([]);
  });
});

describe("the chips a person confirmed become the same row", () => {
  const chips: Chip[] = [
    {
      kind: "nutrition",
      key: "kcal",
      label: "605 kcal · estimate",
      value: 605,
      quote: "grilled salmon, white rice, green beans",
      date: DAY,
      confidence: 0.6,
      by: "model",
    },
    {
      kind: "nutrition",
      key: "proteinG",
      label: "41 g protein · estimate",
      value: 41,
      quote: "grilled salmon, white rice, green beans",
      date: DAY,
      confidence: 0.6,
      by: "model",
    },
  ];

  it("carries the confirmed numbers and no invented items", () => {
    const row = mealRowFromChips(chips, {
      day: DAY,
      time: "13:05",
      label: "grilled salmon, white rice, green beans",
    })!;
    expect(row.items).toEqual([]);
    expect(row.totals).toEqual({
      kcal: 605,
      protein_g: 41,
      carbs_g: null,
      fat_g: null,
      estimated: true,
    });
  });

  it("is nothing when no food chip was confirmed", () => {
    const fact: Chip[] = [
      {
        kind: "fact",
        key: "last_meal_hour",
        label: "last meal 13:05",
        value: "13:05",
        quote: "a clock on the wall behind the plate",
        date: DAY,
        confidence: 0.7,
        by: "model",
      },
    ];
    expect(
      mealRowFromChips(fact, { day: DAY, time: null, label: "a photo" }),
    ).toBeNull();
  });
});

describe("the row in the contract's own names", () => {
  it("prints snake_case macros and the estimate flag", () => {
    const api = toApiMeal(stored());
    expect(Object.keys(api.totals).sort()).toEqual([
      "carbs_g",
      "estimated",
      "fat_g",
      "kcal",
      "protein_g",
    ]);
    expect(Object.keys(api.items[0]!).sort()).toEqual([
      "carbs_g",
      "estimated",
      "fat_g",
      "kcal",
      "name",
      "portion",
      "protein_g",
    ]);
    expect(api.totals.protein_g).toBe(41);
    expect(api.items[0]!.estimated).toBe(true);
  });

  it("points the photo at the owner-only route, or at nothing", () => {
    expect(toApiMeal(stored()).photo).toBeNull();
    expect(
      toApiMeal(stored({ photoKey: "./data/uploads/u/1.jpg" })).photo,
    ).toBe("/api/meals/0f6c1b3a-7d24-4a1e-9c58-2b8f5d0e4a71/photo");
  });
});

describe("the day is the sum of its meals", () => {
  it("adds the meal totals and keeps the estimate label", () => {
    const one = toApiMeal(stored());
    const two = toApiMeal(
      stored({
        id: "9a1e7c40-3b56-4d92-8f10-6c2d4e8b7a35",
        totals: {
          kcal: 300,
          protein_g: 20,
          carbs_g: null,
          fat_g: 8,
          estimated: true,
        },
      }),
    );
    expect(dayTotals([one, two])).toEqual({
      kcal: 905,
      protein_g: 61,
      // 64 from one plate and nothing read on the other is 64, not 64 + 0.
      carbs_g: 64,
      fat_g: 28,
      estimated: true,
    });
  });

  it("says null rather than zero on a day with no meal", () => {
    expect(dayTotals([])).toEqual({
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      estimated: false,
    });
  });
});

/**
 * The contract 32b decodes. `fixtures/api/meals.json` is what the native app's
 * unit tests read, so the shape is checked here rather than discovered in
 * Xcode: one missing field is a build break in another repo.
 */
describe("fixtures/api/meals.json is the contract", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const body = JSON.parse(
    readFileSync(path.join(HERE, "../fixtures/api/meals.json"), "utf8"),
  ) as MealsView;

  const isTotals = (t: unknown) => {
    const v = t as Record<string, unknown>;
    expect(Object.keys(v).sort()).toEqual([
      "carbs_g",
      "estimated",
      "fat_g",
      "kcal",
      "protein_g",
    ]);
    for (const k of ["kcal", "protein_g", "carbs_g", "fat_g"])
      expect(v[k] === null || typeof v[k] === "number").toBe(true);
    expect(typeof v.estimated).toBe("boolean");
  };

  it("has the wrapper the GET promises", () => {
    expect(Object.keys(body).sort()).toEqual(["day", "meals", "totals"]);
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(body.meals)).toBe(true);
    expect(body.meals.length).toBeGreaterThan(0);
    isTotals(body.totals);
  });

  it("has every meal field, and every number labelled an estimate", () => {
    for (const m of body.meals as ApiMeal[]) {
      expect(Object.keys(m).sort()).toEqual([
        "id",
        "items",
        "label",
        "moves",
        "photo",
        "time",
        "totals",
      ]);
      expect(typeof m.id).toBe("string");
      expect(m.time === null || /^\d{2}:\d{2}$/.test(m.time)).toBe(true);
      expect(m.photo === null || typeof m.photo === "string").toBe(true);
      expect(typeof m.label).toBe("string");
      isTotals(m.totals);
      expect(m.totals.estimated).toBe(true);
      for (const i of m.items) {
        expect(Object.keys(i).sort()).toEqual([
          "carbs_g",
          "estimated",
          "fat_g",
          "kcal",
          "name",
          "portion",
          "protein_g",
        ]);
        expect(i.estimated).toBe(true);
      }
      for (const mv of m.moves)
        expect(Object.keys(mv).sort()).toEqual(["line", "what"]);
    }
  });

  it("totals the day exactly as dayTotals does", () => {
    expect(body.totals).toEqual(dayTotals(body.meals));
  });
});
