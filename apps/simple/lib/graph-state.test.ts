import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import { EDGES } from "./graph";
import { computeGraphState, evaluateWhen, parseHour } from "./graph-state";

const value = (
  v: number | null,
  extra: Partial<LatestValue> = {},
): LatestValue => ({
  value: v,
  unit: null,
  date: "2026-08-01",
  status: "green",
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
  ...extra,
});

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: "2026-08-27",
  profile: {},
  latest: {},
  derived: {},
  ...over,
});

const highLdl = value(190, {
  status: "red",
  optimalHigh: 100,
  refHigh: 130,
});

const importanceOf = (
  state: ReturnType<typeof computeGraphState>,
  id: string,
) => state.nodes.find((n) => n.id === id)!.importance;

describe("a hot thyroid warms the lipids", () => {
  const withHighTsh = computeGraphState(
    input({
      latest: {
        tsh: value(6.2, { status: "red", optimalHigh: 2.5, refHigh: 4.5 }),
        ldl_cholesterol: highLdl,
      },
    }),
  );
  const withNormalTsh = computeGraphState(
    input({
      latest: {
        tsh: value(1.4, { status: "green", optimalHigh: 2.5, refHigh: 4.5 }),
        ldl_cholesterol: highLdl,
      },
    }),
  );

  it("activates tsh->ldl_cholesterol only when TSH is high", () => {
    expect(withHighTsh.activeEdges.map((e) => e.id)).toContain(
      "tsh->ldl_cholesterol",
    );
    expect(withNormalTsh.activeEdges.map((e) => e.id)).not.toContain(
      "tsh->ldl_cholesterol",
    );
  });

  it("lifts the LDL node above the same person with a normal TSH", () => {
    expect(importanceOf(withHighTsh, "metric:ldl_cholesterol")).toBeGreaterThan(
      importanceOf(withNormalTsh, "metric:ldl_cholesterol"),
    );
  });
});

describe("pattern-gated edges", () => {
  const antibodies = {
    tpo_antibodies: value(320, { status: "red", refHigh: 34 }),
    tsh: value(3.9, { refHigh: 4.5, prev: 3.1 }),
  };

  it("stays inactive until the pattern matches", () => {
    const quiet = computeGraphState(
      input({
        latest: { tpo_antibodies: value(12, { refHigh: 34 }), tsh: value(3.9) },
      }),
    );
    expect(quiet.activeEdges.map((e) => e.id)).not.toContain(
      "selenium->tpo_antibodies",
    );
  });

  it("goes live once Hashimoto's is detected", () => {
    const hot = computeGraphState(input({ latest: antibodies }));
    expect(hot.patterns.map((p) => p.pattern.id)).toContain("hashimoto");
    expect(hot.activeEdges.map((e) => e.id)).toContain(
      "selenium->tpo_antibodies",
    );
  });
});

describe("focus", () => {
  it("moves a green metric into the hot list", () => {
    const latest = {
      vitamin_d: value(46, { status: "green", optimalLow: 40 }),
    };
    const ignored = computeGraphState(input({ latest }));
    const focused = computeGraphState(input({ latest }), {
      focus: ["vitamin d"],
    });
    expect(ignored.hot.map((n) => n.id)).not.toContain("metric:vitamin_d");
    expect(focused.hot.map((n) => n.id)).toContain("metric:vitamin_d");
  });
});

describe("an empty person", () => {
  it("activates no edge at all", () => {
    const state = computeGraphState(input());
    expect(state.activeEdges).toEqual([]);
    expect(state.hot).toEqual([]);
  });
});

describe("conditional edges (phase 16)", () => {
  const sleepy = {
    sleep_duration: value(5.5, { status: "red", optimalLow: 7, refLow: 6 }),
  };

  it("fires the CYP1A2 slow edge and not the fast one", () => {
    const slow = computeGraphState(
      input({
        latest: sleepy,
        profile: {
          caffeine_slow_metaboliser: "slow metaboliser",
          coffee_last_hour: "17:00",
        },
      }),
    );
    const ids = slow.activeEdges.map((e) => e.id);
    expect(ids).toContain("coffee_after_15->sleep_duration@cyp1a2_slow");
    expect(ids).not.toContain("coffee_after_15->sleep_duration@cyp1a2_fast");
  });

  it("fires the fast edge for a fast metaboliser, at strength 1", () => {
    const fast = computeGraphState(
      input({
        latest: sleepy,
        profile: {
          caffeine_slow_metaboliser: "fast metaboliser",
          coffee_last_hour: "17:00",
        },
      }),
    );
    const edge = fast.activeEdges.find(
      (e) => e.id === "coffee_after_15->sleep_duration@cyp1a2_fast",
    );
    expect(edge?.strength).toBe(1);
    expect(edge?.whenReasons).toContain("CYP1A2 fast metaboliser");
  });

  it("fires neither edge when the last coffee is before 15:00", () => {
    const early = computeGraphState(
      input({
        latest: sleepy,
        profile: {
          caffeine_slow_metaboliser: "slow metaboliser",
          coffee_last_hour: "13:00",
        },
      }),
    );
    expect(early.activeEdges.map((e) => e.id).join(" ")).not.toContain(
      "coffee_after_15",
    );
  });

  it("says why an edge is not for you", () => {
    const edge = EDGES.find(
      (e) => e.id === "coffee_after_15->sleep_duration@cyp1a2_slow",
    )!;
    const m = input({
      profile: {
        caffeine_slow_metaboliser: "fast metaboliser",
        coffee_last_hour: "17:00",
      },
    });
    const verdict = evaluateWhen(edge, m, new Set());
    expect(verdict.holds).toBe(false);
    expect(verdict.failed).toBe(
      'your CYP1A2 call is "fast metaboliser", not "slow"',
    );
  });

  it("holds a hoursBefore clause inside the threshold and drops it outside", () => {
    const edge = EDGES.find((e) => e.id === "late_meal->glucose")!;
    const late = evaluateWhen(
      edge,
      input({ profile: { last_meal_hour: "21:30", bedtime_hour: "23:00" } }),
      new Set(),
    );
    expect(late.holds).toBe(true);
    expect(late.reasons[0]).toContain("1.5 h before bed");

    const early = evaluateWhen(
      edge,
      input({ profile: { last_meal_hour: "18:00", bedtime_hour: "23:00" } }),
      new Set(),
    );
    expect(early.holds).toBe(false);
    expect(early.failed).toContain("5.0 h before bed");
  });

  it("waits for the bedtime answer rather than guessing one", () => {
    const edge = EDGES.find((e) => e.id === "late_meal->glucose")!;
    const verdict = evaluateWhen(
      edge,
      input({ profile: { last_meal_hour: "21:30" } }),
      new Set(),
    );
    expect(verdict.holds).toBe(false);
    expect(verdict.failed).toContain("bedtime hour");
  });

  it("gates the lactose edge on the genotype and the dairy answer together", () => {
    const edge = EDGES.find((e) => e.id === "genome:LCT->sym_bowel")!;
    const both = evaluateWhen(
      edge,
      input({
        profile: {
          lactase_nonpersistent: "lactase non-persistent",
          dairy_daily: "Yes",
        },
      }),
      new Set(),
    );
    expect(both.holds).toBe(true);
    expect(both.reasons).toEqual(["dairy daily Yes", "LCT lactase non-persistent"]);

    const noDairy = evaluateWhen(
      edge,
      input({
        profile: {
          lactase_nonpersistent: "lactase non-persistent",
          dairy_daily: "No",
        },
      }),
      new Set(),
    );
    expect(noDairy.holds).toBe(false);

    const persistent = evaluateWhen(
      edge,
      input({
        profile: { lactase_nonpersistent: "lactase persistent", dairy_daily: "Yes" },
      }),
      new Set(),
    );
    expect(persistent.holds).toBe(false);
  });
});

describe("parseHour", () => {
  it("reads the shapes the answers actually come in", () => {
    expect(parseHour("21:00")).toBe(21);
    expect(parseHour("21:30")).toBe(21.5);
    expect(parseHour("9pm")).toBe(21);
    expect(parseHour("15")).toBe(15);
    expect(parseHour("12am")).toBe(0);
    expect(parseHour("")).toBe(null);
    expect(parseHour("whenever")).toBe(null);
  });
});
