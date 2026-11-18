/**
 * Batch 5A: the value a plan target aims at. The old reading took the first
 * number, so "131 to about 118 mg/dL" stored 131 and the goal closed the
 * next night on the reading that prompted it.
 */
import { describe, expect, it } from "vitest";
import { goalTarget } from "./adopt";

describe("goalTarget", () => {
  it("reads where a transition lands, not where it starts", () => {
    expect(goalTarget("131 to about 118 mg/dL", "down", 131)).toBe(118);
    expect(goalTarget("131 → 118", "down", 131)).toBe(118);
    expect(goalTarget("131 mg/dL -> 118 mg/dL", "down", null)).toBe(118);
    expect(goalTarget("from 22 to 35 ng/mL", "up", 22)).toBe(35);
    expect(goalTarget("HbA1c 5.9 to 5.6 %", "down", 5.9)).toBe(5.6);
  });

  it("refuses a landing on the wrong side for the direction", () => {
    expect(goalTarget("100 to 131 mg/dL", "down", 131)).toBeNull();
    expect(goalTarget("35 to 22 ng/mL", "up", 35)).toBeNull();
  });

  it("moves the latest value by a change in the target's direction", () => {
    expect(goalTarget("down about 13 mg/dL", "down", 131)).toBe(118);
    expect(goalTarget("-13", "down", 131)).toBe(118);
    expect(goalTarget("lower by 13", "down", 131)).toBe(118);
    expect(goalTarget("+8 ng/mL", "up", 22)).toBe(30);
    expect(goalTarget("up about 8 ng/mL", "up", 22)).toBe(30);
  });

  it("has no target for a change with nothing to move, or a relative percent", () => {
    expect(goalTarget("down about 13 mg/dL", "down", null)).toBeNull();
    expect(goalTarget("-13", "down", undefined)).toBeNull();
    expect(goalTarget("down about 10 %", "down", 131)).toBeNull();
    expect(goalTarget("-10%", "down", 131)).toBeNull();
    // a signed change against the direction is unclear
    expect(goalTarget("+13", "down", 131)).toBeNull();
  });

  it("takes one absolute number as it is", () => {
    expect(goalTarget("under 100 mg/dL", "down", 131)).toBe(100);
    expect(goalTarget("LDL down to 70 mg/dL", "down", 131)).toBe(70);
    expect(goalTarget("above 30 ng/mL in 12 weeks", "up", 22)).toBe(30);
    expect(goalTarget("1,200 steps more", "up", null)).toBe(1200);
  });

  it("reads a band by the edge the direction walks to", () => {
    expect(goalTarget("70-100 mg/dL", "down", 131)).toBe(100);
    expect(goalTarget("30–50 ng/mL", "up", 22)).toBe(30);
    expect(goalTarget("131 - 118", "down", 131)).toBeNull();
  });

  it("writes no goal for words or for numbers it cannot tell apart", () => {
    expect(goalTarget("lower", "down", 131)).toBeNull();
    expect(goalTarget("into the optimal band", "down", 131)).toBeNull();
    expect(goalTarget("100 or 110 mg/dL", "down", 131)).toBeNull();
    expect(goalTarget("", "down", 131)).toBeNull();
  });

  it("never reads a marker name, a time or a date as the target", () => {
    expect(goalTarget("vitamin B12 above 400 pg/mL", "up", 250)).toBe(400);
    expect(goalTarget("under 100 by 2026-12-01", "down", 131)).toBe(100);
  });
});

describe("goalTarget never reads a size of change as the target", () => {
  const cases: [string, "up" | "down", number | null, number | null][] = [
    ["down by 15-20 mg/dL", "down", 131, 116],
    ["raise by 5-10 mg/dL", "up", 40, 45],
    ["a 10-20% drop", "down", 131, null],
    ["about 10% lower", "down", 131, null],
    ["13 mg/dL lower", "down", 131, null],
    ["≥20% reduction", "down", 131, null],
    ["50% reduction", "down", 131, null],
    ["10% rise", "up", 40, null],
    ["20-45 %", "up", 30, 20],
    ["remains <5.4%", "down", 5.2, 5.4],
    ["<5.7%", "down", 5.9, 5.7],
    ["transferrin saturation above 20% by 2026-11-19", "up", 15, 20],
    ["Lower LDL to under 100 mg/dL", "down", 131, 100],
    ["Increase vitamin D to 40-60 ng/mL", "up", 22, 40],
    ["down 10%", "down", 131, null],
    ["lower by 10% to 118", "down", 131, null],
    ["Reduce below 100 mg/dL", "down", 131, 100],
    ["Drop under 100 mg/dL", "down", 131, 100],
    ["Raise above 30 ng/mL", "up", 22, 30],
    ["Increase over 40 ng/mL", "up", 22, 40],
    ["Lower to ≤100 by 10 Feb", "down", 131, 100],
    ["LDL below 100 by Feb 10", "down", 131, 100],
    ["lower to 100 by 1 Mar 2027", "down", 131, 100],
    ["LDL under 100 by 2027", "down", 131, 100],
    ["LDL under 100 by 10/02/2027", "down", 131, 100],
    ["LDL below 100 by Feb 2027", "down", 131, 100],
    ["LDL below 100 by end of 2027", "down", 131, 100],
    ["down 200 mg/dL", "down", 131, null],
    ["lower by about 13 mg/dL", "down", 131, 118],
    ["A 7-day average under 100", "down", 110, 100],
    ["2-hour OGTT under 140", "down", 160, 140],
    ["25-OH vitamin D result on file", "up", 20, null],
    ["131 to about 118 mg/dL", "down", 131, 118],
    ["70-100 mg/dL", "down", 120, 100],
    ["-13", "down", 131, 118],
  ];
  for (const [expect_, dir, latest, want] of cases)
    it(expect_, () => expect(goalTarget(expect_, dir, latest)).toBe(want));
});

