/**
 * The projection arithmetic, offline: additive with grade shrink, bounded by
 * physiology, scaled by adherence, and a band that widens as the evidence gets
 * weaker.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CHANGE,
  addWeeks,
  betterDirection,
  durationWeeks,
  parseEffect,
  project,
  projectionLine,
  verdictOf,
  type AdoptedAction,
  type EffectSource,
} from "./projection";

const effect = (over: Partial<EffectSource> = {}): EffectSource => ({
  id: "int_x",
  name: "cut added sugar",
  outcomeFeatureId: "metric:hba1c",
  effect: "-0.30 %",
  direction: "down",
  grade: "A",
  duration: "12 weeks",
  source: "a paper",
  ...over,
});

const action = (over: Partial<AdoptedAction> = {}): AdoptedAction => ({
  itemId: "1",
  text: "cut added sugar",
  adoptedAt: "2026-08-31",
  effect: effect(),
  ...over,
});

const base = { code: "hba1c", unit: "%", from: 6, fromDate: "2026-08-31" };

describe("parseEffect", () => {
  it("reads the point estimate and takes its sign from the direction", () => {
    expect(parseEffect("MD -0.50, 95% CI -0.73 to -0.26", "down")).toBe(-0.5);
    expect(parseEffect("~0.3-0.5%", "down")).toBe(-0.3);
    expect(parseEffect("MD 0.74 kg/m2", "up")).toBe(0.74);
    expect(parseEffect("no number here", "down")).toBeNull();
    expect(parseEffect("-0.4", "none")).toBeNull();
  });

  it("reads a duration in whatever unit the paper used", () => {
    expect(durationWeeks("12 weeks")).toBe(12);
    expect(durationWeeks("6 months")).toBeCloseTo(26.1, 1);
    expect(durationWeeks("14 days")).toBe(2);
    expect(durationWeeks(null)).toBeNull();
  });
});

describe("project", () => {
  it("adds the contributions and shrinks the C-graded one by half", () => {
    const p = project({
      ...base,
      actions: [
        action(),
        action({
          itemId: "2",
          text: "walk after meals",
          effect: effect({ name: "walk after meals", effect: "-0.20 %", grade: "C" }),
        }),
      ],
    });
    expect(p.contributions.map((c) => c.delta)).toEqual([-0.3, -0.1]);
    expect(p.expected).toBe(5.6);
    expect(p.retestAt).toBe(addWeeks("2026-08-31", 12));
  });

  it("never counts a D or E grade", () => {
    const p = project({
      ...base,
      actions: [action({ effect: effect({ grade: "D" }) })],
    });
    expect(p.contributions).toEqual([]);
    expect(p.expected).toBe(6);
  });

  it("scales every contribution by adherence", () => {
    const full = project({ ...base, actions: [action()] });
    const half = project({ ...base, actions: [action({ adherence: 0.5 })] });
    expect(half.contributions[0]!.delta).toBe(full.contributions[0]!.delta / 2);
    expect(half.assumptions.join(" ")).toContain("50 % adherence");
  });

  it("bounds the total by what the marker can physiologically do", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      action({ itemId: String(i), effect: effect({ effect: "-0.5 %" }) }),
    );
    const p = project({ ...base, actions: many });
    expect(p.from - p.expected).toBeLessThanOrEqual(MAX_CHANGE.hba1c!);
    expect(p.assumptions.join(" ")).toContain("capped");
  });

  it("widens the band as the evidence gets weaker", () => {
    const strong = project({ ...base, actions: [action()] });
    const weak = project({
      ...base,
      actions: [action({ effect: effect({ grade: "C", effect: "-0.6 %" }) })],
    });
    expect(weak.high - weak.low).toBeGreaterThan(strong.high - strong.low);
  });

  it("stops at the optimal band, because no trial measured inside it", () => {
    const p = project({
      ...base,
      from: 5.6,
      optimalLow: 4.8,
      optimalHigh: 5.4,
      actions: [action(), action({ itemId: "2" }), action({ itemId: "3" })],
    });
    expect(p.expected).toBe(4.8);
    expect(p.assumptions.join(" ")).toContain("stopped at the optimal band");
  });

  it("projects nothing at all for somebody already inside the band", () => {
    const p = project({
      ...base,
      from: 5,
      optimalLow: 4.8,
      optimalHigh: 5.4,
      actions: [action()],
    });
    expect(p.contributions).toEqual([]);
    expect(p.expected).toBe(5);
    expect(p.assumptions.join(" ")).toContain("already inside its optimal band");
  });

  it("names the pairs it has no effect size for", () => {
    const p = project({
      ...base,
      actions: [action({ text: "eat more protein", effect: null })],
    });
    expect(p.gaps).toEqual(["eat more protein"]);
    expect(p.assumptions.join(" ")).toContain("no effect size on file");
    expect(projectionLine(p)).toContain("nothing adopted that moves it");
  });

  it("only counts an intervention aimed at this marker", () => {
    const p = project({
      ...base,
      actions: [action({ effect: effect({ outcomeFeatureId: "metric:ldl_cholesterol" }) })],
    });
    expect(p.contributions).toEqual([]);
  });

  it("delivers less of a long trial over a short horizon", () => {
    const p = project({
      ...base,
      horizonWeeks: 6,
      actions: [action({ effect: effect({ duration: "12 weeks" }) })],
    });
    expect(p.contributions[0]!.delta).toBe(-0.15);
  });
});

describe("verdictOf", () => {
  const p = project({ ...base, actions: [action()] });

  it("calls a value inside the band as expected", () => {
    expect(verdictOf(p, p.expected, "lower")).toBe("as_expected");
    expect(verdictOf(p, p.low, "lower")).toBe("as_expected");
  });

  it("reads better and worse in the marker's own direction", () => {
    expect(verdictOf(p, p.low - 0.3, "lower")).toBe("better");
    expect(verdictOf(p, p.high + 0.3, "lower")).toBe("worse");
    // A ferritin under the band is the disappointing one.
    expect(verdictOf(p, p.low - 0.3, "higher")).toBe("worse");
  });

  it("knows which way is better from the optimal band", () => {
    expect(betterDirection("phosphate", null, 5.7)).toBe("lower");
    expect(betterDirection("phosphate", 50, null)).toBe("higher");
    expect(betterDirection("phosphate", 0.4, 2.5)).toBe("middle");
    // A band at both ends says nothing; the marker itself does.
    expect(betterDirection("hba1c", 4.8, 5.4)).toBe("lower");
    expect(betterDirection("ferritin", 30, 200)).toBe("higher");
  });
});
