import { describe, expect, it } from "vitest";
import { chartDomain, type ChartPoint } from "./chart-domain";

/** 45 glucose draws, the shape the spear card hands the chart. */
const glucose: ChartPoint[] = Array.from({ length: 45 }, (_, i) => ({
  date: new Date(Date.UTC(2016, 0, 1) + i * 60 * 86_400_000)
    .toISOString()
    .slice(0, 10),
  value: 88 + (i % 9) * 3,
}));

const bands = {
  referenceRangeLow: 74,
  referenceRangeHigh: 106,
  optimalRangeLow: 72,
  optimalRangeHigh: 85,
};

describe("chartDomain", () => {
  it("draws the spear card's own series", () => {
    const d = chartDomain(glucose, bands);
    expect(d.drawable).toBe(true);
    expect(d.points).toHaveLength(45);
    expect(Number.isFinite(d.yMin)).toBe(true);
    expect(Number.isFinite(d.yMax)).toBe(true);
    expect(d.yMin).toBeLessThan(d.yMax);
  });

  it("keeps every band edge inside the domain", () => {
    const d = chartDomain(glucose, bands);
    expect(d.yMin).toBeLessThanOrEqual(72);
    expect(d.yMax).toBeGreaterThanOrEqual(112);
  });

  it("says so when there is nothing to draw", () => {
    const d = chartDomain([], bands);
    expect(d.drawable).toBe(false);
    expect(d.points).toEqual([]);
    expect(d.yMin).toBeLessThan(d.yMax);
  });

  it("drops a bad reading instead of poisoning the domain", () => {
    const d = chartDomain(
      [
        { date: "2026-01-01", value: 90 },
        { date: "2026-02-01", value: Number.NaN },
        { date: "2026-03-01", value: 100 },
      ],
      {},
    );
    expect(d.points.map((p) => p.value)).toEqual([90, 100]);
    expect(Number.isNaN(d.yMin)).toBe(false);
    expect(Number.isNaN(d.yMax)).toBe(false);
  });

  it("drops a point with no date", () => {
    const d = chartDomain([
      { date: "", value: 5 },
      { date: "2026-03-01", value: 7 },
    ]);
    expect(d.points).toHaveLength(1);
  });

  it("gives a flat series room to breathe", () => {
    const d = chartDomain([
      { date: "2026-01-01", value: 5 },
      { date: "2026-02-01", value: 5 },
    ]);
    expect(d.yMin).toBe(4);
    expect(d.yMax).toBe(6);
  });

  it("ignores a null band", () => {
    const d = chartDomain([{ date: "2026-01-01", value: 10 }], {
      referenceRangeLow: null,
      goalHigh: null,
    });
    expect(d.drawable).toBe(true);
    expect(d.yMin).toBe(9);
  });
});
