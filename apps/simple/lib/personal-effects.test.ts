/**
 * The personal multiplier: shrinkage toward the literature, the clamp, the
 * floor of two outcomes, and adherence weighting.
 */
import { describe, expect, it } from "vitest";
import {
  MULTIPLIER_CLAMP,
  pairKey,
  personalLine,
  personalMultiplier,
  personalMultipliers,
  type PersonalOutcome,
} from "./personal-effects";

const ran = (times: number, adherence?: number): PersonalOutcome => ({
  predicted: -0.2,
  observed: -0.2 * times,
  ...(adherence == null ? {} : { adherence }),
});

describe("personalMultiplier", () => {
  it("says nothing under two outcomes", () => {
    expect(personalMultiplier([])).toBeNull();
    expect(personalMultiplier([ran(2)])).toBeNull();
  });

  it("shrinks toward 1, and shrinks less as the outcomes pile up", () => {
    // r = 2: at n=2 it moves half the way (1.5), at n=5 five sevenths (1.71).
    const two = personalMultiplier([ran(2), ran(2)])!;
    const five = personalMultiplier(Array.from({ length: 5 }, () => ran(2)))!;
    expect(two).toEqual({ times: 1.5, n: 2 });
    expect(five.times).toBeCloseTo(1.71, 2);
    expect(five.n).toBe(5);
    expect(five.times).toBeGreaterThan(two.times);
  });

  it("works the same way for a response that undershot", () => {
    const half = personalMultiplier([ran(0.5), ran(0.5)])!;
    expect(half.times).toBe(0.75);
  });

  it("clamps a wild pair of cycles", () => {
    const wild = personalMultiplier([ran(40), ran(40)])!;
    expect(wild.times).toBe(MULTIPLIER_CLAMP[1]);
    const backwards = personalMultiplier([ran(-30), ran(-30)])!;
    expect(backwards.times).toBe(MULTIPLIER_CLAMP[0]);
  });

  it("weighs each cycle by the adherence it was done at", () => {
    // A full-adherence 1x cycle and a barely-done 3x cycle: the mean leans on
    // the one that actually happened.
    const weighted = personalMultiplier([ran(1, 1), ran(3, 0.1)])!;
    const even = personalMultiplier([ran(1, 1), ran(3, 1)])!;
    expect(weighted.times).toBeLessThan(even.times);
    expect(weighted.times).toBeCloseTo(1.09, 2);
    expect(even.times).toBe(1.5);
  });

  it("drops a prediction of zero rather than dividing by it", () => {
    expect(
      personalMultiplier([{ predicted: 0, observed: -0.4 }, ran(2)]),
    ).toBeNull();
  });

  it("returns nothing when nothing was adhered to at all", () => {
    expect(personalMultiplier([ran(2, 0), ran(2, 0)])).toBeNull();
  });
});

describe("personalMultipliers", () => {
  it("groups by pair and drops the thin ones", () => {
    const out = personalMultipliers([
      { pair: "cut added sugar -> hba1c", ...ran(2) },
      { pair: "cut added sugar -> hba1c", ...ran(2) },
      { pair: "walk after meals -> hba1c", ...ran(3) },
    ]);
    expect(Object.keys(out)).toEqual(["cut added sugar -> hba1c"]);
    expect(out["cut added sugar -> hba1c"]).toEqual({ times: 1.5, n: 2 });
  });

  it("keys on the same string the resolver writes", () => {
    expect(pairKey("cut added sugar", "hba1c")).toBe(
      "cut added sugar -> hba1c",
    );
  });
});

describe("personalLine", () => {
  it("says how many cycles, which way, and that it is n=1 evidence", () => {
    const line = personalLine("cut added sugar", { times: 1.6, n: 2 });
    expect(line).toContain("your own last 2 responses");
    expect(line).toContain("1.6×");
    expect(line).toContain("n=1 evidence");
    expect(line).toContain("weighs nothing outside your projections");
  });
});
