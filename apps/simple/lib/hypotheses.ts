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
import { slopeText, type Slope } from "./derived";
import { SYMPTOM_KEYS } from "./symptoms";
import { parseBp, type Sex } from "./vectors";

export type Lens = "lifespan" | "energy" | "mood" | "weight";
/**
 * A meta-analysis or guideline, an RCT or large cohort, a small human study, a
 * case report or n-of-1, an animal or in-vitro result. A and B score in full,
 * C is shrunk toward 1, D and E never reach the engine (`loadCatalog` drops
 * them) and live on as horizon ideas.
 */
export type Grade = "A" | "B" | "C" | "D" | "E";
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
    /**
     * Who the cut is for. Three markers are read against a different number in
     * men and in women (ferritin, urate, haematocrit), so the rule is written
     * twice rather than once against the male cut. AND'd with everything else;
     * a rule with a `sex` and a person with no sex answer is missing, not
     * false, because "we do not know" is not "no".
     */
    sex?: Sex;
    /** substring; "a|b" matches either */
    includes?: string;
    status?: "red" | "amber";
    /** outside the sex-adjusted optimal band, so one rule covers both sexes */
    aboveOptimal?: boolean;
    belowOptimal?: boolean;
    /**
     * The direction the marker is moving, in its own unit per year, fitted by
     * least squares over the last five years (`slopePerYear` in
     * `lib/derived.ts`). Needs three readings; without them the rule is
     * missing rather than false. Phase 17, section 4.
     */
    slopePerYear?: { above?: number; below?: number };
  };
  /** likelihood ratio when the condition holds; < 1 argues against. Absent input = no change. */
  lr: number;
  /** likelihood ratio when the input is present and the condition does NOT hold (e.g. a negative antibody argues against). Optional. */
  lrNeg?: number;
  grade: Grade;
  source: string;
  /** markers whose weight is discounted on a confounded draw (see confounders) */
  confoundedBy?: string[];
  /**
   * Markers that measure the same thing. Glucose and HbA1c are two readings of
   * one glycaemia, so multiplying both likelihood ratios in full counts the
   * same fact twice. Set explicitly, or derived from the input by
   * `correlationGroupOf`. Phase 17, section 3.
   */
  correlationGroup?: string;
  /**
   * The papers pooled into `lr`, when this rule came out of `hkb_pool`. Its
   * presence also says the grade shrink is already in the number, so the
   * engine never applies it twice.
   */
  sources?: { id: string; grade: Grade; lrPos: number; source: string }[];
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
  /**
   * Who the test is for at all. A condition's own `appliesTo` gates the
   * condition; this gates one test inside it, which is what "cancer screening
   * is overdue" needs: it applies to everybody past 40 and its mammography
   * does not. Without it the engine offered a 41-year-old man a mammogram.
   */
  appliesTo?: { sex?: Sex; minAge?: number; maxAge?: number };
  /** the answer that has to hold before the test makes sense at all */
  requiresFact?: { fact: string; includes: string };
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
  /** 1 = scored for everyone, 2 = woken for this person only. Phase 17. */
  ring?: number;
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
    markers: [
      "ferritin",
      "hs_crp",
      "crp",
      "albumin",
      "iron",
      "transferrin_saturation",
      "wbc",
    ],
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
    tag: "pregnancy",
    markers: [
      "ferritin",
      "hemoglobin",
      "hematocrit",
      "tsh",
      "free_t4",
      "creatinine",
      "albumin",
      "alp",
      "total_cholesterol",
      "triglycerides",
      "glucose",
    ],
    discount: 0.4,
    why: "Pregnancy moves half the panel by design: plasma volume, thyroid binding, lipids and alkaline phosphatase all shift without any disease.",
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
      source:
        "DeFronzo 2009 Diabetes: fasting insulin above 10 µIU/mL tracks clamp-measured resistance.",
      confoundedBy: ["insulin"],
    },
    {
      id: "ir_homa",
      input: { derived: "homaIr" },
      when: { above: 2 },
      lr: 3,
      grade: "B",
      source:
        "Matthews 1985 Diabetologia (HOMA); cut-off 2 is the common European threshold.",
      confoundedBy: ["glucose", "insulin"],
    },
    {
      id: "ir_tg_hdl_high",
      input: { derived: "tgHdl" },
      when: { above: 2 },
      lr: 2,
      grade: "B",
      source:
        "McLaughlin 2005 Am J Cardiol: TG/HDL above 2 identifies insulin resistance in non-diabetics.",
      confoundedBy: ["triglycerides"],
    },
    {
      id: "ir_tg_hdl_low",
      input: { derived: "tgHdl" },
      when: { below: 1.5 },
      lr: 0.6,
      grade: "B",
      source:
        "McLaughlin 2005 Am J Cardiol: below 1.5 the ratio argues against resistance.",
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
      source:
        "ADA Standards of Care: an HbA1c under 5.4 argues against, but does not exclude, resistance.",
    },
    {
      id: "ir_glucose",
      input: { metric: "glucose" },
      when: { above: 100 },
      lr: 2,
      grade: "A",
      source:
        "ADA Standards of Care: fasting glucose 100–125 mg/dL is impaired fasting glucose.",
      confoundedBy: ["glucose"],
    },
    {
      id: "ir_waist_height",
      input: { fact: "waist_height_ratio" },
      when: { above: 0.5 },
      lr: 2.5,
      lrNeg: 0.6,
      grade: "A",
      source:
        "Ashwell 2012 Obes Rev: waist-to-height above 0.5 beats BMI for cardiometabolic risk. The negative LR of 0.6 is a curated grade C: a waist under half your height does not exclude resistance, but it is the strongest thing against it that a tape measure can say.",
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
      source:
        "Grade C for the size: no published negative LR for a clean family history, but roughly half the population risk sits in the family, so its absence is worth about a fifth of the odds.",
    },
    {
      id: "ir_alt",
      input: { metric: "alt" },
      when: { above: 30 },
      lr: 1.5,
      grade: "B",
      source:
        "Lazo 2011 (NHANES): ALT above 30 travels with liver fat, which travels with insulin resistance.",
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
      howTo:
        "Add it to the next fasting draw; it costs a few euro on top of glucose.",
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
      howTo:
        "75 g glucose, insulin at 0 and 120 minutes. Ask for insulin, not glucose alone.",
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
      howTo:
        "Two weeks of continuous glucose. Useful for learning, not for grading: no outcome data in non-diabetics.",
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
          includes:
            "thyroid|hashimoto|graves|autoimmune|coeliac|celiac|vitiligo|type 1",
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
      source:
        "Hollowell 2002 JCEM (NHANES III): TPO antibodies above the assay limit are the defining marker.",
    },
    {
      id: "hashi_tg",
      input: { metric: "anti_thyroglobulin" },
      when: { above: 115 },
      lr: 5,
      lrNeg: 0.6,
      grade: "A",
      source:
        "Hollowell 2002 JCEM: anti-Tg catches the roughly 10 % who are TPO-negative.",
    },
    {
      id: "hashi_family_negative",
      input: { fact: "family_history" },
      when: {
        includes:
          "thyroid|hashimoto|graves|autoimmune|coeliac|celiac|vitiligo|type 1",
      },
      // Same shape as the insulin-resistance rule: the prior modifier handles
      // the positive answer, this one handles the negative.
      lr: 1,
      lrNeg: 0.8,
      grade: "C",
      source:
        "Grade C for the size: thyroid autoimmunity clusters in families (B), so a family with none of it argues down, but no study puts a number on the negative.",
    },
    {
      id: "hashi_tsh_high",
      input: { metric: "tsh" },
      when: { above: 4.5 },
      lr: 3,
      grade: "A",
      source:
        "Rodondi 2010 JAMA: TSH above 4.5 is subclinical hypothyroidism, most often autoimmune.",
    },
    {
      id: "hashi_tsh_mid",
      input: { metric: "tsh" },
      when: { above: 2.5, below: 4.5 },
      lr: 1.5,
      grade: "B",
      source:
        "Vanderpump 1995 Clin Endocrinol (Whickham 20-year follow-up): risk rises from a TSH of 2.5 up.",
    },
    {
      id: "hashi_ft4_low",
      input: { metric: "free_t4" },
      when: { below: 0.9 },
      lr: 2,
      grade: "A",
      source:
        "ATA 2014 hypothyroidism guideline: free T4 under about 0.9 ng/dL with a high TSH is overt failure.",
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
      howTo:
        "One extra tube on the next thyroid draw. It never needs repeating once positive.",
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
      howTo:
        "1 for a heterogeneous, hypoechoic gland, 0 for a normal one. Also baselines nodules.",
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
      howTo:
        "Progression runs 2–5 % per year while antibody-positive, so a second TSH is the cheapest test there is.",
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
    // The four ferritin cuts below carry no `when.sex` on purpose. Ferritin is
    // read against a different number in men and in women when the question is
    // iron *overload* (EASL 2022: 300 vs 200), but the deficiency cuts are the
    // same for everybody: WHO 2020 (Serum ferritin concentrations for the
    // assessment of iron status) puts depleted stores at 15 µg/L in every adult
    // and 30 is the ruling-in cut Guyatt 1992 pooled over both sexes.
    {
      id: "iron_ferritin_30",
      input: { metric: "ferritin" },
      when: { below: 30 },
      lr: 20,
      grade: "A",
      source:
        "Guyatt 1992 J Gen Intern Med: ferritin under 30 ng/mL has an LR near 20 for absent marrow iron.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "iron_ferritin_15",
      input: { metric: "ferritin" },
      when: { below: 15 },
      lr: 50,
      grade: "A",
      source:
        "Guyatt 1992 J Gen Intern Med: ferritin under 15 ng/mL has an LR near 50. It supersedes the under-30 rule rather than stacking on it.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "iron_ferritin_100",
      input: { metric: "ferritin" },
      when: { above: 100 },
      lr: 0.08,
      grade: "A",
      source:
        "Guyatt 1992 J Gen Intern Med (meta-analysis of ferritin against marrow iron): a ferritin over 100 ng/mL has an LR near 0.08 for absent stores. Mast 1998 Clin Chem confirms the same direction in an unselected series. Without this the engine has only one side of the ferritin test and will not order it.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "iron_ferritin_45_100",
      input: { metric: "ferritin" },
      when: { above: 45, below: 100 },
      lr: 0.25,
      grade: "A",
      source:
        "Guyatt 1992 J Gen Intern Med: the 45-100 ng/mL band carries an LR near 0.25 for absent marrow iron. Mast 1998 Clin Chem puts the same band between 0.2 and 0.3.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "iron_tsat",
      input: { metric: "transferrin_saturation" },
      when: { below: 20 },
      lr: 3,
      grade: "A",
      source:
        "BSG iron deficiency guideline: transferrin saturation under 20 % means iron is not reaching the marrow.",
      confoundedBy: ["transferrin_saturation"],
    },
    {
      id: "iron_mcv",
      input: { metric: "mcv" },
      when: { below: 80 },
      lr: 2,
      grade: "A",
      source:
        "BSG iron deficiency guideline: microcytosis is the late red-cell consequence.",
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
      howTo:
        "Draw it with a CRP: inflammation lifts ferritin and hides an empty store.",
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
      howTo:
        "Separates empty stores from inflammation hiding them, and it responds first when iron is working.",
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
      howTo:
        "Grade C for the LRs here: small diagnostic series only, but it is the one marker CRP does not move.",
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
      source:
        "Hudak 2017 Helicobacter (meta-analysis): H. pylori associates with iron deficiency. 1 = positive, 0 = negative.",
    },
    {
      id: "gi_coeliac",
      input: { metric: "ttg_iga" },
      when: { above: 10 },
      lr: 8,
      grade: "A",
      source:
        "BSG coeliac guideline: tTG-IgA above 10 RU/mL, read with a total IgA, is close to diagnostic.",
    },
    {
      id: "gi_parietal",
      input: { metric: "parietal_cell_antibodies" },
      when: { above: 0.5 },
      lr: 8,
      grade: "B",
      source:
        "Lahner 2009 World J Gastroenterol: parietal-cell or intrinsic-factor antibodies mark atrophic gastritis. 1 = positive.",
    },
    {
      id: "gi_b12_low",
      input: { metric: "vitamin_b12" },
      when: { below: 300 },
      lr: 2,
      grade: "B",
      source:
        "Lahner 2009: low B12 alongside low ferritin points at the stomach rather than the diet.",
    },
    {
      id: "gi_gastrin",
      input: { metric: "gastrin" },
      when: { above: 100 },
      lr: 5,
      grade: "B",
      source:
        "Lahner 2009: high gastrin with a low pepsinogen I is the serological picture of atrophic gastritis.",
    },
    {
      id: "gi_fobt",
      input: { metric: "fobt" },
      when: { above: 0.5 },
      lr: 6,
      grade: "A",
      source:
        "USPSTF 2021 colorectal screening: a positive faecal immunochemical test needs a scope. 1 = positive.",
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
      howTo:
        "Must be taken while still eating gluten, and the total IgA rules out a false negative.",
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
      howTo:
        "The test that both looks and biopsies. It ends the question; it is also the only invasive one here.",
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
      // Phase 21: this was `pcos_cycles` reading a `cycle_regularity` nobody
      // asks and nobody stores, so one of the three Rotterdam criteria could
      // never fire, while `lib/hkb-catalog.ts` patched in a second rule over
      // the answer the interview does write. One rule now, here, with the
      // patch's numbers, so the fallback catalog and the database agree.
      id: "pcos_cycle_irregular",
      input: { fact: "sym_cycle" },
      when: { includes: "irregular|absent" },
      lr: 5,
      lrNeg: 0.3,
      grade: "A",
      source:
        "Rotterdam 2004 / Teede 2023: oligo-anovulation is one of the three diagnostic criteria, and regular cycles make the diagnosis very unlikely.",
    },
    {
      id: "pcos_hirsutism",
      input: { fact: "hirsutism_acne" },
      when: { equals: "Yes" },
      lr: 3,
      lrNeg: 0.6,
      grade: "A",
      source:
        "Rotterdam 2003 criteria: clinical hyperandrogenism counts the same as a biochemical one. The negative LR of 0.6 is a curated grade C: no hair and no acne removes the commonest presenting feature.",
    },
    {
      id: "pcos_lh_fsh",
      input: { fact: "lh_fsh_ratio" },
      when: { above: 2 },
      lr: 2,
      grade: "B",
      source:
        "Balen 1995 Hum Reprod: an LH/FSH ratio above 2 is common in PCOS but absent in a third of cases.",
      confoundedBy: ["lh", "fsh"],
    },
    {
      id: "pcos_testosterone",
      input: { metric: "testosterone" },
      when: { aboveOptimal: true },
      lr: 4,
      grade: "A",
      source:
        "Rotterdam 2003 criteria: biochemical hyperandrogenism; the band here is already sex-adjusted.",
      confoundedBy: ["testosterone"],
    },
    {
      id: "pcos_shbg",
      input: { metric: "shbg" },
      when: { below: 30 },
      lr: 1.5,
      grade: "B",
      source:
        "Deswal 2018 J Hum Reprod Sci: low SHBG raises free androgen and travels with insulin resistance.",
    },
    {
      id: "pcos_insulin",
      input: { metric: "insulin" },
      when: { above: 10 },
      lr: 1.5,
      grade: "B",
      source:
        "Diamanti-Kandarakis 2012 Endocr Rev: insulin resistance is present in most, but not all, PCOS.",
      confoundedBy: ["insulin"],
    },
    {
      id: "pcos_amh",
      input: { metric: "amh" },
      when: { above: 5 },
      lr: 3,
      grade: "B",
      source:
        "Iliodromiti 2013 JCEM: AMH above about 5 ng/mL stands in for the follicle count.",
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
      howTo:
        "1 for 20 or more follicles or a raised ovarian volume. With two Rotterdam criteria already met, this settles it.",
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
      source:
        "Chung 2016 Chest (STOP-Bang): habitual loud snoring is the single strongest question.",
    },
    {
      id: "osa_no_snoring",
      input: { fact: "sleep_snoring" },
      when: { equals: "no" },
      lr: 0.4,
      grade: "C",
      source:
        "Grade C for the size: STOP-Bang has no published negative LR per item, but a firm no to habitual snoring is the single most useful thing anyone says against OSA.",
    },
    {
      id: "osa_sleepiness",
      // Phase 21: this read a `daytime_sleepiness` nobody ever wrote, while
      // `lib/hkb-catalog.ts` patched in a second rule with the same id over
      // `sym_sleepiness`, which is what the interview and the composer write.
      // One rule now, here, so both catalogs say the same thing.
      input: { fact: "sym_sleepiness" },
      when: { equals: "Yes" },
      lr: 2,
      lrNeg: 0.6,
      grade: "A",
      source:
        "Chung 2016 Chest (STOP-Bang): daytime tiredness is the second question in the score. The negative LR of 0.6 is a curated grade C: STOP-Bang publishes no per-item negative, but sleeping well through the day is real evidence against.",
    },
    {
      id: "osa_bmi",
      input: { metric: "bmi" },
      when: { above: 30 },
      lr: 3,
      grade: "A",
      source:
        "Peppard 2013 Am J Epidemiol (Wisconsin cohort): BMI is the dominant risk factor.",
    },
    {
      id: "osa_neck",
      input: { fact: "neck_cm" },
      when: { above: 43 },
      lr: 2,
      grade: "C",
      source:
        "Grade C: a neck over 43 cm is a STOP-Bang item, but it is strongly correlated with BMI, so it carries less once BMI is already counted.",
    },
    {
      id: "osa_bp",
      input: { fact: "bp_systolic" },
      when: { above: 135 },
      lr: 2,
      grade: "A",
      source:
        "Marin 2005 Lancet: OSA and hypertension travel together; resistant hypertension is a red flag.",
      confoundedBy: ["bp_systolic"],
    },
    {
      id: "osa_hematocrit",
      input: { metric: "hematocrit" },
      when: { above: 49, sex: "male" },
      lr: 1.5,
      grade: "B",
      source:
        "Nocturnal hypoxia raises erythropoietin; a high haematocrit with no other cause is a hint. WHO 2016 polycythaemia thresholds (Arber 2016 Blood): haematocrit 49 % in men and 48 % in women mark absolute erythrocytosis.",
      confoundedBy: ["hematocrit"],
    },
    {
      id: "osa_hematocrit_female",
      input: { metric: "hematocrit" },
      when: { above: 48, sex: "female" },
      lr: 1.5,
      grade: "B",
      source:
        "Nocturnal hypoxia raises erythropoietin; a high haematocrit with no other cause is a hint. WHO 2016 polycythaemia thresholds (Arber 2016 Blood): haematocrit 49 % in men and 48 % in women mark absolute erythrocytosis.",
      confoundedBy: ["hematocrit"],
    },
    {
      id: "osa_resting_hr",
      input: { fact: "resting_hr" },
      when: { above: 75 },
      lr: 1.3,
      grade: "C",
      source:
        "Grade C: a raised sleeping heart rate on a wearable tracks sympathetic drive; suggestive, never diagnostic.",
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
      howTo:
        "Eight yes/no questions, two minutes, free. Three or more is a positive screen.",
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
      howTo:
        "One night with a home kit gives the apnoea-hypopnoea index. Five or more with symptoms is a diagnosis.",
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
      source:
        "Prati 2002 Ann Intern Med: the true upper limit is about 30 U/L in men and 20 in women; the band here is already sex-adjusted. The negative LR of 0.7 is a curated grade C: a normal ALT does not exclude steatosis.",
      confoundedBy: ["alt"],
    },
    {
      id: "nafld_waist_normal",
      input: { fact: "waist_height_ratio" },
      when: { below: 0.5 },
      lr: 0.6,
      grade: "C",
      source:
        "Grade C for the size: central adiposity is the dominant clinical predictor, so its absence is the strongest thing against fatty liver short of imaging.",
    },
    {
      id: "nafld_ggt",
      input: { metric: "ggt" },
      when: { aboveOptimal: true },
      lr: 2,
      grade: "B",
      source:
        "Lazo 2011 (NHANES): GGT above the optimal band tracks liver fat and alcohol together.",
      confoundedBy: ["ggt"],
    },
    {
      id: "nafld_tg",
      input: { metric: "triglycerides" },
      when: { above: 150 },
      lr: 1.5,
      grade: "B",
      source:
        "EASL-EASD-EASO 2016 NAFLD guideline: hypertriglyceridaemia is part of the metabolic picture.",
      confoundedBy: ["triglycerides"],
    },
    {
      id: "nafld_waist",
      input: { fact: "waist_height_ratio" },
      when: { above: 0.5 },
      lr: 2,
      grade: "A",
      source:
        "EASL-EASD-EASO 2016: central adiposity is the strongest clinical predictor of liver fat.",
    },
    {
      id: "nafld_ir",
      input: { hypothesis: "insulin_resistance" },
      when: { above: 0.6 },
      lr: 2,
      grade: "B",
      source:
        "EASL-EASD-EASO 2016: insulin resistance is the mechanism; the app scores it separately above.",
    },
    {
      id: "nafld_fib4",
      input: { derived: "fib4" },
      when: { above: 1.3 },
      lr: 3,
      grade: "A",
      source:
        "Sterling 2006 Hepatology: FIB-4 above 1.3 is the guideline trigger to look for fibrosis, not just fat.",
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
      howTo:
        "1 for a bright liver, 0 for a normal one. Cheap and everywhere, but it misses mild steatosis.",
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
      howTo:
        "Elastography measures stiffness, which is the number that decides whether this matters.",
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
          includes:
            "metformin|omeprazole|pantoprazole|esomeprazole|lansoprazole|ppi",
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
      source:
        "Stabler 2013 NEJM: under 200 pg/mL is deficient in almost everyone.",
    },
    {
      id: "b12_borderline",
      input: { metric: "vitamin_b12" },
      when: { above: 200, below: 300 },
      lr: 2,
      grade: "B",
      source:
        "Stabler 2013 NEJM: 200–300 pg/mL is the grey zone where MMA decides.",
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
      source:
        "Grade C for the size: B12 comes only from animal foods or supplements (A), so an omnivore diet is the commonest reason a B12 is fine. No study puts a number on it.",
    },
    {
      id: "b12_mcv",
      input: { metric: "mcv" },
      when: { above: 100 },
      lr: 3,
      grade: "A",
      source:
        "Stabler 2013 NEJM: macrocytosis is the classic, and late, blood sign.",
    },
    {
      id: "b12_homocysteine",
      input: { metric: "homocysteine" },
      when: { above: 12 },
      lr: 3,
      grade: "B",
      source:
        "Stabler 2013 NEJM: homocysteine rises in B12 and folate deficiency both.",
    },
    {
      id: "b12_tingling",
      input: { fact: "sym_tingling" },
      when: { equals: "Yes" },
      lr: 3,
      lrNeg: 0.8,
      grade: "C",
      source:
        "Stabler 2013 NEJM: paraesthesiae are the commonest neurological presentation of B12 deficiency and can precede the anaemia by years. Grade C: pins and needles have many causes, so 3 is the order of the contrast rather than a measured ratio.",
    },
    {
      id: "b12_mma",
      input: { metric: "methylmalonic_acid" },
      when: { above: 0.4 },
      lr: 8,
      grade: "A",
      source:
        "Stabler 2013 NEJM: methylmalonic acid rises only in B12 deficiency, which is why it settles the grey zone.",
    },
    {
      id: "b12_parietal",
      input: { metric: "parietal_cell_antibodies" },
      when: { above: 0.5 },
      lr: 5,
      grade: "B",
      source:
        "Lahner 2009 World J Gastroenterol: parietal-cell antibodies mark the pernicious-anaemia route. 1 = positive.",
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
      howTo:
        "The test that decides a borderline B12. Kidney failure raises it too, so read it with creatinine.",
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
      howTo:
        "Grade C for the LRs here: the active fraction performs like MMA in small series, and not every lab runs it.",
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

/**
 * A test can only be worth ordering when the engine knows what a normal result
 * would mean. Where a discriminator carries an `lrNeg` and the one evidence
 * rule that reads its marker carries only an `lr`, the test's own negative
 * ratio becomes that rule's `lrNeg`, so `outcomeProbs` sees both branches.
 *
 * Only markers with exactly one rule are touched. Two rules on one marker
 * (`tsh above 4.5` and `tsh 2.5-4.5`) already describe the region between
 * them, and adding a third opinion there would let a normal TSH out-shout the
 * band rule that was written for it.
 */
export function withNegatives(catalog: Catalog): Catalog {
  return catalog.map((h) => {
    // A trend rule is about the direction, not about the level, so it is not
    // the "second opinion" that makes a marker ambiguous.
    const rulesOn = (code: string) =>
      h.evidence.filter((e) => e.input.metric === code && !e.when.slopePerYear);
    const patch = new Map<string, number>();
    for (const d of h.discriminators) {
      if (d.lrNeg == null || d.lrNeg >= 1) continue;
      for (const code of d.codes) {
        const rules = rulesOn(code);
        if (rules.length !== 1) continue;
        const rule = rules[0]!;
        if (rule.lrNeg != null || rule.lr <= 1) continue;
        if (rule.when.slopePerYear) continue; // no slope is not a flat slope
        patch.set(rule.id, Math.min(d.lrNeg, patch.get(rule.id) ?? 1));
      }
    }
    if (!patch.size) return h;
    return {
      ...h,
      evidence: h.evidence.map((e) =>
        patch.has(e.id) ? { ...e, lrNeg: patch.get(e.id)! } : e,
      ),
    };
  });
}

export const HYPOTHESES: Hypothesis[] = withNegatives([
  INSULIN_RESISTANCE,
  HASHIMOTO,
  IRON_DEFICIENCY,
  IRON_DEFICIENCY_CAUSE_GI,
  PCOS,
  SLEEP_APNOEA,
  NAFLD,
  B12_DEFICIENCY,
]);

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
  /**
   * Rules that held and were counted at less than their stated strength
   * because a stronger rule in the same correlation group already spoke for
   * that marker. The card prints it the way it prints `superseded`.
   */
  correlated: {
    rule: string;
    input: string;
    group: string;
    lr: number;
    counted: number;
    /** the rule in the group that counted in full */
    with: string;
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
const GRADE_WEIGHT: Record<Grade, number> = {
  A: 1,
  B: 0.75,
  C: 0.5,
  D: 0.25,
  E: 0.1,
};

/**
 * The exponent a grade puts on a likelihood ratio before it multiplies the
 * odds. A and B count in full; C is `lr^0.5`, which pulls 20 down to 4.5 and
 * 0.2 up to 0.45 — toward 1 from either side. D and E are not here because
 * they never reach the engine at all.
 */
export const GRADE_SHRINK: Partial<Record<Grade, number>> = { C: 0.5 };

/** The likelihood ratio the engine actually multiplies by. */
export const effectiveLr = (lr: number, rule: EvidenceRule): number =>
  rule.sources ? lr : lr ** (GRADE_SHRINK[rule.grade] ?? 1);

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * A probability, rounded for printing. Three decimals down to 0.001, and three
 * significant figures under it: ring 2 put ten thousand diseases in the engine
 * whose honest answer is 0.000003 %, and rounding those to a flat 0 would make
 * the one that is a thousand times likelier than the rest look identical.
 */
const roundP = (v: number) =>
  v >= 0.001 ? round3(v) : Number(v.toPrecision(3));

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

/**
 * The facts `syntheticFact` computes rather than anybody answering them. The
 * catalog sanity suite reads this to tell a computed fact from an orphan one.
 */
export const SYNTHETIC_FACTS = new Set(Object.keys(FACT_METRICS));

interface Resolved {
  label: string;
  value: number | null;
  text: string;
  row?: LatestValue;
  /** the trend, when the input is a derived number rather than a marker */
  slope?: Slope;
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
    return {
      label: input.derived,
      value,
      text: String(value),
      slope: m.slopes?.[input.derived],
    };
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

/**
 * One string per thing a rule can read, so two rules over the same marker land
 * in the same group and only the strongest of them scores.
 *
 * A slope rule is a separate key. "TSH is 3.4" and "TSH has climbed 0.8 a year
 * for three years" are two facts about one marker, not two readings of one
 * fact, so neither supersedes the other. They are still correlated, and the
 * correlation guard handles that: both sit in `thyroid_axis`, so the weaker of
 * the two is counted at `lr ** CORR_DAMP`.
 */
function inputKey(rule: EvidenceRule): string {
  const input = rule.input;
  const trend = rule.when.slopePerYear ? ":slope" : "";
  if (input.metric) return `metric:${input.metric}${trend}`;
  if (input.derived) return `derived:${input.derived}${trend}`;
  if (input.hypothesis) return `hypothesis:${input.hypothesis}${trend}`;
  if (input.event) return `event:${input.event}${trend}`;
  return `fact:${input.fact}${trend}`;
}

/** Does the condition hold? `null` when the input cannot answer the question. */
function holds(
  when: EvidenceRule["when"],
  r: Resolved,
  sex?: Sex | null,
): boolean | null {
  const checks: boolean[] = [];
  if (when.sex != null) {
    // A cut written for men says nothing about a person whose sex we have not
    // been told, so it is missing rather than false.
    if (sex == null) return null;
    checks.push(sex === when.sex);
  }
  if (when.slopePerYear != null) {
    const slope = r.row?.slope ?? r.slope;
    // No slope is not a flat slope: three draws over five years is the price
    // of having an opinion about a direction.
    if (!slope) return null;
    const { above, below } = when.slopePerYear;
    if (above != null) checks.push(slope.perYear > above);
    if (below != null) checks.push(slope.perYear < below);
  }
  if (when.status != null) {
    if (!r.row) return null;
    // A marker with no reference range and no optimal band has status "gray",
    // which means "nobody said", not "in range". Scoring it as a negative is
    // how a tTG of 68 with no printed range used to argue against coeliac
    // disease. Unknown goes to `missing`.
    if (r.row.status === "gray") return null;
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
  if (
    !keys.metric &&
    !keys.derived &&
    !keys.fact &&
    !keys.event &&
    !keys.hypothesis
  )
    return true;
  const r = resolve(keys, m, scores);
  if (!r) return false;
  return holds(keys, r) === true;
}

/** The country fact, already stored as ISO-3166 alpha-2 by `saveFact`. */
export const countryOf = (m: ModelInput): string | null => {
  const raw = String(m.profile.country ?? "")
    .trim()
    .toUpperCase();
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
  return openFor(h.appliesTo, m);
}

/** sex, and the age band, the way every gate in the app reads them. */
function openFor(
  gate: { sex?: Sex; minAge?: number; maxAge?: number } | undefined,
  m: ModelInput,
): boolean {
  if (!gate) return true;
  if (gate.sex && m.sex !== gate.sex) return false;
  if (gate.minAge != null && (m.age == null || m.age < gate.minAge))
    return false;
  if (gate.maxAge != null && (m.age == null || m.age > gate.maxAge))
    return false;
  return true;
}

/**
 * Is this test on the table for this person at all?
 *
 * The one gate every consumer uses: `nextTests` and the Simulate list here,
 * the move list in `lib/infogain.ts`, and through it the tree, the journeys
 * and `/brain`. A condition can apply to somebody while one of its tests does
 * not — "cancer screening is overdue" is true of every 41-year-old and its
 * mammography is not — and `requiresFact` covers the other half: low-dose CT
 * only means anything to somebody who has smoked.
 */
export function discriminatorApplies(d: Discriminator, m: ModelInput): boolean {
  if (!openFor(d.appliesTo, m)) return false;
  const need = d.requiresFact;
  if (!need) return true;
  const text = factText(m, need.fact);
  if (text == null) return false;
  const hay = text.toLowerCase();
  return need.includes
    .toLowerCase()
    .split("|")
    .some((needle) => hay.includes(needle));
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

/* ── correlation guards (phase 17, section 3) ─────────────────────────── */

/**
 * Markers that measure the same underlying thing, by the name of the thing.
 *
 * Bayes with likelihood ratios assumes the pieces of evidence are conditionally
 * independent. Glucose, HbA1c and fasting insulin are not: they are three
 * windows on one glycaemia, and multiplying all three in full counts one fact
 * three times. Every group here is a panel a laboratory prints together for
 * exactly that reason.
 *
 * The keys are metric codes and `derived` keys, which is everything a rule can
 * read that is a measurement. Symptoms are grouped separately, in
 * `correlationGroupOf`: see `SYMPTOM_GROUP`.
 */
export const CORRELATION_GROUPS: Record<string, string> = {
  // one glycaemia, read four ways
  glucose: "glycaemia",
  hba1c: "glycaemia",
  insulin: "glycaemia",
  homaIr: "glycaemia",
  homa_ir: "glycaemia",
  tgHdl: "glycaemia",
  triglyceride_hdl_ratio: "glycaemia",
  ogtt_insulin_120: "glycaemia",
  // one iron store
  ferritin: "iron_panel",
  transferrin_saturation: "iron_panel",
  iron: "iron_panel",
  tibc: "iron_panel",
  mcv: "iron_panel",
  rdw: "iron_panel",
  rdw_cv: "iron_panel",
  // one apoB-carrying particle count
  ldl_cholesterol: "lipid_panel",
  non_hdl_cholesterol: "lipid_panel",
  nonHdl: "lipid_panel",
  apolipoprotein_b: "lipid_panel",
  total_cholesterol: "lipid_panel",
  // one thyroid axis
  tsh: "thyroid_axis",
  free_t4: "thyroid_axis",
  free_t3: "thyroid_axis",
  // one blood pressure
  bp_systolic: "bp",
  bp_diastolic: "bp",
  // one apoB-to-LDL discordance, which is its own fact and not a second
  // reading of the panel: the whole point of it is that it disagrees.
  apobLdl: "apob_discordance",
  // one liver
  alt: "liver_enzymes",
  ast: "liver_enzymes",
  ggt: "liver_enzymes",
  fib4: "liver_enzymes",
};

/**
 * The exponent every rule in a group after the strongest one is raised to.
 * `lr ** 0.3` turns an LR of 4 into 1.5 and an LR of 0.5 into 0.81: the second
 * reading of the same fact still counts, at about a third of its weight in log
 * space, which is the honest thing to do with a measurement you already partly
 * had.
 */
export const CORR_DAMP = 0.3;

/**
 * Every symptom and interview answer of one condition is one group.
 *
 * They are not independent facts. Feeling cold, being tired, dry skin and
 * constipation are four ways of saying the same thing, and multiplying four
 * likelihood ratios of 1.4 to 2.3 took hypothyroidism to 89 % for a woman with
 * a normal free T4 and a TSH of 3.9. Grouping them damps every one after the
 * strongest, and `SYMPTOM_LR_CAP` puts a ceiling on what the whole interview
 * can do to one condition: six-fold, either way, however many boxes are
 * ticked. A measurement is unaffected.
 */
export const SYMPTOM_GROUP = "symptoms";
export const SYMPTOM_LR_CAP = 6;

/**
 * The ceiling on the product of a condition's prior modifiers. Sex, age band
 * and family history overlap heavily with each other and with the base rate
 * they multiply, so six-fold is as far as "before we measured anything" is
 * allowed to travel.
 */
export const PRIOR_MODIFIER_CAP = 6;

/**
 * The most a base rate is allowed to be before anything is measured.
 *
 * A prior is what is true of people like this person, not of this person. A
 * modified prior of 0.9 (insulin resistance for a 45-year-old man with a waist
 * and a diabetic father) makes the condition unfalsifiable: a normal HbA1c and
 * a normal insulin together could not bring it under "likely". Half is as far
 * as a base rate goes; everything above that has to be measured.
 */
export const PRIOR_CEILING = 0.5;

/**
 * The group a rule's input belongs to, when it belongs to one.
 *
 * Facts are looked up too, because three of them are measurements wearing a
 * fact's clothes: `bp_systolic` is a home reading, and `lh_fsh_ratio` is two
 * markers divided. A fact that is genuinely an answer (`sym_energy`,
 * `family_history`) is not in the table and stays ungrouped.
 */
export const correlationGroupOf = (
  input: EvidenceRule["input"],
): string | undefined => {
  if (input.metric) return CORRELATION_GROUPS[input.metric];
  if (input.derived) return CORRELATION_GROUPS[input.derived];
  if (!input.fact) return undefined;
  const named = CORRELATION_GROUPS[input.fact];
  if (named) return named;
  return input.fact.startsWith("sym_") || SYMPTOM_KEYS.has(input.fact)
    ? SYMPTOM_GROUP
    : undefined;
};

/**
 * The floor a prior is clamped to. It used to be 0.001, which was harmless
 * while every condition was a common one; ring 2 made it wrong, because it
 * started a one-in-ten-million syndrome at the same 0.1 % as type 2 diabetes
 * and threw away the only thing that keeps rare diseases in their place. One
 * order of magnitude under the ultra-rare class (1e-7) is the new floor.
 */
export const MIN_PRIOR = 1e-8;

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
    let modifier = 1;
    for (const mod of h.priors.modifiers)
      if (modifierApplies(mod, m, scores)) modifier *= mod.times;
    // The same ceiling as the interview, for the same reason. Being a woman
    // (x4) whose mother had a thyroid (x3) took the *prior* for hypothyroidism
    // to 60 % before anything at all was measured, and one dry-skin answer
    // then made it likely. The base rate already counts most of that overlap.
    modifier = Math.min(
      Math.max(modifier, 1 / PRIOR_MODIFIER_CAP),
      PRIOR_MODIFIER_CAP,
    );
    // The ceiling applies to what the modifiers did, not to what the epidemiology
    // says: a published prevalence stays whatever it was measured to be.
    const prior = Math.min(
      Math.max(base.prevalence * modifier, MIN_PRIOR),
      Math.max(base.prevalence, PRIOR_CEILING),
    );

    let odds = prior / (1 - prior);
    const forList: HypothesisResult["for"] = [];
    const against: HypothesisResult["against"] = [];
    const missing: HypothesisResult["missing"] = [];
    const confounded: HypothesisResult["confounded"] = [];
    const superseded: HypothesisResult["superseded"] = [];
    const correlated: HypothesisResult["correlated"] = [];
    const positiveCodes = new Set<string>();

    // Pass one: everything that could be read and whose condition decided.
    const fired: {
      rule: EvidenceRule;
      r: Resolved;
      hit: boolean;
      /** the number the paper printed, for the card */
      stated: number;
      /** the same number after the grade shrink, for the arithmetic */
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
      const hit = holds(rule.when, r, m.sex);
      if (hit == null) {
        missing.push({ rule: rule.id, input: r.label });
        continue;
      }
      const stated = hit ? rule.lr : rule.lrNeg;
      if (stated == null) continue;
      fired.push({
        rule,
        r,
        hit,
        stated,
        raw: effectiveLr(stated, rule),
        key: inputKey(rule),
      });
    }

    // Pass two: one factor per input. Two rules over the same ferritin are two
    // readings of one fact, not two facts, so the strongest one wins and the
    // rest are printed as superseded.
    const byInput = new Map<string, typeof fired>();
    for (const f of fired)
      byInput.set(f.key, [...(byInput.get(f.key) ?? []), f]);

    /**
     * One factor: a rule (or a discriminator) that already won its own input
     * and is about to multiply the odds. Collected rather than multiplied
     * straight away, because the correlation guard needs to see the whole set
     * before it knows which member of a group is the strongest.
     */
    interface Factor {
      rule: string;
      input: string;
      value: string;
      /** the number the paper printed, for the card */
      stated: number;
      grade: Grade;
      /** what will actually multiply the odds */
      lr: number;
      group?: string;
      positive: boolean;
      code?: string;
    }
    const factors: Factor[] = [];

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
          lr: loser.stated,
          grade: loser.rule.grade,
          by: winner.rule.id,
        });
      }

      const { rule, r, hit, raw, stated } = winner;
      const conf = confounderFor(r.code, rule, tags);
      const lr = conf ? discountLr(raw, conf.discount) : raw;
      if (conf) confounded.push({ input: r.label, tag: conf.tag });
      factors.push({
        rule: rule.id,
        input: r.label,
        // A slope rule is about the direction, so the card prints the
        // direction: "rising: +0.8 mIU/L/yr over 3 years (4 draws)".
        value: (() => {
          const slope = r.row?.slope ?? r.slope;
          return rule.when.slopePerYear && slope
            ? slopeText(slope, r.row?.unit)
            : r.text;
        })(),
        stated,
        grade: rule.grade,
        lr,
        group: rule.correlationGroup ?? correlationGroupOf(rule.input),
        positive: hit,
        code: r.code,
      });
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
    const myTests = h.discriminators.filter((d) => discriminatorApplies(d, m));
    for (const d of myTests) {
      if (d.repeatable || d.codes.some((c) => readCodes.has(c))) continue;
      if (d.typicalPos == null || d.typicalNeg == null) continue;
      const code = d.codes.find((c) => m.latest[c]?.value != null);
      if (!code) continue;
      const value = m.latest[code]!.value!;
      const positive =
        Math.abs(value - d.typicalPos) <= Math.abs(value - d.typicalNeg);
      const lr = positive ? d.lrPos : d.lrNeg;
      factors.push({
        rule: `discriminator:${d.test}`,
        input: code,
        value: `${value}${d.unit ? ` ${d.unit}` : ""}`,
        stated: lr,
        grade: "B",
        lr,
        group: CORRELATION_GROUPS[code],
        positive: true,
        code,
      });
    }

    // The correlation guard. Glucose and HbA1c are two readings of one
    // glycaemia, so the strongest member of a group counts in full and every
    // other one counts at `lr ** CORR_DAMP`, which pulls it toward 1 without
    // silencing it. Two different groups still multiply unchanged: that is
    // what makes them different groups.
    const inGroups = new Map<string, Factor[]>();
    for (const f of factors)
      if (f.group) inGroups.set(f.group, [...(inGroups.get(f.group) ?? []), f]);
    for (const [group, members] of inGroups) {
      if (members.length < 2) continue;
      const strongest = members.reduce((best, f) =>
        Math.abs(Math.log(f.lr)) > Math.abs(Math.log(best.lr)) ? f : best,
      );
      for (const f of members) {
        if (f === strongest) continue;
        const damped = f.lr ** CORR_DAMP;
        correlated.push({
          rule: f.rule,
          input: f.input,
          group,
          lr: round2(f.lr),
          counted: round2(damped),
          with: strongest.rule,
        });
        f.lr = damped;
      }
    }

    // The ceiling on the interview. Once the symptom group has been damped,
    // whatever it still multiplies to is pulled back to `SYMPTOM_LR_CAP` in
    // log space, which keeps the direction and the ordering and drops the
    // magnitude. Labs and genome calls are not in this group and are untouched.
    const symptoms = inGroups.get(SYMPTOM_GROUP) ?? [];
    const product = symptoms.reduce((total, f) => total * f.lr, 1);
    const ceiling =
      product > SYMPTOM_LR_CAP
        ? SYMPTOM_LR_CAP
        : product < 1 / SYMPTOM_LR_CAP
          ? 1 / SYMPTOM_LR_CAP
          : null;
    if (ceiling != null && product > 0 && product !== 1) {
      const k = Math.log(ceiling) / Math.log(product);
      for (const f of symptoms) {
        const capped = f.lr ** k;
        correlated.push({
          rule: f.rule,
          input: f.input,
          group: SYMPTOM_GROUP,
          lr: round2(f.lr),
          counted: round2(capped),
          with: `the interview cap of ${SYMPTOM_LR_CAP}x`,
        });
        f.lr = capped;
      }
    }

    for (const f of factors) {
      odds *= f.lr;
      const entry = {
        rule: f.rule,
        input: f.input,
        value: f.value,
        lr: f.stated,
        grade: f.grade,
        // the grade shrink, the confounder discount and the correlation damp
        // all land here, so the card can print "3.8, counted as 1.9"
        ...(round2(f.lr) !== round2(f.stated)
          ? { discounted: round2(f.lr) }
          : {}),
      };
      if (f.lr >= 1) {
        forList.push(entry);
        if (f.positive && f.code) positiveCodes.add(f.code);
      } else against.push(entry);
    }

    const score = roundP(pFromOdds(odds));
    scores.set(h.id, score);

    const confirmAt = h.confirmAtLrPos ?? 10;
    const confirmed = myTests.some(
      (d) => d.lrPos >= confirmAt && d.codes.some((c) => positiveCodes.has(c)),
    );

    const measured = (d: Discriminator) =>
      !d.repeatable && d.codes.every((c) => m.latest[c]?.value != null);

    const nextTests = myTests
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
      prior: roundP(prior),
      score,
      state: stateFor(score, confirmed),
      for: forList,
      against,
      missing,
      superseded,
      correlated,
      confounded,
      nextTests,
      lenses: h.lenses,
      lensWeight: weight ? round2(weight.w * GRADE_WEIGHT[weight.grade]) : 0,
      tests: myTests.filter((d) => !measured(d)),
      summary: h.summary,
      management: h.management,
      patternId: h.patternId,
      burdenDaly: h.burdenDaly,
      priorSource: base.source,
      why: h.why,
    });
  }

  return out.sort(
    (a, b) =>
      b.score * b.lensWeight - a.score * a.lensWeight || b.score - a.score,
  );
}
