import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import { historyOf } from "./derived";
import { normalizeName } from "./merge-metrics";
import {
  bestReadOf,
  CAUSE_DESIGNS,
  caseOf,
  causeQueries,
  caseQuery,
  checkQueries,
  mentionedConditions,
  titlePopulation,
  namedIn,
  namesIt,
  sameWord,
  populationOf,
  searchOrThrow,
  memo,
  needsOf,
  failureTerms,
  historyOn,
  judgeProposals,
  OFF_TOPIC,
  withFailureQuery,
  overlayRows,
  runCase,
  withOverlay,
  type CaseDeps,
  type CaseSummary,
  type RawProposal,
  verbatimIn,
} from "./cases";
import {
  scoreHypotheses,
  type Hypothesis,
  type HypothesisResult,
} from "./hypotheses";
import { EpmcUnavailable, type Paper } from "./research";
import type { Signal } from "./signals";

const TODAY = "2024-06-01";

const series = (
  draws: [string, number][],
  ref: { refLow?: number; refHigh?: number },
  unit: string | null = null,
  asOf = TODAY,
): LatestValue => {
  const pts = draws.map(([date, value]) => ({
    date,
    value,
    refLow: ref.refLow ?? null,
    refHigh: ref.refHigh ?? null,
  }));
  const last = pts[pts.length - 1]!;
  return {
    value: last.value,
    unit,
    date: last.date,
    status: "green",
    optimalLow: null,
    optimalHigh: null,
    refLow: last.refLow,
    refHigh: last.refHigh,
    history: historyOf(pts, asOf),
  };
};

const person: ModelInput = {
  today: TODAY,
  profile: {
    "genome:hla_dq": "carries DQ2.5",
    "genome:hfe": "no C282Y or H63D",
  },
  sex: "female",
  age: 36,
  derived: {},
  latest: {
    ferritin: series(
      [
        ["2018-03-01", 9],
        ["2019-04-01", 11],
        ["2020-05-01", 8],
        ["2021-12-01", 12],
        ["2023-02-01", 10],
        ["2024-05-13", 7],
      ],
      { refLow: 13, refHigh: 150 },
      "ng/mL",
    ),
    mcv: series(
      [
        ["2021-12-01", 92],
        ["2024-05-13", 96],
      ],
      { refLow: 80, refHigh: 100 },
      "fL",
    ),
    vitamin_b12: series(
      [
        ["2021-12-01", 172],
        ["2024-05-13", 354],
      ],
      { refLow: 197, refHigh: 771 },
    ),
    anti_thyroglobulin: series(
      [
        ["2023-02-01", 30],
        ["2024-05-13", 65],
      ],
      { refHigh: 40 },
    ),
  },
};

const signal = (over: Partial<Signal>): Signal => ({
  key: "x",
  kind: "step",
  codes: [],
  system: null,
  dir: "up",
  since: null,
  numbers: {},
  rule: [],
  why: null,
  firedAt: [],
  ...over,
});

const belief = (over: Partial<HypothesisResult>): HypothesisResult =>
  ({
    id: "b",
    name: "B",
    prior: 0.02,
    score: 0.1,
    state: "unlikely",
    for: [],
    against: [],
    missing: [],
    superseded: [],
    correlated: [],
    confounded: [],
    nextTests: [],
    lenses: {},
    lensWeight: 0,
    tests: [],
    summary: "",
    management: "",
    ...over,
  }) as HypothesisResult;

describe("caseOf", () => {
  const beliefs = [
    belief({
      id: "gastric",
      name: "Gastric thing",
      score: 0.09,
      tests: [
        {
          test: "Parietal cell antibodies",
          codes: ["parietal_cell_antibodies"],
          cost: 1,
          lrPos: 5,
          lrNeg: 0.2,
        },
        {
          test: "Ferritin",
          codes: ["ferritin"],
          cost: 1,
          lrPos: 2,
          lrNeg: 0.5,
        },
      ],
    }),
    belief({
      id: "iron",
      name: "Iron deficiency",
      score: 0.95,
      state: "likely",
    }),
  ];
  const s = caseOf(
    person,
    [
      signal({ kind: "step", codes: ["anti_thyroglobulin"], dir: "up" }),
      signal({
        key: "cause:iron",
        kind: "cause",
        codes: ["ferritin"],
        numbers: {
          conditionId: "iron",
          name: "Iron deficiency",
          p: 0.95,
          state: "likely",
        },
      }),
    ],
    beliefs,
  );
  const keys = s.items.map((i) => i.key);

  it("lists every kind the spec names, with numbers and dates", () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        "chronic:ferritin",
        "ever_low:vitamin_b12",
        "antibody_rising:anti_thyroglobulin",
        "discordance:ferritin_mcv",
        "genome:hla_dq",
        "cause:iron",
        "belief:iron",
        "belief:gastric",
        "untested:parietal_cell_antibodies",
      ]),
    );
    const chronic = s.items.find((i) => i.key === "chronic:ferritin")!;
    expect(chronic.text).toMatch(/6 of 6 draws/);
    expect(chronic.text).toMatch(/2018-03-01/);
    expect(s.items.find((i) => i.key === "ever_low:vitamin_b12")!.text).toMatch(
      /172.*2021-12-01/,
    );
  });

  it("leaves out a plain no-variant call, a measured test and a chronic side twice", () => {
    expect(keys).not.toContain("genome:hfe");
    expect(keys).not.toContain("untested:ferritin");
    expect(keys).not.toContain("ever_low:ferritin");
  });

  it("puts the beliefs in order with their p, and offers hypothesis: features", () => {
    expect(s.beliefs.map((b) => b.id)).toEqual(["iron", "gastric"]);
    expect(s.items.find((i) => i.key === "belief:iron")!.feature!.id).toBe(
      "hypothesis:iron",
    );
  });

  it("names a treatment that did not move its marker", () => {
    const later: ModelInput = {
      ...person,
      today: "2025-06-01",
      treatments: [
        {
          what: "iron",
          route: "oral",
          started: "2024-09-01",
          from: "treatments",
        },
      ],
      latest: {
        ...person.latest,
        ferritin: series(
          [
            ["2023-02-01", 10],
            ["2024-05-13", 7],
            ["2025-05-28", 6.9],
          ],
          { refLow: 13 },
          null,
          "2025-06-01",
        ),
      },
    };
    const item = caseOf(later, [], []).items.find(
      (i) => i.key === "no_response:ferritin",
    );
    expect(item?.text).toMatch(/oral/);
    expect(item?.feature?.id).toBe("fact:no_response:ferritin");
  });
});

const summary: CaseSummary = {
  asOf: TODAY,
  beliefs: [],
  items: [
    { key: "chronic:ferritin", kind: "chronic", text: "", codes: [] },
    {
      key: "antibody_rising:anti_thyroglobulin",
      kind: "antibody_rising",
      text: "",
      codes: [],
    },
  ],
};

describe("checkQueries", () => {
  it("rejects a query that cites one item, or items the summary never had", () => {
    const { accepted, rejected } = checkQueries(
      [
        {
          query: '"iron deficiency" AND "thyroid"',
          items: ["chronic:ferritin", "antibody_rising:anti_thyroglobulin"],
        },
        { query: '"iron deficiency"', items: ["chronic:ferritin"] },
        {
          query: '"x" AND "y"',
          items: ["chronic:ferritin", "chronic:ferritin"],
        },
        { query: '"x" AND "y"', items: ["chronic:ferritin", "made:up"] },
      ],
      summary,
    );
    expect(accepted).toHaveLength(1);
    expect(rejected.map((r) => r.why)).toEqual([
      "combines 1 summary item",
      "combines 1 summary item",
      "combines 1 summary item",
    ]);
  });
});

const paper: Paper = {
  pmid: "1",
  doi: "10.1/abc",
  title: "Autoimmune gastritis in thyroid disease",
  journal: "J",
  year: 2020,
  authors: "Lahner E",
  citedBy: 40,
  url: "",
  abstract:
    "In 300 patients with autoimmune thyroiditis, atrophic gastritis was found with an odds ratio of 3.2 compared with controls. Parietal cell antibodies had a sensitivity of 81% and a specificity of 90% for atrophic body gastritis. Parietal cell antibodies had a sensitivity of 70% and a specificity of 95% for rare thing.",
};

const raw = (over: Partial<RawProposal>): RawProposal => ({
  kind: "evidence",
  paperIndex: 1,
  doi: "10.1/abc",
  conditionId: "atrophic_gastritis",
  featureId: "metric:parietal_cell_antibodies",
  when: { outOfRange: true },
  sensitivity: 0.81,
  specificity: 0.9,
  design: "cohort",
  n: 300,
  quote:
    "Parietal cell antibodies had a sensitivity of 81% and a specificity of 90% for atrophic body gastritis.",
  ...over,
});

const ctx = {
  papers: [paper],
  catalog: new Map([
    ["atrophic_gastritis", { name: "Atrophic gastritis" }],
    ["hashimoto", { name: "Autoimmune thyroiditis (Hashimoto's)" }],
  ]),
  ring2: new Map([
    ["mondo_rare", { id: "mondo_rare", name: "Rare thing" }],
    ["rare thing", { id: "mondo_rare", name: "Rare thing" }],
  ]),
  features: [
    {
      id: "metric:parietal_cell_antibodies",
      name: "Parietal cell antibodies",
      unit: null,
    },
  ],
  thisYear: 2024,
};

describe("judgeProposals", () => {
  it("accepts a clean evidence row with the LR worked out in code", () => {
    const { proposals } = judgeProposals([raw({})], ctx);
    expect(proposals[0]!.decision).toBe("accepted");
    expect(proposals[0]!.lrPos).toBe(8.1);
    expect(proposals[0]!.origin).toBe("paper");
    expect(proposals[0]!.source).toMatch(/doi:10.1\/abc/);
  });

  it("rejects a quote without its number, a quote not in the abstract and a foreign DOI", () => {
    const { proposals } = judgeProposals(
      [
        raw({ quote: "Parietal cell antibodies had a sensitivity of" }),
        raw({ quote: "Parietal cell antibodies had a sensitivity of 99%." }),
        raw({ doi: "10.9/other" }),
      ],
      ctx,
    );
    expect(proposals.map((p) => p.decision)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(proposals[0]!.reason).toMatch(/number/);
    expect(proposals[1]!.reason).toMatch(/verbatim/);
    expect(proposals[2]!.reason).toMatch(/DOI/);
  });

  it("reads a quote past a bare < and a tag in the abstract", () => {
    const quote =
      "Parietal cell antibodies had a sensitivity of 81% and a specificity of 90% for atrophic body gastritis.";
    const tagged = {
      ...paper,
      abstract: `Higher than controls (all <i>P</i> < 0.001). ${quote}<h4>Conclusion</h4>More.`,
    };
    const { proposals } = judgeProposals([raw({ quote })], {
      ...ctx,
      papers: [tagged],
    });
    expect(proposals[0]!.decision).toBe("accepted");
  });

  it("allows a hypothesis: modifier when the quote holds its number", () => {
    const quote =
      "In 300 patients with autoimmune thyroiditis, atrophic gastritis was found with an odds ratio of 3.2 compared with controls";
    const { proposals } = judgeProposals(
      [
        raw({
          kind: "modifier",
          featureId: "hypothesis:hashimoto",
          when: { above: 0.5 },
          times: 3.2,
          quote,
        }),
        raw({
          kind: "modifier",
          featureId: "hypothesis:hashimoto",
          when: { above: 0.5 },
          times: 5,
          quote,
        }),
      ],
      ctx,
    );
    expect(proposals[0]!.decision).toBe("accepted");
    expect(proposals[0]!.conditionOn).toEqual({ above: 0.5 });
    expect(proposals[1]!.decision).toBe("rejected");
  });

  it("promotes a ring-2 condition only with an A or B rule accepted", () => {
    const cond = raw({
      kind: "condition",
      conditionId: null,
      conditionName: "Rare thing",
    });
    const rule = (design: RawProposal["design"], n: number) =>
      raw({
        conditionId: null,
        conditionName: "Rare thing",
        design,
        n,
        sensitivity: 0.7,
        specificity: 0.95,
        quote:
          "Parietal cell antibodies had a sensitivity of 70% and a specificity of 95% for rare thing.",
      });

    const weak = judgeProposals([cond, rule("cohort", 300)], ctx); // cohort n<500 = C
    expect(weak.promote).toEqual([]);
    expect(weak.proposals.map((p) => p.decision)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(weak.proposals[1]!.reason).toMatch(/not promoted/);

    const strong = judgeProposals([cond, rule("meta", 300)], ctx);
    expect(strong.promote).toEqual(["mondo_rare"]);
    expect(strong.proposals.map((p) => p.decision)).toEqual([
      "accepted",
      "accepted",
    ]);
  });
});

describe("runCase", () => {
  const papers = Array.from({ length: 12 }, (_, i) => ({
    ...paper,
    doi: `10.1/${i}`,
  }));
  const deps = (costPerRead: number): CaseDeps & { reads: number } => {
    const d = {
      reads: 0,
      ask: async () => ({
        queries: [
          {
            query: "a AND b",
            items: ["chronic:ferritin", "antibody_rising:anti_thyroglobulin"],
          },
          { query: "a", items: ["chronic:ferritin"] },
        ],
        costUsd: 0.01,
      }),
      search: async () => papers,
      read: async (batch: Paper[]) => {
        d.reads++;
        return {
          items: batch.map((_, k) => raw({ paperIndex: k + 1 })),
          costUsd: costPerRead,
        };
      },
    };
    return d;
  };
  const opts = { budgetUsd: 0.1, conditions: [], features: [] };

  it("reads every batch under budget, and offsets paperIndex over the run", async () => {
    const d = deps(0.01);
    const run = await runCase(summary, d, opts);
    expect(d.reads).toBe(3);
    expect(run.stopped).toBe(false);
    expect(run.rejectedQueries).toHaveLength(1);
    expect(run.raw.map((r) => r.paperIndex)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(run.costUsd).toBeCloseTo(0.04);
  });

  it("stops cleanly between calls once the budget is spent", async () => {
    const d = deps(0.08);
    const run = await runCase(summary, d, opts);
    expect(d.reads).toBe(2);
    expect(run.stopped).toBe(true);
    expect(run.raw).toHaveLength(8);
  });
});

describe("withOverlay", () => {
  const h = (id: string, over: Partial<Hypothesis> = {}): Hypothesis => ({
    id,
    name: id,
    summary: "",
    priors: { base: 0.02, modifiers: [] },
    evidence: [],
    discriminators: [],
    lenses: {},
    management: "",
    ...over,
  });

  it("adds accepted rules and modifiers, and scores a chained read after its source", () => {
    const { proposals } = judgeProposals(
      [
        raw({}),
        raw({
          kind: "modifier",
          featureId: "hypothesis:hashimoto",
          when: { above: 0.5 },
          times: 3.2,
          quote:
            "In 300 patients with autoimmune thyroiditis, atrophic gastritis was found with an odds ratio of 3.2",
        }),
      ],
      ctx,
    );
    const rows = overlayRows(proposals);
    // the gastric row sorts first, so the chained read has to move it down
    const base = [
      h("atrophic_gastritis"),
      h("hashimoto", {
        priors: { base: 0.9, modifiers: [] },
      }),
    ];
    const merged = withOverlay(base, { ...rows, promote: [], conditions: [] });
    expect(merged.map((x) => x.id)).toEqual([
      "hashimoto",
      "atrophic_gastritis",
    ]);
    const m: ModelInput = {
      ...person,
      latest: {
        parietal_cell_antibodies: {
          ...person.latest.mcv!,
          value: 80,
          refHigh: 10,
          status: "red",
          history: undefined,
        },
      },
    };
    const before = scoreHypotheses(m, { catalog: base }).find(
      (r) => r.id === "atrophic_gastritis",
    )!;
    const after = scoreHypotheses(m, { catalog: merged }).find(
      (r) => r.id === "atrophic_gastritis",
    )!;
    expect(after.prior).toBeGreaterThan(before.prior);
    expect(after.score).toBeGreaterThan(before.score);
  });
});

describe("bestReadOf", () => {
  const catalog: Hypothesis[] = [
    {
      id: "atrophic_gastritis",
      name: "Atrophic gastritis",
      summary: "",
      priors: { base: 0.02, modifiers: [] },
      evidence: [
        {
          id: "r1",
          input: { metric: "parietal_cell_antibodies" },
          when: { status: "red" },
          lr: 8,
          grade: "A",
          source: 'Lahner 2020 J; doi:10.1/abc; quote: "..."',
        },
      ],
      discriminators: [
        {
          test: "Parietal cell antibodies",
          codes: ["p"],
          cost: 1,
          lrPos: 8,
          lrNeg: 0.2,
        },
        { test: "Gastrin-17", codes: ["g"], cost: 2, lrPos: 4, lrNeg: 0.5 },
      ],
      lenses: {},
      management: "Corpus atrophy gets an endoscopic surveillance interval.",
    },
  ];
  const expl = (weight: number) => ({
    id: "atrophic_gastritis",
    text: "Your stomach may not absorb iron",
    grade: "B" as const,
    basis: "science" as const,
    source: null,
    conditionId: "atrophic_gastritis",
    weight,
    predicts: null,
    check: null,
  });

  it("is null under 0.35 when the engine calls it unlikely", () => {
    expect(
      bestReadOf(
        { explanations: [expl(0.2)] },
        { atrophic_gastritis: { p: 0.09, state: "unlikely" } },
        catalog,
      ),
    ).toBeNull();
  });

  it("reads the top explanation once it is possible, with sources and tests", () => {
    const r = bestReadOf(
      { explanations: [expl(0.2)] },
      { atrophic_gastritis: { p: 0.31, state: "possible" } },
      catalog,
    )!;
    expect(r.sentence).toMatch(/^Our best read: Atrophic gastritis/);
    expect(r.p).toBe(0.31);
    expect(r.sources).toEqual([
      { doi: "10.1/abc", title: "Lahner 2020 J", grade: "A" },
    ]);
    expect(r.confirmWith).toEqual({
      doctor: "gastroenterologist",
      tests: ["Parietal cell antibodies", "Gastrin-17"],
    });
    expect(r.why[0]).toBe("Your stomach may not absorb iron");
  });

  it("also fires on weight alone", () => {
    expect(
      bestReadOf({ explanations: [expl(0.4)] }, null, catalog),
    ).not.toBeNull();
  });
});

describe("41C round 2: history, shares, names, failure queries", () => {
  const b12Paper: Paper = {
    ...paper,
    doi: "10.2/b12",
    abstract:
      "However, only 17 (18.9%) of 90 vitamin B12-deficient patients were diagnosed as having PA by the WHO definition. Pernicious anaemia was more frequent with low B12 (OR 3.1). Atrophic body gastritis was found in 22% of 120 patients with vitamin B12 deficiency.",
  };
  const cdPaper: Paper = {
    ...paper,
    doi: "10.2/cd",
    abstract:
      "Iron deficiency anemia (IDA) is a common sign in CD, being the only abnormality in approximately 40% of celiac patients. Celiac disease was found in 3.2% of patients with iron deficiency. Refractory iron deficiency anemia raised the odds of celiac disease (OR 3.2).",
  };
  const case2: CaseSummary = {
    asOf: "2024-06-01",
    beliefs: [],
    items: [
      {
        key: "ever_low:vitamin_b12",
        kind: "ever",
        text: "b12 172 on 2021-12-04",
        codes: ["vitamin_b12"],
        past: { code: "vitamin_b12", dir: "low", date: "2021-12-04" },
      },
    ],
  };
  const ctx2 = {
    ...ctx,
    papers: [b12Paper, cdPaper],
    catalog: new Map([
      ["atrophic_gastritis", { name: "Atrophic gastritis", base: 0.02 }],
      ["iron_deficiency", { name: "Iron deficiency", base: 0.2 }],
      ["coeliac_disease", { name: "Coeliac disease", base: 0.01 }],
    ]),
    features: [
      {
        id: "metric:vitamin_b12",
        name: "vitamin b12 (any past draw)",
        unit: "pg/mL",
      },
    ],
    summary: case2,
  };

  it("writes a rule on a marker the case holds as history in the ever form", () => {
    expect(
      historyOn(
        "metric:vitamin_b12",
        { below: 200 },
        case2.items,
        "2024-06-01",
      ),
    ).toEqual({
      ever: { below: 200, years: 3 },
    });
    expect(
      historyOn(
        "metric:vitamin_b12",
        { status: "red" },
        case2.items,
        "2024-06-01",
      ),
    ).toEqual({
      ever: { belowRef: true, years: 3 },
    });
    // the other direction, or a marker the case has no history on, stays as asked
    expect(
      historyOn(
        "metric:vitamin_b12",
        { above: 900 },
        case2.items,
        "2024-06-01",
      ),
    ).toEqual({ above: 900 });
    expect(
      historyOn("metric:ferritin", { below: 15 }, case2.items, "2024-06-01"),
    ).toEqual({ below: 15 });
  });

  it("converts a share only among the feature's people, and never lets PA stand in", () => {
    const b12 = (over: Partial<RawProposal>) =>
      raw({
        kind: "modifier",
        paperIndex: 1,
        doi: "10.2/b12",
        featureId: "metric:vitamin_b12",
        when: { below: 200 },
        sensitivity: null,
        specificity: null,
        ...over,
      });
    const { proposals } = judgeProposals(
      [
        // PA is not atrophic gastritis
        b12({
          prevalence: 0.189,
          among: "vitamin B12-deficient patients",
          shareOf: "PA",
          quote:
            "only 17 (18.9%) of 90 vitamin B12-deficient patients were diagnosed as having PA",
        }),
        // the right way round, with the case's history form
        b12({
          prevalence: 0.22,
          among: "patients with vitamin B12 deficiency",
          shareOf: "Atrophic body gastritis",
          quote:
            "Atrophic body gastritis was found in 22% of 120 patients with vitamin B12 deficiency.",
        }),
        // an odds ratio for PA is still no rule on atrophic gastritis
        b12({
          times: 3.1,
          quote: "Pernicious anaemia was more frequent with low B12 (OR 3.1).",
        }),
        // no groups: not converted
        b12({
          prevalence: 0.22,
          quote:
            "Atrophic body gastritis was found in 22% of 120 patients with vitamin B12 deficiency.",
        }),
      ],
      ctx2,
    );
    expect(proposals[0]!.decision).toBe("rejected");
    expect(proposals[0]!.reason).toMatch(/group counted is not the condition/);
    expect(proposals[1]!.decision).toBe("accepted");
    // `times` stays 0.22 / 0.02 = 11 capped at 6 for the readers that want a
    // direction; the engine reads the share itself (phase 41F)
    expect(proposals[1]!.lrPos).toBe(6);
    expect(proposals[1]!.conditionOn).toEqual({
      ever: { below: 200, years: 3 },
      share: 0.22,
    });
    expect(proposals[2]!.decision).toBe("rejected");
    expect(proposals[2]!.reason).toMatch(/does not name the condition/);
    expect(proposals[3]!.decision).toBe("rejected");
    expect(proposals[3]!.reason).toMatch(/two groups/);
  });

  it("rejects the inverted conditional: a share among coeliacs is no rule on coeliac", () => {
    const cd = (over: Partial<RawProposal>) =>
      raw({
        kind: "modifier",
        paperIndex: 2,
        doi: "10.2/cd",
        sensitivity: null,
        specificity: null,
        when: { above: 0.5 },
        ...over,
      });
    const q40 =
      "Iron deficiency anemia (IDA) is a common sign in CD, being the only abnormality in approximately 40% of celiac patients.";
    const { proposals } = judgeProposals(
      [
        // inverted: 40 % of coeliacs have IDA read as IDA raising coeliac
        cd({
          conditionId: "coeliac_disease",
          featureId: "hypothesis:iron_deficiency",
          prevalence: 0.4,
          among: "celiac patients",
          shareOf: "Iron deficiency anemia",
          quote: q40,
        }),
        // the model lying about the groups: IDA is not what the share is taken among
        cd({
          conditionId: "coeliac_disease",
          featureId: "hypothesis:iron_deficiency",
          prevalence: 0.4,
          among: "abnormality",
          shareOf: "celiac patients",
          quote: q40,
        }),
        // the right way: coeliac among people with iron deficiency
        cd({
          conditionId: "coeliac_disease",
          featureId: "hypothesis:iron_deficiency",
          prevalence: 0.032,
          among: "patients with iron deficiency",
          shareOf: "Celiac disease",
          quote:
            "Celiac disease was found in 3.2% of patients with iron deficiency.",
        }),
      ],
      ctx2,
    );
    expect(proposals.map((p) => p.decision)).toEqual([
      "rejected",
      "rejected",
      "accepted",
    ]);
    expect(proposals[0]!.reason).toMatch(
      /not taken among people with the feature/,
    );
    expect(proposals[2]!.lrPos).toBe(3.2);
  });

  it("offers treatment facts, and reads a bare failure as any route", () => {
    const { proposals } = judgeProposals(
      [
        raw({
          kind: "modifier",
          doi: "10.2/cd",
          paperIndex: 2,
          conditionId: "coeliac_disease",
          featureId: "fact:no_response:ferritin",
          when: { outOfRange: true },
          sensitivity: null,
          specificity: null,
          times: 3.2,
          quote:
            "Refractory iron deficiency anemia raised the odds of celiac disease (OR 3.2).",
        }),
      ],
      {
        ...ctx2,
        features: [
          {
            id: "fact:no_response:ferritin",
            name: "no response of ferritin",
            unit: null,
          },
        ],
      },
    );
    expect(proposals[0]!.conditionOn).toEqual({ includes: "oral|iv|any" });
    expect(proposals[0]!.decision).toBe("accepted");
  });

  it("words a failed treatment, and makes sure a query carries it", () => {
    expect(failureTerms("ferritin", "oral")).toEqual([
      "refractory iron deficiency",
      "oral iron failure",
    ]);
    expect(failureTerms("ferritin", "any")).toEqual([
      "refractory iron deficiency",
      "iron failure",
    ]);
    expect(failureTerms("sodium", "oral")).toEqual([]);
    const s: CaseSummary = {
      asOf: "2025-06-01",
      beliefs: [],
      items: [
        {
          key: "no_response:ferritin",
          kind: "no_response",
          text: "",
          codes: ["ferritin"],
          terms: failureTerms("ferritin", "oral"),
        },
        {
          key: "cause:iron_deficiency",
          kind: "cause",
          text: "",
          codes: ["ferritin"],
        },
        {
          key: "chronic:ferritin",
          kind: "chronic",
          text: "",
          codes: ["ferritin"],
        },
      ],
    };
    const six = Array.from({ length: 6 }, (_, i) => ({
      query: `"q${i}" AND "r"`,
      items: ["chronic:ferritin", "cause:iron_deficiency"],
    }));
    const out = withFailureQuery(six, s);
    expect(out).toHaveLength(6);
    expect(out[5]!.query).toMatch(
      /"refractory iron deficiency" OR "oral iron failure"/,
    );
    expect(out[5]!.items).toEqual([
      "no_response:ferritin",
      "cause:iron_deficiency",
    ]);
    // already cited: nothing added
    const cited = [
      { query: "x", items: ["no_response:ferritin", "chronic:ferritin"] },
    ];
    expect(withFailureQuery(cited, s)).toEqual(cited);
  });

  it("drops protocols and chatbot papers by title", () => {
    expect(
      OFF_TOPIC.test(
        "Study protocol for a randomized, double-blind trial of desidustat",
      ),
    ).toBe(true);
    expect(
      OFF_TOPIC.test(
        "Evaluating the Accuracy and Reliability of Large Language Models (ChatGPT)",
      ),
    ).toBe(true);
    expect(
      OFF_TOPIC.test(
        "Persistent Iron Deficiency Anemia in Patients with Celiac Disease",
      ),
    ).toBe(false);
  });
});

describe("41C round 3: names, causes, candidates", () => {
  const hashiPaper: Paper = {
    ...paper,
    doi: "10.3/tpo",
    abstract:
      "We studied Hashimoto's thyroiditis (HT) and thyroid peroxidase antibodies (TPOAb) in 2,356 women. Iron deficiency was associated with TPOAb positivity (OR 1.89). Iron deficiency raised the odds of HT (OR 1.5). HT was more common with iron deficiency (OR 1.7) in AITD.",
  };
  const genePaper: Paper = {
    ...paper,
    doi: "10.3/hla",
    abstract:
      "In 600 patients, the HLA-DR3-DQ2/DR4-DQ8 genotype conferred the highest risk of Addison's disease (OR 32). HLA-DR3 carriers had Addison's disease more often (OR 3.0).",
  };
  const ctx3 = {
    ...ctx,
    papers: [hashiPaper, genePaper],
    catalog: new Map([
      ["hashimoto", { name: "Autoimmune thyroiditis (Hashimoto's)" }],
      ["addisons", { name: "Primary adrenal insufficiency (Addison's)" }],
      ["iron_deficiency", { name: "Iron deficiency" }],
    ]),
    // a stored abbreviation, which the name check never takes on its own
    names: new Map([["hashimoto", ["Hashimoto thyroiditis", "HT", "AITD"]]]),
    features: [
      { id: "hypothesis:iron_deficiency", name: "Iron deficiency", unit: null },
      { id: "fact:genome:hla_dr", name: "hla_dr genotype", unit: null },
    ],
  };
  const mod = (over: Partial<RawProposal>) =>
    raw({
      kind: "modifier",
      sensitivity: null,
      specificity: null,
      when: { above: 0.5 },
      ...over,
    });

  it("rejects a number printed for a neighbour: TPO positivity is not the thyroiditis", () => {
    const tpo = (quote: string, times: number) =>
      mod({
        doi: "10.3/tpo",
        conditionId: "hashimoto",
        featureId: "hypothesis:iron_deficiency",
        times,
        quote,
      });
    const { proposals } = judgeProposals(
      [
        tpo("Iron deficiency was associated with TPOAb positivity (OR 1.89).", 1.89),
        // HT is defined in this abstract, so it names the condition
        tpo("Iron deficiency raised the odds of HT (OR 1.5).", 1.5),
        // AITD is a stored abbreviation the abstract never defines
        tpo("HT was more common with iron deficiency (OR 1.7) in AITD.", 1.7),
      ],
      ctx3,
    );
    expect(proposals[0]!.decision).toBe("rejected");
    expect(proposals[0]!.reason).toMatch(/does not name the condition/);
    expect(proposals[1]!.decision).toBe("accepted");
    // HT counts here only because the abstract defines it
    expect(proposals[2]!.decision).toBe("accepted");
    expect(
      namedIn("AITD was common (OR 1.7).", hashiPaper.abstract, [
        "Hashimoto thyroiditis",
        "AITD",
      ]),
    ).toBe(false);
  });

  it("rejects a combined genotype read as one allele, and takes the allele itself", () => {
    const dr = (quote: string, times: number) =>
      mod({
        paperIndex: 2,
        doi: "10.3/hla",
        conditionId: "addisons",
        featureId: "fact:genome:hla_dr",
        when: { includes: "dr3" },
        times,
        quote,
      });
    const { proposals } = judgeProposals(
      [
        dr(
          "the HLA-DR3-DQ2/DR4-DQ8 genotype conferred the highest risk of Addison's disease (OR 32)",
          32,
        ),
        dr("HLA-DR3 carriers had Addison's disease more often (OR 3.0).", 3),
      ],
      ctx3,
    );
    expect(proposals[0]!.decision).toBe("rejected");
    expect(proposals[0]!.reason).toMatch(/combination/);
    expect(proposals[1]!.decision).toBe("accepted");
  });

  it("maps a feature name onto a known metric, and never mints one", () => {
    const zeta = (over: Partial<RawProposal>) =>
      raw({
        featureId: null,
        quote:
          "Parietal cell antibodies had a sensitivity of 81% and a specificity of 90% for atrophic body gastritis.",
        ...over,
      });
    const withMetrics = {
      ...ctx,
      features: [],
      metrics: new Map([
        [normalizeName("Parietal cell antibodies"), { code: "pca_x", unit: null }],
      ]),
      names: new Map([["metric:pca_x", ["Parietal cell antibodies"]]]),
    };
    const { proposals } = judgeProposals(
      [
        zeta({ featureName: "parietal cell antibodies" }),
        zeta({ featureName: "gastric anti-parietal cell aphthous antibody" }),
        zeta({ featureId: "metric:not_a_marker" }),
      ],
      withMetrics,
    );
    expect(proposals[0]!.featureId).toBe("metric:pca_x");
    expect(proposals[0]!.decision).toBe("accepted");
    expect(proposals[1]!.reason).toBe("the feature matches no known metric");
    expect(proposals[2]!.reason).toBe("the feature matches no known metric");
  });

  // generic ids: an open cause, a failed treatment, a cause found among them
  const openCase: CaseSummary = {
    asOf: "2025-06-01",
    beliefs: [],
    items: [
      {
        key: "cause:cond_open",
        kind: "cause",
        text: "",
        codes: ["ferritin"],
        terms: ["Open condition"],
      },
      {
        key: "no_response:ferritin",
        kind: "no_response",
        text: "",
        codes: ["ferritin"],
        terms: failureTerms("ferritin", "oral"),
      },
    ],
  };
  const causePaper: Paper = {
    ...paper,
    doi: "10.3/cause",
    abstract:
      "Among 200 patients with refractory iron deficiency, Found condition was the cause in 20% of cases. Of 150 patients with Open condition, 50% had Found condition. Other thing was seen in 10% of patients with Found condition.",
  };
  const causeCtx = {
    ...ctx,
    papers: [causePaper],
    catalog: new Map([
      ["cond_open", { name: "Open condition", base: 0.3 }],
      ["cond_found", { name: "Found condition", base: 0.05 }],
      ["cond_other", { name: "Other thing", base: 0.1 }],
    ]),
    features: [
      {
        id: "fact:no_response:ferritin",
        name: "no response of ferritin to treatment",
        unit: null,
      },
      { id: "hypothesis:cond_open", name: "Open condition", unit: null },
      { id: "hypothesis:cond_found", name: "Found condition", unit: null },
    ],
    summary: openCase,
  };
  const cause = (over: Partial<RawProposal>) =>
    raw({
      kind: "cause",
      doi: "10.3/cause",
      conditionId: "cond_found",
      sensitivity: null,
      specificity: null,
      when: null,
      ...over,
    });

  it("reads a cause share among the open condition or its failed treatment", () => {
    const { proposals } = judgeProposals(
      [
        cause({
          featureId: "fact:no_response:ferritin",
          prevalence: 0.2,
          among: "patients with refractory iron deficiency",
          shareOf: "Found condition",
          quote:
            "Among 200 patients with refractory iron deficiency, Found condition was the cause in 20% of cases.",
        }),
        cause({
          featureId: "hypothesis:cond_open",
          prevalence: 0.5,
          among: "patients with Open condition",
          shareOf: "Found condition",
          quote: "Of 150 patients with Open condition, 50% had Found condition.",
        }),
        // a cause of something whose cause is not open
        cause({
          conditionId: "cond_other",
          featureId: "hypothesis:cond_found",
          prevalence: 0.1,
          among: "patients with Found condition",
          shareOf: "Other thing",
          quote:
            "Other thing was seen in 10% of patients with Found condition.",
        }),
        // no share, no cause rule
        cause({
          featureId: "hypothesis:cond_open",
          times: 2,
          quote: "Of 150 patients with Open condition, 50% had Found condition.",
        }),
      ],
      causeCtx,
    );
    expect(proposals.map((p) => `${p.decision} ${p.reason}`)).toEqual([
      expect.stringMatching(/^accepted/),
      expect.stringMatching(/^accepted/),
      expect.stringMatching(/^rejected/),
      expect.stringMatching(/^rejected/),
    ]);
    expect(proposals[0]!.lrPos).toBe(4); // 0.2 / 0.05
    expect(proposals[0]!.conditionOn).toEqual({
      includes: "oral|iv|any",
      share: 0.2,
    });
    expect(proposals[0]!.causeOf).toBe("cond_open");
    expect(proposals[1]!.lrPos).toBe(6); // 10, capped
    expect(proposals[2]!.reason).toMatch(/cause is open/);
    expect(proposals[3]!.reason).toMatch(/needs the share/);
    const rows = overlayRows(proposals);
    expect(rows.modifiers.map((m) => m.why)).toEqual([
      expect.stringContaining("cause of cond_open"),
      expect.stringContaining("cause of cond_open"),
    ]);
  });

  it("counts a cause among the population the title names, and not the other way", () => {
    const series: Paper = {
      ...paper,
      doi: "10.3/series",
      title: "Hidden causes of Open condition in adults without symptoms",
      abstract:
        "The remaining 71 patients underwent biopsies. Causes were found in 36 patients (51%), including 19 with Found condition and 4 with Other thing.",
    };
    const quote =
      "Causes were found in 36 patients (51%), including 19 with Found condition and 4 with Other thing.";
    const c = (over: Partial<RawProposal>) =>
      cause({
        doi: "10.3/series",
        featureId: "hypothesis:cond_open",
        shareOf: "19 with Found condition",
        count: 19,
        total: 71,
        quote,
        ...over,
      });
    const { proposals } = judgeProposals(
      [
        c({}),
        // a total the abstract never printed
        c({ total: 70 }),
        // the counted group is some other condition
        c({ shareOf: "4 with Other thing", count: 4 }),
        // no shareOf: code reads the words after the count
        c({ shareOf: null }),
        c({ shareOf: null, count: 4 }),
        c({ shareOf: null, count: 36 }),
      ],
      { ...causeCtx, papers: [series] },
    );
    expect(proposals[0]!.decision).toBe("accepted");
    expect(proposals[0]!.lrPos).toBe(5.36); // 19/71 = 0.268 over 0.05
    expect(proposals[1]!.reason).toMatch(/needs the share/);
    expect(proposals[2]!.reason).toMatch(/not the condition/);
    expect(proposals[3]!.decision).toBe("accepted");
    expect(proposals[4]!.reason).toMatch(/not the condition/);
    expect(proposals[5]!.reason).toMatch(/not the condition/);
    // "X causes Y" is no population of X
    expect(
      titlePopulation(
        { title: "Open condition causes bone loss in mice", abstract: "" },
        ["Open condition"],
      ),
    ).toBe(false);
    expect(
      titlePopulation(
        { title: "Found condition is a frequent cause of Open condition", abstract: "" },
        ["Open condition"],
      ),
    ).toBe(true);
    // a phrase with its own field is left alone by the strict form
    expect(caseQuery('TITLE:"a b" AND "c d"')).toMatch(
      /^\(TITLE:"a b" AND \(TITLE:"c d" OR ABSTRACT:"c d"\)\)/,
    );
  });

  it("searches the causes of an open condition and of its failed treatment", () => {
    expect(causeQueries(openCase)).toEqual([
      'TITLE:"Open condition" AND (TITLE:etiology OR TITLE:aetiology OR TITLE:causes OR TITLE:cause OR TITLE:underlying)',
      '(TITLE:"refractory iron deficiency" OR TITLE:"oral iron failure") AND (etiology OR aetiology OR causes OR cause OR underlying)',
    ]);
    expect(causeQueries({ ...openCase, items: [openCase.items[1]!] })).toEqual(
      [],
    );
  });

  it("finds conditions an abstract names, ring 1 first, never by a bare abbreviation", () => {
    const all = [
      { id: "r2", name: "Zetaform syndrome", ring: 2 as const, names: ["Zetaform syndrome"] },
      {
        id: "r1",
        name: "Yotta gastritis",
        ring: 1 as const,
        names: ["Yotta gastritis", "yotta gastric atrophy", "YG"],
      },
      { id: "r1b", name: "Kappa", ring: 1 as const, names: ["Kappa", "KP"] },
      { id: "seen", name: "Open condition", ring: 1 as const, names: ["Open condition"] },
    ];
    const ps = [
      { ...paper, abstract: "Yotta gastric atrophy and zetaform syndrome; YG and KP." },
      { ...paper, abstract: "Zetaform syndrome again, and open condition." },
    ];
    expect(mentionedConditions(ps, all, new Set(["seen"]))).toEqual([
      { id: "r1", ring: 1, papers: 1 },
      { id: "r2", ring: 2, papers: 2 },
    ]);
  });

  it("runs the cause track apart, and offers what the papers name", async () => {
    const seen: { designs?: string; conditions: string[]; features: string[] } = {
      conditions: [],
      features: [],
    };
    const deps: CaseDeps = {
      ask: async () => ({ queries: [], costUsd: 0 }),
      search: async (_q, _asOf, designs) => {
        seen.designs = designs;
        return [causePaper];
      },
      read: async (_p, _s, conditions, features) => {
        seen.conditions = conditions.map((c) => c.id);
        seen.features = features.map((f) => f.id);
        return { items: [], costUsd: 0.01 };
      },
      widen: async () => ({
        conditions: [{ id: "cond_found", name: "Found condition", tests: ["Test F"] }],
        features: [{ id: "metric:f_marker", name: "F marker", unit: null }],
      }),
    };
    const run = await runCase(openCase, deps, {
      budgetUsd: 1,
      conditions: [{ id: "cond_open", name: "Open condition" }],
      features: [],
    });
    expect(seen.designs).toBe(CAUSE_DESIGNS);
    expect(run.causePapers.map((p) => p.doi)).toEqual(["10.3/cause"]);
    expect(seen.conditions).toEqual(["cond_open", "cond_found"]);
    expect(seen.features).toEqual(["metric:f_marker"]);
  });
});

describe("verbatimIn", () => {
  const abs = "Group of 50 people. Other text here. Found 9 with thing one, 3 with thing two.";
  it("accepts whole and elided quotes in order", () => {
    expect(verbatimIn("Found 9 with thing one", abs)).toBe(true);
    expect(verbatimIn("Group of 50 people. ... Found 9 with thing one", abs)).toBe(true);
    expect(verbatimIn("Group of 50 people. [...] Found 9 with thing one, ... 3 with thing two", abs)).toBe(true);
  });
  it("rejects invented parts, reordered parts and empty quotes", () => {
    expect(verbatimIn("Group of 50 people ... Found 12 with thing one", abs)).toBe(false);
    expect(verbatimIn("Found 9 with thing one ... Group of 50 people", abs)).toBe(false);
    expect(verbatimIn(" ... ", abs)).toBe(false);
  });
  it("reads a section heading as a break", () => {
    const tagged = "Last method line.<h4>Results</h4>A result line with H<sub>2</sub>O.";
    expect(verbatimIn("Last method line.\n\nResults\n... A result line with H2O.", tagged)).toBe(true);
  });
});

describe("the whole-word name guard", () => {
  it("does not read hypothyroxinemia as hypothyroidism", () => {
    expect(sameWord("hypothyroxinemia", "hypothyroidism")).toBe(false);
    expect(namesIt("hypothyroxinemia in pregnancy", "hypothyroidism")).toBe(false);
  });
  it("still reads the inflections of one word", () => {
    expect(sameWord("hypothyroid", "hypothyroidism")).toBe(true);
    expect(sameWord("anaemia", "anaemic")).toBe(true);
    expect(namesIt("iron deficient women", "iron deficiency")).toBe(true);
  });
  it("rejects the Thyroid 2017 quote as evidence for hypothyroidism", () => {
    // doi:10.1089/thy.2017.0491
    const quote =
      "ID was an independent risk factor for hypothyroxinemia (odds ratio = 14.86";
    const abstract =
      "Iron deficiency (ID) in the first trimester of pregnancy. " + quote;
    expect(namedIn(quote, abstract, ["Hypothyroidism"])).toBe(false);
    expect(namedIn(quote, abstract, ["Iron deficiency"])).toBe(true);
  });
});

describe("populationOf", () => {
  it("reads a symptom exclusion out of the title", () => {
    const p = populationOf({
      title:
        "Diagnostic yield of gastric investigations in iron deficiency anaemia patients without gastrointestinal symptoms",
      abstract: "",
    });
    expect(p?.population).toMatch(/without gastrointestinal symptoms/);
    expect(p?.unless?.map((u) => u.fact)).toEqual(["sym_bowel", "sym_bloating"]);
  });
  it("finds nothing in a title with no exclusion", () => {
    expect(populationOf({ title: "Iron deficiency in adults", abstract: "" })).toBeNull();
  });
});

describe("Europe PMC down", () => {
  it("throws on a flagged failure and forgets it, so a retry searches again", async () => {
    let calls = 0;
    const down = async () => {
      calls++;
      return Object.assign([], { failed: "HTTP 503" });
    };
    const key = `test-down-${Math.random()}`;
    await expect(memo(key, () => searchOrThrow("q", 5, down))).rejects.toThrow(
      EpmcUnavailable,
    );
    await expect(memo(key, () => searchOrThrow("q", 5, down))).rejects.toThrow(
      /Europe PMC unavailable/,
    );
    expect(calls).toBe(2);
    const up = async () => [{ id: "1" }] as never;
    const k2 = `test-up-${Math.random()}`;
    await memo(k2, () => searchOrThrow("q", 5, up));
    await memo(k2, () => searchOrThrow("q", 5, down));
    expect(calls).toBe(2); // the success was kept
  });
});

describe("reading cycles", () => {
  const quote =
    "In 300 patients with autoimmune thyroiditis, atrophic gastritis was found with an odds ratio of 3.2 compared with controls";
  const mod = raw({
    kind: "modifier",
    featureId: "hypothesis:hashimoto",
    when: { above: 0.5 },
    times: 3.2,
    quote,
  });
  it("refuses a rule whose parent already reads the condition", () => {
    const needs = new Map([["hashimoto", new Set(["atrophic_gastritis"])]]);
    const { proposals } = judgeProposals([mod], { ...ctx, needs });
    expect(proposals[0]!.decision).toBe("rejected");
    expect(proposals[0]!.reason).toMatch(/closes a reading cycle/);
    // the same rule with no cycle in the catalog
    expect(
      judgeProposals([mod], { ...ctx, needs: new Map() }).proposals[0]!.decision,
    ).toBe("accepted");
  });
  it("reads the order out of a catalog", () => {
    const needs = needsOf([
      {
        id: "c",
        requires: { id: "x", minScore: 0.25 },
        evidence: [{ input: { hypothesis: "y" } }],
        priors: { base: 0.1, modifiers: [{ when: { hypothesis: "z" } }] },
      },
    ] as never);
    expect([...needs.get("c")!].sort()).toEqual(["x", "y", "z"]);
  });
});
