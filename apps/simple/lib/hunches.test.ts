import { describe, expect, it } from "vitest";
import type { HunchExplanation } from "@/db";
import {
  causeSignals,
  causeTest,
  causesFrom,
  causesOfCondition,
  chooseTest,
  closedList,
  differentialOf,
  differentialLine,
  MIN_OTHER,
  linkFeature,
  outcomeOf,
  predictionsOf,
  priceTest,
  weightsOf,
  type EvidenceRow,
  type TestRow,
} from "./hunches";
import type { Graph } from "./kg";

const ex = (id: string, check: HunchExplanation["check"] = null, conditionId: string | null = null): HunchExplanation => ({
  id, text: id, grade: "A", basis: "science", source: null, conditionId, weight: 0, predicts: null, check,
});

const TESTS: TestRow[] = [
  { id: "serum_folate", name: "Serum folate", featureIds: ["folic_acid"], cost: 1, costByCountry: { RO: 11.41 } },
  { id: "ttg", name: "tTG-IgA with total IgA", featureIds: ["ttg_iga"], cost: 1, costByCountry: { RO: 37.08 } },
  { id: "ferritin", name: "Ferritin", featureIds: ["ferritin"], cost: 1, costByCountry: { RO: 10.84 } },
];

describe("weightsOf", () => {
  it("takes the engine's belief where there is one and shares the rest", () => {
    const w = weightsOf([ex("a", null, "iron_deficiency"), ex("b"), ex("c")], { iron_deficiency: { p: 0.2 } });
    expect(w.map((e) => e.weight)).toEqual([0.2, 0.4, 0.4]);
  });

  it("a grade-E guess never passes half the top graph explanation", () => {
    const w = weightsOf([ex("a"), { ...ex("b"), grade: "E" }], null);
    expect(w.map((e) => e.weight)).toEqual([0.667, 0.333]);
    const scored = weightsOf(
      [ex("a", null, "coeliac"), ex("b", null, "sibo"), { ...ex("c"), grade: "E" }],
      { coeliac: { p: 0.01 }, sibo: { p: 0.1 } },
    );
    expect(scored.map((e) => e.weight)).toEqual([0.063, 0.625, 0.313]);
  });

  it("a chip triples what it favours, then renormalises", () => {
    const w = weightsOf([ex("a"), ex("b")], null, { favours: ["a"] });
    expect(w.map((e) => e.weight)).toEqual([0.75, 0.25]);
  });
});

describe("chooseTest", () => {
  const folate = ex("folate", { code: "folic_acid", op: "<", value: 4 });
  const coeliac = ex("coeliac", { code: "ttg_iga", op: ">", value: 10 });
  const iron = ex("iron", { code: "ferritin", op: "<", value: 15 });

  it("prefers the cheaper split per euro with a country price", () => {
    const t = chooseTest(weightsOf([folate, coeliac, ex("diet")], null), new Set(), TESTS, "RO", {});
    expect(t).toMatchObject({ code: "folic_acid", name: "Serum folate", currency: "RON", price: 60, estimated: false });
    expect(t!.eur).toBe(11.41);
  });

  it("skips a marker the last draws already answered", () => {
    const t = chooseTest(weightsOf([iron, coeliac, folate], null), new Set(["ferritin", "folic_acid"]), TESTS, null, {});
    expect(t?.code).toBe("ttg_iga");
  });

  it("with no country the band price stands in, marked estimated", () => {
    expect(priceTest("folic_acid", TESTS, null, "Folate")).toMatchObject({ eur: 10, currency: "EUR", estimated: true });
  });

  it("returns null when nothing splits the explanations", () => {
    expect(chooseTest([ex("a"), ex("b")], new Set(), TESTS, null, {})).toBeNull();
  });
});

describe("predictions and the outcome", () => {
  const expl = [
    ex("folate", { code: "folic_acid", op: "<", value: 4 }),
    ex("coeliac", { code: "ttg_iga", op: ">", value: 10 }),
    ex("diet"),
  ];
  const test = priceTest("folic_acid", TESTS, null, "Folate");
  const preds = predictionsOf(expl, test, "Folate", "ng/mL")!;

  it("writes one prediction per explanation, the rest predict normal", () => {
    expect(preds.map((p) => [p.explanationId, p.check.op, p.check.value])).toEqual([
      ["folate", "<", 4], ["coeliac", ">", 4], ["diet", ">", 4],
    ]);
    expect(preds[0]!.text).toBe("If folate: Folate under 4 ng/mL.");
  });

  it("one match confirms, several narrow, none rules out", () => {
    expect(outcomeOf(preds, 3)).toEqual({ outcome: "confirmed", matched: ["folate"] });
    expect(outcomeOf(preds, 9).outcome).toBe("narrowed");
    expect(outcomeOf([preds[0]!], 9).outcome).toBe("ruled_out");
  });
});

describe("causesFrom and closedList", () => {
  const graph: Graph = {
    nodes: [
      { id: "metric:ferritin", kind: "metric", name: "Ferritin", codes: ["ferritin"] },
      { id: "condition:coeliac", kind: "condition", name: "Coeliac disease" },
      { id: "intervention:iron", kind: "intervention", name: "Iron" },
      { id: "risk:ascvd", kind: "risk", name: "ASCVD" },
    ],
    edges: [
      { id: "1", from: "condition:coeliac", to: "metric:ferritin", relation: "lowers", strength: 2, confidence: "established", basis: "science", mechanism: "", evidence: [{ kind: "guideline", title: "BSG" }], source: "seed" },
      { id: "2", from: "intervention:iron", to: "metric:ferritin", relation: "raises", strength: 2, confidence: "established", basis: "science", mechanism: "", evidence: [{ kind: "guideline", title: "X" }], source: "seed" },
    ],
  };
  const evidence: EvidenceRow[] = [
    { conditionId: "coeliac_disease", conditionName: "Coeliac disease", featureId: "metric:ttg_iga", conditionOn: { above: 10 }, lrPos: 30, grade: "A", source: "BSG 2014: tTG" },
    { conditionId: "iron_deficiency", conditionName: "Iron deficiency", featureId: "metric:ferritin", conditionOn: { below: 30 }, lrPos: 20, grade: "A", source: "Guyatt 1992: x" },
    { conditionId: "iron_deficiency", conditionName: "Iron deficiency", featureId: "metric:ferritin", conditionOn: { above: 100 }, lrPos: 0.08, grade: "A", source: "Guyatt 1992: y" },
    { conditionId: "ascvd_risk", conditionName: "Atherosclerotic risk", featureId: "metric:ferritin", conditionOn: { below: 5 }, lrPos: 2, grade: "A", source: "z" },
  ];
  const causes = causesFrom(graph, evidence, ["ferritin"]);

  it("maps the kg condition onto its hkb twin, with the twin's strongest check", () => {
    expect(causes.ferritin!.find((c) => c.id === "coeliac_disease")).toMatchObject({
      dir: "down", conditionId: "coeliac_disease", check: { code: "ttg_iga", op: ">", value: 10 }, source: "BSG",
    });
  });

  it("drops evidence against a condition and consequences named _risk", () => {
    expect(causes.ferritin!.map((c) => c.id).sort()).toEqual(["coeliac_disease", "intervention:iron", "iron_deficiency"]);
  });

  it("keeps only causes that fit the direction of the move", () => {
    const list = closedList({ kind: "step", codes: ["ferritin"], dir: "down" }, causes);
    expect(list.map((c) => c.id)).toEqual(["coeliac_disease", "iron_deficiency"]);
  });
});

describe("cause hunches (phase 41B)", () => {
  const graph: Graph = {
    nodes: [
      { id: "condition:iron_deficiency", kind: "condition", name: "Iron deficiency" },
      { id: "condition:coeliac", kind: "condition", name: "Coeliac disease" },
      { id: "behavior:heavy_periods", kind: "behavior", name: "Heavy periods" },
    ],
    edges: [
      { id: "1", from: "behavior:heavy_periods", to: "condition:iron_deficiency", relation: "raises", strength: 2, confidence: "established", basis: "science", mechanism: "", evidence: [{ kind: "guideline", title: "BSG" }], source: "seed" },
    ],
  };
  const row = (conditionId: string, featureId: string, lrPos: number, conditionOn: Record<string, unknown> = {}): EvidenceRow => ({
    conditionId, conditionName: conditionId, featureId, conditionOn, lrPos, grade: "B", source: "Paper 2020: text",
  });
  const evidence = [
    row("coeliac_disease", "hypothesis:iron_deficiency", 3),
    row("coeliac_disease", "metric:ttg_iga", 20, { above: 10 }),
    row("iron_deficiency", "metric:ferritin", 50, { below: 15 }),
    row("iron_deficiency_cause_gi", "metric:ttg_iga", 5, { above: 10 }),
  ];
  const conditions = [
    { id: "iron_deficiency", name: "Iron deficiency", requires: null },
    { id: "coeliac_disease", name: "Coeliac disease", requires: null },
    { id: "iron_deficiency_cause_gi", name: "GI loss", requires: { condition: "iron_deficiency", minState: 2 } },
  ];

  it("lists graph edges, hypothesis evidence and requires as the causes", () => {
    const causes = causesOfCondition("iron_deficiency", graph, evidence, conditions);
    expect(causes.map((c) => c.id).sort()).toEqual(["behavior:heavy_periods", "coeliac_disease", "iron_deficiency_cause_gi"]);
    expect(causes.find((c) => c.id === "coeliac_disease")!.check).toEqual({ code: "ttg_iga", op: ">", value: 10 });
  });

  it("links a case-research cause, with its origin, and never the reverse", () => {
    const paper = { ...row("atrophic_gastritis", "hypothesis:iron_deficiency", 4.2), grade: "C", origin: "paper" as const };
    const reverse = { ...row("iron_deficiency", "hypothesis:atrophic_gastritis", 3), origin: "paper" as const };
    const causes = causesOfCondition("iron_deficiency", graph, evidence, conditions, [paper, reverse]) as (ReturnType<typeof causesOfCondition>[number] & { origin?: string })[];
    expect(causes.find((c) => c.id === "atrophic_gastritis")).toMatchObject({ grade: "C", origin: "paper", conditionId: "atrophic_gastritis" });
    expect(causes.find((c) => c.id === "coeliac_disease")!.origin).toBe("catalog");
    expect(causes.some((c) => c.id === "iron_deficiency")).toBe(false);
    // without the link, atrophic gastritis is no cause
    expect(causesOfCondition("iron_deficiency", graph, evidence, conditions).some((c) => c.id === "atrophic_gastritis")).toBe(false);
  });

  it("opens one cause hunch per settled belief with two causes or more", () => {
    const causes = { iron_deficiency: causesOfCondition("iron_deficiency", graph, evidence, conditions) };
    const beliefs = { iron_deficiency: { p: 0.93, state: "confirmed" }, coeliac_disease: { p: 0.01, state: "ruled_out" } };
    const s = causeSignals(beliefs, causes, evidence, ["ferritin"], { iron_deficiency: "Iron deficiency" });
    expect(s.map((x) => x.key)).toEqual(["cause:iron_deficiency"]);
    expect(s[0]).toMatchObject({ kind: "cause", codes: ["ferritin"], numbers: { conditionId: "iron_deficiency", state: "confirmed" } });
    expect(causeSignals({ iron_deficiency: { p: 0.3, state: "possible" } }, causes, evidence, ["ferritin"], {})).toEqual([]);
  });
});

describe("41C round 3: the cause hunch's test", () => {
  const ex = (id: string, weight: number): HunchExplanation => ({
    id,
    text: id,
    grade: "B",
    basis: "science",
    source: null,
    conditionId: id,
    weight,
    predicts: null,
    check: null,
  });
  const t = (id: string, cost: number, lrPos: number, codes: string[]): TestRow => ({
    id,
    name: id,
    featureIds: codes,
    cost,
    costByCountry: null,
    lrPos,
  });
  const tests = [
    t("t_low", 1, 3, ["m_low"]),
    t("t_high", 2, 8, ["m_high"]),
    t("t_scope", 4, 20, ["m_scope"]),
    t("t_tie", 1, 8, ["m_tie"]),
    t("t_other", 1, 5, ["m_other"]),
  ];
  const person = (known: string[]) => ({
    tests,
    known: new Set(known),
    country: null,
    conditionTests: {
      c_top: ["t_low", "t_high", "t_scope"],
      c_next: ["t_other"],
    },
  });

  it("confirms the leading cause: its best cheap test not already answered", () => {
    const expl = [ex("c_next", 0.3), ex("c_top", 0.7)];
    expect(causeTest(expl, person([]))?.name).toBe("t_high");
    // answered already: the next best of the same cause
    expect(causeTest(expl, person(["m_high"]))?.name).toBe("t_low");
    // the leading cause has nothing cheap left: the next cause's test
    expect(causeTest(expl, person(["m_high", "m_low"]))?.name).toBe("t_other");
    // an LR tie goes to the cheaper test
    const tie = { ...person([]), conditionTests: { c_top: ["t_high", "t_tie"] } };
    expect(causeTest(expl, tie)?.name).toBe("t_tie");
    expect(causeTest([ex("c_none", 1)], person([]))).toBeNull();
  });

  it("reads a case-research cause rule on a failed treatment as a link on the condition", () => {
    expect(
      linkFeature("fact:no_response:m", "fact:no_response:m (B; case research, cause of c_open, doi:10.1/x)"),
    ).toBe("hypothesis:c_open");
    expect(linkFeature("hypothesis:c_a", "hypothesis:c_a (B; case research, doi:10.1/x)")).toBe(
      "hypothesis:c_a",
    );
  });
});

describe("differentialOf", () => {
  type H = import("./hypotheses").Hypothesis;
  const h = (over: Partial<H>): H => ({
    id: "t",
    name: "T",
    summary: "",
    priors: { base: 0.05, modifiers: [] },
    evidence: [],
    discriminators: [],
    lenses: {},
    management: "",
    ...over,
  });
  const test = (name: string, code: string, cost: 1 | 2) => ({
    test: name,
    codes: [code],
    cost,
    lrPos: 8,
    lrNeg: 0.3,
  });
  const share = (id: string, s: number) => ({
    when: { hypothesis: "x", above: 0.5 },
    times: 6,
    why: `hypothesis:x (C; case research, cause of x, doi:10.1/${id})`,
    share: s,
    grade: "C" as const,
    source: `Paper ${id}; doi:10.1/${id}`,
  });
  const catalog: H[] = [
    h({ id: "x", name: "Iron deficiency" }),
    h({
      id: "a",
      name: "Atrophic gastritis",
      priors: { base: 0.02, modifiers: [share("a", 0.27)] },
      discriminators: [test("Intrinsic factor antibodies", "ifab", 2)],
    }),
    h({
      id: "b",
      name: "GI loss",
      requires: { id: "x", minScore: 0.25 },
      discriminators: [test("Stool blood", "fit", 1)],
    }),
    h({
      id: "c",
      name: "Coeliac",
      priors: { base: 0.01, modifiers: [share("c", 0.06)] },
      discriminators: [test("tTG-IgA", "ttg", 1)],
    }),
    h({ id: "d", name: "Unrelated" }),
  ];
  const beliefs = {
    x: { p: 0.8 },
    a: { p: 0.25, given: { "hypothesis:x": 0.28 } },
    b: { p: 0.07 },
    c: { p: 0.02 },
    d: { p: 0.5 },
  };

  it("lists the causes of an open condition, each with a source and a test", () => {
    const d = differentialOf("x", beliefs, catalog)!;
    expect(d.options.map((o) => o.id)).toEqual(["a", "b", "c"]);
    const [a, b, c] = d.options;
    expect(a).toMatchObject({ p: 0.28, basis: "share", origin: "paper" });
    expect(a!.source).toMatch(/doi:10\.1\/a/);
    expect(a!.test?.name).toBe("Intrinsic factor antibodies");
    expect(b).toMatchObject({ p: 0.07, basis: "requires", origin: "catalog" });
    expect(b!.source).toMatch(/^catalog: /);
    // no given posterior: the belief read through p(X)
    expect(c!.p).toBeCloseTo(0.025, 3);
    const sum = d.options.reduce((s, o) => s + o.share, 0) + d.other;
    expect(sum).toBeCloseTo(1, 3);
    expect(d.splitBy?.name).toBeTruthy();
  });

  it("keeps room for 'other' when the options would fill the list", () => {
    const d = differentialOf(
      "x",
      { ...beliefs, a: { p: 0.8, given: { "hypothesis:x": 0.9 } }, b: { p: 0.5 } },
      catalog,
    )!;
    expect(d.other).toBeGreaterThanOrEqual(MIN_OTHER - 1e-9);
    expect(d.options.reduce((s, o) => s + o.share, 0) + d.other).toBeCloseTo(1, 3);
    expect(differentialLine(d)).toMatch(
      /^iron deficiency, cause open: Atrophic gastritis \d+% \(.*; confirm with Intrinsic factor antibodies\), .*other \d+%; test that splits them: /,
    );
  });

  it("returns null without a belief for the condition", () => {
    expect(differentialOf("x", null, catalog)).toBeNull();
    expect(differentialOf("x", { a: { p: 0.1 } }, catalog)).toBeNull();
  });

  it("drops a test once it is measured", () => {
    const d = differentialOf("x", beliefs, catalog, { known: new Set(["ifab"]) })!;
    expect(d.options[0]!.test).toBeNull();
  });
});
