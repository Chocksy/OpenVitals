import { describe, expect, it } from "vitest";
import { rangeScale } from "./range-scale";

/**
 * Phase 26 item 9. TPO antibodies 320 against an optimal band of 0–34 painted
 * the marker at the far right with the band crushed into the first tenth of
 * the track, and no number printed anywhere.
 */
describe("rangeScale", () => {
  const far = () =>
    rangeScale({
      marks: [320, 0, 34],
      bandLow: 0,
      bandHigh: 34,
    });

  it("keeps the band readable when one value is far outside it", () => {
    const s = far();
    // 0..102 is linear, so the top of the band is not at the far left.
    expect(s.at(34)).toBeGreaterThan(20);
    expect(s.at(34)).toBeLessThan(50);
  });

  it("puts the far value in the compressed tail, not off the end", () => {
    const s = far();
    expect(s.at(320)).toBeLessThanOrEqual(100);
    expect(s.at(320)).toBeGreaterThan(s.breakHigh!);
  });

  it("breaks the axis where the compression starts", () => {
    const s = far();
    expect(s.breakHigh).toBe(86);
    expect(s.breakLow).toBeNull();
  });

  it("never breaks the axis when everything fits", () => {
    const s = rangeScale({ marks: [40, 20, 60], bandLow: 20, bandHigh: 60 });
    expect(s.breakHigh).toBeNull();
    expect(s.breakLow).toBeNull();
    // 40 is the middle of a 20-60 band with even padding: the middle of the bar.
    expect(s.at(40)).toBeCloseTo(50, 5);
  });

  it("compresses the low side the same way", () => {
    const s = rangeScale({ marks: [2, 40, 45], bandLow: 40, bandHigh: 45 });
    expect(s.breakLow).toBe(14);
    expect(s.at(2)).toBeLessThan(14);
    expect(s.at(40)).toBeGreaterThan(14);
  });

  it("keeps the order of every mark it is given", () => {
    const s = far();
    const marks = [0, 10, 34, 68, 102, 200, 320];
    const drawn = marks.map(s.at);
    for (let i = 1; i < drawn.length; i++)
      expect(drawn[i]!).toBeGreaterThan(drawn[i - 1]!);
  });

  it("stays inside the track", () => {
    const s = far();
    for (const v of [-50, 0, 34, 320, 9999]) {
      expect(s.at(v)).toBeGreaterThanOrEqual(0);
      expect(s.at(v)).toBeLessThanOrEqual(100);
    }
  });

  it("falls back to one straight line when there is no band", () => {
    const s = rangeScale({ marks: [5, 9], bandLow: null, bandHigh: null });
    expect(s.breakHigh).toBeNull();
    expect(s.at(5)).toBeCloseTo(9.68, 1);
    expect(s.at(9)).toBeCloseTo(90.32, 1);
  });

  it("survives a band with one open side", () => {
    const s = rangeScale({ marks: [320, 34], bandLow: null, bandHigh: 34 });
    expect(Number.isFinite(s.at(320))).toBe(true);
    expect(s.at(34)).toBeLessThan(s.at(320));
  });
});

describe("the tail keeps a little air", () => {
  it("never paints the far value hard against the edge", () => {
    const s = rangeScale({ marks: [320, 0, 34], bandLow: 0, bandHigh: 34 });
    expect(s.at(320)).toBeLessThan(99.5);
    expect(s.at(320)).toBeGreaterThan(s.breakHigh!);
  });

  it("and does the same at the low end", () => {
    const s = rangeScale({ marks: [2, 40, 45], bandLow: 40, bandHigh: 45 });
    expect(s.at(2)).toBeGreaterThan(0.5);
    expect(s.at(2)).toBeLessThan(s.breakLow!);
  });
});
