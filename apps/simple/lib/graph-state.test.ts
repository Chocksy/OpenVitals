import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import { computeGraphState } from "./graph-state";

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
