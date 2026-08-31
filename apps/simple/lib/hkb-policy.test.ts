import { describe, it, expect } from "vitest";
import {
  decide,
  disagree,
  mintable,
  numbersIn,
  quoted,
  statusOf,
  unitFits,
  type PolicyInput,
} from "./hkb-policy";

/** A row nothing is wrong with, so each test can break exactly one thing. */
const clean: PolicyInput = {
  conditionId: "hypothyroidism",
  featureId: "metric:tsh",
  featureUnit: "mIU/L",
  targetUnit: "mIU/L",
  conditionOn: { above: 4.5 },
  lrPos: 3.8,
  lrNeg: 0.21,
  grade: "A",
  quote: "A TSH above 4.5 mIU/L gave a positive likelihood ratio of 3.8.",
  numbers: [3.8, 0.21, null, null, 4.5],
  conditionInCatalog: true,
};

describe("the helpers", () => {
  it("reads every number out of a span, comma decimals included", () => {
    expect(numbersIn("sensitivity 0,93 and 85% of 1240")).toEqual([
      0.93, 85, 1240,
    ]);
    expect(numbersIn("no numbers here")).toEqual([]);
  });

  it("finds a fraction printed as a percentage and back", () => {
    expect(quoted(0.93, "a sensitivity of 93%")).toBe(true);
    expect(quoted(93, "a sensitivity of 0.93")).toBe(true);
    expect(quoted(0.93, "a sensitivity of 0.71")).toBe(false);
  });

  it("calls two LRs apart only past 3x", () => {
    expect(disagree([3, 9])).toBe(false);
    expect(disagree([3, 9.1])).toBe(true);
    expect(disagree([9.1, 3])).toBe(true);
    expect(disagree([5])).toBe(false);
    expect(disagree([])).toBe(false);
  });

  it("needs a name before it will mint, and nothing else", () => {
    expect(mintable({ ...clean, featureName: "EmA IgA" })).toBe(true);
    // a paper that never printed the unit still named the marker
    expect(
      mintable({ ...clean, featureName: "EmA IgA", featureUnit: " " }),
    ).toBe(true);
    expect(mintable({ ...clean, featureName: "" })).toBe(false);
    expect(mintable({ ...clean, featureName: undefined })).toBe(false);
  });

  it("only calls a unit convertible when a factor exists", () => {
    expect(
      unitFits({ ...clean, featureUnit: "mg/L", targetUnit: "mg/dL" }),
    ).toBe(true);
    expect(
      unitFits({ ...clean, featureUnit: "mIU/L", targetUnit: "mg/dL" }),
    ).toBe(false);
    expect(unitFits({ ...clean, featureUnit: null, targetUnit: "mg/dL" })).toBe(
      true,
    );
  });
});

describe("decide", () => {
  it("accepts a clean row", () => {
    expect(decide(clean)).toBe("accepted");
  });

  it("rejects a retracted paper", () => {
    expect(decide({ ...clean, retracted: true })).toBe("rejected");
  });

  it("rejects a condition that is not in the catalog", () => {
    expect(decide({ ...clean, conditionInCatalog: false })).toBe("rejected");
  });

  it("rejects a feature it can neither map nor mint", () => {
    expect(decide({ ...clean, featureId: null })).toBe("rejected");
    expect(
      decide({
        ...clean,
        featureId: null,
        featureName: "Anti-endomysial antibodies",
        featureUnit: "U/mL",
        targetUnit: null,
      }),
    ).toBe("accepted");
  });

  it("holds a unit that will not convert to the feature's own", () => {
    // Held, not rejected: the finding may be real and the row is kept for a
    // human, but it does not score until somebody says what the number means.
    expect(
      decide({ ...clean, featureUnit: "ng/mL", targetUnit: "mIU/L" }),
    ).toBe("held");
    expect(statusOf(decide({ ...clean, featureUnit: "ng/mL", targetUnit: "mIU/L" })))
      .toEqual({ status: "review", needsLook: true });
  });

  it("holds a threshold the marker could never take", () => {
    // 6.3 mmol/L filed against a mg/dL glucose feature: every living adult.
    expect(
      decide({
        ...clean,
        featureId: "metric:glucose",
        conditionOn: { above: 6.3 },
        numbers: [6.3],
        quote: "an optimal cutoff of 6.3 mmol/L yielding 73% sensitivity",
      }),
    ).toBe("held");
    // The same paper's number, converted, is an ordinary accepted row.
    expect(
      decide({
        ...clean,
        featureId: "metric:glucose",
        conditionOn: { above: 113 },
        numbers: [6.3],
        quote: "an optimal cutoff of 6.3 mmol/L yielding 73% sensitivity",
      }),
    ).toBe("accepted");
  });

  it("rejects a quote with no number in it", () => {
    expect(
      decide({ ...clean, quote: "TSH was raised in the affected group." }),
    ).toBe("rejected");
  });

  it("rejects a quote whose numbers are not the ones claimed", () => {
    expect(
      decide({
        ...clean,
        quote: "The cohort followed 812 adults for six years.",
      }),
    ).toBe("rejected");
  });

  it("skips the number check when the caller has no list", () => {
    expect(
      decide({
        ...clean,
        numbers: undefined,
        quote: "The cohort followed 812 adults for six years.",
      }),
    ).toBe("accepted");
  });

  it("flags two verified rows that disagree by more than 3x", () => {
    expect(decide({ ...clean, peers: [0.9] })).toBe("review");
    expect(decide({ ...clean, peers: [2.5] })).toBe("accepted");
  });

  it("flags an extreme LR outside a meta-analysis, and lets one inside", () => {
    const wild = { ...clean, lrPos: 140, numbers: [140], quote: "LR+ 140." };
    expect(decide({ ...wild, grade: "B" })).toBe("review");
    expect(decide({ ...wild, grade: "A" })).toBe("accepted");
    expect(
      decide({
        ...clean,
        grade: "C",
        lrNeg: 0.005,
        numbers: [3.8],
      }),
    ).toBe("review");
  });

  it("turns a decision into a row status", () => {
    expect(statusOf("accepted")).toEqual({
      status: "accepted",
      needsLook: false,
    });
    expect(statusOf("review")).toEqual({
      status: "accepted",
      needsLook: true,
    });
    expect(statusOf("rejected")).toEqual({
      status: "rejected",
      needsLook: false,
    });
  });
});
