import { describe, expect, it } from "vitest";
import type { MetricRow } from "./data";
import { GENOME_CATALOG } from "./genome-catalog";
import { CATALOG } from "./hkb-catalog";
import {
  changedLine,
  documentFinding,
  explainInput,
  explainKey,
  genomeEffect,
  genomeFinding,
} from "./explain";
import type {
  EvidenceRule,
  HState,
  HypothesisResult,
} from "./hypotheses";
import {
  beliefsOf,
  byRank,
  improvedOf,
  isConclusion,
  isLoud,
  mattersOf,
  nextDraw,
  RISK_WORD,
  rulerLead,
  sinceOf,
  titleOf,
  weeksUntil,
  type Beliefs,
  type Rankable,
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
      nextTests: [{ test: "a test", cost: 1, expectedShift: 0.2, ratio: 0.2 }],
    });
    expect(isConclusion(h, false)).toBe(false);
    expect(isConclusion(h, true)).toBe(false);
  });

  it("still gives an unlikely one a card when a rule fired and a test would move it", () => {
    const h = hypothesis("hashimoto", 0.2, "unlikely", {
      for: [{ rule: "r", input: "tsh", value: "4.9", lr: 3, grade: "A" }],
      nextTests: [
        { test: "Anti-TPO", cost: 1, expectedShift: 0.3, ratio: 0.3 },
      ],
    });
    expect(isConclusion(h)).toBe(true);
  });
});

/* ── the phase-24a order ──────────────────────────────────────────────── */

/** A conclusion as `byRank` reads one: id, state, matters, probability, title. */
const card = (
  id: string,
  state: HState | undefined,
  p: number,
  w: number,
): Rankable => ({
  id,
  state,
  matters: Math.round(p * w * 1000) / 1000,
  probability: p,
  title: state ? titleOf({ id, name: id.replace(/_/g, " "), state }) : id,
});

describe("byRank", () => {
  it("puts a confirmed finding above a possible one under every lens", () => {
    // Ramona: iron deficiency 92.6 % confirmed, weight 1, against a 49 %
    // cardiovascular risk score the lifespan lens weights 3.
    const iron = card("iron_deficiency", "confirmed", 0.926, 1);
    const ascvd = card("ascvd_risk", "possible", 0.49, 3);
    expect(ascvd.matters).toBeGreaterThan(iron.matters);
    for (const w of [1, 2, 3])
      expect(
        [card("ascvd_risk", "possible", 0.49, w), iron].sort(byRank)[0]!.id,
      ).toBe("iron_deficiency");
  });

  it("sorts a risk state after a disease of the same band", () => {
    const risk = card("ascvd_risk", "possible", 0.43, 3);
    const disease = card("hypertension", "possible", 0.32, 3);
    expect(risk.matters).toBeGreaterThan(disease.matters);
    expect([risk, disease].sort(byRank).map((c) => c.id)).toEqual([
      "hypertension",
      "ascvd_risk",
    ]);
  });

  it("still lets a risk state outrank a disease of a lower band", () => {
    const risk = card("ascvd_risk", "likely", 0.7, 3);
    const disease = card("hypertension", "possible", 0.32, 3);
    expect([disease, risk].sort(byRank)[0]!.id).toBe("ascvd_risk");
  });

  it("lets the lens reorder inside a band and nowhere else", () => {
    const a = card("insulin_resistance", "possible", 0.3, 3);
    const b = card("masld", "possible", 0.25, 2);
    expect([b, a].sort(byRank).map((c) => c.id)).toEqual([
      "insulin_resistance",
      "masld",
    ]);
    // same two conditions, the other lens: weight flips, order flips
    const a2 = card("insulin_resistance", "possible", 0.3, 1);
    const b2 = card("masld", "possible", 0.25, 3);
    expect([a2, b2].sort(byRank).map((c) => c.id)).toEqual([
      "masld",
      "insulin_resistance",
    ]);
  });

  it("puts an off marker under possible and over unlikely", () => {
    const marker: Rankable = {
      id: "marker:ldl_cholesterol",
      matters: 0,
      title: "LDL 131 mg/dL, off",
    };
    const possible = card("hypertension", "possible", 0.32, 3);
    const unlikely = card("hashimoto", "unlikely", 0.2, 3);
    expect([marker, unlikely, possible].sort(byRank).map((c) => c.id)).toEqual([
      "hypertension",
      "marker:ldl_cholesterol",
      "hashimoto",
    ]);
  });

  it("falls back to probability and then to the title", () => {
    const a = card("b_thing", "possible", 0.4, 1);
    const b = card("a_thing", "possible", 0.4, 1);
    expect([a, b].sort(byRank).map((c) => c.id)).toEqual([
      "a_thing",
      "b_thing",
    ]);
  });
});

describe("the risk grammar", () => {
  it("maps every state to a risk word", () => {
    expect(RISK_WORD.possible).toBe("raised");
    expect(RISK_WORD.likely).toBe("high");
    expect(RISK_WORD.confirmed).toBe("very high");
    expect(RISK_WORD.unlikely).toBe("low");
  });

  it("titles the three risk states, never as a diagnosis", () => {
    expect(
      titleOf({
        id: "ascvd_risk",
        name: "Atherosclerotic risk",
        state: "possible",
      }),
    ).toBe("Cardiovascular risk: raised");
    expect(
      titleOf({
        id: "cancer_screening_due",
        name: "Cancer screening overdue",
        state: "possible",
      }),
    ).toBe("Screening: overdue");
    expect(
      titleOf({
        id: "low_fitness_sarcopenia",
        name: "Low fitness and muscle loss",
        state: "possible",
      }),
    ).toBe("Fitness: low");
  });

  it("leaves a disease alone", () => {
    expect(
      titleOf({ id: "hashimoto", name: "Hashimoto's", state: "confirmed" }),
    ).toBe("Hashimoto's: confirmed");
  });

  it("reads the catalog flag as well as the three ids", () => {
    expect(
      titleOf({
        id: "some_new_score",
        name: "Some new score",
        state: "likely",
        kind: "risk",
      }),
    ).toBe("Some new score: high");
  });
});

/* ── phase 24c: the engine's inputs in English ────────────────────────── */

/* ── phase 25a item 9: three small lies on the cards ──────────────────── */

describe("changedLine", () => {
  it("does not print a change of state that did not happen", () => {
    expect(changedLine({ from: "likely", to: "likely", deltaP: 0.08 })).toBe(
      "+8 pts since yesterday",
    );
    expect(changedLine({ from: "likely", to: "likely", deltaP: -0.04 })).toBe(
      "-4 pts since yesterday",
    );
  });

  it("still says what flipped when something flipped", () => {
    expect(changedLine({ from: "possible", to: "likely", deltaP: 0.21 })).toBe(
      "was possible → likely (+21 pts)",
    );
    expect(changedLine({ to: "possible", deltaP: 0.3 })).toBe(
      "was not scored → possible (+30 pts)",
    );
    expect(changedLine({ from: "ruled_out", to: "possible", deltaP: 0.3 })).toBe(
      "was ruled out → possible (+30 pts)",
    );
  });
});

describe("explainKey", () => {
  it("prints a marker the graph does not name as the acronym it is", () => {
    expect(explainKey("amh")).toBe("AMH");
    expect(explainKey("shbg")).toBe("SHBG");
  });

  it("still prefers a name the graph does carry", () => {
    expect(explainKey("hba1c")).toBe("HbA1c");
    expect(explainKey("testosterone")).toBe("Testosterone");
  });

  it("leaves a compound key as words", () => {
    expect(explainKey("some_unknown_thing")).toBe("some unknown thing");
  });
});

describe("explainInput", () => {
  const line = (input: string, value: string, lr = 2) => ({
    input,
    value,
    lr,
  });

  it("names a metric and keeps its value and unit", () => {
    expect(explainInput(line("hba1c", "5.6 %"))).toBe("HbA1c 5.6 %");
    expect(explainInput(line("apolipoprotein_b", "99 mg/dL"))).toBe(
      "ApoB 99 mg/dL",
    );
  });

  it("spells out a derived number", () => {
    expect(explainInput(line("tgHdl", "2.12"))).toBe(
      "triglyceride/HDL ratio 2.12",
    );
    expect(explainInput(line("homaIr", "3.1"))).toBe("HOMA-IR 3.1");
  });

  it("gives a fact the label the interview asks it by", () => {
    expect(explainInput(line("family_history", "no"))).toBe(
      "Family history: no",
    );
    expect(explainInput(line("sym_energy", "Yes"))).toBe(
      "Tired most days: Yes",
    );
  });

  it("says what a genotype does, because a genotype alone says nothing", () => {
    expect(explainInput(line("genome:tcf7l2", "CT", 1.4))).toBe(
      "TCF7L2 CT raises the prior ×1.4",
    );
    expect(explainInput(line("genome:hla_dq", "no DQ2.5 or DQ8 tag", 0.1))).toBe(
      "HLA no DQ2.5 or DQ8 tag lowers the prior ×0.1",
    );
    expect(explainInput(line("genome:apoe", "e3/e3", 1))).toBe("APOE e3/e3");
  });

  it("turns a chained hypothesis into a state and a percentage", () => {
    expect(explainInput(line("hypothesis:insulin_resistance", "0.637"))).toBe(
      "insulin resistance likely (64 %)",
    );
    expect(
      explainInput(line("hypothesis:hypertension", "0.3"), () =>
        "High blood pressure",
      ),
    ).toBe("High blood pressure possible (30 %)");
  });

  it("reads a life event off the timeline", () => {
    expect(explainInput(line("event:pregnancy", "pregnancy, surgery"))).toBe(
      "pregnancy in your timeline",
    );
  });

  it("falls back to the code as words, never as a code", () => {
    expect(explainInput(line("some_new_marker", "7"))).toBe(
      "some new marker 7",
    );
  });
});

describe("no FOR / AGAINST string carries an engine token", () => {
  /** `hypothesis:`, `genome:`, `fact:`, or any underscore-joined code. */
  const TOKEN = /hypothesis:|genome:|fact:|[a-z0-9]+_[a-z0-9]+/;

  /** The label `resolve` hands the card, for every rule in the catalog. */
  const labelOf = (input: EvidenceRule["input"]): string =>
    input.metric ??
    input.derived ??
    (input.hypothesis ? `hypothesis:${input.hypothesis}` : null) ??
    (input.event ? `event:${input.event}` : null) ??
    input.fact ??
    "";

  it("holds for every evidence rule the catalog ships", () => {
    const bad: string[] = [];
    for (const h of CATALOG)
      for (const rule of h.evidence) {
        const input = labelOf(rule.input);
        if (!input) continue;
        for (const lr of [rule.lr, rule.lrNeg ?? 1]) {
          const text = explainInput({ input, value: "0.5", lr });
          if (TOKEN.test(text)) bad.push(`${input} → ${text}`);
        }
      }
    expect(bad).toEqual([]);
  });

  it("holds for the labels the missing and discounted lists print", () => {
    const bad: string[] = [];
    for (const h of CATALOG)
      for (const rule of h.evidence) {
        const input = labelOf(rule.input);
        if (!input) continue;
        const text = explainKey(input);
        if (TOKEN.test(text)) bad.push(`${input} → ${text}`);
      }
    expect(bad).toEqual([]);
  });
});

describe("the genome card", () => {
  const rowOf = (id: string) => GENOME_CATALOG.find((r) => r.id === id)!;
  const called = (id: string, call: string, meaning: string) => ({
    row: rowOf(id),
    result: { genotype: "x", call, meaning },
  });

  /** Three calls that move something, one that does not, in catalog order. */
  const results = [
    called("apoe", "e3/e3", "The common pair."),
    called("hfe", "C282Y homozygous", "The genotype behind haemochromatosis."),
    called("hla_dq", "no DQ2.5 or DQ8 tag", "Coeliac disease is essentially excluded."),
    called("tcf7l2", "CT", "About 40 % above background risk."),
    called("fto", "AA", "Roughly 2.4 kg more body weight."),
  ];
  const upload = { id: "u1", at: "2026-08-28" };

  it("lists the three calls with the biggest effect, not the first three", () => {
    const card = genomeFinding(upload, results, "2026-09-01")!;
    expect(card.title).toBe("What your genome changed");
    expect(card.lines.map((l) => l.label)).toEqual(["HFE", "HLA", "FTO"]);
    expect(card.lines[2]!.text).toBe("Roughly 2.4 kg more body weight.");
  });

  /**
   * Phase 31a item 9. The label used to be "HLA no DQ2.5 or DQ8 tag" — a gene
   * and a genotype, which is what the array read and not what it settles.
   */
  it("leads with the verdict, and keeps the genotype out of the label", () => {
    const card = genomeFinding(upload, results, "2026-09-01")!;
    expect(card.lines.map((l) => l.label).join(" ")).not.toMatch(
      /DQ2\.5|C282Y|AA/,
    );
    expect(card.lines[1]!.text).toBe("Coeliac disease is essentially excluded.");
  });

  it("counts every call behind the see-all link, and links to the upload", () => {
    const card = genomeFinding(upload, results, "2026-09-01")!;
    expect(card.total).toBe(5);
    expect(card.href).toBe("/blood/uploads/u1");
  });

  it("stays for fourteen days and then goes", () => {
    expect(genomeFinding(upload, results, "2026-08-28")).not.toBeNull();
    expect(genomeFinding(upload, results, "2026-09-11")).not.toBeNull();
    expect(genomeFinding(upload, results, "2026-09-12")).toBeNull();
  });

  it("says nothing when the array called nothing", () => {
    expect(
      genomeFinding(upload, [{ row: rowOf("apoe"), result: null }], "2026-09-01"),
    ).toBeNull();
  });

  it("scores a call that excludes a condition above one that nudges a prior", () => {
    const exclude = genomeEffect(rowOf("hla_dq"), {
      genotype: "x",
      call: "no DQ2.5 or DQ8 tag",
      meaning: "",
    });
    const nudge = genomeEffect(rowOf("tcf7l2"), {
      genotype: "x",
      call: "CT",
      meaning: "",
    });
    const nothing = genomeEffect(rowOf("apoe"), {
      genotype: "x",
      call: "e3/e3",
      meaning: "",
    });
    expect(exclude).toBeGreaterThan(nudge);
    expect(nudge).toBeGreaterThan(nothing);
    expect(nothing).toBe(0);
  });
});

describe("the document card", () => {
  const upload = { id: "d1", at: "2026-08-30", docType: "discharge" };
  const items = [
    { kind: "recommendation", text: "Repeat the ultrasound in a year." },
    { kind: "finding", text: "Grade 2 hepatic steatosis." },
    { kind: "diagnosis", text: "Fatty liver disease", moved: "diagnosis · K76.0" },
    { kind: "medication", text: "Metformin 500 mg" },
  ];

  it("names the document and reads diagnoses before recommendations", () => {
    const card = documentFinding(upload, items, "2026-09-01")!;
    expect(card.title).toBe("What your discharge note changed");
    expect(card.lines.map((l) => l.text)).toEqual([
      "Fatty liver disease",
      "Grade 2 hepatic steatosis.",
      "Metformin 500 mg",
    ]);
    expect(card.lines[0]!.label).toBe("diagnosis · K76.0");
    expect(card.total).toBe(4);
  });

  it("keeps quiet when nothing was accepted, and after a fortnight", () => {
    expect(documentFinding(upload, [], "2026-09-01")).toBeNull();
    expect(documentFinding(upload, items, "2026-09-14")).toBeNull();
  });
});

/**
 * Phase 27. "Plan retest: HbA1c in 12 weeks" under an answer writes a goal
 * with a due date, and the Next draw tile is where a person looks to see that
 * it landed. So the tile reads what is actually planned first, and only falls
 * back to what the engine would buy next when nothing is.
 */
describe("nextDraw", () => {
  const today = "2026-09-01";

  it("counts the weeks to a planned retest", () => {
    expect(weeksUntil("2026-11-24", today)).toBe(12);
    expect(weeksUntil("2026-09-01", today)).toBe(0);
  });

  it("never counts a missed draw as weeks away", () => {
    expect(weeksUntil("2026-06-01", today)).toBe(0);
  });

  it("leads with the soonest thing that was actually planned", () => {
    expect(
      nextDraw(
        [
          { code: "hba1c", weeks: 12 },
          { code: "ferritin", weeks: 8 },
        ],
        [{ code: "ldl_cholesterol", weeks: 4 }],
        ["Fasting insulin"],
      ),
    ).toEqual({ weeks: 8, codes: ["hba1c", "ferritin"] });
  });

  it("falls back to what an adopted action promised to measure", () => {
    expect(nextDraw([], [{ code: "ldl_cholesterol", weeks: 4 }], ["x"])).toEqual(
      { weeks: 4, codes: ["ldl_cholesterol"] },
    );
  });

  it("says what the engine would buy next when nothing is planned", () => {
    expect(nextDraw([], [], ["Fasting insulin", "Fasting insulin"])).toEqual({
      weeks: 12,
      codes: ["Fasting insulin"],
    });
  });

  it("prints at most four markers", () => {
    const many = ["a", "b", "c", "d", "e"].map((code) => ({ code, weeks: 6 }));
    expect(nextDraw(many, [], []).codes).toHaveLength(4);
  });
});


/* ── the ruler a card draws (phase 30d, UX note 2) ────────────────────── */

describe("rulerLead", () => {
  const crp: MetricRow = {
    ...metric("hs_crp", [["2026-08-01", 3.4]]),
    status: "amber",
  };
  const ferritin: MetricRow = {
    ...metric("ferritin", [["2026-08-01", 22]]),
    status: "red",
  };
  const byCode = new Map<string, MetricRow>([
    ["hs_crp", crp],
    ["ferritin", ferritin],
  ]);
  const codes = ["hs_crp", "ferritin"];

  it("draws the marker the FOR line names, not the worst one", () => {
    const lead = rulerLead(codes, byCode, [{ input: "hs_crp" }]);
    expect(lead?.code).toBe("hs_crp");
  });

  it("draws nothing when the FOR line names no marker it is scored on", () => {
    expect(rulerLead(codes, byCode, [{ input: "family_history" }])).toBe(null);
    expect(rulerLead(codes, byCode, [])).toBe(null);
  });

  it("reads only the two FOR lines the card actually prints", () => {
    const lines = [
      { input: "family_history" },
      { input: "tired_most_days" },
      { input: "ferritin" },
    ];
    expect(rulerLead(codes, byCode, lines)).toBe(null);
  });

  it("takes the worst of the markers the FOR line does name", () => {
    const lead = rulerLead(codes, byCode, [
      { input: "hs_crp" },
      { input: "ferritin" },
    ]);
    expect(lead?.code).toBe("ferritin");
  });
});
