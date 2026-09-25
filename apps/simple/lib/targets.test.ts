import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { estimateTargets, resolveTargets } from "./targets";

const man = {
  weightKg: 80,
  heightCm: 180,
  birthYear: 1987,
  sex: "male",
  year: 2026,
};

describe("estimateTargets", () => {
  it("is Mifflin-St Jeor at a light-activity 1.4, to the nearest 10", () => {
    // 10 × 80 + 6.25 × 180 − 5 × 39 + 5 = 1735; × 1.4 = 2429 → 2430.
    expect(estimateTargets(man)).toEqual({ kcal: 2430, proteinG: 128 });
  });

  it("takes 161 off for a woman", () => {
    // 10 × 60 + 6.25 × 165 − 5 × 30 − 161 = 1320.25; × 1.4 = 1848.35 → 1850.
    expect(
      estimateTargets({
        weightKg: 60,
        heightCm: 165,
        birthYear: 1996,
        sex: "Female",
        year: 2026,
      }),
    ).toEqual({ kcal: 1850, proteinG: 96 });
  });

  it("has no kcal without a height, and keeps the protein", () => {
    expect(estimateTargets({ ...man, heightCm: null })).toEqual({
      kcal: null,
      proteinG: 128,
    });
  });

  it("has no kcal without a birth year or a sex it can read", () => {
    expect(estimateTargets({ ...man, birthYear: null }).kcal).toBeNull();
    expect(estimateTargets({ ...man, sex: null }).kcal).toBeNull();
    expect(
      estimateTargets({ ...man, sex: "prefer not to say" }).kcal,
    ).toBeNull();
  });

  it("has nothing without a weight", () => {
    expect(estimateTargets({ ...man, weightKg: null })).toEqual({
      kcal: null,
      proteinG: null,
    });
  });
});

describe("resolveTargets", () => {
  const est = { kcal: 2430, proteinG: 128 };

  it("uses the estimate and says so", () => {
    expect(resolveTargets({}, est)).toEqual({
      kcal: 2430,
      proteinG: 128,
      estimated: true,
    });
  });

  it("lets a set value win, field by field", () => {
    expect(resolveTargets({ kcal: 2000 }, est)).toEqual({
      kcal: 2000,
      proteinG: 128,
      estimated: true,
    });
    expect(resolveTargets({ kcal: 2000, proteinG: 140 }, est)).toEqual({
      kcal: 2000,
      proteinG: 140,
      estimated: false,
    });
  });

  it("is not estimated when nothing came from the estimate", () => {
    expect(
      resolveTargets({ kcal: null }, { kcal: null, proteinG: null }),
    ).toEqual({ kcal: null, proteinG: null, estimated: false });
    expect(
      resolveTargets({ proteinG: 120 }, { kcal: null, proteinG: 128 }),
    ).toEqual({ kcal: null, proteinG: 120, estimated: false });
  });
});

describe("PUT /api/targets", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../app/api/targets/route.ts", import.meta.url)),
    "utf8",
  );

  it("is signed in, writes both facts and answers with the targets", () => {
    expect(route).toContain("currentUserId()");
    expect(route).toMatch(/setTargets\(\s*userId/);
    expect(route).toContain("targetsFor(userId");
  });
});
