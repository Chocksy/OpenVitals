import { describe, it, expect } from "vitest";
import { normalizeUnit, convert, conversionFactor } from "./units";

describe("normalizeUnit", () => {
  /** [raw, canonical, expected to be the same unit] */
  const SAME: [string, string][] = [
    ["UI/l", "U/L"],
    ["/ UI/l", "U/L"],
    ["U/I", "U/L"],
    ["μg/dL", "ug/dL"],
    ["μg/dl", "ug/dL"],
    ["/ ug/dl", "ug/dL"],
    ["μUI/mL", "uIU/mL"],
    ["uUI/mL", "uIU/mL"],
    ["FI", "fL"],
    ["x10^3/uL", "10^3/uL"],
    ["x10^6/uL", "10^6/uL"],
    ["/ mg/dl", "mg/dL"],
    ["/ mm/h", "mm/h"],
    ["10³/µL", "10^3/uL"],
    ["mmc", "/mm³"],
    ["mcg/dL", "ug/dL"],
    [" g / L ", "g/L"],
  ];

  for (const [raw, canonical] of SAME) {
    it(`treats "${raw}" as "${canonical}"`, () => {
      expect(normalizeUnit(raw)).toBe(normalizeUnit(canonical));
    });
  }

  it("keeps genuinely different units apart", () => {
    expect(normalizeUnit("mg/L")).not.toBe(normalizeUnit("mg/dL"));
    expect(normalizeUnit("ng/mL")).not.toBe(normalizeUnit("ug/dL"));
    expect(normalizeUnit("/mm³")).not.toBe(normalizeUnit("10^3/uL"));
    expect(normalizeUnit("pg")).not.toBe(normalizeUnit("g/dL"));
  });

  it("is empty for a missing unit", () => {
    expect(normalizeUnit(null)).toBe("");
    expect(normalizeUnit("")).toBe("");
    expect(normalizeUnit(undefined)).toBe("");
  });
});

describe("convert", () => {
  it("counts per mm3 to 10^3/uL", () => {
    expect(convert(7200, "/mm³", "10^3/uL", "wbc")).toBeCloseTo(7.2, 5);
  });

  it("counts per mm3 to 10^6/uL for red cells", () => {
    expect(convert(5_120_000, "/mm³", "10^6/uL", "rbc")).toBeCloseTo(5.12, 5);
  });

  it("ng/mL to ug/dL for cortisol", () => {
    expect(convert(180, "ng/ml", "ug/dL", "cortisol")).toBeCloseTo(18, 5);
  });

  it("ng/mL to ng/dL for testosterone", () => {
    expect(convert(5.4, "ng/ml", "ng/dL", "testosterone")).toBeCloseTo(540, 5);
  });

  it("mg/L to mg/dL for CRP", () => {
    expect(convert(3.2, "mg/L", "mg/dL", "crp")).toBeCloseTo(0.32, 5);
  });

  it("mmol/L to mg/dL for glucose", () => {
    expect(convert(5, "mmol/L", "mg/dL", "glucose")).toBeCloseTo(90, 5);
  });

  it("mmol/L to mg/dL for cholesterol", () => {
    expect(convert(5, "mmol/L", "mg/dL", "total_cholesterol")).toBeCloseTo(
      193.35,
      3,
    );
  });

  it("umol/L to mg/dL for creatinine", () => {
    expect(convert(88, "umol/L", "mg/dL", "creatinine")).toBeCloseTo(0.9944, 4);
  });

  it("nmol/L to ng/mL for vitamin D", () => {
    expect(convert(75, "nmol/L", "ng/mL", "vitamin_d")).toBeCloseTo(30, 5);
  });

  it("pmol/L to pg/mL for free T4", () => {
    expect(convert(15, "pmol/L", "pg/mL", "free_t4")).toBeCloseTo(11.655, 3);
  });

  it("g/L to g/dL", () => {
    expect(convert(140, "g/L", "g/dL", "hemoglobin")).toBeCloseTo(14, 5);
  });

  it("runs a rule backwards", () => {
    expect(convert(7.2, "10^3/uL", "/mm³", "wbc")).toBeCloseTo(7200, 3);
    expect(convert(0.32, "mg/dL", "mg/L", "crp")).toBeCloseTo(3.2, 5);
  });

  it("returns the value untouched for a spelling-only difference", () => {
    expect(convert(42, "UI/l", "U/L", "alt")).toBe(42);
    expect(conversionFactor("μg/dL", "ug/dL")).toBe(1);
  });

  it("returns null when the analyte does not match a molar rule", () => {
    expect(convert(5, "mmol/L", "mg/dL", "ferritin")).toBeNull();
  });

  it("returns null for an unknown pair", () => {
    expect(convert(33, "g/dl", "pg", "mch")).toBeNull();
    expect(convert(12, "", "/uL", "urine_red_blood_cells")).toBeNull();
    expect(convert(12, "banana", "mg/dL", "glucose")).toBeNull();
  });

  it("returns null without a value", () => {
    expect(convert(null, "mg/L", "mg/dL", "crp")).toBeNull();
  });
});
