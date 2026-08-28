/**
 * Scored hypotheses: the engine that turns one `ModelInput` into "how likely
 * is each of these eight stories, why, and what would settle it".
 *
 * Bayes with likelihood ratios and nothing else. A prior per hypothesis, one
 * multiplier per piece of evidence that could be read, a discount when the
 * draw was confounded, and a probability out the other end. Everything the
 * page prints is on the result, so no component recomputes anything.
 *
 * Pure. No database, no LLM, no clock. Hand-reviewable against the LRs and
 * grades in docs/plans/2026-08-28-phase9-brain-hypotheses-spec.md section 2.
 */
import type { LatestValue, ModelInput } from "./coverage";
import { parseBp, type Sex } from "./vectors";

export type Lens = "lifespan" | "energy" | "mood" | "weight";
export type Grade = "A" | "B" | "C" | "D"; // D = anecdotal only
export type HState =
  | "ruled_out"
  | "unlikely"
  | "possible"
  | "likely"
  | "confirmed";

export interface EvidenceRule {
  id: string;
  /** what it reads: a metric code, a derived key, a profile fact, a life event
   *  tag, or another hypothesis' probability. */
  input: {
    metric?: string;
    derived?: keyof ModelInput["derived"];
    fact?: string;
    event?: string;
    /** the probability another hypothesis already scored, for chained stories */
    hypothesis?: string;
  };
  /** condition on the input value. Several keys AND together. */
  when: {
    above?: number;
    below?: number;
    equals?: string;
    /** substring; "a|b" matches either */
    includes?: string;
    status?: "red" | "amber";
    /** outside the sex-adjusted optimal band, so one rule covers both sexes */
    aboveOptimal?: boolean;
    belowOptimal?: boolean;
  };
  /** likelihood ratio when the condition holds; < 1 argues against. Absent input = no change. */
  lr: number;
  /** likelihood ratio when the input is present and the condition does NOT hold (e.g. a negative antibody argues against). Optional. */
  lrNeg?: number;
  grade: Grade;
  source: string;
  /** markers whose weight is discounted on a confounded draw (see confounders) */
  confoundedBy?: string[];
}

export interface Discriminator {
  test: string; // human name, "Fasting insulin", "Anti-TPO antibodies", "Parietal cell antibodies"
  codes: string[]; // metric codes that satisfy it
  cost: 1 | 2 | 3 | 4; // 1 cheap blood test, 2 special blood test, 3 imaging/functional, 4 invasive
  /** expected LR if positive and if negative, used for "expected movement" */
  lrPos: number;
  lrNeg: number;
  howTo?: string;
  /** the value the Simulate button writes for "typical positive"/"typical negative" */
  typicalPos?: number;
  typicalNeg?: number;
  unit?: string;
  /** a repeat of a test that is already done still counts as a next test */
  repeatable?: boolean;
  /** list price in euros by ISO-3166 alpha-2, from `hkb_tests.cost_by_country` */
  costByCountry?: Record<string, number>;
}

/** One base rate, for a country, a sex and an age band. Any of them may be null. */
export interface PriorBand {
  country: string | null;
  sex: Sex | null;
  ageMin: number | null;
  ageMax: number | null;
  prevalence: number;
  source: string;
}

export interface Hypothesis {
  id: string;
  name: string;
  summary: string;
  priors: {
    base: number;
    /** Where the base rate comes from, printed as "why this is in the catalog". */
    source?: string;
    /** Rows out of `hkb_priors` that are narrower than the base rate. */
    bands?: PriorBand[];
    modifiers: {
      when: EvidenceRule["input"] & {
        above?: number;
        below?: number;
        equals?: string;
        includes?: string;
        sex?: Sex;
        minAge?: number;
        maxAge?: number;
      };
      times: number;
      why: string;
      /** seed-only: written to `hkb_prior_modifiers`, never read by the engine */
      grade?: Grade;
      source?: string;
    }[];
  };
  evidence: EvidenceRule[];
  discriminators: Discriminator[];
  /** impact weights 0..3 per lens with a grade each, e.g. lifespan: {w: 3, grade: "A"} */
  lenses: Partial<Record<Lens, { w: 0 | 1 | 2 | 3; grade: Grade }>>;
  /** what would resolve it and what to suggest once likely/confirmed: reuse Pattern.management text */
  management: string;
  patternId?: string; // link to lib/patterns.ts when one exists
  /** who the hypothesis can apply to at all; outside the gate it is not scored */
  appliesTo?: { sex?: Sex; minAge?: number; maxAge?: number };
  /** only scored once another hypothesis is at least this likely */
  requires?: { id: string; minScore: number };
  /** the discriminator strength that lets a score of 0.9 read "confirmed" */
  confirmAtLrPos?: number;
  /** disability-adjusted life years, once GBD is imported. Phase 11. */
  burdenDaly?: number;
  /** the MONDO term this condition is, so an ontology import can join to it */
  mondoId?: string;
  /** why it is in the catalog at all: the burden source, in one line */
  why?: string;
  /** a broader condition this one is a kind of, e.g. hashimoto → hypothyroidism */
  parentId?: string;
}

/** The catalog the engine scores: in code below, or the same rows out of
 *  `hkb_conditions` and friends via `lib/hkb.ts`. One shape either way. */
export type Catalog = Hypothesis[];

export const CONFOUNDERS: {
  tag: string;
  markers: string[];
  discount: number;
  why: string;
}[] = [
  {
    tag: "acute_illness",
    markers: ["ferritin", "hs_crp", "crp", "albumin", "iron", "transferrin_saturation", "wbc"],
    discount: 0.5,
    why: "Ferritin and CRP are acute-phase reactants: an infection raises ferritin and hides empty iron stores.",
  },
  {
    tag: "post_viral",
    markers: ["ferritin", "hs_crp", "crp", "wbc", "lymphocytes_pct", "alt"],
    discount: 0.5,
    why: "The acute-phase response outlasts the illness by weeks; ferritin and CRP stay lifted with no new disease.",
  },
  {
    tag: "heavy_training",
    markers: ["ck", "ast", "alt", "ggt", "wbc", "testosterone", "ferritin"],
    discount: 0.5,
    why: "Hard training leaks muscle enzymes into the blood and moves the same markers a liver problem would.",
  },
  {
    tag: "not_fasted",
    markers: ["glucose", "insulin", "triglycerides", "homa_ir"],
    discount: 0.4,
    why: "A non-fasting draw makes glucose, insulin and triglycerides read high for a reason that is not disease.",
  },
  {
    tag: "poor_sleep",
    markers: ["glucose", "insulin", "cortisol", "bp_systolic"],
    discount: 0.7,
    why: "One short night raises morning glucose and insulin measurably; it is a state, not a trait.",
  },
  {
    tag: "acute_stress",
    markers: ["cortisol", "glucose", "wbc", "bp_systolic"],
    discount: 0.7,
    why: "Stress at the draw lifts cortisol, glucose, white cells and blood pressure together.",
  },
  {
    tag: "luteal_phase",
    markers: ["estradiol", "progesterone", "lh", "fsh", "testosterone"],
    discount: 0.5,
    why: "Female hormone results only compare within the same phase of the cycle.",
  },
  {
    tag: "winter",
    markers: ["vitamin_d"],
    discount: 0.6,
    why: "Vitamin D swings with the season; a winter low is expected and says little on its own.",
  },
  {
    tag: "dehydration",
    markers: ["hemoglobin", "hematocrit", "albumin", "creatinine", "bun"],
    discount: 0.6,
    why: "Haemoconcentration raises every count in the sample without changing the person.",
  },
];

/* ── the eight hypotheses ─────────────────────────────────────────────── */

const INSULIN_RESISTANCE: Hypothesis = {
  id: "insulin_resistance",
  name: "Insulin resistance",
  summary:
    "The pancreas is compensating: insulin rises for years before glucose or HbA1c move. The decade where the trajectory is easiest to change.",
  priors: {
    base: 0.3,
    source:
      "NHANES-style surveys put a third of Western adults over a HOMA-IR cut-off, so a third is the honest starting point (grade C).",
    modifiers: [
      {
        when: { fact: "family_history", includes: "diabet" },
        times: 2,
        why: "Type 2 diabetes in a parent or sibling roughly doubles the risk (A).",
      },
    ],
  },
  evidence: [
    {
      id: "ir_insulin",
      input: { metric: "insulin" },
      when: { above: 10 },
      lr: 3,
      grade: "B",
      source: "DeFronzo 2009 Diabetes: fasting insulin above 10 µIU/mL tracks clamp-measured resistance.",
      confoundedBy: ["insulin"],
    },
    {
      id: "ir_homa",
      input: { derived: "homaIr" },
      when: { above: 2 },
      lr: 3,
      grade: "B",
      source: "Matthews 1985 Diabetologia (HOMA); cut-off 2 is the common European threshold.",
      confoundedBy: ["glucose", "insulin"],
    },
    {
      id: "ir_tg_hdl_high",
      input: { derived: "tgHdl" },
      when: { above: 2 },
      lr: 2,
      grade: "B",
      source: "McLaughlin 2005 Am J Cardiol: TG/HDL above 2 identifies insulin resistance in non-diabetics.",
      confoundedBy: ["triglycerides"],
    },
    {
      id: "ir_tg_hdl_low",
      input: { derived: "tgHdl" },
      when: { below: 1.5 },
      lr: 0.6,
      grade: "B",
      source: "McLaughlin 2005 Am J Cardiol: below 1.5 the ratio argues against resistance.",
      confoundedBy: ["triglycerides"],
    },
    {
      id: "ir_hba1c_high",
      // HbA1c is reported to one decimal, so "> 5.6" is "at or above 5.7".
      input: { metric: "hba1c" },
      when: { above: 5.6 },
      lr: 4,
      grade: "A",
      source: "ADA Standards of Care: HbA1c 5.7 and above is prediabetes.",
    },
    {
      id: "ir_hba1c_low",
      input: { metric: "hba1c" },
      when: { below: 5.4 },
      lr: 0.7,
      grade: "A",
      source: "ADA Standards of Care: an HbA1c under 5.4 argues against, but does not exclude, resistance.",
    },
    {
      id: "ir_glucose",
      input: { metric: "glucose" },
      when: { above: 100 },
      lr: 2,
      grade: "A",
      source: "ADA Standards of Care: fasting glucose 100–125 mg/dL is impaired fasting glucose.",
      confoundedBy: ["glucose"],
    },
    {
      id: "ir_waist_height",
      input: { fact: "waist_height_ratio" },
      when: { above: 0.5 },
      lr: 2.5,
      lrNeg: 0.6,
      grade: "A",
      source: "Ashwell 2012 Obes Rev: waist-to-height above 0.5 beats BMI for cardiometabolic risk. The negative LR of 0.6 is a curated grade C: a waist under half your height does not exclude resistance, but it is the strongest thing against it that a tape measure can say.",
    },
    {
      id: "ir_family_negative",
      input: { fact: "family_history" },
      when: { includes: "diabet" },
      // The prior modifier already doubles it when diabetes is in the family;
      // this rule only bites on the answer that says it is not, so no answer
      // is ever counted twice.
      lr: 1,
      lrNeg: 0.8,
      grade: "C",
      source: "Grade C for the size: no published negative LR for a clean family history, but roughly half the population risk sits in the family, so its absence is worth about a fifth of the odds.",
    },
    {
      id: "ir_alt",
      input: { metric: "alt" },
      when: { above: 30 },
      lr: 1.5,
      grade: "B",
      source: "Lazo 2011 (NHANES): ALT above 30 travels with liver fat, which travels with insulin resistance.",
      confoundedBy: ["alt"],
    },
  ],
  discriminators: [
    {
      test: "Fasting insulin",
      codes: ["insulin"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.5,
      typicalPos: 18,
      typicalNeg: 4,
      unit: "µIU/mL",
      howTo: "Add it to the next fasting draw; it costs a few euro on top of glucose.",
    },
    {
      test: "OGTT with insulin",
      codes: ["ogtt_insulin_120"],
      cost: 2,
      lrPos: 6,
      lrNeg: 0.2,
      typicalPos: 120,
      typicalNeg: 30,
      unit: "µIU/mL",
      howTo: "75 g glucose, insulin at 0 and 120 minutes. Ask for insulin, not glucose alone.",
    },
    {
      test: "HbA1c",
      codes: ["hba1c"],
      cost: 1,
      lrPos: 4,
      lrNeg: 0.7,
      typicalPos: 5.9,
      typicalNeg: 5.1,
      unit: "%",
    },
    {
      test: "CGM, 14 days",
      codes: ["cgm_mean_glucose"],
      cost: 3,
      lrPos: 2,
      lrNeg: 0.7,
      typicalPos: 115,
      typicalNeg: 88,
      unit: "mg/dL",
      howTo: "Two weeks of continuous glucose. Useful for learning, not for grading: no outcome data in non-diabetics.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
    energy: { w: 2, grade: "B" },
    weight: { w: 3, grade: "A" },
  },
  management:
    "Confirm with a 2-hour OGTT that measures insulin, not just glucose. Then the levers in order: resistance training twice a week, protein and fibre at the start of meals, a walk after the largest meal, and enough sleep. Retest fasting insulin and TG/HDL in 12 weeks, not HbA1c.",
  patternId: "insulin_resistance_early",
};

const HASHIMOTO: Hypothesis = {
  id: "hashimoto",
  name: "Autoimmune thyroiditis (Hashimoto's)",
  summary:
    "The immune system is attacking the thyroid. TSH climbs slowly over years; antibodies show it before TSH does.",
  priors: {
    base: 0.05,
    source:
      "Antibody positivity runs near 10 % of adults and clinical disease near 5 %, so 5 % is the base before sex is known (grade C).",
    modifiers: [
      {
        when: { sex: "female" },
        times: 5,
        why: "Hashimoto's is five to eight times more common in women (A).",
      },
      {
        when: {
          fact: "family_history",
          includes: "thyroid|hashimoto|graves|autoimmune|coeliac|celiac|vitiligo|type 1",
        },
        times: 2,
        why: "Thyroid and other autoimmune disease clusters in families (B).",
      },
      {
        when: { fact: "hla_type", includes: "dr3|dr4" },
        times: 1.5,
        why: "HLA-DR3 and DR4 associate with thyroid autoimmunity (C, association studies only).",
      },
    ],
  },
  evidence: [
    {
      id: "hashi_tpo",
      // 34 IU/mL is the limit `patterns.ts` falls back to, and an antibody is
      // only ever positive upwards, so this reads the direction as well.
      input: { metric: "tpo_antibodies" },
      when: { above: 34 },
      lr: 10,
      // 0.5 here times 0.6 on anti-Tg is the 0.3 the spec gives for "both
      // negative"; the discriminator carries the single-test 0.3 instead.
      lrNeg: 0.5,
      grade: "A",
      source: "Hollowell 2002 JCEM (NHANES III): TPO antibodies above the assay limit are the defining marker.",
    },
    {
      id: "hashi_tg",
      input: { metric: "anti_thyroglobulin" },
      when: { above: 115 },
      lr: 5,
      lrNeg: 0.6,
      grade: "A",
      source: "Hollowell 2002 JCEM: anti-Tg catches the roughly 10 % who are TPO-negative.",
    },
    {
      id: "hashi_family_negative",
      input: { fact: "family_history" },
      when: {
        includes: "thyroid|hashimoto|graves|autoimmune|coeliac|celiac|vitiligo|type 1",
      },
      // Same shape as the insulin-resistance rule: the prior modifier handles
      // the positive answer, this one handles the negative.
      lr: 1,
      lrNeg: 0.8,
      grade: "C",
      source: "Grade C for the size: thyroid autoimmunity clusters in families (B), so a family with none of it argues down, but no study puts a number on the negative.",
    },
    {
      id: "hashi_tsh_high",
      input: { metric: "tsh" },
      when: { above: 4.5 },
      lr: 3,
      grade: "A",
      source: "Rodondi 2010 JAMA: TSH above 4.5 is subclinical hypothyroidism, most often autoimmune.",
    },
    {
      id: "hashi_tsh_mid",
      input: { metric: "tsh" },
      when: { above: 2.5, below: 4.5 },
      lr: 1.5,
      grade: "B",
      source: "Vanderpump 1995 Clin Endocrinol (Whickham 20-year follow-up): risk rises from a TSH of 2.5 up.",
    },
    {
      id: "hashi_ft4_low",
      input: { metric: "free_t4" },
      when: { below: 0.9 },
      lr: 2,
      grade: "A",
      source: "ATA 2014 hypothyroidism guideline: free T4 under about 0.9 ng/dL with a high TSH is overt failure.",
    },
  ],
  discriminators: [
    {
      test: "Anti-TPO antibodies",
      codes: ["tpo_antibodies"],
      cost: 1,
      lrPos: 10,
      lrNeg: 0.3,
      typicalPos: 320,
      typicalNeg: 9,
      unit: "IU/mL",
      howTo: "One extra tube on the next thyroid draw. It never needs repeating once positive.",
    },
    {
      test: "Anti-thyroglobulin antibodies",
      codes: ["anti_thyroglobulin"],
      cost: 1,
      lrPos: 5,
      lrNeg: 0.6,
      typicalPos: 250,
      typicalNeg: 10,
      unit: "IU/mL",
    },
    {
      test: "Thyroid ultrasound",
      codes: ["thyroid_ultrasound"],
      cost: 3,
      lrPos: 4,
      lrNeg: 0.5,
      typicalPos: 1,
      typicalNeg: 0,
      howTo: "1 for a heterogeneous, hypoechoic gland, 0 for a normal one. Also baselines nodules.",
    },
    {
      test: "Repeat TSH in 6 months",
      codes: ["tsh"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.6,
      typicalPos: 5.2,
      typicalNeg: 1.6,
      unit: "mIU/L",
      repeatable: true,
      howTo: "Progression runs 2–5 % per year while antibody-positive, so a second TSH is the cheapest test there is.",
    },
  ],
  lenses: {
    lifespan: { w: 1, grade: "B" },
    energy: { w: 3, grade: "A" },
    mood: { w: 2, grade: "B" },
    weight: { w: 2, grade: "B" },
  },
  management:
    "Track TSH, fT4 and antibodies every 6 months. Keep ferritin above 50 and vitamin D 40–60. Stop iodine supplements. Selenium 200 µg/day is a reasonable 6-month trial with antibodies as the outcome. Treat with levothyroxine when TSH passes 10, or earlier if symptomatic, antibody-positive with rising TSH, or planning pregnancy.",
  patternId: "hashimoto",
};

const IRON_DEFICIENCY: Hypothesis = {
  id: "iron_deficiency",
  name: "Iron deficiency",
  summary:
    "The iron stores are empty. Fatigue, hair loss and breathlessness arrive long before haemoglobin drops.",
  priors: {
    base: 0.12,
    source:
      "Pooled European surveys put low ferritin near 12 % of adults once menstruating women are included (grade C).",
    modifiers: [],
  },
  evidence: [
    {
      id: "iron_ferritin_30",
      input: { metric: "ferritin" },
      when: { below: 30 },
      lr: 20,
      grade: "A",
      source: "Guyatt 1992 J Gen Intern Med: ferritin under 30 ng/mL has an LR near 20 for absent marrow iron.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "iron_ferritin_15",
      input: { metric: "ferritin" },
      when: { below: 15 },
      lr: 50,
      grade: "A",
      source: "Guyatt 1992 J Gen Intern Med: ferritin under 15 ng/mL has an LR near 50. It supersedes the under-30 rule rather than stacking on it.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "iron_tsat",
      input: { metric: "transferrin_saturation" },
      when: { below: 20 },
      lr: 3,
      grade: "A",
      source: "BSG iron deficiency guideline: transferrin saturation under 20 % means iron is not reaching the marrow.",
      confoundedBy: ["transferrin_saturation"],
    },
    {
      id: "iron_mcv",
      input: { metric: "mcv" },
      when: { below: 80 },
      lr: 2,
      grade: "A",
      source: "BSG iron deficiency guideline: microcytosis is the late red-cell consequence.",
    },
    {
      id: "iron_rdw",
      input: { metric: "rdw" },
      when: { above: 14.5 },
      lr: 1.5,
      grade: "B",
      source: "Bessman 1983 Am J Clin Pathol: RDW widens before MCV falls.",
    },
    {
      id: "iron_hb",
      input: { metric: "hemoglobin" },
      when: { belowOptimal: true },
      lr: 2,
      grade: "A",
      source: "WHO anaemia thresholds; the band here is already sex-adjusted.",
      confoundedBy: ["hemoglobin"],
    },
  ],
  discriminators: [
    {
      test: "Ferritin",
      codes: ["ferritin"],
      cost: 1,
      lrPos: 20,
      lrNeg: 0.1,
      typicalPos: 12,
      typicalNeg: 90,
      unit: "ng/mL",
      howTo: "Draw it with a CRP: inflammation lifts ferritin and hides an empty store.",
    },
    {
      test: "Transferrin saturation and TIBC",
      codes: ["transferrin_saturation"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.4,
      typicalPos: 12,
      typicalNeg: 32,
      unit: "%",
      howTo: "Separates empty stores from inflammation hiding them, and it responds first when iron is working.",
    },
    {
      test: "Reticulocyte haemoglobin",
      codes: ["reticulocyte_hemoglobin"],
      cost: 2,
      lrPos: 4,
      lrNeg: 0.4,
      typicalPos: 25,
      typicalNeg: 32,
      unit: "pg",
      howTo: "Grade C for the LRs here: small diagnostic series only, but it is the one marker CRP does not move.",
    },
  ],
  lenses: {
    energy: { w: 3, grade: "A" },
    mood: { w: 2, grade: "B" },
    lifespan: { w: 1, grade: "B" },
  },
  management:
    "Find the cause before topping it up: periods, gut losses, coeliac disease. Then iron 60–100 mg elemental on alternate days with vitamin C, away from coffee, tea and calcium, and retest ferritin at three months. Stop once ferritin passes 50.",
  patternId: "iron_deficiency_no_anemia",
};

const IRON_DEFICIENCY_CAUSE_GI: Hypothesis = {
  id: "iron_deficiency_cause_gi",
  name: "Iron loss or malabsorption from the gut",
  summary:
    "Iron is low and the gut is the reason: coeliac disease, atrophic gastritis, H. pylori, or a bleed nobody has looked for.",
  requires: { id: "iron_deficiency", minScore: 0.25 },
  priors: {
    base: 0.2,
    source:
      "In referred iron-deficiency series a gut cause is found in roughly a fifth of unselected adults, more in men (grade C).",
    modifiers: [
      {
        when: { sex: "male" },
        times: 3,
        why: "A man has no monthly loss, so the gut is the default explanation (A).",
      },
      {
        when: { fact: "menopause_status", includes: "post" },
        times: 3,
        why: "After menopause the monthly loss is gone and the gut becomes the default explanation (A).",
      },
    ],
  },
  evidence: [
    {
      id: "gi_h_pylori",
      input: { metric: "h_pylori_stool_antigen" },
      when: { above: 0.5 },
      lr: 3,
      grade: "B",
      source: "Hudak 2017 Helicobacter (meta-analysis): H. pylori associates with iron deficiency. 1 = positive, 0 = negative.",
    },
    {
      id: "gi_coeliac",
      input: { metric: "ttg_iga" },
      when: { above: 10 },
      lr: 8,
      grade: "A",
      source: "BSG coeliac guideline: tTG-IgA above 10 RU/mL, read with a total IgA, is close to diagnostic.",
    },
    {
      id: "gi_parietal",
      input: { metric: "parietal_cell_antibodies" },
      when: { above: 0.5 },
      lr: 8,
      grade: "B",
      source: "Lahner 2009 World J Gastroenterol: parietal-cell or intrinsic-factor antibodies mark atrophic gastritis. 1 = positive.",
    },
    {
      id: "gi_b12_low",
      input: { metric: "vitamin_b12" },
      when: { below: 300 },
      lr: 2,
      grade: "B",
      source: "Lahner 2009: low B12 alongside low ferritin points at the stomach rather than the diet.",
    },
    {
      id: "gi_gastrin",
      input: { metric: "gastrin" },
      when: { above: 100 },
      lr: 5,
      grade: "B",
      source: "Lahner 2009: high gastrin with a low pepsinogen I is the serological picture of atrophic gastritis.",
    },
    {
      id: "gi_fobt",
      input: { metric: "fobt" },
      when: { above: 0.5 },
      lr: 6,
      grade: "A",
      source: "USPSTF 2021 colorectal screening: a positive faecal immunochemical test needs a scope. 1 = positive.",
    },
  ],
  discriminators: [
    {
      test: "tTG-IgA with total IgA",
      codes: ["ttg_iga"],
      cost: 1,
      lrPos: 8,
      lrNeg: 0.3,
      typicalPos: 40,
      typicalNeg: 2,
      unit: "RU/mL",
      howTo: "Must be taken while still eating gluten, and the total IgA rules out a false negative.",
    },
    {
      test: "H. pylori stool antigen",
      codes: ["h_pylori_stool_antigen"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.5,
      typicalPos: 1,
      typicalNeg: 0,
      howTo: "Stop PPIs two weeks before. 1 = positive, 0 = negative.",
    },
    {
      test: "Parietal-cell antibodies",
      codes: ["parietal_cell_antibodies"],
      cost: 2,
      lrPos: 8,
      lrNeg: 0.4,
      typicalPos: 1,
      typicalNeg: 0,
    },
    {
      test: "Faecal immunochemical test",
      codes: ["fobt"],
      cost: 1,
      lrPos: 6,
      lrNeg: 0.7,
      typicalPos: 1,
      typicalNeg: 0,
    },
    {
      test: "Gastroscopy",
      codes: ["gastroscopy"],
      cost: 4,
      lrPos: 20,
      lrNeg: 0.1,
      typicalPos: 1,
      typicalNeg: 0,
      howTo: "The test that both looks and biopsies. It ends the question; it is also the only invasive one here.",
    },
  ],
  lenses: {
    lifespan: { w: 2, grade: "B" },
    energy: { w: 1, grade: "B" },
  },
  management:
    "Iron deficiency in a man or a post-menopausal woman is a gut question until proven otherwise. Coeliac serology and H. pylori first, then parietal-cell antibodies and a faecal immunochemical test, then a scope. Replace the iron in parallel; finding the cause does not wait for the ferritin to come up.",
};

const PCOS: Hypothesis = {
  id: "pcos",
  name: "Polycystic ovary syndrome",
  summary:
    "Irregular cycles, high androgens and insulin resistance travelling together. The commonest endocrine condition in women of reproductive age.",
  appliesTo: { sex: "female", minAge: 15, maxAge: 50 },
  confirmAtLrPos: 4,
  priors: {
    base: 0.1,
    source:
      "Rotterdam-criteria prevalence runs 8–13 % of women of reproductive age (grade C).",
    modifiers: [],
  },
  evidence: [
    {
      id: "pcos_cycles",
      input: { fact: "cycle_regularity" },
      when: { includes: "irregular|absent|oligo" },
      lr: 4,
      lrNeg: 0.4,
      grade: "A",
      source: "Rotterdam 2003 criteria: oligo- or anovulation is one of the three defining features. The negative LR of 0.4 is a curated grade C: regular ovulatory cycles remove one of the three, and most of the syndrome with it.",
    },
    {
      id: "pcos_hirsutism",
      input: { fact: "hirsutism_acne" },
      when: { includes: "yes|hirsut|acne" },
      lr: 3,
      lrNeg: 0.6,
      grade: "A",
      source: "Rotterdam 2003 criteria: clinical hyperandrogenism counts the same as a biochemical one. The negative LR of 0.6 is a curated grade C: no hair and no acne removes the commonest presenting feature.",
    },
    {
      id: "pcos_lh_fsh",
      input: { fact: "lh_fsh_ratio" },
      when: { above: 2 },
      lr: 2,
      grade: "B",
      source: "Balen 1995 Hum Reprod: an LH/FSH ratio above 2 is common in PCOS but absent in a third of cases.",
      confoundedBy: ["lh", "fsh"],
    },
    {
      id: "pcos_testosterone",
      input: { metric: "testosterone" },
      when: { aboveOptimal: true },
      lr: 4,
      grade: "A",
      source: "Rotterdam 2003 criteria: biochemical hyperandrogenism; the band here is already sex-adjusted.",
      confoundedBy: ["testosterone"],
    },
    {
      id: "pcos_shbg",
      input: { metric: "shbg" },
      when: { below: 30 },
      lr: 1.5,
      grade: "B",
      source: "Deswal 2018 J Hum Reprod Sci: low SHBG raises free androgen and travels with insulin resistance.",
    },
    {
      id: "pcos_insulin",
      input: { metric: "insulin" },
      when: { above: 10 },
      lr: 1.5,
      grade: "B",
      source: "Diamanti-Kandarakis 2012 Endocr Rev: insulin resistance is present in most, but not all, PCOS.",
      confoundedBy: ["insulin"],
    },
    {
      id: "pcos_amh",
      input: { metric: "amh" },
      when: { above: 5 },
      lr: 3,
      grade: "B",
      source: "Iliodromiti 2013 JCEM: AMH above about 5 ng/mL stands in for the follicle count.",
    },
  ],
  discriminators: [
    {
      test: "Total and free testosterone",
      codes: ["testosterone", "free_testosterone"],
      cost: 1,
      lrPos: 4,
      lrNeg: 0.5,
      typicalPos: 95,
      typicalNeg: 35,
      unit: "ng/dL",
      howTo: "Morning draw, days 2–5 of the cycle if there is one.",
    },
    {
      test: "LH and FSH",
      codes: ["lh", "fsh"],
      cost: 1,
      lrPos: 2,
      lrNeg: 0.7,
      typicalPos: 14,
      typicalNeg: 5,
      unit: "mIU/mL",
    },
    {
      test: "AMH",
      codes: ["amh"],
      cost: 2,
      lrPos: 3,
      lrNeg: 0.6,
      typicalPos: 7,
      typicalNeg: 2,
      unit: "ng/mL",
    },
    {
      test: "Ovarian ultrasound",
      codes: ["ovarian_ultrasound"],
      cost: 3,
      lrPos: 4,
      lrNeg: 0.4,
      typicalPos: 1,
      typicalNeg: 0,
      howTo: "1 for 20 or more follicles or a raised ovarian volume. With two Rotterdam criteria already met, this settles it.",
    },
  ],
  lenses: {
    energy: { w: 3, grade: "A" },
    weight: { w: 2, grade: "A" },
    lifespan: { w: 1, grade: "B" },
    mood: { w: 2, grade: "B" },
  },
  management:
    "Rotterdam needs two of three: irregular cycles, hyperandrogenism, polycystic ovaries on ultrasound. Treat the insulin side first: weight, resistance training, and metformin or inositol where indicated. Combined oral contraception for cycle control and androgen symptoms. Screen for glucose intolerance every 1–3 years.",
};

const SLEEP_APNOEA: Hypothesis = {
  id: "sleep_apnoea",
  name: "Obstructive sleep apnoea",
  summary:
    "The airway closes repeatedly during sleep. It drives blood pressure, atrial fibrillation, insulin resistance and daytime exhaustion, and most cases are never diagnosed.",
  priors: {
    base: 0.15,
    source:
      "Moderate-to-severe OSA prevalence estimates run 10–20 % of middle-aged adults, so 15 % sits in the middle (grade C).",
    modifiers: [
      {
        when: { sex: "male" },
        times: 2,
        why: "OSA is about twice as common in men (A).",
      },
    ],
  },
  evidence: [
    {
      id: "osa_snoring",
      input: { fact: "sleep_snoring" },
      when: { includes: "most" },
      lr: 3,
      grade: "A",
      source: "Chung 2016 Chest (STOP-Bang): habitual loud snoring is the single strongest question.",
    },
    {
      id: "osa_no_snoring",
      input: { fact: "sleep_snoring" },
      when: { equals: "no" },
      lr: 0.4,
      grade: "C",
      source: "Grade C for the size: STOP-Bang has no published negative LR per item, but a firm no to habitual snoring is the single most useful thing anyone says against OSA.",
    },
    {
      id: "osa_sleepiness",
      input: { fact: "daytime_sleepiness" },
      when: { includes: "yes|often|most" },
      lr: 2,
      lrNeg: 0.6,
      grade: "A",
      source: "Chung 2016 Chest (STOP-Bang): daytime tiredness is the second question in the score. The negative LR of 0.6 is a curated grade C: STOP-Bang publishes no per-item negative, but sleeping well through the day is real evidence against.",
    },
    {
      id: "osa_bmi",
      input: { metric: "bmi" },
      when: { above: 30 },
      lr: 3,
      grade: "A",
      source: "Peppard 2013 Am J Epidemiol (Wisconsin cohort): BMI is the dominant risk factor.",
    },
    {
      id: "osa_neck",
      input: { fact: "neck_cm" },
      when: { above: 43 },
      lr: 2,
      grade: "C",
      source: "Grade C: a neck over 43 cm is a STOP-Bang item, but it is strongly correlated with BMI, so it carries less once BMI is already counted.",
    },
    {
      id: "osa_bp",
      input: { fact: "bp_systolic" },
      when: { above: 135 },
      lr: 2,
      grade: "A",
      source: "Marin 2005 Lancet: OSA and hypertension travel together; resistant hypertension is a red flag.",
      confoundedBy: ["bp_systolic"],
    },
    {
      id: "osa_hematocrit",
      input: { metric: "hematocrit" },
      when: { above: 50 },
      lr: 1.5,
      grade: "B",
      source: "Nocturnal hypoxia raises erythropoietin; a high haematocrit with no other cause is a hint.",
      confoundedBy: ["hematocrit"],
    },
    {
      id: "osa_resting_hr",
      input: { fact: "resting_hr" },
      when: { above: 75 },
      lr: 1.3,
      grade: "C",
      source: "Grade C: a raised sleeping heart rate on a wearable tracks sympathetic drive; suggestive, never diagnostic.",
    },
  ],
  discriminators: [
    {
      test: "STOP-Bang questionnaire",
      codes: ["stop_bang"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.3,
      typicalPos: 5,
      typicalNeg: 1,
      howTo: "Eight yes/no questions, two minutes, free. Three or more is a positive screen.",
    },
    {
      test: "Home sleep study",
      codes: ["home_sleep_study"],
      cost: 3,
      lrPos: 10,
      lrNeg: 0.1,
      typicalPos: 22,
      typicalNeg: 3,
      unit: "AHI events/h",
      howTo: "One night with a home kit gives the apnoea-hypopnoea index. Five or more with symptoms is a diagnosis.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
    energy: { w: 3, grade: "A" },
    mood: { w: 2, grade: "B" },
  },
  management:
    "Screen with STOP-Bang, then a home sleep study if it is positive. CPAP for moderate to severe disease, a mandibular device for mild. Weight loss, side sleeping and no alcohol within three hours of bed all help. Retest blood pressure and morning glucose three months after treatment starts.",
};

const NAFLD: Hypothesis = {
  id: "nafld",
  name: "Fatty liver disease",
  summary:
    "Fat in the liver, usually the liver's share of insulin resistance. Silent until fibrosis arrives, and the commonest liver finding there is.",
  priors: {
    base: 0.25,
    source:
      "Imaging series put fatty liver in about a quarter of Western adults (grade C).",
    modifiers: [],
  },
  evidence: [
    {
      id: "nafld_alt",
      input: { metric: "alt" },
      when: { aboveOptimal: true },
      lr: 2.5,
      // ALT is insensitive, so an ALT inside the band argues against liver fat
      // only weakly. The 0.7 is grade C; the 2.5 and the band are Prati 2002.
      lrNeg: 0.7,
      grade: "B",
      source: "Prati 2002 Ann Intern Med: the true upper limit is about 30 U/L in men and 20 in women; the band here is already sex-adjusted. The negative LR of 0.7 is a curated grade C: a normal ALT does not exclude steatosis.",
      confoundedBy: ["alt"],
    },
    {
      id: "nafld_waist_normal",
      input: { fact: "waist_height_ratio" },
      when: { below: 0.5 },
      lr: 0.6,
      grade: "C",
      source: "Grade C for the size: central adiposity is the dominant clinical predictor, so its absence is the strongest thing against fatty liver short of imaging.",
    },
    {
      id: "nafld_ggt",
      input: { metric: "ggt" },
      when: { aboveOptimal: true },
      lr: 2,
      grade: "B",
      source: "Lazo 2011 (NHANES): GGT above the optimal band tracks liver fat and alcohol together.",
      confoundedBy: ["ggt"],
    },
    {
      id: "nafld_tg",
      input: { metric: "triglycerides" },
      when: { above: 150 },
      lr: 1.5,
      grade: "B",
      source: "EASL-EASD-EASO 2016 NAFLD guideline: hypertriglyceridaemia is part of the metabolic picture.",
      confoundedBy: ["triglycerides"],
    },
    {
      id: "nafld_waist",
      input: { fact: "waist_height_ratio" },
      when: { above: 0.5 },
      lr: 2,
      grade: "A",
      source: "EASL-EASD-EASO 2016: central adiposity is the strongest clinical predictor of liver fat.",
    },
    {
      id: "nafld_ir",
      input: { hypothesis: "insulin_resistance" },
      when: { above: 0.6 },
      lr: 2,
      grade: "B",
      source: "EASL-EASD-EASO 2016: insulin resistance is the mechanism; the app scores it separately above.",
    },
    {
      id: "nafld_fib4",
      input: { derived: "fib4" },
      when: { above: 1.3 },
      lr: 3,
      grade: "A",
      source: "Sterling 2006 Hepatology: FIB-4 above 1.3 is the guideline trigger to look for fibrosis, not just fat.",
    },
  ],
  discriminators: [
    {
      test: "Liver ultrasound",
      codes: ["liver_ultrasound"],
      cost: 3,
      lrPos: 5,
      lrNeg: 0.3,
      typicalPos: 1,
      typicalNeg: 0,
      howTo: "1 for a bright liver, 0 for a normal one. Cheap and everywhere, but it misses mild steatosis.",
    },
    {
      test: "FibroScan",
      codes: ["fibroscan_kpa"],
      cost: 3,
      lrPos: 8,
      lrNeg: 0.2,
      typicalPos: 9,
      typicalNeg: 4,
      unit: "kPa",
      howTo: "Elastography measures stiffness, which is the number that decides whether this matters.",
    },
  ],
  lenses: {
    lifespan: { w: 2, grade: "B" },
    energy: { w: 1, grade: "C" },
  },
  management:
    "There is no drug first line: 7–10 % body weight loss reverses steatosis and often fibrosis. Cut alcohol and fructose, add resistance training. Compute FIB-4 every year; above 1.3 get elastography rather than another ALT.",
};

const B12_DEFICIENCY: Hypothesis = {
  id: "b12_deficiency",
  name: "Vitamin B12 deficiency",
  summary:
    "Low B12 damages nerves before it changes the blood count, and the damage is only partly reversible once it arrives.",
  priors: {
    base: 0.08,
    source:
      "Population surveys put B12 under 200 pg/mL near 6–10 % of adults, higher over 60 (grade C).",
    modifiers: [
      {
        when: { fact: "diet", includes: "vegetarian|vegan|plant-based" },
        times: 3,
        why: "B12 comes only from animal foods or supplements (A).",
      },
      {
        when: {
          fact: "medications",
          includes: "metformin|omeprazole|pantoprazole|esomeprazole|lansoprazole|ppi",
        },
        times: 2,
        why: "Metformin and proton-pump inhibitors both cut B12 absorption (A).",
      },
    ],
  },
  evidence: [
    {
      id: "b12_low",
      input: { metric: "vitamin_b12" },
      when: { below: 200 },
      lr: 10,
      grade: "A",
      source: "Stabler 2013 NEJM: under 200 pg/mL is deficient in almost everyone.",
    },
    {
      id: "b12_borderline",
      input: { metric: "vitamin_b12" },
      when: { above: 200, below: 300 },
      lr: 2,
      grade: "B",
      source: "Stabler 2013 NEJM: 200–300 pg/mL is the grey zone where MMA decides.",
    },
    {
      id: "b12_diet_negative",
      input: { fact: "diet" },
      when: { includes: "vegetarian|vegan|plant-based" },
      // The prior modifier triples it for a plant-based diet; this rule only
      // reads the answer that says animal foods are on the plate.
      lr: 1,
      lrNeg: 0.7,
      grade: "C",
      source: "Grade C for the size: B12 comes only from animal foods or supplements (A), so an omnivore diet is the commonest reason a B12 is fine. No study puts a number on it.",
    },
    {
      id: "b12_mcv",
      input: { metric: "mcv" },
      when: { above: 100 },
      lr: 3,
      grade: "A",
      source: "Stabler 2013 NEJM: macrocytosis is the classic, and late, blood sign.",
    },
    {
      id: "b12_homocysteine",
      input: { metric: "homocysteine" },
      when: { above: 12 },
      lr: 3,
      grade: "B",
      source: "Stabler 2013 NEJM: homocysteine rises in B12 and folate deficiency both.",
    },
    {
      id: "b12_mma",
      input: { metric: "methylmalonic_acid" },
      when: { above: 0.4 },
      lr: 8,
      grade: "A",
      source: "Stabler 2013 NEJM: methylmalonic acid rises only in B12 deficiency, which is why it settles the grey zone.",
    },
    {
      id: "b12_parietal",
      input: { metric: "parietal_cell_antibodies" },
      when: { above: 0.5 },
      lr: 5,
      grade: "B",
      source: "Lahner 2009 World J Gastroenterol: parietal-cell antibodies mark the pernicious-anaemia route. 1 = positive.",
    },
  ],
  discriminators: [
    {
      test: "Methylmalonic acid",
      codes: ["methylmalonic_acid"],
      cost: 2,
      lrPos: 8,
      lrNeg: 0.3,
      typicalPos: 0.8,
      typicalNeg: 0.2,
      unit: "µmol/L",
      howTo: "The test that decides a borderline B12. Kidney failure raises it too, so read it with creatinine.",
    },
    {
      test: "Holotranscobalamin",
      codes: ["holotranscobalamin"],
      cost: 2,
      lrPos: 5,
      lrNeg: 0.3,
      typicalPos: 25,
      typicalNeg: 70,
      unit: "pmol/L",
      howTo: "Grade C for the LRs here: the active fraction performs like MMA in small series, and not every lab runs it.",
    },
    {
      test: "Repeat B12",
      codes: ["vitamin_b12"],
      cost: 1,
      lrPos: 10,
      lrNeg: 0.4,
      typicalPos: 180,
      typicalNeg: 480,
      unit: "pg/mL",
      repeatable: true,
    },
  ],
  lenses: {
    energy: { w: 2, grade: "A" },
    mood: { w: 2, grade: "B" },
    lifespan: { w: 1, grade: "B" },
  },
  management:
    "Confirm a borderline B12 with methylmalonic acid before treating, because treatment erases the evidence. Then 1000 µg oral daily, or injections if there is neurological involvement or an absorption problem. Retest at three months and look for the cause: diet, metformin, PPIs, or the stomach.",
};

export const HYPOTHESES: Hypothesis[] = [
  INSULIN_RESISTANCE,
  HASHIMOTO,
  IRON_DEFICIENCY,
  IRON_DEFICIENCY_CAUSE_GI,
  PCOS,
  SLEEP_APNOEA,
  NAFLD,
  B12_DEFICIENCY,
];

/* ── the engine ───────────────────────────────────────────────────────── */

export interface HypothesisResult {
  id: string;
  name: string;
  prior: number;
  score: number; // score = posterior odds → probability 0..1
  state: HState;
  for: {
    rule: string;
    input: string;
    value: string;
    lr: number;
    grade: Grade;
    discounted?: number;
  }[];
  against: {
    rule: string;
    input: string;
    value: string;
    lr: number;
    grade: Grade;
  }[];
  missing: { rule: string; input: string }[]; // evidence that could not be evaluated
  /** rules that held but read an input a stronger rule already scored */
  superseded: {
    rule: string;
    input: string;
    value: string;
    lr: number;
    grade: Grade;
    by: string;
  }[];
  confounded: { input: string; tag: string }[];
  nextTests: {
    test: string;
    cost: number;
    expectedShift: number;
    ratio: number;
    howTo?: string;
  }[]; // sorted by ratio desc
  lenses: Hypothesis["lenses"];
  lensWeight: number; // Σ w × gradeWeight, used for ranking across hypotheses
  /** everything the Simulate button needs, kept next to nextTests */
  tests: Discriminator[];
  summary: string;
  management: string;
  patternId?: string;
  /** why this is in the catalog at all: burden and where the prior came from */
  burdenDaly?: number;
  priorSource?: string;
  why?: string;
}

/** How much a claim counts when it is only as good as its grade. */
const GRADE_WEIGHT: Record<Grade, number> = { A: 1, B: 0.75, C: 0.5, D: 0.25 };

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

const pFromOdds = (odds: number) => odds / (1 + odds);

/** A fact as text, arrays joined, so `includes` reads the same either way. */
function factText(m: ModelInput, key: string): string | null {
  const raw = m.profile[key];
  if (raw == null) return null;
  const text = Array.isArray(raw) ? raw.join(", ") : String(raw);
  return text.trim() === "" ? null : text;
}

/**
 * ponytail: three "facts" nobody stores are computed here instead of adding
 * columns for them. Everything else is a plain profile answer.
 */
function syntheticFact(m: ModelInput, key: string): number | null {
  const numFact = (k: string) => {
    const text = factText(m, k);
    if (text == null) return null;
    const hit = text.match(/\d+(?:\.\d+)?/);
    return hit ? Number(hit[0]) : null;
  };
  if (key === "waist_height_ratio") {
    const waist = numFact("waist_cm");
    const height = numFact("height_cm");
    return waist != null && height != null && height > 0
      ? round2(waist / height)
      : null;
  }
  if (key === "lh_fsh_ratio") {
    const lh = m.latest.lh?.value ?? null;
    const fsh = m.latest.fsh?.value ?? null;
    return lh != null && fsh != null && fsh > 0 ? round2(lh / fsh) : null;
  }
  if (key === "bp_systolic") {
    const row = m.latest.bp_systolic?.value ?? null;
    if (row != null) return row;
    const text = factText(m, "bp_home");
    return text ? (parseBp(text)?.[0] ?? null) : null;
  }
  return null;
}

/** Which metric codes each synthetic fact consumes, so a discriminator that
 *  reads the same markers is not counted a second time. */
const FACT_METRICS: Record<string, string[]> = {
  waist_height_ratio: [],
  lh_fsh_ratio: ["lh", "fsh"],
  bp_systolic: ["bp_systolic"],
};

interface Resolved {
  label: string;
  value: number | null;
  text: string;
  row?: LatestValue;
  /** the metric code the confounder tags are keyed on */
  code?: string;
}

/** What the rule reads, or null when this person has no answer for it. */
function resolve(
  input: EvidenceRule["input"],
  m: ModelInput,
  scores: Map<string, number>,
): Resolved | null {
  if (input.metric) {
    const row = m.latest[input.metric];
    if (!row || row.value == null) return null;
    return {
      label: input.metric,
      value: row.value,
      text: `${row.value}${row.unit ? ` ${row.unit}` : ""}`,
      row,
      code: input.metric,
    };
  }
  if (input.derived) {
    const value = m.derived[input.derived];
    if (value == null) return null;
    return { label: input.derived, value, text: String(value) };
  }
  if (input.hypothesis) {
    const value = scores.get(input.hypothesis);
    if (value == null) return null;
    return {
      label: `hypothesis:${input.hypothesis}`,
      value,
      text: String(value),
    };
  }
  if (input.event) {
    const raw = m.profile.life_events;
    const list = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
    const text = list.join(", ");
    if (!text.trim()) return null;
    return { label: `event:${input.event}`, value: null, text };
  }
  if (input.fact) {
    const synthetic = syntheticFact(m, input.fact);
    if (synthetic != null)
      return {
        label: input.fact,
        value: synthetic,
        text: String(synthetic),
        code: input.fact,
      };
    const text = factText(m, input.fact);
    if (text == null) return null;
    const hit = text.match(/-?\d+(?:\.\d+)?/);
    return {
      label: input.fact,
      value: hit ? Number(hit[0]) : null,
      text,
      code: input.fact,
    };
  }
  return null;
}

/** One string per thing a rule can read, so two rules over the same marker
 *  land in the same group and only the strongest of them scores. */
function inputKey(input: EvidenceRule["input"]): string {
  if (input.metric) return `metric:${input.metric}`;
  if (input.derived) return `derived:${input.derived}`;
  if (input.hypothesis) return `hypothesis:${input.hypothesis}`;
  if (input.event) return `event:${input.event}`;
  return `fact:${input.fact}`;
}

/** Does the condition hold? `null` when the input cannot answer the question. */
function holds(when: EvidenceRule["when"], r: Resolved): boolean | null {
  const checks: boolean[] = [];
  if (when.status != null) {
    if (!r.row) return null;
    checks.push(r.row.status === when.status);
  }
  if (when.aboveOptimal) {
    if (!r.row || r.row.optimalHigh == null || r.value == null) return null;
    checks.push(r.value > r.row.optimalHigh);
  }
  if (when.belowOptimal) {
    if (!r.row || r.row.optimalLow == null || r.value == null) return null;
    checks.push(r.value < r.row.optimalLow);
  }
  if (when.above != null) {
    if (r.value == null) return null;
    checks.push(r.value > when.above);
  }
  if (when.below != null) {
    if (r.value == null) return null;
    checks.push(r.value < when.below);
  }
  if (when.equals != null)
    checks.push(r.text.trim().toLowerCase() === when.equals.toLowerCase());
  if (when.includes != null) {
    const hay = r.text.toLowerCase();
    checks.push(
      when.includes
        .toLowerCase()
        .split("|")
        .some((needle) => hay.includes(needle)),
    );
  }
  if (!checks.length) return null;
  return checks.every(Boolean);
}

/** Does this prior modifier apply to this person? */
function modifierApplies(
  mod: Hypothesis["priors"]["modifiers"][number],
  m: ModelInput,
  scores: Map<string, number>,
): boolean {
  const { sex, minAge, maxAge, ...input } = mod.when;
  if (sex && m.sex !== sex) return false;
  if (minAge != null && (m.age == null || m.age < minAge)) return false;
  if (maxAge != null && (m.age == null || m.age > maxAge)) return false;
  const keys = input as EvidenceRule["input"] & EvidenceRule["when"];
  if (!keys.metric && !keys.derived && !keys.fact && !keys.event && !keys.hypothesis)
    return true;
  const r = resolve(keys, m, scores);
  if (!r) return false;
  return holds(keys, r) === true;
}

/** The country fact, already stored as ISO-3166 alpha-2 by `saveFact`. */
export const countryOf = (m: ModelInput): string | null => {
  const raw = String(m.profile.country ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) ? raw : null;
};

/**
 * The base rate for this person: the narrowest `hkb_priors` row that fits.
 *
 * Order, as the spec asks for it: (country, sex, age band) → (country, sex) →
 * (no country, sex, age band) → the catalog base. Scored rather than tried
 * four times, so a row that only knows the country still beats one that knows
 * nothing. A row that contradicts the person (wrong country, wrong sex, age
 * outside the band) is never a candidate.
 */
export function priorFor(
  h: Hypothesis,
  m: ModelInput,
): { prevalence: number; source?: string } {
  const country = countryOf(m);
  let best: { band: PriorBand; rank: number } | null = null;
  for (const band of h.priors.bands ?? []) {
    let rank = 0;
    if (band.country != null) {
      if (band.country !== country) continue;
      rank += 8;
    }
    if (band.sex != null) {
      if (band.sex !== m.sex) continue;
      rank += 4;
    }
    if (band.ageMin != null || band.ageMax != null) {
      if (m.age == null) continue;
      if (band.ageMin != null && m.age < band.ageMin) continue;
      if (band.ageMax != null && m.age > band.ageMax) continue;
      rank += 2;
    }
    if (!best || rank > best.rank) best = { band, rank };
  }
  return best
    ? { prevalence: best.band.prevalence, source: best.band.source }
    : { prevalence: h.priors.base, source: h.priors.source };
}

function gateOpen(h: Hypothesis, m: ModelInput): boolean {
  const gate = h.appliesTo;
  if (!gate) return true;
  if (gate.sex && m.sex !== gate.sex) return false;
  if (gate.minAge != null && (m.age == null || m.age < gate.minAge))
    return false;
  if (gate.maxAge != null && (m.age == null || m.age > gate.maxAge))
    return false;
  return true;
}

/**
 * ponytail: hs-CRP above its band tags ferritin as confounded on its own, so
 * "CRP high hides an empty iron store" does not need a human to click it.
 */
function autoTags(m: ModelInput): Record<string, string[]> {
  const crp = m.latest.hs_crp ?? m.latest.crp;
  if (crp?.value == null) return {};
  const limit = crp.optimalHigh ?? crp.refHigh ?? 3;
  return crp.value > limit ? { ferritin: ["acute_illness"] } : {};
}

/** The tag that discounts this marker's draw, if any. */
function confounderFor(
  code: string | undefined,
  rule: EvidenceRule,
  tags: Record<string, string[]>,
): { tag: string; discount: number } | null {
  const markers = rule.confoundedBy ?? (code ? [code] : []);
  for (const marker of markers)
    for (const tag of tags[marker] ?? []) {
      const found = CONFOUNDERS.find(
        (c) => c.tag === tag && c.markers.includes(marker),
      );
      if (found) return { tag, discount: found.discount };
    }
  return null;
}

/** An LR pulled toward 1 by the confounder's discount. */
const discountLr = (lr: number, discount: number) => 1 + (lr - 1) * discount;

function stateFor(p: number, confirmed: boolean): HState {
  if (p < 0.05) return "ruled_out";
  if (p < 0.25) return "unlikely";
  if (p < 0.6) return "possible";
  if (p < 0.9) return "likely";
  return confirmed ? "confirmed" : "likely";
}

export function scoreHypotheses(
  m: ModelInput,
  opts: {
    confounderTags?: Record<string, string[]>;
    lens?: Lens;
    /** the rows out of the database; `HYPOTHESES` when nothing passes one. */
    catalog?: Catalog;
  } = {},
): HypothesisResult[] {
  const lens = opts.lens ?? "lifespan";
  const tags: Record<string, string[]> = { ...autoTags(m) };
  for (const [code, list] of Object.entries(opts.confounderTags ?? {}))
    tags[code] = [...(tags[code] ?? []), ...list];

  const scores = new Map<string, number>();
  const out: HypothesisResult[] = [];

  for (const h of opts.catalog ?? HYPOTHESES) {
    if (!gateOpen(h, m)) continue;
    if (h.requires) {
      const gate = scores.get(h.requires.id);
      if (gate == null || gate < h.requires.minScore) continue;
    }

    const base = priorFor(h, m);
    let prior = base.prevalence;
    for (const mod of h.priors.modifiers)
      if (modifierApplies(mod, m, scores)) prior *= mod.times;
    prior = Math.min(Math.max(prior, 0.001), 0.9);

    let odds = prior / (1 - prior);
    const forList: HypothesisResult["for"] = [];
    const against: HypothesisResult["against"] = [];
    const missing: HypothesisResult["missing"] = [];
    const confounded: HypothesisResult["confounded"] = [];
    const superseded: HypothesisResult["superseded"] = [];
    const positiveCodes = new Set<string>();

    // Pass one: everything that could be read and whose condition decided.
    const fired: {
      rule: EvidenceRule;
      r: Resolved;
      hit: boolean;
      raw: number;
      key: string;
    }[] = [];
    for (const rule of h.evidence) {
      const r = resolve(rule.input, m, scores);
      if (!r) {
        missing.push({
          rule: rule.id,
          input:
            rule.input.metric ??
            rule.input.derived ??
            rule.input.fact ??
            rule.input.event ??
            rule.input.hypothesis ??
            rule.id,
        });
        continue;
      }
      const hit = holds(rule.when, r);
      if (hit == null) {
        missing.push({ rule: rule.id, input: r.label });
        continue;
      }
      const raw = hit ? rule.lr : rule.lrNeg;
      if (raw == null) continue;
      fired.push({ rule, r, hit, raw, key: inputKey(rule.input) });
    }

    // Pass two: one factor per input. Two rules over the same ferritin are two
    // readings of one fact, not two facts, so the strongest one wins and the
    // rest are printed as superseded.
    const byInput = new Map<string, typeof fired>();
    for (const f of fired)
      byInput.set(f.key, [...(byInput.get(f.key) ?? []), f]);

    for (const group of byInput.values()) {
      const winner = group.reduce((best, f) =>
        Math.abs(Math.log(f.raw)) > Math.abs(Math.log(best.raw)) ? f : best,
      );
      for (const loser of group) {
        if (loser === winner) continue;
        superseded.push({
          rule: loser.rule.id,
          input: loser.r.label,
          value: loser.r.text,
          lr: loser.raw,
          grade: loser.rule.grade,
          by: winner.rule.id,
        });
      }

      const { rule, r, hit, raw } = winner;
      const conf = confounderFor(r.code, rule, tags);
      const lr = conf ? discountLr(raw, conf.discount) : raw;
      if (conf) confounded.push({ input: r.label, tag: conf.tag });
      odds *= lr;

      const entry = {
        rule: rule.id,
        input: r.label,
        value: r.text,
        lr: raw,
        grade: rule.grade,
        ...(conf ? { discounted: round2(lr) } : {}),
      };
      if (lr >= 1) {
        forList.push(entry);
        if (hit && r.code) positiveCodes.add(r.code);
      } else against.push(entry);
    }

    // A discriminator whose marker no evidence rule reads still has to move
    // the score once it comes back, or the Simulate button would lie. Nearest
    // typical value wins, which works whichever way round positive is. A
    // marker any evidence rule reads is already scored above, so it is skipped
    // here: one input, one factor, always.
    const readCodes = new Set(
      h.evidence.flatMap((e) => [
        ...(e.input.metric ? [e.input.metric] : []),
        ...(e.input.fact ? (FACT_METRICS[e.input.fact] ?? []) : []),
      ]),
    );
    for (const d of h.discriminators) {
      if (d.repeatable || d.codes.some((c) => readCodes.has(c))) continue;
      if (d.typicalPos == null || d.typicalNeg == null) continue;
      const code = d.codes.find((c) => m.latest[c]?.value != null);
      if (!code) continue;
      const value = m.latest[code]!.value!;
      const positive =
        Math.abs(value - d.typicalPos) <= Math.abs(value - d.typicalNeg);
      const lr = positive ? d.lrPos : d.lrNeg;
      odds *= lr;
      const entry = {
        rule: `discriminator:${d.test}`,
        input: code,
        value: `${value}${d.unit ? ` ${d.unit}` : ""}`,
        lr,
        grade: "B" as Grade,
      };
      if (lr >= 1) {
        forList.push(entry);
        positiveCodes.add(code);
      } else against.push(entry);
    }

    const score = round3(pFromOdds(odds));
    scores.set(h.id, score);

    const confirmAt = h.confirmAtLrPos ?? 10;
    const confirmed = h.discriminators.some(
      (d) => d.lrPos >= confirmAt && d.codes.some((c) => positiveCodes.has(c)),
    );

    const measured = (d: Discriminator) =>
      !d.repeatable && d.codes.every((c) => m.latest[c]?.value != null);

    const nextTests = h.discriminators
      .filter((d) => !measured(d))
      .map((d) => {
        const pPos = pFromOdds(odds * d.lrPos);
        const pNeg = pFromOdds(odds * d.lrNeg);
        const expectedShift =
          Math.abs(pPos - score) * 0.5 + Math.abs(pNeg - score) * 0.5;
        return {
          test: d.test,
          cost: d.cost,
          expectedShift: round3(expectedShift),
          ratio: round3(expectedShift / d.cost),
          howTo: d.howTo,
        };
      })
      .sort((a, b) => b.ratio - a.ratio);

    const weight = h.lenses[lens];
    out.push({
      id: h.id,
      name: h.name,
      prior: round3(prior),
      score,
      state: stateFor(score, confirmed),
      for: forList,
      against,
      missing,
      superseded,
      confounded,
      nextTests,
      lenses: h.lenses,
      lensWeight: weight ? round2(weight.w * GRADE_WEIGHT[weight.grade]) : 0,
      tests: h.discriminators.filter((d) => !measured(d)),
      summary: h.summary,
      management: h.management,
      patternId: h.patternId,
      burdenDaly: h.burdenDaly,
      priorSource: base.source,
      why: h.why,
    });
  }

  return out.sort(
    (a, b) => b.score * b.lensWeight - a.score * a.lensWeight || b.score - a.score,
  );
}
