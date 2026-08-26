import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import { matchPatterns, PATTERNS } from "./patterns";

const value = (
  v: number | null,
  extra: Partial<LatestValue> = {},
): LatestValue => ({
  value: v,
  unit: null,
  date: "2026-08-01",
  status: "green",
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
  ...extra,
});

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: "2026-08-27",
  profile: {},
  latest: {},
  derived: {},
  ...over,
});

const detect = (id: string, m: ModelInput) =>
  PATTERNS.find((p) => p.id === id)!.detector(m);

const matchedIds = (m: ModelInput) =>
  matchPatterns(m)
    .filter((p) => p.matched)
    .map((p) => p.pattern.id);

describe("hashimoto", () => {
  const antibodyPositive = input({
    sex: "female",
    age: 36,
    latest: {
      tpo_antibodies: value(320, { refHigh: 34, unit: "IU/mL" }),
      tsh: value(3.9, { refLow: 0.4, refHigh: 4.5, prev: 3.1 }),
    },
  });

  it("matches antibodies over the lab limit and calls it early", () => {
    const out = detect("hashimoto", antibodyPositive);
    expect(out.matched).toBe(true);
    expect(out.stage).toBe("early");
    expect(out.reasons.join(" ")).toContain("320");
  });

  it("calls a TSH over 4.5 confirmed", () => {
    const out = detect(
      "hashimoto",
      input({ latest: { ...antibodyPositive.latest, tsh: value(6.2) } }),
    );
    expect(out.stage).toBe("confirmed");
  });

  it("falls back to 34 IU/mL when the lab printed no limit", () => {
    const out = detect(
      "hashimoto",
      input({ latest: { tpo_antibodies: value(60) } }),
    );
    expect(out.matched).toBe(true);
    expect(out.stage).toBe("antibodies only");
  });

  it("does not match antibodies inside the lab limit", () => {
    const out = detect(
      "hashimoto",
      input({
        latest: {
          tpo_antibodies: value(12, { refHigh: 34 }),
          tsh: value(3.9, { refHigh: 4.5 }),
        },
      }),
    );
    expect(out.matched).toBe(false);
  });
});

describe("lmhr", () => {
  const triad = {
    ldl_cholesterol: value(215),
    hdl_cholesterol: value(92),
    triglycerides: value(48),
  };
  const lean = { height_cm: "180", waist_cm: "80" };

  it("matches the lipid triad in a lean person eating keto", () => {
    const out = detect(
      "lmhr",
      input({
        sex: "male",
        age: 38,
        profile: { ...lean, diet: "keto for 2 years" },
        latest: triad,
      }),
    );
    expect(out.matched).toBe(true);
    expect(out.reasons.join(" ")).toContain("215");
  });

  it("asks about the diet instead of guessing when the fact is missing", () => {
    const out = detect(
      "lmhr",
      input({ sex: "male", age: 38, profile: lean, latest: triad }),
    );
    expect(out.matched).toBe(false);
    expect(out.pendingQuestions?.[0]!.key).toBe("diet");
    expect(matchPatterns(input({ profile: lean, latest: triad }))).toHaveLength(
      1,
    );
  });

  it("does not match a high LDL with ordinary HDL and triglycerides", () => {
    const out = detect(
      "lmhr",
      input({
        sex: "male",
        profile: { ...lean, diet: "keto for 2 years" },
        latest: {
          ldl_cholesterol: value(215),
          hdl_cholesterol: value(41),
          triglycerides: value(180),
        },
      }),
    );
    expect(out.matched).toBe(false);
    expect(out.pendingQuestions).toBeUndefined();
  });
});

describe("insulin_resistance_early", () => {
  it("matches a high fasting insulin under an HbA1c of 5.7", () => {
    const out = detect(
      "insulin_resistance_early",
      input({
        latest: { hba1c: value(5.5), insulin: value(14) },
        derived: { tgHdl: 4.74 },
      }),
    );
    expect(out.matched).toBe(true);
    expect(out.reasons.join(" ")).toContain("insulin 14 above 10");
  });

  it("does not match once HbA1c is already 5.7", () => {
    const out = detect(
      "insulin_resistance_early",
      input({ latest: { hba1c: value(5.8), insulin: value(14) } }),
    );
    expect(out.matched).toBe(false);
  });
});

describe("iron_deficiency_no_anemia", () => {
  it("matches empty stores with a normal haemoglobin", () => {
    const m = input({
      sex: "female",
      latest: {
        ferritin: value(12),
        hemoglobin: value(12.8, { refLow: 12, refHigh: 16 }),
      },
    });
    expect(detect("iron_deficiency_no_anemia", m).matched).toBe(true);
    expect(matchedIds(m)).toContain("iron_deficiency_no_anemia");
  });

  it("does not match once the haemoglobin has fallen out of range", () => {
    const out = detect(
      "iron_deficiency_no_anemia",
      input({
        latest: {
          ferritin: value(12),
          hemoglobin: value(10.9, { refLow: 12, refHigh: 16 }),
        },
      }),
    );
    expect(out.matched).toBe(false);
  });
});

describe("matchPatterns", () => {
  it("matches nothing for an empty input", () => {
    expect(matchPatterns(input())).toEqual([]);
  });
});
