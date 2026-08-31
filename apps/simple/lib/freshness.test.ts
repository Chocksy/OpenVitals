/**
 * Staleness: the class a condition's rows put it in, how overdue that makes it,
 * and the order the monthly run reads them in.
 */
import { describe, expect, it } from "vitest";
import {
  conditionClass,
  freshnessOf,
  pickConditions,
  REFRESH_DAYS,
  staleness,
  type ConditionFreshness,
} from "./freshness";

const TODAY = "2026-09-01";
const contested = new Set(["pcos", "sibo"]);

const rowsOf = (...grades: string[]) => grades.map((grade) => ({ grade }));

describe("conditionClass", () => {
  it("puts a contested id first whatever its rows say", () => {
    expect(conditionClass(rowsOf("A", "A", "A"), contested, "pcos")).toBe(
      "contested",
    );
    expect(conditionClass([], contested, "sibo")).toBe("contested");
  });

  it("takes the most volatile class present", () => {
    expect(conditionClass(rowsOf("A", "B", "D"), contested, "nafld")).toBe(
      "horizon",
    );
    expect(conditionClass(rowsOf("A", "E"), contested, "nafld")).toBe(
      "horizon",
    );
    expect(
      conditionClass(
        [{ grade: "A", sources: ["a", "b"] }, { grade: "B" }],
        contested,
        "nafld",
      ),
    ).toBe("pooled");
    expect(conditionClass(rowsOf("A", "B", "C"), contested, "nafld")).toBe(
      "guideline",
    );
  });

  it("does not call one paper a pooled effect", () => {
    expect(
      conditionClass([{ grade: "A", sources: ["only one"] }], contested, "ckd"),
    ).toBe("guideline");
  });
});

describe("staleness", () => {
  it("is days since the look over the shelf life of the class", () => {
    expect(staleness("2026-06-03", "horizon", TODAY)).toBeCloseTo(90 / 90, 5);
    expect(staleness("2026-03-05", "pooled", TODAY)).toBeCloseTo(180 / 365, 2);
  });

  it("calls a condition nobody has ever looked at infinitely stale", () => {
    expect(staleness(null, "pooled", TODAY)).toBe(Infinity);
  });

  it("keeps a contested condition permanently overdue", () => {
    expect(REFRESH_DAYS.contested).toBe(0);
    expect(staleness(TODAY, "contested", TODAY)).toBe(Infinity);
  });

  it("reads a timestamp as well as a day", () => {
    expect(staleness("2026-06-03T11:22:33.000Z", "horizon", TODAY)).toBeCloseTo(
      1,
      5,
    );
  });
});

describe("freshnessOf", () => {
  it("calls a condition with fewer than three rows infinitely stale", () => {
    const thin = freshnessOf(
      { id: "gilbert", name: "Gilbert" },
      rowsOf("A", "B"),
      contested,
      TODAY,
      TODAY,
    );
    expect(thin.score).toBe(Infinity);
    expect(thin.rows).toBe(2);
  });

  it("resets the score when a run has just covered it", () => {
    const before = freshnessOf(
      { id: "ckd", name: "CKD" },
      rowsOf("A", "B", "C"),
      contested,
      "2020-01-01",
      TODAY,
    );
    const after = freshnessOf(
      { id: "ckd", name: "CKD" },
      rowsOf("A", "B", "C"),
      contested,
      TODAY,
      TODAY,
    );
    expect(before.score).toBeGreaterThan(1);
    expect(after.score).toBe(0);
  });
});

describe("pickConditions", () => {
  const fresh = (
    id: string,
    cls: ConditionFreshness["cls"],
    score: number,
  ): ConditionFreshness => ({
    id,
    name: id,
    cls,
    rows: 5,
    lastLookedAt: TODAY,
    score,
  });

  it("takes contested first, then the stalest", () => {
    const picked = pickConditions(
      [
        fresh("ckd", "pooled", 0.2),
        fresh("nafld", "horizon", 3),
        fresh("pcos", "contested", Infinity),
        fresh("hashimoto", "guideline", 1.4),
      ],
      3,
    );
    expect(picked.map((c) => c.id)).toEqual(["pcos", "nafld", "hashimoto"]);
  });

  it("breaks a tie on id, so two runs pick the same list", () => {
    const picked = pickConditions(
      [fresh("zeta", "pooled", 1), fresh("alpha", "pooled", 1)],
      2,
    );
    expect(picked.map((c) => c.id)).toEqual(["alpha", "zeta"]);
  });

  it("dedupes and never returns more than asked", () => {
    const picked = pickConditions(
      [fresh("ckd", "pooled", 2), fresh("ckd", "pooled", 9)],
      5,
    );
    expect(picked.map((c) => c.id)).toEqual(["ckd"]);
    expect(pickConditions([fresh("ckd", "pooled", 2)], 0)).toEqual([]);
  });

  it("puts two infinities in class order, contested over thin", () => {
    const picked = pickConditions(
      [
        { ...fresh("gilbert", "guideline", Infinity), rows: 1 },
        fresh("sibo", "contested", Infinity),
      ],
      2,
    );
    expect(picked.map((c) => c.id)).toEqual(["sibo", "gilbert"]);
  });
});
