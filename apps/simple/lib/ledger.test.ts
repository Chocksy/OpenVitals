import { describe, expect, it } from "vitest";
import type { MetricRow } from "./data";
import type { HState, HypothesisResult } from "./hypotheses";
import {
  beliefsOf,
  improvedOf,
  isConclusion,
  isLoud,
  mattersOf,
  sinceOf,
  type Beliefs,
} from "./ledger";

/* ── fixtures ─────────────────────────────────────────────────────────── */

const hypothesis = (
  id: string,
  score: number,
  state: HState,
  over: Partial<HypothesisResult> = {},
): HypothesisResult => ({
  id,
  name: id.replace(/_/g, " "),
  prior: 0.1,
  score,
  state,
  for: [],
  against: [],
  missing: [],
  superseded: [],
  correlated: [],
  confounded: [],
  nextTests: [],
  lenses: { lifespan: { w: 3, grade: "A" } },
  lensWeight: 3,
  tests: [],
  summary: "",
  management: "",
  ...over,
});

const metric = (
  code: string,
  values: [string, number][],
  band: { low?: number | null; high?: number | null } = {},
): MetricRow => {
  const rows = values.map(([date, value]) => ({
    observedAt: date,
    value,
    valueText: null,
    unit: "mg/dL",
    refLow: null,
    refHigh: null,
  }));
  return {
    code,
    name: code.replace(/_/g, " "),
    category: "lipids",
    unit: "mg/dL",
    optimalLow: band.low ?? null,
    optimalHigh: band.high ?? null,
    optimalSource: null,
    optimalBasis: null,
    optimalRationale: null,
    sortOrder: 0,
    derived: false,
    points: values.map(([date, value]) => ({ date, value })),
    rows,
    latest: rows[rows.length - 1]!,
    status: "green",
  };
};

/* ── rank ─────────────────────────────────────────────────────────────── */

describe("matters", () => {
  it("ranks on score × lensWeight, not on probability alone", () => {
    const big = hypothesis("apob_high", 0.5, "possible");
    const small = hypothesis("mild_thing", 0.8, "likely", {
      lenses: { lifespan: { w: 1, grade: "C" } },
      lensWeight: 0.5,
    });
    expect(mattersOf(big)).toBeGreaterThan(mattersOf(small));
    expect(
      [big, small].sort((a, b) => mattersOf(b) - mattersOf(a))[0]!.id,
    ).toBe("apob_high");
  });
});

/* ── which conditions earn a card ─────────────────────────────────────── */

describe("isConclusion", () => {
  const fired = [
    {
      rule: "r1",
      input: "ldl_cholesterol",
      value: "131",
      lr: 2,
      grade: "A" as const,
    },
  ];
  const test = [
    { test: "ApoB", cost: 1 as const, expectedShift: 0.2, ratio: 0.2 },
  ];

  it("takes anything at possible or above", () => {
    expect(isConclusion(hypothesis("a", 0.4, "possible"))).toBe(true);
    expect(isConclusion(hypothesis("b", 0.95, "confirmed"))).toBe(true);
  });

  it("takes an unlikely condition with a fired rule and a test left", () => {
    const h = hypothesis("c", 0.1, "unlikely", { for: fired, nextTests: test });
    expect(isConclusion(h)).toBe(true);
  });

  it("never resurrects a ruled-out condition on a fired rule", () => {
    const h = hypothesis("c2", 0.02, "ruled_out", {
      for: fired,
      nextTests: test,
    });
    expect(isConclusion(h)).toBe(false);
  });

  it("takes an unlikely condition that changed state", () => {
    expect(isConclusion(hypothesis("d", 0.1, "unlikely"), true)).toBe(true);
  });

  it("leaves everything else quiet", () => {
    expect(isConclusion(hypothesis("e", 0.1, "unlikely"))).toBe(false);
    expect(isConclusion(hypothesis("f", 0.01, "ruled_out"))).toBe(false);
    // a fired rule with nothing left to order is not a card either
    expect(isConclusion(hypothesis("g", 0.1, "unlikely", { for: fired }))).toBe(
      false,
    );
  });
});

describe("isLoud", () => {
  it("draws the line at possible", () => {
    expect(isLoud("ruled_out")).toBe(false);
    expect(isLoud("unlikely")).toBe(false);
    expect(isLoud("possible")).toBe(true);
    expect(isLoud("likely")).toBe(true);
    expect(isLoud("confirmed")).toBe(true);
  });
});

/* ── what improved ────────────────────────────────────────────────────── */

describe("improvedOf", () => {
  it("finds a marker that came inside optimal over three draws", () => {
    const rows = [
      metric(
        "triglycerides",
        [
          ["2025-01-10", 180],
          ["2025-06-10", 145],
          ["2026-02-10", 106],
        ],
        { high: 110 },
      ),
    ];
    expect(improvedOf(rows)).toEqual([
      {
        code: "triglycerides",
        name: "triglycerides",
        from: 180,
        to: 106,
        unit: "mg/dL",
        since: "2025-01-10",
      },
    ]);
  });

  it("ignores a marker that was always inside", () => {
    const rows = [
      metric(
        "hdl_cholesterol",
        [
          ["2025-01-10", 55],
          ["2025-06-10", 58],
          ["2026-02-10", 60],
        ],
        { low: 50 },
      ),
    ];
    expect(improvedOf(rows)).toEqual([]);
  });

  it("ignores a marker that is still outside today", () => {
    const rows = [
      metric(
        "ldl_cholesterol",
        [
          ["2025-01-10", 150],
          ["2025-06-10", 140],
          ["2026-02-10", 131],
        ],
        { high: 100 },
      ),
    ];
    expect(improvedOf(rows)).toEqual([]);
  });

  it("needs three draws, so a single improvement is not news yet", () => {
    const rows = [
      metric(
        "triglycerides",
        [
          ["2025-06-10", 180],
          ["2026-02-10", 100],
        ],
        { high: 110 },
      ),
    ];
    expect(improvedOf(rows)).toEqual([]);
  });
});

/* ── what changed since the last snapshot ─────────────────────────────── */

describe("sinceOf", () => {
  const before: Beliefs = {
    high_triglycerides: { p: 0.7, state: "likely" },
    apob_high: { p: 0.3, state: "possible" },
    insulin_resistance: { p: 0.2, state: "unlikely" },
    hashimoto: { p: 0.4, state: "possible" },
  };

  const now = [
    hypothesis("high_triglycerides", 0.1, "unlikely"), // resolved
    hypothesis("apob_high", 0.55, "possible"), // stronger
    hypothesis("insulin_resistance", 0.38, "possible"), // new
    hypothesis("hashimoto", 0.3, "possible"), // weaker
    hypothesis("iron_deficiency", 0.02, "ruled_out"), // never was, still is not
  ];

  it("counts resolved, new, stronger and weaker against the snapshot", () => {
    expect(sinceOf(now, before, "2026-04-02")).toEqual({
      at: "2026-04-02",
      resolved: 1,
      new: 1,
      stronger: 1,
      weaker: 1,
    });
  });

  it("says nothing moved when the snapshot matches", () => {
    const same = Object.entries(before).map(([id, b]) =>
      hypothesis(id, b.p, b.state as HState),
    );
    expect(sinceOf(same, before, "2026-04-02")).toEqual({
      at: "2026-04-02",
      resolved: 0,
      new: 0,
      stronger: 0,
      weaker: 0,
    });
  });

  it("round-trips through beliefsOf", () => {
    expect(beliefsOf(now).apob_high).toEqual({ p: 0.55, state: "possible" });
  });
});

/* ── the spear ────────────────────────────────────────────────────────── */

describe("the spear", () => {
  /** The rule the ledger applies: conclusions[0] when it is loud, or a marker. */
  const spearOf = (rows: { state?: HState; kind: string }[]) =>
    rows[0] &&
    (rows[0].kind === "marker" || (rows[0].state && isLoud(rows[0].state)))
      ? rows[0]
      : undefined;

  it("is undefined when nothing is possible and no marker is off", () => {
    expect(spearOf([{ kind: "condition", state: "unlikely" }])).toBeUndefined();
    expect(spearOf([])).toBeUndefined();
  });

  it("is the first conclusion when it is possible or better", () => {
    expect(spearOf([{ kind: "condition", state: "likely" }])).toBeDefined();
  });

  it("is a red marker when that is all there is", () => {
    expect(spearOf([{ kind: "marker" }])).toBeDefined();
  });
});

describe("the phase-17 display rule", () => {
  it("never gives a ruled-out condition a card, even when it changed", () => {
    const h = hypothesis("mondo_0010526", 0.0002, "ruled_out", {
      for: [
        {
          rule: "wake_x",
          input: "sym_energy",
          value: "Yes",
          lr: 4,
          grade: "C",
        },
      ],
      nextTests: [
        { test: "a test", cost: 1, expectedShift: 0.2, ratio: 0.2 },
      ],
    });
    expect(isConclusion(h, false)).toBe(false);
    expect(isConclusion(h, true)).toBe(false);
  });

  it("still gives an unlikely one a card when a rule fired and a test would move it", () => {
    const h = hypothesis("hashimoto", 0.2, "unlikely", {
      for: [
        { rule: "r", input: "tsh", value: "4.9", lr: 3, grade: "A" },
      ],
      nextTests: [
        { test: "Anti-TPO", cost: 1, expectedShift: 0.3, ratio: 0.3 },
      ],
    });
    expect(isConclusion(h)).toBe(true);
  });
});
