import { describe, it, expect } from "vitest";
import { adoptBodyOf, type PlanLine } from "./actions";
import type { Move } from "./infogain";
import {
  askCandidates,
  codesNamedIn,
  evidenceSource,
  interventionSource,
  mechanismsFor,
  noActs,
  pickActs,
  rankSources,
  rankTerms,
  settlesLine,
  type TermRow,
} from "./lookup";

const term = (
  id: string,
  name: string,
  synonyms: string[] | null = null,
  ontology = "MONDO",
): TermRow => ({ id, ontology, name, synonyms });

describe("rankTerms", () => {
  const rows = [
    term("MONDO:7770561", "hemochromatosis, dog"),
    term("MONDO:0019257", "hemochromatosis type 2"),
    term("MONDO:0006507", "hereditary hemochromatosis", [
      "haemochromatosis",
      "bronze diabetes",
    ]),
    term("MONDO:0021001", "hemochromatosis type 1", ["HFE hemochromatosis"]),
  ];

  it("puts the exact synonym first, on the British spelling", () => {
    const ranked = rankTerms("haemochromatosis", rows);
    expect(ranked[0]!.id).toBe("MONDO:0006507");
    expect(ranked[0]!.via).toBe("haemochromatosis");
  });

  it("puts the dog disease last", () => {
    const ranked = rankTerms("hemochromatosis", rows);
    expect(ranked.map((r) => r.id)).toContain("MONDO:7770561");
    expect(ranked[ranked.length - 1]!.id).toBe("MONDO:7770561");
  });

  it("prefers the exact name over a longer one that contains it", () => {
    const ranked = rankTerms("hemochromatosis type 2", rows);
    expect(ranked[0]!.id).toBe("MONDO:0019257");
  });

  it("matches a word at a time when nothing contains the whole query", () => {
    const ranked = rankTerms("bronze diabetes iron", rows);
    expect(ranked[0]!.id).toBe("MONDO:0006507");
  });

  it("drops candidates that share nothing", () => {
    expect(rankTerms("marfan", rows)).toHaveLength(0);
  });

  it("returns at most eight", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      term(`MONDO:${i}`, `hemochromatosis variant ${i}`),
    );
    expect(rankTerms("hemochromatosis", many)).toHaveLength(8);
  });

  it("ranks a short name above a long one at the same overlap", () => {
    const ranked = rankTerms("mastocytosis", [
      term(
        "MONDO:0020332",
        "systemic mastocytosis with an associated clonal hematologic non-mast cell lineage disease",
      ),
      term("MONDO:0007950", "mastocytosis"),
    ]);
    expect(ranked[0]!.id).toBe("MONDO:0007950");
  });

  it("keeps HPO terms searchable alongside diseases", () => {
    const ranked = rankTerms("fatigue", [
      term("HP:0012378", "Fatigue", null, "HP"),
      term("MONDO:0005180", "chronic fatigue syndrome"),
    ]);
    expect(ranked[0]!.id).toBe("HP:0012378");
    expect(ranked[0]!.ontology).toBe("HP");
  });
});

/**
 * Phase 27. The answer now hands the UI buttons, and a button is only honest
 * when the thing behind it exists: the model returns ids, and everything it
 * returns that was never on offer is dropped here rather than rendered.
 */
const line = (id: string, title: string): PlanLine => ({
  id,
  title,
  source: id.startsWith("int:") ? "papers" : "plan",
  dose: null,
  basis: "science",
  label: "[science]",
  why: "because",
  target: null,
});

const move = (code: string, label: string, band?: number): Move =>
  ({
    kind: "test",
    featureId: `metric:${code}`,
    label,
    cost: 2,
    ...(band == null ? {} : { band }),
    outcomes: [],
    entropyBefore: 1,
    entropyAfter: 0.5,
    gain: 0.5,
    ratio: 0.1,
    shift: 0.2,
    moves: [],
  }) as unknown as Move;

describe("askCandidates", () => {
  const c = askCandidates({
    actions: [line("plan:r1:0", "Selenium")],
    measured: ["ferritin", "hba1c"],
    moves: [move("ogtt_insulin", "OGTT with insulin", 3), move("ferritin", "Ferritin", 1)],
    questions: [{ key: "family_history", question: "Anyone in the family?" }],
  });

  it("keeps the engine's own retest window per marker", () => {
    expect(c.tests.find((t) => t.code === "hba1c")!.weeks).toBe(12);
  });

  it("says which tests a person cannot order for themselves", () => {
    expect(c.tests.find((t) => t.code === "ogtt_insulin")!.selfOrder).toBe(false);
    expect(c.tests.find((t) => t.code === "ferritin")!.selfOrder).toBe(true);
  });

  it("names a move's test the way the move names it", () => {
    expect(c.tests.find((t) => t.code === "ogtt_insulin")!.name).toBe(
      "OGTT with insulin",
    );
  });

  it("carries every measured marker, once", () => {
    expect(c.tests.filter((t) => t.code === "ferritin")).toHaveLength(1);
    expect(c.tests.map((t) => t.code)).toContain("hba1c");
  });
});

describe("pickActs: the model chooses, the engine owns", () => {
  const candidates = askCandidates({
    actions: [line("plan:r1:0", "Selenium"), line("int:abc", "Iron")],
    measured: ["ferritin"],
    moves: [],
    questions: [{ key: "family_history", question: "Anyone in the family?" }],
  });

  it("keeps only ids that were on offer, and counts the rest", () => {
    const acts = pickActs(
      {
        actions: ["plan:r1:0", "plan:r1:9", "int:nope"],
        tests: [{ code: "ferritin", weeks: 8 }, { code: "made_up", weeks: 4 }],
        questions: ["family_history", "invented_key"],
      },
      candidates,
    );
    expect(acts.actions.map((a) => a.title)).toEqual(["Selenium"]);
    expect(acts.tests.map((t) => t.code)).toEqual(["ferritin"]);
    expect(acts.questions.map((q) => q.key)).toEqual(["family_history"]);
    expect(acts.dropped).toEqual([
      "plan:r1:9",
      "int:nope",
      "made_up",
      "invented_key",
    ]);
  });

  it("takes the model's number of weeks when it is a sane one", () => {
    const acts = pickActs({ tests: [{ code: "ferritin", weeks: 8 }] }, candidates);
    expect(acts.tests[0]!.weeks).toBe(8);
  });

  it("falls back to the engine's window on a mad one", () => {
    for (const weeks of [0, -3, 500, Number.NaN])
      expect(
        pickActs({ tests: [{ code: "ferritin", weeks }] }, candidates).tests[0]!
          .weeks,
      ).toBe(12);
  });

  it("never repeats an id", () => {
    const acts = pickActs(
      {
        actions: ["plan:r1:0", "plan:r1:0"],
        tests: [{ code: "ferritin", weeks: 8 }, { code: "ferritin", weeks: 4 }],
        questions: ["family_history", "family_history"],
      },
      candidates,
    );
    expect(acts.actions).toHaveLength(1);
    expect(acts.tests).toHaveLength(1);
    expect(acts.questions).toHaveLength(1);
  });

  it("is empty when the model returned nothing", () => {
    const acts = pickActs({}, candidates);
    expect(noActs(acts)).toBe(true);
    expect(noActs(undefined)).toBe(true);
  });
});

describe("adoptBodyOf", () => {
  it("reads a plan id back into the adopt call", () => {
    expect(adoptBodyOf("plan:r1:3")).toEqual({
      reportId: "r1",
      actionIndex: 3,
    });
  });

  it("reads a papers id back into the adopt call", () => {
    expect(adoptBodyOf("int:abc")).toEqual({ interventionId: "abc" });
  });

  it("has nothing to adopt for a plan line with no report behind it", () => {
    expect(adoptBodyOf("plan::3")).toBeNull();
    expect(adoptBodyOf("nonsense")).toBeNull();
  });
});

/* ── phase 28a: the rows an answer may cite ───────────────────────────── */

describe("evidenceSource", () => {
  const row = {
    id: "hashi_tsh_high",
    source:
      "Rodondi 2010 JAMA: TSH above 4.5 is subclinical hypothyroidism in the cohorts.",
    grade: "A",
    featureId: "metric:tsh",
    lrPos: 3,
  };

  it("reads the paper's name off the front of the seed's own sentence", () => {
    expect(evidenceSource(row).name).toBe("Rodondi 2010 JAMA");
  });

  it("takes the year out of the name when there is no paper row", () => {
    expect(evidenceSource(row).year).toBe(2010);
  });

  it("keeps the claim and the likelihood ratio for the prompt", () => {
    expect(evidenceSource(row).says).toContain("LR+ 3");
    expect(evidenceSource(row).says).toContain("subclinical hypothyroidism");
  });
});

describe("interventionSource", () => {
  it("prefers the paper's title and year", () => {
    const s = interventionSource({
      id: "int_hashimoto_selenium_123",
      name: "selenium",
      effect: "TPO antibodies down 40 %",
      dose: "200 mcg/day",
      grade: "B",
      population: "n=46, adults with Hashimoto's",
      quote: "TPOAb fell in the selenium arm",
      paper: { title: "Selenium in autoimmune thyroiditis", year: 2019 },
    });
    expect(s.name).toBe("Selenium in autoimmune thyroiditis");
    expect(s.year).toBe(2019);
    expect(s.says).toContain("200 mcg/day");
    expect(s.says).toContain("n=46");
    expect(s.quote).toBe("TPOAb fell in the selenium arm");
  });
});

describe("rankSources", () => {
  it("puts the best grade first, then the newer paper", () => {
    const rows = rankSources([
      { id: "c", name: "C", year: 2020, grade: "C", kind: "evidence", says: "", quote: null },
      { id: "a2", name: "A2", year: 2015, grade: "A", kind: "evidence", says: "", quote: null },
      { id: "a1", name: "A1", year: 2021, grade: "A", kind: "evidence", says: "", quote: null },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a1", "a2", "c"]);
  });
});

describe("the sources guard", () => {
  const sources = [
    { id: "hashi_tpo", name: "Hollowell 2002 JCEM", year: 2002, grade: "A", kind: "evidence" as const, says: "", quote: null },
  ];
  const candidates = askCandidates({
    actions: [],
    measured: [],
    moves: [],
    questions: [],
    sources,
  });

  it("keeps a paper it was given", () => {
    expect(pickActs({ sources: ["hashi_tpo"] }, candidates).sources).toEqual(
      sources,
    );
  });

  it("drops a paper it invented, and counts it", () => {
    const acts = pickActs({ sources: ["hashi_tpo", "smith_2019"] }, candidates);
    expect(acts.sources.map((s) => s.id)).toEqual(["hashi_tpo"]);
    expect(acts.dropped).toEqual(["smith_2019"]);
  });

  it("cites nothing when the model cited nothing", () => {
    expect(pickActs({}, candidates).sources).toEqual([]);
  });
});

describe("codesNamedIn", () => {
  const codes = ["ldl_cholesterol", "hdl_cholesterol", "tsh", "ferritin"];

  it("takes the marker the question actually named", () => {
    expect(codesNamedIn("why is my LDL high?", codes)).toEqual([
      "ldl_cholesterol",
    ]);
  });

  it("names nothing when the question names no marker", () => {
    expect(codesNamedIn("will I ever solve this?", codes)).toEqual([]);
  });
});

describe("mechanismsFor", () => {
  const graph = {
    nodes: [
      { id: "metric:tsh", name: "TSH" },
      { id: "metric:ldl_cholesterol", name: "LDL cholesterol" },
      { id: "metric:ferritin", name: "Ferritin" },
    ],
    edges: [
      {
        id: "tsh->ldl",
        from: "metric:tsh",
        to: "metric:ldl_cholesterol",
        relation: "raises",
        grade: "A",
        mechanism: "Low thyroid hormone lowers LDL receptor activity.",
      },
      {
        id: "ferritin->ldl",
        from: "metric:ferritin",
        to: "metric:ldl_cholesterol",
        relation: "raises",
        grade: "D",
        mechanism: "Weak.",
      },
      {
        id: "elsewhere",
        from: "metric:ferritin",
        to: "metric:tsh",
        relation: "raises",
        grade: "A",
        mechanism: "Not about LDL.",
      },
    ],
  };

  it("keeps only the edges that touch the marker, best grade first", () => {
    const out = mechanismsFor(graph, ["ldl_cholesterol"]);
    expect(out.map((e) => e.id)).toEqual(["tsh->ldl", "ferritin->ldl"]);
  });

  it("prints the node names, not the ids", () => {
    expect(mechanismsFor(graph, ["ldl_cholesterol"])[0]!.from).toBe("TSH");
  });
});

describe("settlesLine", () => {
  it("says what the test would settle, in the numbers the engine gave", () => {
    const m = {
      kind: "test",
      label: "HbA1c",
      outcomes: [
        { label: "high", prob: 0.3, beliefs: [{ id: "t2d", p: 0.92 }] },
        { label: "normal", prob: 0.7, beliefs: [{ id: "t2d", p: 0.05 }] },
      ],
      moves: [{ id: "t2d", from: 0.3, to: 0.92 }],
    } as unknown as Move;
    expect(settlesLine(m, () => "type 2 diabetes")).toBe(
      "HbA1c: type 2 diabetes 30 % → 92 % if high, 5 % if normal",
    );
  });
});
