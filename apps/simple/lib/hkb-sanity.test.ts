/**
 * The catalog sanity suite: eight invariants over the whole knowledge base.
 *
 * Phase 21. Every defect this phase fixed was invisible because nothing looked
 * at the catalog as a whole: a rule reading a fact nobody asks, a cut written
 * for men applied to a woman, a likelihood ratio of 1, a mammography offered
 * to a 41-year-old man. Each of those is one line of arithmetic over
 * `CATALOG`, and each of them now fails the build instead of a person.
 *
 * Pure: no database, no clock, no LLM. Every check prints the rows it is
 * unhappy about, so a failing import names its own bad rows, and every check
 * asserts it actually scanned something, so a check cannot pass by looking at
 * an empty list.
 */
import { describe, expect, it } from "vitest";
import { EDGES, NODES } from "./graph";
import { GENOME_CATALOG } from "./genome-catalog";
import { CATALOG } from "./hkb-catalog";
import {
  discriminatorApplies,
  scoreHypotheses,
  SYNTHETIC_FACTS,
  type Discriminator,
  type EvidenceRule,
  type Hypothesis,
} from "./hypotheses";
import type { ModelInput } from "./coverage";
import {
  BOUNDS,
  DEFAULT_REF_HIGH,
  PROFILE_QUESTIONS,
  VECTORS,
} from "./vectors";

const rules: { h: Hypothesis; e: EvidenceRule }[] = CATALOG.flatMap((h) =>
  h.evidence.map((e) => ({ h, e })),
);
const tests: { h: Hypothesis; d: Discriminator }[] = CATALOG.flatMap((h) =>
  h.discriminators.map((d) => ({ h, d })),
);

const rid = (h: Hypothesis, e: EvidenceRule) => `${h.id}/${e.id}`;
const tid = (h: Hypothesis, d: Discriminator) => `${h.id}/${d.test}`;

/** A `hypotheses.ts` fact is answerable, computed, or read off a file. */
const answerable = (key: string) =>
  key in PROFILE_QUESTIONS ||
  SYNTHETIC_FACTS.has(key) ||
  key.startsWith("genome:") ||
  key.startsWith("hp:");

/* ── 1. no orphan facts ───────────────────────────────────────────────── */

describe("every rule reads something a person can answer", () => {
  it("has no evidence rule pointing at a fact no question writes", () => {
    const orphans = rules
      .filter(({ e }) => e.input.fact && !answerable(e.input.fact))
      .map(({ h, e }) => `${rid(h, e)} reads ${e.input.fact}`);
    expect(orphans).toEqual([]);
  });

  it("scans every rule in the catalog", () => {
    expect(rules.length).toBeGreaterThan(200);
    expect(rules.filter(({ e }) => e.input.fact).length).toBeGreaterThan(60);
  });
});

/* ── 2. option strings match the question ─────────────────────────────── */

/**
 * Answers that are free text or a comma-separated list, so there is no option
 * to compare against: a needle here is a documented substring pattern.
 */
const FREE_FACTS = new Set([
  "family_history",
  "screening_dates",
  "conditions",
  "medications",
  "supplements",
  // Has options since phase 21, but `saveFact` checks none: the curator and
  // the document extractor write what a person wrote ("plant-based"), so the
  // needles here stay wider than the six options on the question.
  "diet",
]);

describe("every option a rule tests for is an option the question offers", () => {
  const optioned = rules.filter(
    ({ e }) =>
      e.input.fact &&
      !FREE_FACTS.has(e.input.fact) &&
      PROFILE_QUESTIONS[e.input.fact]?.options,
  );
  const optionsOf = (fact: string) =>
    PROFILE_QUESTIONS[fact]!.options!.map((o) => o.toLowerCase());

  it("matches every `equals` case-insensitively", () => {
    const bad = optioned
      .filter(({ e }) => e.when.equals != null)
      .filter(
        ({ e }) =>
          !optionsOf(e.input.fact!).includes(e.when.equals!.toLowerCase()),
      )
      .map(
        ({ h, e }) =>
          `${rid(h, e)} wants "${e.when.equals}", offered ${optionsOf(e.input.fact!).join(" / ")}`,
      );
    expect(bad).toEqual([]);
  });

  it("matches every `includes` needle", () => {
    const bad: string[] = [];
    for (const { h, e } of optioned) {
      if (e.when.includes == null) continue;
      const options = optionsOf(e.input.fact!);
      const missed = e.when.includes
        .toLowerCase()
        .split("|")
        .filter((needle) => !options.some((o) => o.includes(needle)));
      if (missed.length)
        bad.push(
          `${rid(h, e)} has no option for ${missed.join(", ")} (offered ${options.join(" / ")})`,
        );
    }
    expect(bad).toEqual([]);
  });

  it("scans the questions that have options", () => {
    expect(optioned.length).toBeGreaterThan(40);
  });
});

/* ── 3. likelihood ratios that say something ──────────────────────────── */

describe("no rule and no test is a no-op", () => {
  it("has no rule with an LR of 1 both ways", () => {
    const noop = rules
      .filter(({ e }) => e.lr === 1 && (e.lrNeg ?? 1) === 1)
      .map(({ h, e }) => rid(h, e));
    expect(noop).toEqual([]);
  });

  it("keeps the negative below the positive wherever both are written", () => {
    const inverted = rules
      .filter(({ e }) => e.lrNeg != null && e.lrNeg >= e.lr)
      .map(({ h, e }) => `${rid(h, e)} lr ${e.lr} lrNeg ${e.lrNeg}`);
    expect(inverted).toEqual([]);
  });

  it("has every discriminator pointing both ways round 1", () => {
    const bad = tests
      .filter(({ d }) => !(d.lrPos > 1 && d.lrNeg > 0 && d.lrNeg < 1))
      .map(({ h, d }) => `${tid(h, d)} ${d.lrPos}/${d.lrNeg}`);
    expect(bad).toEqual([]);
  });

  it("scans every rule and every test", () => {
    expect(rules.length).toBeGreaterThan(200);
    expect(tests.length).toBeGreaterThan(80);
  });
});

/* ── 3b. one row per rule, the way the table is keyed ─────────────────── */

describe("the catalog seeds without a collision", () => {
  // `hkb_evidence` is keyed on the id and unique on
  // (condition_id, feature_id, condition_on). A catalog that breaks either one
  // fails `pnpm hkb:seed` halfway through, which is how phase 21 found that
  // two conditions carried the same rule twice.
  const featureOf = (e: EvidenceRule) =>
    e.input.metric
      ? `metric:${e.input.metric}`
      : e.input.derived
        ? `derived:${e.input.derived}`
        : e.input.event
          ? `event:${e.input.event}`
          : e.input.hypothesis
            ? `hypothesis:${e.input.hypothesis}`
            : `fact:${e.input.fact}`;

  it("has one rule per id", () => {
    const seen = new Map<string, number>();
    for (const { h, e } of rules)
      seen.set(rid(h, e), (seen.get(rid(h, e)) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1).map(([id]) => id)).toEqual([]);
  });

  it("has one rule per condition, feature and condition", () => {
    const seen = new Map<string, string[]>();
    for (const { h, e } of rules) {
      const key = `${h.id}|${featureOf(e)}|${JSON.stringify(e.when)}`;
      seen.set(key, [...(seen.get(key) ?? []), e.id]);
    }
    expect(
      [...seen]
        .filter(([, ids]) => ids.length > 1)
        .map(([key, ids]) => `${key} :: ${ids.join(", ")}`),
    ).toEqual([]);
  });
});

/* ── 4. thresholds a living person could produce ──────────────────────── */

describe("numeric thresholds sit inside what a body can read", () => {
  const bounded = rules.filter(
    ({ e }) =>
      e.input.metric &&
      BOUNDS[e.input.metric] &&
      (e.when.above != null || e.when.below != null),
  );

  it("puts every cut inside the marker's bounds", () => {
    const bad: string[] = [];
    for (const { h, e } of bounded) {
      const [low, high] = BOUNDS[e.input.metric!]!;
      for (const cut of [e.when.above, e.when.below])
        if (cut != null && (cut < low || cut > high))
          bad.push(
            `${rid(h, e)} cuts ${e.input.metric} at ${cut}, bounds ${low}–${high}`,
          );
    }
    expect(bad).toEqual([]);
  });

  it("scans the markers that have bounds", () => {
    expect(bounded.length).toBeGreaterThan(0);
  });
});

/* ── 5. sexed cuts are declared as such ───────────────────────────────── */

/** Markers whose normal range is a different number in men and in women. */
const SEXED_MARKERS = [
  "ferritin",
  "uric_acid",
  "hematocrit",
  "hemoglobin",
  "testosterone",
  "testosterone_total",
];

/**
 * Raw cuts on a sexed marker that are deliberately the same for everybody.
 * Each entry names the guideline that makes it sex-independent. Nothing goes
 * on this list without a reason a reader can check.
 */
const SEX_INDEPENDENT: Record<string, string> = {
  "iron_deficiency/iron_ferritin_15":
    "WHO 2020 ferritin guideline: depleted stores are 15 µg/L in every adult.",
  "iron_deficiency/iron_ferritin_30":
    "Guyatt 1992 J Gen Intern Med pooled men and women against marrow iron; 30 is one cut for both.",
  "iron_deficiency/iron_ferritin_45_100":
    "Guyatt 1992: the 45–100 band is the same pooled series.",
  "iron_deficiency/iron_ferritin_100":
    "Guyatt 1992: over 100 rules out absent stores in both sexes.",
  "anaemia_other/anaemia_ferritin_normal":
    "A ferritin over 50 says this anaemia is not iron deficiency, which is the same statement in both sexes (BSG 2021 puts the floor at 45–50 with no sex split).",
  "chronic_inflammation/inflam_ferritin":
    "Ferritin here is an acute-phase reactant read next to CRP and ESR, not an iron-overload cut; no sex-specific number is published for that use.",
  "gout_hyperuricaemia/gout_urate_very_high":
    "9 mg/dL is past the solubility limit in both sexes; the sexed cut is the 7/6 arm, which is split.",
};

describe("a cut on a sexed marker says which sex it is for", () => {
  const raw = rules.filter(
    ({ h, e }) =>
      e.input.metric &&
      SEXED_MARKERS.includes(e.input.metric) &&
      (e.when.above != null || e.when.below != null) &&
      // A condition that only applies to one sex has already said so.
      !h.appliesTo?.sex,
  );

  it("carries `when.sex` or a named guideline", () => {
    const bad = raw
      .filter(({ h, e }) => !e.when.sex && !SEX_INDEPENDENT[rid(h, e)])
      .map(({ h, e }) => `${rid(h, e)} on ${e.input.metric}`);
    expect(bad).toEqual([]);
  });

  it("keeps the allowlist honest: every entry exists and gives a reason", () => {
    const ids = new Set(rules.map(({ h, e }) => rid(h, e)));
    for (const [id, why] of Object.entries(SEX_INDEPENDENT)) {
      expect(ids.has(id), `${id} is not a rule any more`).toBe(true);
      expect(why.length).toBeGreaterThan(40);
    }
  });

  it("scans the sexed markers", () => {
    expect(raw.length).toBeGreaterThan(5);
  });
});

/* ── 6. a test is offered to the people it is for ─────────────────────── */

/** Tests only one sex can have, by name or by the marker they write. */
const SEX_SPECIFIC =
  /mammog|psa |prostate|cervical|ovarian|uterus|uterine|testicul|fsh|estradiol|testosterone/i;

/** Tests that only mean anything given an answer, not given an age. */
const FACT_DEPENDENT = /low-dose ct|ldct/i;

describe("discriminators are gated the way the condition is not", () => {
  const sexed = tests.filter(
    ({ d }) =>
      SEX_SPECIFIC.test(d.test) || d.codes.some((c) => SEX_SPECIFIC.test(c)),
  );

  it("gates every sex-specific test, on the test or on its condition", () => {
    const bad = sexed
      .filter(({ h, d }) => !d.appliesTo?.sex && !h.appliesTo?.sex)
      .map(({ h, d }) => `${tid(h, d)} (${d.codes.join(", ")})`);
    expect(bad).toEqual([]);
  });

  it("gives every screening test an age", () => {
    const bad = CATALOG.filter((h) => h.id === "cancer_screening_due")
      .flatMap((h) => h.discriminators.map((d) => ({ h, d })))
      .filter(
        ({ h, d }) => (d.appliesTo?.minAge ?? h.appliesTo?.minAge) == null,
      )
      .map(({ h, d }) => tid(h, d));
    expect(bad).toEqual([]);
  });

  it("makes a fact-dependent test say which answer it needs", () => {
    const dependent = tests.filter(({ d }) => FACT_DEPENDENT.test(d.test));
    expect(dependent.length).toBeGreaterThan(0);
    const bad = dependent
      .filter(({ d }) => !d.requiresFact)
      .map(({ h, d }) => tid(h, d));
    expect(bad).toEqual([]);
  });

  it("names a fact that exists in every `requiresFact`", () => {
    const bad = tests
      .filter(({ d }) => d.requiresFact && !answerable(d.requiresFact.fact))
      .map(({ h, d }) => `${tid(h, d)} needs ${d.requiresFact!.fact}`);
    expect(bad).toEqual([]);
  });

  it("scans the sex-specific tests", () => {
    expect(sexed.length).toBeGreaterThan(4);
  });
});

/* ── 7. the graph reads answerable things ─────────────────────────────── */

describe("graph hygiene", () => {
  const conditioned = EDGES.filter((e) => e.when);

  it("has every conditional edge reading a fact somebody can answer", () => {
    const bad: string[] = [];
    for (const e of conditioned) {
      const keys = [
        e.when!.fact?.key,
        ...(e.when!.facts ?? []).map((f) => f.key),
        e.when!.hoursBefore?.eventFact,
      ].filter((k): k is string => !!k);
      for (const k of keys) if (!answerable(k)) bad.push(`${e.id} reads ${k}`);
    }
    expect(bad).toEqual([]);
  });

  it("has every node code pointing at a metric or a fact", () => {
    const metricNodes = new Set(
      NODES.filter((n) => n.id.startsWith("metric:")).map((n) =>
        n.id.slice("metric:".length),
      ),
    );
    const known = new Set([
      ...metricNodes,
      ...Object.keys(DEFAULT_REF_HIGH),
      ...Object.keys(BOUNDS),
      ...VECTORS.flatMap((v) => v.codes ?? []),
      ...CATALOG.flatMap((h) => h.discriminators.flatMap((d) => d.codes)),
      ...GENOME_CATALOG.map((r) => r.factKey),
    ]);
    const bad = NODES.flatMap((n) =>
      (n.codes ?? [])
        .filter((c) => !known.has(c) && !answerable(c))
        .map((c) => `${n.id} :: ${c}`),
    );
    expect(bad).toEqual([]);
  });

  it("scans the whole graph", () => {
    expect(NODES.length).toBeGreaterThan(100);
    expect(conditioned.length).toBeGreaterThan(5);
  });
});

/* ── 8. a condition gated to one sex is never scored for the other ────── */

describe("condition gates are respected end to end", () => {
  const person = (sex: "male" | "female", age: number): ModelInput => ({
    today: "2026-09-01",
    profile: { sex, country: "RO" },
    sex,
    age,
    latest: {},
    derived: {},
  });

  for (const [sex, other] of [
    ["male", "female"],
    ["female", "male"],
  ] as const) {
    it(`never scores a ${other}-only condition for a ${sex} 45-year-old`, () => {
      const scored = new Set(
        scoreHypotheses(person(sex, 45), { catalog: CATALOG }).map((r) => r.id),
      );
      const wrong = CATALOG.filter(
        (h) => h.appliesTo?.sex === other && scored.has(h.id),
      ).map((h) => h.id);
      expect(wrong).toEqual([]);
      expect(scored.size).toBeGreaterThan(20);
    });

    it(`never offers a ${other}-only test to a ${sex} 45-year-old`, () => {
      const m = person(sex, 45);
      const offered = scoreHypotheses(m, { catalog: CATALOG }).flatMap((r) =>
        r.tests.map((d) => d.test),
      );
      const wrong = tests
        .filter(({ d }) => d.appliesTo?.sex === other)
        .filter(({ d }) => offered.includes(d.test))
        .map(({ h, d }) => tid(h, d));
      expect(wrong).toEqual([]);
    });
  }

  it("only offers the tests `discriminatorApplies` allows", () => {
    const m = person("male", 41);
    const offered = new Set(
      scoreHypotheses(m, { catalog: CATALOG }).flatMap((r) =>
        r.tests.map((d) => d.test),
      ),
    );
    for (const { d } of tests)
      if (!discriminatorApplies(d, m)) expect(offered.has(d.test)).toBe(false);
    expect(offered.size).toBeGreaterThan(10);
  });
});
