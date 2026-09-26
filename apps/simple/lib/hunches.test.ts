import { describe, expect, it } from "vitest";
import type { HunchExplanation } from "@/db";
import {
  causesFrom,
  chooseTest,
  closedList,
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
