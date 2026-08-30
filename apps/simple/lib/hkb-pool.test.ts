import { describe, it, expect } from "vitest";
import { poolMembers, shrunk, sizeOf, type PoolMember } from "./hkb-pool";

const member = (over: Partial<PoolMember> = {}): PoolMember => ({
  id: "res_a",
  lrPos: 5,
  lrNeg: null,
  grade: "A",
  source: "Smith 2020 Lancet",
  ...over,
});

describe("the grade shrink", () => {
  it("pulls a C toward 1 from either side and leaves A and B alone", () => {
    expect(shrunk(20, "C")).toBeCloseTo(4.47, 2);
    expect(shrunk(0.2, "C")).toBeCloseTo(0.45, 2);
    expect(shrunk(20, "A")).toBe(20);
    expect(shrunk(0.2, "B")).toBe(0.2);
  });
});

describe("poolMembers", () => {
  it("averages two A papers in log space", () => {
    const pooled = poolMembers([
      member({ id: "a", lrPos: 5 }),
      member({ id: "b", lrPos: 7 }),
    ])!;
    expect(pooled.lrPos).toBeCloseTo(5.92, 2);
    expect(pooled.grade).toBe("A");
    expect(pooled.sources.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("keeps an A at 5 near 5 when a C claims 20", () => {
    const pooled = poolMembers([
      member({ id: "a", lrPos: 5, grade: "A" }),
      member({ id: "c", lrPos: 20, grade: "C" }),
    ])!;
    expect(pooled.lrPos).toBeGreaterThan(4.5);
    expect(pooled.lrPos).toBeLessThan(5.5);
    expect(pooled.grade).toBe("A");
  });

  it("lets the bigger study of the same grade pull harder", () => {
    const small = poolMembers([
      member({ id: "a", lrPos: 2, n: 20 }),
      member({ id: "b", lrPos: 8, n: 20 }),
    ])!;
    const big = poolMembers([
      member({ id: "a", lrPos: 2, n: 20 }),
      member({ id: "b", lrPos: 8, n: 20000 }),
    ])!;
    expect(big.lrPos).toBeGreaterThan(small.lrPos);
  });

  it("shrinks a lone C row exactly once", () => {
    expect(poolMembers([member({ lrPos: 9, grade: "C" })])!.lrPos).toBe(3);
  });

  it("pools the negative ratios only over the rows that carry one", () => {
    const pooled = poolMembers([
      member({ id: "a", lrPos: 5, lrNeg: 0.2 }),
      member({ id: "b", lrPos: 7, lrNeg: null }),
    ])!;
    expect(pooled.lrNeg).toBe(0.2);
  });

  it("takes the best grade of the papers behind it", () => {
    expect(
      poolMembers([
        member({ id: "c", grade: "C" }),
        member({ id: "b", grade: "B" }),
      ])!.grade,
    ).toBe("B");
  });

  it("says nothing about nothing, and about rows that cannot vote", () => {
    expect(poolMembers([])).toBeNull();
    expect(poolMembers([member({ grade: "D" })])).toBeNull();
    expect(poolMembers([member({ lrPos: 0 })])).toBeNull();
  });
});

describe("sizeOf", () => {
  it("reads the study size back out of a source line", () => {
    expect(sizeOf("Smith 2020 Lancet; doi:10.1/x; n = 1,240; quote: ...")).toBe(
      1240,
    );
    expect(sizeOf("Smith 2020 Lancet; doi:10.1/x; quote: ...")).toBeNull();
    expect(sizeOf(null)).toBeNull();
  });
});
