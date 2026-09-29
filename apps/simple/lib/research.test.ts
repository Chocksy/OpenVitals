/**
 * The research intake, offline. Europe PMC is a fixture and the model is a
 * function, so the whole pipeline runs in a millisecond and the arithmetic,
 * the DOI check and the row it writes are all assertable.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SYSTEMS, type GraphNode } from "./graph";
import { FIXTURES } from "./hkb-import";
import { caseQuery, CAUSE_DESIGNS } from "./cases";
import { topicQueries } from "./topic-watch";
import {
  buildQueries,
  CONTESTED,
  withContested,
  watchWindow,
  guidelineQuery,
  toGuidelineRow,
  GUIDELINE_DAYS,
  GUIDELINE_FEATURE,
  mechanismQueries,
  parseWhen,
  researchMechanisms,
  strengthOf,
  toMechanismEdges,
  cleanTitle,
  epmc,
  isRetracted,
  parsePubmedXml,
  pubmed,
  toPubmed,
  upTo,
  conditionOn,
  convertOn,
  dedupe,
  estimateTokens,
  gradeOf,
  interventionQueries,
  likelihoodRatios,
  mintedId,
  proposalId,
  researchCondition,
  semanticScholar,
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
  type MechanismExtractor,
  type MechanismFinding,
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
      ["rct", null, "B"],
      ["rct", 400, "B"],
      ["rct", 46, "C"],
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
    expect(gradeOf(meta, { citedBy: 40, year: 2015, thisYear: 2026 })).toBe(
      "A",
    );
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
    const seen = venueIndex([{ journal: "J Clin Endocrinol Metab" } as Paper]);
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

describe("semantic scholar", () => {
  const answer = {
    data: [
      {
        title: "A big review",
        year: 2021,
        venue: "J Clin Endocrinol Metab",
        abstract: "…",
        citationCount: 91,
        externalIds: { DOI: "10.1/x", PubMed: "1" },
      },
    ],
  };

  it("sends the API key as x-api-key when there is one", async () => {
    process.env.SEMANTIC_SCHOLAR_API_KEY = "s2-secret";
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      calls.push(init);
      return new Response(JSON.stringify(answer), { status: 200 });
    });
    const papers = await semanticScholar("hypothyroidism", 0);
    delete process.env.SEMANTIC_SCHOLAR_API_KEY;
    expect((calls[0]?.headers as Record<string, string>)["x-api-key"]).toBe(
      "s2-secret",
    );
    expect(papers[0]?.journal).toBe("J Clin Endocrinol Metab");
  });

  it("waits out one keyless 429 instead of losing the venues", async () => {
    delete process.env.SEMANTIC_SCHOLAR_API_KEY;
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      return n === 1
        ? new Response("{}", { status: 429 })
        : new Response(JSON.stringify(answer), { status: 200 });
    });
    const papers = await semanticScholar("hypothyroidism", 0);
    expect(n).toBe(2);
    expect(papers).toHaveLength(1);
    expect(papers[0]?.citedBy).toBe(91);
  });

  it("gives up after the retry, and never retries with a key", async () => {
    delete process.env.SEMANTIC_SCHOLAR_API_KEY;
    let n = 0;
    vi.stubGlobal("fetch", async () => {
      n++;
      return new Response("{}", { status: 429 });
    });
    expect(await semanticScholar("hypothyroidism", 0)).toEqual([]);
    expect(n).toBe(2);

    process.env.SEMANTIC_SCHOLAR_API_KEY = "s2-secret";
    n = 0;
    expect(await semanticScholar("hypothyroidism", 0)).toEqual([]);
    delete process.env.SEMANTIC_SCHOLAR_API_KEY;
    expect(n).toBe(1);
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

  it("converts a threshold into the unit the feature is stored in", () => {
    // 6.3 mmol/L is 113 mg/dL. Filed as "above 6.3" it fires for everybody.
    expect(convertOn({ above: 6.3 }, "mmol/L", "mg/dL", "glucose")).toEqual({
      on: { above: 113.4 },
      unit: "mg/dL",
      note: "threshold converted: above 6.3 mmol/L = 113.4 mg/dL",
    });
    // Same unit, nothing to do; no unit either side, nothing to do.
    expect(convertOn({ above: 4.5 }, "mIU/L", "mIU/L", "tsh")?.on).toEqual({
      above: 4.5,
    });
    expect(convertOn({ above: 4.5 }, null, "mIU/L", "tsh")?.on).toEqual({
      above: 4.5,
    });
    // No factor between them: the caller has to hold the row.
    expect(convertOn({ above: 9 }, "ng/mL", "mIU/L", "tsh")).toBeNull();
  });

  it("holds a row whose unit will not convert, with the reason on it", () => {
    const { rows } = toProposals(
      CONDITION,
      FEATURES,
      [paper],
      [
        {
          paperIndex: 1,
          feature: "TSH",
          featureId: "metric:tsh",
          condition: "hypothyroidism",
          direction: "above",
          threshold: 9,
          unit: "ng/mL",
          lrPos: 4,
          population: "adults",
          studyType: "cohort",
          quote: "above 9 ng/mL, likelihood ratio 4",
        },
      ],
    );
    expect(rows[0]!.status).toBe("review");
    expect(rows[0]!.needsLook).toBe(true);
    expect(rows[0]!.conditionOn).toEqual({ above: 9 });
    expect(rows[0]!.reviewNote).toContain("no conversion");
  });

  it("drops a finding the model gave no feature name at all", () => {
    const { rows, unmapped } = toProposals(
      CONDITION,
      FEATURES,
      [paper],
      [
        {
          paperIndex: 1,
          feature: "",
          featureId: null,
          condition: "hypothyroidism",
          direction: "present",
          lrPos: 2,
          population: "adults",
          studyType: "cohort",
          quote: "a likelihood ratio of 2",
        },
      ],
    );
    expect(rows).toHaveLength(0);
    expect(unmapped).toBe(1);
  });

  it("mints a feature the paper never printed a unit for", () => {
    const { rows, mints, unmapped } = toProposals(
      CONDITION,
      FEATURES,
      [paper],
      [
        {
          paperIndex: 1,
          feature: "goitre on palpation",
          featureId: null,
          condition: "hypothyroidism",
          direction: "present",
          lrPos: 2,
          population: "adults",
          studyType: "meta",
          quote: "a positive palpation gave a likelihood ratio of 2",
        },
      ],
    );
    expect(unmapped).toBe(0);
    expect(mints).toHaveLength(1);
    expect(mints[0]!.unit).toBeNull();
    // no cut-off in the paper: "positive" is the lab's own reference range
    expect(rows[0]!.conditionOn).toEqual({ status: "red" });
    expect(rows[0]!.status).toBe("accepted");
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

  /**
   * Phase 28a item 4. "Whole system Ayurveda protocol" was offered on the
   * Hashimoto's card at grade B, beside selenium, off one 46-person
   * single-centre trial (PMID 39798266). The trial is real; the policy was
   * wrong to give every "rct" a B whatever its size, and the size never even
   * reached the grader, because the intervention path hard-coded `n: null`.
   */
  it("reads a small trial as a small trial, and says how small", () => {
    const [small] = toInterventions(
      CONDITION,
      FEATURES,
      [trialPaper],
      [{ ...finding, n: 46 }],
      "intervention",
    );
    expect(small!.grade).toBe("C");
    expect(small!.population).toBe("adults with Hashimoto, n = 46");

    const [big] = toInterventions(
      CONDITION,
      FEATURES,
      [trialPaper],
      [{ ...finding, n: 400 }],
      "intervention",
    );
    expect(big!.grade).toBe("B");

    // an abstract that never printed its size is not evidence of a tiny one
    const [unknown] = toInterventions(
      CONDITION,
      FEATURES,
      [trialPaper],
      [finding],
      "intervention",
    );
    expect(unknown!.grade).toBe("B");
    expect(unknown!.population).toBe("adults with Hashimoto");
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
      s2RetryMs: 0,
    });

    // Three hits per feature query, three papers, one DOI that resolves to
    // nothing, so two papers reach the model.
    expect(counts.hits).toBe(9);
    expect(counts.papers).toBe(3);
    expect(counts.verified).toBe(2);
    expect(counts.tokens).toBe(1234);
    // the goitre finding mints its own feature now, and is then rejected for a
    // quote that carries no number
    expect(counts.unmapped).toBe(0);
    expect(counts.rejected).toBe(1);
    expect(counts.minted).toBe(0);
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
      s2RetryMs: 0,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect(counts.verified).toBe(2);
    expect(estimateTokens([], FEATURES)).toBe(0);
  });
});

/* ── mechanism edges (phase 16) ───────────────────────────────────────── */

const GRAPH_NODES: GraphNode[] = [
  { id: "metric:sleep_duration", kind: "metric", name: "Sleep duration" },
  { id: "metric:insulin", kind: "metric", name: "Insulin" },
  { id: "metric:triglycerides", kind: "metric", name: "Triglycerides" },
  {
    id: "behavior:coffee_after_15",
    kind: "behavior",
    name: "Coffee after 15:00",
  },
  {
    id: "fact:genome:CYP1A2",
    kind: "gene",
    name: "CYP1A2 (Caffeine metabolism)",
    codes: ["caffeine_slow_metaboliser"],
  },
];

const PAPER: Paper = {
  pmid: "31111111",
  doi: "10.1016/j.metabol.2018.02.010",
  title: "Sleep influences on obesity, insulin resistance and diabetes risk",
  journal: "Metabolism",
  year: 2018,
  authors: "Reutrakul S, Van Cauter E.",
  citedBy: 640,
  url: "https://doi.org/10.1016/j.metabol.2018.02.010",
  abstract: "…",
  retracted: false,
};

const mechanism = (over: Partial<MechanismFinding> = {}): MechanismFinding => ({
  paperIndex: 1,
  from: "Sleep duration",
  to: "Insulin",
  relation: "raises",
  effect: "+0.3 mmol/L per 1 h less sleep",
  condition: null,
  population: "healthy adults",
  studyType: "meta",
  quote: "each hour of lost sleep raised fasting insulin by 0.3 mmol/L",
  ...over,
});

describe("mechanismQueries", () => {
  const queries = mechanismQueries(
    "Type 2 diabetes",
    FEATURES,
    new Date("2026-08-30"),
  );

  it("asks one query per system plus one per feature", () => {
    expect(queries).toHaveLength(SYSTEMS.length + 3);
  });

  it("carries the verbs, the review filter and a 15-year window", () => {
    expect(queries[0]).toContain('"increases" OR "decreases"');
    expect(queries[0]).toContain('PUB_TYPE:"review"');
    expect(queries[0]).toContain("FIRST_PDATE:[2011-01-01 TO 2026-12-31]");
  });

  it("names the headline markers of a system, not their codes", () => {
    expect(queries[0]).toContain('"ApoB"');
    expect(queries[0]).not.toContain("apolipoprotein_b");
  });
});

describe("parseWhen", () => {
  it("reads a genotype when exactly one gene is in play", () => {
    expect(parseWhen("only in fast metabolisers", ["CYP1A2"])).toEqual({
      genome: { gene: "CYP1A2", genotype: "fast" },
    });
  });

  it("reads a timing gap and the event it belongs to", () => {
    expect(
      parseWhen("only when the coffee is taken within 6 h of bedtime"),
    ).toEqual({
      hoursBefore: { eventFact: "coffee_last_hour", threshold: 6 },
    });
    expect(
      parseWhen("only when the meal is within 3 hours of going to bed"),
    ).toEqual({
      hoursBefore: { eventFact: "last_meal_hour", threshold: 3 },
    });
  });

  it("reads sex and age", () => {
    expect(parseWhen("in women only")).toEqual({ sex: "female" });
    expect(parseWhen("only in adults over 65")).toEqual({ age: { min: 65 } });
  });

  it("gives up rather than guessing", () => {
    expect(parseWhen("in people with a high dietary polyphenol intake")).toBe(
      null,
    );
    expect(parseWhen("only in fast metabolisers", ["CYP1A2", "CYP2C19"])).toBe(
      null,
    );
    expect(parseWhen(null)).toBe(null);
  });
});

describe("strengthOf", () => {
  it("reads the word the paper used", () => {
    expect(strengthOf("a large effect")).toBe(3);
    expect(strengthOf("a moderate reduction")).toBe(2);
    expect(strengthOf("a small but significant change")).toBe(1);
  });

  it("reads a ratio when there is no word", () => {
    expect(strengthOf("OR 2.4")).toBe(3);
    expect(strengthOf("HR 1.6")).toBe(2);
    expect(strengthOf("RR 1.1")).toBe(1);
  });

  it("never invents a strength out of nothing", () => {
    expect(strengthOf(null)).toBe(1);
    expect(strengthOf("")).toBe(1);
  });
});

describe("toMechanismEdges", () => {
  it("writes one graded, sourced edge with the quote on it", () => {
    const { rows } = toMechanismEdges(GRAPH_NODES, [PAPER], [mechanism()]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.fromId).toBe("metric:sleep_duration");
    expect(row.toId).toBe("metric:insulin");
    expect(row.relation).toBe("raises");
    expect(row.grade).toBe("A");
    expect(row.confidence).toBe("established");
    expect(row.when_).toBe(null);
    expect(row.source).toBe("research");
    expect(row.evidence[0]!.quote).toContain("0.3 mmol/L");
    expect(row.evidence[0]!.doi).toBe(PAPER.doi);
    expect(row.evidence[0]!.effect).toBe("+0.3 mmol/L per 1 h less sleep");
  });

  it("turns a parseable condition into a when clause", () => {
    const { rows, parsed } = toMechanismEdges(
      GRAPH_NODES,
      [PAPER],
      [
        mechanism({
          from: "Coffee after 15:00",
          to: "Sleep duration",
          relation: "lowers",
          condition: "only in CYP1A2 slow metabolisers",
        }),
      ],
    );
    expect(parsed).toBe(1);
    expect(rows[0]!.when_).toEqual({
      genome: { gene: "CYP1A2", genotype: "slow" },
    });
    expect(rows[0]!.confidence).toBe("established");
  });

  it("keeps an unparseable condition as text and drops to speculative", () => {
    const { rows, parsed } = toMechanismEdges(
      GRAPH_NODES,
      [PAPER],
      [mechanism({ condition: "only in people on a low-polyphenol diet" })],
    );
    expect(parsed).toBe(0);
    expect(rows[0]!.when_).toBe(null);
    expect(rows[0]!.confidence).toBe("speculative");
    expect(rows[0]!.mechanism).toContain("low-polyphenol diet");
    expect(rows[0]!.mechanism).toContain("stays speculative");
  });

  it("takes the strength from the effect size and nowhere else", () => {
    const { rows } = toMechanismEdges(
      GRAPH_NODES,
      [PAPER],
      [
        mechanism({ effect: "a large reduction" }),
        mechanism({ to: "Triglycerides", effect: null }),
      ],
    );
    expect(rows.map((r) => [r.toId, r.strength])).toEqual([
      ["metric:insulin", 3],
      ["metric:triglycerides", 1],
    ]);
  });

  it("drops a claim whose endpoints are not nodes we draw", () => {
    const { rows, unresolved } = toMechanismEdges(
      GRAPH_NODES,
      [PAPER],
      [mechanism({ to: "gut microbiome diversity", toId: null })],
    );
    expect(rows).toEqual([]);
    expect(unresolved).toBe(1);
  });

  it("dedupes on from, to, relation and when", () => {
    const { rows } = toMechanismEdges(
      GRAPH_NODES,
      [PAPER],
      [
        mechanism(),
        mechanism({ quote: "another sentence about the same thing" }),
      ],
    );
    expect(rows).toHaveLength(1);
  });

  it("refuses a paper with no DOI, however good the quote is", () => {
    const { rows } = toMechanismEdges(
      GRAPH_NODES,
      [{ ...PAPER, doi: null }],
      [mechanism()],
    );
    expect(rows).toEqual([]);
  });
});

describe("researchMechanisms end to end, offline", () => {
  it("searches, verifies the DOIs and hands back rows", async () => {
    stubNetwork();
    const extract: MechanismExtractor = async (papers) => ({
      tokens: 500,
      edges: papers.map((_, i) => mechanism({ paperIndex: i + 1 })),
    });
    const { rows, counts } = await researchMechanisms(CONDITION, FEATURES, {
      extract,
      nodes: GRAPH_NODES,
      maxPapers: 5,
    });
    expect(counts.verified).toBeGreaterThan(0);
    expect(counts.extracted).toBe(counts.verified);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("research");
  });
});

describe("the contested watch list", () => {
  /** The three, plus a thick condition each, as the pick would see them. */
  const known = [
    { id: "hashimoto", name: "Hashimoto's thyroiditis" },
    { id: "type_2_diabetes", name: "Type 2 diabetes" },
    ...CONTESTED.map((c) => ({ id: c.id, name: c.id })),
  ];

  it("adds the contested conditions to a run that never picked them", () => {
    const picked = withContested(
      [
        { id: "hashimoto", name: "Hashimoto's thyroiditis" },
        { id: "type_2_diabetes", name: "Type 2 diabetes" },
      ],
      known,
    );
    expect(picked.map((c) => c.id)).toEqual([
      "hashimoto",
      "type_2_diabetes",
      "pcos",
      "mast_cell_activation",
      "sibo",
    ]);
  });

  it("names one already-thin contested condition once, in its thin place", () => {
    const picked = withContested(
      [
        { id: "sibo", name: "SIBO" },
        { id: "hashimoto", name: "Hashimoto's thyroiditis" },
      ],
      known,
    );
    expect(picked.map((c) => c.id)).toEqual([
      "sibo",
      "hashimoto",
      "pcos",
      "mast_cell_activation",
    ]);
  });

  it("says why each one is on the list, with the citation", () => {
    for (const c of CONTESTED) expect(c.why.length).toBeGreaterThan(60);
  });
});

describe("the guideline watch", () => {
  const NOW = new Date("2026-09-01T09:00:00.000Z");

  it("searches from the last watch run to today", () => {
    expect(watchWindow(new Date("2026-06-01T10:00:00.000Z"), NOW)).toBe(
      "2026-06-01",
    );
    const query = guidelineQuery("Hashimoto's thyroiditis", "2026-06-01", NOW);
    expect(query).toContain("FIRST_PDATE:[2026-06-01 TO 2026-09-01]");
    expect(query).toContain('PUB_TYPE:"practice guideline"');
    expect(query).toContain('"Hashimoto\'s thyroiditis"');
  });

  it("looks back one quarter when it has never run", () => {
    expect(watchWindow(null, NOW)).toBe("2026-06-03");
    expect(GUIDELINE_DAYS).toBe(90);
  });

  it("writes a review row that cannot score, and names the condition", () => {
    const row = toGuidelineRow({
      conditionId: "hashimoto",
      conditionName: "Hashimoto's thyroiditis",
      paper: {
        pmid: "40123456",
        doi: "10.1000/x",
        title: "2026 ATA guideline for hypothyroidism",
        year: 2026,
        journal: "Thyroid",
        url: "https://doi.org/10.1000/x",
        quote: "2026 ATA guideline for hypothyroidism",
      },
    });
    expect(row.status).toBe("review");
    expect(row.needsLook).toBe(true);
    expect(row.featureId).toBe(GUIDELINE_FEATURE);
    expect(row.lrPos).toBe(1);
    expect(row.source).toContain(
      "guideline watch: check gates and thresholds for Hashimoto's thyroiditis",
    );
    expect(row.id).toBe("watch_hashimoto_40123456");
    // `rowsToCatalog` only ever reads `seed` and `accepted`, so this row is
    // invisible to the engine no matter what else is on it.
    expect(["seed", "accepted"]).not.toContain(row.status);
  });

  it("gives two guidelines for one condition two rows", () => {
    const paper = (pmid: string) => ({
      conditionId: "ckd",
      conditionName: "Chronic kidney disease",
      paper: {
        pmid,
        doi: null,
        title: `guideline ${pmid}`,
        year: 2026,
        journal: null,
        url: "",
        quote: "",
      },
    });
    const ids = [paper("1"), paper("2")].map((h) => toGuidelineRow(h).id);
    expect(new Set(ids).size).toBe(2);
    expect(
      new Set([paper("1"), paper("1")].map((h) => toGuidelineRow(h).id)).size,
    ).toBe(1);
  });
});

describe("epmc when Europe PMC is down", () => {
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
  it("flags a 503 in place of an empty list", async () => {
    quiet();
    const r = await epmc(
      "q",
      "core",
      5,
      (async () => new Response("", { status: 503 })) as typeof fetch,
      [0, 0],
      async () => "HTTP 503",
    );
    expect(r.length).toBe(0);
    expect(r.failed).toBe("HTTP 503; PubMed HTTP 503");
  });
  it("flags a network failure", async () => {
    quiet();
    const r = await epmc(
      "q",
      "core",
      5,
      (async () => {
        throw new Error("ECONNRESET");
      }) as typeof fetch,
      [0],
      async () => "ECONNRESET",
    );
    expect(r.failed).toBe("ECONNRESET; PubMed ECONNRESET");
  });
  it("tries a 5xx again and keeps the answer that follows", async () => {
    quiet();
    let n = 0;
    const r = await epmc(
      "q",
      "core",
      5,
      (async () =>
        ++n < 3
          ? new Response("", { status: 503 })
          : new Response(
              JSON.stringify({ resultList: { result: [{ id: "1" }] } }),
            )) as typeof fetch,
      [0, 0],
    );
    expect(n).toBe(3);
    expect(r.failed).toBeUndefined();
    expect(r.length).toBe(1);
  });
  it("does not retry a 400", async () => {
    quiet();
    let n = 0;
    const r = await epmc(
      "q",
      "core",
      5,
      (async () => {
        n++;
        return new Response("", { status: 400 });
      }) as typeof fetch,
      [0, 0],
      async () => "HTTP 400",
    );
    expect(n).toBe(1);
    expect(r.failed).toBe("HTTP 400; PubMed HTTP 400");
  });
  it("leaves a real answer, even an empty one, unflagged", async () => {
    const ok = (result: unknown[]) =>
      (async () =>
        new Response(
          JSON.stringify({ resultList: { result } }),
        )) as typeof fetch;
    const r = await epmc("q", "core", 5, ok([{ id: "1" }]));
    expect(r.length).toBe(1);
    expect(r.failed).toBeUndefined();
    expect((await epmc("q", "core", 5, ok([]))).failed).toBeUndefined();
  });
});

/* ── PubMed standing in for Europe PMC ─────────────────────────────────── */

/** Two efetch records cut down to what the parser reads. */
const PUBMED_XML = `<?xml version="1.0" ?>
<PubmedArticleSet>
<PubmedArticle><MedlineCitation Status="MEDLINE" Owner="NLM"><PMID Version="1">111</PMID>
<Article PubModel="Print-Electronic"><Journal><JournalIssue CitedMedium="Internet"><PubDate><Year>2023</Year><Month>Nov</Month><Day>03</Day></PubDate></JournalIssue><Title>International journal of molecular sciences</Title><ISOAbbreviation>Int J Mol Sci</ISOAbbreviation></Journal>
<ArticleTitle>Ferritin &amp; transferrin in HbA<sub>1c</sub> &#x2264; 6 %.</ArticleTitle>
<ELocationID EIdType="doi" ValidYN="Y">10.1/elocation</ELocationID>
<Abstract><AbstractText Label="BACKGROUND" NlmCategory="BACKGROUND">Iron &lt;i&gt;matters&lt;/i&gt;.</AbstractText><AbstractText Label="RESULTS">Ferritin below 30 &#xb5;g/L had <i>p</i> &lt; 0.001.</AbstractText></Abstract>
<AuthorList CompleteYN="Y"><Author ValidYN="Y"><LastName>Skar&#x17c;y&#x144;ska</LastName><ForeName>Ewa</ForeName><Initials>E</Initials></Author><Author ValidYN="Y"><LastName>Mularczyk</LastName><Initials>K</Initials></Author></AuthorList>
<PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType><PublicationType UI="D017418">Meta-Analysis</PublicationType></PublicationTypeList>
<ArticleDate DateType="Electronic"><Year>2023</Year><Month>10</Month><Day>30</Day></ArticleDate></Article></MedlineCitation>
<PubmedData><History><PubMedPubDate PubStatus="pubmed"><Year>2023</Year><Month>11</Month><Day>14</Day></PubMedPubDate></History>
<ArticleIdList><ArticleId IdType="pubmed">111</ArticleId><ArticleId IdType="doi">10.3390/ijms242115937</ArticleId></ArticleIdList>
<ReferenceList><Reference><Citation>Other paper.</Citation><ArticleIdList><ArticleId IdType="doi">10.9999/not-this-one</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData></PubmedArticle>
<PubmedArticle><MedlineCitation><PMID Version="1">222</PMID>
<Article><Journal><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue><Title>Blood</Title></Journal>
<ArticleTitle>A retracted cohort.</ArticleTitle>
<Abstract><AbstractText>Plain abstract.</AbstractText></Abstract>
<AuthorList><Author><CollectiveName>The Iron Group</CollectiveName></Author></AuthorList>
<PublicationTypeList><PublicationType UI="D016428">Journal Article</PublicationType></PublicationTypeList></Article>
<CommentsCorrectionsList><CommentsCorrections RefType="RetractionIn"><RefSource>Blood. 2025</RefSource><PMID Version="1">999</PMID></CommentsCorrections></CommentsCorrectionsList></MedlineCitation>
<PubmedData><History><PubMedPubDate PubStatus="entrez"><Year>2024</Year><Month>7</Month><Day>2</Day></PubMedPubDate></History>
<ArticleIdList><ArticleId IdType="pubmed">222</ArticleId></ArticleIdList></PubmedData></PubmedArticle>
</PubmedArticleSet>`;

/** esearch answers these ids, efetch answers the XML above; every URL kept. */
function eutils(ids: string[], urls: string[] = []) {
  return (async (input: string) => {
    urls.push(String(input));
    if (String(input).includes("europepmc"))
      return new Response("", { status: 503 });
    if (String(input).includes("esearch"))
      return new Response(
        JSON.stringify({ esearchresult: { count: String(ids.length), idlist: ids } }),
      );
    return new Response(PUBMED_XML);
  }) as unknown as typeof fetch;
}

describe("PubMed when Europe PMC is down", () => {
  const now = new Date("2026-09-29T00:00:00Z");
  it.each([
    [
      "a strict case query",
      caseQuery('"iron deficiency" AND ("heavy menstrual bleeding" OR "menorrhagia")', "2024-06-01"),
      '(("iron deficiency"[ti] OR "iron deficiency"[tiab]) AND (("heavy menstrual bleeding"[ti] OR "heavy menstrual bleeding"[tiab]) OR ("menorrhagia"[ti] OR "menorrhagia"[tiab]))) AND (randomized OR "meta-analysis" OR "systematic review" OR cohort OR "cross-sectional" OR "case-control") AND hasabstract NOT "Case Reports"[pt] AND (("1900/01/01"[dp] : "2024/06/01"[dp]))',
      "2024-06-01",
    ],
    [
      "the cause track",
      caseQuery(
        // what causeQueries writes for an open cause
        'TITLE:"Open condition" AND (TITLE:etiology OR TITLE:aetiology OR TITLE:causes OR TITLE:cause OR TITLE:underlying)',
        "2025-06-01",
        true,
        CAUSE_DESIGNS,
      ),
      '("Open condition"[ti] AND (etiology[ti] OR aetiology[ti] OR causes[ti] OR cause[ti] OR underlying[ti])) AND (review OR "systematic review" OR "meta-analysis" OR cohort OR prospective OR retrospective OR "cross-sectional") AND hasabstract NOT "Case Reports"[pt] AND (("1900/01/01"[dp] : "2025/06/01"[dp]))',
      "2025-06-01",
    ],
    [
      "a likelihood-ratio search",
      buildQueries("Hypothyroidism", [FEATURES[0]!], now)[0]!,
      '"Hypothyroidism" AND ("likelihood ratio" OR "sensitivity" OR "specificity" OR "diagnostic accuracy") AND ("TSH") AND ("review"[pt] OR "meta-analysis"[pt] OR "guideline"[pt]) AND (("2011/01/01"[dp] : "2026/12/31"[dp]))',
      "2026-12-31",
    ],
    [
      "a topic watch, with its keywords and NOTs",
      topicQueries("creatine", "2021-09-29", now)[0]!.query,
      '("creatine"[ti] OR ("creatine"[mh] OR "creatine"[ot])) AND (randomized OR "randomised" OR "meta-analysis" OR "systematic review" OR cohort) AND (("2021/09/29"[dp] : "2026/09/29"[dp])) NOT "creatine kinase"[ti] NOT "creatinine"[ti] NOT "creatine phosphokinase"[ti]',
      "2026-09-29",
    ],
    [
      "two dates: the tighter upper day is the cut",
      upTo(guidelineQuery("Hypothyroidism", "2020-01-01", now), "2024-06-01"),
      '"Hypothyroidism" AND ("guideline"[pt] OR "practice guideline"[pt] OR "consensus development conference"[pt]) AND (("2020/01/01"[dp] : "2026/09/29"[dp])) AND (("1900/01/01"[dp] : "2024/06/01"[dp]))',
      "2024-06-01",
    ],
    ["the abstracts batch", "EXT_ID:123 OR EXT_ID:456", "123[pmid] OR 456[pmid]", null],
    ["a DOI check", 'DOI:"10.1/x"', '"10.1/x"[doi]', null],
  ])("translates %s", (_name, query, term, maxDate) => {
    expect(toPubmed(query)).toEqual({ term, maxDate });
  });

  it("reads efetch XML into the Europe PMC shape, retraction and all", () => {
    const [a, b] = parsePubmedXml(PUBMED_XML);
    expect(a).toMatchObject({
      servedBy: "pubmed",
      pmid: "111",
      doi: "10.3390/ijms242115937", // not the reference list's
      title: "Ferritin & transferrin in HbA<sub>1c</sub> ≤ 6 %.",
      journalTitle: "International journal of molecular sciences",
      journalInfo: { journal: { medlineAbbreviation: "Int J Mol Sci" } },
      pubYear: "2023",
      authorString: "Skarżyńska E, et al.",
      firstPublicationDate: "2023-10-30",
      abstractText:
        "BACKGROUND: Iron <i>matters</i>. RESULTS: Ferritin below 30 µg/L had <i>p</i> < 0.001.",
      pubTypeList: { pubType: ["Journal Article", "Meta-Analysis"] },
    });
    expect(cleanTitle(a!.title!)).toBe("Ferritin & transferrin in HbA1c ≤ 6 %");
    expect(b).toMatchObject({
      pmid: "222",
      doi: undefined,
      pubYear: "2024",
      authorString: "The Iron Group.",
      firstPublicationDate: "2024-07-02", // a bare year is no day: PubMed's listing is
    });
    expect(isRetracted(a!.pubTypeList?.pubType)).toBe(false);
    expect(isRetracted(b!.pubTypeList?.pubType)).toBe(true);
  });

  it("answers for Europe PMC, in relevance order, with the NCBI tool and email", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("ADMIN_EMAIL", "admin@example.org");
    const urls: string[] = [];
    const fetcher = eutils(["222", "111"], urls);
    const r = await epmc("TITLE:ferritin", "core", 5, fetcher, [], (q, n) =>
      pubmed(q, n, { fetcher, waits: [], gapMs: 0 }),
    );
    vi.unstubAllEnvs();
    expect(r.failed).toBeUndefined();
    expect(r.map((h) => [h.pmid, h.servedBy])).toEqual([
      ["222", "pubmed"],
      ["111", "pubmed"],
    ]);
    const search = new URL(urls.find((u) => u.includes("esearch"))!);
    expect(search.searchParams.get("term")).toBe("ferritin[ti]");
    expect(search.searchParams.get("sort")).toBe("relevance");
    expect(search.searchParams.get("tool")).toBe("openvitals");
    expect(search.searchParams.get("email")).toBe("admin@example.org");
    expect(new URL(urls.at(-1)!).searchParams.get("id")).toBe("222,111");
  });

  it("keeps the date cut on the hits' own dates", async () => {
    const fetcher = eutils(["111", "222"]);
    const opts = { fetcher, waits: [], gapMs: 0 };
    const cut = await pubmed(upTo("TITLE:ferritin", "2024-06-01"), 5, opts);
    // 222 says only "2024" in print and was listed on 2024-07-02: after the cut
    expect((cut as { pmid?: string }[]).map((h) => h.pmid)).toEqual(["111"]);
    const later = await pubmed(upTo("TITLE:ferritin", "2024-07-02"), 5, opts);
    expect((later as unknown[]).length).toBe(2);
  });

  it("is an honest empty answer when PubMed finds nothing", async () => {
    expect(
      await pubmed("TITLE:nothing", 5, { fetcher: eutils([]), waits: [], gapMs: 0 }),
    ).toEqual([]);
  });

  it("flags the list only when both indexes are down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const down = (async () => {
      calls++;
      return new Response("", { status: 503 });
    }) as unknown as typeof fetch;
    const r = await epmc("TITLE:ferritin", "core", 5, down, [0], (q, n) =>
      pubmed(q, n, { fetcher: down, waits: [0], gapMs: 0 }),
    );
    expect(r).toHaveLength(0);
    expect(r.failed).toBe("HTTP 503; PubMed HTTP 503");
    expect(calls).toBe(4); // two tries each
  });

  it("spaces NCBI requests to three a second", async () => {
    const at: number[] = [];
    const fetcher = (async (input: string) => {
      at.push(Date.now());
      return eutils(["111"])(input);
    }) as unknown as typeof fetch;
    await Promise.all([
      pubmed("a", 1, { fetcher, waits: [], gapMs: 60 }),
      pubmed("b", 1, { fetcher, waits: [], gapMs: 60 }),
    ]);
    at.sort((x, y) => x - y);
    for (let i = 1; i < at.length; i++)
      expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(55);
  });
});
