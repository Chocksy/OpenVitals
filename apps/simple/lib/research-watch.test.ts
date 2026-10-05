import { describe, expect, it } from "vitest";
import {
  askAbout,
  catalogWith,
  cleanLine,
  externalIdOf,
  findingOf,
  MOVE_FLOOR,
  moveOf,
  plainAbstract,
  proposalRule,
  sortWatch,
  summaryOf,
  toApiPaper,
  whyShown,
  WATCH_DAYS,
  watchDue,
  watchRows,
  watchSince,
  type PaperFacts,
  type WatchCandidate,
  type WatchCondition,
} from "./research-watch";
import type { PaperWatch } from "@/db";
import type { Proposal } from "./research";
import type { Catalog } from "./hypotheses";

/**
 * The watch, tested where it is pure: the window, the proposal-to-rule
 * projection, the delta, the row it writes and the order the page reads. The
 * two impure functions (`runWatch`, `runWatchForUser`) reach Europe PMC and a
 * model, and `researchCondition` already takes an injected extractor, so what
 * is worth locking is everything around them.
 */

const NOW = new Date("2026-09-03T10:00:00Z");

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p1",
  conditionId: "hashimoto",
  featureId: "metric:tpo_antibodies",
  conditionOn: { above: 34 },
  lrPos: 8.4,
  lrNeg: 0.3,
  grade: "A",
  source: "Hollowell 2002",
  population: null,
  status: "proposed",
  needsLook: false,
  thresholdUnit: "IU/mL",
  reviewNote: null,
  paper: {
    pmid: "11836274",
    doi: "10.1210/jcem.87.2.8182",
    title: "Serum TSH, T4 and thyroid antibodies in the United States",
    year: 2002,
    journal: "J Clin Endocrinol Metab",
    url: "https://doi.org/10.1210/jcem.87.2.8182",
    quote:
      "A positive TPO antibody carries an odds ratio of 8.4 for raised TSH.",
  },
  ...over,
});

describe("the window", () => {
  it("asks for ninety days when nothing was ever read", () => {
    expect(watchSince(null, NOW)).toBe("2026-06-05");
  });

  it("takes the later of the last run and the floor", () => {
    expect(watchSince("2026-08-01", NOW)).toBe("2026-08-01");
    expect(watchSince("2025-01-01", NOW)).toBe("2026-06-05");
  });

  it("is due when nothing was ever read", () => {
    expect(watchDue(null, NOW)).toBe(true);
  });

  it("is not due inside the cooldown, and is due on the day it ends", () => {
    const days = (n: number) =>
      new Date(NOW.getTime() - n * 86_400_000).toISOString();
    expect(watchDue(days(WATCH_DAYS - 1), NOW)).toBe(false);
    expect(watchDue(days(WATCH_DAYS), NOW)).toBe(true);
  });
});

describe("one proposal as a rule the scorer reads", () => {
  it("turns a metric feature into a metric input", () => {
    const rule = proposalRule(proposal());
    expect(rule.input).toEqual({ metric: "tpo_antibodies" });
    expect(rule.when).toEqual({ above: 34 });
    expect(rule.lr).toBe(8.4);
    expect(rule.lrNeg).toBe(0.3);
    expect(rule.grade).toBe("A");
  });

  it("turns a fact feature into a fact input", () => {
    const rule = proposalRule(proposal({ featureId: "fact:family_thyroid" }));
    expect(rule.input).toEqual({ fact: "family_thyroid" });
  });

  it("leaves lrNeg off when the paper had none", () => {
    expect(proposalRule(proposal({ lrNeg: null })).lrNeg).toBeUndefined();
  });

  it("adds the rule to one condition and to no other", () => {
    const catalog = [
      { id: "hashimoto", evidence: [] },
      { id: "t2d", evidence: [] },
    ] as unknown as Catalog;
    const out = catalogWith(catalog, "hashimoto", proposalRule(proposal()));
    expect(out[0]!.evidence).toHaveLength(1);
    expect(out[1]!.evidence).toHaveLength(0);
    // the input is not mutated
    expect(catalog[0]!.evidence).toHaveLength(0);
  });
});

describe("what it would move", () => {
  const before = [{ id: "hashimoto", score: 0.5 }];

  it("is null when the condition is not scored either side", () => {
    expect(moveOf([], [], "hashimoto", "Hashimoto's")).toBeNull();
  });

  it("is null when the change is under the floor", () => {
    const after = [{ id: "hashimoto", score: 0.5 + MOVE_FLOOR / 2 }];
    expect(moveOf(before, after, "hashimoto", "Hashimoto's")).toBeNull();
  });

  it("names the direction and keeps the delta", () => {
    expect(
      moveOf(
        before,
        [{ id: "hashimoto", score: 0.62 }],
        "hashimoto",
        "Hashimoto's",
      ),
    ).toEqual({
      conclusionId: "hashimoto",
      name: "Hashimoto's",
      direction: "up",
      delta: expect.closeTo(0.12, 6),
    });
    expect(
      moveOf(
        before,
        [{ id: "hashimoto", score: 0.4 }],
        "hashimoto",
        "Hashimoto's",
      )?.direction,
    ).toBe("down");
  });
});

describe("one paper is one row", () => {
  const condition: WatchCondition = {
    id: "hashimoto",
    name: "Hashimoto's thyroiditis",
    probability: 0.95,
    state: "confirmed",
  };

  const candidate = (over: Partial<Proposal> = {}): WatchCandidate => {
    const p = proposal(over);
    return {
      paper: {
        pmid: p.paper.pmid,
        doi: p.paper.doi,
        title: p.paper.title,
        journal: p.paper.journal,
        year: p.paper.year,
        authors: "",
        citedBy: 0,
        url: p.paper.url,
        abstract: "",
      },
      proposal: p,
    };
  };

  it("keys on the DOI, lowercased, then the PMID, then the title", () => {
    expect(externalIdOf({ doi: "10.1/AB", pmid: "1", title: "t" })).toBe(
      "10.1/ab",
    );
    expect(externalIdOf({ doi: null, pmid: "1", title: "t" })).toBe("1");
    expect(externalIdOf({ doi: null, pmid: null, title: "t" })).toBe("t");
  });

  it("keeps the intake's own sentence and never writes one", () => {
    expect(findingOf(proposal())).toMatch(/odds ratio of 8.4/);
    expect(findingOf(null)).toBeNull();
    expect(
      findingOf(proposal({ paper: { ...proposal().paper, quote: "  " } })),
    ).toBeNull();
  });

  it("writes the row the feed reads, with the day and the abstract", () => {
    const facts = new Map<string, PaperFacts>([
      [
        "10.1210/jcem.87.2.8182",
        {
          publishedAt: "2002-02-01",
          abstract: "Thyroid antibodies in NHANES III.",
        },
      ],
    ]);
    const [row] = watchRows(
      "u1",
      condition,
      [candidate()],
      new Map([
        [
          "10.1210/jcem.87.2.8182",
          {
            conclusionId: "hashimoto",
            name: "Hashimoto's thyroiditis",
            direction: "up" as const,
            delta: 0.04,
          },
        ],
      ]),
      facts,
    );
    expect(row).toMatchObject({
      userId: "u1",
      conditionId: "hashimoto",
      source: "epmc",
      externalId: "10.1210/jcem.87.2.8182",
      journal: "J Clin Endocrinol Metab",
      publishedAt: "2002-02-01",
      abstract: "Thyroid antibodies in NHANES III.",
      grade: "A",
    });
    expect(row!.moves).toMatchObject({ direction: "up", delta: 0.04 });
  });

  it("leaves the day null rather than dating a year to January", () => {
    const [row] = watchRows("u1", condition, [candidate()], new Map());
    expect(row!.publishedAt).toBeNull();
    expect(row!.moves).toBeNull();
  });
});

describe("the order the panel reads", () => {
  const row = (
    id: string,
    seen: Date | null,
    moves: unknown,
    found: string,
  ) => ({
    id,
    seenAt: seen,
    moves: moves as never,
    foundAt: new Date(found),
  });

  it("puts unseen first, then what moves something, then the newest", () => {
    const rows = [
      row("seen-moves", new Date("2026-09-01"), { delta: 0.1 }, "2026-09-01"),
      row("unseen-flat", null, null, "2026-08-01"),
      row("unseen-moves", null, { delta: 0.1 }, "2026-07-01"),
      row("unseen-flat-new", null, null, "2026-09-02"),
    ];
    expect(sortWatch(rows).map((r) => r.id)).toEqual([
      "unseen-moves",
      "unseen-flat-new",
      "unseen-flat",
      "seen-moves",
    ]);
  });
});

describe("a row a person can read and act on", () => {
  const stored = (over: Partial<PaperWatch> = {}): PaperWatch =>
    ({
      id: "r1",
      userId: "u1",
      conditionId: "ascvd_risk",
      source: "epmc",
      externalId: "10.1/psyllium",
      title: "Psyllium and LDL cholesterol: a meta-analysis",
      journal: "Am J Clin Nutr",
      url: "https://doi.org/10.1/psyllium",
      publishedAt: "2026-08-02",
      grade: null,
      finding: null,
      abstract: "<h4>Results</h4>Psyllium lowered LDL.",
      summary: null,
      moves: null,
      foundAt: new Date("2026-09-01T00:00:00Z"),
      seenAt: null,
      dismissedAt: null,
      ...over,
    }) as PaperWatch;

  it("prints the plain line, and treats the empty one as none", () => {
    expect(summaryOf(stored({ summary: "  It lowered LDL. " }))).toBe(
      "It lowered LDL.",
    );
    expect(summaryOf(stored({ summary: "" }))).toBeNull();
    expect(summaryOf(stored())).toBeNull();
  });

  it("says why the row is here: a move first, then a topic, then a condition", () => {
    const names = new Map([
      ["ascvd_risk", "Heart and artery disease risk"],
      ["topic:psyllium", "Psyllium"],
    ]);
    expect(whyShown(stored(), names)).toBe(
      "Your results flag Heart and artery disease risk as possible.",
    );
    expect(whyShown(stored({ conditionId: "topic:psyllium" }), names)).toBe(
      "You watch Psyllium.",
    );
    expect(
      whyShown(
        stored({
          moves: {
            conclusionId: "ascvd_risk",
            name: "ASCVD risk",
            direction: "down",
            delta: -0.04,
          },
        }),
        names,
      ),
    ).toBe("It changes how likely ASCVD risk is for you.");
    // no map: the id, readable, never a blank
    expect(whyShown(stored())).toBe("Your results flag ascvd risk as possible.");
  });

  it("asks with what the row knows, and nothing it does not", () => {
    expect(askAbout(stored())).toBe(
      "What does this paper mean for me? “Psyllium and LDL cholesterol: a meta-analysis” (Am J Clin Nutr, 2026).",
    );
    expect(
      askAbout(stored({ summary: "Psyllium lowered LDL by 13 mg/dL." })),
    ).toContain("What it found: Psyllium lowered LDL by 13 mg/dL.");
  });

  it("puts the line, the reason, the question and the action on the wire", () => {
    const action = {
      id: "int:psyllium_ldl",
      title: "Psyllium",
      dose: "10 g/day",
      grade: "A",
    };
    const api = toApiPaper(
      stored({ summary: "Psyllium lowered LDL." }),
      new Map([["ascvd_risk", "ASCVD risk"]]),
      new Map([["10.1/psyllium", action]]),
    );
    expect(api.summary).toBe("Psyllium lowered LDL.");
    expect(api.why).toBe("Your results flag ASCVD risk as possible.");
    expect(api.conditionName).toBe("ASCVD risk");
    expect(api.ask).toContain("What it found: Psyllium lowered LDL.");
    expect(api.about).toBe("ascvd_risk");
    expect(api.action).toEqual(action);
    // a topic row is about no condition, and a row with no action has none
    const topic = toApiPaper(stored({ conditionId: "topic:psyllium" }));
    expect(topic.about).toBeNull();
    expect(topic.action).toBeNull();
  });

  it("hands the model prose, and keeps one clean sentence back", () => {
    expect(plainAbstract("<h4>Results</h4>Psyllium  lowered\nLDL.")).toBe(
      "Results Psyllium lowered LDL.",
    );
    expect(plainAbstract(null)).toBe("");
    expect(cleanLine("  “It lowered LDL.” ")).toBe("It lowered LDL.");
    expect(cleanLine("")).toBeNull();
    expect(cleanLine(null)).toBeNull();
  });
});
