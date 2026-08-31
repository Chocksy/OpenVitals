/**
 * The knowledge graph: what influences what, how strongly, and on whose word.
 *
 * Plain data, hand-reviewable, no database. Nodes are metrics (one per code
 * that has a vector in `vectors.ts`, plus the handful of codes the metrics
 * table carries that no vector claims), the twelve systems, and the
 * conditions, interventions, behaviours, tests and risks the edges need.
 *
 * Every edge carries a one-sentence mechanism and at least one named source.
 * DOIs appear only where the source document printed one; nothing here is
 * invented.
 *
 * ponytail: phase 6 keeps this in TypeScript. `kg_nodes` / `kg_edges` arrive
 * with research intake in phase 7, when something other than a git commit can
 * change an edge.
 */
import type { Grade } from "./hypotheses";
import { SYMPTOMS } from "./symptoms";
import type { Sex } from "./vectors";

export type NodeKind =
  | "metric"
  | "system"
  | "condition"
  | "intervention"
  | "behavior"
  | "test"
  | "risk"
  /** A profile answer: a symptom item, a habit, a genotype call. */
  | "fact"
  /** A gene the genome catalog calls, e.g. `fact:genome:CYP1A2`. */
  | "gene"
  /** An HPO term Monarch named that none of our features cover. Display only. */
  | "phenotype";

export type SystemId =
  | "lipids"
  | "metabolic"
  | "liver"
  | "kidney"
  | "thyroid"
  | "sex_hormones"
  | "adrenal"
  | "inflammation"
  | "blood"
  | "iron"
  | "vitamins"
  | "lifestyle";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  system?: SystemId;
  /** Metric codes for a metric; the profile fact key for a fact or gene. */
  codes?: string[];
  note?: string;
  /** seed | monarch | research | minted. Absent means seed. */
  source?: "seed" | "monarch" | "research" | "minted";
}

export type Relation =
  | "raises"
  | "lowers"
  | "confounds"
  | "indicates"
  | "treats"
  | "worsens"
  | "requires_test"
  | "modifies_target";

export interface Evidence {
  kind: "guideline" | "meta" | "rct" | "observational" | "anecdotal";
  title: string;
  doi?: string;
  year?: number;
  source?: string;
  /** Verbatim from the abstract, when an extraction run wrote this edge. */
  quote?: string;
  /** The effect size as the paper prints it, e.g. "+0.3 mmol/L per 1 h". */
  effect?: string;
}

/**
 * When an edge applies to this person at all. Every clause has to hold.
 *
 * `from`/`to` read a metric's side, `pattern` and `sex` read the model input,
 * and the three phase-16 clauses read the profile: any answer (`fact`), a
 * genome call (`genome`), and how long before bed something happened
 * (`hoursBefore`).
 */
export interface FactClause {
  key: string;
  includes?: string;
  equals?: string;
  /** Any one of these options; the multiple-choice version of `equals`. */
  oneOf?: string[];
  /** Numbers, and "21:00" as 21. */
  above?: number;
  below?: number;
}

export interface EdgeWhen {
  from?: "high" | "low";
  to?: "high" | "low";
  sex?: Sex;
  pattern?: string;
  fact?: FactClause;
  /**
   * Phase 20: the other answers the edge needs, all of which have to hold.
   * `fact` stays the single clause `lib/ask.ts` strips when it works out which
   * answer an edge is waiting on, so an edge can say "ask me this one, given
   * these others" without the two jobs fighting.
   */
  facts?: FactClause[];
  /** A gene symbol in `GENOME_CATALOG` and a substring of its call. */
  genome?: { gene: string; genotype: string };
  age?: { min?: number; max?: number };
  /** The answer in `eventFact` is less than `threshold` hours before bedtime. */
  hoursBefore?: { eventFact: string; threshold: number };
}

export interface GraphEdge {
  /** "tsh->ldl_cholesterol": the two node ids without their kind prefix. */
  id: string;
  from: string;
  to: string;
  relation: Relation;
  strength: 1 | 2 | 3;
  confidence: "established" | "probable" | "speculative";
  basis: "science" | "opinion" | "anecdotal";
  /** A–E, the ladder of `ROADMAP.md` principle 2. Derived when absent. */
  grade?: Grade;
  when?: EdgeWhen;
  mechanism: string;
  evidence: Evidence[];
  source: "seed" | "pattern" | "monarch" | "research";
}

/** guideline and meta are A, a trial or a cohort is B, a forum post is D. */
const EVIDENCE_GRADE: Record<Evidence["kind"], Grade> = {
  guideline: "A",
  meta: "A",
  rct: "B",
  observational: "B",
  anecdotal: "D",
};

/** The edge's own grade, or the best grade its evidence list earns. */
export const gradeOfEdge = (edge: GraphEdge): Grade =>
  edge.grade ??
  edge.evidence.map((v) => EVIDENCE_GRADE[v.kind]).sort()[0] ??
  "C";

export const SYSTEMS: { id: SystemId; name: string; headline: string[] }[] = [
  {
    id: "lipids",
    name: "Lipids",
    headline: [
      "apolipoprotein_b",
      "ldl_cholesterol",
      "hdl_cholesterol",
      "triglycerides",
    ],
  },
  {
    id: "metabolic",
    name: "Blood sugar and insulin",
    headline: ["hba1c", "glucose", "insulin", "homa_ir"],
  },
  { id: "liver", name: "Liver", headline: ["alt", "ast", "ggt", "alp"] },
  {
    id: "kidney",
    name: "Kidneys",
    headline: ["creatinine", "cystatin_c", "uric_acid"],
  },
  {
    id: "thyroid",
    name: "Thyroid",
    headline: ["tsh", "free_t4", "tpo_antibodies"],
  },
  {
    id: "sex_hormones",
    name: "Sex hormones",
    headline: ["testosterone", "estradiol", "fsh", "lh"],
  },
  { id: "adrenal", name: "Stress hormones", headline: ["cortisol"] },
  { id: "inflammation", name: "Inflammation", headline: ["hs_crp", "crp"] },
  {
    id: "blood",
    name: "Blood count",
    headline: ["hemoglobin", "wbc", "platelets", "mcv", "rdw"],
  },
  {
    id: "iron",
    name: "Iron",
    headline: ["ferritin", "transferrin_saturation"],
  },
  {
    id: "vitamins",
    name: "Vitamins",
    headline: ["vitamin_d", "vitamin_b12", "folic_acid", "homocysteine"],
  },
  {
    id: "lifestyle",
    name: "Lifestyle",
    headline: ["sleep_duration", "bp_systolic", "bmi"],
  },
];

/** code, display name, system. One metric node each. */
const METRICS: [string, string, SystemId][] = [
  ["apolipoprotein_b", "ApoB", "lipids"],
  ["ldl_cholesterol", "LDL cholesterol", "lipids"],
  ["hdl_cholesterol", "HDL cholesterol", "lipids"],
  ["triglycerides", "Triglycerides", "lipids"],
  ["total_cholesterol", "Total cholesterol", "lipids"],
  ["non_hdl_cholesterol", "Non-HDL cholesterol", "lipids"],
  ["lp_a", "Lp(a)", "lipids"],
  ["hba1c", "HbA1c", "metabolic"],
  ["glucose", "Fasting glucose", "metabolic"],
  ["insulin", "Fasting insulin", "metabolic"],
  ["homa_ir", "HOMA-IR", "metabolic"],
  ["alt", "ALT", "liver"],
  ["ast", "AST", "liver"],
  ["ggt", "GGT", "liver"],
  ["alp", "Alkaline phosphatase", "liver"],
  ["albumin", "Albumin", "liver"],
  ["creatinine", "Creatinine", "kidney"],
  ["cystatin_c", "Cystatin C", "kidney"],
  ["uric_acid", "Uric acid", "kidney"],
  ["tsh", "TSH", "thyroid"],
  ["free_t4", "Free T4", "thyroid"],
  ["free_t3", "Free T3", "thyroid"],
  ["tpo_antibodies", "TPO antibodies", "thyroid"],
  ["anti_thyroglobulin", "Thyroglobulin antibodies", "thyroid"],
  ["testosterone", "Testosterone", "sex_hormones"],
  ["estradiol", "Estradiol", "sex_hormones"],
  ["fsh", "FSH", "sex_hormones"],
  ["lh", "LH", "sex_hormones"],
  ["psa_total", "PSA", "sex_hormones"],
  ["cortisol", "Cortisol", "adrenal"],
  ["hs_crp", "hs-CRP", "inflammation"],
  ["crp", "CRP", "inflammation"],
  ["hemoglobin", "Haemoglobin", "blood"],
  ["rbc", "Red cell count", "blood"],
  ["wbc", "White cell count", "blood"],
  ["platelets", "Platelets", "blood"],
  ["mcv", "MCV", "blood"],
  ["rdw", "RDW", "blood"],
  ["ferritin", "Ferritin", "iron"],
  ["transferrin_saturation", "Iron saturation", "iron"],
  ["vitamin_d", "Vitamin D", "vitamins"],
  ["vitamin_b12", "Vitamin B12", "vitamins"],
  ["folic_acid", "Folate", "vitamins"],
  ["homocysteine", "Homocysteine", "vitamins"],
  ["sleep_duration", "Sleep duration", "lifestyle"],
  ["bp_systolic", "Systolic blood pressure", "lifestyle"],
  ["bp_diastolic", "Diastolic blood pressure", "lifestyle"],
  ["bmi", "BMI", "lifestyle"],
];

/**
 * One node per row of `GENOME_CATALOG`, so a Monarch gene edge and a personal
 * genotype land on the same node. `codes` is the profile fact the call writes.
 *
 * ponytail: hand-written rather than derived, because importing the genome
 * catalog here would pull the whole hypothesis catalog into every page that
 * draws the graph. `lib/kg.test.ts` asserts the two lists stay in step.
 */
const GENE_NODES: GraphNode[] = (
  [
    ["APOE", "genome:apoe", "Apolipoprotein E"],
    ["LPA", "genome:lpa", "Lipoprotein(a)"],
    ["HFE", "genome:hfe", "Haemochromatosis gene"],
    ["HLA", "genome:hla_dq", "HLA DQ2.5 coeliac haplotype"],
    ["TCF7L2", "genome:tcf7l2", "Transcription factor 7-like 2"],
    ["MTHFR", "genome:mthfr", "Methylenetetrahydrofolate reductase"],
    ["CYP1A2", "caffeine_slow_metaboliser", "Caffeine metabolism"],
    ["LCT", "lactase_nonpersistent", "Lactase persistence"],
    ["FTO", "genome:fto", "FTO appetite variant"],
    ["G6PD", "genome:g6pd", "Glucose-6-phosphate dehydrogenase"],
    ["SLCO1B1", "statin_myopathy_risk", "Statin transporter"],
  ] as const
).map(([gene, factKey, name]) => ({
  id: `fact:genome:${gene}`,
  kind: "gene" as const,
  name: `${gene} (${name})`,
  codes: [factKey],
}));

/** The twelve questionnaire items, so a Monarch phenotype can land on one. */
const SYMPTOM_NODES: GraphNode[] = SYMPTOMS.map((s) => ({
  id: `fact:${s.key}`,
  kind: "fact" as const,
  name: s.name,
  codes: [s.key],
}));

const OTHERS: GraphNode[] = [
  { id: "risk:ascvd", kind: "risk", name: "Atherosclerotic heart disease" },
  { id: "risk:t2d", kind: "risk", name: "Type 2 diabetes" },
  { id: "risk:ckd", kind: "risk", name: "Chronic kidney disease" },
  { id: "risk:hypothyroid", kind: "risk", name: "Hypothyroidism" },
  { id: "risk:mortality", kind: "risk", name: "All-cause mortality" },

  {
    id: "condition:hashimoto",
    kind: "condition",
    name: "Hashimoto's thyroiditis",
    system: "thyroid",
  },
  {
    id: "condition:nafld",
    kind: "condition",
    name: "Fatty liver",
    system: "liver",
  },
  {
    id: "condition:osa",
    kind: "condition",
    name: "Obstructive sleep apnoea",
    system: "lifestyle",
  },
  { id: "condition:coeliac", kind: "condition", name: "Coeliac disease" },

  { id: "intervention:selenium", kind: "intervention", name: "Selenium" },
  { id: "intervention:vitamin_d3", kind: "intervention", name: "Vitamin D3" },
  {
    id: "intervention:omega3",
    kind: "intervention",
    name: "Omega-3 (EPA/DHA)",
  },
  {
    id: "intervention:zone2_cardio",
    kind: "intervention",
    name: "Zone 2 cardio",
  },
  {
    id: "intervention:resistance_training",
    kind: "intervention",
    name: "Resistance training",
  },
  {
    id: "intervention:levothyroxine",
    kind: "intervention",
    name: "Levothyroxine",
    note: "Prescription. Always a doctor action.",
  },
  {
    id: "intervention:statin",
    kind: "intervention",
    name: "Statin",
    note: "Prescription. Always a doctor action.",
  },
  { id: "intervention:creatine", kind: "intervention", name: "Creatine" },
  { id: "intervention:magnesium", kind: "intervention", name: "Magnesium" },
  { id: "intervention:iron", kind: "intervention", name: "Iron" },
  {
    id: "intervention:iodine_excess",
    kind: "intervention",
    name: "Iodine, kelp or an iodine-containing multivitamin",
  },
  {
    id: "intervention:carb_reintroduction",
    kind: "intervention",
    name: "Carbohydrate re-introduction",
  },
  {
    id: "intervention:alcohol_reduction",
    kind: "intervention",
    name: "Drinking less",
  },
  {
    id: "intervention:sleep_extension",
    kind: "intervention",
    name: "Sleeping longer",
  },
  {
    id: "intervention:gluten_free_diet",
    kind: "intervention",
    name: "Gluten-free diet",
  },
  {
    id: "intervention:myo_inositol_selenium",
    kind: "intervention",
    name: "Myo-inositol with selenium",
  },

  {
    id: "behavior:coffee_within_1h_of_lt4",
    kind: "behavior",
    name: "Coffee within an hour of levothyroxine",
  },
  {
    id: "behavior:coffee_before_draw",
    kind: "behavior",
    name: "Coffee before the blood draw",
  },
  {
    id: "behavior:coffee_with_iron",
    kind: "behavior",
    name: "Coffee or tea with the iron dose",
  },
  {
    id: "behavior:fasting_12h",
    kind: "behavior",
    name: "12-hour fast before the draw",
  },
  {
    id: "behavior:low_carb_diet",
    kind: "behavior",
    name: "Low-carb or keto eating",
  },
  { id: "behavior:smoking", kind: "behavior", name: "Smoking" },

  { id: "test:cac_score", kind: "test", name: "Coronary calcium score" },
  { id: "test:thyroid_ultrasound", kind: "test", name: "Thyroid ultrasound" },
  {
    id: "test:coeliac_serology",
    kind: "test",
    name: "Coeliac serology (tTG-IgA with total IgA)",
  },
  { id: "test:ogtt_insulin", kind: "test", name: "2-hour OGTT with insulin" },
  { id: "test:sleep_study", kind: "test", name: "Home sleep study" },
  { id: "test:dexa", kind: "test", name: "DEXA scan" },
  {
    id: "test:urine_acr",
    kind: "test",
    name: "Urine albumin/creatinine ratio",
  },
  { id: "test:cystatin_c", kind: "test", name: "Cystatin C eGFR" },

  // ── phase 16: the behaviours and the answers a conditional edge reads ──
  {
    id: "behavior:coffee_after_15",
    kind: "behavior",
    name: "Coffee after 15:00",
    codes: ["coffee_last_hour"],
  },
  {
    id: "behavior:late_meal",
    kind: "behavior",
    name: "Eating close to bedtime",
    codes: ["last_meal_hour"],
  },

  ...GENE_NODES,
  ...SYMPTOM_NODES,
];

export const NODES: GraphNode[] = [
  ...SYSTEMS.map(
    (s): GraphNode => ({
      id: `system:${s.id}`,
      kind: "system",
      name: s.name,
      system: s.id,
      codes: s.headline,
    }),
  ),
  ...METRICS.map(
    ([code, name, system]): GraphNode => ({
      id: `metric:${code}`,
      kind: "metric",
      name,
      system,
      codes: [code],
    }),
  ),
  ...OTHERS,
];

/** `id` is the two node ids with their kind prefixes stripped. */
const local = (id: string) => id.slice(id.indexOf(":") + 1);

const e = (
  from: string,
  to: string,
  relation: Relation,
  strength: 1 | 2 | 3,
  confidence: GraphEdge["confidence"],
  mechanism: string,
  evidence: Evidence[],
  extra: Partial<GraphEdge> = {},
): GraphEdge => ({
  id: `${local(from)}->${local(to)}`,
  from,
  to,
  relation,
  strength,
  confidence,
  basis: "science",
  mechanism,
  evidence,
  source: "seed",
  ...extra,
});

const guide = (title: string, year?: number): Evidence => ({
  kind: "guideline",
  title,
  year,
});
const meta = (title: string, year?: number, doi?: string): Evidence => ({
  kind: "meta",
  title,
  year,
  doi,
});
const cohort = (title: string, year?: number): Evidence => ({
  kind: "observational",
  title,
  year,
});
const trial = (title: string, year?: number): Evidence => ({
  kind: "rct",
  title,
  year,
});

/**
 * The ranked vectors of `2026-08-26-health-vectors.md` section 3 as edges into
 * the four risks, then the nine worked examples of the health-model spec
 * section 2, then the mechanism edges the plan needs to reason about doses and
 * confounders, then the pattern-gated edges.
 */
export const EDGES: GraphEdge[] = [
  // --- vectors doc section 3: what each vector does to which outcome -------
  e(
    "intervention:zone2_cardio",
    "risk:mortality",
    "lowers",
    3,
    "established",
    "Cardiorespiratory fitness is the single strongest measured predictor of survival, and steady aerobic volume is how it is built.",
    [
      cohort("Mandsager 2018 JAMA Netw Open", 2018),
      meta("Paluch 2022 Lancet Public Health", 2022),
    ],
  ),
  e(
    "metric:bp_systolic",
    "risk:ascvd",
    "raises",
    3,
    "established",
    "Risk climbs log-linearly with systolic pressure from 115 mmHg upward, with no threshold below which it stops.",
    [cohort("Lewington 2002 Lancet", 2002), trial("SPRINT 2015 NEJM", 2015)],
    { when: { from: "high" } },
  ),
  e(
    "metric:apolipoprotein_b",
    "risk:ascvd",
    "raises",
    3,
    "established",
    "ApoB counts the particles that can lodge in an artery wall, and lifetime exposure to them is causal.",
    [
      guide("Ference 2017 Eur Heart J (EAS consensus)", 2017),
      cohort("Sniderman 2019 JAMA Cardiol", 2019),
    ],
    { when: { from: "high" } },
  ),
  e(
    "metric:ldl_cholesterol",
    "risk:ascvd",
    "raises",
    3,
    "established",
    "LDL cholesterol is the cheapest proxy for particle count, and Mendelian randomisation puts it on the causal path.",
    [guide("Ference 2017 Eur Heart J (EAS consensus)", 2017)],
    { when: { from: "high" } },
  ),
  e(
    "behavior:smoking",
    "risk:mortality",
    "raises",
    3,
    "established",
    "Smoking costs about a decade of life and is the largest single modifiable risk there is.",
    [cohort("Doll 2004 BMJ (British doctors study)", 2004)],
  ),
  e(
    "behavior:smoking",
    "risk:ascvd",
    "raises",
    3,
    "established",
    "Tobacco smoke damages the endothelium and accelerates plaque at every lipid level.",
    [cohort("Doll 2004 BMJ (British doctors study)", 2004)],
  ),
  e(
    "metric:hba1c",
    "risk:t2d",
    "raises",
    3,
    "established",
    "HbA1c is three months of blood sugar in one number, and the run-up to diabetes is visible in it years ahead.",
    [
      guide("ADA Standards of Care"),
      cohort("Emerging Risk Factors Collaboration 2010 Lancet", 2010),
    ],
    { when: { from: "high" } },
  ),
  e(
    "metric:insulin",
    "risk:t2d",
    "raises",
    3,
    "established",
    "Fasting insulin rises while glucose still looks normal, because the pancreas is compensating.",
    [cohort("DeFronzo 2009 Diabetes (insulin resistance)", 2009)],
    { when: { from: "high" } },
  ),
  e(
    "metric:homa_ir",
    "risk:t2d",
    "raises",
    2,
    "probable",
    "HOMA-IR turns fasting glucose and insulin into one index of how hard the pancreas is working.",
    [cohort("Matthews 1985 Diabetologia", 1985)],
    { when: { from: "high" } },
  ),
  e(
    "intervention:resistance_training",
    "risk:mortality",
    "lowers",
    2,
    "established",
    "Grip strength predicts death better than systolic blood pressure does, and strength work is what moves it.",
    [
      cohort("Leong 2015 Lancet (PURE)", 2015),
      cohort("Srikanthan 2014 Am J Med", 2014),
    ],
  ),
  e(
    "metric:bmi",
    "risk:t2d",
    "raises",
    3,
    "established",
    "Fat stored where it does not belong, especially around the organs, is the main driver of insulin resistance.",
    [
      cohort("GBD 2017 obesity collaborators", 2017),
      guide("Ross 2020 Nat Rev Endocrinol (waist consensus)", 2020),
    ],
    { when: { from: "high" } },
  ),
  e(
    "metric:bmi",
    "risk:ascvd",
    "raises",
    2,
    "established",
    "Excess adiposity raises blood pressure, triglycerides and inflammation together.",
    [cohort("GBD 2017 obesity collaborators", 2017)],
    { when: { from: "high" } },
  ),
  e(
    "metric:sleep_duration",
    "risk:mortality",
    "raises",
    2,
    "probable",
    "Habitual short sleep sits on the steep side of a U-shaped curve against mortality.",
    [meta("Cappuccio 2010 Sleep", 2010)],
    { when: { from: "low" } },
  ),
  e(
    "condition:osa",
    "risk:ascvd",
    "raises",
    3,
    "established",
    "Untreated obstructive sleep apnoea roughly doubles fatal and non-fatal cardiovascular events.",
    [cohort("Marin 2005 Lancet", 2005)],
  ),
  e(
    "metric:creatinine",
    "risk:ckd",
    "indicates",
    3,
    "established",
    "Creatinine is what eGFR is computed from, and eGFR is half of how kidneys are graded.",
    [
      guide("KDIGO 2024 CKD guideline", 2024),
      cohort("CKD Prognosis Consortium 2010 Lancet", 2010),
    ],
    { when: { from: "high" } },
  ),
  e(
    "metric:cystatin_c",
    "risk:ckd",
    "indicates",
    2,
    "established",
    "Cystatin C gives a muscle-independent eGFR, which settles the cases where creatinine misleads.",
    [guide("KDIGO 2024 CKD guideline", 2024)],
    { when: { from: "high" } },
  ),
  e(
    "metric:lp_a",
    "risk:ascvd",
    "raises",
    3,
    "established",
    "Lp(a) is inherited, fixed for life, and adds risk on top of whatever LDL is doing.",
    [
      cohort("Kamstrup 2009 JAMA", 2009),
      guide("EAS 2022 consensus on Lp(a)", 2022),
    ],
    { when: { from: "high" } },
  ),
  e(
    "metric:hs_crp",
    "risk:ascvd",
    "raises",
    2,
    "probable",
    "Background inflammation travels with plaque activity and predicts events on top of lipids.",
    [
      cohort("Emerging Risk Factors Collaboration 2010 Lancet", 2010),
      cohort("Ridker 2023 Lancet", 2023),
    ],
    { when: { from: "high" } },
  ),
  e(
    "intervention:alcohol_reduction",
    "risk:mortality",
    "lowers",
    2,
    "established",
    "For all-cause mortality the large pooled analyses find no protective dose, so less is better at every level.",
    [meta("GBD alcohol 2018 Lancet", 2018), meta("Wood 2018 Lancet", 2018)],
  ),
  e(
    "metric:alt",
    "condition:nafld",
    "indicates",
    2,
    "probable",
    "A raised ALT in someone who drinks little is fat in the liver until proven otherwise.",
    [
      cohort("Lazo 2011 Am J Epidemiol (NHANES)", 2011),
      guide("AASLD NAFLD guidance"),
    ],
    { when: { from: "high" } },
  ),
  e(
    "metric:ggt",
    "condition:nafld",
    "indicates",
    2,
    "probable",
    "GGT tracks both alcohol load and hepatic fat, and it moves before ALT does.",
    [cohort("Lazo 2011 Am J Epidemiol (NHANES)", 2011)],
    { when: { from: "high" } },
  ),
  e(
    "condition:nafld",
    "risk:t2d",
    "raises",
    2,
    "established",
    "A fatty liver keeps pushing glucose out overnight, which is insulin resistance seen from the liver side.",
    [guide("AASLD NAFLD guidance")],
  ),
  e(
    "metric:vitamin_d",
    "risk:mortality",
    "lowers",
    1,
    "speculative",
    "Low vitamin D tracks with worse outcomes in cohorts, but supplementing it did not change mortality in the big trial.",
    [
      trial("VITAL 2019 NEJM", 2019),
      guide("Holick 2011 Endocrine Society", 2011),
    ],
    { when: { from: "low" } },
  ),
  e(
    "metric:tsh",
    "risk:ascvd",
    "raises",
    2,
    "probable",
    "Subclinical hypothyroidism raises coronary events, mostly above a TSH of 10.",
    [meta("Rodondi 2010 JAMA", 2010)],
    { when: { from: "high" } },
  ),
  e(
    "metric:uric_acid",
    "risk:ascvd",
    "raises",
    1,
    "probable",
    "Uric acid marks metabolic load and gout risk; lowering it has not been shown to move heart outcomes.",
    [cohort("Feig 2008 NEJM review", 2008)],
    { when: { from: "high" } },
  ),
  e(
    "metric:homocysteine",
    "risk:ascvd",
    "raises",
    1,
    "speculative",
    "Homocysteine predicts events but lowering it with B vitamins did not reduce them.",
    [trial("HOPE-2 2006 NEJM", 2006)],
    { when: { from: "high" } },
  ),
  e(
    "metric:testosterone",
    "risk:mortality",
    "lowers",
    1,
    "speculative",
    "Low testosterone tracks with worse survival, but replacing it showed safety rather than benefit.",
    [trial("TRAVERSE 2023 NEJM", 2023)],
    { when: { from: "low" } },
  ),
  e(
    "test:dexa",
    "risk:mortality",
    "indicates",
    1,
    "probable",
    "DEXA measures lean mass and visceral fat instead of guessing at them from weight.",
    [cohort("Srikanthan 2014 Am J Med", 2014)],
  ),
  e(
    "risk:ckd",
    "risk:mortality",
    "raises",
    2,
    "established",
    "Reduced filtration and albumin leak each predict death independently of the other.",
    [cohort("CKD Prognosis Consortium 2010 Lancet", 2010)],
  ),

  // --- health-model spec section 2: the nine worked examples ---------------
  e(
    "metric:tsh",
    "metric:ldl_cholesterol",
    "raises",
    2,
    "established",
    "Low thyroid hormone lowers LDL receptor activity in the liver, so LDL clears more slowly and the number climbs.",
    [
      meta("Rodondi 2010 JAMA", 2010),
      guide("ATA 2014 hypothyroidism guideline", 2014),
    ],
    { when: { from: "high" } },
  ),
  e(
    "metric:hba1c",
    "metric:triglycerides",
    "raises",
    2,
    "established",
    "Insulin resistance frees fatty acids and the liver repackages them as triglycerides.",
    [cohort("DeFronzo 2009 Diabetes (insulin resistance)", 2009)],
    { when: { from: "high" } },
  ),
  e(
    "metric:crp",
    "metric:ferritin",
    "confounds",
    3,
    "established",
    "Ferritin is an acute phase reactant, so any inflammation lifts it and can hide empty iron stores.",
    [guide("BSG iron deficiency guideline")],
    { when: { from: "high" } },
  ),
  e(
    "metric:hs_crp",
    "metric:ferritin",
    "confounds",
    3,
    "established",
    "The same acute phase rise applies to hs-CRP, so read ferritin and CRP on the same draw.",
    [guide("BSG iron deficiency guideline")],
    { when: { from: "high" } },
  ),
  e(
    "intervention:alcohol_reduction",
    "metric:ggt",
    "lowers",
    3,
    "established",
    "GGT is induced by alcohol and falls within weeks of stopping.",
    [meta("Wood 2018 Lancet", 2018)],
  ),
  e(
    "intervention:alcohol_reduction",
    "metric:triglycerides",
    "lowers",
    2,
    "established",
    "Alcohol is carried to the liver and leaves as triglyceride, so cutting it drops the number fast.",
    [meta("GBD alcohol 2018 Lancet", 2018)],
  ),
  e(
    "intervention:sleep_extension",
    "metric:cortisol",
    "lowers",
    1,
    "probable",
    "Short sleep raises evening cortisol; restoring hours brings the curve back down.",
    [meta("Cappuccio 2010 Sleep", 2010)],
  ),
  e(
    "intervention:sleep_extension",
    "metric:glucose",
    "lowers",
    2,
    "probable",
    "A week of restricted sleep measurably worsens glucose tolerance in healthy volunteers.",
    [trial("Spiegel 1999 Lancet", 1999)],
  ),
  e(
    "intervention:zone2_cardio",
    "metric:hdl_cholesterol",
    "raises",
    2,
    "established",
    "Aerobic training raises HDL cholesterol, though HDL is a marker of the training rather than a target in itself.",
    [meta("Kodama 2007 Arch Intern Med", 2007)],
  ),
  e(
    "metric:vitamin_d",
    "metric:testosterone",
    "raises",
    1,
    "speculative",
    "Small trials in deficient men raised testosterone after correcting vitamin D; larger ones did not replicate it.",
    [trial("Pilz 2011 Horm Metab Res", 2011)],
    { when: { from: "low" } },
  ),
  e(
    "behavior:coffee_before_draw",
    "metric:cortisol",
    "confounds",
    2,
    "probable",
    "Caffeine lifts cortisol for hours, so a coffee before the draw moves the result rather than the person.",
    [trial("Lovallo 2005 Psychosom Med", 2005)],
  ),
  e(
    "behavior:coffee_before_draw",
    "metric:glucose",
    "confounds",
    2,
    "probable",
    "Caffeine blunts insulin sensitivity acutely, which shows up as a higher fasting glucose.",
    [trial("Lovallo 2005 Psychosom Med", 2005)],
  ),
  e(
    "behavior:coffee_with_iron",
    "metric:ferritin",
    "lowers",
    2,
    "established",
    "Coffee and tea polyphenols bind iron in the gut, so a dose taken with them barely gets absorbed.",
    [trial("Hurrell 1999 Br J Nutr", 1999)],
  ),
  e(
    "behavior:coffee_with_iron",
    "intervention:iron",
    "confounds",
    2,
    "established",
    "Take iron an hour before coffee or two hours after it, with vitamin C rather than with tea.",
    [trial("Hurrell 1999 Br J Nutr", 1999)],
  ),

  // --- mechanism edges the plan reasons over -------------------------------
  e(
    "intervention:statin",
    "metric:apolipoprotein_b",
    "lowers",
    3,
    "established",
    "Statins raise LDL receptor expression and cut ApoB particle count by a third or more.",
    [meta("CTT 2010 Lancet", 2010)],
  ),
  e(
    "intervention:statin",
    "risk:ascvd",
    "treats",
    3,
    "established",
    "Every 1 mmol/L of LDL lowered cuts major vascular events by about a fifth per year of treatment.",
    [meta("CTT 2010 Lancet", 2010)],
  ),
  e(
    "intervention:omega3",
    "metric:triglycerides",
    "lowers",
    2,
    "established",
    "Marine omega-3 at gram doses cuts hepatic triglyceride output.",
    [trial("REDUCE-IT 2019 NEJM", 2019)],
  ),
  e(
    "intervention:omega3",
    "metric:hs_crp",
    "lowers",
    1,
    "probable",
    "EPA lowers hs-CRP modestly in most trials.",
    [trial("REDUCE-IT 2019 NEJM", 2019)],
  ),
  e(
    "intervention:vitamin_d3",
    "metric:vitamin_d",
    "raises",
    3,
    "established",
    "Cholecalciferol raises 25-OH vitamin D roughly 1 ng/mL per 100 IU per day, plateauing at eight weeks.",
    [guide("Holick 2011 Endocrine Society", 2011)],
  ),
  e(
    "intervention:magnesium",
    "metric:bp_systolic",
    "lowers",
    1,
    "probable",
    "Magnesium supplementation lowers systolic pressure by a few mmHg, mostly in people who were short of it.",
    [meta("Zhang 2016 Hypertension", 2016)],
  ),
  e(
    "intervention:creatine",
    "metric:creatinine",
    "confounds",
    2,
    "established",
    "Creatine loading raises serum creatinine without touching kidney function, so eGFR reads low on paper.",
    [guide("ISSN 2017 creatine position stand", 2017)],
  ),
  e(
    "intervention:iron",
    "metric:ferritin",
    "raises",
    3,
    "established",
    "Oral iron refills stores over three to six months; alternate-day dosing absorbs better than daily.",
    [
      guide("BSG iron deficiency guideline"),
      trial("Stoffel 2017 Lancet Haematol", 2017),
    ],
    { when: { to: "low" } },
  ),
  e(
    "intervention:iron",
    "metric:hemoglobin",
    "raises",
    2,
    "established",
    "Once stores are refilling, haemoglobin follows within a month.",
    [guide("BSG iron deficiency guideline")],
    { when: { to: "low" } },
  ),
  e(
    "intervention:resistance_training",
    "metric:hba1c",
    "lowers",
    2,
    "probable",
    "Muscle is where most glucose is disposed of, so more of it lowers HbA1c independently of weight.",
    [meta("Umpierre 2011 JAMA", 2011)],
  ),
  e(
    "intervention:zone2_cardio",
    "metric:triglycerides",
    "lowers",
    2,
    "established",
    "Aerobic work burns circulating triglyceride and improves clearance for a day or two after each session.",
    [meta("Kodama 2007 Arch Intern Med", 2007)],
  ),
  e(
    "intervention:zone2_cardio",
    "metric:bp_systolic",
    "lowers",
    2,
    "established",
    "Regular aerobic exercise takes about 5 mmHg off systolic pressure.",
    [meta("Cornelissen 2013 J Am Heart Assoc", 2013)],
  ),
  e(
    "intervention:zone2_cardio",
    "metric:hs_crp",
    "lowers",
    1,
    "probable",
    "Training lowers background inflammation, partly through losing visceral fat.",
    [meta("Fedewa 2017 Am J Cardiol", 2017)],
  ),
  e(
    "intervention:zone2_cardio",
    "metric:bmi",
    "lowers",
    1,
    "probable",
    "Exercise alone moves weight slowly; it moves visceral fat faster than the scale shows.",
    [guide("Ross 2020 Nat Rev Endocrinol (waist consensus)", 2020)],
  ),
  e(
    "intervention:alcohol_reduction",
    "metric:bp_systolic",
    "lowers",
    2,
    "established",
    "Cutting heavy drinking drops systolic pressure within weeks.",
    [meta("Roerecke 2017 Lancet Public Health", 2017)],
  ),
  e(
    "intervention:alcohol_reduction",
    "metric:mcv",
    "lowers",
    1,
    "probable",
    "Alcohol enlarges red cells directly; MCV falls over the three months it takes to replace them.",
    [cohort("Lazo 2011 Am J Epidemiol (NHANES)", 2011)],
  ),
  e(
    "intervention:sleep_extension",
    "metric:bp_systolic",
    "lowers",
    1,
    "probable",
    "Short sleep keeps night-time pressure up; restoring hours lets it dip again.",
    [meta("Cappuccio 2010 Sleep", 2010)],
  ),
  e(
    "behavior:fasting_12h",
    "metric:triglycerides",
    "confounds",
    2,
    "established",
    "Triglycerides are the one lipid that a non-fasting draw genuinely changes.",
    [guide("Nordestgaard 2016 Eur Heart J (non-fasting lipids)", 2016)],
  ),
  e(
    "behavior:fasting_12h",
    "metric:insulin",
    "confounds",
    3,
    "established",
    "Fasting insulin only means anything after a real overnight fast.",
    [guide("ADA Standards of Care")],
  ),
  e(
    "behavior:fasting_12h",
    "metric:glucose",
    "confounds",
    3,
    "established",
    "The same applies to fasting glucose; a snack before the draw invalidates it.",
    [guide("ADA Standards of Care")],
  ),
  e(
    "behavior:smoking",
    "metric:hs_crp",
    "raises",
    2,
    "established",
    "Smoking keeps background inflammation elevated for as long as it continues.",
    [cohort("Ridker 2023 Lancet", 2023)],
  ),
  e(
    "metric:sleep_duration",
    "metric:hba1c",
    "raises",
    1,
    "probable",
    "Chronic short sleep worsens glucose handling enough to show in HbA1c.",
    [trial("Spiegel 1999 Lancet", 1999)],
    { when: { from: "low" } },
  ),
  e(
    "condition:osa",
    "metric:bp_systolic",
    "raises",
    2,
    "established",
    "Repeated overnight desaturation drives sympathetic tone and resistant hypertension.",
    [cohort("Marin 2005 Lancet", 2005)],
  ),
  e(
    "condition:osa",
    "metric:testosterone",
    "lowers",
    2,
    "probable",
    "Fragmented sleep suppresses the overnight testosterone pulse, which is the commonest reversible cause of a low reading.",
    [guide("Endocrine Society 2018 testosterone guideline", 2018)],
  ),
  e(
    "condition:nafld",
    "metric:alt",
    "raises",
    2,
    "established",
    "Fat in hepatocytes leaks ALT into the blood.",
    [guide("AASLD NAFLD guidance")],
  ),
  e(
    "metric:insulin",
    "metric:triglycerides",
    "raises",
    2,
    "established",
    "High insulin drives hepatic VLDL production, which the lab reports as triglycerides.",
    [cohort("DeFronzo 2009 Diabetes (insulin resistance)", 2009)],
    { when: { from: "high" } },
  ),
  e(
    "metric:glucose",
    "metric:hba1c",
    "raises",
    3,
    "established",
    "HbA1c is the average of the glucose the red cells have seen over their lifetime.",
    [guide("ADA Standards of Care")],
    { when: { from: "high" } },
  ),
  e(
    "metric:triglycerides",
    "metric:hdl_cholesterol",
    "lowers",
    2,
    "established",
    "Triglyceride-rich particles trade lipid with HDL and shrink it, so high triglycerides and low HDL arrive together.",
    [cohort("DeFronzo 2009 Diabetes (insulin resistance)", 2009)],
    { when: { from: "high" } },
  ),
  e(
    "metric:hdl_cholesterol",
    "risk:ascvd",
    "lowers",
    1,
    "speculative",
    "Low HDL predicts events, but every trial that raised it on purpose failed, so it is a marker and not a lever.",
    [trial("AIM-HIGH 2011 NEJM", 2011)],
    { when: { from: "low" } },
  ),
  e(
    "metric:ferritin",
    "metric:hemoglobin",
    "lowers",
    2,
    "established",
    "Empty iron stores eventually stop the marrow making haemoglobin, but the stores empty first.",
    [guide("BSG iron deficiency guideline")],
    { when: { from: "low" } },
  ),
  e(
    "metric:transferrin_saturation",
    "metric:ferritin",
    "confounds",
    2,
    "established",
    "Saturation above 45% with a high ferritin points at iron overload; a normal saturation points at inflammation.",
    [guide("EASL haemochromatosis guideline")],
    { when: { from: "high" } },
  ),
  e(
    "metric:vitamin_b12",
    "metric:homocysteine",
    "lowers",
    3,
    "established",
    "B12 is a cofactor for the enzyme that clears homocysteine, so a gap in one shows up in the other.",
    [cohort("Refsum 2004 Clin Chem", 2004)],
    { when: { from: "low" } },
  ),
  e(
    "metric:folic_acid",
    "metric:homocysteine",
    "lowers",
    3,
    "established",
    "Folate donates the methyl group that turns homocysteine back into methionine.",
    [cohort("Refsum 2004 Clin Chem", 2004)],
    { when: { from: "low" } },
  ),
  e(
    "metric:vitamin_b12",
    "metric:mcv",
    "raises",
    2,
    "established",
    "Without B12 the marrow makes fewer, larger red cells, so MCV climbs before haemoglobin falls.",
    [cohort("Refsum 2004 Clin Chem", 2004)],
    { when: { from: "low" } },
  ),
  e(
    "metric:folic_acid",
    "metric:mcv",
    "raises",
    2,
    "established",
    "Folate deficiency enlarges red cells the same way B12 deficiency does.",
    [cohort("Refsum 2004 Clin Chem", 2004)],
    { when: { from: "low" } },
  ),
  e(
    "metric:uric_acid",
    "metric:bp_systolic",
    "raises",
    1,
    "probable",
    "Uric acid impairs nitric-oxide signalling in the vessel wall; the effect on pressure is small.",
    [cohort("Feig 2008 NEJM review", 2008)],
    { when: { from: "high" } },
  ),
  e(
    "metric:estradiol",
    "metric:ldl_cholesterol",
    "lowers",
    2,
    "probable",
    "Oestrogen keeps LDL receptor activity up, which is why LDL jumps after menopause.",
    [cohort("Matthews 2009 J Am Coll Cardiol", 2009)],
    { when: { sex: "female" } },
  ),
  e(
    "metric:free_t4",
    "risk:hypothyroid",
    "indicates",
    3,
    "established",
    "A free T4 below range with a raised TSH is overt hypothyroidism rather than the subclinical kind.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
    { when: { from: "low" } },
  ),
  e(
    "metric:tsh",
    "risk:hypothyroid",
    "indicates",
    3,
    "established",
    "TSH is the pituitary shouting louder as the thyroid falls behind, and it moves first.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
    { when: { from: "high" } },
  ),
  e(
    "intervention:levothyroxine",
    "metric:tsh",
    "lowers",
    3,
    "established",
    "Replacing thyroxine turns the pituitary signal back down; recheck six weeks after any dose change.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
  ),
  e(
    "intervention:levothyroxine",
    "metric:ldl_cholesterol",
    "lowers",
    2,
    "probable",
    "Restoring thyroid hormone restores LDL receptor activity, so LDL falls without touching the diet.",
    [meta("Rodondi 2010 JAMA", 2010)],
  ),
  e(
    "intervention:levothyroxine",
    "risk:hypothyroid",
    "treats",
    3,
    "established",
    "Levothyroxine is the whole treatment; the argument is only about when to start it.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
  ),
  e(
    "risk:ascvd",
    "test:cac_score",
    "requires_test",
    2,
    "established",
    "A calcium score shows the plaque itself instead of estimating it, and it decides statin timing in the middle risk band.",
    [guide("ACC/AHA 2018 cholesterol guideline", 2018)],
  ),
  e(
    "risk:t2d",
    "test:ogtt_insulin",
    "requires_test",
    2,
    "established",
    "An OGTT with insulin shows the compensation years before HbA1c moves.",
    [guide("ADA Standards of Care")],
  ),
  e(
    "risk:ckd",
    "test:urine_acr",
    "requires_test",
    3,
    "established",
    "Kidneys are graded on filtration and leak; without an ACR half the grade is missing.",
    [guide("KDIGO 2024 CKD guideline", 2024)],
  ),
  e(
    "risk:ckd",
    "test:cystatin_c",
    "requires_test",
    2,
    "established",
    "Cystatin C confirms a borderline creatinine eGFR in anyone muscular, elderly or on creatine.",
    [guide("KDIGO 2024 CKD guideline", 2024)],
  ),
  e(
    "risk:ckd",
    "intervention:magnesium",
    "modifies_target",
    3,
    "established",
    "Below an eGFR of 60 the kidney clears magnesium and potassium poorly, so supplements of either need a prescriber.",
    [guide("KDIGO 2024 CKD guideline", 2024)],
  ),
  e(
    "condition:osa",
    "test:sleep_study",
    "requires_test",
    3,
    "established",
    "A home sleep study is the only way to turn snoring into a diagnosis.",
    [cohort("Marin 2005 Lancet", 2005)],
  ),
  e(
    "test:cac_score",
    "risk:ascvd",
    "indicates",
    3,
    "established",
    "A zero score buys years of reassurance; any score above zero ends the argument about treating.",
    [guide("ACC/AHA 2018 cholesterol guideline", 2018)],
  ),

  // --- pattern-gated: Hashimoto's (knowledge-graph doc section 4.1) --------
  e(
    "intervention:selenium",
    "metric:tpo_antibodies",
    "lowers",
    1,
    "probable",
    "Selenoproteins limit peroxide damage in thyroid tissue; 200 µg/day selenomethionine lowered TPO-Ab in several RCTs, effect on TSH or symptoms inconsistent.",
    [meta("Wichman 2016 Thyroid", 2016, "10.1089/thy.2016.0256")],
    { when: { pattern: "hashimoto" }, source: "pattern" },
  ),
  e(
    "intervention:iodine_excess",
    "condition:hashimoto",
    "worsens",
    3,
    "established",
    "Iodine excess raises thyroid autoimmunity; kelp, high-dose iodine supplements and some multivitamins are the usual sources.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
    { when: { pattern: "hashimoto" }, source: "pattern" },
  ),
  e(
    "metric:vitamin_d",
    "metric:tpo_antibodies",
    "lowers",
    1,
    "probable",
    "Low vitamin D associates with higher TPO-Ab; correction trials small and mixed.",
    [cohort("Kivity 2011 Cell Mol Immunol", 2011)],
    { when: { pattern: "hashimoto", from: "low" }, source: "pattern" },
  ),
  e(
    "metric:ferritin",
    "metric:free_t4",
    "raises",
    2,
    "established",
    "Thyroid peroxidase is iron-dependent; ferritin below 30 impairs hormone synthesis and blunts levothyroxine response.",
    [trial("Zimmermann 2007 Am J Clin Nutr", 2007)],
    { when: { pattern: "hashimoto", from: "low" }, source: "pattern" },
  ),
  e(
    "behavior:coffee_within_1h_of_lt4",
    "intervention:levothyroxine",
    "confounds",
    3,
    "established",
    "Coffee, calcium, iron and PPIs cut levothyroxine absorption; take on an empty stomach 30–60 min before, or at bedtime.",
    [trial("Benvenga 2008 Thyroid", 2008)],
    { when: { pattern: "hashimoto" }, source: "pattern" },
  ),
  e(
    "intervention:gluten_free_diet",
    "metric:tpo_antibodies",
    "lowers",
    1,
    "speculative",
    "One small trial (Krysiak 2019) in women without coeliac disease; unreplicated, and the forum reports that go with it are uncontrolled.",
    [
      trial("Krysiak 2019 Exp Clin Endocrinol Diabetes", 2019),
      {
        kind: "anecdotal",
        title: "Recurring reports of lower antibodies off gluten",
        source: "r/Hashimotos; no controlled data",
      },
    ],
    { when: { pattern: "hashimoto" }, source: "pattern" },
  ),
  e(
    "intervention:myo_inositol_selenium",
    "metric:tsh",
    "lowers",
    1,
    "speculative",
    "Two small Italian trials (Nordio); not in any guideline.",
    [trial("Nordio 2017 Eur Rev Med Pharmacol Sci", 2017)],
    { when: { pattern: "hashimoto" }, source: "pattern" },
  ),
  e(
    "metric:tpo_antibodies",
    "condition:hashimoto",
    "indicates",
    3,
    "established",
    "TPO antibodies above the lab limit are the definition of autoimmune thyroiditis, and they show years before TSH moves.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
    { when: { from: "high" } },
  ),
  e(
    "metric:anti_thyroglobulin",
    "condition:hashimoto",
    "indicates",
    2,
    "established",
    "Anti-thyroglobulin catches the tenth of people with Hashimoto's who never make TPO antibodies.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
    { when: { from: "high" } },
  ),
  e(
    "condition:hashimoto",
    "risk:hypothyroid",
    "raises",
    3,
    "established",
    "Antibody-positive thyroids fail at about 2 to 5% per year, which is why the TSH is worth repeating.",
    [meta("Rodondi 2010 JAMA", 2010)],
  ),
  e(
    "condition:hashimoto",
    "test:thyroid_ultrasound",
    "requires_test",
    2,
    "established",
    "One ultrasound confirms the diagnosis and baselines the nodules that Hashimoto's makes more common.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
  ),
  e(
    "condition:hashimoto",
    "condition:coeliac",
    "raises",
    2,
    "established",
    "Coeliac disease is four to five times more common with Hashimoto's, and finding it changes the diet advice from speculative to required.",
    [guide("ATA 2014 hypothyroidism guideline", 2014)],
  ),
  e(
    "condition:coeliac",
    "test:coeliac_serology",
    "requires_test",
    2,
    "established",
    "tTG-IgA with a total IgA is the whole screen; the total IgA is there so a deficiency does not hide the result.",
    [guide("BSG coeliac disease guideline")],
  ),
  e(
    "condition:coeliac",
    "metric:ferritin",
    "lowers",
    2,
    "established",
    "Untreated coeliac disease stops iron being absorbed, which is why ferritin under 30 deserves a coeliac screen.",
    [guide("BSG iron deficiency guideline")],
  ),

  // --- pattern-gated: lean-mass hyper-responder (section 4.2) --------------
  e(
    "behavior:low_carb_diet",
    "metric:ldl_cholesterol",
    "raises",
    3,
    "established",
    "In lean, insulin-sensitive people very low carbohydrate intake drives fat trafficking through VLDL and LDL rises steeply.",
    [cohort("Norwitz 2022 Metabolites (lipid energy model)", 2022)],
    { when: { pattern: "lmhr" }, source: "pattern" },
  ),
  e(
    "intervention:carb_reintroduction",
    "metric:ldl_cholesterol",
    "lowers",
    2,
    "probable",
    "Adding 50 to 100 g of carbohydrate a day usually drops the LDL of a hyper-responder within weeks, which both tests the phenotype and gives back the choice.",
    [cohort("Norwitz 2022 Metabolites (lipid energy model)", 2022)],
    { when: { pattern: "lmhr" }, source: "pattern" },
  ),
  e(
    "behavior:low_carb_diet",
    "metric:triglycerides",
    "lowers",
    2,
    "established",
    "Cutting carbohydrate lowers triglycerides in almost everyone, which is why the LMHR triad looks so good apart from LDL.",
    [meta("Bueno 2013 Br J Nutr", 2013)],
  ),
  e(
    "behavior:low_carb_diet",
    "metric:hba1c",
    "lowers",
    2,
    "probable",
    "Less carbohydrate in means less glucose to dispose of, so HbA1c falls even without weight loss.",
    [meta("Bueno 2013 Br J Nutr", 2013)],
  ),

  // --- pattern-gated: early insulin resistance and iron deficiency ---------
  e(
    "metric:insulin",
    "test:ogtt_insulin",
    "requires_test",
    2,
    "established",
    "A fasting insulin above 10 with a normal HbA1c is the exact case an OGTT with insulin is for.",
    [guide("ADA Standards of Care")],
    { when: { pattern: "insulin_resistance_early" }, source: "pattern" },
  ),
  e(
    "intervention:iron",
    "metric:transferrin_saturation",
    "raises",
    2,
    "established",
    "Saturation responds within days of starting iron, well before ferritin does, so it is the early check that the dose is landing.",
    [guide("BSG iron deficiency guideline")],
    { when: { pattern: "iron_deficiency_no_anemia" }, source: "pattern" },
  ),

  // --- phase 16: the conditional edges (spec section 4) -------------------
  // Five hand-written edges whose `when` reads a genotype, an answer or a
  // clock. They are the shape the extraction run in `lib/research.ts` writes
  // by machine, proved by hand first.
  e(
    "behavior:coffee_after_15",
    "metric:sleep_duration",
    "lowers",
    2,
    "established",
    "400 mg of caffeine six hours before bed cost an hour of sleep in a blinded crossover; a CYP1A2*1F slow metaboliser clears that dose far more slowly, so a 15:00 coffee is still working at midnight.",
    [
      trial(
        "Drake 2013 J Clin Sleep Med (caffeine 0, 3 or 6 h before bed)",
        2013,
      ),
      cohort(
        "Sachse 1999 Br J Clin Pharmacol (CYP1A2*1F and caffeine clearance)",
        1999,
      ),
    ],
    {
      id: "coffee_after_15->sleep_duration@cyp1a2_slow",
      grade: "B",
      when: {
        genome: { gene: "CYP1A2", genotype: "slow" },
        fact: { key: "coffee_last_hour", above: 15 },
      },
    },
  ),
  e(
    "behavior:coffee_after_15",
    "metric:sleep_duration",
    "lowers",
    1,
    "probable",
    "A fast metaboliser has cleared most of an afternoon coffee by bedtime, so the same cup costs far less sleep; the effect is not zero, only smaller.",
    [
      trial(
        "Drake 2013 J Clin Sleep Med (caffeine 0, 3 or 6 h before bed)",
        2013,
      ),
      cohort(
        "Sachse 1999 Br J Clin Pharmacol (CYP1A2*1F and caffeine clearance)",
        1999,
      ),
    ],
    {
      id: "coffee_after_15->sleep_duration@cyp1a2_fast",
      grade: "B",
      when: {
        genome: { gene: "CYP1A2", genotype: "fast" },
        fact: { key: "coffee_last_hour", above: 15 },
      },
    },
  ),
  e(
    "metric:sleep_duration",
    "metric:insulin",
    "raises",
    2,
    "established",
    "Six nights at four hours in bed cut glucose tolerance by 30 % in healthy young men, and the meta-analysis finds the same dose-response across cohorts: less sleep, more fasting insulin.",
    [
      trial(
        "Spiegel 1999 Lancet (impact of sleep debt on metabolic function)",
        1999,
      ),
      meta(
        "Reutrakul 2018 Metabolism (sleep, obesity and insulin resistance)",
        2018,
      ),
    ],
    { grade: "A", when: { from: "low" } },
  ),
  e(
    "metric:sleep_duration",
    "metric:triglycerides",
    "raises",
    1,
    "probable",
    "Short sleepers carry higher fasting triglycerides in cross-sectional cohorts; the association survives adjustment but no trial has moved triglycerides by adding sleep alone.",
    [
      cohort(
        "Kaneita 2008 Sleep (usual sleep duration and serum lipids)",
        2008,
      ),
    ],
    { grade: "B", when: { from: "low" } },
  ),
  e(
    "behavior:late_meal",
    "metric:glucose",
    "raises",
    1,
    "probable",
    "The same dinner eaten at 22:00 instead of 18:00 raised the overnight glucose peak in a randomised crossover; eating inside three hours of bed is the version of that anyone can act on.",
    [
      trial(
        "Gu 2020 J Clin Endocrinol Metab (metabolic effects of late dinner)",
        2020,
      ),
    ],
    {
      grade: "B",
      when: { hoursBefore: { eventFact: "last_meal_hour", threshold: 3 } },
    },
  ),
  e(
    "fact:genome:LCT",
    "fact:sym_bowel",
    "raises",
    2,
    "established",
    "Without lactase persistence the lactose in a daily glass of milk reaches the colon and ferments, which is bloating and loose stools rather than any disease.",
    [
      meta(
        "Storhaug 2017 Lancet Gastroenterol Hepatol (global lactose malabsorption)",
        2017,
      ),
      guide("NIH Consensus 2010: lactose intolerance and health", 2010),
    ],
    {
      grade: "A",
      when: {
        genome: { gene: "LCT", genotype: "non-persistent" },
        fact: { key: "dairy_daily", equals: "Yes" },
      },
    },
  ),

  // --- phase 20: the fatigue / late-coffee path (spec section 3.4) -------
  // The four edges the composer's reply needs when somebody writes "tired in
  // the afternoons, last coffee at 4pm". Caffeine and appetite is deliberately
  // absent: no graded human trial measures ghrelin against an afternoon cup.
  e(
    "behavior:coffee_after_15",
    "metric:sleep_duration",
    "lowers",
    2,
    "established",
    "Caffeine blocks the adenosine A1 and A2A receptors that carry the day's sleep pressure, so the pressure is still there and stops being felt. The systematic review finds longer sleep latency, less total sleep and less slow-wave sleep, with a dose and a timing response: the later the cup, the more of it is still on board at lights out.",
    [
      meta(
        "Clark 2017 Sleep Med Rev (coffee, caffeine and sleep: systematic review of epidemiological studies and RCTs)",
        2017,
        "10.1016/j.smrv.2016.01.006",
      ),
      trial(
        "Drake 2013 J Clin Sleep Med (caffeine 0, 3 or 6 h before bed)",
        2013,
      ),
    ],
    {
      id: "coffee_after_15->sleep_duration@anyone",
      grade: "A",
      when: { fact: { key: "coffee_last_hour", above: 15 } },
    },
  ),
  e(
    "behavior:coffee_after_15",
    "fact:sym_energy",
    "raises",
    2,
    "probable",
    "400 mg of caffeine six hours before bed cost an hour of sleep in a blinded crossover, and the person did not notice it going: their own rating of the night was unchanged. An afternoon that starts flat every day is what a shorter, lighter night is made of, so the tiredness and the 16:00 coffee are usually the same fact twice.",
    [
      trial(
        "Drake 2013 J Clin Sleep Med (caffeine 0, 3 or 6 h before bed)",
        2013,
      ),
      meta(
        "Clark 2017 Sleep Med Rev (coffee, caffeine and sleep: systematic review of epidemiological studies and RCTs)",
        2017,
        "10.1016/j.smrv.2016.01.006",
      ),
    ],
    {
      id: "coffee_after_15->sym_energy@afternoons",
      grade: "B",
      when: {
        fact: { key: "coffee_last_hour", above: 15 },
        facts: [{ key: "energy_when", oneOf: ["Afternoons", "All day"] }],
      },
    },
  ),
  e(
    "fact:genome:CYP1A2",
    "behavior:coffee_after_15",
    "worsens",
    2,
    "established",
    "CYP1A2 clears over 90 % of caffeine, and the rs762551 C allele is the low-inducibility form, so the same cup sits in a slow metaboliser far longer. In HARVEST, ten years of follow-up, heavy coffee only carried risk in the AC and CC carriers; the AA fast metabolisers took none.",
    [
      cohort(
        "Mahdavi 2023 JAMA Netw Open (CYP1A2 genetic variation, coffee intake and kidney dysfunction; HARVEST cohort)",
        2023,
      ),
      cohort(
        "Sachse 1999 Br J Clin Pharmacol (CYP1A2*1F and caffeine clearance)",
        1999,
      ),
    ],
    {
      id: "genome:CYP1A2->coffee_after_15",
      grade: "B",
      when: {
        genome: { gene: "CYP1A2", genotype: "slow" },
        // The genotype only says anything about a cup that is late enough to
        // still be on board at bedtime; a 13:00 coffee is cleared either way.
        fact: { key: "coffee_last_hour", above: 15 },
      },
    },
  ),
  e(
    "metric:glucose",
    "fact:sym_energy",
    "raises",
    1,
    "speculative",
    "In 1,070 people wearing continuous monitors, the size of the glucose dip 2–3 h after a meal predicted hunger and how much they ate next better than the peak did. A raised fasting glucose is the marker that those swings are bigger, so a heavy lunch is felt as an afternoon slump rather than seen as a number.",
    [
      cohort(
        "Wyatt 2021 Nat Metab (postprandial glycaemic dips predict appetite and energy intake in healthy individuals; PREDICT)",
        2021,
      ),
    ],
    { id: "glucose->sym_energy@dip", grade: "B", when: { from: "high" } },
  ),
];

/* ── the seed ─────────────────────────────────────────────────────────── */

/**
 * `NODES` and `EDGES` as `kg_nodes` / `kg_edges` rows. Pure, so `kg.test.ts`
 * can round-trip the whole graph without a database.
 */
export function kgRows() {
  return {
    nodes: NODES.map((n) => ({
      id: n.id,
      kind: n.kind as string,
      name: n.name,
      systemId: n.system ?? null,
      codes: n.codes ?? null,
      note: n.note ?? null,
      source: n.source ?? ("seed" as const),
    })),
    edges: EDGES.map((e) => ({
      id: e.id,
      fromId: e.from,
      toId: e.to,
      relation: e.relation as string,
      strength: e.strength as number,
      confidence: e.confidence as string,
      grade: gradeOfEdge(e) as string,
      basis: e.basis as string,
      when_: (e.when ?? null) as Record<string, unknown> | null,
      mechanism: e.mechanism,
      evidence: e.evidence,
      source: e.source as string,
      status: "active",
    })),
  };
}

/**
 * The in-code graph into Postgres.
 *
 *   pnpm --filter simple kg:seed
 *
 * One upsert per row keyed on the id, so a second run changes nothing and the
 * counts are identical. Nothing is deleted: an edge that leaves this file
 * stays in the table until a human drops it, exactly like `hkb:seed`.
 *
 * ponytail: `@/db` is imported here and not at the top of the file, so every
 * page that only wants `NODES` keeps its import graph free of `pg`.
 */
export async function seedKg() {
  const { getDb, kgEdges, kgNodes } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const rows = kgRows();
  const db = getDb();

  for (const n of rows.nodes)
    await db
      .insert(kgNodes)
      .values(n)
      .onConflictDoUpdate({
        target: kgNodes.id,
        set: {
          kind: sql`excluded.kind`,
          name: sql`excluded.name`,
          systemId: sql`excluded.system_id`,
          codes: sql`excluded.codes`,
          note: sql`excluded.note`,
        },
      });

  for (const e of rows.edges)
    await db
      .insert(kgEdges)
      .values(e)
      .onConflictDoUpdate({
        target: kgEdges.id,
        set: {
          relation: sql`excluded.relation`,
          strength: sql`excluded.strength`,
          confidence: sql`excluded.confidence`,
          grade: sql`excluded.grade`,
          basis: sql`excluded.basis`,
          when_: sql`excluded.when_`,
          mechanism: sql`excluded.mechanism`,
          evidence: sql`excluded.evidence`,
          source: sql`excluded.source`,
        },
      });

  return {
    nodes: rows.nodes.length,
    edges: rows.edges.length,
    conditional: rows.edges.filter((e) => e.when_).length,
  };
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  for (const f of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(f);
    } catch {}
  }
  const { pool } = await import("@/db");
  seedKg()
    .then((n) =>
      console.log(
        `[kg:seed] nodes=${n.nodes} edges=${n.edges} conditional=${n.conditional}`,
      ),
    )
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
