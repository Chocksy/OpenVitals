/**
 * The research intake, offline. Europe PMC is a fixture and the model is a
 * function, so the whole pipeline runs in a millisecond and the arithmetic,
 * the DOI check and the row it writes are all assertable.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FIXTURES } from "./hkb-import";
import {
  buildQueries,
  cleanTitle,
  conditionOn,
  dedupe,
  estimateTokens,
  gradeOf,
  likelihoodRatios,
  proposalId,
  researchCondition,
  sourceLine,
  titleMatches,
  toProposals,
  TOKEN_BUDGET,
  type Extractor,
  type Feature,
  type Finding,
  type Paper,
} from "./research";

const fixture = JSON.parse(
  readFileSync(path.join(FIXTURES, "research-europepmc.json"), "utf8"),
) as {
  search: unknown;
  core: unknown;
  doi: Record<string, unknown>;
};

const CONDITION = { id: "hypothyroidism", name: "Hypothyroidism" };
const FEATURES: Feature[] = [
  { id: "metric:tsh", name: "TSH", unit: "mIU/L" },
  { id: "metric:tpo_antibodies", name: "TPO Antibodies", unit: "IU/mL" },
  { id: "fact:sym_cold", name: "Feels the cold", unit: null },
];

/** Europe PMC and Semantic Scholar as three files and one 429. */
function stubNetwork() {
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(String(input));
    if (url.hostname.includes("semanticscholar"))
      return new Response("{}", { status: 429 });
    const query = url.searchParams.get("query") ?? "";
    const doi = query.match(/^DOI:"(.+)"$/)?.[1];
    const body = doi
      ? (fixture.doi[doi] ?? { resultList: { result: [] } })
      : url.searchParams.get("resultType") === "core"
        ? fixture.core
        : fixture.search;
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

/** What the model would have answered for the two papers that resolve. */
const extract: Extractor = async (papers) => ({
  tokens: 1234,
  items: papers.flatMap((p, i): Finding[] => {
    if (p.pmid === "21123456")
      return [
        {
          paperIndex: i + 1,
          feature: "TSH",
          featureId: "metric:tsh",
          condition: "hypothyroidism",
          direction: "above",
          threshold: 4.5,
          unit: "mIU/L",
          lrPos: 3.8,
          lrNeg: 0.21,
          population: "unselected adults in primary care",
          n: 9412,
          studyType: "meta",
          quote:
            "a serum TSH above 4.5 mIU/L had a positive likelihood ratio of 3.8 (95% CI 2.1-6.9)",
        },
      ];
    if (p.pmid === "22222222")
      return [
        {
          paperIndex: i + 1,
          feature: "anti-TPO",
          featureId: "metric:tpo_antibodies",
          condition: "autoimmune thyroiditis",
          direction: "above",
          threshold: 35,
          unit: "IU/mL",
          sensitivity: 0.9,
          specificity: 0.8,
          population: "adults with thyroid failure",
          n: 4015,
          studyType: "meta",
          quote: "a sensitivity of 0.90 and a specificity of 0.80",
        },
        {
          paperIndex: i + 1,
          feature: "goitre on palpation",
          featureId: null,
          condition: "autoimmune thyroiditis",
          direction: "present",
          lrPos: 2,
          population: "adults with thyroid failure",
          studyType: "cohort",
          quote: "goitre was present in most cases",
        },
      ];
    return [];
  }),
});

describe("the query builder", () => {
  it("asks for accuracy words, the feature, the study types and 15 years", () => {
    const [first] = buildQueries(
      "Hypothyroidism",
      FEATURES,
      new Date("2026-08-29"),
    );
    expect(first).toContain('"Hypothyroidism"');
    expect(first).toContain('"likelihood ratio"');
    expect(first).toContain('("TSH")');
    expect(first).toContain('PUB_TYPE:"meta-analysis"');
    expect(first).toContain("FIRST_PDATE:[2011-01-01 TO 2026-12-31]");
    expect(buildQueries("Hypothyroidism", FEATURES)).toHaveLength(3);
  });
});

describe("the title cleaner", () => {
  it("unwraps the publisher markup Europe PMC keeps in a title", () => {
    expect(
      cleanTitle(
        "Reassessment of HbA&lt;sub&gt;1c&lt;/sub&gt; and Glucose for Type 2 Diabetes.",
      ),
    ).toBe("Reassessment of HbA1c and Glucose for Type 2 Diabetes");
  });
});

describe("the arithmetic", () => {
  const base: Finding = {
    paperIndex: 1,
    feature: "x",
    condition: "y",
    direction: "above",
    population: "adults",
    studyType: "other",
    quote: "q",
  };

  it("keeps the likelihood ratios a paper states", () => {
    expect(likelihoodRatios({ ...base, lrPos: 3.8, lrNeg: 0.21 })).toEqual({
      lrPos: 3.8,
      lrNeg: 0.21,
    });
  });

  it("derives both from sensitivity and specificity", () => {
    expect(
      likelihoodRatios({ ...base, sensitivity: 0.9, specificity: 0.8 }),
    ).toEqual({ lrPos: 4.5, lrNeg: 0.12 });
  });

  it("reads a percentage the model wrote as 90 and 80", () => {
    expect(
      likelihoodRatios({ ...base, sensitivity: 90, specificity: 80 }),
    ).toEqual({ lrPos: 4.5, lrNeg: 0.12 });
  });

  it("says nothing when there is nothing to say, or the maths runs off", () => {
    expect(likelihoodRatios(base)).toBeNull();
    expect(
      likelihoodRatios({ ...base, sensitivity: 0.9, specificity: 1 }),
    ).toBeNull();
    expect(likelihoodRatios({ ...base, lrPos: 0 })).toBeNull();
  });

  it("grades meta and guideline A, a big cohort B, the rest C", () => {
    expect(gradeOf({ ...base, studyType: "meta" })).toBe("A");
    expect(gradeOf({ ...base, studyType: "guideline" })).toBe("A");
    expect(gradeOf({ ...base, studyType: "cohort", n: 900 })).toBe("B");
    expect(gradeOf({ ...base, studyType: "cohort", n: 90 })).toBe("C");
    expect(gradeOf({ ...base, studyType: "case_control", n: 9000 })).toBe("C");
  });

  it("turns direction and threshold into the `when` the engine reads", () => {
    expect(conditionOn("metric:tsh", { ...base, threshold: 4.5 })).toEqual({
      above: 4.5,
    });
    expect(
      conditionOn("fact:sym_cold", { ...base, direction: "present" }),
    ).toEqual({ equals: "Yes" });
    expect(
      conditionOn("fact:sym_cold", { ...base, direction: "absent" }),
    ).toEqual({ equals: "No" });
    // A positive test with no cut-off is the lab's own reference range.
    expect(conditionOn("metric:tsh", base)).toEqual({ status: "red" });
    expect(
      conditionOn("metric:tsh", { ...base, direction: "present" }),
    ).toEqual({ status: "red" });
    expect(
      conditionOn("metric:tsh", { ...base, direction: "absent" }),
    ).toBeNull();
    // A cut-off makes no sense on a yes/no answer.
    expect(conditionOn("fact:sym_cold", { ...base, threshold: 3 })).toBeNull();
  });
});

describe("the paper checks", () => {
  it("matches a title through its punctuation and full stop", () => {
    expect(
      titleMatches(
        "Does this patient have hypothyroidism? A systematic review",
        "Does this patient have hypothyroidism: a systematic review.",
      ),
    ).toBe(true);
    expect(
      titleMatches("Iron deficiency in adults", "Vitamin D in adults"),
    ).toBe(false);
  });

  it("keeps the most cited copy of a paper that came from both sources", () => {
    const one = { doi: "10.1/a", pmid: "1", title: "A", citedBy: 3 } as Paper;
    const two = { doi: "10.1/A", pmid: null, title: "A", citedBy: 40 } as Paper;
    expect(dedupe([one, two])).toEqual([two]);
  });
});

describe("proposals", () => {
  const paper: Paper = {
    pmid: "21123456",
    doi: "10.1001/jama.2013.0001",
    title: "Does this patient have hypothyroidism? A systematic review",
    journal: "JAMA",
    year: 2013,
    authors: "Zulewski H, Muller B, Exer P.",
    citedBy: 412,
    url: "https://doi.org/10.1001/jama.2013.0001",
    abstract: "…",
  };

  it("writes the author, year, journal, doi and quote into the source", () => {
    expect(sourceLine(paper, "a positive likelihood ratio of 3.8")).toBe(
      'Zulewski H 2013 JAMA; doi:10.1001/jama.2013.0001; quote: "a positive likelihood ratio of 3.8"',
    );
    expect(proposalId("hypothyroidism", "metric:tsh", paper)).toBe(
      "res_hypothyroidism_metric_tsh_21123456",
    );
  });

  it("drops a finding whose feature is not in the catalog", () => {
    const { rows, unmapped } = toProposals(
      CONDITION,
      FEATURES,
      [paper],
      [
        {
          paperIndex: 1,
          feature: "goitre",
          featureId: null,
          condition: "hypothyroidism",
          direction: "present",
          lrPos: 2,
          population: "adults",
          studyType: "cohort",
          quote: "goitre was present",
        },
      ],
    );
    expect(rows).toHaveLength(0);
    expect(unmapped).toBe(1);
  });
});

describe("one condition, end to end", () => {
  it("verifies the DOIs, extracts, derives and proposes", async () => {
    stubNetwork();
    const { rows, counts } = await researchCondition(CONDITION, FEATURES, {
      maxPapers: 10,
      extract,
    });

    // Three hits per feature query, three papers, one DOI that resolves to
    // nothing, so two papers reach the model.
    expect(counts.hits).toBe(9);
    expect(counts.papers).toBe(3);
    expect(counts.verified).toBe(2);
    expect(counts.tokens).toBe(1234);
    expect(counts.unmapped).toBe(1);
    expect(rows.map((r) => r.paper.pmid)).not.toContain("33333333");

    const tsh = rows.find((r) => r.featureId === "metric:tsh")!;
    expect(tsh.lrPos).toBe(3.8);
    expect(tsh.lrNeg).toBe(0.21);
    expect(tsh.grade).toBe("A");
    expect(tsh.status).toBe("proposed");
    expect(tsh.conditionOn).toEqual({ above: 4.5 });
    expect(tsh.source).toContain("doi:10.1001/jama.2013.0001");
    expect(tsh.paper.title).toContain("Does this patient have hypothyroidism");
    expect(tsh.paper.url).toBe("https://doi.org/10.1001/jama.2013.0001");

    const tpo = rows.find((r) => r.featureId === "metric:tpo_antibodies")!;
    expect(tpo.lrPos).toBe(4.5);
    expect(tpo.lrNeg).toBe(0.12);
    expect(tpo.paper.quote).toBe(
      "a sensitivity of 0.90 and a specificity of 0.80",
    );
  });

  it("spends nothing once the token budget is gone", async () => {
    stubNetwork();
    const spy = vi.fn(extract);
    const { rows, counts } = await researchCondition(CONDITION, FEATURES, {
      extract: spy,
      spent: TOKEN_BUDGET,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect(counts.verified).toBe(2);
    expect(estimateTokens([], FEATURES)).toBe(0);
  });
});
