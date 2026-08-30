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
  interventionQueries,
  likelihoodRatios,
  mintedId,
  proposalId,
  researchCondition,
  sourceLine,
  titleMatches,
  testCost,
  toInterventions,
  toProposals,
  TOKEN_BUDGET,
  venueIndex,
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

  it("grades every study type the way the roadmap does", () => {
    const table: [Finding["studyType"], number | null, string][] = [
      ["meta", null, "A"],
      ["guideline", null, "A"],
      ["rct", 40, "B"],
      ["cohort", 900, "B"],
      ["cohort", 90, "C"],
      ["cross_sectional", 900, "B"],
      ["cross_sectional", 90, "C"],
      ["case_control", 9000, "C"],
      ["case_series", 8, "D"],
      ["case_series", 40, "C"],
      ["case_report", null, "D"],
      ["n_of_1", null, "D"],
      ["self_experiment", null, "D"],
      ["animal", null, "E"],
      ["in_vitro", null, "E"],
      ["computational", null, "E"],
      ["other", null, "C"],
    ];
    for (const [studyType, n, grade] of table)
      expect([studyType, n, gradeOf({ ...base, studyType, n })]).toEqual([
        studyType,
        n,
        grade,
      ]);
  });

  it("takes a grade off a paper the world never cited or indexed", () => {
    const meta: Finding = { ...base, studyType: "meta" };
    expect(gradeOf(meta, { citedBy: 0, year: 2015, thisYear: 2026 })).toBe("B");
    expect(gradeOf(meta, { citedBy: 0, year: 2025, thisYear: 2026 })).toBe("A");
    expect(gradeOf(meta, { citedBy: 40, year: 2015, thisYear: 2026 })).toBe("A");
    expect(gradeOf(meta, { venueKnown: false })).toBe("B");
    // both, and a DOI that never resolved, which caps the row at C
    expect(
      gradeOf(meta, {
        citedBy: 0,
        year: 2015,
        thisYear: 2026,
        venueKnown: false,
      }),
    ).toBe("C");
    expect(gradeOf(meta, { resolved: false })).toBe("C");
    expect(gradeOf({ ...base, studyType: "animal" }, { resolved: false })).toBe(
      "E",
    );
  });

  it("only calls a venue unknown when Semantic Scholar answered at all", () => {
    const known = venueIndex([]);
    expect(known("Journal of Nowhere")).toBe(true);
    const seen = venueIndex([
      { journal: "J Clin Endocrinol Metab" } as Paper,
    ]);
    expect(seen("J. Clin. Endocrinol. Metab.")).toBe(true);
    expect(seen("Journal of Nowhere")).toBe(false);
    expect(seen(null)).toBe(false);
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
    expect(sourceLine(paper, "a positive likelihood ratio of 3.8", 1240)).toBe(
      'Zulewski H 2013 JAMA; doi:10.1001/jama.2013.0001; n = 1240; quote: "a positive likelihood ratio of 3.8"',
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

  const mintFinding: Finding = {
    paperIndex: 1,
    feature: "Anti-endomysial antibodies",
    featureId: null,
    condition: "hypothyroidism",
    direction: "above",
    threshold: 10,
    unit: "U/mL",
    lrPos: 6,
    population: "adults",
    studyType: "meta",
    quote: "a titre above 10 U/mL gave a likelihood ratio of 6",
  };

  it("mints a feature the catalog does not carry, under one normalised id", () => {
    // the curator's own normaliser: word order, case, punctuation and the
    // plural all fold away, so one analyte only ever mints one id
    expect(mintedId("Anti-endomysial antibodies")).toBe(
      mintedId("antibodies, anti endomysial"),
    );
    const { rows, mints, unmapped } = toProposals(
      CONDITION,
      FEATURES,
      [paper],
      [mintFinding],
    );
    expect(unmapped).toBe(0);
    expect(mints).toHaveLength(1);
    expect(mints[0]!.id).toBe(rows[0]!.featureId);
    expect(mints[0]!.unit).toBe("U/mL");
    expect(mints[0]!.doi).toBe(paper.doi);
    expect(rows[0]!.status).toBe("accepted");
  });

  it("folds a paper's own name onto a catalog feature instead of minting", () => {
    const { mints, rows } = toProposals(
      CONDITION,
      FEATURES,
      [paper],
      [{ ...mintFinding, feature: "Antibodies, TPO", unit: "IU/mL" }],
    );
    expect(mints).toHaveLength(0);
    expect(rows[0]!.featureId).toBe("metric:tpo_antibodies");
  });

  it("guesses what a minted test costs from what kind of test it is", () => {
    expect(testCost("Anti-endomysial antibodies")).toBe(1);
    expect(testCost("Liver ultrasound elastography")).toBe(3);
    expect(testCost("Small bowel biopsy")).toBe(4);
    expect(testCost("Serum fructosamine")).toBe(2);
  });

  it("rejects a row whose condition is out of the catalog", () => {
    const { rows, rejected } = toProposals(
      CONDITION,
      FEATURES,
      [paper],
      [mintFinding],
      { inCatalog: false },
    );
    expect(rejected).toBe(1);
    expect(rows[0]!.status).toBe("rejected");
  });
});

describe("interventions", () => {
  it("asks for treatments over fifteen years and the horizon over three", () => {
    const [trials, horizon] = interventionQueries(
      "Hypothyroidism",
      new Date("2026-08-29"),
    );
    expect(trials!.kind).toBe("intervention");
    expect(trials!.query).toContain(
      '"Hypothyroidism" AND (treatment OR supplementation OR intervention) AND (randomized OR "meta-analysis")',
    );
    expect(trials!.query).toContain("FIRST_PDATE:[2011-01-01 TO 2026-12-31]");
    expect(horizon!.kind).toBe("horizon");
    expect(horizon!.query).toContain(
      '(case report OR pilot OR "n-of-1" OR animal OR mice OR "in vitro")',
    );
    expect(horizon!.query).toContain("FIRST_PDATE:[2023-01-01 TO 2026-12-31]");
  });

  const trialPaper: Paper = {
    pmid: "31000000",
    doi: "10.1/trial",
    title: "Selenium in autoimmune thyroiditis: a randomized trial",
    journal: "Thyroid",
    year: 2020,
    authors: "Rossi A.",
    citedBy: 30,
    url: "https://doi.org/10.1/trial",
    abstract: "…",
  };

  const finding = {
    paperIndex: 1,
    intervention: "Selenium",
    dose: "200 µg/day",
    duration: "12 weeks",
    outcomeFeature: "metric:tpo_antibodies",
    effectSize: "-21%",
    direction: "down" as const,
    population: "adults with Hashimoto",
    studyType: "rct" as const,
    quote: "TPO antibodies fell 21% on 200 µg/day of selenium",
  };

  it("keeps the dose, the duration and the mapped outcome", () => {
    const [row] = toInterventions(
      CONDITION,
      FEATURES,
      [trialPaper],
      [finding],
      "intervention",
    );
    expect(row!.name).toBe("Selenium");
    expect(row!.dose).toBe("200 µg/day");
    expect(row!.duration).toBe("12 weeks");
    expect(row!.outcomeFeatureId).toBe("metric:tpo_antibodies");
    expect(row!.grade).toBe("B");
    expect(row!.direction).toBe("down");
  });

  it("never lets the horizon search claim more than D or E", () => {
    const [trial] = toInterventions(
      CONDITION,
      FEATURES,
      [trialPaper],
      [finding],
      "horizon",
    );
    expect(trial!.grade).toBe("D");
    const [mouse] = toInterventions(
      CONDITION,
      FEATURES,
      [trialPaper],
      [{ ...finding, studyType: "animal" as const }],
      "horizon",
    );
    expect(mouse!.grade).toBe("E");
  });

  it("drops a retracted paper and an unmapped outcome", () => {
    expect(
      toInterventions(
        CONDITION,
        FEATURES,
        [{ ...trialPaper, retracted: true }],
        [finding],
        "intervention",
      ),
    ).toHaveLength(0);
    const [row] = toInterventions(
      CONDITION,
      FEATURES,
      [trialPaper],
      [{ ...finding, outcomeFeature: "metric:nothing" }],
      "intervention",
    );
    expect(row!.outcomeFeatureId).toBeNull();
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
    // the policy decides at insert time now: nothing waits for a click
    expect(tsh.status).toBe("accepted");
    expect(tsh.needsLook).toBe(false);
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
