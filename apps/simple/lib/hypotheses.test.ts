import { describe, it, expect } from "vitest";
import type { LatestValue, ModelInput } from "./coverage";
import {
  CONFOUNDERS,
  effectiveLr,
  EVER_SHRINK,
  HYPOTHESES,
  noResponse,
  treatedWith,
  PRIOR_CEILING,
  priorFor,
  scoreHypotheses,
} from "./hypotheses";
import { personaToInput } from "@/evals/persona";
import { historyOf } from "./derived";
import { CATALOG } from "./hkb-catalog";
import { NODES } from "./graph";
import { nextMoves } from "./infogain";
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
    latest: {
      insulin: value(4.1),
      hba1c: value(5.0),
      glucose: value(84),
      alt: value(22),
    },
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

  it("raises the prior on a family history of diabetes, up to the ceiling", () => {
    const withFamily = score(
      "insulin_resistance",
      input({ profile: { family_history: ["type 2 diabetes, father 58"] } }),
    )!;
    const without = score("insulin_resistance", input())!;
    expect(withFamily.prior).toBeGreaterThan(without.prior);
    // Phase 19: a base rate of 0.3 doubled is 0.6, and a prior of 0.6 makes a
    // condition unfalsifiable by measurement. Half is the ceiling.
    expect(withFamily.prior).toBe(PRIOR_CEILING);
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
        profile: { sym_cycle: "Irregular", hirsutism_acne: "Yes" },
        latest: {
          testosterone: value(95, { optimalLow: 15, optimalHigh: 70 }),
        },
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
        profile: { sym_cycle: "Regular", hirsutism_acne: "No" },
        latest: {
          testosterone: value(30, { optimalLow: 15, optimalHigh: 70 }),
        },
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
    const base = input({
      sex: "male",
      age: 50,
      profile: { sleep_snoring: "Most nights" },
    });
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
    const base = input({
      sex: "male",
      age: 50,
      profile: { sleep_snoring: "Most nights" },
    });
    const before = score("sleep_apnoea", base)!;
    const after = score("sleep_apnoea", {
      ...base,
      latest: { home_sleep_study: value(3) },
    })!;
    expect(after.score).toBeLessThan(before.score);
  });

  it("never double-counts a marker an evidence rule already reads", () => {
    const r = score(
      "iron_deficiency",
      input({ latest: { ferritin: value(9) } }),
    )!;
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
    {
      country: "RO",
      sex: "male" as const,
      ageMin: 50,
      ageMax: 54,
      prevalence: 0.61,
      source: "RO male 50-54",
    },
    {
      country: "RO",
      sex: "male" as const,
      ageMin: null,
      ageMax: null,
      prevalence: 0.45,
      source: "RO male",
    },
    {
      country: null,
      sex: "male" as const,
      ageMin: 50,
      ageMax: 54,
      prevalence: 0.34,
      source: "male 50-54",
    },
    {
      country: null,
      sex: "female" as const,
      ageMin: 50,
      ageMax: 54,
      prevalence: 0.28,
      source: "female 50-54",
    },
  ];
  const h = {
    ...HYPOTHESES[0]!,
    priors: { base: 0.2, source: "base", bands, modifiers: [] },
  };
  const who = (
    profile: Record<string, unknown>,
    sex?: "male" | "female",
    age?: number,
  ) => priorFor(h, input({ profile, sex, age }));

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
    const rows = scoreHypotheses(
      input({ profile: { country: "RO" }, sex: "male", age: 52 }),
      {
        catalog: [h],
      },
    );
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

/* ── sexed cuts, the no-op AUDIT rule, PCOS from the interview (phase 21) ── */

describe("a cut written for men is not applied to a woman", () => {
  const iron = (sex: "male" | "female") =>
    personaToInput({
      today: "2026-08-31",
      facts: { sex, birth_year: 1979 },
      readings: [
        { code: "ferritin", value: 250, unit: "ng/mL", date: "2026-08-31" },
        {
          code: "transferrin_saturation",
          value: 48,
          unit: "%",
          date: "2026-08-31",
        },
      ],
    });
  const score = (m: ModelInput, id: string) =>
    scoreHypotheses(m, { catalog: CATALOG }).find((h) => h.id === id)!;

  it("reads a ferritin of 250 as iron overload in a woman and not in a man", () => {
    // EASL 2022: 300 µg/L in men, 200 in women, with a raised saturation.
    const woman = score(iron("female"), "haemochromatosis");
    const man = score(iron("male"), "haemochromatosis");
    expect(woman.for.map((f) => f.rule)).toContain("hfe_ferritin_high_female");
    expect(man.for.map((f) => f.rule)).not.toContain("hfe_ferritin_high");
    expect(woman.score).toBeGreaterThan(man.score);
  });

  const urate = (sex: "male" | "female") =>
    personaToInput({
      today: "2026-08-31",
      facts: { sex, birth_year: 1979 },
      readings: [
        { code: "uric_acid", value: 6.5, unit: "mg/dL", date: "2026-08-31" },
      ],
    });

  it("calls a urate of 6.5 hyperuricaemia in a woman and not in a man", () => {
    // Bardin 2014 Curr Opin Rheumatol: 7 mg/dL in men, 6 in women.
    expect(
      score(urate("female"), "gout_hyperuricaemia").for.map((f) => f.rule),
    ).toContain("gout_urate_high_female");
    expect(
      score(urate("male"), "gout_hyperuricaemia").for.map((f) => f.rule),
    ).not.toContain("gout_urate_high");
  });
});

describe("alcohol_use_disorder", () => {
  it("takes a Never on AUDIT-C item 1 as evidence against", () => {
    const m = personaToInput({
      today: "2026-08-31",
      facts: { sex: "male", birth_year: 1979, sym_alcohol: "Never" },
      readings: [],
    });
    const r = scoreHypotheses(m, { catalog: CATALOG }).find(
      (h) => h.id === "alcohol_use_disorder",
    )!;
    expect(r.against.map((a) => a.rule)).toContain("aud_audit_c_never");
    expect(r.score).toBeLessThan(r.prior);
  });
});

describe("pcos from the interview alone", () => {
  const f28 = (profile: Record<string, unknown>) =>
    personaToInput({
      today: "2026-08-31",
      facts: { sex: "female", birth_year: 1998, ...profile },
      readings: [],
    });

  it("moves into the live band on the two Rotterdam answers", () => {
    const before = scoreHypotheses(f28({}), { catalog: CATALOG }).find(
      (h) => h.id === "pcos",
    )!;
    const after = scoreHypotheses(
      f28({ sym_cycle: "Irregular", hirsutism_acne: "Yes" }),
      { catalog: CATALOG },
    ).find((h) => h.id === "pcos")!;
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.score).toBeGreaterThan(0.25);
    expect(after.for.map((f) => f.rule)).toContain("pcos_hirsutism");
  });

  it("offers the androgen panel next", () => {
    const m = f28({ sym_cycle: "Irregular", hirsutism_acne: "Yes" });
    expect(nextMoves(m, CATALOG).map((mv) => mv.label)).toContain(
      "Total and free testosterone",
    );
  });
});

/* ── phase 41B: ever, treatments, one modifier per why ─────────────────── */

describe("phase 41B", () => {
  type H = (typeof HYPOTHESES)[number];

  const withHistory = (
    draws: { date: string; value: number; refLow?: number; refHigh?: number }[],
    today = "2026-08-27",
  ): LatestValue => {
    const pts = draws.map((d) => ({
      date: d.date,
      value: d.value,
      refLow: d.refLow ?? null,
      refHigh: d.refHigh ?? null,
    }));
    const last = pts[pts.length - 1]!;
    return value(last.value, {
      date: last.date,
      refLow: last.refLow,
      refHigh: last.refHigh,
      history: historyOf(pts, today),
    });
  };

  const tiny = (over: Partial<H>): H => ({
    id: "t",
    name: "T",
    summary: "",
    priors: { base: 0.1, modifiers: [] },
    evidence: [],
    discriminators: [],
    lenses: {},
    management: "",
    ...over,
  });

  it("reads `ever` over the whole window, not the latest draw", () => {
    const rule = {
      id: "b12_ever_low",
      input: { metric: "vitamin_b12" },
      when: { ever: { below: 200, years: 5 } },
      lr: 4,
      grade: "B" as const,
      source: "test",
    };
    const catalog = [tiny({ evidence: [rule] })];
    const m = input({
      latest: {
        vitamin_b12: withHistory([
          { date: "2022-03-01", value: 172 },
          { date: "2026-08-01", value: 354 },
        ]),
      },
    });
    const r = score("t", m, { catalog })!;
    expect(r.for.map((e) => e.rule)).toEqual(["b12_ever_low"]);
    // outside the window: missing, not against
    const old = input({
      latest: {
        vitamin_b12: withHistory([
          { date: "2019-03-01", value: 172 },
          { date: "2026-08-01", value: 354 },
        ]),
      },
    });
    expect(score("t", old, { catalog })!.for).toEqual([]);
    // an ever rule shrinks like grade C unless its source is about the past
    expect(effectiveLr(4, rule)).toBeCloseTo(4 ** EVER_SHRINK, 5);
    expect(
      effectiveLr(4, { ...rule, when: { ever: { below: 200, aboutPast: true } } }),
    ).toBe(4);
  });

  it("fires `ever: aboveRef` against each draw's own printed range", () => {
    const catalog = [
      tiny({
        priors: {
          base: 0.02,
          modifiers: [
            {
              when: {
                metric: "anti_thyroglobulin",
                ever: { aboveRef: true, years: 5 },
              },
              times: 3,
              why: "thyroid autoimmunity",
            },
            {
              when: { hypothesis: "nope", above: 0.4 },
              times: 3,
              why: "thyroid autoimmunity",
            },
          ],
        },
      }),
    ];
    const m = input({
      latest: {
        anti_thyroglobulin: withHistory([
          { date: "2024-05-13", value: 65.35, refHigh: 3.99 },
          { date: "2026-08-20", value: 137, refHigh: 4.5 },
        ]),
      },
    });
    expect(score("t", m, { catalog })!.prior).toBeCloseTo(0.06, 5);
  });

  it("counts two modifiers with the same why once", () => {
    const mod = (metric: string) => ({
      when: { metric, above: 1 },
      times: 3,
      why: "same reason",
    });
    const catalog = [
      tiny({
        priors: { base: 0.02, modifiers: [mod("a_x"), mod("b_x")] },
      }),
    ];
    const m = input({ latest: { a_x: value(5), b_x: value(5) } });
    expect(score("t", m, { catalog })!.prior).toBeCloseTo(0.06, 5);
  });

  describe("no_response:ferritin", () => {
    const pre = [
      { date: "2023-06-01", value: 17, refLow: 13 },
      { date: "2024-03-01", value: 19.1, refLow: 13 },
    ];
    const iron = {
      what: "iron bisglycinate",
      route: "oral",
      started: "2024-09-01",
      from: "supplements" as const,
    };
    const at = (post: { date: string; value: number; refLow?: number }[]) =>
      input({
        today: "2025-06-01",
        latest: { ferritin: withHistory([...pre, ...post], "2025-06-01") },
        treatments: [{ ...iron, stopped: "2025-03-20" }],
      });

    it("fires when ferritin stays low after 200 days of iron", () => {
      const m = at([{ date: "2025-02-15", value: 9, refLow: 13 }]);
      expect(noResponse(m, "ferritin")).toBe("oral");
    });

    it("stays quiet when ferritin rose above pre × 1.2", () => {
      const m = at([{ date: "2025-02-15", value: 40, refLow: 13 }]);
      expect(noResponse(m, "ferritin")).toBe("none");
    });

    it("has no answer before day 90 or without a treatment", () => {
      expect(noResponse(at([{ date: "2024-10-15", value: 9 }]), "ferritin")).toBeNull();
      expect(noResponse(input(), "ferritin")).toBeNull();
    });

    it("reads as a fact a rule can match", () => {
      const catalog = [
        tiny({
          evidence: [
            {
              id: "t_nr",
              input: { fact: "no_response:ferritin" },
              when: { includes: "oral" },
              lr: 2,
              grade: "B",
              source: "test",
            },
          ],
        }),
      ];
      const m = at([{ date: "2025-02-15", value: 9, refLow: 13 }]);
      expect(score("t", m, { catalog })!.for.map((e) => e.rule)).toEqual(["t_nr"]);
    });

    it("treated: names the running route", () => {
      const m = input({
        today: "2026-09-20",
        treatments: [{ ...iron, route: "iv", started: "2026-09-10" }],
      });
      expect(treatedWith(m, "ferritin")).toBe("iv");
      expect(treatedWith(m, "vitamin_b12")).toBeNull();
    });
  });
});

/* ── phase 41F: a printed share scores as a mixture ───────────────────── */

describe("share mixture", () => {
  type H = (typeof HYPOTHESES)[number];
  const tiny = (over: Partial<H>): H => ({
    id: "t",
    name: "T",
    summary: "",
    priors: { base: 0.1, modifiers: [] },
    evidence: [],
    discriminators: [],
    lenses: {},
    management: "",
    ...over,
  });
  // X scores 0.8: even odds times an LR of 4
  const x = tiny({
    id: "x",
    priors: { base: 0.5, modifiers: [] },
    evidence: [
      {
        id: "x_m1",
        input: { metric: "m1" },
        when: { above: 1 },
        lr: 4,
        grade: "A",
        source: "test",
      },
    ],
  });
  const other = { when: { metric: "m2", above: 1 }, times: 2, why: "other" };
  const shareRule = (grade: "A" | "C", extra = {}) => ({
    when: { hypothesis: "x", above: 0.5 },
    times: 6,
    why: "hypothesis:x (C; case research, cause of x, doi:10.1/t)",
    share: 0.3,
    grade,
    source: "Test 2001; doi:10.1/t",
    ...extra,
  });
  const c = (mods: H["priors"]["modifiers"]) =>
    tiny({ id: "c", priors: { base: 0.02, modifiers: mods } });
  const m = input({ latest: { m1: value(5), m2: value(5) } });

  it("mixes P(C | X) and P(C | not X) by p(X), grade A unshrunk", () => {
    const r = score("c", m, { catalog: [x, c([shareRule("A"), other])] })!;
    // P(C|X): 0.3 in odds (0.4286) times the other modifier 2 = 0.857 → 0.4615
    // P(C|not X): 0.02 × 2 = 0.04; p(X) = 0.8
    expect(r.mixture!.pGiven).toBeCloseTo(0.4615, 2);
    expect(r.mixture!.pNot).toBeCloseTo(0.04, 5);
    expect(r.prior).toBeCloseTo(0.4615 * 0.8 + 0.04 * 0.2, 2);
    expect(r.mixture!.given).toBe("hypothesis:x");
  });

  it("pulls a grade C share halfway to the base rate in log odds", () => {
    const r = score("c", m, { catalog: [x, c([shareRule("C"), other])] })!;
    const logit = (p: number) => Math.log(p / (1 - p));
    const counted = 1 / (1 + Math.exp(-(logit(0.02) + logit(0.3)) / 2));
    expect(r.mixture!.counted).toBeCloseTo(counted, 2);
    const given = (2 * counted) / (1 - counted) / (1 + (2 * counted) / (1 - counted));
    expect(r.prior).toBeCloseTo(given * 0.8 + 0.04 * 0.2, 2);
  });

  it("leaves a condition without a share rule exactly as it was", () => {
    const r = score("c", m, { catalog: [x, c([other])] })!;
    expect(r.prior).toBeCloseTo(0.04, 6);
    expect(r.mixture).toBeUndefined();
  });

  it("does not apply a share to a person outside the study's population", () => {
    const rule = shareRule("A", {
      population: "patients without gastrointestinal symptoms",
      unless: [{ fact: "sym_bloating", includes: "yes" }],
    });
    const inside = score("c", m, { catalog: [x, c([rule, other])] })!;
    expect(inside.mixture!.population).toBe(
      "patients without gastrointestinal symptoms",
    );
    const outside = score(
      "c",
      { ...m, profile: { sym_bloating: "Yes" } },
      { catalog: [x, c([rule, other])] },
    )!;
    expect(outside.mixture).toBeUndefined();
    expect(outside.prior).toBeCloseTo(0.04, 6);
    expect(outside.mixtureSkipped![0]!.why).toMatch(/sym_bloating says Yes/);
    // "No" is no symptom: the share applies
    const no = score(
      "c",
      { ...m, profile: { sym_bloating: "No" } },
      { catalog: [x, c([rule, other])] },
    )!;
    expect(no.mixture).toBeDefined();
  });

  it("reads X at its probability, not through the 0.5 cut", () => {
    const low = input({ latest: { m2: value(5) } }); // X stays at its base 0.5
    const r = score("c", low, { catalog: [x, c([shareRule("A"), other])] })!;
    expect(r.prior).toBeCloseTo(0.4615 * 0.5 + 0.04 * 0.5, 2);
  });

  it("keeps the evidence on C after the mixture, and reports P(C | X, data)", () => {
    const cc = {
      ...c([shareRule("A"), other]),
      evidence: [
        {
          id: "c_m3",
          input: { metric: "m3" },
          when: { above: 1 },
          lr: 3,
          grade: "A" as const,
          source: "test",
        },
      ],
    };
    const r = score("c", { ...m, latest: { ...m.latest, m3: value(5) } }, {
      catalog: [x, cc],
    })!;
    const odds = (p: number) => p / (1 - p);
    expect(odds(r.score)).toBeCloseTo(odds(r.prior) * 3, 2);
    expect(odds(r.mixture!.posterior)).toBeCloseTo(odds(0.4615) * 3, 1);
  });
});

describe('"Not sure"', () => {
  it("reads as no answer, not as a No", () => {
    const base = { sex: "female" as const, age: 36 };
    const p = (sym_heavy_periods?: string) =>
      score(
        "heavy_menstrual_bleeding",
        input({ ...base, profile: sym_heavy_periods ? { sym_heavy_periods } : {} }),
        { catalog: CATALOG },
      )!.score;
    expect(p("Not sure")).toBe(p());
    expect(p("No")).toBeLessThan(p());
  });
});

describe("fading (44A)", () => {
  const TODAY = "2026-09-30";
  const inputWith = (profile: Record<string, unknown>, today: string) =>
    input({ today, profile });
  // One symptom only, so the symptom cap and the correlation damp stay out
  // of the way and the halving is exact.
  const base = () => inputWith({ sym_cold: "No" }, TODAY);
  const score = (m: ModelInput, id: string) =>
    scoreHypotheses(m, { catalog: CATALOG }).find((r) => r.id === id)!;
  const ID = "hypothyroidism"; // hypo_cold: lr 2, lrNeg 0.8

  it("changes nothing at 0 days or without a date", () => {
    const fresh = score({ ...base(), profileAt: { sym_cold: TODAY } }, ID);
    const none = score(base(), ID);
    expect(fresh.score).toBe(none.score);
    expect(none.against.find((e) => e.faded)).toBeUndefined();
  });
  it("pulls half the log-odds for a symptom No at 90 days", () => {
    const empty = score(inputWith({}, TODAY), ID).score;
    const fresh = score(base(), ID).score;
    const old = score({ ...base(), profileAt: { sym_cold: "2026-07-02" } }, ID);
    const lo = (p: number) => Math.log(p / (1 - p));
    expect(lo(old.score) - lo(empty)).toBeCloseTo(
      (lo(fresh) - lo(empty)) / 2,
      1,
    );
    expect(old.against.find((e) => e.faded)?.faded).toMatchObject({
      key: "sym_cold",
      days: 90,
      weight: 0.5,
    });
  });
  it("never fades a fixed fact", () => {
    const m = { ...base(), profileAt: { sex: "2010-01-01" } };
    expect(score(m, ID).score).toBe(score(base(), ID).score);
  });
});
