import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  associationLine,
  designWords,
  directionWords,
  dedupeRanked,
  doseRange,
  firstNounPhrase,
  isAssociation,
  excludedFor,
  FIRST_RUN_YEARS,
  normalizeTopic,
  onTopic,
  preRank,
  pubRank,
  relevanceOf,
  toneOf,
  toRanked,
  toTopicRows,
  topicDue,
  topicPaperRows,
  topicQueries,
  topicSince,
  TOPIC_DAYS,
  verdictsOf,
  type TopicItem,
} from "./topic-watch";
import { conditionNameOf, toApiPaper } from "./research-watch";
import type { PaperWatch } from "@/db";

/**
 * The topic watch, tested where it is pure: the two queries, the pre-rank that
 * decides what the model ever sees, the row the extraction becomes, the
 * verdict strip, the good/bad tone and the relevance sentence. The one impure
 * function (`runTopic`) reaches Europe PMC and a model, and it takes an
 * injected extractor for exactly that reason.
 *
 * The abstracts come from `evals/fixtures/hkb/topic-creatine.json`, in the
 * same shape Europe PMC's `core` result has: four papers — a meta-analysis, a
 * trial, a cross-sectional survey and a letter.
 */
const FIXTURE = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../evals/fixtures/hkb/topic-creatine.json",
    ),
    "utf8",
  ),
) as {
  search: { resultList: { result: Record<string, never>[] } };
  items: TopicItem[];
};

const HITS = FIXTURE.search.resultList.result;
const all = HITS.map((h) => toRanked(h));
/** What a run would ever look at: the off-topic hits are gone before ranking. */
const papers = all.filter((p) => onTopic(p, "creatine"));
const NOW = new Date("2026-09-05T10:00:00Z");

describe("the key", () => {
  it("normalises whatever was typed, and keeps the label elsewhere", () => {
    expect(normalizeTopic("  Cold   Exposure ")).toBe("cold exposure");
    expect(normalizeTopic("CREATINE")).toBe("creatine");
  });
});

describe("the two queries", () => {
  const [support, contrary] = topicQueries("creatine", "2026-08-06", NOW);

  it("asks for the topic in the title or the keywords, not the full text", () => {
    expect(support!.query).toContain('(TITLE:"creatine" OR KW:"creatine")');
    expect(support!.query).not.toMatch(/^"creatine"/);
    expect(support!.query).toContain("FIRST_PDATE:[2026-08-06 TO 2026-09-05]");
    expect(support!.query).toContain('"meta-analysis"');
  });

  it("excludes the near-homographs of the topic by title", () => {
    expect(support!.query).toContain('NOT TITLE:"creatine kinase"');
    expect(support!.query).toContain('NOT TITLE:"creatinine"');
    expect(contrary!.query).toContain('NOT TITLE:"creatine kinase"');
    // most topics have none, and the query says nothing about them
    expect(topicQueries("psyllium", "2026-08-06", NOW)[0]!.query).not.toContain(
      "NOT TITLE:",
    );
    expect(excludedFor("omega-3")).toEqual([]);
  });

  it("asks for the contrary side on purpose", () => {
    expect(contrary!.kind).toBe("contrary");
    expect(contrary!.query).toContain('"cancer"');
    expect(contrary!.query).toContain('"adverse"');
    expect(contrary!.query).toContain('(TITLE:"creatine" OR KW:"creatine")');
    expect(contrary!.query).toContain("FIRST_PDATE:[2026-08-06 TO 2026-09-05]");
  });
});

describe("what is actually about the topic", () => {
  it("drops a creatine-kinase paper and one that never names creatine", () => {
    expect(all).toHaveLength(6);
    expect(papers.map((p) => p.pmid)).toEqual([
      "30000002",
      "30000001",
      "30000003",
      "30000004",
    ]);
  });

  it("keeps a paper that names the topic in its title or its abstract", () => {
    expect(
      onTopic({ title: "Creatine and grip", abstract: "" }, "creatine"),
    ).toBe(true);
    expect(
      onTopic(
        { title: "A trial of something", abstract: "creatine 5 g/day" },
        "creatine",
      ),
    ).toBe(true);
  });

  it("is tolerant of hyphens and spacing", () => {
    expect(onTopic({ title: "Omega 3 and mood", abstract: "" }, "omega-3")).toBe(
      true,
    );
    expect(onTopic({ title: "Omega-3 and mood", abstract: "" }, "omega 3")).toBe(
      true,
    );
  });

  it("never lets an excluded phrase through, however it is cased", () => {
    expect(
      onTopic(
        { title: "Serum Creatine Kinase after training", abstract: "creatine" },
        "creatine",
      ),
    ).toBe(false);
    expect(
      onTopic({ title: "Creatinine clearance", abstract: "" }, "creatine"),
    ).toBe(false);
  });
});

describe("the window", () => {
  it("asks for five years on the first run, so the meta-analyses come in", () => {
    expect(topicSince(null, NOW)).toBe("2021-09-05");
  });

  it("takes the later of the last run and the floor, once it has run", () => {
    expect(topicSince("2026-08-20", NOW)).toBe("2026-08-20");
    expect(topicSince("2025-01-01", NOW)).toBe("2026-08-06");
  });

  it("only ever looks five years back once", () => {
    expect(FIRST_RUN_YEARS).toBe(5);
    // the second run asks for thirty days, not five years again
    expect(topicSince("2021-09-05", NOW)).toBe("2026-08-06");
  });

  it("is due when never run, and on the day the cadence ends", () => {
    const days = (n: number) =>
      new Date(NOW.getTime() - n * 86_400_000).toISOString();
    expect(topicDue(null, NOW)).toBe(true);
    expect(topicDue(days(TOPIC_DAYS - 1), NOW)).toBe(false);
    expect(topicDue(days(TOPIC_DAYS), NOW)).toBe(true);
  });
});

describe("the pre-rank", () => {
  it("puts a meta-analysis above a trial above a cohort above a letter", () => {
    const ordered = preRank(dedupeRanked(papers)).map((p) => p.pmid);
    expect(ordered).toEqual([
      "30000002", // meta-analysis
      "30000001", // randomised controlled trial
      "30000003", // the survey: no design type at all
      "30000004", // the letter, last, despite 310 citations
    ]);
  });

  it("does not let a citation count buy a letter a place", () => {
    expect(pubRank(["Letter", "Comment"])).toBe(9);
    expect(pubRank(["Journal Article", "Editorial"])).toBe(9);
    expect(pubRank(["Meta-Analysis"])).toBeLessThan(
      pubRank(["Journal Article"]),
    );
  });
});

describe("the rows the extraction becomes", () => {
  const rows = toTopicRows(
    "creatine",
    [{ id: "metric:grip_kg", name: "Grip strength", unit: "kg" }],
    preRank(dedupeRanked(papers)),
    // the fixture's paperIndex is 1-based against the pre-ranked order
    FIXTURE.items,
  );

  it("keeps the outcome in the abstract's own words", () => {
    expect(rows.map((r) => r.outcomeText)).toEqual([
      "lower-body maximal strength",
      "grip strength",
      "prostate cancer incidence",
    ]);
  });

  it("maps a listed feature and drops one that is not listed", () => {
    const grip = rows.find((r) => r.outcomeText === "grip strength")!;
    const pooled = rows.find(
      (r) => r.outcomeText === "lower-body maximal strength",
    )!;
    expect(grip.outcomeFeatureId).toBe("metric:grip_kg");
    expect(pooled.outcomeFeatureId).toBe(null);
  });

  it("grades a meta-analysis A and a small trial by its size", () => {
    expect(
      rows.find((r) => r.outcomeText === "lower-body maximal strength")!.grade,
    ).toBe("A");
    expect(rows.find((r) => r.outcomeText === "grip strength")!.grade).toBe(
      "C",
    );
  });

  it("grades a cross-sectional n = 300 at C and calls it an association", () => {
    const survey = rows.find(
      (r) => r.outcomeText === "prostate cancer incidence",
    )!;
    expect(survey.grade).toBe("C");
    expect(survey.studyType).toBe("cross_sectional");
    expect(isAssociation(survey.studyType)).toBe(true);
    expect(designWords(survey.studyType, survey.n ?? null)).toBe(
      "cross-sectional survey, n = 300",
    );
    expect(associationLine("creatine", survey.studyType)).toContain(
      "it cannot say creatine causes it",
    );
  });

  it("keeps the population with its size, and the paper with its DOI", () => {
    const grip = rows.find((r) => r.outcomeText === "grip strength")!;
    expect(grip.population).toBe("trained adults, 24-48 y, n = 46");
    expect(grip.paper?.doi).toBe("10.1152/japplphysiol.2019.0001");
    expect(grip.paperExternalId).toBe("10.1152/japplphysiol.2019.0001");
    expect(grip.id.startsWith("tf_creatine_")).toBe(true);
    expect(grip.id.length).toBeLessThanOrEqual(200);
  });

  it("never claims a trial is a trial when the abstract said survey", () => {
    expect(rows.every((r) => r.quote.length > 0)).toBe(true);
  });
});

describe("the paper_watch rows a run files", () => {
  const rows = toTopicRows(
    "creatine",
    [],
    preRank(dedupeRanked(papers)),
    FIXTURE.items,
  );
  const ranked = preRank(dedupeRanked(papers));
  const watch = topicPaperRows("u1", "creatine", ranked, rows, true);
  const searchOnly = topicPaperRows("u1", "creatine", ranked, rows, false);

  it("files every paper under the topic, moving nothing", () => {
    expect(watch.every((r) => r.conditionId === "topic:creatine")).toBe(true);
    expect(watch.every((r) => r.moves == null)).toBe(true);
  });

  /**
   * The reader ran and it had nothing to say about creatine for the letter.
   * Filing it would print "found, not read yet" under a paper that was read,
   * which is a lie about which half failed.
   */
  it("drops a paper the reader read and produced nothing from", () => {
    expect(watch).toHaveLength(3);
    expect(watch.some((r) => r.externalId.includes("letter"))).toBe(false);
    expect(watch.every((r) => r.grade != null && r.finding != null)).toBe(true);
  });

  it("files every paper as found-not-read-yet when the reader could not run", () => {
    expect(searchOnly).toHaveLength(4);
    const letter = searchOnly.find((r) => r.externalId.includes("letter"))!;
    expect(letter.grade).toBe(null);
    expect(letter.finding).toBe(null);
    expect(letter.publishedAt).toBe("2020-02-02");
  });
});

describe("good or bad by the outcome, not by up or down", () => {
  it("reads a marker off the app's own direction tables", () => {
    expect(toneOf("up", "grip strength", "metric:grip_kg")).toBe("on");
    expect(toneOf("down", "grip strength", "metric:grip_kg")).toBe("off");
    expect(toneOf("down", "LDL", "metric:ldl_cholesterol")).toBe("on");
    expect(toneOf("up", "LDL", "metric:ldl_cholesterol")).toBe("off");
  });

  it("reads a free-text outcome off the word list", () => {
    expect(toneOf("up", "prostate cancer incidence", null)).toBe("off");
    expect(toneOf("up", "all-cause mortality", null)).toBe("off");
    expect(toneOf("down", "adverse events", null)).toBe("on");
  });

  it("says neither when it does not know, and prints that word", () => {
    expect(toneOf("up", "total body water", null)).toBe("none");
    expect(directionWords("up", "none")).toBe("up · neither");
    expect(directionWords("up", "off")).toBe("up · bad");
    expect(directionWords("down", "on")).toBe("down · good");
    expect(directionWords("none", "none")).toBe("no change");
  });
});

describe("the verdict strip", () => {
  const rows = toTopicRows(
    "creatine",
    [{ id: "metric:grip_kg", name: "Grip strength", unit: "kg" }],
    preRank(dedupeRanked(papers)),
    FIXTURE.items,
  );
  const strip = verdictsOf(rows as never);

  it("is one line per outcome, good news first and bad news last", () => {
    expect(strip.map((v) => v.outcomeText)).toEqual([
      "grip strength",
      "lower-body maximal strength",
      "prostate cancer incidence",
    ]);
    expect(strip.at(-1)!.tone).toBe("off");
    expect(strip.at(-1)!.association).toBe(true);
  });

  it("carries the dose range and the best grade behind each line", () => {
    const grip = strip.find((v) => v.outcomeText === "grip strength")!;
    expect(grip.doseRange).toBe("5 g/day");
    expect(grip.trials).toBe(1);
    expect(strip.at(-1)!.doseRange).toBe(null);
  });

  it("collapses two doses of one unit into a range", () => {
    expect(doseRange(["3 g/day", "5 g/day"])).toBe("3–5 g/day");
    expect(doseRange([null, "20 g/day"])).toBe("20 g/day");
    expect(doseRange([null, null])).toBe(null);
  });
});

describe("relevance, for the four origins", () => {
  const person = {
    adopted: ["Creatine monohydrate 5 g with breakfast"],
    goals: [{ featureId: "metric:grip_kg", name: "grip strength" }],
    loud: [
      {
        name: "Inflammation",
        state: "borderline",
        featureIds: ["metric:hs_crp"],
      },
    ],
  };
  const outcomes = [{ outcomeFeatureId: "metric:grip_kg" }];

  it("says you take it, when a protocol item names it", () => {
    const said = relevanceOf(
      { topic: "creatine", label: "Creatine", origin: "adopted" },
      person,
      outcomes,
    );
    expect(said).toContain("you take it");
    expect(said).toContain("you are moving grip strength");
  });

  it("says the marker you are moving, without a protocol item", () => {
    expect(
      relevanceOf(
        { topic: "beetroot", label: "Beetroot", origin: "goal" },
        { ...person, adopted: [] },
        outcomes,
      ),
    ).toBe("you are moving grip strength");
  });

  it("names the loud condition an outcome feature is scored by", () => {
    expect(
      relevanceOf(
        { topic: "omega-3", label: "Omega-3", origin: "asked" },
        { ...person, adopted: [], goals: [] },
        [{ outcomeFeatureId: "metric:hs_crp" }],
      ),
    ).toBe("Inflammation is borderline for you");
  });

  it("says you asked when nothing on file matches", () => {
    expect(
      relevanceOf(
        { topic: "psyllium", label: "Psyllium", origin: "typed" },
        { adopted: [], goals: [], loud: [] },
      ),
    ).toBe("you asked · no marker on file for it yet");
  });
});

describe("a topic row in the existing feed", () => {
  const row = {
    id: "r1",
    conditionId: "topic:cold exposure",
    source: "epmc",
    externalId: "10.1/x",
    title: "Cold water immersion and mood",
    journal: "J Physiol",
    url: "https://doi.org/10.1/x",
    publishedAt: "2026-08-02",
    grade: null,
    finding: null,
    abstract: null,
    moves: null,
    foundAt: new Date("2026-09-01T00:00:00Z"),
    seenAt: null,
    dismissedAt: null,
  } as unknown as PaperWatch;

  it("prints the person's own label for the topic", () => {
    const labels = new Map([["topic:cold exposure", "Cold exposure"]]);
    expect(toApiPaper(row, labels).conditionName).toBe("Cold exposure");
  });

  it("falls back to the topic itself, and stays null for a condition", () => {
    expect(conditionNameOf("topic:cold exposure")).toBe("cold exposure");
    expect(conditionNameOf("hashimoto")).toBe(null);
  });

  it("says found, not read yet when nothing read it", () => {
    expect(toApiPaper(row).read).toBe(false);
  });
});

describe("where a topic comes from", () => {
  it("takes the first noun phrase of a protocol line", () => {
    expect(firstNounPhrase("Creatine monohydrate 5 g with breakfast")).toBe(
      "Creatine monohydrate",
    );
    expect(firstNounPhrase("Take psyllium husk, 10 g at night")).toBe(
      "psyllium husk",
    );
    expect(firstNounPhrase("Walk 30 minutes")).toBe("Walk");
  });
});
