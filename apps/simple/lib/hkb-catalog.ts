/**
 * The catalog the seed writes: the eight hand-built hypotheses, patched with
 * their MONDO id and their reason for existing, plus twenty-four more chosen
 * by adult disease burden and by whether a cheap test can settle them.
 *
 * `lib/hypotheses.ts` stays the offline fallback and keeps its own tests, so
 * nothing here changes how `scoreHypotheses` behaves; it only gives it more
 * rows to score. Every evidence rule and every prior carries a source string.
 * A rule with no number in the literature is graded C and says so in `source`.
 *
 * Lens weights: `lifespan` from the cause's share of adult mortality (GBD 2021
 * Lancet, grade A), `energy` from years lived with disability for the same
 * cause (GBD 2021, grade B), `mood` from the psychiatric-comorbidity
 * literature (grade B where a cohort exists, C where it is clinical
 * impression), `weight` from whether the condition moves body weight.
 *
 * Pure data. No database, no clock.
 */
import {
  HYPOTHESES,
  withNegatives,
  type Catalog,
  type EvidenceRule,
  type Hypothesis,
  type PriorBand,
} from "./hypotheses";
import { PRIOR_BANDS } from "./hkb-priors";
import { RARE } from "./hkb-rare";

/* ── the eight that already exist ─────────────────────────────────────── */

interface Patch {
  mondoId?: string;
  why: string;
  parentId?: string;
  name?: string;
  /** symptom rules, added here so `lib/hypotheses.ts` and its tests stay put */
  evidence?: EvidenceRule[];
  /** ancestry modifiers, added for the same reason */
  modifiers?: Hypothesis["priors"]["modifiers"];
}

const PATCHES: Record<string, Patch> = {
  insulin_resistance: {
    why: "High fasting plasma glucose is the third-ranked attributable risk factor for death worldwide (GBD 2021 Lancet); insulin resistance is the decade before it.",
    modifiers: [
      {
        when: { fact: "ancestry", includes: "south asian" },
        times: 2,
        why: "South Asian ancestry roughly doubles insulin resistance at any given BMI, which is why the obesity cut-off moves down from 30 to 23 (A).",
        grade: "A",
        source:
          "Sattar 2015 Lancet Diabetes Endocrinol; WHO 2004 Lancet expert consultation on Asian BMI cut-off points.",
      },
    ],
    evidence: [
      {
        id: "ir_thirst",
        input: { fact: "sym_thirst" },
        when: { equals: "Yes" },
        lr: 3,
        lrNeg: 0.9,
        grade: "C",
        source:
          "Grade C for the size: polyuria and polydipsia only appear once glucose is well past the resistance stage (ADA Standards of Care), so a yes argues hard and a no argues almost nothing. No study puts an LR on the pair in a screening population.",
      },
      {
        id: "ir_weight_gained",
        input: { fact: "sym_weight" },
        when: { equals: "Gained" },
        lr: 1.5,
        grade: "C",
        source:
          "Grade C for the size: weight gain and insulin resistance travel together (Ross 2020 Nat Rev Endocrinol, waist consensus), but no study reports a likelihood ratio for self-reported 6-month gain.",
      },
    ],
  },
  hashimoto: {
    mondoId: "MONDO:0007699",
    parentId: "hypothyroidism",
    why: "Thyroid autoimmunity is the commonest autoimmune disease of adults; ~10 % of women are antibody-positive (Hollowell 2002 J Clin Endocrinol Metab, NHANES III).",
    evidence: [
      {
        id: "hashi_cold",
        input: { fact: "sym_cold" },
        when: { equals: "Yes" },
        lr: 2,
        lrNeg: 0.8,
        grade: "B",
        source:
          "Zulewski 1997 J Clin Endocrinol Metab: cold intolerance separates hypothyroid from euthyroid patients with a likelihood ratio near 2 in the twelve-sign score.",
      },
      {
        id: "hashi_dry_skin",
        input: { fact: "sym_hair_skin" },
        when: { equals: "Yes" },
        lr: 2.3,
        lrNeg: 0.8,
        grade: "B",
        source:
          "Zulewski 1997: dry skin and coarse hair are the two signs with the highest weight in the clinical score.",
      },
      {
        id: "hashi_constipation",
        input: { fact: "sym_bowel" },
        when: { equals: "Constipation" },
        lr: 1.8,
        grade: "B",
        source:
          "Zulewski 1997: constipation is one of the twelve signs, with a smaller weight than dry skin.",
      },
      {
        id: "hashi_tired",
        input: { fact: "sym_energy" },
        when: { equals: "Yes" },
        lr: 1.4,
        lrNeg: 0.7,
        grade: "C",
        source:
          "Grade C for the size: tiredness is in every hypothyroid symptom list (Zulewski 1997) and in every other condition here too, so it is kept deliberately weak. No screening-population LR exists.",
      },
    ],
  },
  iron_deficiency: {
    mondoId: "MONDO:0001356",
    why: "Iron deficiency is the commonest nutritional deficiency in the world and the leading cause of years lived with disability among anaemias (GBD 2021 Lancet).",
    evidence: [
      {
        id: "iron_tired",
        input: { fact: "sym_energy" },
        when: { equals: "Yes" },
        lr: 1.5,
        lrNeg: 0.7,
        grade: "C",
        source:
          "Grade C for the size: fatigue is the presenting symptom in iron deficiency without anaemia and improves on treatment (Verdon 2003 BMJ), but that trial gives an effect size, not a likelihood ratio.",
      },
      {
        id: "iron_heavy_periods",
        input: { fact: "sym_cycle" },
        when: { equals: "Heavy" },
        lr: 3,
        grade: "B",
        source:
          "Munro 2018 Int J Gynaecol Obstet: heavy menstrual bleeding is the dominant cause of iron deficiency in premenopausal women; roughly a third are iron-deficient against a tenth of the rest.",
      },
    ],
  },
  iron_deficiency_cause_gi: {
    mondoId: "MONDO:0005011",
    why: "Iron deficiency in a man or a postmenopausal woman is a bowel-cancer red flag; colorectal cancer is a top-five cancer killer (GBD 2021 Lancet).",
    evidence: [
      {
        id: "gi_bowel_change",
        input: { fact: "sym_bowel" },
        when: { equals: "Diarrhoea and bloating" },
        lr: 2,
        grade: "C",
        source:
          "Grade C for the size: a changed bowel habit with iron deficiency is a two-week-wait criterion (NICE NG12), which is a referral rule and not a likelihood ratio.",
      },
    ],
  },
  pcos: {
    mondoId: "MONDO:0008487",
    why: "PCOS affects 8–13 % of women of reproductive age and is the commonest cause of anovulatory infertility (Teede 2023 international evidence-based guideline).",
    evidence: [
      // `pcos_cycle_irregular` moved to `lib/hypotheses.ts` in phase 21: it was
      // the second rule over one answer, and the offline catalog needs it too.
      {
        id: "pcos_weight_gained",
        input: { fact: "sym_weight" },
        when: { equals: "Gained" },
        lr: 1.5,
        grade: "C",
        source:
          "Grade C for the size: weight gain is common in PCOS and PCOS is commoner with obesity (Teede 2023), but the direction of that association is not settled and no LR is published.",
      },
    ],
  },
  sleep_apnoea: {
    mondoId: "MONDO:0007147",
    why: "Moderate-to-severe sleep apnoea affects ~13 % of men and 6 % of women aged 30–70 and roughly doubles cardiovascular mortality (Peppard 2013 Am J Epidemiol; Marin 2005 Lancet).",
    evidence: [
      // `osa_sleepiness` moved to `lib/hypotheses.ts` in phase 21: it was the
      // same id twice, once over a fact nobody writes.
      {
        id: "osa_weight_gained",
        input: { fact: "sym_weight" },
        when: { equals: "Gained" },
        lr: 1.6,
        grade: "C",
        source:
          "Grade C for the size: a 10 % weight gain raises the apnoea-hypopnoea index about 32 % (Peppard 2000 JAMA), which is a dose-response, not a likelihood ratio for a 3 kg self-report.",
      },
    ],
  },
  nafld: {
    mondoId: "MONDO:0013209",
    name: "MASLD (metabolic dysfunction-associated steatotic liver disease)",
    why: "Steatotic liver disease is in ~25–30 % of adults and is now the fastest-rising cause of liver cancer and transplant (Younossi 2023 Hepatology; GBD 2021 cirrhosis).",
  },
  b12_deficiency: {
    mondoId: "MONDO:0020696",
    why: "B12 deficiency is 6–10 % of adults and higher over 60; the neurological damage is only partly reversible (Stabler 2013 NEJM).",
    evidence: [
      {
        id: "b12_tired",
        input: { fact: "sym_energy" },
        when: { equals: "Yes" },
        lr: 1.4,
        lrNeg: 0.8,
        grade: "C",
        source:
          "Grade C for the size: fatigue is the usual presenting complaint (Stabler 2013 NEJM) and is far too common to carry weight on its own. No screening-population LR exists.",
      },
    ],
  },
};

/* ── the twenty-four new ones ─────────────────────────────────────────── */

const HYPERTENSION: Hypothesis = {
  id: "hypertension",
  name: "High blood pressure",
  mondoId: "MONDO:0005044",
  why: "High systolic blood pressure is the single largest attributable risk factor for death in the world: 10.8 million deaths a year (GBD 2019 Lancet).",
  summary:
    "The most attributable risk there is, and the cheapest to measure. Risk climbs log-linearly from 115/75 upwards, with no threshold where it starts.",
  priors: {
    base: 0.32,
    source:
      "NCD-RisC 2021 Lancet: about a third of adults aged 30–79 have hypertension worldwide, replaced by the country row when one is imported.",
    bands: PRIOR_BANDS.hypertension,
    modifiers: [
      {
        when: {
          fact: "family_history",
          includes: "hypertension|high blood pressure|stroke",
        },
        times: 1.7,
        why: "A parent or sibling with hypertension or stroke raises the risk roughly 1.7× (B).",
        grade: "B",
        source:
          "Wang 2008 Am J Hypertens: parental hypertension and offspring risk in Framingham.",
      },
      {
        when: { minAge: 60 },
        times: 1.8,
        why: "Systolic pressure rises with arterial stiffness all through adult life (A).",
        grade: "A",
        source:
          "Franklin 1997 Circulation: the Framingham systolic trajectory by decade.",
      },
    ],
  },
  evidence: [
    {
      id: "htn_home_bp_high",
      input: { fact: "bp_systolic" },
      when: { above: 134 },
      lr: 8,
      lrNeg: 0.3,
      grade: "A",
      source:
        "ESC/ESH 2023 guideline: a 7-day home average at or above 135/85 defines hypertension, and an average below it largely excludes it.",
      confoundedBy: ["bp_systolic"],
    },
    {
      id: "htn_office_bp",
      input: { metric: "bp_systolic" },
      when: { above: 139 },
      lr: 4,
      grade: "A",
      source:
        "ESC/ESH 2023: an office systolic at or above 140 is the office threshold; weaker than home because of the white-coat effect.",
      confoundedBy: ["bp_systolic"],
    },
    {
      id: "htn_waist",
      input: { fact: "waist_height_ratio" },
      when: { above: 0.55 },
      lr: 1.8,
      grade: "B",
      source:
        "Ashwell 2012 Obes Rev: waist-to-height above 0.5–0.55 predicts hypertension better than BMI in a meta-analysis of 300 000 adults.",
    },
    {
      id: "htn_snoring",
      input: { fact: "sleep_snoring" },
      when: { equals: "Most nights" },
      lr: 1.8,
      grade: "B",
      source:
        "Peppard 2000 NEJM: sleep-disordered breathing predicts incident hypertension with a dose-response over four years.",
    },
    {
      id: "htn_alcohol",
      input: { fact: "sym_alcohol" },
      when: { includes: "4 or more times a week" },
      lr: 1.5,
      grade: "B",
      source:
        "Roerecke 2017 Lancet Public Health: cutting heavy drinking lowers systolic pressure by about 5 mmHg, so the association runs the other way too.",
    },
  ],
  discriminators: [
    {
      test: "7-day home blood pressure average",
      codes: ["bp_systolic"],
      cost: 1,
      lrPos: 8,
      lrNeg: 0.3,
      typicalPos: 148,
      typicalNeg: 118,
      unit: "mmHg",
      repeatable: true,
      howTo:
        "Twice a morning and twice an evening for seven days, sitting, arm supported, after five minutes still. Throw the first day away and average the rest.",
    },
    {
      test: "Urine albumin/creatinine ratio",
      codes: ["urine_albumin_creatinine_ratio"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.7,
      typicalPos: 45,
      typicalNeg: 4,
      unit: "mg/g",
      howTo:
        "A first-morning urine. Albumin in the urine is the earliest sign that the pressure has already damaged something.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
    energy: { w: 1, grade: "C" },
  },
  management:
    "Confirm with a 7-day home average before anyone prescribes anything. Then salt below 5 g a day, alcohol down, 150 minutes of aerobic work a week, weight down if the waist says so, and potassium up from food. Treat at 140/90 office or 135/85 home, earlier if the risk is high. Check the kidneys with creatinine and an albumin/creatinine ratio at diagnosis.",
};

const ASCVD_RISK: Hypothesis = {
  id: "ascvd_risk",
  name: "Atherosclerotic risk",
  mondoId: "MONDO:0005311",
  why: "Ischaemic heart disease is the leading cause of death worldwide, 9 million deaths a year (GBD 2021 Lancet).",
  summary:
    "Plaque builds silently for decades. The exposure that causes it is apoB particles multiplied by years, so the arithmetic starts long before any symptom.",
  priors: {
    base: 0.25,
    source:
      "About a quarter of adults carry an apoB high enough to build plaque over a lifetime; Ference 2017 Eur Heart J frames it as cumulative exposure rather than a state (grade C for the number).",
    bands: PRIOR_BANDS.ascvd_risk,
    modifiers: [
      {
        when: {
          fact: "family_history",
          includes: "heart attack|myocardial|mi |stroke|angina|bypass|stent",
        },
        times: 2,
        why: "A first-degree relative with early cardiovascular disease roughly doubles the risk (A).",
        grade: "A",
        source:
          "Lloyd-Jones 2004 JAMA: parental cardiovascular disease and offspring events in Framingham.",
      },
      {
        when: { fact: "smoking", includes: "current" },
        times: 2,
        why: "Smoking roughly doubles cardiovascular events and the risk falls within years of stopping (A).",
        grade: "A",
        source: "Doll 2004 BMJ: fifty years of observation in British doctors.",
      },
      {
        when: { minAge: 55 },
        times: 1.8,
        why: "Age is exposure time: the same apoB does more damage after five decades (A).",
        grade: "A",
        source:
          "Ference 2017 Eur Heart J: LDL exposure is the product of concentration and years.",
      },
    ],
  },
  evidence: [
    {
      id: "ascvd_apob",
      input: { metric: "apolipoprotein_b" },
      when: { above: 90 },
      lr: 3,
      grade: "A",
      source:
        "Sniderman 2019 JAMA Cardiol: apoB discriminates events better than LDL-C. ESC/EAS 2019 and the EAS 2022 apoB consensus put the population threshold at 90 mg/dL, which is where the risk gradient starts.",
    },
    {
      id: "ascvd_apob_low",
      input: { metric: "apolipoprotein_b" },
      when: { below: 80 },
      lr: 0.5,
      grade: "A",
      source:
        "EAS 2022 apoB consensus (Marston 2022 JAMA Cardiol pooled analysis): an apoB under 80 mg/dL is the high-risk treatment target and halves the event rate against the population mean. This is the negative side of the same test, without which the engine will not order it.",
    },
    {
      id: "ascvd_apob_discordant_high",
      input: { derived: "apobLdl" },
      when: { above: 10 },
      lr: 2,
      grade: "A",
      source:
        "Sniderman 2019 JAMA Cardiol and Wilkins 2016 J Am Coll Cardiol (MESA discordance analysis): when apoB is high relative to LDL-C, the apoB is what the event rate follows. Discordance is defined here as apoB more than 10 mg/dL above 0.75 x LDL-C.",
    },
    {
      id: "ascvd_apob_discordant_low",
      input: { derived: "apobLdl" },
      when: { below: -10 },
      lr: 0.6,
      grade: "A",
      source:
        "Sniderman 2019 JAMA Cardiol; Wilkins 2016 J Am Coll Cardiol: the discordant group with low apoB and high LDL-C carries the event rate of its apoB, not of its LDL-C. This is the arm that matters for a lean mass hyper-responder.",
    },
    {
      id: "ascvd_ldl",
      input: { metric: "ldl_cholesterol" },
      when: { above: 160 },
      lr: 2.5,
      grade: "A",
      source:
        "Ference 2017 Eur Heart J: the EAS consensus that LDL is causal, with a dose-response by concentration.",
    },
    {
      id: "ascvd_non_hdl",
      input: { derived: "nonHdl" },
      when: { above: 130 },
      lr: 2,
      grade: "A",
      source:
        "ESC/EAS 2019 dyslipidaemia guideline: non-HDL is the apoB stand-in when apoB is not available.",
    },
    {
      id: "ascvd_lpa",
      input: { metric: "lp_a" },
      when: { above: 50 },
      lr: 2,
      grade: "A",
      source:
        "Kamstrup 2009 JAMA: Lp(a) above 50 mg/dL carries a two- to threefold myocardial-infarction risk, and it is genetic.",
    },
    {
      id: "ascvd_hscrp",
      input: { metric: "hs_crp" },
      when: { above: 3 },
      lr: 1.6,
      grade: "B",
      source:
        "Emerging Risk Factors Collaboration 2010 Lancet: CRP adds modestly to risk once lipids and pressure are in the model.",
      confoundedBy: ["hs_crp"],
    },
    {
      id: "ascvd_cac",
      input: { fact: "cac_score" },
      when: { above: 100 },
      lr: 6,
      lrNeg: 0.2,
      grade: "A",
      source:
        "Detrano 2008 NEJM (MESA): a coronary calcium score above 100 multiplies event risk several-fold, and a score of zero is the strongest negative test in cardiology.",
    },
  ],
  discriminators: [
    {
      // Nothing in the catalog could order the commonest draw in preventive
      // medicine, so the LDL and non-HDL rules were unanswerable and the path
      // never got to apoB. It scores on the LDL, because a test writes one
      // number to every code it names and an HDL of 180 is not a thing.
      test: "Lipid panel",
      codes: ["ldl_cholesterol"],
      cost: 1,
      lrPos: 2.5,
      lrNeg: 0.4,
      typicalPos: 180,
      typicalNeg: 90,
      unit: "mg/dL",
      howTo:
        "One draw, no fast needed for a modern panel. It reports total, LDL, HDL and triglycerides; the LDL is what the risk rules read, and apoB is the better follow-up when it comes back high.",
    },
    {
      test: "ApoB",
      codes: ["apolipoprotein_b"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.4,
      typicalPos: 120,
      typicalNeg: 65,
      unit: "mg/dL",
      howTo:
        "No fast needed. It counts the particles rather than the cholesterol inside them, which is what actually enters the artery wall.",
    },
    {
      test: "Lp(a)",
      codes: ["lp_a"],
      cost: 2,
      lrPos: 2,
      lrNeg: 0.8,
      typicalPos: 90,
      typicalNeg: 12,
      unit: "mg/dL",
      howTo:
        "Once in a lifetime. It is set by your genes and does not move with diet.",
    },
    {
      test: "Coronary calcium score (CAC)",
      codes: ["cac_score"],
      cost: 3,
      lrPos: 6,
      lrNeg: 0.2,
      typicalPos: 180,
      typicalNeg: 0,
      unit: "Agatston",
      howTo:
        "A two-minute CT, about 1 mSv. A zero score in a 50-year-old buys years of reassurance; a high score changes the conversation about statins.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
  },
  management:
    "Measure apoB and Lp(a) once, then decide on lifetime exposure rather than a ten-year score. Stop smoking first, then pressure, then apoB. A calcium score at 40–50 settles most arguments about whether to treat. If apoB stays above target on diet, a statin is the cheapest intervention in medicine.",
};

const FAMILIAL_HYPERCHOLESTEROLAEMIA: Hypothesis = {
  id: "familial_hypercholesterolaemia",
  name: "Familial hypercholesterolaemia",
  mondoId: "MONDO:0007750",
  parentId: "ascvd_risk",
  why: "About 1 in 300 adults carries it, fewer than 10 % know, and untreated it causes heart attacks in the forties (Nordestgaard 2013 Eur Heart J).",
  summary:
    "One gene, a lifetime of high LDL, and an artery that has been under load since childhood. The single most treatable cause of an early heart attack.",
  priors: {
    base: 0.003,
    source:
      "Nordestgaard 2013 Eur Heart J: prevalence of heterozygous FH is about 1 in 200 to 1 in 300.",
    bands: PRIOR_BANDS.familial_hypercholesterolaemia,
    modifiers: [
      {
        when: {
          fact: "family_history",
          includes: "heart attack|myocardial|cholesterol|angina",
        },
        times: 5,
        why: "FH is autosomal dominant: half the first-degree relatives carry it (A).",
        grade: "A",
        source:
          "Nordestgaard 2013 Eur Heart J: cascade screening finds one carrier per two relatives tested.",
      },
    ],
  },
  evidence: [
    {
      id: "fh_ldl_severe",
      input: { metric: "ldl_cholesterol" },
      when: { above: 190 },
      lr: 8,
      lrNeg: 0.2,
      grade: "A",
      source:
        "Dutch Lipid Clinic Network criteria: untreated LDL above 190 mg/dL is the entry criterion; below 155 the diagnosis is very unlikely.",
    },
    {
      id: "fh_ldl_very_severe",
      input: { metric: "ldl_cholesterol" },
      when: { above: 250 },
      lr: 25,
      grade: "A",
      source:
        "Dutch Lipid Clinic Network criteria: LDL above 325 mg/dL scores 8 points alone; above 250 is already strongly suggestive.",
    },
    {
      id: "fh_family_early_mi",
      input: { fact: "family_history" },
      when: { includes: "heart attack|myocardial" },
      lr: 3,
      grade: "A",
      source:
        "Dutch Lipid Clinic Network criteria: premature coronary disease in a first-degree relative scores 1 point.",
    },
    {
      id: "fh_xanthoma",
      input: { fact: "conditions" },
      when: { includes: "xanthoma|xanthelasma|arcus" },
      lr: 20,
      grade: "A",
      source:
        "Dutch Lipid Clinic Network criteria: tendon xanthomata score 6 points, the highest single clinical item.",
    },
  ],
  discriminators: [
    {
      test: "FH genetic panel (LDLR, APOB, PCSK9)",
      codes: ["fh_genetic_panel"],
      cost: 3,
      lrPos: 30,
      lrNeg: 0.5,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "A mutation confirms it and lets the family be tested. A negative panel does not exclude it: 20–40 % of clinical FH has no identified mutation.",
    },
    {
      test: "Repeat LDL off any treatment",
      codes: ["ldl_cholesterol"],
      cost: 1,
      lrPos: 8,
      lrNeg: 0.2,
      typicalPos: 230,
      typicalNeg: 120,
      unit: "mg/dL",
      repeatable: true,
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
  },
  management:
    "Two untreated LDL readings above 190 mg/dL with a family history is enough to act on. Treat hard and early: a statin plus ezetimibe, target an LDL under 100, under 70 with any other risk. Then test the parents, siblings and children, because half of them carry it.",
};

const LPA_ELEVATED: Hypothesis = {
  id: "lpa_elevated",
  name: "High lipoprotein(a)",
  mondoId: "MONDO:0037748",
  why: "About 20 % of people carry an Lp(a) above 50 mg/dL, a causal and genetically fixed cardiovascular risk that almost nobody has measured (Kamstrup 2009 JAMA; EAS 2022 consensus).",
  summary:
    "A number you inherit and measure once. It does not move with diet or statins, but knowing it changes how hard everything else should be treated.",
  priors: {
    base: 0.2,
    source:
      "EAS 2022 consensus statement: roughly one adult in five is above the 50 mg/dL threshold, with wide variation by ancestry.",
    bands: PRIOR_BANDS.lpa_elevated,
    modifiers: [
      {
        when: { fact: "ancestry", includes: "african" },
        times: 1.5,
        why: "Lp(a) distributions run substantially higher in people of African ancestry (A).",
        grade: "A",
        source:
          "Guan 2015 Arterioscler Thromb Vasc Biol (MESA): Lp(a) by ethnicity, Black participants highest.",
      },
      {
        when: {
          fact: "family_history",
          includes: "heart attack|myocardial|stroke",
        },
        times: 1.5,
        why: "Early family cardiovascular disease with normal lipids is the classic Lp(a) presentation (B).",
        grade: "B",
        source:
          "EAS 2022 consensus: measure Lp(a) in anyone with premature cardiovascular disease in the family.",
      },
    ],
  },
  evidence: [
    {
      id: "lpa_high",
      input: { metric: "lp_a" },
      when: { above: 50 },
      lr: 30,
      lrNeg: 0.05,
      grade: "A",
      source:
        "EAS 2022 consensus: the definition is the measurement, so the test all but settles it either way.",
    },
  ],
  discriminators: [
    {
      test: "Lp(a) once",
      codes: ["lp_a"],
      cost: 2,
      lrPos: 30,
      lrNeg: 0.05,
      typicalPos: 90,
      typicalNeg: 12,
      unit: "mg/dL",
      howTo:
        "Once in a life. Ask for the molar unit (nmol/L) if the lab offers it; mass units vary between assays.",
    },
  ],
  lenses: {
    lifespan: { w: 2, grade: "A" },
  },
  confirmAtLrPos: 20,
  management:
    "One measurement, ever. If it is high there is no drug for it yet, so the answer is to treat everything else harder: apoB well under 80, blood pressure at target, no smoking, and tell your first-degree relatives to measure theirs.",
};

const TYPE2_DIABETES: Hypothesis = {
  id: "type2_diabetes",
  name: "Type 2 diabetes",
  mondoId: "MONDO:0005148",
  why: "Diabetes and high fasting glucose account for around 2 million deaths a year and are the third-ranked risk factor globally (GBD 2021 Lancet).",
  summary:
    "The point where the pancreas stops compensating. Half of it is undiagnosed, and the complications start before the diagnosis does.",
  priors: {
    base: 0.09,
    source:
      "NCD-RisC 2024 Lancet: age-standardised diabetes prevalence in adults is about 14 % globally and 9 % in most of Europe, replaced by the country row when one is imported.",
    bands: PRIOR_BANDS.type2_diabetes,
    modifiers: [
      {
        when: { fact: "family_history", includes: "diabet" },
        times: 2.5,
        why: "A parent or sibling with type 2 diabetes multiplies the risk about 2.5× (A).",
        grade: "A",
        source:
          "InterAct Consortium 2013 Diabetologia: family history and incident type 2 diabetes across eight countries.",
      },
      {
        when: { fact: "ancestry", includes: "south asian" },
        times: 2,
        why: "South Asian ancestry roughly doubles the risk at any given BMI, and the obesity cut-off moves down to 23 (A).",
        grade: "A",
        source:
          "Sattar 2015 Lancet Diabetes Endocrinol; WHO 2004 Lancet expert consultation on Asian BMI cut-offs.",
      },
      {
        when: { minAge: 45 },
        times: 2,
        why: "Incidence roughly doubles between the fourth and sixth decade (A).",
        grade: "A",
        source: "IDF Diabetes Atlas 10th edition: prevalence by age band.",
      },
    ],
  },
  evidence: [
    {
      id: "t2d_hba1c_diabetic",
      input: { metric: "hba1c" },
      when: { above: 6.4 },
      lr: 30,
      grade: "A",
      source:
        "ADA Standards of Care: HbA1c at or above 6.5 % is diagnostic on two occasions.",
    },
    {
      id: "t2d_hba1c_pre",
      input: { metric: "hba1c" },
      when: { above: 5.6, below: 6.5 },
      lr: 3,
      grade: "A",
      source:
        "ADA Standards of Care: 5.7–6.4 % is prediabetes, and 5–10 % of it converts every year.",
    },
    {
      id: "t2d_hba1c_normal",
      input: { metric: "hba1c" },
      when: { below: 5.5 },
      lr: 0.15,
      grade: "A",
      source:
        "ADA Standards of Care: an HbA1c under 5.5 % makes undiagnosed diabetes very unlikely.",
    },
    {
      id: "t2d_glucose",
      input: { metric: "glucose" },
      when: { above: 125 },
      lr: 20,
      grade: "A",
      source:
        "ADA Standards of Care: a fasting glucose at or above 126 mg/dL on two occasions is diagnostic.",
      confoundedBy: ["glucose"],
    },
    {
      id: "t2d_thirst",
      input: { fact: "sym_thirst" },
      when: { equals: "Yes" },
      lr: 4,
      lrNeg: 0.9,
      grade: "C",
      source:
        "Grade C for the size: polyuria and polydipsia are specific but very insensitive, so a yes argues hard and a no argues almost nothing (ADA Standards of Care). No screening-population LR is published.",
    },
    {
      id: "t2d_weight_lost",
      input: { fact: "sym_weight" },
      when: { equals: "Lost" },
      lr: 2,
      grade: "C",
      source:
        "Grade C for the size: unintended weight loss appears at higher glucose levels and is a classic presenting sign, but nobody has published a likelihood ratio for it in adults screened for type 2.",
    },
    {
      id: "t2d_ir",
      input: { hypothesis: "insulin_resistance" },
      when: { above: 0.6 },
      lr: 3,
      grade: "B",
      source:
        "DeFronzo 2009 Diabetes: resistance precedes the diagnosis by years, so a high resistance score raises it.",
    },
  ],
  discriminators: [
    {
      test: "HbA1c",
      codes: ["hba1c"],
      cost: 1,
      lrPos: 30,
      lrNeg: 0.15,
      typicalPos: 6.8,
      typicalNeg: 5.2,
      unit: "%",
      howTo:
        "No fast needed. It averages the last three months, so a single bad week does not move it.",
      repeatable: true,
    },
    {
      test: "OGTT",
      codes: ["ogtt_2h_glucose"],
      cost: 2,
      lrPos: 15,
      lrNeg: 0.2,
      typicalPos: 210,
      typicalNeg: 110,
      unit: "mg/dL",
      howTo:
        "Two hours after 75 g of glucose. It catches the people whose fasting numbers look fine and whose post-meal ones do not.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
    energy: { w: 2, grade: "B" },
    weight: { w: 2, grade: "B" },
  },
  confirmAtLrPos: 20,
  management:
    "Two abnormal readings, on separate days, before anyone says the word. Then: weight down 5–10 % if there is weight to lose, 150 minutes of activity a week, resistance training twice a week, and metformin as the cheapest and safest first drug. Retest HbA1c at three months. Screen the eyes, the feet and the kidneys at diagnosis, because the complications started before you did.",
};

const CKD: Hypothesis = {
  id: "ckd",
  name: "Chronic kidney disease",
  mondoId: "MONDO:0005300",
  why: "Chronic kidney disease killed about 1.5 million people in 2021 and is climbing faster than almost any other cause (GBD 2021 Lancet).",
  summary:
    "Silent until it is late. Two numbers, eGFR and albumin in the urine, catch it a decade before anything hurts, and they predict death independently of each other.",
  priors: {
    base: 0.1,
    source:
      "Hill 2016 PLoS One: global prevalence of CKD stages 1–5 is about 13 %, most of it stage 3 and undiagnosed.",
    bands: PRIOR_BANDS.ckd,
    modifiers: [
      {
        when: { fact: "conditions", includes: "diabet" },
        times: 3,
        why: "Diabetes is the leading cause of kidney failure (A).",
        grade: "A",
        source:
          "KDIGO 2024 CKD guideline: diabetes and hypertension account for most incident CKD.",
      },
      {
        when: { minAge: 65 },
        times: 3,
        why: "eGFR falls about 1 mL/min a year after 40, so age alone puts many people under 60 (A).",
        grade: "A",
        source:
          "Levey 2009 Ann Intern Med (CKD-EPI): the age term in the equation.",
      },
    ],
  },
  evidence: [
    {
      id: "ckd_egfr_low",
      input: { derived: "egfr" },
      when: { below: 60 },
      lr: 12,
      lrNeg: 0.2,
      grade: "A",
      source:
        "KDIGO 2024: eGFR below 60 mL/min/1.73 m² for over three months defines stage 3, whatever the cause.",
      confoundedBy: ["creatinine"],
    },
    {
      id: "ckd_egfr_borderline",
      input: { derived: "egfr" },
      when: { above: 59, below: 75 },
      lr: 2,
      grade: "B",
      source:
        "KDIGO 2024: 60–89 with albuminuria is already stage 2, and the 60–75 band is where the trajectory shows.",
    },
    {
      id: "ckd_acr",
      input: { metric: "urine_albumin_creatinine_ratio" },
      when: { above: 30 },
      lr: 8,
      lrNeg: 0.4,
      grade: "A",
      source:
        "CKD Prognosis Consortium 2010 Lancet: an ACR above 30 mg/g predicts mortality independently of eGFR, in over a million people.",
    },
    {
      id: "ckd_cystatin",
      input: { metric: "cystatin_c" },
      when: { above: 1.1 },
      lr: 4,
      grade: "A",
      source:
        "Shlipak 2013 NEJM: cystatin C reclassifies people whose creatinine-based eGFR is misleading because of muscle mass.",
    },
    {
      id: "ckd_hypertension",
      input: { hypothesis: "hypertension" },
      when: { above: 0.6 },
      lr: 2,
      grade: "A",
      source:
        "KDIGO 2024: hypertension is both a cause and a consequence of kidney disease.",
    },
  ],
  discriminators: [
    {
      test: "Cystatin C with creatinine",
      codes: ["cystatin_c"],
      cost: 2,
      lrPos: 4,
      lrNeg: 0.3,
      typicalPos: 1.4,
      typicalNeg: 0.8,
      unit: "mg/L",
      howTo:
        "Independent of muscle mass, so it settles a creatinine that is high because of the gym rather than the kidney.",
    },
    {
      test: "Urine albumin/creatinine ratio",
      codes: ["urine_albumin_creatinine_ratio"],
      cost: 1,
      lrPos: 8,
      lrNeg: 0.4,
      typicalPos: 60,
      typicalNeg: 5,
      unit: "mg/g",
      repeatable: true,
      howTo:
        "First-morning urine, repeated once within three months. One raised result is not a diagnosis.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
    energy: { w: 1, grade: "B" },
  },
  management:
    "Two abnormal results at least three months apart before calling it chronic. Pressure to target, an ACE inhibitor or ARB if the albumin is up, an SGLT2 inhibitor now that they work in non-diabetic kidney disease too, and no NSAIDs. Check eGFR and ACR every 6–12 months and adjust every drug dose that the kidney clears.",
};

const DEPRESSION: Hypothesis = {
  id: "depression",
  name: "Depression",
  mondoId: "MONDO:0002050",
  why: "Depressive disorders are among the top ten causes of years lived with disability worldwide and raise all-cause mortality about 1.5× (GBD 2021 Lancet; Cuijpers 2014 World Psychiatry).",
  summary:
    "Two questions catch most of it. It is also the thing that quietly explains the fatigue, the sleep and the abandoned protocol.",
  priors: {
    base: 0.07,
    source:
      "GBD 2021: point prevalence of major depressive disorder in adults is roughly 5–8 %, higher in women.",
    bands: PRIOR_BANDS.depression,
    modifiers: [
      {
        when: { sex: "female" },
        times: 1.7,
        why: "Women are diagnosed with depression roughly 1.7× as often as men (A).",
        grade: "A",
        source:
          "GBD 2021 Lancet: sex ratio of major depressive disorder prevalence.",
      },
      {
        when: {
          fact: "conditions",
          includes: "hypothyroid|diabet|cancer|chronic",
        },
        times: 1.8,
        why: "Depression is roughly twice as common alongside a chronic physical illness (B).",
        grade: "B",
        source:
          "Moussavi 2007 Lancet: depression comorbid with chronic disease in the World Health Surveys.",
      },
    ],
  },
  evidence: [
    {
      id: "dep_phq2_interest",
      input: { fact: "sym_phq2_interest" },
      when: { includes: "more than half|nearly every day" },
      lr: 5,
      lrNeg: 0.3,
      grade: "A",
      source:
        "Kroenke 2003 Med Care: PHQ-2 at a cut-off of 3 has sensitivity 83 % and specificity 92 %; each item carries about half of that.",
    },
    {
      id: "dep_phq2_down",
      input: { fact: "sym_phq2_down" },
      when: { includes: "more than half|nearly every day" },
      lr: 5,
      lrNeg: 0.3,
      grade: "A",
      source: "Kroenke 2003 Med Care: PHQ-2 item 2, same validation sample.",
    },
    {
      id: "dep_energy",
      input: { fact: "sym_energy" },
      when: { equals: "Yes" },
      lr: 1.6,
      lrNeg: 0.6,
      grade: "B",
      source:
        "Kroenke 2001 J Gen Intern Med: fatigue is one of the nine PHQ-9 criteria and is present in most episodes.",
    },
    {
      id: "dep_weight",
      input: { fact: "sym_weight" },
      when: { includes: "gained|lost" },
      lr: 1.5,
      grade: "B",
      source:
        "DSM-5 criterion A3: significant unintended weight change either way is one of the nine criteria.",
    },
  ],
  discriminators: [
    {
      test: "PHQ-9",
      codes: ["phq9_score"],
      cost: 1,
      lrPos: 7,
      lrNeg: 0.2,
      typicalPos: 14,
      typicalNeg: 3,
      unit: "points",
      howTo:
        "Nine questions, two minutes, free. A score of 10 or more has about 88 % sensitivity and specificity for major depression (Kroenke 2001).",
    },
    {
      test: "TSH",
      codes: ["tsh"],
      cost: 1,
      lrPos: 2,
      lrNeg: 0.9,
      typicalPos: 8,
      typicalNeg: 1.8,
      unit: "mIU/L",
      howTo:
        "Not a depression test: it is there to find the treatable thyroid case hiding inside the presentation.",
    },
  ],
  lenses: {
    mood: { w: 3, grade: "A" },
    energy: { w: 3, grade: "A" },
    lifespan: { w: 2, grade: "B" },
  },
  management:
    "A positive PHQ-2 means do the PHQ-9, not start a drug. Rule out the treatable mimics first: thyroid, B12, iron, sleep apnoea, alcohol. Then exercise and a talking therapy have the best evidence at mild-to-moderate severity, and medication is added by severity and preference. If there is any thought of self-harm, that is today's problem, not next month's.",
};

const ALCOHOL_USE_DISORDER: Hypothesis = {
  id: "alcohol_use_disorder",
  name: "Alcohol use disorder",
  mondoId: "MONDO:0007079",
  why: "Alcohol causes about 2.6 million deaths a year and there is no consumption level that lowers all-cause mortality (WHO 2024 global status report; GBD 2018 Lancet).",
  summary:
    "The most under-asked question in medicine. It moves the liver, the pressure, the sleep, the mood and the cancer risk all at once.",
  priors: {
    base: 0.06,
    source:
      "WHO 2024 global status report on alcohol: alcohol use disorders affect about 5–7 % of adults in the European region.",
    bands: PRIOR_BANDS.alcohol_use_disorder,
    modifiers: [
      {
        when: { sex: "male" },
        times: 2,
        why: "Alcohol use disorder is roughly twice as common in men (A).",
        grade: "A",
        source: "WHO 2024 global status report: prevalence by sex.",
      },
    ],
  },
  evidence: [
    {
      id: "aud_audit_c_frequent",
      input: { fact: "sym_alcohol" },
      when: { includes: "4 or more times a week" },
      lr: 4,
      grade: "B",
      source:
        "Bush 1998 Arch Intern Med: AUDIT-C at or above 4 in men has sensitivity 86 % and specificity 72 %; daily drinking is the item that carries most of the frequency signal.",
    },
    {
      id: "aud_audit_c_never",
      input: { fact: "sym_alcohol" },
      when: { equals: "Never" },
      // This IS the negative finding, so it carries no `lrNeg`: everybody who
      // is not a "Never" is covered by the frequency rules above and below.
      // It sat at lr 1 / lrNeg 1, which is a rule that does nothing.
      lr: 0.1,
      grade: "B",
      source:
        "Bush 1998 Arch Intern Med (AUDIT-C validation): a zero on item 1 scores the whole instrument zero, and an AUDIT-C of zero has a negative predictive value near 99 % for heavy drinking, so 0.1 is the order of the contrast.",
    },
    {
      id: "aud_ggt",
      input: { metric: "ggt" },
      when: { above: 60 },
      lr: 3,
      grade: "B",
      source:
        "Conigrave 2003 Addiction: GGT has about 50 % sensitivity and 80 % specificity for heavy drinking; it rises before anything else does.",
      confoundedBy: ["ggt"],
    },
    {
      id: "aud_mcv",
      input: { metric: "mcv" },
      when: { above: 96 },
      lr: 2.5,
      grade: "B",
      source:
        "Conigrave 2003 Addiction: a raised MCV is specific for sustained heavy drinking but takes months to appear and months to fall.",
    },
    {
      id: "aud_ast_alt_ratio",
      input: { metric: "ast" },
      when: { above: 45 },
      lr: 1.8,
      grade: "B",
      source:
        "Nyblom 2004 Alcohol Alcohol: an AST above the ALT is the classic alcohol pattern, opposite to the fatty-liver one.",
    },
  ],
  discriminators: [
    {
      test: "GGT",
      codes: ["ggt"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.6,
      typicalPos: 90,
      typicalNeg: 20,
      unit: "U/L",
      howTo:
        "Falls by half in about two to three weeks of abstinence, which makes it the cheapest way to check whether a change stuck.",
    },
    {
      test: "Full AUDIT questionnaire",
      codes: ["audit_score"],
      cost: 1,
      lrPos: 6,
      lrNeg: 0.2,
      typicalPos: 14,
      typicalNeg: 2,
      unit: "points",
      howTo:
        "Ten questions, free, and better than any blood test. Eight or more means dependence is likely.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
    mood: { w: 2, grade: "B" },
    energy: { w: 2, grade: "B" },
    weight: { w: 1, grade: "B" },
  },
  management:
    "Count the units honestly for two weeks before deciding anything. Under 10 units a week is where the risk curve is flattest. If the AUDIT is 8 or more, or GGT and MCV are both up, this is the condition to treat first because it is upstream of the liver, the pressure, the sleep and the mood. Do not stop abruptly from a heavy daily intake without medical cover.",
};

const COELIAC_DISEASE: Hypothesis = {
  id: "coeliac_disease",
  name: "Coeliac disease",
  mondoId: "MONDO:0005130",
  why: "About 1 % of adults have it, 70–80 % are undiagnosed, and untreated it causes iron deficiency, osteoporosis and a small lymphoma excess (Singh 2018 Clin Gastroenterol Hepatol).",
  summary:
    "One blood test finds it and one diet treats it completely. It hides behind iron deficiency and thyroid autoimmunity more often than behind bowel symptoms.",
  priors: {
    base: 0.01,
    source:
      "Singh 2018 Clin Gastroenterol Hepatol: pooled global seroprevalence 1.4 %, biopsy-confirmed 0.7 %.",
    bands: PRIOR_BANDS.coeliac_disease,
    modifiers: [
      {
        when: { fact: "family_history", includes: "coeliac|celiac" },
        times: 10,
        why: "A first-degree relative carries about a 1-in-10 risk (A).",
        grade: "A",
        source:
          "Singh 2015 Am J Gastroenterol: 7.5 % prevalence in first-degree relatives.",
      },
      {
        when: {
          fact: "conditions",
          includes: "hashimoto|thyroiditis|type 1 diabetes|vitiligo",
        },
        times: 4,
        why: "Coeliac disease clusters with the other organ-specific autoimmune diseases (A).",
        grade: "A",
        source:
          "Rubio-Tapia 2013 Am J Gastroenterol (ACG guideline): 3–6 % prevalence in type 1 diabetes and autoimmune thyroid disease.",
      },
    ],
  },
  evidence: [
    {
      id: "coeliac_ttg",
      input: { metric: "ttg_iga" },
      when: { above: 10 },
      lr: 30,
      lrNeg: 0.05,
      grade: "A",
      source:
        "Rubio-Tapia 2013 ACG guideline: tTG-IgA has sensitivity and specificity above 95 % when total IgA is normal.",
    },
    {
      id: "coeliac_bowel",
      input: { fact: "sym_bowel" },
      when: { equals: "Diarrhoea and bloating" },
      lr: 2.5,
      lrNeg: 0.8,
      grade: "B",
      source:
        "Rubio-Tapia 2013 ACG guideline: classic diarrhoeal presentation is now the minority, which is why a no barely lowers the odds.",
    },
    {
      id: "coeliac_iron",
      input: { hypothesis: "iron_deficiency" },
      when: { above: 0.6 },
      lr: 3,
      grade: "A",
      source:
        "Rubio-Tapia 2013 ACG guideline: unexplained iron deficiency is a formal testing indication; 3–5 % of it is coeliac.",
    },
    {
      id: "coeliac_weight_lost",
      input: { fact: "sym_weight" },
      when: { equals: "Lost" },
      lr: 2,
      grade: "C",
      source:
        "Grade C for the size: unintended weight loss is a classic malabsorption sign in the guideline text, but no likelihood ratio is published for it in an unselected adult population.",
    },
  ],
  discriminators: [
    {
      test: "tTG-IgA with total IgA",
      codes: ["ttg_iga"],
      cost: 1,
      lrPos: 30,
      lrNeg: 0.05,
      typicalPos: 60,
      typicalNeg: 2,
      unit: "U/mL",
      howTo:
        "Only valid while you are still eating gluten. Order total IgA with it: 2 % of coeliacs are IgA-deficient and read as falsely negative.",
    },
    {
      test: "HLA-DQ2/DQ8 typing",
      codes: ["hla_dq2_dq8"],
      cost: 2,
      lrPos: 1.5,
      lrNeg: 0.02,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "A rule-out test, not a rule-in one: 30 % of everybody is positive, but a negative essentially excludes coeliac disease for life.",
    },
  ],
  lenses: {
    energy: { w: 2, grade: "A" },
    lifespan: { w: 1, grade: "B" },
    weight: { w: 1, grade: "B" },
  },
  confirmAtLrPos: 20,
  management:
    "Test before removing gluten, never after: the antibodies normalise in weeks and the diagnosis becomes impossible. A positive tTG-IgA goes to gastroenterology for a biopsy in adults. Once confirmed, the diet is lifelong and total, and it needs iron, B12, folate, vitamin D and a bone-density baseline alongside it.",
};

const ATROPHIC_GASTRITIS: Hypothesis = {
  id: "atrophic_gastritis",
  name: "Atrophic gastritis",
  mondoId: "MONDO:0006665",
  parentId: "b12_deficiency",
  why: "It is the mechanism behind pernicious anaemia and a precursor lesion for gastric cancer, which is still a top-five cancer killer worldwide (GBD 2021 Lancet).",
  summary:
    "The stomach lining stops making acid and intrinsic factor. B12 falls first, iron follows, and the same lining is where gastric cancer starts.",
  priors: {
    base: 0.02,
    source:
      "Lahner 2009 World J Gastroenterol: corpus atrophic gastritis in about 2 % of adults, rising steeply with age.",
    bands: PRIOR_BANDS.atrophic_gastritis,
    modifiers: [
      {
        when: { minAge: 60 },
        times: 3,
        why: "Prevalence rises steeply after 60 (A).",
        grade: "A",
        source:
          "Weck 2008 Cancer Epidemiol Biomarkers Prev: atrophic gastritis prevalence by age in 9 000 adults.",
      },
      {
        when: {
          fact: "conditions",
          includes: "hashimoto|thyroiditis|vitiligo|type 1 diabetes",
        },
        times: 3,
        why: "Autoimmune atrophic gastritis clusters with the other organ-specific autoimmune diseases (B).",
        grade: "B",
        source:
          "Lahner 2009 World J Gastroenterol: autoimmune gastritis and thyroid autoimmunity overlap.",
      },
    ],
  },
  evidence: [
    {
      id: "ag_parietal_ab",
      input: { metric: "parietal_cell_antibodies" },
      when: { above: 0.5 },
      lr: 5,
      lrNeg: 0.4,
      grade: "B",
      source:
        "Lahner 2009 World J Gastroenterol: parietal-cell antibodies are sensitive but not specific; 1 = positive.",
    },
    {
      id: "ag_intrinsic_factor_ab",
      input: { metric: "intrinsic_factor_antibodies" },
      when: { above: 0.5 },
      lr: 15,
      grade: "A",
      source:
        "Lahner 2009: intrinsic-factor antibodies are about 50 % sensitive but over 98 % specific for pernicious anaemia.",
    },
    {
      id: "ag_gastrin",
      input: { metric: "gastrin" },
      when: { above: 100 },
      lr: 6,
      lrNeg: 0.3,
      grade: "B",
      source:
        "Zagari 2017 Aliment Pharmacol Ther: gastrin-17 with pepsinogen is the validated serological biopsy for corpus atrophy.",
    },
    {
      id: "ag_pepsinogen",
      input: { metric: "pepsinogen_i" },
      when: { below: 30 },
      lr: 8,
      grade: "B",
      source:
        "Zagari 2017 Aliment Pharmacol Ther: pepsinogen I under 30 µg/L marks corpus atrophy with about 70 % sensitivity, 90 % specificity.",
    },
    {
      id: "ag_b12",
      input: { hypothesis: "b12_deficiency" },
      when: { above: 0.6 },
      lr: 4,
      grade: "B",
      source:
        "Stabler 2013 NEJM: pernicious anaemia is the classic non-dietary cause of a low B12.",
    },
    {
      id: "ag_h_pylori",
      input: { metric: "h_pylori_stool_antigen" },
      when: { above: 0.5 },
      lr: 3,
      grade: "A",
      source:
        "Malfertheiner 2022 Gut (Maastricht VI): H. pylori is the commonest cause of atrophic gastritis worldwide.",
    },
  ],
  discriminators: [
    {
      test: "Pepsinogen I and II with gastrin-17",
      codes: ["pepsinogen_i", "gastrin"],
      cost: 2,
      lrPos: 8,
      lrNeg: 0.3,
      typicalPos: 20,
      typicalNeg: 80,
      unit: "µg/L",
      howTo:
        "The serological biopsy: it says which part of the stomach is atrophic without an endoscope.",
    },
    {
      test: "Intrinsic factor antibodies",
      codes: ["intrinsic_factor_antibodies"],
      cost: 2,
      lrPos: 15,
      lrNeg: 0.6,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "Half of pernicious anaemia is negative, but a positive is close to diagnostic.",
    },
    {
      test: "H. pylori stool antigen",
      codes: ["h_pylori_stool_antigen"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.7,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "Off proton-pump inhibitors for two weeks, or it reads falsely negative.",
    },
  ],
  lenses: {
    lifespan: { w: 2, grade: "B" },
    energy: { w: 2, grade: "B" },
  },
  confirmAtLrPos: 10,
  management:
    "Treat H. pylori if it is there. Replace B12 by injection if intrinsic factor is the problem, because oral absorption is the thing that failed. Iron and vitamin D need watching too. Corpus atrophy with intestinal metaplasia gets an endoscopic surveillance interval, because this is the lesion gastric cancer grows out of.",
};

const FOLATE_DEFICIENCY: Hypothesis = {
  id: "folate_deficiency",
  name: "Folate deficiency",
  mondoId: "MONDO:0001860",
  why: "It is the second cause of megaloblastic anaemia after B12, and it is cheap to find and cheaper to fix (WHO 2015 serum and red-cell folate concentrations guideline).",
  summary:
    "Looks exactly like B12 deficiency in the blood count, and treating the wrong one of the pair can make the nerve damage worse.",
  priors: {
    base: 0.04,
    source:
      "WHO 2015 guidance: serum folate deficiency runs a few per cent in fortified populations and higher where flour is not fortified (grade C for the number in Europe).",
    bands: PRIOR_BANDS.folate_deficiency,
    modifiers: [
      {
        when: {
          fact: "medications",
          includes: "methotrexate|phenytoin|sulfasalazine|trimethoprim",
        },
        times: 3,
        why: "Several common drugs are folate antagonists (A).",
        grade: "A",
        source:
          "British National Formulary: folate antagonism of methotrexate, phenytoin, sulfasalazine and trimethoprim.",
      },
      {
        when: { hypothesis: "alcohol_use_disorder", above: 0.5 },
        times: 3,
        why: "Alcohol blocks folate absorption and the diet that goes with it is usually poor (B).",
        grade: "B",
        source: "Halsted 2002 J Nutr: ethanol and folate absorption.",
      },
    ],
  },
  evidence: [
    {
      id: "folate_low",
      input: { metric: "folic_acid" },
      when: { below: 4 },
      lr: 15,
      lrNeg: 0.15,
      grade: "A",
      source:
        "WHO 2015: serum folate under 4 ng/mL (10 nmol/L) is deficiency; above 6 makes it unlikely.",
    },
    {
      id: "folate_mcv",
      input: { metric: "mcv" },
      when: { above: 100 },
      lr: 3,
      grade: "A",
      source:
        "Green 2017 Nat Rev Dis Primers: macrocytosis is the shared blood sign of B12 and folate deficiency.",
    },
    {
      id: "folate_homocysteine",
      input: { metric: "homocysteine" },
      when: { above: 12 },
      lr: 2.5,
      grade: "B",
      source:
        "Green 2017 Nat Rev Dis Primers: homocysteine rises in both deficiencies; only methylmalonic acid separates them.",
    },
  ],
  discriminators: [
    {
      test: "Serum folate",
      codes: ["folic_acid"],
      cost: 1,
      lrPos: 15,
      lrNeg: 0.15,
      typicalPos: 2.5,
      typicalNeg: 9,
      unit: "ng/mL",
      repeatable: true,
      howTo:
        "Fasting, and before any supplement: one folic-acid tablet normalises the serum level within a day.",
    },
    {
      test: "Red cell folate",
      codes: ["red_cell_folate"],
      cost: 2,
      lrPos: 10,
      lrNeg: 0.2,
      typicalPos: 120,
      typicalNeg: 400,
      unit: "ng/mL",
      howTo:
        "Reflects the last three months rather than last night's dinner, which is what you want when the serum is borderline.",
    },
  ],
  lenses: {
    energy: { w: 2, grade: "B" },
    mood: { w: 1, grade: "C" },
  },
  management:
    "Check B12 before treating, always. Folate given into an untreated B12 deficiency fixes the blood count and lets the nerve damage carry on. Then 400–1000 µg folic acid daily for four months, and find the cause: diet, alcohol, coeliac disease, or a drug.",
};

const VITAMIN_D_DEFICIENCY: Hypothesis = {
  id: "vitamin_d_deficiency",
  name: "Vitamin D deficiency",
  mondoId: "MONDO:0100471",
  why: "Roughly 13 % of Europeans are below 30 nmol/L and 40 % below 50, with a clear winter and latitude gradient (Cashman 2016 Am J Clin Nutr).",
  summary:
    "Cheap to fix, and worth fixing for bone and muscle. Supplementing people who are already replete has not changed mortality in any large trial.",
  priors: {
    base: 0.2,
    source:
      "Cashman 2016 Am J Clin Nutr: 13 % of Europeans under 30 nmol/L year-round, about 40 % under 50 nmol/L.",
    bands: PRIOR_BANDS.vitamin_d_deficiency,
    modifiers: [
      {
        when: {
          fact: "ancestry",
          includes: "south asian|african|middle eastern",
        },
        times: 2,
        why: "More melanin needs more sun for the same synthesis, and the deficit is largest at high latitude (A).",
        grade: "A",
        source:
          "Cashman 2016 Am J Clin Nutr: deficiency by ethnicity within European cohorts.",
      },
      {
        when: { fact: "supplements", includes: "vitamin d|cholecalciferol|d3" },
        times: 0.3,
        why: "Someone already taking D3 is unlikely to be deficient (A).",
        grade: "A",
        source:
          "Holick 2011 J Clin Endocrinol Metab (Endocrine Society guideline): dose-response of 25-OH D to supplementation.",
      },
    ],
  },
  evidence: [
    {
      id: "vitd_low",
      input: { metric: "vitamin_d" },
      when: { below: 20 },
      lr: 25,
      lrNeg: 0.1,
      grade: "A",
      source:
        "Holick 2011 Endocrine Society guideline: 25-OH D under 20 ng/mL (50 nmol/L) is deficiency by definition.",
      confoundedBy: ["vitamin_d"],
    },
    {
      id: "vitd_insufficient",
      input: { metric: "vitamin_d" },
      when: { above: 19, below: 30 },
      lr: 2,
      grade: "A",
      source:
        "Holick 2011: 20–30 ng/mL is insufficiency, where the parathyroid hormone curve has not yet flattened.",
    },
    {
      id: "vitd_country_north",
      input: { fact: "country" },
      when: { includes: "fi|se|no|dk|ee|lv|lt|ie|gb|is" },
      lr: 1.6,
      grade: "B",
      source:
        "Cashman 2016 Am J Clin Nutr: deficiency runs highest at the northern latitudes where winter synthesis stops entirely.",
    },
  ],
  discriminators: [
    {
      test: "25-OH vitamin D",
      codes: ["vitamin_d"],
      cost: 1,
      lrPos: 25,
      lrNeg: 0.1,
      typicalPos: 12,
      typicalNeg: 42,
      unit: "ng/mL",
      repeatable: true,
      howTo:
        "Any time of day, no fast. Measure at the end of winter if you want the worst honest number.",
    },
  ],
  lenses: {
    lifespan: { w: 1, grade: "B" },
    energy: { w: 1, grade: "C" },
  },
  confirmAtLrPos: 20,
  management:
    "Below 20 ng/mL: 2000 IU a day, or a loading course, and retest at three months. Between 20 and 30: 1000–2000 IU through the winter. Above 40 there is nothing to chase; VITAL (2019 NEJM) found no mortality or cancer benefit from supplementing replete people, so this is a deficiency correction and not an optimisation.",
};

const HYPOTHYROIDISM: Hypothesis = {
  id: "hypothyroidism",
  name: "Hypothyroidism",
  mondoId: "MONDO:0005420",
  why: "Overt hypothyroidism affects 1–2 % of adults and subclinical hypothyroidism 4–10 %, and subclinical disease raises coronary events (Hollowell 2002 J Clin Endocrinol Metab; Rodondi 2010 JAMA).",
  summary:
    "The gland is failing, whatever is causing it. TSH rises years before free T4 falls, and the symptoms are all things that could be a dozen other conditions.",
  priors: {
    base: 0.05,
    source:
      "Hollowell 2002 J Clin Endocrinol Metab (NHANES III): 4.6 % of the US population, 0.3 % overt and 4.3 % subclinical.",
    bands: PRIOR_BANDS.hypothyroidism,
    modifiers: [
      {
        when: { sex: "female" },
        times: 4,
        why: "Hypothyroidism is four to five times commoner in women (A).",
        grade: "A",
        source:
          "Hollowell 2002 J Clin Endocrinol Metab: prevalence by sex in NHANES III.",
      },
      {
        when: { minAge: 60 },
        times: 2,
        why: "Prevalence roughly doubles after 60 (A).",
        grade: "A",
        source: "Hollowell 2002: prevalence by age band in NHANES III.",
      },
      {
        when: { fact: "family_history", includes: "thyroid" },
        times: 3,
        why: "Thyroid disease in a first-degree relative triples the risk (B).",
        grade: "B",
        source:
          "Vanderpump 1995 Clin Endocrinol (Whickham 20-year follow-up): family history and incident hypothyroidism.",
      },
    ],
  },
  evidence: [
    {
      id: "hypo_tsh_high",
      input: { metric: "tsh" },
      when: { above: 4.5 },
      lr: 20,
      lrNeg: 0.1,
      grade: "A",
      source:
        "Garber 2012 Thyroid (AACE/ATA guideline): a TSH above the reference limit with a normal free T4 is subclinical hypothyroidism.",
    },
    {
      id: "hypo_tsh_upper_normal",
      input: { metric: "tsh" },
      when: { above: 2.5, below: 4.51 },
      lr: 2,
      grade: "B",
      source:
        "Vanderpump 1995 Clin Endocrinol: a TSH above 2 predicts future overt hypothyroidism in the Whickham cohort.",
    },
    {
      id: "hypo_ft4_low",
      input: { metric: "free_t4" },
      when: { below: 0.8 },
      lr: 15,
      grade: "A",
      source:
        "Garber 2012 Thyroid: a low free T4 with a high TSH is overt hypothyroidism.",
    },
    {
      id: "hypo_cold",
      input: { fact: "sym_cold" },
      when: { equals: "Yes" },
      lr: 2,
      lrNeg: 0.8,
      grade: "B",
      source:
        "Zulewski 1997 J Clin Endocrinol Metab: cold intolerance is one of the twelve signs in the validated clinical score.",
    },
    {
      id: "hypo_hair_skin",
      input: { fact: "sym_hair_skin" },
      when: { equals: "Yes" },
      lr: 2.3,
      lrNeg: 0.8,
      grade: "B",
      source:
        "Zulewski 1997: dry skin and coarse hair carry the largest weights in the twelve-sign score.",
    },
    {
      id: "hypo_constipation",
      input: { fact: "sym_bowel" },
      when: { equals: "Constipation" },
      lr: 1.8,
      grade: "B",
      source: "Zulewski 1997: constipation is one of the twelve signs.",
    },
    {
      id: "hypo_weight_gained",
      input: { fact: "sym_weight" },
      when: { equals: "Gained" },
      lr: 1.7,
      grade: "B",
      source:
        "Zulewski 1997: weight gain is one of the twelve signs, though the average gain at diagnosis is only a few kilograms.",
    },
    {
      id: "hypo_energy",
      input: { fact: "sym_energy" },
      when: { equals: "Yes" },
      lr: 1.4,
      lrNeg: 0.7,
      grade: "C",
      source:
        "Grade C for the size: tiredness is in the clinical score (Zulewski 1997) but is so common in every other condition here that it is deliberately kept weak. No screening-population LR exists.",
    },
  ],
  discriminators: [
    {
      test: "TSH",
      codes: ["tsh"],
      cost: 1,
      lrPos: 20,
      lrNeg: 0.1,
      typicalPos: 7.5,
      typicalNeg: 1.6,
      unit: "mIU/L",
      repeatable: true,
      howTo:
        "Morning, before any levothyroxine dose. It swings about 40 % across the day, so compare like with like.",
    },
    {
      test: "Free T4",
      codes: ["free_t4"],
      cost: 1,
      lrPos: 15,
      lrNeg: 0.4,
      typicalPos: 0.6,
      typicalNeg: 1.2,
      unit: "ng/dL",
      howTo:
        "It is what separates subclinical from overt, and it decides whether treatment is a discussion or a requirement.",
    },
  ],
  lenses: {
    energy: { w: 3, grade: "A" },
    mood: { w: 2, grade: "B" },
    lifespan: { w: 1, grade: "B" },
    weight: { w: 1, grade: "B" },
  },
  confirmAtLrPos: 15,
  management:
    "Two raised TSH results three months apart before treating anything subclinical. Check anti-TPO: positive antibodies mean it will progress, which changes the answer. Treat at TSH above 10, or earlier if symptomatic, antibody-positive with a rising TSH, or pregnant. Levothyroxine on an empty stomach, 30–60 minutes before coffee, four hours away from iron and calcium. Retest six weeks after any dose change.",
};

const HYPERTHYROIDISM: Hypothesis = {
  id: "hyperthyroidism",
  name: "Hyperthyroidism",
  mondoId: "MONDO:0004425",
  why: "It affects 0.5–1 % of adults, causes atrial fibrillation and bone loss, and is entirely treatable once found (Ross 2016 Thyroid, ATA guideline).",
  summary:
    "The opposite failure. A suppressed TSH with a fast pulse, a tremor and weight coming off is one of the few endocrine emergencies you can spot from an interview.",
  priors: {
    base: 0.008,
    source:
      "Hollowell 2002 J Clin Endocrinol Metab (NHANES III): 0.5 % hyperthyroid, most of it subclinical.",
    bands: PRIOR_BANDS.hyperthyroidism,
    modifiers: [
      {
        when: { sex: "female" },
        times: 3,
        why: "Graves' disease is about three times commoner in women (A).",
        grade: "A",
        source: "Hollowell 2002: prevalence by sex in NHANES III.",
      },
      {
        when: { fact: "supplements", includes: "iodine|kelp" },
        times: 2,
        why: "Iodine excess can tip a nodular thyroid into overactivity (B).",
        grade: "B",
        source:
          "Leung 2014 Nat Rev Endocrinol: iodine-induced hyperthyroidism.",
      },
    ],
  },
  evidence: [
    {
      id: "hyper_tsh_low",
      input: { metric: "tsh" },
      when: { below: 0.4 },
      lr: 25,
      lrNeg: 0.05,
      grade: "A",
      source:
        "Ross 2016 Thyroid (ATA guideline): a suppressed TSH is the entry point; a normal TSH essentially excludes it.",
    },
    {
      id: "hyper_ft4_high",
      input: { metric: "free_t4" },
      when: { above: 1.8 },
      lr: 15,
      grade: "A",
      source:
        "Ross 2016 Thyroid: a raised free T4 with a suppressed TSH is overt hyperthyroidism.",
    },
    {
      id: "hyper_ft3_high",
      input: { metric: "free_t3" },
      when: { above: 4.2 },
      lr: 8,
      grade: "A",
      source:
        "Ross 2016 Thyroid: T3 toxicosis is the variant where free T4 is still normal.",
    },
    {
      id: "hyper_weight_lost",
      input: { fact: "sym_weight" },
      when: { equals: "Lost" },
      lr: 3,
      grade: "B",
      source:
        "Ross 2016 Thyroid: weight loss despite a normal or increased appetite is the classic presenting symptom.",
    },
    {
      id: "hyper_resting_hr",
      input: { fact: "resting_hr" },
      when: { above: 90 },
      lr: 2.5,
      grade: "B",
      source:
        "Zulewski 1997 J Clin Endocrinol Metab: pulse rate is the most objective single item in the thyroid clinical scores.",
    },
  ],
  discriminators: [
    {
      test: "TSH receptor antibodies (TRAb)",
      codes: ["trab"],
      cost: 2,
      lrPos: 20,
      lrNeg: 0.2,
      typicalPos: 8,
      typicalNeg: 0.5,
      unit: "IU/L",
      howTo:
        "Separates Graves' disease from thyroiditis and from a toxic nodule, which is the decision that changes the treatment.",
    },
    {
      test: "Free T4 with free T3",
      codes: ["free_t4", "free_t3"],
      cost: 1,
      lrPos: 15,
      lrNeg: 0.3,
      typicalPos: 2.4,
      typicalNeg: 1.2,
      unit: "ng/dL",
    },
  ],
  lenses: {
    lifespan: { w: 2, grade: "A" },
    energy: { w: 2, grade: "B" },
    mood: { w: 2, grade: "B" },
    weight: { w: 2, grade: "A" },
  },
  confirmAtLrPos: 15,
  management:
    "A suppressed TSH gets free T4 and free T3 the same week, then TRAb. Overt hyperthyroidism is treated: thionamides first in most of Europe, then radioiodine or surgery. Subclinical disease with a TSH under 0.1 is still treated over 65 or with atrial fibrillation or osteoporosis, because those are the two things it causes.",
};

const PERIMENOPAUSE: Hypothesis = {
  id: "perimenopause",
  name: "Perimenopause",
  why: "Every woman passes through it, the symptoms last on average seven years, and it is the point where bone loss and cardiovascular risk accelerate (Avis 2015 JAMA Intern Med; Harlow 2012 STRAW+10).",
  summary:
    "Not a disease, a transition. Naming it correctly stops the fatigue, the sleep and the mood being investigated as five separate problems.",
  appliesTo: { sex: "female", minAge: 38, maxAge: 58 },
  priors: {
    base: 0.35,
    source:
      "Harlow 2012 STRAW+10: the transition typically runs from the early forties to about 51, the median age at final period.",
    bands: PRIOR_BANDS.perimenopause,
    modifiers: [
      {
        when: { minAge: 45, maxAge: 53 },
        times: 1.8,
        why: "The transition is at its most likely between 45 and 53 (A).",
        grade: "A",
        source:
          "Harlow 2012 STRAW+10: staging by age around the final menstrual period.",
      },
      {
        when: { fact: "smoking", includes: "current" },
        times: 1.3,
        why: "Smokers reach menopause one to two years earlier (A).",
        grade: "A",
        source:
          "Zhu 2018 Hum Reprod: pooled analysis of smoking and age at natural menopause.",
      },
    ],
  },
  evidence: [
    {
      id: "peri_cycle_irregular",
      input: { fact: "sym_cycle" },
      when: { includes: "irregular|absent" },
      lr: 5,
      lrNeg: 0.3,
      grade: "A",
      source:
        "Harlow 2012 STRAW+10: persistent cycle-length variability of seven days or more is the defining criterion of the early transition.",
    },
    {
      id: "peri_fsh",
      input: { metric: "fsh" },
      when: { above: 25 },
      lr: 4,
      grade: "B",
      source:
        "Harlow 2012 STRAW+10: FSH above 25 IU/L supports late transition, but it swings cycle to cycle, so it never decides on its own.",
      confoundedBy: ["fsh"],
    },
    {
      id: "peri_estradiol_low",
      input: { metric: "estradiol" },
      when: { below: 30 },
      lr: 2.5,
      grade: "B",
      source:
        "Harlow 2012 STRAW+10: estradiol falls late and erratically; a single low value is supportive, not diagnostic.",
      confoundedBy: ["estradiol"],
    },
    {
      id: "peri_sleep",
      input: { fact: "sym_energy" },
      when: { equals: "Yes" },
      lr: 1.4,
      lrNeg: 0.8,
      grade: "C",
      source:
        "Grade C for the size: fatigue and poor sleep are among the commonest reported transition symptoms (Avis 2015 JAMA Intern Med), but that is a symptom-frequency study, not a likelihood ratio.",
    },
    {
      id: "peri_menopause_status",
      input: { fact: "menopause_status" },
      when: { includes: "peri" },
      lr: 8,
      grade: "B",
      source:
        "Grade B: a woman's own staging agrees with STRAW+10 criteria in most series (Harlow 2012), which is as close to a gold standard as an interview gets.",
    },
  ],
  discriminators: [
    {
      test: "FSH with estradiol, day 2–5",
      codes: ["fsh", "estradiol"],
      cost: 1,
      lrPos: 4,
      lrNeg: 0.5,
      typicalPos: 40,
      typicalNeg: 6,
      unit: "IU/L",
      repeatable: true,
      howTo:
        "Early follicular phase, and repeat it: one value in the transition means very little because the cycle is what is unstable.",
    },
    {
      test: "TSH",
      codes: ["tsh"],
      cost: 1,
      lrPos: 1.2,
      lrNeg: 0.9,
      typicalPos: 6,
      typicalNeg: 1.8,
      unit: "mIU/L",
      howTo:
        "There to exclude the thyroid, which produces the same list of symptoms and is treated completely differently.",
    },
  ],
  lenses: {
    energy: { w: 2, grade: "B" },
    mood: { w: 2, grade: "B" },
    lifespan: { w: 1, grade: "B" },
    weight: { w: 1, grade: "B" },
  },
  management:
    "The diagnosis is the cycle history, not the blood test. Exclude thyroid disease, iron deficiency and depression, because all three imitate it. Then: resistance training and protein for the bone and muscle loss that accelerates here, and a conversation about hormone therapy, which is the most effective treatment for vasomotor symptoms and is safest started within ten years of the final period.",
};

const MALE_HYPOGONADISM: Hypothesis = {
  id: "male_hypogonadism",
  name: "Male hypogonadism",
  mondoId: "MONDO:0002146",
  why: "Symptomatic testosterone deficiency affects about 2 % of middle-aged men; testing is over-ordered and the diagnosis is under-made (Wu 2010 NEJM, EMAS).",
  summary:
    "Two morning measurements and three specific symptoms. Everything else in the presentation is explained better by weight, sleep or mood.",
  appliesTo: { sex: "male", minAge: 30 },
  priors: {
    base: 0.02,
    source:
      "Wu 2010 NEJM (European Male Ageing Study): 2.1 % of men aged 40–79 have symptomatic late-onset hypogonadism.",
    bands: PRIOR_BANDS.male_hypogonadism,
    modifiers: [
      {
        when: { minAge: 60 },
        times: 2.5,
        why: "Prevalence rises steeply after 60 (A).",
        grade: "A",
        source: "Wu 2010 NEJM: prevalence by age band in EMAS.",
      },
      {
        when: { hypothesis: "insulin_resistance", above: 0.6 },
        times: 2,
        why: "Obesity and insulin resistance lower total testosterone, mostly through SHBG (A).",
        grade: "A",
        source:
          "Grossmann 2011 J Clin Endocrinol Metab: obesity, insulin resistance and testosterone.",
      },
    ],
  },
  evidence: [
    {
      id: "hypogonad_testosterone_low",
      input: { metric: "testosterone_total" },
      when: { below: 264 },
      lr: 10,
      lrNeg: 0.15,
      grade: "A",
      source:
        "Bhasin 2018 J Clin Endocrinol Metab (Endocrine Society guideline): 264 ng/dL is the harmonised lower limit on a morning fasted sample.",
      confoundedBy: ["testosterone"],
    },
    {
      id: "hypogonad_testosterone_borderline",
      input: { metric: "testosterone_total" },
      when: { above: 263, below: 350 },
      lr: 2,
      grade: "B",
      source:
        "Bhasin 2018: the 264–350 ng/dL grey zone is where free testosterone and SHBG decide.",
    },
    {
      id: "hypogonad_lh_high",
      input: { metric: "lh" },
      when: { above: 9.4 },
      lr: 3,
      grade: "A",
      source:
        "Bhasin 2018: a high LH with a low testosterone localises the problem to the testis rather than the pituitary.",
    },
    {
      id: "hypogonad_shbg_low",
      input: { metric: "shbg" },
      when: { below: 20 },
      lr: 0.6,
      grade: "B",
      source:
        "Grossmann 2011: a low SHBG lowers total testosterone without lowering the free fraction, so it argues against true deficiency.",
    },
    {
      id: "hypogonad_energy",
      input: { fact: "sym_energy" },
      when: { equals: "Yes" },
      lr: 1.3,
      lrNeg: 0.8,
      grade: "C",
      source:
        "Grade C for the size: EMAS found only three sexual symptoms genuinely tracked testosterone; fatigue did not, so it is kept close to neutral (Wu 2010 NEJM).",
    },
  ],
  discriminators: [
    {
      test: "Morning testosterone, repeated",
      codes: ["testosterone_total"],
      cost: 1,
      lrPos: 10,
      lrNeg: 0.15,
      typicalPos: 210,
      typicalNeg: 520,
      unit: "ng/dL",
      repeatable: true,
      howTo:
        "Before 10 am, fasted, twice on separate days. A single afternoon sample is the commonest reason this gets diagnosed wrongly.",
    },
    {
      test: "LH with SHBG",
      codes: ["lh", "shbg"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.6,
      typicalPos: 14,
      typicalNeg: 4,
      unit: "IU/L",
      howTo:
        "Says whether the testis or the pituitary is the problem, and whether a low total testosterone is really a low free one.",
    },
  ],
  lenses: {
    energy: { w: 2, grade: "B" },
    mood: { w: 1, grade: "B" },
    lifespan: { w: 1, grade: "C" },
  },
  confirmAtLrPos: 10,
  management:
    "Two morning fasted measurements before anything else, plus LH and SHBG. Treat the reversible causes first: weight, sleep apnoea, opioids, alcohol. TRAVERSE (2023 NEJM) showed replacement is cardiovascularly safe in genuinely hypogonadal men, and showed no mortality benefit, so this is symptom treatment and not longevity medicine.",
};

const GOUT_HYPERURICAEMIA: Hypothesis = {
  id: "gout_hyperuricaemia",
  name: "Gout and high uric acid",
  mondoId: "MONDO:0005393",
  why: "Gout affects 1–4 % of adults, is the commonest inflammatory arthritis, and is one of very few conditions that can be cured outright (Dehlin 2020 Nat Rev Rheumatol).",
  summary:
    "Crystals form when urate stays above its solubility limit. One attack means the store is already there; treating the number dissolves it.",
  priors: {
    base: 0.03,
    source:
      "Dehlin 2020 Nat Rev Rheumatol: gout prevalence 1–4 % of adults in most European populations.",
    bands: PRIOR_BANDS.gout_hyperuricaemia,
    modifiers: [
      {
        when: { sex: "male" },
        times: 3,
        why: "Gout is three to four times commoner in men, because oestrogen is uricosuric (A).",
        grade: "A",
        source: "Dehlin 2020 Nat Rev Rheumatol: prevalence by sex.",
      },
      {
        when: {
          fact: "medications",
          includes:
            "thiazide|hydrochlorothiazide|indapamide|furosemide|aspirin",
        },
        times: 2,
        why: "Diuretics and low-dose aspirin raise urate (A).",
        grade: "A",
        source: "Choi 2012 BMJ: diuretic use and incident gout.",
      },
    ],
  },
  evidence: [
    {
      id: "gout_urate_high",
      input: { metric: "uric_acid" },
      when: { above: 7, sex: "male" },
      lr: 4,
      lrNeg: 0.3,
      grade: "A",
      source:
        "Campion 1987 Am J Med (Normative Aging Study): incidence rises steeply above 7 mg/dL, which is roughly the solubility limit of urate at body temperature. The saturation-referenced definition of hyperuricaemia (Bardin 2014 Curr Opin Rheumatol; ACR usage) is 7 mg/dL in men and 6 in women.",
    },
    {
      id: "gout_urate_high_female",
      input: { metric: "uric_acid" },
      when: { above: 6, sex: "female" },
      lr: 4,
      lrNeg: 0.3,
      grade: "A",
      source:
        "The saturation-referenced definition of hyperuricaemia (Bardin 2014 Curr Opin Rheumatol; ACR usage): 7 mg/dL in men and 6 mg/dL in women, because oestrogen is uricosuric and the female reference range sits a whole milligram lower.",
    },
    {
      id: "gout_urate_very_high",
      input: { metric: "uric_acid" },
      when: { above: 9 },
      lr: 10,
      grade: "A",
      source:
        "Campion 1987 Am J Med: annual incidence about 5 % above 9 mg/dL against 0.1 % under 7.",
    },
    {
      id: "gout_podagra",
      input: { fact: "sym_joint" },
      when: { equals: "Yes" },
      lr: 8,
      lrNeg: 0.4,
      grade: "A",
      source:
        "Janssens 2010 Arch Intern Med: in the validated clinical rule, a first-MTP attack is the single strongest item; podagra plus hyperuricaemia gives a post-test probability above 80 %.",
    },
    {
      id: "gout_alcohol",
      input: { fact: "sym_alcohol" },
      when: { includes: "2 to 3 times a week|4 or more times a week" },
      lr: 1.8,
      grade: "A",
      source:
        "Choi 2004 Lancet: beer and spirits raise gout risk with a clear dose-response in the Health Professionals cohort.",
    },
  ],
  discriminators: [
    {
      test: "Uric acid",
      codes: ["uric_acid"],
      cost: 1,
      lrPos: 4,
      lrNeg: 0.3,
      typicalPos: 8.6,
      typicalNeg: 4.8,
      unit: "mg/dL",
      repeatable: true,
      howTo:
        "Not during an attack: urate often reads normal in the middle of one. Wait two weeks.",
    },
    {
      test: "Joint fluid aspiration for crystals",
      codes: ["synovial_urate_crystals"],
      cost: 4,
      lrPos: 40,
      lrNeg: 0.1,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "The actual gold standard. Only worth it when the diagnosis is genuinely unclear, because it means a needle in a hot joint.",
    },
  ],
  lenses: {
    energy: { w: 1, grade: "B" },
    lifespan: { w: 1, grade: "B" },
  },
  confirmAtLrPos: 20,
  management:
    "One classic attack plus a urate above 7 is enough to act on in practice. Treat the attack with an NSAID, colchicine or a steroid, and never stop or start urate-lowering treatment mid-attack. Then allopurinol titrated to a urate under 6 mg/dL, lifelong, which dissolves the deposits. Check the pressure, the kidneys and the metabolic panel too, because gout travels with all three.",
};

const OSTEOPOROSIS_RISK: Hypothesis = {
  id: "osteoporosis_risk",
  name: "Osteoporosis risk",
  mondoId: "MONDO:0005298",
  why: "One in three women and one in five men over 50 will have a fragility fracture, and a hip fracture carries about 20 % one-year mortality (Johnell 2006 Osteoporos Int).",
  summary:
    "Silent until something breaks. Everything that predicts it is free to ask, and the one test that settles it costs less than a lipid panel.",
  appliesTo: { minAge: 45 },
  priors: {
    base: 0.06,
    source:
      "Kanis 2021 Osteoporos Int: densitometric osteoporosis in roughly 6 % of adults over 50, and over 20 % of women over 70.",
    bands: PRIOR_BANDS.osteoporosis_risk,
    modifiers: [
      {
        when: { sex: "female", minAge: 55 },
        times: 3,
        why: "Bone loss accelerates sharply after the final period (A).",
        grade: "A",
        source:
          "Kanis 2021 Osteoporos Int (FRAX): sex and age are the two dominant terms in the model.",
      },
      {
        when: {
          fact: "medications",
          includes: "prednisolone|prednisone|dexamethasone|steroid",
        },
        times: 2.5,
        why: "Three months of oral steroid is an independent FRAX risk factor (A).",
        grade: "A",
        source: "Kanis 2021 Osteoporos Int: glucocorticoid exposure in FRAX.",
      },
      {
        when: { fact: "smoking", includes: "current" },
        times: 1.5,
        why: "Current smoking is an independent FRAX risk factor (A).",
        grade: "A",
        source: "Kanis 2021 Osteoporos Int: smoking in FRAX.",
      },
      {
        when: { fact: "family_history", includes: "hip fracture|osteoporosis" },
        times: 2,
        why: "A parental hip fracture roughly doubles the risk, independent of bone density (A).",
        grade: "A",
        source:
          "Kanis 2004 Bone: parental history of hip fracture as a FRAX variable.",
      },
    ],
  },
  evidence: [
    {
      id: "osteo_dexa",
      input: { fact: "dexa" },
      when: { below: -2.5 },
      lr: 20,
      lrNeg: 0.2,
      grade: "A",
      source:
        "WHO 1994 criteria: a T-score at or below −2.5 is the definition of osteoporosis.",
    },
    {
      id: "osteo_vitamin_d",
      input: { hypothesis: "vitamin_d_deficiency" },
      when: { above: 0.6 },
      lr: 1.6,
      grade: "B",
      source:
        "Bischoff-Ferrari 2009 BMJ: vitamin D deficiency contributes to bone loss and to falls, though correcting it alone does not prevent fractures.",
    },
    {
      id: "osteo_low_bmi",
      input: { metric: "bmi" },
      when: { below: 20 },
      lr: 2,
      grade: "A",
      source:
        "Kanis 2021 Osteoporos Int: low BMI is one of the FRAX clinical risk factors and works partly through bone size.",
    },
    {
      id: "osteo_menopause",
      input: { fact: "menopause_status" },
      when: { includes: "post" },
      lr: 2.5,
      grade: "A",
      source:
        "Kanis 2021: oestrogen withdrawal is the single largest driver of bone loss in women.",
    },
  ],
  discriminators: [
    {
      test: "DEXA bone density scan",
      codes: ["dexa_t_score"],
      cost: 3,
      lrPos: 20,
      lrNeg: 0.2,
      typicalPos: -2.8,
      typicalNeg: -0.5,
      unit: "T-score",
      howTo:
        "Ten minutes, less radiation than a transatlantic flight. Hip and spine, and keep the report: the next scan is only meaningful compared with this one.",
    },
    {
      test: "25-OH vitamin D",
      codes: ["vitamin_d"],
      cost: 1,
      lrPos: 1.6,
      lrNeg: 0.9,
      typicalPos: 12,
      typicalNeg: 42,
      unit: "ng/mL",
    },
  ],
  lenses: {
    lifespan: { w: 2, grade: "A" },
    energy: { w: 1, grade: "B" },
  },
  confirmAtLrPos: 15,
  management:
    "Get the DEXA if FRAX or the risk factors say so; it is cheap and it decides. Meanwhile the treatment is the same for everyone: resistance and impact training, 1000 mg calcium a day from food, vitamin D above 30 ng/mL, stop smoking, keep alcohol low. A T-score at or below −2.5, or any fragility fracture, means drug treatment, and bisphosphonates are the cheapest with the longest record.",
};

const LOW_FITNESS_SARCOPENIA: Hypothesis = {
  id: "low_fitness_sarcopenia",
  name: "Low fitness and muscle loss",
  why: "Cardiorespiratory fitness is the strongest single predictor of all-cause mortality in large cohorts, ahead of smoking and blood pressure (Mandsager 2018 JAMA Netw Open, 122 007 people).",
  summary:
    "The thing that never appears on a lab sheet and predicts death better than everything that does. Grip strength alone beats systolic blood pressure.",
  priors: {
    base: 0.25,
    source:
      "Grade C for the number: roughly a quarter of adults sit in the bottom fitness quartile for their age by construction; there is no single prevalence study for 'low fitness' as a condition.",
    bands: PRIOR_BANDS.low_fitness_sarcopenia,
    modifiers: [
      {
        when: { minAge: 65 },
        times: 2,
        why: "Muscle mass falls about 1 % a year after 50 and strength faster than that (A).",
        grade: "A",
        source:
          "Cruz-Jentoft 2019 Age Ageing (EWGSOP2): sarcopenia prevalence by age.",
      },
      {
        when: {
          fact: "conditions",
          includes: "copd|heart failure|cancer|chronic kidney",
        },
        times: 2,
        why: "Every chronic disease accelerates muscle loss (A).",
        grade: "A",
        source: "Cruz-Jentoft 2019 Age Ageing: secondary sarcopenia.",
      },
    ],
  },
  evidence: [
    {
      id: "fitness_grip_low",
      input: { fact: "grip_kg" },
      when: { below: 27 },
      lr: 4,
      lrNeg: 0.4,
      grade: "A",
      source:
        "Cruz-Jentoft 2019 Age Ageing (EWGSOP2): grip below 27 kg in men and 16 kg in women is the probable-sarcopenia cut-off; Leong 2015 Lancet (PURE) showed grip predicts mortality better than systolic pressure.",
    },
    {
      id: "fitness_resting_hr",
      input: { fact: "resting_hr" },
      when: { above: 80 },
      lr: 2,
      grade: "B",
      source:
        "Jensen 2013 Heart: a resting heart rate above 80 predicts mortality independently of fitness in the Copenhagen Male Study.",
    },
    {
      id: "fitness_energy",
      input: { fact: "sym_energy" },
      when: { equals: "Yes" },
      lr: 1.4,
      lrNeg: 0.8,
      grade: "C",
      source:
        "Grade C for the size: deconditioning and fatigue reinforce each other, and no cohort reports a likelihood ratio for self-reported tiredness against measured fitness.",
    },
    {
      id: "fitness_age",
      input: { fact: "birth_year" },
      when: { below: 1966 },
      lr: 1.5,
      grade: "B",
      source:
        "Cruz-Jentoft 2019: age is the dominant non-modifiable term in every sarcopenia definition.",
    },
  ],
  discriminators: [
    {
      test: "Grip strength with a dynamometer",
      codes: ["grip_kg"],
      cost: 1,
      lrPos: 4,
      lrNeg: 0.4,
      typicalPos: 22,
      typicalNeg: 45,
      unit: "kg",
      repeatable: true,
      howTo:
        "Three squeezes per hand, best value. A cheap dynamometer costs less than one blood panel and can be repeated at home every month.",
    },
    {
      test: "VO2max estimate from a submaximal test",
      codes: ["vo2max_est"],
      cost: 2,
      lrPos: 5,
      lrNeg: 0.3,
      typicalPos: 22,
      typicalNeg: 45,
      unit: "mL/kg/min",
      howTo:
        "A twelve-minute run, a step test or a watch estimate. Any of them beats not measuring it, which is what almost every clinic does.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
    energy: { w: 3, grade: "A" },
    mood: { w: 1, grade: "B" },
    weight: { w: 2, grade: "B" },
  },
  management:
    "Measure it, because unmeasured fitness never improves. Then: two resistance sessions a week to failure-ish, 150 minutes of zone-2 aerobic work, and 1.6 g of protein per kilogram a day if you are over 50. Re-measure grip monthly and VO2max twice a year. This is the intervention with the largest effect size in the whole catalog.",
};

const HAEMOCHROMATOSIS: Hypothesis = {
  id: "haemochromatosis",
  name: "Haemochromatosis",
  mondoId: "MONDO:0021001",
  why: "HFE C282Y homozygosity is carried by about 1 in 200 people of Northern European ancestry, and the organ damage is entirely preventable if it is found early (Adams 2005 NEJM).",
  summary:
    "The body absorbs iron it cannot get rid of. Decades later it is in the liver, the pancreas and the heart. Two blood tests find it and a phlebotomy needle treats it.",
  priors: {
    base: 0.004,
    source:
      "Adams 2005 NEJM (HEIRS study): C282Y homozygosity in 0.44 % of white participants, far rarer in other ancestries.",
    bands: PRIOR_BANDS.haemochromatosis,
    modifiers: [
      {
        when: { fact: "ancestry", includes: "european" },
        times: 3,
        why: "The C282Y allele is a Northern European founder mutation (A).",
        grade: "A",
        source:
          "Adams 2005 NEJM (HEIRS): C282Y homozygote frequency by self-reported ethnicity, 0.44 % white vs 0.03 % or less elsewhere.",
      },
      {
        when: {
          fact: "family_history",
          includes: "haemochromatosis|hemochromatosis|iron overload",
        },
        times: 20,
        why: "It is autosomal recessive, so a sibling has a one-in-four chance (A).",
        grade: "A",
        source:
          "European Association for the Study of the Liver 2022 HFE haemochromatosis guideline: family screening.",
      },
    ],
  },
  evidence: [
    {
      id: "hfe_tsat_high",
      input: { metric: "transferrin_saturation" },
      when: { above: 45 },
      lr: 8,
      lrNeg: 0.2,
      grade: "A",
      source:
        "EASL 2022 guideline: transferrin saturation above 45 % is the screening threshold, and it rises before ferritin does.",
    },
    {
      id: "hfe_ferritin_high",
      input: { metric: "ferritin" },
      when: { above: 300, sex: "male" },
      lr: 3,
      grade: "A",
      source:
        "EASL 2022 Clinical Practice Guidelines on haemochromatosis (J Hepatol): ferritin above 300 µg/L in men and 200 in women, with a raised transferrin saturation, is the phenotypic case definition. It also rises with inflammation, alcohol and fatty liver.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "hfe_ferritin_high_female",
      input: { metric: "ferritin" },
      when: { above: 200, sex: "female" },
      lr: 3,
      grade: "A",
      source:
        "EASL 2022 Clinical Practice Guidelines on haemochromatosis (J Hepatol): ferritin above 300 µg/L in men and 200 in women, with a raised transferrin saturation, is the phenotypic case definition. The 300 cut applied to a woman is how the diagnosis gets missed for a decade.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "hfe_alt",
      input: { metric: "alt" },
      when: { above: 40 },
      lr: 1.5,
      grade: "B",
      source:
        "EASL 2022: raised transaminases are the commonest first abnormality once iron reaches the liver.",
      confoundedBy: ["alt"],
    },
    {
      id: "hfe_joint",
      input: { fact: "sym_joint" },
      when: { equals: "Yes" },
      lr: 1.5,
      grade: "C",
      source:
        "Grade C for the size: the classic haemochromatosis arthropathy is in the second and third knuckles rather than the big toe, so this question only catches it by accident. No LR is published for a general joint question.",
    },
  ],
  discriminators: [
    {
      test: "Transferrin saturation with ferritin",
      codes: ["transferrin_saturation", "ferritin"],
      cost: 1,
      lrPos: 8,
      lrNeg: 0.2,
      typicalPos: 62,
      typicalNeg: 28,
      unit: "%",
      repeatable: true,
      howTo:
        "Fasting, because saturation drifts through the day. Two raised results, not one, before going on to the gene test.",
    },
    {
      test: "HFE genotype (C282Y, H63D)",
      codes: ["hfe_genotype"],
      cost: 2,
      lrPos: 50,
      lrNeg: 0.1,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "One tube, once, and it settles it for life. C282Y homozygous is the diagnosis; the other combinations rarely cause overload on their own.",
    },
  ],
  lenses: {
    lifespan: { w: 2, grade: "A" },
    energy: { w: 2, grade: "B" },
  },
  confirmAtLrPos: 20,
  management:
    "Two fasting transferrin saturations above 45 % go to an HFE genotype. If C282Y homozygous: venesection until ferritin is 50 µg/L, then maintenance a few times a year. Check the liver with FIB-4 and imaging if ferritin was above 1000, avoid vitamin C supplements with meals and iron supplements entirely, and test the siblings.",
};

const CHRONIC_INFLAMMATION: Hypothesis = {
  id: "chronic_inflammation",
  name: "Chronic inflammation",
  mondoId: "MONDO:0021166",
  why: "Residual inflammatory risk predicts cardiovascular events and mortality even in people whose lipids are already treated (Ridker 2023 Lancet; ERFC 2010 Lancet).",
  summary:
    "Not a diagnosis so much as a signal that something is running. It is only meaningful when the acute causes have been excluded and it is still there twice.",
  priors: {
    base: 0.2,
    source:
      "Emerging Risk Factors Collaboration 2010 Lancet: about a fifth of adults sit above hs-CRP 3 mg/L, the high-risk band.",
    bands: PRIOR_BANDS.chronic_inflammation,
    modifiers: [
      {
        when: { fact: "waist_height_ratio", above: 0.55 },
        times: 2,
        why: "Visceral fat is an inflammatory organ; CRP tracks waist more tightly than any other measure (A).",
        grade: "A",
        source: "Ridker 2003 Circulation: CRP and adiposity.",
      },
      {
        when: { fact: "smoking", includes: "current" },
        times: 1.5,
        why: "Smoking raises CRP measurably (A).",
        grade: "A",
        source: "Ridker 2003 Circulation: determinants of CRP.",
      },
    ],
  },
  evidence: [
    {
      id: "inflam_hscrp_high",
      input: { metric: "hs_crp" },
      when: { above: 3 },
      lr: 5,
      lrNeg: 0.3,
      grade: "A",
      source:
        "ERFC 2010 Lancet: hs-CRP above 3 mg/L is the high-risk band in over 160 000 people.",
      confoundedBy: ["hs_crp"],
    },
    {
      id: "inflam_hscrp_very_high",
      input: { metric: "hs_crp" },
      when: { above: 10 },
      lr: 2,
      grade: "A",
      source:
        "Ridker 2003 Circulation: above 10 mg/L the result belongs to an acute process, not to cardiovascular risk, so it argues less about chronic inflammation, not more.",
      confoundedBy: ["hs_crp"],
    },
    {
      id: "inflam_esr",
      input: { metric: "esr" },
      when: { above: 20 },
      lr: 2.5,
      grade: "B",
      source:
        "Bray 2016 Can Fam Physician: ESR and CRP agree most of the time; ESR moves slower in both directions.",
    },
    {
      id: "inflam_ferritin",
      input: { metric: "ferritin" },
      when: { above: 300 },
      lr: 1.8,
      grade: "B",
      source:
        "Kell 2014 Metallomics: ferritin is an acute-phase protein, which is exactly why it fails as an iron test during inflammation.",
      confoundedBy: ["ferritin"],
    },
  ],
  discriminators: [
    {
      test: "Repeat hs-CRP after 2 weeks",
      codes: ["hs_crp"],
      cost: 1,
      lrPos: 5,
      lrNeg: 0.3,
      typicalPos: 4.5,
      typicalNeg: 0.6,
      unit: "mg/L",
      repeatable: true,
      howTo:
        "Never interpret one CRP. Repeat it two weeks after any infection has cleared; the lower of two readings is the one that means anything.",
    },
    {
      test: "ESR",
      codes: ["esr"],
      cost: 1,
      lrPos: 2.5,
      lrNeg: 0.6,
      typicalPos: 32,
      typicalNeg: 8,
      unit: "mm/h",
    },
  ],
  lenses: {
    lifespan: { w: 2, grade: "B" },
    energy: { w: 1, grade: "C" },
  },
  management:
    "Two raised hs-CRP results at least two weeks apart, with no infection in between, before this means anything. Then look for the cause: visceral fat, smoking, gum disease, sleep apnoea, an autoimmune disease, or alcohol. Treating the number itself is not a thing outside trials; treating what is causing it is.",
};

const HEPATITIS_BC: Hypothesis = {
  id: "hepatitis_bc",
  name: "Hepatitis B or C",
  mondoId: "MONDO:0005344",
  why: "Viral hepatitis causes about 1.3 million deaths a year and most carriers do not know; hepatitis C is now curable in 8–12 weeks (WHO 2024 global hepatitis report).",
  summary:
    "Silent for thirty years, then cirrhosis or liver cancer. Two antibody tests, once in a lifetime, and one of the two infections is simply cured.",
  priors: {
    base: 0.015,
    source:
      "WHO 2024 global hepatitis report: about 254 million people live with hepatitis B and 50 million with hepatitis C, roughly 1.5 % of adults combined at world level.",
    bands: PRIOR_BANDS.hepatitis_bc,
    modifiers: [
      {
        when: {
          fact: "conditions",
          includes: "transfusion|tattoo|injecting|hepatitis",
        },
        times: 4,
        why: "Blood exposure before universal screening is the dominant transmission route for hepatitis C (A).",
        grade: "A",
        source: "WHO 2024 global hepatitis report: transmission routes.",
      },
    ],
  },
  evidence: [
    {
      id: "hep_hbsag",
      input: { metric: "hbs_ag_screening" },
      when: { above: 0.5 },
      lr: 50,
      lrNeg: 0.1,
      grade: "A",
      source:
        "WHO 2024 hepatitis testing guidance: HBsAg has sensitivity and specificity above 98 % for chronic hepatitis B.",
    },
    {
      id: "hep_hcv_ab",
      input: { metric: "hcv_antibodies" },
      when: { above: 0.5 },
      lr: 30,
      lrNeg: 0.05,
      grade: "A",
      source:
        "WHO 2024 hepatitis testing guidance: anti-HCV is the screening test; a positive needs HCV RNA to prove current infection.",
    },
    {
      id: "hep_alt",
      input: { metric: "alt" },
      when: { above: 45 },
      lr: 2,
      grade: "B",
      source:
        "EASL 2017 hepatitis B guideline: a persistently raised ALT with no metabolic cause is the classic incidental finding.",
      confoundedBy: ["alt"],
    },
  ],
  discriminators: [
    {
      test: "HBsAg with anti-HCV",
      codes: ["hbs_ag_screening", "hcv_antibodies"],
      cost: 1,
      lrPos: 40,
      lrNeg: 0.08,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "Once in a lifetime for every adult, per the WHO and US CDC. Two lines on a lab form and one of the two results is curable.",
    },
    {
      test: "HCV RNA",
      codes: ["hcv_rna"],
      cost: 2,
      lrPos: 50,
      lrNeg: 0.05,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "Only after a positive antibody. Antibodies stay positive for life after a cleared infection; the RNA says whether the virus is still there.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
  },
  confirmAtLrPos: 20,
  management:
    "Test once, whoever you are. A positive anti-HCV goes to HCV RNA, and a positive RNA is cured with 8–12 weeks of direct-acting antivirals in over 95 % of people. Chronic hepatitis B is managed rather than cured: viral load, ALT, fibrosis staging, six-monthly liver cancer surveillance, and vaccinate the household.",
};

const ANAEMIA_OTHER: Hypothesis = {
  id: "anaemia_other",
  name: "Anaemia, not iron",
  mondoId: "MONDO:0002280",
  why: "Anaemia affects about a quarter of the world's population and is a leading cause of years lived with disability; a third of it is not iron deficiency (GBD 2021 Lancet).",
  summary:
    "A low haemoglobin with a normal ferritin is a different problem: B12, folate, the kidney, the thyroid, a thalassaemia trait, or the marrow.",
  priors: {
    base: 0.05,
    source:
      "GBD 2021 Lancet: total anaemia prevalence about 24 % worldwide, of which roughly a third is not iron-deficiency anaemia, so about 5 % of adults (grade C for the arithmetic).",
    bands: PRIOR_BANDS.anaemia_other,
    modifiers: [
      {
        when: {
          fact: "ancestry",
          includes:
            "mediterranean|south-east asian|south east asian|middle eastern",
        },
        times: 3,
        why: "Thalassaemia trait is common where malaria was: the Mediterranean, the Middle East and South-East Asia (A).",
        grade: "A",
        source:
          "Weatherall 2010 Blood: the global distribution of the thalassaemias follows the historical malaria belt.",
      },
      {
        when: { minAge: 70 },
        times: 2.5,
        why: "Anaemia of ageing, chronic disease and kidney failure all cluster after 70 (A).",
        grade: "A",
        source: "Guralnik 2004 Blood: anaemia prevalence in NHANES III by age.",
      },
    ],
  },
  evidence: [
    {
      id: "anaemia_hb_low",
      input: { metric: "hemoglobin" },
      when: { belowOptimal: true },
      lr: 6,
      lrNeg: 0.15,
      grade: "A",
      source:
        "WHO 2011 haemoglobin thresholds: under 13 g/dL in men and 12 in women is anaemia by definition.",
      confoundedBy: ["hemoglobin"],
    },
    {
      id: "anaemia_ferritin_normal",
      input: { metric: "ferritin" },
      when: { above: 50 },
      lr: 2.5,
      grade: "A",
      source:
        "WHO 2020 ferritin guidance: a ferritin above 30–50 µg/L excludes iron deficiency as the cause, which is what makes this the other kind of anaemia.",
      confoundedBy: ["ferritin"],
    },
    {
      id: "anaemia_mcv_low",
      input: { metric: "mcv" },
      when: { below: 78 },
      lr: 4,
      grade: "A",
      source:
        "Weatherall 2010 Blood: a microcytosis with a normal ferritin is the classic thalassaemia trait picture, and the Mentzer index separates it from iron deficiency.",
    },
    {
      id: "anaemia_mcv_high",
      input: { metric: "mcv" },
      when: { above: 100 },
      lr: 3,
      grade: "A",
      source:
        "Green 2017 Nat Rev Dis Primers: macrocytosis points at B12, folate, alcohol, thyroid or the marrow.",
    },
    {
      id: "anaemia_egfr",
      input: { derived: "egfr" },
      when: { below: 45 },
      lr: 3,
      grade: "A",
      source:
        "KDIGO 2012 anaemia guideline: erythropoietin production falls once eGFR is under about 45.",
    },
    {
      id: "anaemia_reticulocytes",
      input: { metric: "reticulocytes" },
      when: { above: 2.5 },
      lr: 3,
      grade: "A",
      source:
        "Green 2017: a high reticulocyte count means the marrow is replacing red cells that are being lost or destroyed.",
    },
  ],
  discriminators: [
    {
      test: "Reticulocyte count",
      codes: ["reticulocytes"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.5,
      typicalPos: 3.5,
      typicalNeg: 1.2,
      unit: "%",
      howTo:
        "The first fork in every anaemia: high means losing or destroying red cells, low means not making them.",
    },
    {
      test: "Haemoglobin electrophoresis",
      codes: ["hba2"],
      cost: 2,
      lrPos: 20,
      lrNeg: 0.3,
      typicalPos: 5,
      typicalNeg: 2.5,
      unit: "%",
      howTo:
        "An HbA2 above 3.5 % is beta-thalassaemia trait. Worth knowing once, mostly so nobody prescribes you iron forever.",
    },
    {
      test: "B12 with folate",
      codes: ["vitamin_b12", "folic_acid"],
      cost: 1,
      lrPos: 4,
      lrNeg: 0.5,
      typicalPos: 150,
      typicalNeg: 450,
      unit: "pg/mL",
    },
  ],
  lenses: {
    energy: { w: 3, grade: "A" },
    lifespan: { w: 1, grade: "B" },
  },
  management:
    "Start with the MCV and the reticulocyte count, because they split the problem four ways in one panel. Then B12, folate, creatinine, TSH and a haemoglobin electrophoresis by ancestry. Do not treat with iron on a normal ferritin: it will not work and, in a thalassaemia trait, it will slowly do harm.",
};

const CANCER_SCREENING_DUE: Hypothesis = {
  id: "cancer_screening_due",
  name: "Cancer screening overdue",
  why: "Cancers are the second cause of death worldwide, and the screened ones (colorectal, breast, cervical, lung) are the ones where finding it early changes the outcome (USPSTF 2021–2024 recommendations; GBD 2021 Lancet).",
  summary:
    "Not a disease: a state of the calendar. The screening tests with mortality evidence behind them have ages attached, and most people are late for at least one.",
  appliesTo: { minAge: 40 },
  priors: {
    base: 0.4,
    source:
      "Grade C for the number: European screening participation runs 40–70 % depending on the programme and the country (OECD Health at a Glance 2023), so being overdue for at least one is the commoner state.",
    bands: PRIOR_BANDS.cancer_screening_due,
    modifiers: [
      {
        when: { minAge: 50 },
        times: 1.4,
        why: "Past 50 every programme applies, so the chance of being late for one of them rises (B).",
        grade: "B",
        source:
          "USPSTF 2021 colorectal cancer recommendation: screening starts at 45 for everyone.",
      },
      {
        when: { fact: "smoking", includes: "current|former" },
        times: 1.3,
        why: "Smokers qualify for low-dose CT lung screening, which almost nobody is offered (A).",
        grade: "A",
        source:
          "USPSTF 2021 lung cancer recommendation: annual low-dose CT from 50 with a 20 pack-year history.",
      },
    ],
  },
  evidence: [
    {
      id: "screen_none_recorded",
      input: { fact: "screening_dates" },
      when: { includes: "none|never" },
      lr: 6,
      lrNeg: 0.5,
      grade: "B",
      source:
        "Grade B: the answer is the evidence here. USPSTF 2021 sets colorectal screening from 45 and mammography from 40–50, so 'never' after those ages is overdue by definition.",
    },
    {
      id: "screen_colonoscopy_recorded",
      input: { fact: "screening_dates" },
      when: { includes: "colonoscopy" },
      lr: 0.4,
      grade: "B",
      source:
        "USPSTF 2021: a colonoscopy covers ten years, so a recorded one removes the largest single overdue item.",
    },
    {
      id: "screen_family_history",
      input: { fact: "family_history" },
      when: { includes: "cancer|colorectal|bowel|breast|prostate" },
      lr: 2,
      grade: "A",
      source:
        "USPSTF 2021 colorectal recommendation: a first-degree relative moves the start age forward by ten years, so the same calendar is later.",
    },
  ],
  discriminators: [
    {
      test: "Colonoscopy",
      codes: ["colonoscopy_done"],
      cost: 4,
      lrPos: 8,
      lrNeg: 0.2,
      typicalPos: 0,
      typicalNeg: 1,
      // USPSTF 2021 colorectal recommendation: screening starts at 45. The
      // condition applies from 40 because mammography does; nothing bowel-
      // related is owed to a 41-year-old.
      appliesTo: { minAge: 45 },
      howTo:
        "From 45, every ten years if it is clean. A faecal immunochemical test every year is the cheaper alternative with almost as much mortality evidence.",
    },
    {
      test: "Mammography",
      codes: ["mammography_done"],
      cost: 3,
      lrPos: 6,
      lrNeg: 0.25,
      typicalPos: 0,
      typicalNeg: 1,
      // The condition applies to everybody past 40; this test does not.
      // USPSTF 2024 breast cancer recommendation: biennial mammography for
      // women from 40 to 74.
      appliesTo: { sex: "female", minAge: 40 },
      howTo:
        "Every two years from 50, and from 40 by preference or family history.",
    },
    {
      test: "Low-dose CT for lung cancer",
      codes: ["ldct_done"],
      cost: 3,
      lrPos: 5,
      lrNeg: 0.3,
      typicalPos: 0,
      typicalNeg: 1,
      // USPSTF 2021 lung cancer recommendation: annual low-dose CT from 50 for
      // a 20 pack-year history, current or quit within 15 years. A never-smoker
      // is not a candidate at any age.
      appliesTo: { minAge: 50 },
      requiresFact: { fact: "smoking", includes: "current|former" },
      howTo:
        "Annually from 50 with a 20 pack-year history, current or quit within 15 years. The one screening test with a mortality benefit in smokers (NLST 2011 NEJM).",
    },
    {
      test: "PSA discussion",
      codes: ["psa_total"],
      cost: 1,
      lrPos: 3,
      lrNeg: 0.5,
      typicalPos: 6,
      typicalNeg: 0.8,
      unit: "ng/mL",
      // USPSTF 2018 prostate recommendation: an individual decision from 55 to
      // 69, brought forward to 45 by family history or Black ancestry. 45 is
      // the earliest age at which the conversation is ever right, and the howTo
      // says the rest.
      appliesTo: { sex: "male", minAge: 45 },
      howTo:
        "A conversation before a blood test, from 50, or 45 with family history. The benefit is real and small and the overdiagnosis is real and large.",
    },
  ],
  lenses: {
    lifespan: { w: 3, grade: "A" },
  },
  management:
    "List what you have had and when. Then: colonoscopy or annual FIT from 45, mammography from 40–50 every two years, cervical screening to 65, low-dose CT annually if you have smoked 20 pack-years, a PSA conversation from 50, and a skin check if you have many moles or a bad sunburn history. Put the dates in the calendar, because that is the whole intervention.",
};

const NEW: Hypothesis[] = [
  HYPERTENSION,
  ASCVD_RISK,
  FAMILIAL_HYPERCHOLESTEROLAEMIA,
  LPA_ELEVATED,
  TYPE2_DIABETES,
  CKD,
  DEPRESSION,
  ALCOHOL_USE_DISORDER,
  COELIAC_DISEASE,
  ATROPHIC_GASTRITIS,
  FOLATE_DEFICIENCY,
  VITAMIN_D_DEFICIENCY,
  HYPOTHYROIDISM,
  HYPERTHYROIDISM,
  PERIMENOPAUSE,
  MALE_HYPOGONADISM,
  GOUT_HYPERURICAEMIA,
  OSTEOPOROSIS_RISK,
  LOW_FITNESS_SARCOPENIA,
  HAEMOCHROMATOSIS,
  CHRONIC_INFLAMMATION,
  HEPATITIS_BC,
  ANAEMIA_OTHER,
  CANCER_SCREENING_DUE,
  ...RARE,
];

/* ── what a genome file adds ──────────────────────────────────────────── *
 *
 * One place for every rule that reads a `genome:` profile fact, so the twelve
 * rows of `lib/genome-catalog.ts` and the conditions they move stay next to
 * each other. The calls these match are exactly the strings that catalog's
 * `call()` returns.
 */

const GENOME_EVIDENCE: Record<string, EvidenceRule[]> = {
  lpa_elevated: [
    {
      id: "lpa_genotype",
      input: { fact: "genome:lpa" },
      when: { equals: "carrier" },
      lr: 4,
      grade: "A",
      source:
        "Clarke 2009 N Engl J Med (PROCARDIS): rs10455872 and rs3798220 carriers have roughly a fourfold odds of Lp(a) in the top decile.",
    },
  ],
  haemochromatosis: [
    {
      id: "hfe_c282y_homozygous",
      input: { fact: "genome:hfe" },
      when: { includes: "c282y homozygous" },
      lr: 50,
      grade: "A",
      source:
        "EASL 2022 haemochromatosis guidelines: C282Y homozygosity underlies the great majority of HFE haemochromatosis in Northern European ancestry.",
    },
    {
      id: "hfe_compound_heterozygous",
      input: { fact: "genome:hfe" },
      when: { includes: "compound heterozygous" },
      lr: 5,
      grade: "A",
      source:
        "Gurrin 2009 Hepatology (HealthIron): compound heterozygotes load iron far less often than C282Y homozygotes but well above the background rate.",
    },
  ],
  coeliac_disease: [
    {
      id: "coeliac_hla_absent",
      input: { fact: "genome:hla_dq" },
      when: { includes: "carries dq" },
      lr: 1,
      lrNeg: 0.1,
      grade: "A",
      source:
        "Karell 2003 Hum Immunol; NICE NG20: over 99 % of coeliac patients carry DQ2.5 or DQ8, so the absence of both is a rule-out and the presence of one only opens the question the prior already counted.",
    },
  ],
};

const GENOME_MODIFIERS: Record<string, Hypothesis["priors"]["modifiers"]> = {
  ascvd_risk: [
    {
      when: { fact: "genome:apoe", includes: "e4" },
      times: 1.3,
      why: "One APOE ε4 copy raises coronary disease risk by about a quarter to a third (A).",
      grade: "A",
      source:
        "Bennet 2007 JAMA: APOE ε4 carriers, meta-analysis of 82 studies, odds ratio ≈ 1.3 for coronary disease.",
    },
  ],
  coeliac_disease: [
    {
      when: { fact: "genome:hla_dq", includes: "carries dq" },
      times: 3,
      why: "Carrying DQ2.5 or DQ8 is necessary but nowhere near sufficient; it raises the pre-test odds roughly threefold (A).",
      grade: "A",
      source:
        "Romanos 2014 Gut (HLA risk stratification in coeliac disease); Monsuur 2008 PLoS ONE.",
    },
  ],
  type2_diabetes: [
    {
      when: { fact: "genome:tcf7l2", equals: "CT" },
      times: 1.4,
      why: "One TCF7L2 T allele raises type 2 diabetes risk about 1.4-fold (A).",
      grade: "A",
      source: "Grant 2006 Nat Genet (deCODE): per-allele odds ratio 1.45.",
    },
    {
      when: { fact: "genome:tcf7l2", equals: "TT" },
      times: 1.96,
      why: "Two TCF7L2 T alleles roughly double the risk (A).",
      grade: "A",
      source: "Grant 2006 Nat Genet: homozygote odds ratio ≈ 2.4 vs CC.",
    },
  ],
  insulin_resistance: [
    {
      when: { fact: "genome:fto", equals: "AT" },
      times: 1.2,
      why: "One FTO A allele adds about 1.2 kg of body weight and a matching nudge to insulin resistance (B).",
      grade: "B",
      source: "Frayling 2007 Science: per-allele BMI effect 0.4 kg/m².",
    },
    {
      when: { fact: "genome:fto", equals: "AA" },
      times: 1.44,
      why: "Two FTO A alleles double that nudge (B).",
      grade: "B",
      source: "Frayling 2007 Science; Kilpeläinen 2011 PLoS Med.",
    },
  ],
  folate_deficiency: [
    {
      when: { fact: "genome:mthfr", includes: "c677t homozygous" },
      times: 1.5,
      why: "677TT lowers MTHFR activity and raises homocysteine, but only when folate intake is low (C).",
      grade: "C",
      source:
        "Clarke 2012 PLoS Med (MTHFR and homocysteine); ACMG 2013 statement: the clinical effect is small and folate-dependent.",
    },
  ],
  hashimoto: [
    {
      when: { fact: "genome:hla_dr", includes: "carries dr" },
      times: 1.5,
      why: "DR3 and DR4 are the shared autoimmune haplotypes behind thyroid autoimmunity (B).",
      grade: "B",
      source:
        "Zeitlin 2008 Clin Endocrinol: HLA class II association with autoimmune thyroid disease, odds ratios around 1.5.",
    },
  ],
  atrophic_gastritis: [
    {
      when: { fact: "genome:hla_dr", includes: "carries dr" },
      times: 1.5,
      why: "The same DR3/DR4 haplotypes carry autoimmune gastritis (B).",
      grade: "B",
      source:
        "Jacobson 2008 Clin Immunol (epidemiology of autoimmune disease clustering on DR3/DR4).",
    },
  ],
};

/* ── trend evidence (phase 17, section 4) ─────────────────────────────── *
 *
 * A direction is a fact in its own right. A TSH of 3.1 says little; a TSH of
 * 3.1 that was 1.4 three years ago says the gland is failing slowly, and that
 * is the difference between "watch" and "test the antibodies". Every rule here
 * needs three draws inside five years (`slopePerYear` in `lib/derived.ts`);
 * with fewer it is missing, not false.
 *
 * The likelihood ratios are small on purpose. None of these thresholds has a
 * published diagnostic LR — they are guideline definitions of "progressing"
 * turned into a nudge — so they are graded B where the threshold itself is a
 * guideline number and C where it is not, and `GRADE_SHRINK` pulls the C ones
 * down again.
 */

const TREND_EVIDENCE: Record<string, EvidenceRule[]> = {
  hashimoto: [
    {
      id: "hashi_tsh_rising",
      input: { metric: "tsh" },
      when: { slopePerYear: { above: 0.5 } },
      lr: 1.5,
      grade: "B",
      source:
        "Vanderpump 1995 Clin Endocrinol (Whickham 20-year follow-up): antibody-positive people progress to overt hypothyroidism at 2-5 % a year, and the TSH climbs before the free T4 falls. Grade B for the direction; the 0.5 mIU/L per year threshold is a curated cut-off, not a published one, which is why the ratio is 1.5 and not 5.",
    },
  ],
  hypothyroidism: [
    {
      id: "hypo_tsh_rising",
      input: { metric: "tsh" },
      when: { slopePerYear: { above: 0.5 } },
      lr: 1.5,
      grade: "B",
      source:
        "Vanderpump 1995 Clin Endocrinol (Whickham): a rising TSH is how subclinical hypothyroidism becomes overt. Same curated 0.5 mIU/L per year threshold as the Hashimoto rule.",
    },
  ],
  iron_deficiency: [
    {
      id: "iron_ferritin_falling",
      input: { metric: "ferritin" },
      when: { slopePerYear: { below: -15 } },
      lr: 1.5,
      grade: "C",
      source:
        "Grade C for the size: no published slope threshold exists. A store falling 15 ng/mL a year is losing roughly a milligram of iron a week (Cook 2003 Blood: 1 ng/mL of ferritin is about 8-10 mg of stored iron), which is the order of a real ongoing loss rather than assay noise.",
    },
  ],
  iron_deficiency_cause_gi: [
    {
      id: "gi_ferritin_falling",
      input: { metric: "ferritin" },
      when: { slopePerYear: { below: -15 } },
      lr: 1.3,
      grade: "C",
      source:
        "Grade C: a store that keeps falling has a source, and in an adult who is eating normally the gut is where it usually is (BSG 2021 iron deficiency guideline). Weaker than the iron-deficiency rule itself because the slope says there is a loss, not where it is.",
    },
  ],
  atrophic_gastritis: [
    {
      id: "gastritis_ferritin_falling",
      input: { metric: "ferritin" },
      when: { slopePerYear: { below: -15 } },
      lr: 1.3,
      grade: "C",
      source:
        "Grade C: same reasoning as the gut-loss rule. Atrophic gastritis causes iron deficiency by failing to absorb rather than by bleeding (Lahner 2009 World J Gastroenterol), and a falling store is what that looks like over years.",
    },
  ],
  ckd: [
    {
      id: "ckd_egfr_falling",
      input: { derived: "egfr" },
      when: { slopePerYear: { below: -3 } },
      lr: 2,
      grade: "A",
      source:
        "KDIGO 2024 CKD guideline: a sustained decline in eGFR of more than 5 mL/min/1.73m2 per year is rapid progression, and more than 3 is faster than ageing alone (about 1 per year after 40). Grade A because the threshold is the guideline's own.",
    },
  ],
  insulin_resistance: [
    {
      id: "ir_insulin_rising",
      input: { metric: "insulin" },
      when: { slopePerYear: { above: 2 } },
      lr: 1.3,
      grade: "C",
      source:
        "Grade C for the size: no published slope threshold. Fasting insulin rises for years while glucose holds (DeFronzo 2009 Diabetes), so 2 uIU/mL a year is compensation happening rather than a fasting artefact, but nobody has measured the ratio.",
    },
  ],
  ascvd_risk: [
    {
      id: "ascvd_apob_rising",
      input: { metric: "apolipoprotein_b" },
      when: { slopePerYear: { above: 10 } },
      lr: 1.2,
      grade: "C",
      source:
        "Grade C: risk is cumulative exposure, so a particle count going up adds area under the curve (Ference 2017 Eur Heart J, Mendelian randomisation on lifetime LDL exposure). The 10 mg/dL a year threshold is curated; the direction is the evidence.",
    },
    {
      id: "ascvd_ldl_rising",
      input: { metric: "ldl_cholesterol" },
      when: { slopePerYear: { above: 10 } },
      lr: 1.2,
      grade: "C",
      source:
        "Grade C, same reasoning as the apoB rule (Ference 2017 Eur Heart J). Both sit in the `lipid_panel` correlation group, so whichever of the two the person has measured counts once.",
    },
  ],
};

/** A condition plus what a genome file and a trend would say about it. */
function withGenomeAndTrends(h: Hypothesis): Hypothesis {
  const evidence = [
    ...(GENOME_EVIDENCE[h.id] ?? []),
    ...(TREND_EVIDENCE[h.id] ?? []),
  ];
  const modifiers = GENOME_MODIFIERS[h.id];
  if (!evidence.length && !modifiers) return h;
  return {
    ...h,
    evidence: [...h.evidence, ...evidence],
    priors: {
      ...h.priors,
      modifiers: [...h.priors.modifiers, ...(modifiers ?? [])],
    },
  };
}

/** The eight, patched, plus the twenty-four. Thirty-two conditions. */
export const CATALOG: Catalog = withNegatives(
  [
    ...HYPOTHESES.map((h): Hypothesis => {
      const patch = PATCHES[h.id];
      if (!patch) return h;
      const { evidence, modifiers, ...rest } = patch;
      return {
        ...h,
        ...rest,
        evidence: [...h.evidence, ...(evidence ?? [])],
        priors: {
          ...h.priors,
          bands: PRIOR_BANDS[h.id],
          modifiers: [...h.priors.modifiers, ...(modifiers ?? [])],
        },
      };
    }),
    ...NEW,
  ].map(withGenomeAndTrends),
);

/** Every prior band and every evidence row needs one, so it is worth asserting. */
export const missingSources = (catalog: Catalog = CATALOG): string[] => [
  ...catalog.filter((h) => !h.priors.source).map((h) => `prior ${h.id}`),
  ...catalog
    .flatMap((h) => h.evidence)
    .filter((e) => !e.source)
    .map((e) => `evidence ${e.id}`),
];
