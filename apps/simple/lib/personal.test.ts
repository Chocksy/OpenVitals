import { describe, expect, it } from "vitest";
import {
  bandOf,
  labChange,
  labPoints,
  recentSlope,
  stepOf,
  zOf,
  type LabPoint,
} from "./personal";

/** The round fifteen data pack (54-casefile.html), the owner's real draws. */
const pts = (rows: [string, number][]) =>
  rows.map(([date, value]) => ({ date, value }));
const LDL = pts([
  ["2015-03-21", 103], ["2021-10-14", 136.1], ["2021-12-04", 110.5],
  ["2022-10-20", 94], ["2023-03-17", 97.3], ["2024-05-13", 122.9],
  ["2024-11-20", 106], ["2025-12-09", 117], ["2026-04-23", 131],
]);
const EOS = pts([
  ["2014-03-26", 0.09], ["2015-03-21", 0.1], ["2016-01-09", 0.13],
  ["2019-07-13", 0.11], ["2021-10-14", 0.11], ["2023-03-17", 0.05],
  ["2024-05-13", 0.09], ["2024-11-20", 0.25], ["2025-12-09", 0.17],
  ["2026-04-23", 0.19],
]);
const FERRITIN = pts([
  ["2021-10-14", 154.5], ["2023-03-17", 110.8], ["2024-05-13", 115.3],
  ["2025-12-09", 94.4], ["2026-04-23", 79.6],
]);

describe("bandOf", () => {
  it("reads the LDL band as the mockup does: 108.2 ± 14.6, z 1.56", () => {
    const b = bandOf(LDL, { code: "ldl_cholesterol" })!;
    expect(b.median).toBeCloseTo(108.25, 2);
    expect(b.sd).toBeCloseTo(14.6, 1);
    expect(b.provisional).toBe(false);
    expect(zOf(131, b)).toBeCloseTo(1.56, 2);
  });

  it("gives eosinophils 0.11 ± 0.03 from nine draws", () => {
    const b = bandOf(EOS, { code: "eosinophils_abs" })!;
    expect(b.median).toBe(0.11);
    expect(b.sd).toBeCloseTo(0.03, 2);
    expect(b.n).toBe(9);
  });

  it("makes a provisional band from four draws and none from three", () => {
    const b = bandOf(FERRITIN, { code: "ferritin" })!;
    expect(b.provisional).toBe(true);
    expect(b.median).toBeCloseTo(113.05, 2);
    expect(b.sd).toBeCloseTo(15.5, 1);
    expect(bandOf(FERRITIN.slice(0, 4))).toBeUndefined();
  });

  it("never goes narrower than the assay floor", () => {
    const flat = pts([["a", 5], ["b", 5], ["c", 5], ["d", 5], ["e", 5], ["f", 9]]);
    expect(bandOf(flat)!.sd).toBeCloseTo(0.25, 5); // 5 % of 5
    expect(bandOf(flat, { code: "hba1c" })!.sd).toBeCloseTo(0.085, 5);
  });
});

describe("stepOf", () => {
  it("finds the eosinophil step up since Nov 2024 over a prior max of 0.13", () => {
    expect(stepOf(EOS)).toMatchObject({ dir: "up", since: "2024-11-20", k: 3, priorMax: 0.13 });
    // a draw earlier, the step had not fired yet
    expect(stepOf(EOS.slice(0, -2))).toBeUndefined();
  });

  it("needs three earlier draws", () => {
    expect(stepOf(pts([["a", 1], ["b", 1], ["c", 5], ["d", 6]]))).toBeUndefined();
  });
});

describe("recentSlope", () => {
  it("reads LDL at +16.0 a year by least squares over the last three draws", () => {
    const s = recentSlope(LDL, "2026-09-26")!;
    expect(s.perYear).toBeCloseTo(16.0, 1);
    expect(s).toMatchObject({ n: 3, from: "2024-11-20", to: "2026-04-23" });
  });

  it("needs three draws inside 24 months", () => {
    expect(recentSlope(LDL, "2027-06-01")).toBeUndefined();
  });
});

describe("labPoints and labChange", () => {
  const row = (observedAt: string, value: number | null, refHigh = 5, source: string | null = null) => ({
    observedAt, value, valueText: null, unit: "mg/L", refLow: 0, refHigh, source,
  });

  it("keeps lab draws only and averages a day", () => {
    const got = labPoints([row("2024-01-01", 2), row("2024-01-01", 4), row("2024-01-02", 9, 5, "healthkit"), row("2024-01-03", null)]);
    expect(got).toEqual([{ date: "2024-01-01", value: 3, refLow: 0, refHigh: 5, unit: "mg/L" }]);
  });

  it("flags a new reference range on the last draw", () => {
    const p = (refHigh: number): LabPoint => ({ date: "x", value: 1, refLow: 0, refHigh, unit: "mg/L" });
    expect(labChange([p(5), p(5)])).toBe(false);
    expect(labChange([p(5), p(3.3)])).toBe(true);
    expect(labChange([p(5)])).toBe(false);
  });
});
