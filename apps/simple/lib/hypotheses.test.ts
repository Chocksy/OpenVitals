import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import { CONFOUNDERS, HYPOTHESES, priorFor, scoreHypotheses } from "./hypotheses";
import { personaToInput } from "@/evals/persona";
import { CATALOG } from "./hkb-catalog";
import { NODES } from "./graph";
import { VECTORS } from "./vectors";

const value = (
  v: number | null,
  extra: Partial<LatestValue> = {},
): LatestValue => ({
  value: v,
  unit: null,
  date: "2026-08-01",
  status: "green",
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
  ...extra,
});

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: "2026-08-27",
  profile: {},
  latest: {},
  derived: {},
  ...over,
});

const score = (id: string, m: ModelInput, opts = {}) =>
  scoreHypotheses(m, opts).find((h) => h.id === id);

/* ── one matching and one non-matching input per hypothesis ───────────── */

describe("insulin_resistance", () => {
  const matching = input({
    sex: "male",
    age: 45,
    profile: { waist_cm: "104", height_cm: "180" },
    latest: {
      insulin: value(19),
      hba1c: value(5.8),
      glucose: value(104),
      alt: value(41),
    },
    derived: { homaIr: 4.9, tgHdl: 3.1 },
  });
  const clean = input({
    sex: "male",
    age: 28,
    profile: { waist_cm: "80", height_cm: "182" },
    latest: { insulin: value(4.1), hba1c: value(5.0), glucose: value(84), alt: value(22) },
    derived: { homaIr: 0.85, tgHdl: 1.1 },
  });

  it("is likely or confirmed on a matching person", () => {
    const r = score("insulin_resistance", matching)!;
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.for.length).toBeGreaterThanOrEqual(6);
  });

  it("is unlikely on a clean person", () => {
    const r = score("insulin_resistance", clean)!;
    expect(r.score).toBeLessThan(0.25);
    expect(r.against.map((a) => a.rule)).toContain("ir_hba1c_low");
  });

  it("doubles the prior on a family history of diabetes", () => {
    const withFamily = score(
      "insulin_resistance",
      input({ profile: { family_history: ["type 2 diabetes, father 58"] } }),
    )!;
    const without = score("insulin_resistance", input())!;
    expect(withFamily.prior).toBeCloseTo(without.prior * 2, 5);
  });
});

describe("hashimoto", () => {
  const matching = input({
    sex: "female",
    age: 36,
    latest: {
      tpo_antibodies: value(320, { refHigh: 34 }),
      tsh: value(4.9),
    },
  });
  const clean = input({
    sex: "male",
    age: 40,
    latest: {
      tpo_antibodies: value(8, { refHigh: 34 }),
      anti_thyroglobulin: value(10, { refHigh: 115 }),
      tsh: value(1.4),
    },
  });

  it("confirms an antibody-positive woman with a high TSH", () => {
    const r = score("hashimoto", matching)!;
    expect(r.state).toBe("confirmed");
    expect(r.score).toBeGreaterThan(0.9);
  });

  it("rules it out when both antibodies are negative", () => {
    const r = score("hashimoto", clean)!;
    expect(r.score).toBeLessThan(0.05);
    expect(r.state).toBe("ruled_out");
  });
});

describe("iron_deficiency", () => {
  const matching = input({
    sex: "female",
    age: 30,
    latest: {
      ferritin: value(9),
      transferrin_saturation: value(11),
      mcv: value(78),
      rdw: value(15.6),
    },
  });
  const clean = input({
    sex: "male",
    age: 28,
    latest: {
      ferritin: value(120),
      transferrin_saturation: value(32),
      mcv: value(89),
      rdw: value(12.4),
    },
  });

  it("is close to certain with an empty store and small red cells", () => {
    // 0.929, not the 0.97 of phase 16: ferritin, transferrin saturation, MCV
    // and RDW are one iron panel, so the correlation guard counts the
    // strongest of the four in full and the rest at `lr ** CORR_DAMP`.
    const r = score("iron_deficiency", matching)!;
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.correlated.map((c) => c.group)).toEqual([
      "iron_panel",
      "iron_panel",
      "iron_panel",
    ]);
  });

  it("counts one ferritin factor, not both thresholds", () => {
    const r = score(
      "iron_deficiency",
      input({ latest: { ferritin: value(8) } }),
    )!;
    const ferritinRows = r.for.filter((f) => f.input === "ferritin");
    expect(ferritinRows).toHaveLength(1);
    expect(ferritinRows[0]!.lr).toBe(50);
    expect(r.superseded.map((x) => [x.rule, x.by])).toEqual([
      ["iron_ferritin_30", "iron_ferritin_15"],
    ]);
    // prior 0.12 -> odds 0.13636 x 50 = 6.818 -> 0.872, one factor of 50.
    expect(r.score).toBeCloseTo(0.872, 3);
  });

  it("uses the under-30 rule on its own above 15", () => {
    const r = score(
      "iron_deficiency",
      input({ latest: { ferritin: value(22) } }),
    )!;
    expect(r.for.filter((f) => f.input === "ferritin")).toHaveLength(1);
    expect(r.for[0]!.lr).toBe(20);
    expect(r.superseded).toEqual([]);
  });

  it("is ruled out by full stores: a ferritin over 100 is the other side of the test", () => {
    const r = score("iron_deficiency", clean)!;
    expect(r.state).toBe("ruled_out");
    expect(r.score).toBeLessThan(r.prior);
    expect(r.against.map((a) => a.rule)).toContain("iron_ferritin_100");
  });

  it("is discounted when CRP tags the ferritin draw", () => {
    const plain = score("iron_deficiency", matching)!;
    const inflamed = score("iron_deficiency", {
      ...matching,
      latest: { ...matching.latest, hs_crp: value(18, { refHigh: 5 }) },
    })!;
    expect(inflamed.score).toBeLessThan(plain.score);
    expect(inflamed.confounded.map((c) => c.tag)).toContain("acute_illness");
  });

  it("is discounted by a hand-applied confounder tag too", () => {
    const plain = score("iron_deficiency", matching)!;
    const tagged = score("iron_deficiency", matching, {
      confounderTags: { ferritin: ["post_viral"] },
    })!;
    expect(tagged.score).toBeLessThan(plain.score);
  });
});

describe("iron_deficiency_cause_gi", () => {
  const iron = input({
    sex: "male",
    age: 52,
    latest: { ferritin: value(11), transferrin_saturation: value(9) },
  });

  it("is not scored at all until iron deficiency is possible", () => {
    const none = scoreHypotheses(input({ sex: "male", age: 52 }));
    expect(none.map((h) => h.id)).not.toContain("iron_deficiency_cause_gi");
  });

  it("appears once iron deficiency is possible, and rises on coeliac serology", () => {
    const before = score("iron_deficiency_cause_gi", iron)!;
    const after = score("iron_deficiency_cause_gi", {
      ...iron,
      latest: { ...iron.latest, ttg_iga: value(40) },
    })!;
    expect(after.score).toBeGreaterThan(before.score);
  });
});

describe("pcos", () => {
  it("is not scored for a man", () => {
    const rows = scoreHypotheses(input({ sex: "male", age: 30 }));
    expect(rows.map((h) => h.id)).not.toContain("pcos");
  });

  it("rises on irregular cycles with high androgens", () => {
    const r = score(
      "pcos",
      input({
        sex: "female",
        age: 28,
        profile: { cycle_regularity: "irregular", hirsutism_acne: "yes" },
        latest: { testosterone: value(95, { optimalLow: 15, optimalHigh: 70 }) },
      }),
    )!;
    expect(r.score).toBeGreaterThan(0.6);
  });

  it("stays unlikely with regular cycles and normal androgens", () => {
    const r = score(
      "pcos",
      input({
        sex: "female",
        age: 28,
        profile: { cycle_regularity: "regular", hirsutism_acne: "no" },
        latest: { testosterone: value(30, { optimalLow: 15, optimalHigh: 70 }) },
      }),
    )!;
    expect(r.score).toBeLessThan(0.25);
  });
});

describe("sleep_apnoea", () => {
  it("is likely for a snoring, heavy, hypertensive man", () => {
    const r = score(
      "sleep_apnoea",
      input({
        sex: "male",
        age: 50,
        profile: { sleep_snoring: "Most nights", bp_home: "146/92" },
        latest: { bmi: value(33) },
      }),
    )!;
    expect(r.score).toBeGreaterThan(0.85);
    expect(r.state).toBe("likely");
  });

  it("stays low for a lean woman who does not snore", () => {
    const r = score(
      "sleep_apnoea",
      input({
        sex: "female",
        age: 34,
        profile: { sleep_snoring: "No", bp_home: "112/70" },
        latest: { bmi: value(21) },
      }),
    )!;
    expect(r.score).toBeLessThan(0.25);
  });
});

describe("nafld", () => {
  it("rises on a raised ALT and a high FIB-4", () => {
    const r = score(
      "nafld",
      input({
        sex: "male",
        age: 45,
        profile: { waist_cm: "104", height_cm: "180" },
        latest: {
          alt: value(52, { optimalHigh: 30 }),
          triglycerides: value(190),
        },
        derived: { fib4: 1.8 },
      }),
    )!;
    // 0.888, not 0.93: ALT and FIB-4 are both the liver enzymes group, so
    // FIB-4 counts at `3 ** 0.3` on top of the ALT rather than in full.
    expect(r.score).toBeGreaterThan(0.85);
    expect(r.correlated[0]?.group).toBe("liver_enzymes");
  });

  it("argues itself down on a normal ALT and a lean waist", () => {
    const r = score(
      "nafld",
      input({
        sex: "male",
        age: 28,
        profile: { waist_cm: "80", height_cm: "182" },
        latest: {
          alt: value(22, { optimalHigh: 30 }),
          triglycerides: value(70),
        },
        derived: { fib4: 0.7 },
      }),
    )!;
    expect(r.score).toBeLessThan(0.25);
    expect(r.for).toEqual([]);
    expect(r.against.map((a) => a.rule)).toEqual(
      expect.arrayContaining(["nafld_alt", "nafld_waist_normal"]),
    );
  });
});

describe("b12_deficiency", () => {
  it("is likely on a low B12 with a high MMA in a vegan", () => {
    const r = score(
      "b12_deficiency",
      input({
        profile: { diet: "vegan" },
        latest: { vitamin_b12: value(160), methylmalonic_acid: value(0.9) },
      }),
    )!;
    expect(r.score).toBeGreaterThan(0.9);
  });

  it("is ruled out on a healthy B12", () => {
    const r = score(
      "b12_deficiency",
      input({ latest: { vitamin_b12: value(520), mcv: value(89) } }),
    )!;
    expect(r.score).toBeLessThan(0.25);
  });
});

/* ── the engine's own rules ───────────────────────────────────────────── */

describe("scoreHypotheses", () => {
  it("leaves every hypothesis at its prior with nothing measured", () => {
    for (const h of scoreHypotheses(input({ sex: "female", age: 34 }))) {
      expect(h.score).toBeCloseTo(h.prior, 3);
      expect(h.for).toEqual([]);
      expect(h.against).toEqual([]);
      expect(h.missing.length).toBeGreaterThan(0);
    }
  });

  it("puts the cheap blood test ahead of the imaging when both move it", () => {
    const r = score(
      "insulin_resistance",
      input({ sex: "male", age: 45, derived: { tgHdl: 3.1 } }),
    )!;
    const insulin = r.nextTests.find((t) => t.test === "Fasting insulin")!;
    const cgm = r.nextTests.find((t) => t.test === "CGM, 14 days")!;
    expect(insulin.ratio).toBeGreaterThan(cgm.ratio);
    expect(r.nextTests[0]!.ratio).toBeGreaterThanOrEqual(
      r.nextTests[r.nextTests.length - 1]!.ratio,
    );
  });

  it("drops a discriminator whose marker is already measured", () => {
    const r = score(
      "insulin_resistance",
      input({ sex: "male", age: 45, latest: { insulin: value(19) } }),
    )!;
    expect(r.nextTests.map((t) => t.test)).not.toContain("Fasting insulin");
  });

  it("ranks by score times lens weight, and the lens changes the order", () => {
    const m = input({
      sex: "female",
      age: 36,
      profile: { waist_cm: "104", height_cm: "168" },
      latest: {
        tpo_antibodies: value(320, { refHigh: 34 }),
        tsh: value(4.9),
        insulin: value(19),
        hba1c: value(5.8),
      },
    });
    const lifespan = scoreHypotheses(m, { lens: "lifespan" }).map((h) => h.id);
    const mood = scoreHypotheses(m, { lens: "mood" }).map((h) => h.id);
    expect(lifespan[0]).toBe("insulin_resistance");
    expect(mood[0]).toBe("hashimoto");
  });
});

/* ── integrity ────────────────────────────────────────────────────────── */

/** `DERIVED` in lib/data.ts: computed at read time, never stored. */
const DERIVED_CODES = ["homa_ir", "non_hdl_cholesterol"];

/** The same allowlist `graph.test.ts` keeps, plus the codes only a
 *  discriminator ever writes: tests the catalog has no column for yet. */
const EXTRA_CODES = [
  "total_cholesterol",
  "free_t4",
  "free_t3",
  "anti_thyroglobulin",
  "cortisol",
  "sleep_duration",
  "bp_systolic",
  "bp_diastolic",
  "bmi",
  "hematocrit",
  "shbg",
  "amh",
  "free_testosterone",
  "methylmalonic_acid",
  "ttg_iga",
  "h_pylori_stool_antigen",
  "lh",
  "fsh",
  // tests with no catalog column: the simulation writes them, nothing reads
  // them off a lab sheet yet.
  "ogtt_insulin_120",
  "cgm_mean_glucose",
  "thyroid_ultrasound",
  "reticulocyte_hemoglobin",
  "parietal_cell_antibodies",
  "gastrin",
  "fobt",
  "gastroscopy",
  "ovarian_ultrasound",
  "stop_bang",
  "home_sleep_study",
  "liver_ultrasound",
  "fibroscan_kpa",
  "holotranscobalamin",
];

const nodeCodes = new Set(NODES.flatMap((n) => n.codes ?? []));
const known = new Set([
  ...VECTORS.flatMap((v) => v.codes ?? []),
  ...nodeCodes,
  ...DERIVED_CODES,
  ...EXTRA_CODES,
]);

describe("HYPOTHESES", () => {
  it("only reads metric codes the app knows about", () => {
    const unknown = HYPOTHESES.flatMap((h) => [
      ...h.evidence.map((e) => e.input.metric),
      ...h.discriminators.flatMap((d) => d.codes),
    ]).filter((c): c is string => !!c && !known.has(c));
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("gives every evidence rule a source and a grade", () => {
    const thin = HYPOTHESES.flatMap((h) =>
      h.evidence.filter((e) => !e.source.trim() || !e.grade).map((e) => e.id),
    );
    expect(thin).toEqual([]);
  });

  it("gives every prior modifier a reason", () => {
    const thin = HYPOTHESES.flatMap((h) =>
      h.priors.modifiers.filter((m) => !m.why.trim()).map(() => h.id),
    );
    expect(thin).toEqual([]);
  });

  it("gives every hypothesis at least one lens, a summary and management", () => {
    for (const h of HYPOTHESES) {
      expect(Object.keys(h.lenses).length).toBeGreaterThan(0);
      expect(h.summary.trim()).not.toBe("");
      expect(h.management.trim()).not.toBe("");
      expect(h.discriminators.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate hypothesis or rule ids", () => {
    const ids = HYPOTHESES.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of HYPOTHESES) {
      const rules = h.evidence.map((e) => e.id);
      expect(new Set(rules).size).toBe(rules.length);
    }
  });

  it("only names confounder markers a confounder covers", () => {
    const markers = new Set(CONFOUNDERS.flatMap((c) => c.markers));
    const orphan = HYPOTHESES.flatMap((h) =>
      h.evidence.flatMap((e) =>
        (e.confoundedBy ?? []).filter((c) => !markers.has(c)),
      ),
    );
    expect([...new Set(orphan)]).toEqual([]);
  });

  it("points every patternId at a real pattern", async () => {
    const { PATTERNS } = await import("./patterns");
    const ids = new Set(PATTERNS.map((p) => p.id));
    const dangling = HYPOTHESES.map((h) => h.patternId).filter(
      (id): id is string => !!id && !ids.has(id),
    );
    expect(dangling).toEqual([]);
  });
});

describe("VECTORS", () => {
  it("grades and lenses every vector", () => {
    for (const v of VECTORS) {
      expect(["A", "B", "C", "D"]).toContain(v.grade);
      expect(v.lenses.length).toBeGreaterThan(0);
    }
  });
});

describe("discriminators with no evidence rule behind them", () => {
  it("still move the score when the result comes back", () => {
    const base = input({ sex: "male", age: 50, profile: { sleep_snoring: "Most nights" } });
    const before = score("sleep_apnoea", base)!;
    const after = score("sleep_apnoea", {
      ...base,
      latest: { stop_bang: value(5) },
    })!;
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.for.map((f) => f.rule)).toContain(
      "discriminator:STOP-Bang questionnaire",
    );
  });

  it("argues down when the result comes back negative", () => {
    const base = input({ sex: "male", age: 50, profile: { sleep_snoring: "Most nights" } });
    const before = score("sleep_apnoea", base)!;
    const after = score("sleep_apnoea", {
      ...base,
      latest: { home_sleep_study: value(3) },
    })!;
    expect(after.score).toBeLessThan(before.score);
  });

  it("never double-counts a marker an evidence rule already reads", () => {
    const r = score("iron_deficiency", input({ latest: { ferritin: value(9) } }))!;
    expect(r.for.map((f) => f.rule)).not.toContain("discriminator:Ferritin");
    // ferritin has both an evidence rule and a discriminator: exactly one
    // factor of 50 reaches the odds.
    expect(
      [...r.for, ...r.against].filter((x) => x.input === "ferritin"),
    ).toHaveLength(1);
    expect(r.score).toBeCloseTo(0.872, 3);
  });
});

describe("priorFor", () => {
  const bands = [
    { country: "RO", sex: "male" as const, ageMin: 50, ageMax: 54, prevalence: 0.61, source: "RO male 50-54" },
    { country: "RO", sex: "male" as const, ageMin: null, ageMax: null, prevalence: 0.45, source: "RO male" },
    { country: null, sex: "male" as const, ageMin: 50, ageMax: 54, prevalence: 0.34, source: "male 50-54" },
    { country: null, sex: "female" as const, ageMin: 50, ageMax: 54, prevalence: 0.28, source: "female 50-54" },
  ];
  const h = {
    ...HYPOTHESES[0]!,
    priors: { base: 0.2, source: "base", bands, modifiers: [] },
  };
  const who = (profile: Record<string, unknown>, sex?: "male" | "female", age?: number) =>
    priorFor(h, input({ profile, sex, age }));

  it("takes country, sex and age band when all three fit", () => {
    expect(who({ country: "RO" }, "male", 52).source).toBe("RO male 50-54");
  });

  it("falls back to country and sex when the age band does not fit", () => {
    expect(who({ country: "RO" }, "male", 40).source).toBe("RO male");
  });

  it("falls back to sex and age band when the country is not covered", () => {
    expect(who({ country: "GB" }, "male", 52).source).toBe("male 50-54");
  });

  it("falls back to the catalog base when nothing fits", () => {
    expect(who({}, "male", 20)).toEqual({ prevalence: 0.2, source: "base" });
  });

  it("never reads a row that contradicts the person", () => {
    expect(who({ country: "RO" }, "female", 52).source).toBe("female 50-54");
  });

  it("reads the country fact as an alpha-2 code and ignores anything else", () => {
    expect(who({ country: "Romania" }, "male", 52).source).toBe("male 50-54");
    expect(who({ country: "ro" }, "male", 52).source).toBe("RO male 50-54");
  });

  it("scores the prior it picked, not the base", () => {
    const rows = scoreHypotheses(input({ profile: { country: "RO" }, sex: "male", age: 52 }), {
      catalog: [h],
    });
    expect(rows[0]!.prior).toBe(0.61);
    expect(rows[0]!.priorSource).toBe("RO male 50-54");
  });
});

describe("a marker with no range at all", () => {
  it("reads a positive tTG as positive, not as a negative", () => {
    // The lab printed no range (a simulated draw, a typical value from a
    // paper). `statusOf` used to call that "gray" and the status rules read it
    // as "not red", so a tTG of 68 argued *against* coeliac disease at LR
    // 0.03. Now the default cut-off makes it red and the seed rule fires.
    const m = personaToInput({
      today: "2026-08-31",
      facts: { sex: "male", birth_year: 1981 },
      readings: [{ code: "ttg_iga", value: 68, date: "2026-08-31" }],
    });
    expect(m.latest.ttg_iga!.status).toBe("red");
    const r = scoreHypotheses(m, { catalog: CATALOG }).find(
      (h) => h.id === "coeliac_disease",
    )!;
    expect(r.for.map((f) => f.lr)).toContain(30);
    expect(r.score).toBeGreaterThan(r.prior);
  });
});
