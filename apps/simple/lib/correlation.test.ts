import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import {
  CORRELATION_GROUPS,
  CORR_DAMP,
  correlationGroupOf,
  scoreHypotheses,
  type Catalog,
  type Hypothesis,
} from "./hypotheses";

const value = (v: number): LatestValue => ({
  value: v,
  unit: null,
  date: "2026-08-01",
  status: "amber",
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
});

const input = (latest: Record<string, LatestValue>): ModelInput => ({
  today: "2026-08-30",
  profile: {},
  sex: "male",
  age: 45,
  latest,
  derived: {},
});

/** One toy condition, so the arithmetic is visible and nothing else moves. */
const toy = (evidence: Hypothesis["evidence"]): Catalog => [
  {
    id: "toy",
    name: "Toy",
    summary: "",
    management: "",
    priors: { base: 0.1, modifiers: [] },
    evidence,
    discriminators: [],
    lenses: { lifespan: { w: 1, grade: "A" } },
  },
];

const rule = (
  id: string,
  metric: string,
  above: number,
  lr: number,
): Hypothesis["evidence"][number] => ({
  id,
  input: { metric },
  when: { above },
  lr,
  grade: "A",
  source: "toy",
});

const odds = (p: number) => p / (1 - p);
// `score` is rounded to three decimals before it leaves the engine, so the
// odds rebuilt from it are only good to about two.
const PLACES = 2;
const PRIOR_ODDS = odds(0.1);

describe("correlationGroupOf", () => {
  it("groups the panels the spec names", () => {
    expect(correlationGroupOf({ metric: "glucose" })).toBe("glycaemia");
    expect(correlationGroupOf({ metric: "hba1c" })).toBe("glycaemia");
    expect(correlationGroupOf({ derived: "homaIr" })).toBe("glycaemia");
    expect(correlationGroupOf({ metric: "ferritin" })).toBe("iron_panel");
    expect(correlationGroupOf({ metric: "tsh" })).toBe("thyroid_axis");
    expect(correlationGroupOf({ metric: "bp_systolic" })).toBe("bp");
    expect(correlationGroupOf({ metric: "alt" })).toBe("liver_enzymes");
    expect(correlationGroupOf({ metric: "apolipoprotein_b" })).toBe(
      "lipid_panel",
    );
  });

  it("puts every symptom in one group and leaves the other answers alone", () => {
    // Phase 19: four ways of saying "I feel slow" are one fact, so every
    // symptom is one group and the whole interview is capped.
    expect(correlationGroupOf({ fact: "sym_energy" })).toBe("symptoms");
    expect(correlationGroupOf({ fact: "sleep_snoring" })).toBe("symptoms");
    // An answer that is not a symptom stays its own fact.
    expect(correlationGroupOf({ fact: "family_history" })).toBeUndefined();
    expect(correlationGroupOf({ hypothesis: "nafld" })).toBeUndefined();
    expect(CORRELATION_GROUPS.sym_energy).toBeUndefined();
  });

  it("lets a rule name its own group and beat the table", () => {
    const catalog = toy([
      { ...rule("a", "glucose", 100, 2), correlationGroup: "made_up" },
      rule("b", "hba1c", 5.6, 4),
    ]);
    const r = scoreHypotheses(
      input({ glucose: value(126), hba1c: value(6.6) }),
      {
        catalog,
      },
    )[0]!;
    // Different groups now, so nothing is damped.
    expect(r.correlated).toHaveLength(0);
  });
});

describe("the glycaemia guard", () => {
  const catalog = toy([
    rule("glucose_high", "glucose", 100, 2),
    rule("hba1c_high", "hba1c", 5.6, 4),
  ]);

  const both = scoreHypotheses(
    input({ glucose: value(126), hba1c: value(6.6) }),
    { catalog },
  )[0]!;
  const onlyGlucose = scoreHypotheses(input({ glucose: value(126) }), {
    catalog,
  })[0]!;
  const onlyHba1c = scoreHypotheses(input({ hba1c: value(6.6) }), {
    catalog,
  })[0]!;

  it("counts less than the naive product and more than either alone", () => {
    const naive = PRIOR_ODDS * 2 * 4;
    expect(odds(both.score)).toBeLessThan(naive);
    expect(both.score).toBeGreaterThan(onlyGlucose.score);
    expect(both.score).toBeGreaterThan(onlyHba1c.score);
  });

  it("counts the strongest in full and the other at lr ** CORR_DAMP", () => {
    expect(odds(both.score)).toBeCloseTo(
      PRIOR_ODDS * 4 * 2 ** CORR_DAMP,
      PLACES,
    );
  });

  it("says which rule was damped, and by which", () => {
    expect(both.correlated).toEqual([
      {
        rule: "glucose_high",
        input: "glucose",
        group: "glycaemia",
        lr: 2,
        counted: 1.23,
        with: "hba1c_high",
      },
    ]);
  });

  it("prints the damped number on the evidence line", () => {
    const line = both.for.find((f) => f.rule === "glucose_high")!;
    expect(line.lr).toBe(2);
    expect(line.discounted).toBe(1.23);
  });
});

describe("two independent groups", () => {
  const catalog = toy([
    rule("glucose_high", "glucose", 100, 2),
    rule("tsh_high", "tsh", 4.5, 3),
  ]);

  it("multiply unchanged", () => {
    const r = scoreHypotheses(input({ glucose: value(126), tsh: value(6) }), {
      catalog,
    })[0]!;
    expect(odds(r.score)).toBeCloseTo(PRIOR_ODDS * 2 * 3, PLACES);
    expect(r.correlated).toHaveLength(0);
  });
});

describe("a whole panel", () => {
  const catalog = toy([
    rule("a", "ferritin", 0, 20),
    rule("b", "transferrin_saturation", 0, 3),
    rule("c", "mcv", 0, 2),
    rule("d", "rdw", 0, 1.5),
  ]);

  it("damps every member except the strongest", () => {
    const r = scoreHypotheses(
      input({
        ferritin: value(9),
        transferrin_saturation: value(11),
        mcv: value(78),
        rdw: value(16),
      }),
      { catalog },
    )[0]!;
    expect(r.correlated.map((c) => c.rule).sort()).toEqual(["b", "c", "d"]);
    expect(odds(r.score)).toBeCloseTo(
      PRIOR_ODDS * 20 * 3 ** CORR_DAMP * 2 ** CORR_DAMP * 1.5 ** CORR_DAMP,
      PLACES,
    );
  });
});

describe("a rule that argues against", () => {
  it("is pulled toward 1 too, not made stronger", () => {
    const catalog = toy([
      rule("strong", "ferritin", 0, 20),
      { ...rule("weak", "mcv", 200, 1), lrNeg: 0.5 },
    ]);
    const r = scoreHypotheses(input({ ferritin: value(9), mcv: value(90) }), {
      catalog,
    })[0]!;
    const damped = 0.5 ** CORR_DAMP;
    expect(damped).toBeGreaterThan(0.5);
    expect(damped).toBeLessThan(1);
    expect(odds(r.score)).toBeCloseTo(PRIOR_ODDS * 20 * damped, PLACES);
  });
});
