import { describe, it, expect } from "vitest";
import { egfr, fib4, historyOf, phenoAge } from "./derived";

describe("eGFR, CKD-EPI 2021", () => {
  it("scores a healthy 40-year-old man near 100", () => {
    const value = egfr({ creatinine: 1.0, age: 40, sex: "male" })!;
    // The published equation gives 97.6 here; the spec rounds it to "about 96".
    expect(value).toBeGreaterThan(95);
    expect(value).toBeLessThan(100);
  });

  it("runs the female coefficients", () => {
    const female = egfr({ creatinine: 1.0, age: 40, sex: "female" })!;
    const male = egfr({ creatinine: 1.0, age: 40, sex: "male" })!;
    expect(female).toBeLessThan(male);
    expect(female).toBeGreaterThan(60);
  });

  it("stays undefined until sex and age are answered", () => {
    expect(egfr({ creatinine: 1.0, age: 40 })).toBeUndefined();
    expect(egfr({ creatinine: 1.0, sex: "male" })).toBeUndefined();
    expect(egfr({ age: 40, sex: "male" })).toBeUndefined();
  });
});

describe("FIB-4", () => {
  it("matches the worked example", () => {
    expect(fib4({ age: 40, ast: 28, alt: 28, platelets: 235 })).toBeCloseTo(
      0.9,
      2,
    );
  });

  it("is undefined without platelets", () => {
    expect(fib4({ age: 40, ast: 28, alt: 28 })).toBeUndefined();
  });
});

const FULL = {
  albuminGL: 47,
  creatinineUmolL: 88.4,
  glucoseMmolL: 5.0,
  crpMgL: 1.0,
  lymphocytePct: 38,
  mcv: 89,
  rdw: 12.6,
  alp: 80,
  wbc: 5.9,
  age: 40,
};

describe("PhenoAge, Levine 2018", () => {
  it("returns a finite age for a full vector", () => {
    const value = phenoAge(FULL)!;
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(120);
  });

  it("returns undefined when any input is missing", () => {
    expect(phenoAge({ ...FULL, alp: null })).toBeUndefined();
    expect(phenoAge({ ...FULL, age: undefined })).toBeUndefined();
  });

  it("gets older when inflammation and glucose rise", () => {
    const calm = phenoAge(FULL)!;
    const inflamed = phenoAge({ ...FULL, crpMgL: 8, glucoseMmolL: 7 })!;
    expect(inflamed).toBeGreaterThan(calm);
  });
});

describe("historyOf (phase 41B)", () => {
  it("keeps the lowest, the highest, the out-of-range counts and the span", () => {
    const h = historyOf(
      [
        { date: "2024-05-01", value: 6.9, refLow: 13, refHigh: 150 },
        { date: "2021-05-01", value: 20, refLow: 10, refHigh: 150 },
        { date: "2026-08-18", value: 8.2, refLow: 13, refHigh: 150 },
        { date: "2027-01-01", value: 99, refLow: 13, refHigh: 150 },
      ],
      "2026-09-01",
    )!;
    expect(h).toMatchObject({
      min: 6.9,
      minAt: "2024-05-01",
      max: 20,
      maxAt: "2021-05-01",
      n: 3,
      belowRef: 2,
      aboveRef: 0,
    });
    expect(h.years).toBeCloseTo(5.3, 1);
    expect(historyOf([], "2026-09-01")).toBeUndefined();
  });
});
