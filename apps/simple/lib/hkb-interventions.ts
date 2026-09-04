/**
 * What guidelines and meta-analyses say helps each catalog condition, on file
 * from day one.
 *
 * `lib/research.ts` mints intervention rows from Europe PMC, one condition at a
 * time, and only when the model can run. Until it has run, `hkb_interventions`
 * is empty: the ask box has no ladder to print for "how do I improve my LDL",
 * `pickActions` has nothing under a card, and `project()` has no effect size to
 * draw a line from. This file is the floor under that: one hand-written row per
 * established thing, every row carrying a real paper by DOI, the effect in the
 * marker's own unit, and the sentence from that abstract that holds the number.
 *
 * Rules the rows keep, checked by `lib/hkb-interventions.test.ts` and by
 * `pnpm hkb:verify:seed`:
 *
 *  - `conditionId` is a catalog id; `outcomeFeatureId` is a feature the catalog
 *    mints, or null when the outcome is a clinical event rather than a marker.
 *  - the effect is absolute and in the marker's own unit whenever that marker
 *    is in `MAX_CHANGE`, so `parseEffect` reads the first number as the point
 *    estimate; mmol/L is converted (LDL, HDL, TC x 38.67; TG x 88.57; glucose
 *    x 18.02) and the conversion is stated in the row's comment.
 *  - grades are `baseGrade` semantics and nothing below B: meta-analysis or
 *    guideline is A, a randomised trial is B. Nothing seeded is C, D or E.
 *  - doses are what a person would take and pass `overCeiling`. Potassium and
 *    niacin have a ceiling of zero in `lib/vectors.ts`, so neither is ever
 *    seeded as a supplement; the potassium row is food.
 *  - `quote` is a sentence from that paper's Europe PMC abstract. A guideline
 *    whose abstract carries no number quotes its own recommendation instead and
 *    the verifier prints it as unchecked.
 *
 * Drugs are named as a doctor would prescribe them and labelled `kind: "drug"`.
 * Nothing here decides anything: these rows are read by `pickActions`,
 * `sourcesFor`, `helpLines` and `projections`, and none of them multiplies a
 * probability.
 *
 * Pure data. No database, no clock, no network.
 */
import type { HkbPaper } from "@/db";
import type { InterventionRow } from "./research";

export interface SeedIntervention {
  /** a catalog id from `lib/hkb-catalog.ts`, checked by the test */
  conditionId: string;
  /** "Ezetimibe", "Plant sterols 2 g/day", "Resistance training" */
  name: string;
  kind:
    | "drug"
    | "supplement"
    | "diet"
    | "exercise"
    | "sleep"
    | "behaviour"
    | "procedure";
  /** as a person would take it: "10 mg/day", "2 g/day with meals" */
  dose: string | null;
  /** the paper's own: "12 weeks" */
  duration: string | null;
  /** "metric:ldl_cholesterol"; null for a condition-level outcome */
  outcomeFeatureId: string | null;
  /** absolute, in the marker's unit, first number = the point estimate */
  effect: string | null;
  direction: "up" | "down" | "none";
  /** seeded rows are the established tier only */
  grade: "A" | "B";
  studyType: "meta" | "guideline" | "rct";
  /** "adults on statin therapy, n = 2,382" */
  population: string;
  /** one sentence: who should not, or what to check first */
  caution: string | null;
  paper: {
    doi: string;
    pmid?: string;
    title: string;
    year: number;
    journal: string;
  };
  /** a sentence from the abstract, or a guideline's own recommendation */
  quote: string;
}

export const INTERVENTIONS: SeedIntervention[] = [
  /* ── insulin resistance ────────────────────────────────────────────────
   * The Diabetes Prevention Program is the trial the whole field is built
   * on: 3,234 adults with impaired fasting glucose, three years, lifestyle
   * against metformin against placebo. Exercise carries an HbA1c number of
   * its own (Umpierre 2011, 47 trials), which is why it is the row a
   * projection can be drawn from. Nothing here is in mmol/L. */
  {
    conditionId: "insulin_resistance",
    name: "Structured lifestyle programme (7 % weight loss, 150 min/week)",
    kind: "behaviour",
    dose: "at least 150 minutes of physical activity per week",
    duration: "2.8 years",
    outcomeFeatureId: null,
    effect: "58 % lower incidence of diabetes (95% CI 48 to 66)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with impaired fasting and post-load glucose, n = 3,234",
    caution: null,
    paper: {
      doi: "10.1056/NEJMoa012512",
      pmid: "11832527",
      title:
        "Reduction in the incidence of type 2 diabetes with lifestyle intervention or metformin",
      year: 2002,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The lifestyle intervention reduced the incidence by 58 percent (95 percent confidence interval, 48 to 66 percent) and metformin by 31 percent (95 percent confidence interval, 17 to 43 percent), as compared with placebo; the lifestyle intervention was significantly more effective than metformin.",
  },
  {
    conditionId: "insulin_resistance",
    name: "Metformin",
    kind: "drug",
    dose: "850 mg twice daily",
    duration: "2.8 years",
    outcomeFeatureId: null,
    effect: "31 % lower incidence of diabetes (95% CI 17 to 43)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with impaired fasting and post-load glucose, n = 3,234",
    caution:
      "Prescription only; kidney function is checked first and B12 is checked on long-term use.",
    paper: {
      doi: "10.1056/NEJMoa012512",
      pmid: "11832527",
      title:
        "Reduction in the incidence of type 2 diabetes with lifestyle intervention or metformin",
      year: 2002,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The lifestyle intervention reduced the incidence by 58 percent (95 percent confidence interval, 48 to 66 percent) and metformin by 31 percent (95 percent confidence interval, 17 to 43 percent), as compared with placebo; the lifestyle intervention was significantly more effective than metformin.",
  },
  {
    conditionId: "insulin_resistance",
    name: "Structured exercise training",
    kind: "exercise",
    dose: "more than 150 minutes per week",
    duration: "12 weeks",
    outcomeFeatureId: "metric:hba1c",
    effect: "-0.67 % (95% CI -0.84 to -0.49)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "47 randomised trials in type 2 diabetes, n = 8,538",
    caution: null,
    paper: {
      doi: "10.1001/jama.2011.576",
      pmid: "21540423",
      title:
        "Physical activity advice only or structured exercise training and association with HbA1c levels in type 2 diabetes: a systematic review and meta-analysis",
      year: 2011,
      journal: "JAMA",
    },
    quote:
      "Overall, structured exercise training (23 studies) was associated with a decline in HbA(1c) level (-0.67%; 95% confidence interval [CI], -0.84% to -0.49%; I(2), 91.3%) compared with control participants.",
  },
  {
    conditionId: "insulin_resistance",
    name: "Mediterranean diet",
    kind: "diet",
    dose: null,
    duration: "6 months or more",
    outcomeFeatureId: null,
    effect: "19-23 % lower risk of future diabetes",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "8 meta-analyses and 5 randomised trials in adults at risk",
    caution: null,
    paper: {
      doi: "10.1136/bmjopen-2015-008222",
      pmid: "26260349",
      title:
        "A journey into a Mediterranean diet and type 2 diabetes: a systematic review with meta-analyses",
      year: 2015,
      journal: "BMJ Open",
    },
    quote:
      "2 meta-analyses demonstrated that higher adherence to the Mediterranean diet reduced the risk of future diabetes by 19-23%.",
  },
  {
    conditionId: "insulin_resistance",
    name: "Intensive lifestyle weight loss",
    kind: "behaviour",
    dose: "calorie restriction plus activity, aiming at 7-10 % of body weight",
    duration: "1 year",
    outcomeFeatureId: null,
    effect: "8.6 % of body weight lost at one year, against 0.7 % on control",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "overweight adults with type 2 diabetes, n = 5,145",
    caution: null,
    paper: {
      doi: "10.1056/NEJMoa1212914",
      pmid: "23796131",
      title:
        "Cardiovascular effects of intensive lifestyle intervention in type 2 diabetes",
      year: 2013,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Weight loss was greater in the intervention group than in the control group throughout the study (8.6% vs. 0.7% at 1 year; 6.0% vs. 3.5% at study end).",
  },

  /* ── Hashimoto's thyroiditis ───────────────────────────────────────────
   * Selenium and vitamin D both move the antibody titre in meta-analysis and
   * neither is claimed to move the thyroid itself. Levothyroxine is the ATA
   * guideline's own recommendation; its abstract carries no number, so that
   * row's quote is the recommendation and the verifier prints it unchecked. */
  {
    conditionId: "hashimoto",
    name: "Selenium",
    kind: "supplement",
    dose: "200 µg/day",
    duration: "3 to 6 months",
    outcomeFeatureId: "metric:tpo_antibodies",
    effect: "SMD -0.96 (95% CI -1.36 to -0.56)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "35 randomised trials in Hashimoto thyroiditis, n = 2,358",
    caution:
      "Stop at six months and re-measure; selenium above 400 µg/day is toxic.",
    paper: {
      doi: "10.1089/thy.2023.0556",
      pmid: "38243784",
      title:
        "Selenium Supplementation in Patients with Hashimoto Thyroiditis: A Systematic Review and Meta-Analysis of Randomized Clinical Trials",
      year: 2024,
      journal: "Thyroid",
    },
    quote:
      "In addition, TPOAb (SMD -0.96 [CI -1.36 to -0.56]; 29 cohorts; 2358 participants; I 2 = 90%) and malondialdehyde (MDA; SMD -1.16 [CI -2.29 to -0.02]; 3 cohorts; 248 participants; I 2 = 85%) decreased in patients with and without THRT.",
  },
  {
    conditionId: "hashimoto",
    name: "Vitamin D (cholecalciferol)",
    kind: "supplement",
    dose: "1000-4000 IU/day",
    duration: "more than 12 weeks",
    outcomeFeatureId: "metric:tpo_antibodies",
    effect: "SMD -1.084 (95% CI -1.624 to -0.545)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "12 trials in Hashimoto thyroiditis, n = 862",
    caution:
      "Check 25-OH-D first; the trials supplemented people who were low, not people who were replete.",
    paper: {
      doi: "10.1097/MD.0000000000036759",
      pmid: "38206745",
      title:
        "Effects of vitamin D supplementation on autoantibodies and thyroid function in patients with Hashimoto's thyroiditis: A systematic review and meta-analysis",
      year: 2023,
      journal: "Medicine",
    },
    quote:
      "Vitamin D supplementation has a significant impact on reducing the titers of TPO-Ab (SMD = -1.084, 95% CI = -1.624 to -0.545) and TG-Ab (SMD = -0.996, 95% CI = -1.579 to -0.413) in patients with HT, and it also improves thyroid function by decreasing TSH level (SMD = -0.167, 95% CI = -0.302 to 0.031) and increasing FT3 (SMD = 0.549, 95% CI = 0.077-1.020) and FT4 (SMD = 0.734, 95% CI = 0.184-1.285) levels.",
  },
  {
    conditionId: "hashimoto",
    name: "Levothyroxine",
    kind: "drug",
    dose: "1.6 µg/kg/day, taken fasting",
    duration: "6 weeks to the first re-check",
    outcomeFeatureId: null,
    effect: "TSH back into the reference range on a weight-based dose",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "adults with primary hypothyroidism",
    caution:
      "Prescription only; the dose is titrated on TSH six weeks after any change, and started low in older people and in heart disease.",
    paper: {
      doi: "10.1089/thy.2014.0028",
      pmid: "25266247",
      title:
        "Guidelines for the treatment of hypothyroidism: prepared by the American Thyroid Association task force on thyroid hormone replacement",
      year: 2014,
      journal: "Thyroid",
    },
    quote:
      "Levothyroxine is recommended as the preparation of choice for the treatment of hypothyroidism.",
  },

  /* ── iron deficiency ───────────────────────────────────────────────────
   * Alternate-day dosing is the one thing that changed in the last decade:
   * hepcidin rises for a day after a dose, so a daily tablet absorbs worse
   * than the same tablet every other day (Stoffel 2017, isotope-labelled).
   * The tolerability row is here because most people stop the tablet before
   * the ferritin moves. */
  {
    conditionId: "iron_deficiency",
    name: "Oral iron on alternate days",
    kind: "supplement",
    dose: "60 mg elemental iron every other morning",
    duration: "28 days",
    outcomeFeatureId: null,
    effect:
      "21.8 % cumulative fractional absorption on alternate days against 16.3 % on consecutive days",
    direction: "up",
    grade: "B",
    studyType: "rct",
    population: "iron-depleted women aged 18-40, n = 40",
    caution:
      "Iron is only taken when ferritin is low; do not take it on a normal ferritin.",
    paper: {
      doi: "10.1016/S2352-3026(17)30182-5",
      pmid: "29032957",
      title:
        "Iron absorption from oral iron supplements given on consecutive versus alternate days and as single morning doses versus twice-daily split dosing in iron-depleted women: two open-label, randomised controlled trials",
      year: 2017,
      journal: "The Lancet Haematology",
    },
    quote:
      "At the end of treatment (14 days for the consecutive-day group and 28 days for the alternate-day group), geometric mean (-SD, +SD) cumulative fractional iron absorptions were 16·3% (9·3, 28·8) in the consecutive-day group versus 21·8% (13·7, 34·6) in the alternate-day group (p=0·0013), and cumulative total iron absorption was 131·0 mg (71·4, 240·5) versus 175·3 mg (110·3, 278·5; p=0·0010).",
  },
  {
    conditionId: "iron_deficiency",
    name: "Oral iron replacement to a haemoglobin response",
    kind: "supplement",
    dose: "one tablet of ferrous sulfate 200 mg (65 mg elemental) daily",
    duration: "4 weeks to the first re-check",
    outcomeFeatureId: "metric:hemoglobin",
    effect: "+20 g/L over four weeks of treatment",
    direction: "up",
    grade: "A",
    studyType: "guideline",
    population: "adults with iron deficiency anaemia",
    caution:
      "Iron deficiency in an adult is a symptom: the gut is investigated at the same time, not afterwards.",
    paper: {
      doi: "10.1136/gutjnl-2021-325210",
      pmid: "34497146",
      title:
        "British Society of Gastroenterology guidelines for the management of iron deficiency anaemia in adults",
      year: 2021,
      journal: "Gut",
    },
    quote:
      "The haemoglobin concentration should rise by approximately 20 g/L over 4 weeks of iron replacement therapy.",
  },
  {
    conditionId: "iron_deficiency",
    name: "Ferrous sulfate at the lowest effective dose",
    kind: "supplement",
    dose: "one tablet daily or alternate days",
    duration: "up to 12 weeks",
    outcomeFeatureId: null,
    effect:
      "odds ratio 2.32 (95% CI 1.74-3.08) for gastrointestinal side-effects against placebo",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "43 randomised trials in adults, n = 6,831",
    caution:
      "Nausea and constipation are the usual reason a course fails; the meta-analysis found no dose relationship, so a smaller dose does not buy comfort.",
    paper: {
      doi: "10.1371/journal.pone.0117383",
      pmid: "25700159",
      title:
        "Ferrous sulfate supplementation causes significant gastrointestinal side-effects in adults: a systematic review and meta-analysis",
      year: 2015,
      journal: "PLoS One",
    },
    quote:
      "Our meta-analysis confirms that ferrous sulfate is associated with a significant increase in gastrointestinal-specific side-effects but does not find a relationship with dose.",
  },

  /* ── iron loss or malabsorption from the gut ───────────────────────────
   * This condition is the cause, not the anaemia, so the rows are what finds
   * and fixes the source: endoscopy both ends, coeliac serology, and
   * Helicobacter eradication. The endoscopy and coeliac rows quote their
   * guideline's own recommendation because neither abstract carries it. */
  {
    conditionId: "iron_deficiency_cause_gi",
    name: "Bidirectional endoscopy (gastroscopy and colonoscopy)",
    kind: "procedure",
    dose: null,
    duration: null,
    outcomeFeatureId: null,
    effect: "the source of the loss found in about one in ten examinations",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults with unexplained iron deficiency anaemia",
    caution:
      "Sedation and a small perforation risk; the alternative is leaving a bowel cancer undiagnosed.",
    paper: {
      doi: "10.1136/gutjnl-2021-325210",
      pmid: "34497146",
      title:
        "British Society of Gastroenterology guidelines for the management of iron deficiency anaemia in adults",
      year: 2021,
      journal: "Gut",
    },
    quote:
      "Upper and lower gastrointestinal investigation is recommended in all men and post-menopausal women with iron deficiency anaemia.",
  },
  {
    conditionId: "iron_deficiency_cause_gi",
    name: "Coeliac serology, then a gluten-free diet if positive",
    kind: "diet",
    dose: null,
    duration: "lifelong once coeliac disease is confirmed",
    outcomeFeatureId: "metric:ttg_iga",
    effect: "serology falls and the mucosa recovers on a strict diet",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "adults with iron deficiency anaemia",
    caution:
      "Serology is only valid while gluten is still being eaten; do not start the diet before the test.",
    paper: {
      doi: "10.1038/ajg.2013.79",
      pmid: "23609613",
      title:
        "ACG clinical guidelines: diagnosis and management of celiac disease",
      year: 2013,
      journal: "American Journal of Gastroenterology",
    },
    quote:
      "Patients with iron deficiency anemia should be tested for celiac disease, and patients with confirmed celiac disease should be treated with a gluten-free diet.",
  },
  {
    conditionId: "iron_deficiency_cause_gi",
    name: "Helicobacter pylori test and eradication",
    kind: "drug",
    dose: "a two-week course of triple or quadruple therapy",
    duration: "14 days",
    outcomeFeatureId: null,
    effect: "relative risk of gastric cancer 0.66 (95% CI 0.46 to 0.95)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population:
      "6 randomised trials in healthy infected adults, n = 6,497",
    caution:
      "Antibiotics; eradication is confirmed with a breath or stool test at least four weeks after the course.",
    paper: {
      doi: "10.1136/bmj.g3174",
      pmid: "24846275",
      title:
        "Helicobacter pylori eradication therapy to prevent gastric cancer in healthy asymptomatic infected individuals: systematic review and meta-analysis of randomised controlled trials",
      year: 2014,
      journal: "BMJ",
    },
    quote:
      "Fifty one (1.6%) gastric cancers occurred among 3294 individuals who received eradication therapy versus 76 (2.4%) in 3203 control subjects (relative risk 0.66, 95% confidence interval 0.46 to 0.95), with no heterogeneity between studies (I(2)=0%, P=0.60).",
  },

  /* ── polycystic ovary syndrome ─────────────────────────────────────────
   * The international guideline puts lifestyle first and letrozole ahead of
   * clomiphene for ovulation induction; the two drug rows carry their own
   * trial and meta-analysis rather than the guideline's summary of them. */
  {
    conditionId: "pcos",
    name: "Weight loss and physical activity",
    kind: "behaviour",
    dose: "150 minutes of activity a week, plus an energy deficit if overweight",
    duration: "6 months",
    outcomeFeatureId: null,
    effect: "5-10 % of body weight restores ovulation in many women",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "women with polycystic ovary syndrome",
    caution: null,
    paper: {
      doi: "10.1093/humrep/dey256",
      pmid: "30052961",
      title:
        "Recommendations from the international evidence-based guideline for the assessment and management of polycystic ovary syndrome",
      year: 2018,
      journal: "Human Reproduction",
    },
    quote:
      "Healthy lifestyle behaviours encompassing healthy eating and regular physical activity should be recommended in all those with PCOS.",
  },
  {
    conditionId: "pcos",
    name: "Metformin",
    kind: "drug",
    dose: "500 mg three times daily",
    duration: "6 months",
    outcomeFeatureId: null,
    effect: "odds ratio 3.88 (95% CI 2.25 to 6.69) for ovulation against placebo",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "13 randomised trials in women with PCOS, n = 543",
    caution:
      "Prescription only; gastrointestinal side-effects are common in the first weeks.",
    paper: {
      doi: "10.1136/bmj.327.7421.951",
      pmid: "14576245",
      title: "Metformin in polycystic ovary syndrome: systematic review and meta-analysis",
      year: 2003,
      journal: "BMJ",
    },
    quote:
      "Meta-analysis showed that metformin is effective in achieving ovulation in women with polycystic ovary syndrome, with odds ratios of 3.88 (95% confidence interval 2.25 to 6.69) for metformin compared with placebo and 4.41 (2.37 to 8.22) for metformin and clomifene compared with clomifene alone.",
  },
  {
    conditionId: "pcos",
    name: "Letrozole for ovulation induction",
    kind: "drug",
    dose: "2.5-7.5 mg/day on cycle days 3 to 7",
    duration: "up to five cycles",
    outcomeFeatureId: null,
    effect: "27.5 % cumulative live births against 19.1 % on clomiphene",
    direction: "up",
    grade: "B",
    studyType: "rct",
    population: "infertile women with PCOS, n = 750",
    caution:
      "Prescription only, and only when pregnancy is the goal; it is not a treatment for the syndrome itself.",
    paper: {
      doi: "10.1056/NEJMoa1313517",
      pmid: "25006718",
      title: "Letrozole versus clomiphene for infertility in the polycystic ovary syndrome",
      year: 2014,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Women who received letrozole had more cumulative live births than those who received clomiphene (103 of 374 [27.5%] vs. 72 of 376 [19.1%], P=0.007; rate ratio for live birth, 1.44; 95% confidence interval, 1.10 to 1.87) without significant differences in overall congenital anomalies, though there were four major congenital anomalies in the letrozole group versus one in the clomiphene group (P=0.65).",
  },
  {
    conditionId: "pcos",
    name: "Metformin added to clomifene",
    kind: "drug",
    dose: "1500-2000 mg/day with clomifene",
    duration: "6 months",
    outcomeFeatureId: null,
    effect: "odds ratio 1.59 (95% CI 1.27 to 1.99) for clinical pregnancy",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "48 trials in women with PCOS and subfertility, n = 4,451",
    caution:
      "Prescription only; the combination raises gastrointestinal side-effects fourfold.",
    paper: {
      doi: "10.1002/14651858.CD003053.pub6",
      pmid: "29183107",
      title:
        "Insulin-sensitising drugs (metformin, rosiglitazone, pioglitazone, D-chiro-inositol) for women with polycystic ovary syndrome, oligo amenorrhoea and subfertility",
      year: 2017,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "However, the combined therapy group had higher rates of clinical pregnancy (OR 1.59, 95% CI 1.27 to 1.99, 16 studies, 1529 women, I 2 = 33%, moderate-quality evidence) and ovulation (OR 1.57, 95% CI 1.28 to 1.92, 21 studies, 1624 women, I 2 = 64%, moderate-quality evidence).",
  },

  /* ── obstructive sleep apnoea ──────────────────────────────────────────
   * CPAP and a mandibular device both drop blood pressure by a similar small
   * amount (Bratton 2015, 51 studies); weight loss is the only thing that
   * changes the apnoea itself. Blood pressure is in mmHg, so `parseEffect`
   * reads these directly. */
  {
    conditionId: "sleep_apnoea",
    name: "CPAP",
    kind: "procedure",
    dose: "nightly, at the pressure the titration set",
    duration: "at least 4 weeks",
    outcomeFeatureId: "metric:bp_systolic",
    effect: "-2.5 mmHg (95% CI 1.5 to 3.5)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "51 studies in obstructive sleep apnoea, n = 4,888",
    caution:
      "The blood pressure effect is small; the reason to use CPAP is the sleepiness and the apnoeas.",
    paper: {
      doi: "10.1001/jama.2015.16303",
      pmid: "26624827",
      title:
        "CPAP vs Mandibular Advancement Devices and Blood Pressure in Patients With Obstructive Sleep Apnea: A Systematic Review and Meta-analysis",
      year: 2015,
      journal: "JAMA",
    },
    quote:
      "Compared with an inactive control, CPAP was associated with a reduction in SBP of 2.5 mm Hg (95% CI, 1.5 to 3.5 mm Hg",
  },
  {
    conditionId: "sleep_apnoea",
    name: "Mandibular advancement device",
    kind: "procedure",
    dose: "a custom-fitted device worn nightly",
    duration: "at least 4 weeks",
    outcomeFeatureId: "metric:bp_systolic",
    effect: "-2.1 mmHg against an inactive control",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "51 studies in obstructive sleep apnoea, n = 4,888",
    caution:
      "Fitted by a dentist; jaw pain and bite change are the usual reasons people stop.",
    paper: {
      doi: "10.1001/jama.2015.16303",
      pmid: "26624827",
      title:
        "CPAP vs Mandibular Advancement Devices and Blood Pressure in Patients With Obstructive Sleep Apnea: A Systematic Review and Meta-analysis",
      year: 2015,
      journal: "JAMA",
    },
    quote:
      "Among patients with obstructive sleep apnea, both CPAP and MADs were associated with reductions in BP.",
  },
  {
    conditionId: "sleep_apnoea",
    name: "Intensive weight-loss programme",
    kind: "behaviour",
    dose: "calorie restriction plus activity",
    duration: "1 year",
    outcomeFeatureId: null,
    effect: "-10.8 kg at one year against -0.6 kg on control",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "obese adults with type 2 diabetes and sleep apnoea, n = 264",
    caution: null,
    paper: {
      doi: "10.1001/archinternmed.2009.266",
      pmid: "19786682",
      title:
        "A randomized study on the effect of weight loss on obstructive sleep apnea among obese patients with type 2 diabetes: the Sleep AHEAD study",
      year: 2009,
      journal: "Archives of Internal Medicine",
    },
    quote:
      "The ILI participants lost more weight at 1 year than did DSE participants (10.8 kg vs 0.6 kg",
  },
  {
    conditionId: "sleep_apnoea",
    name: "CPAP plus weight loss together",
    kind: "behaviour",
    dose: "nightly CPAP alongside a weight-loss programme",
    duration: "24 weeks",
    outcomeFeatureId: null,
    effect:
      "a larger fall in systolic and mean arterial pressure than either alone",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with obesity and moderate-to-severe apnoea, n = 181",
    caution: null,
    paper: {
      doi: "10.1056/NEJMoa1306187",
      pmid: "24918371",
      title: "CPAP, weight loss, or both for obstructive sleep apnea",
      year: 2014,
      journal: "New England Journal of Medicine",
    },
    quote:
      "In per-protocol analyses, which included 90 participants who met prespecified criteria for adherence, the combined interventions resulted in a larger reduction in systolic blood pressure and mean arterial pressure than did either CPAP or weight loss alone.",
  },

  /* ── MASLD ─────────────────────────────────────────────────────────────
   * Vitamin E and semaglutide both have a histology endpoint; the
   * Mediterranean diet row is a small crossover trial with an MRS endpoint,
   * which is why its population says n = 12 out loud. */
  {
    conditionId: "nafld",
    name: "Vitamin E",
    kind: "supplement",
    dose: "800 IU/day",
    duration: "96 weeks",
    outcomeFeatureId: null,
    effect: "43 % improved against 19 % on placebo",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with biopsy-proven steatohepatitis, without diabetes, n = 247",
    caution:
      "Only studied in people without diabetes and with biopsy-proven disease; long-term high-dose vitamin E is not benign.",
    paper: {
      doi: "10.1056/NEJMoa0907929",
      pmid: "20427778",
      title: "Pioglitazone, vitamin E, or placebo for nonalcoholic steatohepatitis",
      year: 2010,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Vitamin E therapy, as compared with placebo, was associated with a significantly higher rate of improvement in nonalcoholic steatohepatitis (43% vs. 19%, P=0.001), but the difference in the rate of improvement with pioglitazone as compared with placebo was not significant (34% and 19%, respectively; P=0.04).",
  },
  {
    conditionId: "nafld",
    name: "Semaglutide",
    kind: "drug",
    dose: "0.4 mg once daily by injection",
    duration: "72 weeks",
    outcomeFeatureId: null,
    effect: "59 % reached resolution against 17 % on placebo",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with biopsy-confirmed steatohepatitis, n = 320",
    caution:
      "Prescription only; nausea is common and it is not started in pregnancy or with a history of medullary thyroid cancer.",
    paper: {
      doi: "10.1056/NEJMoa2028395",
      pmid: "33185364",
      title:
        "A Placebo-Controlled Trial of Subcutaneous Semaglutide in Nonalcoholic Steatohepatitis",
      year: 2021,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The percentage of patients in whom NASH resolution was achieved with no worsening of fibrosis was 40% in the 0.1-mg group, 36% in the 0.2-mg group, 59% in the 0.4-mg group, and 17% in the placebo group (P",
  },
  {
    conditionId: "nafld",
    name: "Mediterranean diet",
    kind: "diet",
    dose: null,
    duration: "6 weeks",
    outcomeFeatureId: null,
    effect: "39 % relative reduction in liver fat against 7 % on a low-fat diet",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "non-diabetic adults with biopsy-proven NAFLD, n = 12",
    caution:
      "Twelve people in a crossover trial: the direction is solid, the size is not.",
    paper: {
      doi: "10.1016/j.jhep.2013.02.012",
      pmid: "23485520",
      title:
        "The Mediterranean diet improves hepatic steatosis and insulin sensitivity in individuals with non-alcoholic fatty liver disease",
      year: 2013,
      journal: "Journal of Hepatology",
    },
    quote:
      "There was a significant relative reduction in hepatic steatosis after the MD compared with the LF/HCD: 39 ± 4% versus 7 ± 3%, as measured by (1)H-MRS (p=0.012).",
  },

  /* ── vitamin B12 deficiency ────────────────────────────────────────────
   * The Cochrane review is the one that matters: high-dose oral works as
   * well as an injection for the blood and the nerves, which is the whole
   * argument about how this is treated. */
  {
    conditionId: "b12_deficiency",
    name: "Oral cyanocobalamin",
    kind: "supplement",
    dose: "1000-2000 µg/day",
    duration: "90 days to 4 months",
    outcomeFeatureId: "metric:vitamin_b12",
    effect: "as effective as an intramuscular course on blood and nerve response",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "2 randomised trials in B12-deficient adults, n = 108",
    caution:
      "Pernicious anaemia and post-gastrectomy still need lifelong treatment, oral or injected.",
    paper: {
      doi: "10.1002/14651858.CD004655.pub2",
      pmid: "16034940",
      title: "Oral vitamin B12 versus intramuscular vitamin B12 for vitamin B12 deficiency",
      year: 2005,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "High oral doses of B12 (1000 mcg and 2000 mcg) were as effective as intramuscular administration in achieving haematological and neurological responses.",
  },
  {
    conditionId: "b12_deficiency",
    name: "Intramuscular hydroxocobalamin",
    kind: "drug",
    dose: "1000 µg, initially daily, then weekly, then monthly",
    duration: "lifelong in pernicious anaemia",
    outcomeFeatureId: "metric:vitamin_b12",
    effect: "haematological and neurological response within weeks",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "2 randomised trials in B12-deficient adults, n = 108",
    caution:
      "Injected by a nurse; neurological symptoms are treated without waiting for the blood count.",
    paper: {
      doi: "10.1002/14651858.CD004655.pub2",
      pmid: "16034940",
      title: "Oral vitamin B12 versus intramuscular vitamin B12 for vitamin B12 deficiency",
      year: 2005,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "The evidence derived from these limited studies suggests that 2000 mcg doses of oral vitamin B12 daily and 1000 mcg doses initially daily and thereafter weekly and then monthly may be as effective as intramuscular administration in obtaining short term haematological and neurological responses in vitamin B12 deficient patients.",
  },
  {
    conditionId: "b12_deficiency",
    name: "Treat the cause, not only the level",
    kind: "behaviour",
    dose: null,
    duration: null,
    outcomeFeatureId: null,
    effect: "intrinsic factor antibodies and coeliac serology change the plan",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults with a low serum cobalamin",
    caution:
      "Folate is never given alone to someone who may be B12 deficient: it can mask the anaemia while the nerves keep going.",
    paper: {
      doi: "10.1111/bjh.12959",
      pmid: "24942828",
      title: "Guidelines for the diagnosis and treatment of cobalamin and folate disorders",
      year: 2014,
      journal: "British Journal of Haematology",
    },
    quote:
      "Testing for anti-intrinsic factor antibody is recommended in patients with cobalamin deficiency of undetermined cause.",
  },

  /* ── high blood pressure ───────────────────────────────────────────────
   * Every number here is already in mmHg, so nothing is converted. The
   * potassium side of DASH is food, never a supplement: `CEILINGS` in
   * `lib/vectors.ts` sets potassium to zero and this file respects it. */
  {
    conditionId: "hypertension",
    name: "DASH eating pattern (fruit, vegetables, low-fat dairy)",
    kind: "diet",
    dose: null,
    duration: "8 weeks",
    outcomeFeatureId: "metric:bp_systolic",
    effect: "-5.5 mmHg against control, and -11.4 mmHg in those already hypertensive",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with systolic pressure below 160 mmHg, n = 459",
    caution: null,
    paper: {
      doi: "10.1056/NEJM199704173361601",
      pmid: "9099655",
      title: "A clinical trial of the effects of dietary patterns on blood pressure",
      year: 1997,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The combination diet reduced systolic and diastolic blood pressure by 5.5 and 3.0 mm Hg more, respectively, than the control diet",
  },
  {
    conditionId: "hypertension",
    name: "Lower sodium intake",
    kind: "diet",
    dose: "below 100 mmol (about 2.3 g sodium) a day",
    duration: "30 days per level",
    outcomeFeatureId: "metric:bp_systolic",
    effect: "-2.1 mmHg per step down in sodium, and more from high to low",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults on a control or DASH diet, n = 412",
    caution: null,
    paper: {
      doi: "10.1056/NEJM200101043440101",
      pmid: "11136953",
      title:
        "Effects on blood pressure of reduced dietary sodium and the Dietary Approaches to Stop Hypertension (DASH) diet",
      year: 2001,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Reducing the sodium intake from the high to the intermediate level reduced the systolic blood pressure by 2.1 mm Hg",
  },
  {
    conditionId: "hypertension",
    name: "Endurance exercise",
    kind: "exercise",
    dose: "30 minutes of brisk aerobic work, most days",
    duration: "at least 4 weeks",
    outcomeFeatureId: "metric:bp_systolic",
    effect: "-3.5 mmHg (confidence limits -4.6 to -2.3)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "93 randomised trials in adults, n = 5,223",
    caution: null,
    paper: {
      doi: "10.1161/JAHA.112.004473",
      pmid: "23525435",
      title: "Exercise training for blood pressure: a systematic review and meta-analysis",
      year: 2013,
      journal: "Journal of the American Heart Association",
    },
    quote:
      "Systolic BP (SBP) was reduced after endurance (-3.5 mm Hg [confidence limits -4.6 to -2.3]), dynamic resistance (-1.8 mm Hg [-3.7 to -0.011]), and isometric resistance (-10.9 mm Hg [-14.5 to -7.4]) but not after combined training.",
  },
  {
    conditionId: "hypertension",
    name: "Isometric resistance training (wall sit, handgrip holds)",
    kind: "exercise",
    dose: "four two-minute holds, three days a week",
    duration: "at least 4 weeks",
    outcomeFeatureId: "metric:bp_systolic",
    effect: "-10.9 mmHg (confidence limits -14.5 to -7.4)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "5 isometric resistance groups inside 93 trials",
    caution:
      "Only five trials carry this estimate; it is the largest effect in the meta-analysis and the least certain.",
    paper: {
      doi: "10.1161/JAHA.112.004473",
      pmid: "23525435",
      title: "Exercise training for blood pressure: a systematic review and meta-analysis",
      year: 2013,
      journal: "Journal of the American Heart Association",
    },
    quote:
      "Systolic BP (SBP) was reduced after endurance (-3.5 mm Hg [confidence limits -4.6 to -2.3]), dynamic resistance (-1.8 mm Hg [-3.7 to -0.011]), and isometric resistance (-10.9 mm Hg [-14.5 to -7.4]) but not after combined training.",
  },
  {
    conditionId: "hypertension",
    name: "Cutting alcohol by half",
    kind: "behaviour",
    dose: "from six or more drinks a day to about half that",
    duration: "at least 7 days",
    outcomeFeatureId: "metric:bp_systolic",
    effect: "-5.5 mmHg (95% CI -6.70 to -4.30)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "36 trials, n = 2,865 (2,464 men and 401 women)",
    caution:
      "The effect is only this large in heavy drinkers; in light drinkers the trials show almost nothing.",
    paper: {
      doi: "10.1016/S2468-2667(17)30003-8",
      pmid: "29253389",
      title:
        "The effect of a reduction in alcohol consumption on blood pressure: a systematic review and meta-analysis",
      year: 2017,
      journal: "The Lancet Public Health",
    },
    quote:
      "Reduction in systolic blood pressure (mean difference -5·50 mm Hg, 95% CI -6·70 to -4·30) and diastolic blood pressure (-3·97, -4·70 to -3·25) was strongest in participants who drank six or more drinks per day if they reduced their intake by about 50%.",
  },
  {
    conditionId: "hypertension",
    name: "Drug treatment to a systolic target below 120 mmHg",
    kind: "drug",
    dose: "as many agents as the target needs",
    duration: "3.3 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.75 (95% CI 0.64 to 0.89) for major cardiovascular events",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults at high cardiovascular risk without diabetes, n = 9,361",
    caution:
      "The tighter target bought more hypotension, syncope and kidney injury; it is a decision, not a default.",
    paper: {
      doi: "10.1056/NEJMoa1511939",
      pmid: "26551272",
      title: "A Randomized Trial of Intensive versus Standard Blood-Pressure Control",
      year: 2015,
      journal: "New England Journal of Medicine",
    },
    quote:
      "At 1 year, the mean systolic blood pressure was 121.4 mm Hg in the intensive-treatment group and 136.2 mm Hg in the standard-treatment group.",
  },

  /* ── atherosclerotic risk ──────────────────────────────────────────────
   * The full ladder, in the order a lipid clinic climbs it. Every LDL number
   * is in mg/dL; where the paper printed mmol/L it is multiplied by 38.67 and
   * the arithmetic is in the row's effect string. The trials whose LDL fall
   * is larger than `MAX_CHANGE` all ran for a year or more, which is why the
   * twelve-week cap in the test does not apply to them. */
  {
    conditionId: "ascvd_risk",
    name: "Moderate-intensity statin",
    kind: "drug",
    dose: "atorvastatin 10-20 mg/day or equivalent",
    duration: "1 year",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-42 mg/dL (mean 1.09 mmol/L x 38.67)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "14 randomised statin trials, n = 90,056",
    caution:
      "Prescription only; muscle symptoms and liver enzymes are the usual checks.",
    paper: {
      doi: "10.1016/S0140-6736(05)67394-1",
      pmid: "16214597",
      title:
        "Efficacy and safety of cholesterol-lowering treatment: prospective meta-analysis of data from 90,056 participants in 14 randomised trials of statins",
      year: 2005,
      journal: "The Lancet",
    },
    quote:
      "Mean LDL cholesterol differences at 1 year ranged from 0.35 mmol/L to 1.77 mmol/L (mean 1.09) in these trials.",
  },
  {
    conditionId: "ascvd_risk",
    name: "High-intensity statin",
    kind: "drug",
    dose: "atorvastatin 40-80 mg/day or rosuvastatin 20-40 mg/day",
    duration: "1 year",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-19.7 mg/dL further than a moderate dose (0.51 mmol/L x 38.67)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "26 randomised trials, n = 170,000",
    caution:
      "Prescription only; the higher dose is where muscle symptoms and new diabetes start to show.",
    paper: {
      doi: "10.1016/S0140-6736(10)61350-5",
      pmid: "21067804",
      title:
        "Efficacy and safety of more intensive lowering of LDL cholesterol: a meta-analysis of data from 170,000 participants in 26 randomised trials",
      year: 2010,
      journal: "The Lancet",
    },
    quote:
      "In the trials of more versus less intensive statin therapy, the weighted mean further reduction in LDL cholesterol at 1 year was 0·51 mmol/L.",
  },
  {
    conditionId: "ascvd_risk",
    name: "Ezetimibe added to a statin",
    kind: "drug",
    dose: "10 mg/day",
    duration: "6 years",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-15.8 mg/dL on top of a statin (53.7 against 69.5 mg/dL)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults after an acute coronary syndrome, n = 18,144",
    caution: "Prescription only.",
    paper: {
      doi: "10.1056/NEJMoa1410489",
      pmid: "26039521",
      title: "Ezetimibe Added to Statin Therapy after Acute Coronary Syndromes",
      year: 2015,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The median time-weighted average LDL cholesterol level during the study was 53.7 mg per deciliter (1.4 mmol per liter) in the simvastatin-ezetimibe group, as compared with 69.5 mg per deciliter (1.8 mmol per liter) in the simvastatin-monotherapy group",
  },
  {
    conditionId: "ascvd_risk",
    name: "Bempedoic acid",
    kind: "drug",
    dose: "180 mg/day",
    duration: "6 months",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-29.2 mg/dL against placebo at six months",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "statin-intolerant adults at high risk, n = 13,970",
    caution:
      "Prescription only; gout and gallstones were commoner on the drug, and uric acid and liver enzymes rise a little.",
    paper: {
      doi: "10.1056/NEJMoa2215024",
      pmid: "36876740",
      title: "Bempedoic Acid and Cardiovascular Outcomes in Statin-Intolerant Patients",
      year: 2023,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The mean LDL cholesterol level at baseline was 139.0 mg per deciliter in both groups, and after 6 months, the reduction in the level was greater with bempedoic acid than with placebo by 29.2 mg per deciliter; the observed difference in the percent reductions was 21.1 percentage points in favor of bempedoic acid.",
  },
  {
    conditionId: "ascvd_risk",
    name: "PCSK9 inhibitor (evolocumab)",
    kind: "drug",
    dose: "140 mg every 2 weeks, or 420 mg monthly, by injection",
    duration: "48 weeks",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-62 mg/dL (median 92 to 30 mg/dL, a 59 % reduction)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with established atherosclerotic disease on a statin, n = 27,564",
    caution:
      "Prescription only and expensive; it is added when a statin and ezetimibe have not been enough.",
    paper: {
      doi: "10.1056/NEJMoa1615664",
      pmid: "28304224",
      title: "Evolocumab and Clinical Outcomes in Patients with Cardiovascular Disease",
      year: 2017,
      journal: "New England Journal of Medicine",
    },
    quote:
      "At 48 weeks, the least-squares mean percentage reduction in LDL cholesterol levels with evolocumab, as compared with placebo, was 59%, from a median baseline value of 92 mg per deciliter (2.4 mmol per liter) to 30 mg per deciliter (0.78 mmol per liter)",
  },
  {
    conditionId: "ascvd_risk",
    name: "PCSK9 inhibitor (alirocumab)",
    kind: "drug",
    dose: "75 mg every 2 weeks by injection, adjusted to target",
    duration: "2.8 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.85 (95% CI 0.78 to 0.93) for recurrent ischaemic events",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults 1-12 months after an acute coronary syndrome, n = 18,924",
    caution: "Prescription only.",
    paper: {
      doi: "10.1056/NEJMoa1801174",
      pmid: "30403574",
      title: "Alirocumab and Cardiovascular Outcomes after Acute Coronary Syndrome",
      year: 2018,
      journal: "New England Journal of Medicine",
    },
    quote:
      "A composite primary end-point event occurred in 903 patients (9.5%) in the alirocumab group and in 1052 patients (11.1%) in the placebo group (hazard ratio, 0.85; 95% confidence interval [CI], 0.78 to 0.93; P",
  },
  {
    conditionId: "ascvd_risk",
    name: "Plant sterols and stanols",
    kind: "supplement",
    dose: "2-3 g/day with a meal",
    duration: "at least 3 weeks",
    outcomeFeatureId: null,
    effect: "12 % lower LDL cholesterol at about 3 g/day (relative, no absolute figure pooled)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "124 randomised studies, 201 strata",
    caution:
      "Sold in spreads and yoghurt drinks; the effect stops climbing above about 3 g/day.",
    paper: {
      doi: "10.1017/S0007114514000750",
      pmid: "24780090",
      title:
        "LDL-cholesterol-lowering effect of plant sterols and stanols across different dose ranges: a meta-analysis of randomised controlled studies",
      year: 2014,
      journal: "British Journal of Nutrition",
    },
    quote:
      "In conclusion, the LDL-cholesterol-lowering effect of both plant sterols and stanols continues to increase up to intakes of approximately 3 g/d to an average effect of 12%.",
  },
  {
    conditionId: "ascvd_risk",
    name: "Oat beta-glucan",
    kind: "diet",
    dose: "3 g/day or more (about 70 g of oats)",
    duration: "at least 3 weeks",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-9.7 mg/dL (0.25 mmol/L x 38.67)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "28 randomised controlled trials",
    caution: null,
    paper: {
      doi: "10.3945/ajcn.114.086108",
      pmid: "25411276",
      title:
        "Cholesterol-lowering effects of oat β-glucan: a meta-analysis of randomized controlled trials",
      year: 2014,
      journal: "American Journal of Clinical Nutrition",
    },
    quote:
      "Adding ≥3 g OBG/d to the diet reduces LDL and total cholesterol by 0.25 mmol/L and 0.30 mmol/L, respectively, without changing HDL cholesterol or triglycerides.",
  },
  {
    conditionId: "ascvd_risk",
    name: "Psyllium fibre",
    kind: "supplement",
    dose: "10 g/day, split across meals, with water",
    duration: "at least 3 weeks",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-12.8 mg/dL (0.33 mmol/L x 38.67; 95% CI -0.38 to -0.27 mmol/L)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "28 randomised trials, n = 1,924",
    caution:
      "Take it with a full glass of water and away from other tablets, which it slows down.",
    paper: {
      doi: "10.1093/ajcn/nqy115",
      pmid: "30239559",
      title:
        "Effect of psyllium (Plantago ovata) fiber on LDL cholesterol and alternative lipid targets, non-HDL cholesterol and apolipoprotein B: a systematic review and meta-analysis of randomized controlled trials",
      year: 2018,
      journal: "American Journal of Clinical Nutrition",
    },
    quote:
      "Supplementation of a median dose of ∼10.2 g psyllium significantly reduced LDL cholesterol (MD = -0.33 mmol/L; 95% CI: -0.38, -0.27 mmol/L; P",
  },
  {
    conditionId: "ascvd_risk",
    name: "Replacing saturated fat with unsaturated fat",
    kind: "diet",
    dose: null,
    duration: "at least 24 months",
    outcomeFeatureId: null,
    effect: "risk ratio 0.79 (95% CI 0.66 to 0.93) for combined cardiovascular events",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "15 randomised trials, about 59,000 adults",
    caution:
      "The mortality effect is small to none; this is a cardiovascular-event result, not a longevity one.",
    paper: {
      doi: "10.1002/14651858.CD011737.pub2",
      pmid: "32428300",
      title: "Reduction in saturated fat intake for cardiovascular disease",
      year: 2020,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "The included long-term trials suggested that reducing dietary saturated fat reduced the risk of combined cardiovascular events by 21% (risk ratio (RR) 0.79; 95% confidence interval (CI) 0.66 to 0.93, 11 trials, 53,300 participants of whom 8% had a cardiovascular event, I² = 65%, GRADE moderate-quality evidence).",
  },
  {
    conditionId: "ascvd_risk",
    name: "Mediterranean diet with olive oil or nuts",
    kind: "diet",
    dose: "extra-virgin olive oil, or 30 g/day of mixed nuts",
    duration: "4.8 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.69 (95% CI 0.53 to 0.91) for major cardiovascular events",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults at high cardiovascular risk without prior disease, n = 7,447",
    caution: null,
    paper: {
      doi: "10.1056/NEJMoa1800389",
      pmid: "29897866",
      title:
        "Primary Prevention of Cardiovascular Disease with a Mediterranean Diet Supplemented with Extra-Virgin Olive Oil or Nuts",
      year: 2018,
      journal: "New England Journal of Medicine",
    },
    quote:
      "In the intention-to-treat analysis including all the participants and adjusting for baseline characteristics and propensity scores, the hazard ratio was 0.69 (95% confidence interval [CI], 0.53 to 0.91) for a Mediterranean diet with extra-virgin olive oil and 0.72 (95% CI, 0.54 to 0.95) for a Mediterranean diet with nuts, as compared with the control diet.",
  },

  /* ── familial hypercholesterolaemia ────────────────────────────────────
   * Same drugs as atherosclerotic risk, started earlier and pushed harder,
   * plus the one thing that is specific to FH: testing the first-degree
   * relatives. The EAS consensus statement carries that recommendation in
   * its own abstract. */
  {
    conditionId: "familial_hypercholesterolaemia",
    name: "High-intensity statin, started early",
    kind: "drug",
    dose: "atorvastatin 40-80 mg/day or rosuvastatin 20-40 mg/day",
    duration: "1 year",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-19.7 mg/dL further than a moderate dose (0.51 mmol/L x 38.67)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "26 randomised trials, n = 170,000",
    caution:
      "Prescription only; in FH the aim is a halving of LDL and then whatever else it takes.",
    paper: {
      doi: "10.1016/S0140-6736(10)61350-5",
      pmid: "21067804",
      title:
        "Efficacy and safety of more intensive lowering of LDL cholesterol: a meta-analysis of data from 170,000 participants in 26 randomised trials",
      year: 2010,
      journal: "The Lancet",
    },
    quote:
      "In the trials of more versus less intensive statin therapy, the weighted mean further reduction in LDL cholesterol at 1 year was 0·51 mmol/L.",
  },
  {
    conditionId: "familial_hypercholesterolaemia",
    name: "Ezetimibe added to a statin",
    kind: "drug",
    dose: "10 mg/day",
    duration: "6 years",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-15.8 mg/dL on top of a statin (53.7 against 69.5 mg/dL)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults after an acute coronary syndrome, n = 18,144",
    caution: "Prescription only.",
    paper: {
      doi: "10.1056/NEJMoa1410489",
      pmid: "26039521",
      title: "Ezetimibe Added to Statin Therapy after Acute Coronary Syndromes",
      year: 2015,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The median time-weighted average LDL cholesterol level during the study was 53.7 mg per deciliter (1.4 mmol per liter) in the simvastatin-ezetimibe group, as compared with 69.5 mg per deciliter (1.8 mmol per liter) in the simvastatin-monotherapy group",
  },
  {
    conditionId: "familial_hypercholesterolaemia",
    name: "PCSK9 inhibitor (evolocumab)",
    kind: "drug",
    dose: "140 mg every 2 weeks, or 420 mg monthly, by injection",
    duration: "48 weeks",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-62 mg/dL (median 92 to 30 mg/dL, a 59 % reduction)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with established atherosclerotic disease on a statin, n = 27,564",
    caution:
      "Prescription only; in FH it is the step after statin plus ezetimibe.",
    paper: {
      doi: "10.1056/NEJMoa1615664",
      pmid: "28304224",
      title: "Evolocumab and Clinical Outcomes in Patients with Cardiovascular Disease",
      year: 2017,
      journal: "New England Journal of Medicine",
    },
    quote:
      "At 48 weeks, the least-squares mean percentage reduction in LDL cholesterol levels with evolocumab, as compared with placebo, was 59%, from a median baseline value of 92 mg per deciliter (2.4 mmol per liter) to 30 mg per deciliter (0.78 mmol per liter)",
  },
  {
    conditionId: "familial_hypercholesterolaemia",
    name: "Cascade testing of first-degree relatives",
    kind: "procedure",
    dose: null,
    duration: null,
    outcomeFeatureId: null,
    effect: "half of first-degree relatives carry the same variant",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "families of an index case with FH",
    caution:
      "This is the row that treats people who do not know they have it; the index case is asked to pass it on.",
    paper: {
      doi: "10.1093/eurheartj/eht273",
      pmid: "23956253",
      title:
        "Familial hypercholesterolaemia is underdiagnosed and undertreated in the general population: guidance for clinicians to prevent coronary heart disease: consensus statement of the European Atherosclerosis Society",
      year: 2013,
      journal: "European Heart Journal",
    },
    quote:
      "Owing to severe underdiagnosis and undertreatment of FH, there is an urgent worldwide need for diagnostic screening together with early and aggressive treatment of this extremely high-risk condition.",
  },

  /* ── high lipoprotein(a) ───────────────────────────────────────────────
   * Nothing licensed lowers Lp(a) much. A PCSK9 inhibitor takes about a
   * quarter off it (FOURIER), and the EAS consensus says to measure it once
   * and treat everything else harder. Niacin lowers Lp(a) and is never
   * seeded: `CEILINGS` sets it to zero. */
  {
    conditionId: "lpa_elevated",
    name: "PCSK9 inhibitor (evolocumab)",
    kind: "drug",
    dose: "140 mg every 2 weeks, or 420 mg monthly, by injection",
    duration: "48 weeks",
    outcomeFeatureId: "metric:lp_a",
    effect: "26.9 % lower Lp(a) at 48 weeks (interquartile range 6.2 to 46.7 %)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with atherosclerotic disease in FOURIER, n = 25,096",
    caution:
      "Prescription only; the benefit was largest in those whose Lp(a) started highest.",
    paper: {
      doi: "10.1161/CIRCULATIONAHA.118.037184",
      pmid: "30586750",
      title: "Lipoprotein(a), PCSK9 Inhibition, and Cardiovascular Risk",
      year: 2019,
      journal: "Circulation",
    },
    quote:
      "At 48 weeks, evolocumab significantly reduced Lp(a) by a median (interquartile range) of 26.9% (6.2%-46.7%).",
  },
  {
    conditionId: "lpa_elevated",
    name: "Measure Lp(a) once, then treat every other risk factor harder",
    kind: "behaviour",
    dose: null,
    duration: null,
    outcomeFeatureId: null,
    effect: "the level is genetic and does not move with diet or exercise",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults being assessed for cardiovascular risk",
    caution:
      "A high Lp(a) is a reason to be stricter about LDL and blood pressure, not a reason to panic.",
    paper: {
      doi: "10.1093/eurheartj/ehac361",
      pmid: "36036785",
      title:
        "Lipoprotein(a) in atherosclerotic cardiovascular disease and aortic stenosis: a European Atherosclerosis Society consensus statement",
      year: 2022,
      journal: "European Heart Journal",
    },
    quote:
      "This 2022 European Atherosclerosis Society lipoprotein(a) [Lp(a)] consensus statement updates evidence for the role of Lp(a) in atherosclerotic cardiovascular disease (ASCVD) and aortic valve stenosis, provides clinical guidance for testing and treating elevated Lp(a) levels, and considers its inclusion in global risk estimation.",
  },
  {
    conditionId: "lpa_elevated",
    name: "High-intensity statin for the LDL that travels with it",
    kind: "drug",
    dose: "atorvastatin 40-80 mg/day or rosuvastatin 20-40 mg/day",
    duration: "1 year",
    outcomeFeatureId: "metric:ldl_cholesterol",
    effect: "-19.7 mg/dL further than a moderate dose (0.51 mmol/L x 38.67)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "26 randomised trials, n = 170,000",
    caution:
      "Statins do not lower Lp(a); this row lowers the risk that sits next to it.",
    paper: {
      doi: "10.1016/S0140-6736(10)61350-5",
      pmid: "21067804",
      title:
        "Efficacy and safety of more intensive lowering of LDL cholesterol: a meta-analysis of data from 170,000 participants in 26 randomised trials",
      year: 2010,
      journal: "The Lancet",
    },
    quote:
      "In the trials of more versus less intensive statin therapy, the weighted mean further reduction in LDL cholesterol at 1 year was 0·51 mmol/L.",
  },

  /* ── type 2 diabetes ───────────────────────────────────────────────────
   * DiRECT is the remission row, EMPA-REG and semaglutide are the drug rows
   * with an outcome behind them, and Umpierre gives the only HbA1c number
   * here that is in the marker's own unit. */
  {
    conditionId: "type2_diabetes",
    name: "Total diet replacement then structured maintenance",
    kind: "diet",
    dose: "825-853 kcal/day formula diet for 3-5 months, then food reintroduction",
    duration: "12 months",
    outcomeFeatureId: null,
    effect: "24 % lost 15 kg or more, against none on usual care",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults diagnosed within 6 years, BMI 27-45, not on insulin, n = 306",
    caution:
      "Antidiabetic and antihypertensive drugs are withdrawn at the start, so this is done with a clinician, never alone.",
    paper: {
      doi: "10.1016/S0140-6736(17)33102-1",
      pmid: "29221645",
      title:
        "Primary care-led weight management for remission of type 2 diabetes (DiRECT): an open-label, cluster-randomised trial",
      year: 2018,
      journal: "The Lancet",
    },
    quote:
      "At 12 months, we recorded weight loss of 15 kg or more in 36 (24%) participants in the intervention group and no participants in the control group (p",
  },
  {
    conditionId: "type2_diabetes",
    name: "Structured exercise training",
    kind: "exercise",
    dose: "more than 150 minutes per week",
    duration: "12 weeks",
    outcomeFeatureId: "metric:hba1c",
    effect: "-0.67 % (95% CI -0.84 to -0.49)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "47 randomised trials in type 2 diabetes, n = 8,538",
    caution: null,
    paper: {
      doi: "10.1001/jama.2011.576",
      pmid: "21540423",
      title:
        "Physical activity advice only or structured exercise training and association with HbA1c levels in type 2 diabetes: a systematic review and meta-analysis",
      year: 2011,
      journal: "JAMA",
    },
    quote:
      "Structured exercise durations of more than 150 minutes per week were associated with HbA(1c) reductions of 0.89%, while structured exercise durations of 150 minutes or less per week were associated with HbA(1C) reductions of 0.36%.",
  },
  {
    conditionId: "type2_diabetes",
    name: "Low-carbohydrate diet",
    kind: "diet",
    dose: "under 130 g of carbohydrate a day",
    duration: "6 months",
    outcomeFeatureId: null,
    effect: "risk difference 0.32 (95% CI 0.17 to 0.47) for remission at six months",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "23 randomised trials, n = 1,357",
    caution:
      "Sulfonylureas and insulin doses have to come down with the carbohydrate, or the glucose goes too low.",
    paper: {
      doi: "10.1136/bmj.m4743",
      pmid: "33441384",
      title:
        "Efficacy and safety of low and very low carbohydrate diets for type 2 diabetes remission: systematic review and meta-analysis of published and unpublished randomized trial data",
      year: 2021,
      journal: "BMJ",
    },
    quote:
      "On the basis of moderate to low certainty evidence, patients adhering to an LCD for six months may experience remission of diabetes without adverse consequences.",
  },
  {
    conditionId: "type2_diabetes",
    name: "SGLT2 inhibitor (empagliflozin)",
    kind: "drug",
    dose: "10 mg or 25 mg once daily",
    duration: "3.1 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.86 (95.02% CI 0.74 to 0.99) for the primary cardiovascular outcome",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with type 2 diabetes at high cardiovascular risk, n = 7,020",
    caution:
      "Prescription only; genital thrush is common and it is stopped during acute illness because of ketoacidosis.",
    paper: {
      doi: "10.1056/NEJMoa1504720",
      pmid: "26378978",
      title: "Empagliflozin, Cardiovascular Outcomes, and Mortality in Type 2 Diabetes",
      year: 2015,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The primary outcome occurred in 490 of 4687 patients (10.5%) in the pooled empagliflozin group and in 282 of 2333 patients (12.1%) in the placebo group (hazard ratio in the empagliflozin group, 0.86; 95.02% confidence interval, 0.74 to 0.99; P=0.04 for superiority).",
  },
  {
    conditionId: "type2_diabetes",
    name: "GLP-1 receptor agonist (semaglutide 2.4 mg)",
    kind: "drug",
    dose: "2.4 mg once weekly by injection",
    duration: "68 weeks",
    outcomeFeatureId: null,
    effect: "-12.4 percentage points of body weight against placebo (95% CI -13.4 to -11.5)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with overweight or obesity without diabetes, n = 1,961",
    caution:
      "Prescription only; this trial was in people without diabetes, so the weight number is the one it earns.",
    paper: {
      doi: "10.1056/NEJMoa2032183",
      pmid: "33567185",
      title: "Once-Weekly Semaglutide in Adults with Overweight or Obesity",
      year: 2021,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The mean change in body weight from baseline to week 68 was -14.9% in the semaglutide group as compared with -2.4% with placebo, for an estimated treatment difference of -12.4 percentage points (95% confidence interval [CI], -13.4 to -11.5; P",
  },
  {
    conditionId: "type2_diabetes",
    name: "Mediterranean diet",
    kind: "diet",
    dose: null,
    duration: "6 months or more",
    outcomeFeatureId: null,
    effect: "better glycaemic control than lower-fat comparison diets",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "8 meta-analyses and 5 randomised trials",
    caution: null,
    paper: {
      doi: "10.1136/bmjopen-2015-008222",
      pmid: "26260349",
      title:
        "A journey into a Mediterranean diet and type 2 diabetes: a systematic review with meta-analyses",
      year: 2015,
      journal: "BMJ Open",
    },
    quote:
      "A 'de novo' meta-analysis of 3 long-term (>6 months) RCTs of the Mediterranean diet and glycaemic control of diabetes favoured the Mediterranean diet as compared with lower fat diets.",
  },

  /* ── chronic kidney disease ────────────────────────────────────────────
   * The three trials that changed the treatment in twenty years: an ARB for
   * proteinuria, an SGLT2 inhibitor for everyone, and finerenone on top. */
  {
    conditionId: "ckd",
    name: "SGLT2 inhibitor (dapagliflozin)",
    kind: "drug",
    dose: "10 mg once daily",
    duration: "2.4 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.61 (95% CI 0.51 to 0.72) for kidney failure or renal death",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with eGFR 25-75 and albuminuria, with or without diabetes, n = 4,304",
    caution:
      "Prescription only; eGFR dips in the first weeks and then falls more slowly than without it.",
    paper: {
      doi: "10.1056/NEJMoa2024816",
      pmid: "32970396",
      title: "Dapagliflozin in Patients with Chronic Kidney Disease",
      year: 2020,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Over a median of 2.4 years, a primary outcome event occurred in 197 of 2152 participants (9.2%) in the dapagliflozin group and 312 of 2152 participants (14.5%) in the placebo group (hazard ratio, 0.61; 95% confidence interval [CI], 0.51 to 0.72; P",
  },
  {
    conditionId: "ckd",
    name: "Angiotensin receptor blocker (losartan)",
    kind: "drug",
    dose: "50-100 mg once daily",
    duration: "3.4 years",
    outcomeFeatureId: "metric:urine_albumin_creatinine_ratio",
    effect: "35 % lower proteinuria; 25 % less doubling of creatinine",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with type 2 diabetes and nephropathy, n = 1,513",
    caution:
      "Prescription only; potassium and creatinine are checked one to two weeks after starting or increasing it.",
    paper: {
      doi: "10.1056/NEJMoa011161",
      pmid: "11565518",
      title:
        "Effects of losartan on renal and cardiovascular outcomes in patients with type 2 diabetes and nephropathy",
      year: 2001,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Losartan reduced the incidence of a doubling of the serum creatinine concentration (risk reduction, 25 percent; P=0.006) and end-stage renal disease (risk reduction, 28 percent; P=0.002) but had no effect on the rate of death.",
  },
  {
    conditionId: "ckd",
    name: "Finerenone",
    kind: "drug",
    dose: "10-20 mg once daily",
    duration: "2.6 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.82 (95% CI 0.73 to 0.93) for kidney disease progression",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with CKD and type 2 diabetes, n = 5,734",
    caution:
      "Prescription only; hyperkalaemia is the reason people stop it, so potassium is checked.",
    paper: {
      doi: "10.1056/NEJMoa2025845",
      pmid: "33264825",
      title: "Effect of Finerenone on Chronic Kidney Disease Outcomes in Type 2 Diabetes",
      year: 2020,
      journal: "New England Journal of Medicine",
    },
    quote:
      "During a median follow-up of 2.6 years, a primary outcome event occurred in 504 of 2833 patients (17.8%) in the finerenone group and 600 of 2841 patients (21.1%) in the placebo group (hazard ratio, 0.82; 95% confidence interval [CI], 0.73 to 0.93; P = 0.001).",
  },
  {
    conditionId: "ckd",
    name: "Blood pressure treated to a systolic target below 120 mmHg",
    kind: "drug",
    dose: "as many agents as the target needs",
    duration: "3.3 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.75 (95% CI 0.64 to 0.89) for major cardiovascular events",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults at high cardiovascular risk without diabetes, n = 9,361",
    caution:
      "Acute kidney injury was commoner in the intensive arm; the trade is made deliberately.",
    paper: {
      doi: "10.1056/NEJMoa1511939",
      pmid: "26551272",
      title: "A Randomized Trial of Intensive versus Standard Blood-Pressure Control",
      year: 2015,
      journal: "New England Journal of Medicine",
    },
    quote:
      "At 1 year, the mean systolic blood pressure was 121.4 mm Hg in the intensive-treatment group and 136.2 mm Hg in the standard-treatment group.",
  },

  /* ── depression ────────────────────────────────────────────────────────
   * Four things with a meta-analysis behind them, in the order most people
   * are offered them. The effect sizes are standardised mean differences,
   * not points on a scale, so nothing here is projected onto PHQ-9. */
  {
    conditionId: "depression",
    name: "Aerobic or resistance exercise",
    kind: "exercise",
    dose: "three supervised sessions a week",
    duration: "at least 8 weeks",
    outcomeFeatureId: null,
    effect: "SMD 1.11 (95% CI 0.79 to 1.43), adjusted for publication bias",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "25 randomised trials, 9 of them in major depression",
    caution: null,
    paper: {
      doi: "10.1016/j.jpsychires.2016.02.023",
      pmid: "26978184",
      title: "Exercise as a treatment for depression: A meta-analysis adjusting for publication bias",
      year: 2016,
      journal: "Journal of Psychiatric Research",
    },
    quote:
      "Overall, exercise had a large and significant effect on depression (SMD adjusted for publication bias = 1.11 (95% CI 0.79-1.43)) with a fail-safe number of 1057.",
  },
  {
    conditionId: "depression",
    name: "Cognitive behavioural therapy",
    kind: "behaviour",
    dose: "weekly sessions",
    duration: "12 to 16 weeks",
    outcomeFeatureId: null,
    effect: "Hedges g = 0.71 (95% CI 0.62 to 0.79), number needed to treat 2.6",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "115 studies of CBT in adult depression",
    caution:
      "The authors found publication bias; the adjusted effect size is 0.53, not 0.71.",
    paper: {
      doi: "10.1177/070674371305800702",
      pmid: "23870719",
      title:
        "A meta-analysis of cognitive-behavioural therapy for adult depression, alone and in comparison with other treatments",
      year: 2013,
      journal: "Canadian Journal of Psychiatry",
    },
    quote:
      "The mean effect size (ES) of 94 comparisons from 75 studies of CBT and control groups was Hedges g = 0.71 (95% CI 0.62 to 0.79), which corresponds with a number needed to treat of 2.6.",
  },
  {
    conditionId: "depression",
    name: "Antidepressant medication",
    kind: "drug",
    dose: "as prescribed; escitalopram, sertraline and mirtazapine rank well on both efficacy and tolerability",
    duration: "8 weeks to the first judgement",
    outcomeFeatureId: null,
    effect: "odds ratios 1.37 to 2.13 against placebo across 21 drugs",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "522 trials in adults with major depressive disorder, n = 116,477",
    caution:
      "Prescription only; the first two weeks can feel worse, and stopping is tapered.",
    paper: {
      doi: "10.1016/S0140-6736(17)32802-7",
      pmid: "29477251",
      title:
        "Comparative efficacy and acceptability of 21 antidepressant drugs for the acute treatment of adults with major depressive disorder: a systematic review and network meta-analysis",
      year: 2018,
      journal: "The Lancet",
    },
    quote:
      "In terms of efficacy, all antidepressants were more effective than placebo, with ORs ranging between 2·13 (95% credible interval [CrI] 1·89-2·41) for amitriptyline and 1·37 (1·16-1·63) for reboxetine.",
  },
  {
    conditionId: "depression",
    name: "Omega-3 (EPA-predominant)",
    kind: "supplement",
    dose: "1-2 g/day of EPA",
    duration: "8 weeks or more",
    outcomeFeatureId: null,
    effect: "SMD 0.398 (95% CI 0.114 to 0.682)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "13 randomised placebo-controlled trials in major depression, n = 1,233",
    caution:
      "The benefit was clearest as an add-on for people already on an antidepressant, and only for EPA-heavy products.",
    paper: {
      doi: "10.1038/tp.2016.29",
      pmid: "26978738",
      title:
        "Meta-analysis and meta-regression of omega-3 polyunsaturated fatty acid supplementation for major depressive disorder",
      year: 2016,
      journal: "Translational Psychiatry",
    },
    quote:
      "After taking potential publication bias into account, meta-analysis showed an overall beneficial effect of omega-3 PUFAs on depressive symptoms in MDD (standardized mean difference=0.398 (0.114-0.682), P=0.006, random-effects model).",
  },

  /* ── alcohol use disorder ──────────────────────────────────────────────
   * Two licensed drugs with a number needed to treat, one off-label drug
   * with a consumption number, and the conversation that works in general
   * practice. */
  {
    conditionId: "alcohol_use_disorder",
    name: "Naltrexone",
    kind: "drug",
    dose: "50 mg/day",
    duration: "at least 12 weeks",
    outcomeFeatureId: null,
    effect: "number needed to treat 12 (95% CI 8 to 26) to prevent a return to heavy drinking",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "122 randomised trials in outpatients, n = 22,803",
    caution:
      "Prescription only; it is not started with opioid painkillers on board and liver enzymes are checked.",
    paper: {
      doi: "10.1001/jama.2014.3628",
      pmid: "24825644",
      title:
        "Pharmacotherapy for adults with alcohol use disorders in outpatient settings: a systematic review and meta-analysis",
      year: 2014,
      journal: "JAMA",
    },
    quote:
      "The NNT to prevent return to heavy drinking was 12 (95% CI, 8 to 26; RD -0.09; 95% CI, -0.13 to -0.04) for oral naltrexone (50 mg/d).",
  },
  {
    conditionId: "alcohol_use_disorder",
    name: "Acamprosate",
    kind: "drug",
    dose: "666 mg three times daily",
    duration: "at least 12 weeks",
    outcomeFeatureId: null,
    effect: "number needed to treat 12 (95% CI 8 to 26) to prevent a return to any drinking",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "27 randomised trials of acamprosate, n = 7,519",
    caution:
      "Prescription only; it is started after withdrawal, not during it.",
    paper: {
      doi: "10.1001/jama.2014.3628",
      pmid: "24825644",
      title:
        "Pharmacotherapy for adults with alcohol use disorders in outpatient settings: a systematic review and meta-analysis",
      year: 2014,
      journal: "JAMA",
    },
    quote:
      "The NNT to prevent return to any drinking for acamprosate was 12 (95% CI, 8 to 26; risk difference [RD], -0.09; 95% CI, -0.14 to -0.04) and was 20 (95% CI, 11 to 500; RD, -0.05; 95% CI, -0.10 to -0.002) for oral naltrexone (50 mg/d).",
  },
  {
    conditionId: "alcohol_use_disorder",
    name: "Brief advice from a clinician",
    kind: "behaviour",
    dose: "up to five short conversations, under an hour in total",
    duration: "1 year of follow-up",
    outcomeFeatureId: null,
    effect: "-20 g of alcohol per week (95% CI -28 to -12)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "69 randomised trials in primary and emergency care, n = 33,642",
    caution: null,
    paper: {
      doi: "10.1002/14651858.CD004148.pub4",
      pmid: "29476653",
      title: "Effectiveness of brief alcohol interventions in primary care populations",
      year: 2018,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "The primary meta-analysis included 34 studies (15,197 participants) and provided moderate-quality evidence that participants who received brief intervention consumed less alcohol than minimal or no intervention participants after one year (mean difference (MD) -20 g/week, 95% confidence interval (CI) -28 to -12).",
  },

  /* ── coeliac disease ───────────────────────────────────────────────────
   * There is one treatment and the guideline is where it is written down.
   * The ACG abstract carries no recommendation text, so all three rows quote
   * the guideline itself and the verifier prints them unchecked. */
  {
    conditionId: "coeliac_disease",
    name: "Strict lifelong gluten-free diet",
    kind: "diet",
    dose: "no wheat, rye or barley",
    duration: "lifelong",
    outcomeFeatureId: "metric:ttg_iga",
    effect: "serology normalises and the mucosa recovers on a strict diet",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "adults with biopsy-confirmed coeliac disease",
    caution:
      "Diagnosis comes first: starting the diet before serology and biopsy makes the diagnosis impossible to confirm.",
    paper: {
      doi: "10.1038/ajg.2013.79",
      pmid: "23609613",
      title: "ACG clinical guidelines: diagnosis and management of celiac disease",
      year: 2013,
      journal: "American Journal of Gastroenterology",
    },
    quote:
      "People with celiac disease should adhere to a gluten-free diet for life.",
  },
  {
    conditionId: "coeliac_disease",
    name: "Check iron, B12, folate and vitamin D at diagnosis",
    kind: "procedure",
    dose: null,
    duration: null,
    outcomeFeatureId: null,
    effect: "deficiencies are common at diagnosis and are corrected alongside the diet",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults newly diagnosed with coeliac disease",
    caution: null,
    paper: {
      doi: "10.1038/ajg.2013.79",
      pmid: "23609613",
      title: "ACG clinical guidelines: diagnosis and management of celiac disease",
      year: 2013,
      journal: "American Journal of Gastroenterology",
    },
    quote:
      "Patients with newly diagnosed celiac disease should be assessed for micronutrient deficiencies, including iron, vitamin B12, folate, vitamin D, zinc and copper.",
  },
  {
    conditionId: "coeliac_disease",
    name: "Bone density measurement",
    kind: "procedure",
    dose: null,
    duration: null,
    outcomeFeatureId: "metric:dexa_t_score",
    effect: "low bone density is common at diagnosis and improves on the diet",
    direction: "up",
    grade: "A",
    studyType: "guideline",
    population: "adults with coeliac disease and a risk factor for low bone mass",
    caution: null,
    paper: {
      doi: "10.1038/ajg.2013.79",
      pmid: "23609613",
      title: "ACG clinical guidelines: diagnosis and management of celiac disease",
      year: 2013,
      journal: "American Journal of Gastroenterology",
    },
    quote:
      "Bone mineral density should be assessed in patients with celiac disease who have additional risk factors for osteoporosis.",
  },

  /* ── atrophic gastritis ────────────────────────────────────────────────
   * Eradication both prevents the cancer and reverses some of the atrophy;
   * the surveillance row is the MAPS guideline's own interval. */
  {
    conditionId: "atrophic_gastritis",
    name: "Helicobacter pylori eradication",
    kind: "drug",
    dose: "a two-week course of triple or quadruple therapy",
    duration: "14 days",
    outcomeFeatureId: null,
    effect: "relative risk of gastric cancer 0.66 (95% CI 0.46 to 0.95)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "6 randomised trials in healthy infected adults, n = 6,497",
    caution:
      "Eradication is confirmed at least four weeks after the course, off any acid suppression.",
    paper: {
      doi: "10.1136/bmj.g3174",
      pmid: "24846275",
      title:
        "Helicobacter pylori eradication therapy to prevent gastric cancer in healthy asymptomatic infected individuals: systematic review and meta-analysis of randomised controlled trials",
      year: 2014,
      journal: "BMJ",
    },
    quote:
      "Fifty one (1.6%) gastric cancers occurred among 3294 individuals who received eradication therapy versus 76 (2.4%) in 3203 control subjects (relative risk 0.66, 95% confidence interval 0.46 to 0.95), with no heterogeneity between studies (I(2)=0%, P=0.60).",
  },
  {
    conditionId: "atrophic_gastritis",
    name: "Eradication early enough to reverse the atrophy",
    kind: "drug",
    dose: "a two-week course of triple or quadruple therapy",
    duration: "long-term follow-up",
    outcomeFeatureId: null,
    effect: "odds ratio 0.554 (95% CI 0.372 to 0.825) for antral atrophy after eradication",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "long-term histology studies after eradication",
    caution:
      "Atrophy improves; intestinal metaplasia does not, which is why the timing matters.",
    paper: {
      doi: "10.1111/j.1523-5378.2007.00563.x",
      pmid: "17991174",
      title:
        "The long-term impact of Helicobacter pylori eradication on gastric histology: a systematic review and meta-analysis",
      year: 2007,
      journal: "Helicobacter",
    },
    quote:
      "For antrum GA the pooled OR with 95% CI was 0.554 (0.372-0.825), p=0.004.",
  },
  {
    conditionId: "atrophic_gastritis",
    name: "Endoscopic surveillance for extensive atrophy",
    kind: "procedure",
    dose: null,
    duration: "every three years while the atrophy is extensive",
    outcomeFeatureId: "metric:gastroscopy",
    effect: "the cancers that do appear are found at a treatable stage",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults with extensive atrophy or intestinal metaplasia",
    caution: null,
    paper: {
      doi: "10.1055/s-0031-1291491",
      pmid: "22198778",
      title:
        "Management of precancerous conditions and lesions in the stomach (MAPS): guideline from the European Society of Gastrointestinal Endoscopy (ESGE), European Helicobacter Study Group (EHSG), European Society of Pathology (ESP), and the Sociedade Portuguesa de Endoscopia Digestiva (SPED)",
      year: 2012,
      journal: "Endoscopy",
    },
    quote:
      "Patients with extensive atrophy and intestinal metaplasia should be offered endoscopic surveillance every three years after diagnosis.",
  },
  {
    conditionId: "atrophic_gastritis",
    name: "Vitamin B12 replacement",
    kind: "supplement",
    dose: "1000-2000 µg/day by mouth, or 1000 µg by injection",
    duration: "lifelong once absorption is lost",
    outcomeFeatureId: "metric:vitamin_b12",
    effect: "as effective as an intramuscular course on blood and nerve response",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "2 randomised trials in B12-deficient adults, n = 108",
    caution: null,
    paper: {
      doi: "10.1002/14651858.CD004655.pub2",
      pmid: "16034940",
      title: "Oral vitamin B12 versus intramuscular vitamin B12 for vitamin B12 deficiency",
      year: 2005,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "High oral doses of B12 (1000 mcg and 2000 mcg) were as effective as intramuscular administration in achieving haematological and neurological responses.",
  },

  /* ── folate deficiency ─────────────────────────────────────────────────
   * The dose is small and the order matters: B12 is checked first, because
   * folate alone repairs the blood count while the nerves keep going. */
  {
    conditionId: "folate_deficiency",
    name: "Folic acid",
    kind: "supplement",
    dose: "400 µg/day, or 5 mg/day to treat a deficiency",
    duration: "4 months",
    outcomeFeatureId: "metric:red_cell_folate",
    effect: "red cell folate rises over the life of the red cell, about four months",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "5 randomised trials, n = 7,391 women",
    caution:
      "Never given alone to someone who may be B12 deficient: check B12 first.",
    paper: {
      doi: "10.1002/14651858.CD007950.pub3",
      pmid: "26662928",
      title:
        "Effects and safety of periconceptional oral folate supplementation for preventing birth defects",
      year: 2015,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "Subgroup analyses suggest that the positive effect of folic acid on NTD incidence and recurrence is not affected by the explored daily folic acid dosage (400 µg (0.4 mg) or higher) or whether folic acid is given alone or with other vitamins and minerals.",
  },
  {
    conditionId: "folate_deficiency",
    name: "Periconceptional folic acid",
    kind: "supplement",
    dose: "400 µg/day, from before conception to the end of the first trimester",
    duration: "3 months before and 3 months after conception",
    outcomeFeatureId: null,
    effect: "risk ratio 0.31 (95% CI 0.17 to 0.58) for neural tube defects",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "5 trials, 6,708 births",
    caution: null,
    paper: {
      doi: "10.1002/14651858.CD007950.pub3",
      pmid: "26662928",
      title:
        "Effects and safety of periconceptional oral folate supplementation for preventing birth defects",
      year: 2015,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "The results of the first comparison involving 6708 births with information on NTDs and other infant outcomes, show a protective effect of daily folic acid supplementation (alone or in combination with other vitamins and minerals) in preventing NTDs compared with no interventions/placebo or vitamins and minerals without folic acid (risk ratio (RR) 0.31, 95% confidence interval (CI) 0.17 to 0.58); five studies; 6708 births; high quality evidence).",
  },
  {
    conditionId: "folate_deficiency",
    name: "Measure cobalamin before treating the folate",
    kind: "procedure",
    dose: null,
    duration: null,
    outcomeFeatureId: "metric:vitamin_b12",
    effect: "the order of treatment changes when both are low",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults with a low serum or red cell folate",
    caution:
      "Treating folate first in an undiagnosed B12 deficiency can precipitate subacute combined degeneration of the cord.",
    paper: {
      doi: "10.1111/bjh.12959",
      pmid: "24942828",
      title: "Guidelines for the diagnosis and treatment of cobalamin and folate disorders",
      year: 2014,
      journal: "British Journal of Haematology",
    },
    quote:
      "Cobalamin status should be assessed before folate therapy is started in patients with folate deficiency.",
  },

  /* ── vitamin D deficiency ──────────────────────────────────────────────
   * Heaney's dose-response study is the one that makes a projection
   * possible: 0.70 nmol/L per µg of cholecalciferol, so 1000 IU (25 µg) is
   * about 17.5 nmol/L, which is 7 ng/mL in the unit this app stores. Doses
   * stay under the 10,000 IU ceiling in `lib/vectors.ts`. */
  {
    conditionId: "vitamin_d_deficiency",
    name: "Cholecalciferol, daily",
    kind: "supplement",
    dose: "1000-2000 IU/day",
    duration: "12 weeks",
    outcomeFeatureId: "metric:vitamin_d",
    effect: "+7 ng/mL per 1000 IU/day (0.70 nmol/L per µg, 25 µg, ÷ 2.496)",
    direction: "up",
    grade: "B",
    studyType: "rct",
    population: "healthy men in Omaha through winter, n = 67",
    caution: null,
    paper: {
      doi: "10.1093/ajcn/77.1.204",
      pmid: "12499343",
      title: "Human serum 25-hydroxycholecalciferol response to extended oral dosing with cholecalciferol",
      year: 2003,
      journal: "American Journal of Clinical Nutrition",
    },
    quote:
      "From a mean baseline value of 70.3 nmol/L, equilibrium concentrations of serum 25-hydroxycholecalciferol changed during the winter months in direct proportion to the dose, with a slope of approximately 0.70 nmol/L for each additional 1 micro g cholecalciferol input.",
  },
  {
    conditionId: "vitamin_d_deficiency",
    name: "Correcting a deficiency, then maintaining it",
    kind: "supplement",
    dose: "1500-2000 IU/day maintenance",
    duration: "8 weeks of loading, then indefinitely",
    outcomeFeatureId: "metric:vitamin_d",
    effect: "+10 ng/mL on a maintenance dose of 1500-2000 IU/day",
    direction: "up",
    grade: "A",
    studyType: "guideline",
    population: "adults at risk of deficiency",
    caution:
      "The loading course (50,000 IU weekly for eight weeks) is a clinician's decision, not a shelf purchase.",
    paper: {
      doi: "10.1210/jc.2011-0385",
      pmid: "21646368",
      title:
        "Evaluation, treatment, and prevention of vitamin D deficiency: an Endocrine Society clinical practice guideline",
      year: 2011,
      journal: "Journal of Clinical Endocrinology and Metabolism",
    },
    quote:
      "Treatment with either vitamin D(2) or vitamin D(3) was recommended for deficient patients.",
  },
  {
    conditionId: "vitamin_d_deficiency",
    name: "Vitamin D at a dose that prevents fractures",
    kind: "supplement",
    dose: "700-800 IU/day",
    duration: "long-term",
    outcomeFeatureId: null,
    effect: "relative risk of hip fracture 0.74 (95% CI 0.61 to 0.88)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "5 randomised trials in older adults, n = 9,294",
    caution:
      "400 IU/day did nothing for fractures in the same meta-analysis; the dose is the point.",
    paper: {
      doi: "10.1001/jama.293.18.2257",
      pmid: "15886381",
      title: "Fracture prevention with vitamin D supplementation: a meta-analysis of randomized controlled trials",
      year: 2005,
      journal: "JAMA",
    },
    quote:
      "A vitamin D dose of 700 to 800 IU/d reduced the relative risk (RR) of hip fracture by 26% (3 RCTs with 5572 persons; pooled RR, 0.74; 95% confidence interval [CI], 0.61-0.88) and any nonvertebral fracture by 23% (5 RCTs with 6098 persons; pooled RR, 0.77; 95% CI, 0.68-0.87) vs calcium or placebo.",
  },

  /* ── hypothyroidism ────────────────────────────────────────────────────
   * Levothyroxine and how it is taken; the two immune rows are the same
   * meta-analyses that sit on Hashimoto's, because that is what most
   * hypothyroidism in this catalog is. */
  {
    conditionId: "hypothyroidism",
    name: "Levothyroxine",
    kind: "drug",
    dose: "1.6 µg/kg/day, adjusted on TSH",
    duration: "6 weeks to the first re-check",
    outcomeFeatureId: null,
    effect: "TSH back into the reference range on a weight-based dose",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "adults with primary hypothyroidism",
    caution:
      "Prescription only; started at a low dose in older people and in coronary disease.",
    paper: {
      doi: "10.1089/thy.2014.0028",
      pmid: "25266247",
      title:
        "Guidelines for the treatment of hypothyroidism: prepared by the American Thyroid Association task force on thyroid hormone replacement",
      year: 2014,
      journal: "Thyroid",
    },
    quote:
      "Levothyroxine is recommended as the preparation of choice for the treatment of hypothyroidism.",
  },
  {
    conditionId: "hypothyroidism",
    name: "Take levothyroxine fasting, away from calcium and iron",
    kind: "behaviour",
    dose: "60 minutes before breakfast, or at bedtime, and four hours from calcium or iron",
    duration: "every day",
    outcomeFeatureId: null,
    effect: "absorption falls when it is taken with food or with binding minerals",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults taking levothyroxine",
    caution:
      "Coffee, calcium, iron and proton pump inhibitors all cut absorption; the timing is the cheapest dose increase there is.",
    paper: {
      doi: "10.1089/thy.2014.0028",
      pmid: "25266247",
      title:
        "Guidelines for the treatment of hypothyroidism: prepared by the American Thyroid Association task force on thyroid hormone replacement",
      year: 2014,
      journal: "Thyroid",
    },
    quote:
      "Levothyroxine should be taken consistently, ideally 60 minutes before breakfast or at bedtime, and separated from interfering medications and supplements.",
  },
  {
    conditionId: "hypothyroidism",
    name: "Selenium",
    kind: "supplement",
    dose: "200 µg/day",
    duration: "3 to 6 months",
    outcomeFeatureId: null,
    effect: "SMD -0.21 (95% CI -0.43 to -0.02) in TSH in people not on replacement",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "7 cohorts inside 35 randomised trials, n = 869",
    caution:
      "Only studied in autoimmune thyroiditis, and only useful before replacement has started.",
    paper: {
      doi: "10.1089/thy.2023.0556",
      pmid: "38243784",
      title:
        "Selenium Supplementation in Patients with Hashimoto Thyroiditis: A Systematic Review and Meta-Analysis of Randomized Clinical Trials",
      year: 2024,
      journal: "Thyroid",
    },
    quote:
      "Our meta-analysis found that selenium supplementation decreased TSH in patients without THRT (SMD -0.21 [confidence interval, CI -0.43 to -0.02]; 7 cohorts, 869 participants; I 2 = 0%).",
  },

  /* ── hyperthyroidism ───────────────────────────────────────────────────
   * The three treatments and the relapse rate that separates them, from the
   * network meta-analysis rather than from any one trial. */
  {
    conditionId: "hyperthyroidism",
    name: "Antithyroid drug (carbimazole or methimazole)",
    kind: "drug",
    dose: "titrated to thyroid function",
    duration: "12 to 18 months",
    outcomeFeatureId: null,
    effect: "12 to 18 months is the duration with the lowest relapse rate",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "26 randomised trials, n = 3,388",
    caution:
      "Prescription only; a sore throat or fever means an urgent blood count, because of agranulocytosis.",
    paper: {
      doi: "10.1002/14651858.CD003420.pub4",
      pmid: "20091544",
      title: "Antithyroid drug regimen for treating Graves' hyperthyroidism",
      year: 2010,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "The evidence suggests that the optimal duration of antithyroid drug therapy for the titration regimen is 12 to 18 months.",
  },
  {
    conditionId: "hyperthyroidism",
    name: "Radioactive iodine",
    kind: "procedure",
    dose: "a single oral dose",
    duration: "one treatment",
    outcomeFeatureId: null,
    effect: "15 % relapse against 52.7 % on antithyroid drugs",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "8 studies of Graves' disease from five continents, n = 1,402",
    caution:
      "Most people become hypothyroid afterwards and need levothyroxine for life; it is not given in pregnancy.",
    paper: {
      doi: "10.1210/jc.2013-1954",
      pmid: "23824415",
      title:
        "Comparative effectiveness of therapies for Graves' hyperthyroidism: a systematic review and network meta-analysis",
      year: 2013,
      journal: "Journal of Clinical Endocrinology and Metabolism",
    },
    quote:
      "Network meta-analysis suggested higher relapse rates with ATDs (52.7%; 352 of 667) than RAI (15%, 46 of 304) (odds ratio = 6.25; 95% confidence interval, 2.40-16.67) and with ATDs than surgery (10%; 39 of 387) (odds ratio = 9.09; 95% confidence interval, 4.65-19.23).",
  },
  {
    conditionId: "hyperthyroidism",
    name: "Thyroidectomy",
    kind: "procedure",
    dose: null,
    duration: "one operation",
    outcomeFeatureId: null,
    effect: "10 % relapse against 52.7 % on antithyroid drugs",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "8 studies of Graves' disease from five continents, n = 1,402",
    caution:
      "Surgical risks to the voice and the parathyroids; lifelong levothyroxine afterwards.",
    paper: {
      doi: "10.1210/jc.2013-1954",
      pmid: "23824415",
      title:
        "Comparative effectiveness of therapies for Graves' hyperthyroidism: a systematic review and network meta-analysis",
      year: 2013,
      journal: "Journal of Clinical Endocrinology and Metabolism",
    },
    quote:
      "Network meta-analysis suggested higher relapse rates with ATDs (52.7%; 352 of 667) than RAI (15%, 46 of 304) (odds ratio = 6.25; 95% confidence interval, 2.40-16.67) and with ATDs than surgery (10%; 39 of 387) (odds ratio = 9.09; 95% confidence interval, 4.65-19.23).",
  },
  {
    conditionId: "hyperthyroidism",
    name: "Beta-blocker for the symptoms while the treatment works",
    kind: "drug",
    dose: "propranolol, titrated to the heart rate",
    duration: "until thyroid function is controlled",
    outcomeFeatureId: null,
    effect: "the tremor, palpitations and heat intolerance settle within days",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "adults with symptomatic thyrotoxicosis",
    caution:
      "Prescription only; avoided in asthma, where a rate-limiting calcium blocker is used instead.",
    paper: {
      doi: "10.1089/thy.2016.0229",
      pmid: "27521067",
      title:
        "2016 American Thyroid Association Guidelines for Diagnosis and Management of Hyperthyroidism and Other Causes of Thyrotoxicosis",
      year: 2016,
      journal: "Thyroid",
    },
    quote:
      "Beta-adrenergic blockade is recommended in all patients with symptomatic thyrotoxicosis.",
  },

  /* ── perimenopause ─────────────────────────────────────────────────────
   * Hormone therapy is the only thing that moves the flushes by a lot;
   * CBT for insomnia moves the sleep; exercise moved neither, and that
   * negative trial is kept on purpose. */
  {
    conditionId: "perimenopause",
    name: "Menopausal hormone therapy",
    kind: "drug",
    dose: "oral oestrogen, with a progestogen if the uterus is in place",
    duration: "3 months to judge",
    outcomeFeatureId: null,
    effect: "-17.92 hot flushes a week (95% CI -22.86 to -12.99), a 75 % reduction",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "24 randomised trials, n = 3,329",
    caution:
      "Prescription only; the decision weighs breast cancer and clot risk against the symptoms, and transdermal avoids the clot signal.",
    paper: {
      doi: "10.1002/14651858.CD002978.pub2",
      pmid: "15495039",
      title: "Oral oestrogen and combined oestrogen/progestogen therapy versus placebo for hot flushes",
      year: 2004,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "There was a significant reduction in the weekly hot flush frequency for HT compared to placebo (WMD -17.92, 95% CI -22.86 to -12.99).",
  },
  {
    conditionId: "perimenopause",
    name: "Cognitive behavioural therapy for insomnia",
    kind: "behaviour",
    dose: "six telephone sessions",
    duration: "8 weeks",
    outcomeFeatureId: null,
    effect: "-5.2 points on the Insomnia Severity Index against control (95% CI -6.1 to -3.3)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "perimenopausal and postmenopausal women with insomnia and hot flushes, n = 106",
    caution: null,
    paper: {
      doi: "10.1001/jamainternmed.2016.1795",
      pmid: "27213646",
      title:
        "Telephone-Based Cognitive Behavioral Therapy for Insomnia in Perimenopausal and Postmenopausal Women With Vasomotor Symptoms: A MsFLASH Randomized Clinical Trial",
      year: 2016,
      journal: "JAMA Internal Medicine",
    },
    quote:
      "At 8 weeks, ISI scores had decreased 9.9 points among 53 women receiving CBT-I (mean [SD] age, 55.0 [3.5] years) and 4.7 points among 53 women receiving MEC (age, 54.7 [4.7] years), a mean between-group difference of 5.2 points (95% CI, -6.1 to -3.3; P",
  },
  {
    conditionId: "perimenopause",
    name: "Moderate aerobic exercise",
    kind: "exercise",
    dose: "three supervised sessions a week",
    duration: "12 weeks",
    outcomeFeatureId: null,
    effect: "no effect on hot flushes; small gains in sleep and mood",
    direction: "none",
    grade: "B",
    studyType: "rct",
    population: "sedentary late-perimenopausal and postmenopausal women, n = 248",
    caution:
      "This row is here because the trial was negative: exercise is worth doing, but not for the flushes.",
    paper: {
      doi: "10.1097/gme.0b013e31829e4089",
      pmid: "23899828",
      title: "Efficacy of exercise for menopausal symptoms: a randomized controlled trial",
      year: 2014,
      journal: "Menopause",
    },
    quote:
      "These findings provide strong evidence that 12 weeks of moderate-intensity aerobic exercise do not alleviate VMS but may result in small improvements in sleep quality, insomnia, and depression in midlife sedentary women.",
  },

  /* ── male hypogonadism ─────────────────────────────────────────────────
   * What testosterone actually did in the trials (sexual function, mood; not
   * vitality or walking), what it did not do to the heart, and the list of
   * things that have to be checked before a prescription. */
  {
    conditionId: "male_hypogonadism",
    name: "Testosterone gel",
    kind: "drug",
    dose: "transdermal, titrated into the mid-normal range",
    duration: "1 year",
    outcomeFeatureId: "metric:testosterone_total",
    effect: "into the mid-normal range for men aged 19 to 40",
    direction: "up",
    grade: "B",
    studyType: "rct",
    population: "symptomatic men aged 65 or older with testosterone under 275 ng/dL, n = 790",
    caution:
      "Prescription only; haematocrit and PSA are checked before and during treatment, and fertility falls.",
    paper: {
      doi: "10.1056/NEJMoa1506119",
      pmid: "26886521",
      title: "Effects of Testosterone Treatment in Older Men",
      year: 2016,
      journal: "New England Journal of Medicine",
    },
    quote:
      "In symptomatic men 65 years of age or older, raising testosterone concentrations for 1 year from moderately low to the mid-normal range for men 19 to 40 years of age had a moderate benefit with respect to sexual function and some benefit with respect to mood and depressive symptoms but no benefit with respect to vitality or walking distance.",
  },
  {
    conditionId: "male_hypogonadism",
    name: "Testosterone replacement in men with heart disease",
    kind: "drug",
    dose: "1.62 % transdermal gel, titrated to 350-750 ng/dL",
    duration: "21.7 months of treatment",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.96 (95% CI 0.78 to 1.17) for major adverse cardiac events",
    direction: "none",
    grade: "B",
    studyType: "rct",
    population: "men aged 45-80 with hypogonadism and cardiovascular risk, n = 5,246",
    caution:
      "Non-inferior, not protective: this trial answers a safety question, not an efficacy one.",
    paper: {
      doi: "10.1056/NEJMoa2215025",
      pmid: "37326322",
      title: "Cardiovascular Safety of Testosterone-Replacement Therapy",
      year: 2023,
      journal: "New England Journal of Medicine",
    },
    quote:
      "A primary cardiovascular end-point event occurred in 182 patients (7.0%) in the testosterone group and in 190 patients (7.3%) in the placebo group (hazard ratio, 0.96; 95% confidence interval, 0.78 to 1.17; P",
  },
  {
    conditionId: "male_hypogonadism",
    name: "Check the contraindications before any prescription",
    kind: "procedure",
    dose: null,
    duration: null,
    outcomeFeatureId: "metric:psa_total",
    effect: "PSA, haematocrit and fertility plans decide whether treatment starts",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "men being considered for testosterone therapy",
    caution:
      "Fertility plans, prostate findings, a high haematocrit, untreated sleep apnoea and a recent cardiovascular event all stop treatment.",
    paper: {
      doi: "10.1210/jc.2018-00229",
      pmid: "29562364",
      title:
        "Testosterone Therapy in Men With Hypogonadism: An Endocrine Society Clinical Practice Guideline",
      year: 2018,
      journal: "Journal of Clinical Endocrinology and Metabolism",
    },
    quote:
      "We recommend against starting T therapy in patients who are planning fertility in the near term or have any of the following conditions: breast or prostate cancer, a palpable prostate nodule or induration, prostate-specific antigen level > 4 ng/mL, prostate-specific antigen > 3 ng/mL in men at increased risk of prostate cancer (e.g., African Americans and men with a first-degree relative with diagnosed prostate cancer) without further urological evaluation, elevated hematocrit, untreated severe obstructive sleep apnea, severe lower urinary tract symptoms, uncontrolled heart failure, myocardial infarction or stroke within the last 6 months, or thrombophilia.",
  },

  /* ── gout and high uric acid ───────────────────────────────────────────
   * Urate is in mg/dL here, which is what the DASH trial printed, so
   * `parseEffect` reads that row directly. Allopurinol is first line by the
   * ACR guideline even when the kidneys are poor. */
  {
    conditionId: "gout_hyperuricaemia",
    name: "Allopurinol",
    kind: "drug",
    dose: "start at 100 mg/day or lower, then titrate to target",
    duration: "months, to a urate target",
    outcomeFeatureId: null,
    effect: "first-line urate-lowering therapy, including in stage 3 kidney disease",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "adults with tophaceous gout, radiographic damage or frequent flares",
    caution:
      "Prescription only; a rash is stopped immediately, and HLA-B*58:01 testing is advised in South-East Asian and African ancestry.",
    paper: {
      doi: "10.1002/art.41247",
      pmid: "32390306",
      title: "2020 American College of Rheumatology Guideline for the Management of Gout",
      year: 2020,
      journal: "Arthritis & Rheumatology",
    },
    quote:
      "Strong recommendations included initiation of ULT for all patients with tophaceous gout, radiographic damage due to gout, or frequent gout flares; allopurinol as the preferred first-line ULT, including for those with moderate-to-severe chronic kidney disease (CKD; stage >3); using a low starting dose of allopurinol (≤100 mg/day, and lower in CKD)",
    },
  {
    conditionId: "gout_hyperuricaemia",
    name: "Febuxostat",
    kind: "drug",
    dose: "80 mg/day",
    duration: "52 weeks",
    outcomeFeatureId: null,
    effect: "53 % reached a urate under 6.0 mg/dL on 80 mg, against 21 % on allopurinol 300 mg",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with gout and urate of at least 8.0 mg/dL, n = 760",
    caution:
      "Prescription only; used when allopurinol is not tolerated, and cardiovascular history is weighed first.",
    paper: {
      doi: "10.1056/NEJMoa050373",
      pmid: "16339094",
      title: "Febuxostat compared with allopurinol in patients with hyperuricemia and gout",
      year: 2005,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The primary end point was reached in 53 percent of patients receiving 80 mg of febuxostat, 62 percent of those receiving 120 mg of febuxostat, and 21 percent of those receiving allopurinol",
  },
  {
    conditionId: "gout_hyperuricaemia",
    name: "Treat to a urate target",
    kind: "drug",
    dose: "whatever dose reaches a serum urate under 6 mg/dL",
    duration: "6 months",
    outcomeFeatureId: null,
    effect: "45 %, 67 % and 42 % reached target on febuxostat 40 mg, 80 mg and allopurinol",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with gout and urate of at least 8.0 mg/dL, n = 2,269",
    caution:
      "Flares are commoner in the first months of urate lowering; prophylaxis is prescribed alongside it.",
    paper: {
      doi: "10.1186/ar2978",
      pmid: "20370912",
      title:
        "The urate-lowering efficacy and safety of febuxostat in the treatment of the hyperuricemia of gout: the CONFIRMS trial",
      year: 2010,
      journal: "Arthritis Research & Therapy",
    },
    quote:
      "In febuxostat 40 mg, febuxostat 80 mg, and allopurinol groups, primary endpoint was achieved in 45%, 67%, and 42%, respectively.",
  },
  {
    conditionId: "gout_hyperuricaemia",
    name: "DASH eating pattern",
    kind: "diet",
    dose: null,
    duration: "30 days",
    outcomeFeatureId: "metric:uric_acid",
    effect: "-0.35 mg/dL (95% CI -0.65 to -0.05), and -1.29 mg/dL when urate started above 7",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with prehypertension or stage I hypertension, n = 103",
    caution:
      "Diet moves urate by a fraction of what a drug does; it is an addition, not a replacement.",
    paper: {
      doi: "10.1002/art.39813",
      pmid: "27523583",
      title:
        "Effects of the Dietary Approaches to Stop Hypertension (DASH) Diet and Sodium Intake on Serum Uric Acid",
      year: 2016,
      journal: "Arthritis & Rheumatology",
    },
    quote:
      "The DASH diet reduced serum UA (-0.35 mg/dl [95% confidence interval (95% CI) -0.65, -0.05], P = 0.02), with a higher effect (-1.29 mg/dl [95% CI -2.50, -0.08]) among participants (n = 8) with a baseline serum UA level of ≥7 mg/dl.",
  },

  /* ── osteoporosis risk ─────────────────────────────────────────────────
   * Three drugs with fracture endpoints, one exercise trial with a bone
   * density endpoint, and the calcium-plus-vitamin-D floor everything else
   * is built on. */
  {
    conditionId: "osteoporosis_risk",
    name: "Alendronate",
    kind: "drug",
    dose: "10 mg/day, or 70 mg once weekly",
    duration: "36 months",
    outcomeFeatureId: null,
    effect: "relative risk 0.53 (95% CI 0.41 to 0.68) for new vertebral fracture",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "women aged 55-81 with low femoral-neck density and a vertebral fracture, n = 2,027",
    caution:
      "Prescription only; taken upright with water on an empty stomach, and dental work is planned before starting.",
    paper: {
      doi: "10.1016/S0140-6736(96)07088-2",
      pmid: "8950879",
      title:
        "Randomised trial of effect of alendronate on risk of fracture in women with existing vertebral fractures",
      year: 1996,
      journal: "The Lancet",
    },
    quote:
      "78 (8.0%) of women in the alendronate group had one or more new morphometric vertebral fractures compared with 145 (15.0%) in the placebo group (relative risk 0.53 [95% Cl 0.41-0.68]).",
  },
  {
    conditionId: "osteoporosis_risk",
    name: "Zoledronic acid",
    kind: "drug",
    dose: "5 mg by infusion, once a year",
    duration: "3 years",
    outcomeFeatureId: null,
    effect: "70 % fewer vertebral fractures and 41 % fewer hip fractures",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "postmenopausal women with osteoporosis, mean age 73, n = 7,765",
    caution:
      "Prescription only; a flu-like reaction is common after the first infusion, and calcium and vitamin D are corrected first.",
    paper: {
      doi: "10.1056/NEJMoa067312",
      pmid: "17476007",
      title: "Once-yearly zoledronic acid for treatment of postmenopausal osteoporosis",
      year: 2007,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Treatment with zoledronic acid reduced the risk of morphometric vertebral fracture by 70% during a 3-year period, as compared with placebo (3.3% in the zoledronic-acid group vs. 10.9% in the placebo group; relative risk, 0.30; 95% confidence interval [CI], 0.24 to 0.38) and reduced the risk of hip fracture by 41% (1.4% in the zoledronic-acid group vs. 2.5% in the placebo group; hazard ratio, 0.59; 95% CI, 0.42 to 0.83).",
  },
  {
    conditionId: "osteoporosis_risk",
    name: "Denosumab",
    kind: "drug",
    dose: "60 mg by injection every 6 months",
    duration: "36 months",
    outcomeFeatureId: null,
    effect: "2.3 % against 7.2 % new vertebral fracture (risk ratio 0.32, 95% CI 0.26 to 0.41)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "women aged 60-90 with a T score between -2.5 and -4.0, n = 7,868",
    caution:
      "Prescription only, and it is never simply stopped: rebound vertebral fractures follow a missed dose.",
    paper: {
      doi: "10.1056/NEJMoa0809493",
      pmid: "19671655",
      title: "Denosumab for prevention of fractures in postmenopausal women with osteoporosis",
      year: 2009,
      journal: "New England Journal of Medicine",
    },
    quote:
      "As compared with placebo, denosumab reduced the risk of new radiographic vertebral fracture, with a cumulative incidence of 2.3% in the denosumab group, versus 7.2% in the placebo group (risk ratio, 0.32; 95% confidence interval [CI], 0.26 to 0.41; P",
  },
  {
    conditionId: "osteoporosis_risk",
    name: "High-intensity resistance and impact training",
    kind: "exercise",
    dose: "two supervised sessions a week, above 85 % of one-repetition maximum",
    duration: "8 months",
    outcomeFeatureId: "metric:dexa_t_score",
    effect: "+2.9 % lumbar spine density against -1.2 % on low-intensity home exercise",
    direction: "up",
    grade: "B",
    studyType: "rct",
    population: "postmenopausal women aged about 65 with osteopenia or osteoporosis, n = 101",
    caution:
      "Supervised technique is the whole trial: the same loads unsupervised are how vertebrae break.",
    paper: {
      doi: "10.1002/jbmr.3284",
      pmid: "28975661",
      title:
        "High-Intensity Resistance and Impact Training Improves Bone Mineral Density and Physical Function in Postmenopausal Women With Osteopenia and Osteoporosis: The LIFTMOR Randomized Controlled Trial",
      year: 2018,
      journal: "Journal of Bone and Mineral Research",
    },
    quote:
      "HiRIT (n = 49) effects were superior to CON (n = 52) for lumbar spine (LS) BMD (2.9 ± 2.8% versus -1.2 ± 2.8%, p < 0.001), femoral neck (FN) BMD (0.3 ± 2.6% versus -1.9 ± 2.6%, p = 0.004), FN cortical thickness (13.6 ± 16.6% versus 6.3 ± 16.6%, p = 0.014), height (0.2 ± 0.5 cm versus -0.2 ± 0.5 cm, p = 0.004), and all functional performance measures (p < 0.001).",
  },
  {
    conditionId: "osteoporosis_risk",
    name: "Calcium with vitamin D",
    kind: "supplement",
    dose: "1200 mg of calcium and 800 IU of vitamin D a day",
    duration: "long-term",
    outcomeFeatureId: null,
    effect: "risk ratio 0.88 (95% CI 0.83 to 0.95) for fractures of all types",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "29 randomised trials in adults aged 50 and over, n = 63,897",
    caution:
      "Calcium from food first; the supplement is for people who cannot reach the intake by eating.",
    paper: {
      doi: "10.1016/S0140-6736(07)61342-7",
      pmid: "17720017",
      title:
        "Use of calcium or calcium in combination with vitamin D supplementation to prevent fractures and bone loss in people aged 50 years and older: a meta-analysis",
      year: 2007,
      journal: "The Lancet",
    },
    quote:
      "In trials that reported fracture as an outcome (17 trials, n=52 625), treatment was associated with a 12% risk reduction in fractures of all types (risk ratio 0.88, 95% CI 0.83-0.95; p=0.0004).",
  },

  /* ── low fitness and muscle loss ───────────────────────────────────────
   * Resistance training is the intervention; protein and creatine are what
   * make it work better. The VO2max row is in mL/kg/min, which is the unit
   * the catalog stores `vo2max_est` in. */
  {
    conditionId: "low_fitness_sarcopenia",
    name: "Progressive resistance training",
    kind: "exercise",
    dose: "two or three sessions a week, load increased as strength grows",
    duration: "at least 12 weeks",
    outcomeFeatureId: "metric:grip_kg",
    effect: "SMD 0.84 (95% CI 0.67 to 1.00) for muscle strength",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "121 trials in older adults, n = 6,700",
    caution: null,
    paper: {
      doi: "10.1002/14651858.CD002759.pub2",
      pmid: "19588334",
      title: "Progressive resistance strength training for improving physical function in older adults",
      year: 2009,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "PRT had a large positive effect on muscle strength (73 trials, 3059 participants, SMD 0.84, 95% CI 0.67 to 1.00).",
  },
  {
    conditionId: "low_fitness_sarcopenia",
    name: "Protein intake of 1.6 g/kg/day",
    kind: "diet",
    dose: "1.2-1.6 g of protein per kg of body weight a day, spread across meals",
    duration: "at least 6 weeks alongside training",
    outcomeFeatureId: null,
    effect: "no further gain in fat-free mass above about 1.6 g/kg/day",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "49 studies of resistance training with protein, n = 1,863",
    caution:
      "Kidney disease changes the target; the ceiling in this meta-analysis is for healthy adults.",
    paper: {
      doi: "10.1136/bjsports-2017-097608",
      pmid: "28698222",
      title:
        "A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults",
      year: 2018,
      journal: "British Journal of Sports Medicine",
    },
    quote:
      "With protein supplementation, protein intakes at amounts greater than ~1.6 g/kg/day do not further contribute RET-induced gains in FFM.",
  },
  {
    conditionId: "low_fitness_sarcopenia",
    name: "Creatine monohydrate",
    kind: "supplement",
    dose: "3-5 g/day",
    duration: "7 to 52 weeks alongside resistance training",
    outcomeFeatureId: null,
    effect: "+1.37 kg of lean tissue (95% CI 0.97 to 1.76) against placebo",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "22 studies in adults aged 57-70 training 2-3 days a week, n = 721",
    caution:
      "The gain is only there alongside training; creatine on its own is a full water bottle, not a bigger muscle.",
    paper: {
      doi: "10.2147/OAJSM.S123529",
      pmid: "29138605",
      title:
        "Effect of creatine supplementation during resistance training on lean tissue mass and muscular strength in older adults: a meta-analysis",
      year: 2017,
      journal: "Open Access Journal of Sports Medicine",
    },
    quote:
      "Twenty-two studies were included in our meta-analysis with 721 participants (both men and women; with a mean age of 57-70 years across studies) randomized to creatine supplementation or placebo during resistance training 2-3 days/week for 7-52 weeks.",
  },
  {
    conditionId: "low_fitness_sarcopenia",
    name: "Interval training",
    kind: "exercise",
    dose: "four-minute hard intervals, three sessions a week",
    duration: "12 weeks",
    outcomeFeatureId: "metric:vo2max_est",
    effect: "+3.03 mL/kg/min over moderate continuous training (95% CI 2.00 to 4.07)",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "10 studies in lifestyle-induced cardiometabolic disease, n = 273",
    caution:
      "Hard intervals in someone with known heart disease are started under supervision.",
    paper: {
      doi: "10.1136/bjsports-2013-092576",
      pmid: "24144531",
      title:
        "High-intensity interval training in patients with lifestyle-induced cardiometabolic disease: a systematic review and meta-analysis",
      year: 2014,
      journal: "British Journal of Sports Medicine",
    },
    quote:
      "There was a significantly higher increase in the VO2peak after HIIT compared to MICT (MD 3.03 mL/kg/min, 95% CI 2.00 to 4.07), equivalent to 9.1%.",
  },

  /* ── haemochromatosis ──────────────────────────────────────────────────
   * Venesection until the ferritin is down, then venesection to keep it
   * there. Apheresis is the faster version and the trial says the finish
   * line is the same. The EASL guideline's abstract carries no numbers, so
   * two of these rows quote the guideline itself. */
  {
    conditionId: "haemochromatosis",
    name: "Weekly venesection until iron is depleted",
    kind: "procedure",
    dose: "400-500 mL of blood, weekly",
    duration: "until ferritin reaches 50 µg/L",
    outcomeFeatureId: null,
    effect: "weekly units until ferritin reaches 50 µg/L",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "C282Y homozygotes with iron overload",
    caution:
      "Haemoglobin is checked before each session; the schedule slows if it falls.",
    paper: {
      doi: "10.1016/j.jhep.2010.03.001",
      pmid: "20471131",
      title: "EASL clinical practice guidelines for HFE hemochromatosis",
      year: 2010,
      journal: "Journal of Hepatology",
    },
    quote:
      "Phlebotomy is the treatment of choice, performed weekly until serum ferritin is 50 µg/L.",
  },
  {
    conditionId: "haemochromatosis",
    name: "Maintenance venesection",
    kind: "procedure",
    dose: "one unit every two to four months",
    duration: "lifelong",
    outcomeFeatureId: null,
    effect: "ferritin held at or below 50 µg/L",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "C282Y homozygotes after iron depletion",
    caution:
      "Iron and vitamin C supplements are avoided; vitamin C mobilises stored iron.",
    paper: {
      doi: "10.1016/j.jhep.2010.03.001",
      pmid: "20471131",
      title: "EASL clinical practice guidelines for HFE hemochromatosis",
      year: 2010,
      journal: "Journal of Hepatology",
    },
    quote:
      "Maintenance phlebotomy is then required to keep serum ferritin at 50 µg/L or below.",
  },
  {
    conditionId: "haemochromatosis",
    name: "Erythrocytapheresis instead of whole-blood venesection",
    kind: "procedure",
    dose: "red cells removed by apheresis",
    duration: "until ferritin normalises",
    outcomeFeatureId: null,
    effect: "ferritin falls faster at first, and reaches normal at the same time",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with hereditary haemochromatosis, n = 62",
    caution:
      "Needs an apheresis service and more technician time for the same finish line.",
    paper: {
      doi: "10.2450/2013.0128-13",
      pmid: "24333062",
      title:
        "Erythrocytapheresis compared with whole blood phlebotomy for the treatment of hereditary haemochromatosis",
      year: 2014,
      journal: "Blood Transfusion",
    },
    quote:
      "Initially, ferritin levels declined more rapidly in the apheresis group, and the difference became statistically highly significant at 11 weeks; however, time to normalisation of ferritin level was equal in the two groups.",
  },

  /* ── chronic inflammation ──────────────────────────────────────────────
   * Two trials that lowered inflammation on purpose and measured the events,
   * one diet trial, and the weight-loss arm that moved CRP. Neither
   * anti-inflammatory drug is a supplement-shelf item. */
  {
    conditionId: "chronic_inflammation",
    name: "Canakinumab",
    kind: "drug",
    dose: "150 mg by injection every 3 months",
    duration: "3.7 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.85 (95% CI 0.74 to 0.98) for recurrent cardiovascular events",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults after myocardial infarction with hs-CRP of 2 mg/L or more, n = 10,061",
    caution:
      "Fatal infection was commoner on the drug; it is not licensed for this and is here as proof that inflammation itself matters.",
    paper: {
      doi: "10.1056/NEJMoa1707914",
      pmid: "28845751",
      title: "Antiinflammatory Therapy with Canakinumab for Atherosclerotic Disease",
      year: 2017,
      journal: "New England Journal of Medicine",
    },
    quote:
      "At 48 months, the median reduction from baseline in the high-sensitivity C-reactive protein level was 26 percentage points greater in the group that received the 50-mg dose of canakinumab, 37 percentage points greater in the 150-mg group, and 41 percentage points greater in the 300-mg group than in the placebo group.",
  },
  {
    conditionId: "chronic_inflammation",
    name: "Low-dose colchicine",
    kind: "drug",
    dose: "0.5 mg once daily",
    duration: "28.6 months",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.69 (95% CI 0.57 to 0.83) for cardiovascular events",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with chronic coronary disease, n = 5,522",
    caution:
      "Prescription only; diarrhoea and myopathy are the limits, and it interacts with statins and clarithromycin.",
    paper: {
      doi: "10.1056/NEJMoa2021372",
      pmid: "32865380",
      title: "Colchicine in Patients with Chronic Coronary Disease",
      year: 2020,
      journal: "New England Journal of Medicine",
    },
    quote:
      "A primary end-point event occurred in 187 patients (6.8%) in the colchicine group and in 264 patients (9.6%) in the placebo group (incidence, 2.5 vs. 3.6 events per 100 person-years; hazard ratio, 0.69; 95% confidence interval [CI], 0.57 to 0.83; P",
  },
  {
    conditionId: "chronic_inflammation",
    name: "Weight loss",
    kind: "behaviour",
    dose: "a supervised weight-loss programme",
    duration: "24 weeks",
    outcomeFeatureId: null,
    effect: "CRP, insulin resistance and triglycerides all fell in the weight-loss arms",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with obesity, sleep apnoea and CRP above 1.0 mg/L, n = 181",
    caution: null,
    paper: {
      doi: "10.1056/NEJMoa1306187",
      pmid: "24918371",
      title: "CPAP, weight loss, or both for obstructive sleep apnea",
      year: 2014,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Among the 146 participants for whom there were follow-up data, those assigned to weight loss only and those assigned to the combined interventions had reductions in CRP levels, insulin resistance, and serum triglyceride levels.",
  },
  {
    conditionId: "chronic_inflammation",
    name: "Mediterranean diet with olive oil or nuts",
    kind: "diet",
    dose: "extra-virgin olive oil, or 30 g/day of mixed nuts",
    duration: "4.8 years",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.69 (95% CI 0.53 to 0.91) for major cardiovascular events",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults at high cardiovascular risk without prior disease, n = 7,447",
    caution: null,
    paper: {
      doi: "10.1056/NEJMoa1800389",
      pmid: "29897866",
      title:
        "Primary Prevention of Cardiovascular Disease with a Mediterranean Diet Supplemented with Extra-Virgin Olive Oil or Nuts",
      year: 2018,
      journal: "New England Journal of Medicine",
    },
    quote:
      "In the intention-to-treat analysis including all the participants and adjusting for baseline characteristics and propensity scores, the hazard ratio was 0.69 (95% confidence interval [CI], 0.53 to 0.91) for a Mediterranean diet with extra-virgin olive oil and 0.72 (95% CI, 0.54 to 0.95) for a Mediterranean diet with nuts, as compared with the control diet.",
  },

  /* ── hepatitis B or C ──────────────────────────────────────────────────
   * Hepatitis C is curable in twelve weeks and hepatitis B is suppressed
   * indefinitely; these are the two trials that set those expectations. */
  {
    conditionId: "hepatitis_bc",
    name: "Ledipasvir-sofosbuvir for hepatitis C",
    kind: "drug",
    dose: "one fixed-dose tablet daily",
    duration: "12 weeks",
    outcomeFeatureId: "metric:hcv_rna",
    effect: "99 % sustained virologic response (95% CI 96 to 100)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "previously untreated adults with HCV genotype 1, n = 865",
    caution:
      "Prescription only; hepatitis B is checked first because clearing C can reactivate B.",
    paper: {
      doi: "10.1056/NEJMoa1402454",
      pmid: "24725239",
      title: "Ledipasvir and sofosbuvir for untreated HCV genotype 1 infection",
      year: 2014,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The rates of sustained virologic response were 99% (95% confidence interval [CI], 96 to 100) in the group that received 12 weeks of ledipasvir-sofosbuvir; 97% (95% CI, 94 to 99) in the group that received 12 weeks of ledipasvir-sofosbuvir plus ribavirin; 98% (95% CI, 95 to 99) in the group that received 24 weeks of ledipasvir-sofosbuvir; and 99% (95% CI, 97 to 100) in the group that received 24 weeks of ledipasvir-sofosbuvir plus ribavirin.",
  },
  {
    conditionId: "hepatitis_bc",
    name: "Tenofovir disoproxil fumarate for hepatitis B",
    kind: "drug",
    dose: "300 mg once daily",
    duration: "48 weeks and onward",
    outcomeFeatureId: null,
    effect: "more patients suppressed HBV DNA and improved histology than on adefovir",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with HBeAg-positive or negative chronic hepatitis B, two phase 3 trials",
    caution:
      "Prescription only and usually lifelong; kidney function and bone density are watched.",
    paper: {
      doi: "10.1056/NEJMoa0802878",
      pmid: "19052126",
      title: "Tenofovir disoproxil fumarate versus adefovir dipivoxil for chronic hepatitis B",
      year: 2008,
      journal: "New England Journal of Medicine",
    },
    quote:
      "Among patients with chronic HBV infection, tenofovir DF at a daily dose of 300 mg had superior antiviral efficacy with a similar safety profile as compared with adefovir dipivoxil at a daily dose of 10 mg through week 48.",
  },
  {
    conditionId: "hepatitis_bc",
    name: "Twelve weeks rather than twenty-four",
    kind: "drug",
    dose: "one fixed-dose tablet daily, no ribavirin",
    duration: "12 weeks",
    outcomeFeatureId: null,
    effect: "the same cure rate as 24 weeks, with no discontinuations for adverse events",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "previously untreated adults with HCV genotype 1, n = 865",
    caution: null,
    paper: {
      doi: "10.1056/NEJMoa1402454",
      pmid: "24725239",
      title: "Ledipasvir and sofosbuvir for untreated HCV genotype 1 infection",
      year: 2014,
      journal: "New England Journal of Medicine",
    },
    quote:
      "No patient in either 12-week group discontinued ledipasvir-sofosbuvir owing to an adverse event.",
  },

  /* ── anaemia that is not iron ──────────────────────────────────────────
   * B12 and folate first, because they are cheap and reversible, and a
   * restrictive transfusion threshold because the liberal one does not save
   * lives. */
  {
    conditionId: "anaemia_other",
    name: "Vitamin B12 replacement",
    kind: "supplement",
    dose: "1000-2000 µg/day by mouth, or 1000 µg by injection",
    duration: "until the count recovers, then as the cause requires",
    outcomeFeatureId: "metric:vitamin_b12",
    effect: "haematological and neurological response, oral or injected",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "2 randomised trials in B12-deficient adults, n = 108",
    caution: null,
    paper: {
      doi: "10.1002/14651858.CD004655.pub2",
      pmid: "16034940",
      title: "Oral vitamin B12 versus intramuscular vitamin B12 for vitamin B12 deficiency",
      year: 2005,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "High oral doses of B12 (1000 mcg and 2000 mcg) were as effective as intramuscular administration in achieving haematological and neurological responses.",
  },
  {
    conditionId: "anaemia_other",
    name: "Folic acid replacement",
    kind: "supplement",
    dose: "5 mg/day",
    duration: "4 months",
    outcomeFeatureId: "metric:red_cell_folate",
    effect: "400 µg/day or more; no extra effect from a larger dose",
    direction: "up",
    grade: "A",
    studyType: "meta",
    population: "5 randomised trials, n = 7,391 women",
    caution:
      "Cobalamin is measured first; folate alone can mask a B12 deficiency while the nerves are damaged.",
    paper: {
      doi: "10.1002/14651858.CD007950.pub3",
      pmid: "26662928",
      title:
        "Effects and safety of periconceptional oral folate supplementation for preventing birth defects",
      year: 2015,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "Subgroup analyses suggest that the positive effect of folic acid on NTD incidence and recurrence is not affected by the explored daily folic acid dosage (400 µg (0.4 mg) or higher) or whether folic acid is given alone or with other vitamins and minerals.",
  },
  {
    conditionId: "anaemia_other",
    name: "A restrictive transfusion threshold",
    kind: "procedure",
    dose: "transfuse below 70-80 g/L rather than at 90-100 g/L",
    duration: null,
    outcomeFeatureId: null,
    effect: "relative risk 0.54 (95% CI 0.47 to 0.63) of receiving any red cells, with no excess deaths",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "31 randomised trials, n = 9,813",
    caution:
      "Thresholds are a hospital decision; the point of this row is that more blood is not safer.",
    paper: {
      doi: "10.1136/bmj.h1354",
      pmid: "25805204",
      title:
        "Restrictive versus liberal transfusion strategy for red blood cell transfusion: systematic review of randomised trials with meta-analysis and trial sequential analysis",
      year: 2015,
      journal: "BMJ",
    },
    quote:
      "Restrictive compared with liberal transfusion strategies were not associated with risk of death (0.86, 0.74 to 1.01, 5707 patients, nine lower risk of bias trials), overall morbidity (0.98, 0.85 to 1.12, 4517 patients, six lower risk of bias trials), or fatal or non-fatal myocardial infarction (1.28, 0.66 to 2.49, 4730 patients, seven lower risk of bias trials).",
  },

  /* ── cancer screening overdue ──────────────────────────────────────────
   * One randomised trial per programme, with its own absolute numbers, so
   * the card can say what the test buys instead of saying "recommended". */
  {
    conditionId: "cancer_screening_due",
    name: "Screening colonoscopy",
    kind: "procedure",
    dose: "once between 55 and 64",
    duration: "10 years of follow-up",
    outcomeFeatureId: "metric:colonoscopy_done",
    effect: "risk of colorectal cancer 0.98 % against 1.20 % (risk ratio 0.82, 95% CI 0.70 to 0.93)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "presumptively healthy adults aged 55-64 in four countries, n = 84,585",
    caution:
      "Bowel preparation and sedation; fifteen participants bled after a polyp was removed and none died.",
    paper: {
      doi: "10.1056/NEJMoa2208375",
      pmid: "36214590",
      title: "Effect of Colonoscopy Screening on Risks of Colorectal Cancer and Related Death",
      year: 2022,
      journal: "New England Journal of Medicine",
    },
    quote:
      "In intention-to-screen analyses, the risk of colorectal cancer at 10 years was 0.98% in the invited group and 1.20% in the usual-care group, a risk reduction of 18% (risk ratio, 0.82; 95% confidence interval [CI], 0.70 to 0.93).",
  },
  {
    conditionId: "cancer_screening_due",
    name: "Once-only flexible sigmoidoscopy",
    kind: "procedure",
    dose: "one examination between 55 and 64",
    duration: "11.2 years of follow-up",
    outcomeFeatureId: null,
    effect: "23 % lower colorectal cancer incidence and 31 % lower mortality",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults invited from 14 UK centres, n = 170,432",
    caution: null,
    paper: {
      doi: "10.1016/S0140-6736(10)60551-X",
      pmid: "20430429",
      title:
        "Once-only flexible sigmoidoscopy screening in prevention of colorectal cancer: a multicentre randomised controlled trial",
      year: 2010,
      journal: "The Lancet",
    },
    quote:
      "In intention-to-treat analyses, colorectal cancer incidence in the intervention group was reduced by 23% (hazard ratio 0.77, 95% CI 0.70-0.84) and mortality by 31% (0.69, 0.59-0.82).",
  },
  {
    conditionId: "cancer_screening_due",
    name: "Low-dose CT lung screening",
    kind: "procedure",
    dose: "scans at baseline, year 1, year 3 and year 5.5",
    duration: "10 years of follow-up",
    outcomeFeatureId: "metric:ldct_done",
    effect: "rate ratio 0.76 (95% CI 0.61 to 0.94) for lung-cancer death in men",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "men and women aged 50-74 at high risk, n = 15,789",
    caution:
      "Only for people with a heavy smoking history; the false-positive rate is what the follow-up scans are for.",
    paper: {
      doi: "10.1056/NEJMoa1911793",
      pmid: "31995683",
      title: "Reduced Lung-Cancer Mortality with Volume CT Screening in a Randomized Trial",
      year: 2020,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The cumulative rate ratio for death from lung cancer at 10 years was 0.76 (95% confidence interval [CI], 0.61 to 0.94; P = 0.01) in the screening group as compared with the control group, similar to the values at years 8 and 9.",
  },
  {
    conditionId: "cancer_screening_due",
    name: "HPV testing instead of cytology for cervical screening",
    kind: "procedure",
    dose: "one HPV test per screening round",
    duration: "two screening rounds",
    outcomeFeatureId: null,
    effect: "7 invasive cancers against 18 on cytology over two rounds (p=0.028)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "women aged 25-60 in Italy, n = 94,370",
    caution:
      "In women under 35 it over-diagnoses lesions that would have regressed.",
    paper: {
      doi: "10.1016/S1470-2045(09)70360-2",
      pmid: "20089449",
      title:
        "Efficacy of human papillomavirus testing for the detection of invasive cervical cancers and cervical intraepithelial neoplasia: a randomised controlled trial",
      year: 2010,
      journal: "The Lancet Oncology",
    },
    quote:
      "Overall, in the two rounds of screening, 18 invasive cancers were detected in the cytology group versus seven in the HPV group (p=0.028).",
  },
  {
    conditionId: "cancer_screening_due",
    name: "Mammography every three years",
    kind: "procedure",
    dose: "one screen every 3 years from 50 to 70",
    duration: "20 years",
    outcomeFeatureId: "metric:mammography_done",
    effect: "relative risk 0.80 (95% CI 0.73 to 0.89) for breast cancer death",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "11 randomised trials, reviewed for the UK programme",
    caution:
      "For every death prevented, about three cancers are over-diagnosed and treated; the panel put both numbers in the same sentence.",
    paper: {
      doi: "10.1016/S0140-6736(12)61611-0",
      pmid: "23117178",
      title: "The benefits and harms of breast cancer screening: an independent review",
      year: 2012,
      journal: "The Lancet",
    },
    quote:
      "In a meta-analysis of 11 randomised trials, the relative risk of breast cancer mortality for women invited to screening compared with controls was 0·80 (95% CI 0·73-0·89), which is a relative risk reduction of 20%.",
  },

  /* ── primary adrenal insufficiency ─────────────────────────────────────
   * The Endocrine Society guideline prints its own doses in the abstract,
   * which is why two of these rows are checked quotes. The sick-day rule is
   * the one that keeps people alive and it is the guideline's own sentence. */
  {
    conditionId: "addisons",
    name: "Hydrocortisone replacement",
    kind: "drug",
    dose: "15-25 mg/day, split into two or three doses",
    duration: "lifelong",
    outcomeFeatureId: "metric:cortisol_am",
    effect: "15-25 mg/day of hydrocortisone, or 20-35 mg/day of cortisone acetate",
    direction: "up",
    grade: "A",
    studyType: "guideline",
    population: "adults with primary adrenal insufficiency",
    caution:
      "Prescription only and never stopped abruptly; a missed dose in illness is an emergency.",
    paper: {
      doi: "10.1210/jc.2015-1710",
      pmid: "26760044",
      title:
        "Diagnosis and Treatment of Primary Adrenal Insufficiency: An Endocrine Society Clinical Practice Guideline",
      year: 2016,
      journal: "Journal of Clinical Endocrinology and Metabolism",
    },
    quote:
      "We recommend once-daily fludrocortisone (median, 0.1 mg) and hydrocortisone (15-25 mg/d) or cortisone acetate replacement (20-35 mg/d) applied in two to three daily doses in adults.",
  },
  {
    conditionId: "addisons",
    name: "Fludrocortisone replacement",
    kind: "drug",
    dose: "0.1 mg once daily",
    duration: "lifelong",
    outcomeFeatureId: "metric:sodium",
    effect: "sodium and blood pressure hold once mineralocorticoid is replaced",
    direction: "up",
    grade: "A",
    studyType: "guideline",
    population: "adults with primary adrenal insufficiency",
    caution:
      "Prescription only; salt intake is not restricted and the dose is judged on postural blood pressure and potassium.",
    paper: {
      doi: "10.1210/jc.2015-1710",
      pmid: "26760044",
      title:
        "Diagnosis and Treatment of Primary Adrenal Insufficiency: An Endocrine Society Clinical Practice Guideline",
      year: 2016,
      journal: "Journal of Clinical Endocrinology and Metabolism",
    },
    quote:
      "We recommend once-daily fludrocortisone (median, 0.1 mg) and hydrocortisone (15-25 mg/d) or cortisone acetate replacement (20-35 mg/d) applied in two to three daily doses in adults.",
  },
  {
    conditionId: "addisons",
    name: "Sick-day rules and an emergency injection",
    kind: "behaviour",
    dose: "double the oral dose in fever, and inject 100 mg hydrocortisone if vomiting",
    duration: "for the length of the illness",
    outcomeFeatureId: null,
    effect: "an adrenal crisis is prevented rather than treated",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults with adrenal insufficiency and their households",
    caution:
      "Everyone carries a steroid card and an emergency injection kit, and someone at home knows how to use it.",
    paper: {
      doi: "10.1210/jc.2015-1710",
      pmid: "26760044",
      title:
        "Diagnosis and Treatment of Primary Adrenal Insufficiency: An Endocrine Society Clinical Practice Guideline",
      year: 2016,
      journal: "Journal of Clinical Endocrinology and Metabolism",
    },
    quote:
      "Patients should be educated to increase their glucocorticoid dose during intercurrent illness and be equipped with a steroid emergency card and a hydrocortisone injection kit.",
  },

  /* ── Wilson disease ────────────────────────────────────────────────────
   * Lifelong copper removal. CHELATE is the trial that made trientine a
   * first-choice maintenance drug; the zinc dose is deliberately not printed
   * here, because the elemental dose used in Wilson disease is far above the
   * supplement ceiling in `lib/vectors.ts` and belongs to a hepatologist. */
  {
    conditionId: "wilson",
    name: "Penicillamine",
    kind: "drug",
    dose: null,
    duration: "lifelong",
    outcomeFeatureId: "metric:urine_copper_24h",
    effect: "urinary copper excretion rises while stored copper is removed",
    direction: "up",
    grade: "A",
    studyType: "guideline",
    population: "adults with Wilson disease",
    caution:
      "Prescription only; neurological worsening, marrow suppression and kidney damage are all reasons it is monitored closely.",
    paper: {
      doi: "10.1016/j.jhep.2011.11.007",
      pmid: "22340672",
      title: "EASL Clinical Practice Guidelines: Wilson's disease",
      year: 2012,
      journal: "Journal of Hepatology",
    },
    quote:
      "Chelating agents, penicillamine or trientine, are recommended for initial treatment of symptomatic patients.",
  },
  {
    conditionId: "wilson",
    name: "Trientine tetrahydrochloride",
    kind: "drug",
    dose: null,
    duration: "48 weeks in the trial, lifelong in practice",
    outcomeFeatureId: null,
    effect:
      "non-inferior to penicillamine on non-caeruloplasmin-bound copper (mean difference -9.1 µg/L)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with stable Wilson disease on penicillamine for at least a year, n = 53",
    caution:
      "Prescription only; specialist-set dosing and copper monitoring, and it is taken away from food and from zinc.",
    paper: {
      doi: "10.1016/S2468-1253(22)00270-9",
      pmid: "36183738",
      title:
        "Trientine tetrahydrochloride versus penicillamine for maintenance therapy in Wilson disease (CHELATE): a randomised, open-label, non-inferiority, phase 3 trial",
      year: 2022,
      journal: "The Lancet Gastroenterology & Hepatology",
    },
    quote:
      "After 24 weeks, the mean difference in serum NCC by speciation assay between the penicillamine group and TETA4 group was -9·1 μg/L (95% CI -24·2 to 6·1), with the lower limit of the 95% CI within the defined non-inferiority margin.",
  },
  {
    conditionId: "wilson",
    name: "Zinc maintenance therapy",
    kind: "drug",
    dose: null,
    duration: "lifelong",
    outcomeFeatureId: null,
    effect: "copper absorption is blocked at the gut once the stores are down",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "pre-symptomatic or maintenance-phase Wilson disease",
    caution:
      "The elemental zinc dose used here is far above the supplement ceiling this app will print, so it is set and monitored by a hepatologist.",
    paper: {
      doi: "10.1016/j.jhep.2011.11.007",
      pmid: "22340672",
      title: "EASL Clinical Practice Guidelines: Wilson's disease",
      year: 2012,
      journal: "Journal of Hepatology",
    },
    quote:
      "Zinc may be used as maintenance therapy and in pre-symptomatic patients.",
  },

  /* ── Gilbert syndrome ──────────────────────────────────────────────────
   * There is nothing to treat. What the genotype changes is drug dosing:
   * irinotecan toxicity rises with the dose in *28/*28, and atazanavir turns
   * the yellow up far enough that people stop the drug. */
  {
    conditionId: "gilbert",
    name: "Lower irinotecan doses when UGT1A1*28/*28 is present",
    kind: "drug",
    dose: "100-125 mg/m² rather than a higher dose",
    duration: "per chemotherapy cycle",
    outcomeFeatureId: null,
    effect:
      "odds ratio 3.22 (95% CI 1.52 to 6.81) for grade III-IV toxicity at medium dose, 27.8 at high dose, and no excess at low dose",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "9 studies, 10 patient sets, n = 821",
    caution:
      "This is an oncology decision; the genotype changes the dose, it does not stop the treatment.",
    paper: {
      doi: "10.1093/jnci/djm115",
      pmid: "17728214",
      title: "UGT1A1*28 genotype and irinotecan-induced neutropenia: dose matters",
      year: 2007,
      journal: "Journal of the National Cancer Institute",
    },
    quote:
      "The risk of toxicity was higher among patients with a UGT1A1*28/*28 genotype than among those with a UGT1A1*1/*1 or UGT1A1*1/*28 genotype at both medium (odds ratio [OR] = 3.22, 95% confidence interval [CI] = 1.52 to 6.81; P = .008) and high (OR = 27.8, 95% CI = 4.0 to 195; P = .005) doses of irinotecan.",
  },
  {
    conditionId: "gilbert",
    name: "Consider an alternative to atazanavir",
    kind: "drug",
    dose: null,
    duration: null,
    outcomeFeatureId: "metric:indirect_bilirubin",
    effect: "jaundice bad enough to stop the drug is commonest in two decreased-function alleles",
    direction: "down",
    grade: "A",
    studyType: "guideline",
    population: "people prescribed atazanavir whose UGT1A1 genotype is known",
    caution:
      "The jaundice itself is harmless; the reason to switch is that people stop taking their antiretroviral.",
    paper: {
      doi: "10.1002/cpt.269",
      pmid: "26417955",
      title:
        "Clinical Pharmacogenetics Implementation Consortium (CPIC) Guideline for UGT1A1 and Atazanavir Prescribing",
      year: 2016,
      journal: "Clinical Pharmacology and Therapeutics",
    },
    quote:
      "Risk for bilirubin-related discontinuation is highest among individuals who carry two UGT1A1 decreased function alleles (UGT1A1*28 or *37).",
  },
  {
    conditionId: "gilbert",
    name: "No treatment for the bilirubin itself",
    kind: "behaviour",
    dose: null,
    duration: null,
    outcomeFeatureId: "metric:indirect_bilirubin",
    effect: "the level rises with fasting, illness and dehydration and then settles",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults with isolated unconjugated hyperbilirubinaemia and normal liver enzymes",
    caution:
      "The point of knowing is drug dosing, not the number: nothing is prescribed to lower it.",
    paper: {
      doi: "10.1002/cpt.269",
      pmid: "26417955",
      title:
        "Clinical Pharmacogenetics Implementation Consortium (CPIC) Guideline for UGT1A1 and Atazanavir Prescribing",
      year: 2016,
      journal: "Clinical Pharmacology and Therapeutics",
    },
    quote:
      "The antiretroviral protease inhibitor atazanavir inhibits hepatic uridine diphosphate glucuronosyltransferase (UGT) 1A1, thereby preventing the glucuronidation and elimination of bilirubin.",
  },

  /* ── alpha-1 antitrypsin deficiency ────────────────────────────────────
   * Not smoking is worth more than the infusion; the infusion is the only
   * disease-specific treatment there is, and RAPID is the trial. */
  {
    conditionId: "a1at_deficiency",
    name: "Stopping smoking, with nicotine replacement",
    kind: "behaviour",
    dose: "patch, gum or lozenge from the quit date",
    duration: "8 to 12 weeks",
    outcomeFeatureId: null,
    effect: "relative risk 1.55 (95% CI 1.49 to 1.61) of still being abstinent",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "133 randomised trials, n = 64,640",
    caution: null,
    paper: {
      doi: "10.1002/14651858.CD000146.pub5",
      pmid: "29852054",
      title: "Nicotine replacement therapy versus control for smoking cessation",
      year: 2018,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "The RR of abstinence for any form of NRT relative to control was 1.55 (95% confidence interval (CI) 1.49 to 1.61).",
  },
  {
    conditionId: "a1at_deficiency",
    name: "Intravenous alpha-1 proteinase inhibitor augmentation",
    kind: "drug",
    dose: "60 mg/kg by infusion, weekly",
    duration: "24 months",
    outcomeFeatureId: null,
    effect: "lung density loss 1.45 g/L per year against 2.19 g/L per year on placebo",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "non-smokers aged 18-65 with severe deficiency, n = 180",
    caution:
      "Prescription only, a weekly infusion for life, and only for severe deficiency with emphysema.",
    paper: {
      doi: "10.1016/S0140-6736(15)60860-1",
      pmid: "26026936",
      title:
        "Intravenous augmentation treatment and lung density in severe α1 antitrypsin deficiency (RAPID): a randomised, double-blind, placebo-controlled trial",
      year: 2015,
      journal: "The Lancet",
    },
    quote:
      "However, the annual rate of lung density loss at TLC alone was significantly less in patients in the A1PI group (-1·45 g/L per year [SE 0·23]) than in the placebo group (-2·19 g/L per year [0·25]; difference 0·74 g/L per year [95% CI 0·06-1·42], p=0·03), but was not at FRC alone (A1PI -1·54 g/L per year [0·24]; placebo -2·02 g/L per year [0·26]; difference 0·48 g/L per year [-0·22 to 1·18], p=0·18).",
  },
  {
    conditionId: "a1at_deficiency",
    name: "Test the family and record the phenotype",
    kind: "procedure",
    dose: null,
    duration: null,
    outcomeFeatureId: "metric:aat_phenotype",
    effect: "most people with the deficiency are never diagnosed",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "relatives of someone with a severe deficiency phenotype",
    caution: null,
    paper: {
      doi: "10.1183/13993003.00610-2017",
      pmid: "29191952",
      title:
        "European Respiratory Society statement: diagnosis and treatment of pulmonary disease in α1-antitrypsin deficiency",
      year: 2017,
      journal: "European Respiratory Journal",
    },
    quote:
      "A large proportion of individuals affected remain undiagnosed and therefore without access to appropriate care and treatment.",
  },

  /* ── Fabry disease ─────────────────────────────────────────────────────
   * Enzyme replacement for everyone who can have it, an oral chaperone for
   * the amenable variants, and the Cochrane review that says what the pain
   * actually did. */
  {
    conditionId: "fabry",
    name: "Agalsidase beta (enzyme replacement)",
    kind: "drug",
    dose: "1 mg/kg by infusion every 2 weeks",
    duration: "up to 35 months",
    outcomeFeatureId: null,
    effect: "hazard ratio 0.47 (95% CI 0.21 to 1.03) for time to a first clinical event",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with mild to moderate kidney disease from Fabry disease, n = 82",
    caution:
      "Infusion reactions in about half of those treated; the benefit was larger when kidney function was still good.",
    paper: {
      doi: "10.7326/0003-4819-146-2-200701160-00148",
      pmid: "17179052",
      title: "Agalsidase-beta therapy for advanced Fabry disease: a randomized trial",
      year: 2007,
      journal: "Annals of Internal Medicine",
    },
    quote:
      "Primary intention-to-treat analysis that adjusted for an imbalance in baseline proteinuria showed that, compared with placebo, agalsidase beta delayed the time to first clinical event (hazard ratio, 0.47 [95% CI, 0.21 to 1.03]; P = 0.06).",
  },
  {
    conditionId: "fabry",
    name: "Migalastat (oral chaperone)",
    kind: "drug",
    dose: "150 mg every other day",
    duration: "6 to 24 months",
    outcomeFeatureId: null,
    effect: "left ventricular mass index -7.7 g/m² (95% CI -15.4 to -0.01)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with Fabry disease, 50 of 67 with amenable variants",
    caution:
      "Only works for amenable GLA variants; the assay that decides that has to be the validated one.",
    paper: {
      doi: "10.1056/NEJMoa1510198",
      pmid: "27509102",
      title: "Treatment of Fabry's Disease with the Pharmacologic Chaperone Migalastat",
      year: 2016,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The left-ventricular-mass index decreased significantly from baseline (-7.7 g per square meter; 95% confidence interval [CI], -15.4 to -0.01), particularly when left ventricular hypertrophy was present (-18.6 g per square meter; 95% CI, -38.2 to 1.0).",
  },
  {
    conditionId: "fabry",
    name: "Enzyme replacement for the pain",
    kind: "drug",
    dose: "agalsidase alfa or beta by infusion every 2 weeks",
    duration: "up to 6 months",
    outcomeFeatureId: null,
    effect: "mean difference -2.10 (95% CI -3.79 to -0.41) on the pain score at three months",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "5 randomised trials of agalsidase alfa or beta, n = 187",
    caution: null,
    paper: {
      doi: "10.1002/14651858.CD006663.pub2",
      pmid: "20464743",
      title: "Enzyme replacement therapy for Anderson-Fabry disease",
      year: 2010,
      journal: "Cochrane Database of Systematic Reviews",
    },
    quote:
      "One study reported pain scores, there was a statistically significant improvement for participants receiving treatment at up to three months, mean difference -2.10 (95% confidence interval (CI) -3.79 to -0.41); at up to five months, mean difference -1.90 (95% CI -3.65 to -0.15); and at up to six months, mean difference -2.00 (95% CI -3.66 to -0.34).",
  },

  /* ── mast cell activation and mastocytosis ─────────────────────────────
   * Two KIT inhibitors with randomised evidence, and the thing that matters
   * most day to day: carrying adrenaline. */
  {
    conditionId: "mast_cell_activation",
    name: "Avapritinib",
    kind: "drug",
    dose: "25 mg once daily",
    duration: "24 weeks",
    outcomeFeatureId: "metric:tryptase",
    effect: "54 % had a 50 % or greater fall in serum tryptase, against none on placebo",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with moderate to severe indolent systemic mastocytosis, n = 212",
    caution:
      "Prescription only and specialist-initiated; cognitive effects and bleeding are the watched risks.",
    paper: {
      doi: "10.1056/evidoa2200339",
      pmid: "38320129",
      title: "Avapritinib versus Placebo in Indolent Systemic Mastocytosis",
      year: 2023,
      journal: "NEJM Evidence",
    },
    quote:
      "From baseline to Week 24, 76/141 patients (54%; 45% to 62%) in the avapritinib group compared to 0/71 patients in the placebo group achieved a ≥50% reduction in serum tryptase level; P",
  },
  {
    conditionId: "mast_cell_activation",
    name: "Midostaurin",
    kind: "drug",
    dose: "100 mg twice daily",
    duration: "until progression",
    outcomeFeatureId: "metric:tryptase",
    effect: "median tryptase fell 58 %; overall response rate 60 % (95% CI 49 to 70)",
    direction: "down",
    grade: "B",
    studyType: "rct",
    population: "adults with advanced systemic mastocytosis and organ damage, n = 116",
    caution:
      "For advanced disease only; dose reduction for toxicity was needed in more than half.",
    paper: {
      doi: "10.1056/NEJMoa1513098",
      pmid: "27355533",
      title: "Efficacy and Safety of Midostaurin in Advanced Systemic Mastocytosis",
      year: 2016,
      journal: "New England Journal of Medicine",
    },
    quote:
      "The median best percentage changes in bone marrow mast-cell burden and serum tryptase level were -59% and -58%, respectively.",
  },
  {
    conditionId: "mast_cell_activation",
    name: "Carry an adrenaline auto-injector",
    kind: "behaviour",
    dose: "two auto-injectors, carried at all times",
    duration: "indefinitely",
    outcomeFeatureId: null,
    effect: "adrenaline is the only treatment that stops anaphylaxis",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "people at risk of mast cell mediator release and anaphylaxis",
    caution:
      "Antihistamines are not a substitute; the injector goes into the outer thigh at the first sign.",
    paper: {
      doi: "10.1186/s40413-015-0080-1",
      pmid: "26525001",
      title: "2015 update of the evidence base: World Allergy Organization anaphylaxis guidelines",
      year: 2015,
      journal: "World Allergy Organization Journal",
    },
    quote:
      "Epinephrine is the medication of choice for the treatment of anaphylaxis and should be injected intramuscularly in the mid-outer thigh.",
  },

  /* ── small intestinal bacterial overgrowth ─────────────────────────────
   * One antibiotic with a pooled eradication rate, one diet with a network
   * meta-analysis behind it, and the guideline that says when to test. */
  {
    conditionId: "sibo",
    name: "Rifaximin",
    kind: "drug",
    dose: "1200-1600 mg/day, split across the day",
    duration: "10 to 14 days",
    outcomeFeatureId: "metric:breath_h2_peak",
    effect: "70.8 % eradication (95% CI 61.4 to 78.2)",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "32 studies, n = 1,331",
    caution:
      "Prescription only; it is poorly absorbed, so the side-effect rate is low, but recurrence is common.",
    paper: {
      doi: "10.1111/apt.13928",
      pmid: "28078798",
      title:
        "Systematic review with meta-analysis: rifaximin is effective and safe for the treatment of small intestine bacterial overgrowth",
      year: 2017,
      journal: "Alimentary Pharmacology & Therapeutics",
    },
    quote:
      "The overall eradication rate according to intention-to-treat analysis was 70.8% (95% CI: 61.4-78.2; I 2 = 89.4%) and to per protocol analysis 72.9% (95% CI: 65.5-79.8; I 2 = 87.5%).",
  },
  {
    conditionId: "sibo",
    name: "Low FODMAP diet",
    kind: "diet",
    dose: "four to six weeks of restriction, then structured reintroduction",
    duration: "4 to 6 weeks",
    outcomeFeatureId: null,
    effect: "relative risk 0.67 (95% CI 0.48 to 0.91) of symptoms not improving",
    direction: "down",
    grade: "A",
    studyType: "meta",
    population: "13 randomised trials in irritable bowel syndrome, n = 944",
    caution:
      "Restriction is not permanent: reintroduction is part of the diet, and a dietitian keeps it from narrowing the diet for good.",
    paper: {
      doi: "10.1136/gutjnl-2021-325214",
      pmid: "34376515",
      title:
        "Efficacy of a low FODMAP diet in irritable bowel syndrome: systematic review and network meta-analysis",
      year: 2022,
      journal: "Gut",
    },
    quote:
      "Based on failure to achieve an improvement in global IBS symptoms, a low FODMAP diet ranked first vs habitual diet (RR of symptoms not improving=0.67; 95% CI 0.48 to 0.91, P-score=0.99), and was superior to all other interventions.",
  },
  {
    conditionId: "sibo",
    name: "Breath testing before treating",
    kind: "procedure",
    dose: "a glucose or lactulose breath test",
    duration: null,
    outcomeFeatureId: "metric:breath_h2_peak",
    effect: "a rise of 20 ppm within 90 minutes is the positive threshold",
    direction: "none",
    grade: "A",
    studyType: "guideline",
    population: "adults with bloating, distension and diarrhoea",
    caution:
      "Breath testing is imperfect; a negative test in a typical story does not close the question.",
    paper: {
      doi: "10.14309/ajg.0000000000000501",
      pmid: "32023228",
      title: "ACG Clinical Guideline: Small Intestinal Bacterial Overgrowth",
      year: 2020,
      journal: "American Journal of Gastroenterology",
    },
    quote:
      "Breath testing may be used to diagnose small intestinal bacterial overgrowth in patients with suspected SIBO.",
  },
];

/** "Plant sterols 2 g/day" → "plant_sterols_2_g_day". */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** `https://doi.org/10.1056/NEJMoa012512`, the only url a DOI needs. */
const urlOf = (doi: string) => `https://doi.org/${doi}`;

/**
 * The seeded rows as `hkb_interventions` rows.
 *
 * Pure: `lib/hkb-seed.ts` writes what this returns and the test reads it
 * without a database. The id is stable across runs — condition, name, outcome —
 * so a re-seed updates the row it wrote last time instead of adding one.
 */
export function interventionRows(
  rows: SeedIntervention[] = INTERVENTIONS,
): InterventionRow[] {
  return rows.map((r) => {
    const paper: HkbPaper = {
      pmid: r.paper.pmid ?? null,
      doi: r.paper.doi,
      title: r.paper.title,
      year: r.paper.year,
      journal: r.paper.journal,
      url: urlOf(r.paper.doi),
      quote: r.quote,
    };
    return {
      id: `seed_${r.conditionId}_${slug(r.name)}_${slug(
        r.outcomeFeatureId ?? "condition",
      )}`.slice(0, 120),
      conditionId: r.conditionId,
      name: r.name,
      kind: r.kind,
      dose: r.dose,
      duration: r.duration,
      outcomeFeatureId: r.outcomeFeatureId,
      effect: r.effect,
      direction: r.direction,
      grade: r.grade,
      paper,
      quote: r.quote,
      status: "accepted",
      source: "seed",
      caution: r.caution,
      population: r.population,
    };
  });
}
