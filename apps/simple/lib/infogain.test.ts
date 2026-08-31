import { describe, it, expect } from "vitest";
import { ratioOf } from "./prices";
import type { ModelInput } from "./coverage";
import type { Catalog, Hypothesis } from "./hypotheses";
import { entropyOf, nextMoves, sensSpec } from "./infogain";
import { buildTree } from "./tree";

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: "2026-08-27",
  profile: { sex: "male", birth_year: "1986" },
  sex: "male",
  age: 40,
  latest: {},
  derived: {},
  ...over,
});

/** Two stories, one cheap test that reads both, one dear test that reads one. */
const shared: Hypothesis = {
  id: "shared_cheap",
  name: "Shared",
  summary: "s",
  management: "m",
  priors: { base: 0.3, modifiers: [] },
  evidence: [
    {
      id: "a_marker",
      input: { metric: "insulin" },
      when: { above: 10 },
      lr: 5,
      lrNeg: 0.2,
      grade: "A",
      source: "fixture",
    },
  ],
  discriminators: [
    {
      test: "Cheap shared draw",
      codes: ["insulin"],
      cost: 1,
      lrPos: 5,
      lrNeg: 0.2,
      typicalPos: 18,
      typicalNeg: 4,
    },
    {
      test: "Dear scan",
      codes: ["liver_ultrasound"],
      cost: 3,
      lrPos: 6,
      lrNeg: 0.2,
      typicalPos: 1,
      typicalNeg: 0,
    },
  ],
  lenses: { lifespan: { w: 3, grade: "A" } },
};

const second: Hypothesis = {
  ...shared,
  id: "second_cheap",
  name: "Second",
  evidence: [{ ...shared.evidence[0]!, id: "b_marker" }],
  discriminators: [shared.discriminators[0]!],
};

const twoConditions: Catalog = [shared, second];

/** One question that splits the pair, one test that only lifts the leader. */
const snorer: Hypothesis = {
  ...shared,
  id: "snorer",
  evidence: [
    {
      id: "snores",
      input: { fact: "sleep_snoring" },
      when: { includes: "most" },
      lr: 6,
      lrNeg: 0.3,
      grade: "A",
      source: "fixture",
    },
  ],
  discriminators: [
    {
      test: "Leader-only draw",
      codes: ["hba1c"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.6,
      typicalPos: 5.9,
      typicalNeg: 5.1,
    },
  ],
};

const sleeper: Hypothesis = {
  ...snorer,
  id: "sleeper",
  evidence: [
    {
      id: "quiet",
      input: { fact: "sleep_snoring" },
      when: { equals: "No" },
      lr: 6,
      lrNeg: 0.3,
      grade: "A",
      source: "fixture",
    },
  ],
  discriminators: [],
};

describe("sensSpec", () => {
  it("inverts a pair of likelihood ratios", () => {
    const { sens, spec } = sensSpec(10, 0.3);
    expect(sens / (1 - spec)).toBeCloseTo(10, 3);
    expect((1 - sens) / spec).toBeCloseTo(0.3, 3);
  });
});

describe("entropyOf", () => {
  it("is one bit for a coin and nothing for a certainty", () => {
    expect(entropyOf([{ id: "a", p: 0.5 }])).toBeCloseTo(1, 6);
    expect(
      entropyOf([
        { id: "a", p: 1 },
        { id: "b", p: 0 },
      ]),
    ).toBe(0);
  });
});

describe("nextMoves", () => {
  it("puts the shared cheap test above the condition-specific dear one", () => {
    const moves = nextMoves(input(), twoConditions);
    const cheap = moves.find((mv) => mv.label === "Cheap shared draw")!;
    const dear = moves.find((mv) => mv.label === "Dear scan")!;
    expect(cheap.ratio).toBeGreaterThan(dear.ratio);
    expect(cheap.gain).toBeGreaterThan(dear.gain);
    expect(moves[0]!.label).toBe("Cheap shared draw");
    expect(cheap.moves.map((x) => x.id).sort()).toEqual([
      "second_cheap",
      "shared_cheap",
    ]);
  });

  it("puts the question that splits the pair above the test that only confirms the leader", () => {
    const moves = nextMoves(input(), [snorer, sleeper]);
    const question = moves.find((mv) => mv.kind === "question")!;
    const test = moves.find((mv) => mv.label === "Leader-only draw")!;
    expect(question.featureId).toBe("fact:sleep_snoring");
    expect(question.cost).toBe(0);
    expect(question.ratio).toBeGreaterThan(test.ratio);
    expect(moves[0]).toBe(question);
    expect(question.outcomes.map((o) => o.label)).toEqual([
      "No",
      "Sometimes",
      "Most nights",
    ]);
    expect(question.outcomes.reduce((sum, o) => sum + o.prob, 0)).toBeCloseTo(
      1,
      2,
    );
  });

  it("does not propose an excluded feature", () => {
    const moves = nextMoves(input(), twoConditions, {
      exclude: ["metric:insulin"],
    });
    expect(moves.map((mv) => mv.featureId)).not.toContain("metric:insulin");
    expect(moves.map((mv) => mv.label)).toContain("Dear scan");
  });

  it("drops a test whose marker is already on file", () => {
    const measured = input({
      latest: {
        insulin: {
          value: 18,
          unit: null,
          date: "2026-08-01",
          status: "amber",
          optimalLow: null,
          optimalHigh: null,
          refLow: null,
          refHigh: null,
        },
      },
    });
    expect(
      nextMoves(measured, twoConditions).map((mv) => mv.label),
    ).not.toContain("Cheap shared draw");
  });

  it("weights the outcomes so they average back to the prior", () => {
    for (const move of nextMoves(input(), [snorer, sleeper])) {
      expect(move.outcomes.reduce((sum, o) => sum + o.prob, 0)).toBeCloseTo(1, 2);
      for (const id of ["snorer", "sleeper"]) {
        const from = move.moves.find((x) => x.id === id);
        if (!from) continue;
        const mixed = move.outcomes.reduce(
          (sum, o) => sum + o.prob * (o.beliefs.find((b) => b.id === id)?.p ?? 0),
          0,
        );
        expect(mixed).toBeCloseTo(from.from, 1);
      }
      expect(move.gain).toBeGreaterThan(0);
    }
  });

  it("keeps the entropy it reports honest", () => {
    const move = nextMoves(input(), twoConditions)[0]!;
    expect(move.gain).toBeCloseTo(move.entropyBefore - move.entropyAfter, 3);
    expect(move.ratio).toBeCloseTo(ratioOf(move.gain, move.cost, !!move.priced), 3);
  });
});

describe("buildTree", () => {
  it("branches on the best move and stops when nothing is left", () => {
    const tree = buildTree(input(), twoConditions, { depth: 2 });
    expect(tree.chosen?.label).toBe("Cheap shared draw");
    expect(tree.branches.map((b) => b.label)).toEqual(["positive", "negative"]);
    const positive = tree.branches[0]!.child;
    expect(positive.beliefs[0]!.p).toBeGreaterThan(tree.beliefs[0]!.p);
  });

  it("is one node with nothing to ask", () => {
    const tree = buildTree(input(), [], { depth: 4 });
    expect(tree.branches).toEqual([]);
    expect(tree.stop).toBe("exhausted");
  });

  it("stops on a quiet differential: nothing likely, nothing worth asking", () => {
    const weak: Hypothesis = {
      ...shared,
      id: "weak",
      priors: { base: 0.1, modifiers: [] },
      evidence: [],
      discriminators: [
        {
          test: "Weak draw",
          codes: ["insulin"],
          cost: 1,
          lrPos: 1.5,
          lrNeg: 0.8,
          typicalPos: 18,
          typicalNeg: 4,
        },
      ],
    };
    const tree = buildTree(input(), [weak], { depth: 4 });
    expect(tree.branches).toEqual([]);
    expect(tree.stop).toBe("exhausted");
    // The path applies the same floor, but only once somebody has looked:
    // this person has never had a panel, so the weak draw is still offered
    // and it is the gain that says it is not worth much.
    expect(nextMoves(input(), [weak])[0]!.gain).toBeLessThan(0.15);
  });

  it("stops on the budget when every move costs more than is left", () => {
    const tree = buildTree(
      input(),
      [{ ...shared, discriminators: [shared.discriminators[1]!] }],
      {
        depth: 3,
        budget: 2,
      },
    );
    // Phase 18: the budget ranks, it never gates. The branch is flagged and
    // the tree keeps going.
    expect(tree.stop).not.toBe("budget");
    expect(tree.overBudget).toBe(true);
  });
});
