# Health vectors: what matters, what the schools agree on, and what we are missing

Companion to `2026-08-26-health-model-spec.md`. This answers: which vectors
drive health and lifespan, where Attia, conventional medicine, Bryan Johnson and
the cohort literature agree or split, whether we need several "views", and
how the app should escalate from interview to labs to imaging.

Evidence notes name the source. DOIs get resolved and verified when the graph
is built (the evidence resolver in spec section 6). Nothing here is fetched
live; treat each citation as "to verify", not as settled.

## 1. Admission

The first draft of the systems graph put "sex hormones" as a headline system
because the database has testosterone, LH, SHBG, estradiol and prolactin in
it. That is data-driven bias. In the mortality literature sex hormones are a
tier-2, conditional topic (symptoms, or low values on a morning fasted draw),
not a primary vector. This document ranks vectors from the outside in, then
maps the existing data onto them.

## 2. What kills and disables people

Global Burden of Disease (Lancet, 2020 and 2024 updates), leading causes of
death in high-income countries: ischaemic heart disease, stroke, cancers (lung,
colorectal, breast, prostate, pancreas), COPD, Alzheimer's and other dementias,
diabetes and kidney disease, lower respiratory infections, liver disease,
self-harm and accidents. Leading modifiable risk factors by attributable
deaths: high systolic blood pressure, smoking, high fasting glucose, high BMI,
high LDL cholesterol, kidney dysfunction, alcohol, low physical activity, diet
(high sodium, low whole grains and fruit), air pollution.

Attia's "four horsemen" (Outlive, 2023) are a repackaging of this list:
atherosclerotic disease, cancer, neurodegenerative disease, metabolic
dysfunction (which feeds the other three). He adds accidental death and
emotional health as the things that shorten life before the horsemen arrive.
Conventional medicine agrees on the diseases. The split is on how early and
how aggressively to act.

## 3. The vectors, ranked

Ranking rule: effect size on all-cause mortality in large cohorts, times how
modifiable it is, times how cheaply it can be measured. Grades: A = consistent
across large cohorts and RCTs or Mendelian randomisation, B = consistent
cohorts, C = mechanistic or small trials.

| #   | Vector                                        | Measured by                                                                       | Grade                                           | Key sources (to verify)                                                                              |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | Cardiorespiratory fitness                     | VO2max test, or estimate from a submax test; resting HR                           | A                                               | Mandsager 2018 JAMA Netw Open (122k, CRF strongest single predictor); Kokkinos 2022 JACC             |
| 2   | Blood pressure                                | home 7-day average                                                                | A                                               | Lewington 2002 Lancet (1M adults, log-linear from 115/75); SPRINT 2015                               |
| 3   | Apolipoprotein B exposure over time           | ApoB (LDL-C, non-HDL as proxies)                                                  | A                                               | Ference 2017 Eur Heart J (EAS consensus, LDL causal); Sniderman 2019 JAMA Cardiol (ApoB beats LDL-C) |
| 4   | Smoking                                       | interview                                                                         | A                                               | Doll 2004 BMJ (British doctors)                                                                      |
| 5   | Glycaemic control and insulin resistance      | HbA1c, fasting glucose, fasting insulin, TG/HDL, OGTT when needed                 | A                                               | Emerging Risk Factors Collaboration 2010 Lancet; DeFronzo on insulin resistance                      |
| 6   | Muscle strength and mass                      | grip strength, chair stand, DEXA lean mass                                        | A                                               | Leong 2015 Lancet (PURE, grip beats systolic BP); Srikanthan 2014 Am J Med                           |
| 7   | Adiposity, especially visceral                | waist, waist-to-height, DEXA visceral fat, BMI last                               | A                                               | GBD 2017; Ross 2020 Nat Rev Endocrinol (waist consensus)                                             |
| 8   | Sleep duration and quality                    | interview, wearable; snoring and daytime sleepiness screen for apnoea             | B                                               | Cappuccio 2010 Sleep (U-shape, 7-8 h); Marin 2005 Lancet (OSA)                                       |
| 9   | Kidney function                               | eGFR (creatinine, cystatin C), urine albumin/creatinine ratio                     | A                                               | CKD Prognosis Consortium 2010 Lancet (eGFR and ACR independent)                                      |
| 10  | Lipoprotein(a)                                | Lp(a) once in life                                                                | A                                               | Kamstrup 2009 JAMA; EAS 2022 consensus                                                               |
| 11  | Chronic inflammation                          | hs-CRP (repeat twice, exclude acute), later IL-6                                  | B                                               | ERFC 2010 Lancet (CRP and mortality); Ridker 2023 Lancet (CRP vs LDL in statin-treated)              |
| 12  | Alcohol                                       | interview, GGT and MCV as corroboration                                           | A                                               | GBD alcohol 2018 Lancet (no safe level for all-cause); Wood 2018 Lancet                              |
| 13  | Physical activity volume                      | steps, minutes, wearable                                                          | A                                               | Paluch 2022 Lancet Public Health (steps); Ekelund 2019 BMJ                                           |
| 14  | Social connection and mental health           | interview, PHQ-2/9                                                                | B                                               | Holt-Lunstad 2010 PLoS Med; Livingston 2020 Lancet dementia commission                               |
| 15  | Liver fat and injury                          | ALT, GGT, FIB-4 (computable), ultrasound if flagged                               | B                                               | Lazo 2011 (NHANES NAFLD); Sterling FIB-4                                                             |
| 16  | Micronutrient status with proven consequences | vitamin D, B12 (esp. vegetarian, metformin, age), ferritin/iron sat, folate       | B for deficiency, C for "optimal"               | Holick 2011 Endocrine Society; VITAL 2019 (D supplementation null on mortality)                      |
| 17  | Thyroid                                       | TSH, then fT4, anti-TPO                                                           | B                                               | Rodondi 2010 JAMA (subclinical hypothyroidism and CHD)                                               |
| 18  | Uric acid                                     | uric acid                                                                         | B (marker), C (target)                          | Feig 2008 NEJM review                                                                                |
| 19  | Homocysteine                                  | homocysteine                                                                      | C (marker, lowering it did not change outcomes) | HOPE-2 2006 NEJM null                                                                                |
| 20  | Sex hormones                                  | testosterone (morning, fasted, twice), SHBG, LH; women by cycle phase             | C as a vector, B for symptomatic deficiency     | TRAVERSE 2023 NEJM (safety, no mortality benefit)                                                    |
| 21  | Hearing and vision                            | audiometry, exam                                                                  | B for dementia risk                             | Livingston 2020                                                                                      |
| 22  | Cancer screening by age and risk              | colonoscopy, mammography, cervical, low-dose CT for smokers, skin, PSA discussion | A for the screened cancers                      | USPSTF 2021-2024 recommendations                                                                     |
| 23  | Biological age composites                     | PhenoAge from albumin, creatinine, glucose, CRP, lymphocyte %, MCV, RDW, ALP, WBC | B                                               | Levine 2018 Aging (NHANES-derived, predicts mortality better than chronological age)                 |

Things the app treats as inputs, not vectors: total cholesterol, HDL as a
target (raising it does not help), vitamin C, zinc, magnesium (deficiency
matters, "optimising" does not), DHEA-S, cortisol single draw (noisy).

## 4. Where the schools agree and where they split

| Topic                | Conventional (USPSTF, ESC, AHA, ADA)                                                                           | Attia                                                                            | Bryan Johnson                                        | Literature says                                                                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which vectors        | BP, lipids, glucose, BMI, smoking, cancer screening, kidney in at-risk, depression                             | Same, plus ApoB, Lp(a), insulin, VO2max, strength, DEXA, sleep, emotional health | Everything measurable, plus epigenetic and organ age | The vectors are shared. The disagreement is targets and timing.                                                                                                                                                                             |
| Lipid target         | LDL-C < 116 mg/dL low risk, < 100 moderate, < 70 high, < 55 very high (ESC 2019). Treat by 10-year risk score. | ApoB < 60-80 for most, lower for high risk; treat by lifetime risk, not 10-year  | ApoB in the 40s                                      | Lower is better and cumulative exposure matters (Ference). Lifetime-risk framing is supported by MR studies. Extreme targets have no outcome data outside statin trials.                                                                    |
| Glucose              | HbA1c < 5.7 normal, 5.7-6.4 prediabetes                                                                        | Fasting insulin < 10, OGTT with insulin, CGM for everyone, HbA1c < 5.4           | CGM, tight control                                   | Insulin resistance precedes HbA1c change by years (DeFronzo). CGM for non-diabetics has no outcome data; useful for learning, not for grading.                                                                                              |
| Fitness and strength | "150 min/week"; not measured                                                                                   | VO2max and grip as top predictors, train for the "centenarian decathlon"         | Measured, trains daily                               | Attia is closer to the literature here. CRF and grip are among the strongest predictors and conventional care ignores them.                                                                                                                 |
| Screening timing     | Colonoscopy 45, mammography 40-50, CAC only for intermediate risk                                              | Colonoscopy from 40, CAC from 40 for anyone with risk, earlier Lp(a)             | Everything, often                                    | Earlier screening finds more but also overdiagnoses. USPSTF weighs population harm; Attia weighs individual information. The app should show both positions and default to conventional unless family history or a flagged marker moves it. |
| Supplements          | Only for deficiency                                                                                            | Selective, evidence-graded                                                       | ~100 per day                                         | RCTs of supplements in replete people are mostly null (VITAL, SELECT, HOPE-2). Deficiency correction works.                                                                                                                                 |
| Hormones             | Treat symptomatic deficiency                                                                                   | Same, with more testing                                                          | Testosterone and others as optimisation              | TRAVERSE: safe in hypogonadal men, no mortality benefit. Not a primary vector.                                                                                                                                                              |
| Biological age       | Not used                                                                                                       | Sceptical of epigenetic clocks, likes functional tests                           | Central                                              | PhenoAge (blood-based) predicts mortality in NHANES. Epigenetic clocks are research tools; not actionable per person yet.                                                                                                                   |

## 5. Do we need multiple views?

No separate models. One graph, one evidence grade per edge, and three
**target presets** the user picks:

| Preset              | Optimal bands come from                                                                                                       | Escalation appetite                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Conventional        | ESC/AHA/ADA/USPSTF thresholds                                                                                                 | Screen at guideline age; CAC only at intermediate risk      |
| Longevity (default) | Attia-style: ApoB < 80, fasting insulin < 8, HbA1c < 5.4, hs-CRP < 1, vitamin D 40-60, VO2max top 25 % for age, grip top 25 % | Lp(a) once, CAC at 40 with any risk, DEXA and VO2max yearly |
| Aggressive          | Johnson-style extremes where an argument exists                                                                               | Everything, more often                                      |

Every range bar shows the lab's normal band, the preset's optimal band, and,
when the presets differ, a small marker for the other presets. The report
names the preset it used. Edges never change with the preset; only bands,
goals and escalation thresholds do. Speculative claims carry their source in
the label ("Johnson, n=1", "Attia, mechanistic").

## 6. The escalation ladder

From cheapest to most invasive. Rules live in `lib/systems.ts` as
`escalations`: `{ when, suggest, why, tier, refs }`. The report job uses
them; the LLM explains, it does not decide what to order.

### Tier 0: interview and home measurements (free)

Age, sex, height, weight, waist, smoking, alcohol pattern, sleep hours and
snoring, daytime sleepiness, exercise minutes and type, resting HR, home BP
7-day average, medications, supplements with timing, known conditions,
family history (MI or stroke < 55 male / < 65 female, type 2 diabetes,
colorectal / breast / prostate cancer, dementia), mood (PHQ-2), hearing,
last dental visit, last colonoscopy / mammography / cervical screen.

Manual entries for BP, waist, RHR, grip and a VO2max estimate live in
`daily_logs` (BP, RHR) and `profile_facts` (grip, VO2max, waist) until the
phone app supplies them.

### Tier 1: the annual core panel (about 20 analytes)

ApoB with a standard lipid panel; HbA1c; fasting glucose and fasting insulin;
CMP (sodium, potassium, creatinine for eGFR, urea, ALT, AST, GGT, ALP,
albumin, total bilirubin); CBC with differential; hs-CRP; TSH; vitamin D;
ferritin and iron saturation; uric acid; urine albumin/creatinine ratio; B12
and folate (always if vegetarian, on metformin, or MCV > 95); homocysteine.

Once in life: Lp(a). Optional with consent: ApoE genotype.

Derived, computed by the app: non-HDL, TG/HDL, HOMA-IR, eGFR (CKD-EPI 2021),
FIB-4, PhenoAge.

### Tier 2: conditional tests (rules)

| When                                                             | Suggest                                                                               | Why                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| ApoB > 90, or Lp(a) > 50 mg/dL, or family MI < 55, and age >= 40 | CAC score; repeat ApoB 8-12 weeks after any change                                    | Decide statin timing on plaque, not on a score                 |
| HbA1c >= 5.7, or fasting insulin > 10, or TG/HDL > 2             | 2 h OGTT with insulin; 14-day CGM once                                                | Catch insulin resistance before HbA1c moves                    |
| TSH > 2.5 and rising, or anti-TPO positive                       | fT4, fT3, anti-TPO, anti-Tg; repeat 6 months                                          | Hashimoto's changes the lipid story                            |
| Ferritin < 30                                                    | iron sat, TIBC, coeliac serology; women: menstrual history                            | Find the cause, not just the number                            |
| Ferritin > 300 (men) / > 200 (women) with iron sat > 45 %        | HFE genotype, repeat with CRP                                                         | Haemochromatosis vs inflammation                               |
| ALT > 30 (men) / > 20 (women) or GGT above optimal               | Hepatitis B/C serology, ferritin, FIB-4; liver ultrasound or FibroScan if FIB-4 > 1.3 | NAFLD is the commonest liver finding                           |
| eGFR < 90 or ACR > 30 mg/g                                       | cystatin C eGFR, repeat ACR in 3 months, BP review                                    | Two markers beat one                                           |
| hs-CRP > 3 twice, 2 weeks apart                                  | ESR, ferritin, dental review, sleep apnoea screen                                     | Find the source                                                |
| Homocysteine > 12                                                | B12, folate, MMA                                                                      | Usually a B-vitamin gap                                        |
| Male testosterone < 300 ng/dL or symptoms                        | repeat morning fasted, LH, FSH, SHBG, prolactin, sleep apnoea screen                  | Rule out secondary causes before treating                      |
| Home BP >= 130/80 average                                        | 7-day log, ACR, ECG, potassium                                                        | Hypertension is the largest attributable risk                  |
| Snoring plus sleepiness or resistant BP                          | Home sleep study                                                                      | OSA doubles cardiovascular risk                                |
| Age >= 40                                                        | VO2max test or estimate, grip strength, DEXA (body composition; bone if risk)         | Fitness and muscle are top predictors and never on a lab sheet |
| Age >= 45, or >= 40 with family history                          | Colonoscopy                                                                           | Guideline                                                      |
| Men >= 50, or >= 45 with family history or Black ancestry        | PSA discussion                                                                        | Guideline, shared decision                                     |
| Women >= 40                                                      | Mammography per guideline; cervical screening per interval                            | Guideline                                                      |
| Smoker or quit < 15 years, age 50-80, 20 pack-years              | Low-dose CT yearly                                                                    | USPSTF 2021                                                    |
| MCV > 100, or RDW rising                                         | B12, folate, reticulocytes, alcohol review                                            | Macrocytosis has a short cause list                            |

### Tier 3: refer

Anything above a referral threshold becomes a "doctor" action with the
specialty named and the tier-2 results attached. The app never suggests
treatment doses for prescription drugs.

## 7. Mapping the current data onto the vectors

From the local database (140 metric codes with readings, last draw
2025-12-09):

| Vector                        | Status               | Note                                                                                             |
| ----------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| ApoB                          | stale                | 2 readings, last 2024-05. Should be on every lipid draw.                                         |
| Lp(a)                         | never measured       | Tier 1 once. First gap to close.                                                                 |
| Glycaemic + insulin           | good                 | HbA1c 8 readings, glucose 18, insulin 6, all through 2025-12. HOMA-IR and TG/HDL computable now. |
| Kidney                        | partial              | Creatinine 5 (eGFR computable), urea 4. No cystatin C. No urine ACR (only a protein strip).      |
| Inflammation                  | good                 | hs-CRP 8 readings.                                                                               |
| Liver                         | good but GGT stale   | ALT/AST 9, GGT last 2024-05, ALP last 2024-05. FIB-4 computable.                                 |
| Thyroid                       | good                 | TSH 3, fT4/fT3 3, anti-TPO 2, through 2025-12.                                                   |
| Iron                          | ok                   | Ferritin 4 (2025-12), iron 6, transferrin sat 1 (2021).                                          |
| Vitamin D                     | stale                | Last 2024-11.                                                                                    |
| B12, folate, homocysteine     | good                 | Through 2025-12.                                                                                 |
| Uric acid                     | good                 | 6 readings.                                                                                      |
| CBC                           | good                 | Full differential, RDW, MCV through 2025-12.                                                     |
| PhenoAge                      | computable           | All 9 inputs exist; ALP is from 2024-05, so the first estimate carries a stale flag.             |
| Blood pressure                | never recorded       | Tier 0. Biggest missing vector.                                                                  |
| Waist, weight                 | weight only, tracker | Waist missing.                                                                                   |
| VO2max, grip, RHR             | never recorded       | Tier 0/2. Second biggest gap.                                                                    |
| DEXA, CAC                     | never                | Conditional on age and ApoB.                                                                     |
| Sleep, activity, alcohol      | tracker, 1 day       | Needs 30 days before it counts.                                                                  |
| Family history, smoking, meds | not stored           | Profile facts do not exist yet.                                                                  |
| Sex hormones                  | present, 2024-11     | Fine as tier 2. Not headline.                                                                    |
| Cancer screening dates        | not stored           | Profile facts.                                                                                   |

## 8. Where we stand

Exists today: PDF parsing with OCR fallback, unit normalisation, lab-normal
and curated optimal ranges, the curator with a review queue, per-marker
trends and goals, a retest plan generated by the LLM, lifestyle actions as a
protocol with adherence, a daily tracker.

Missing, in the order to build:

1. **Profile facts** (sex, age, family history, smoking, meds, screening
   dates). Without these the modifiers and half the escalation rules cannot
   run.
2. **Vector coverage check**: a deterministic list of "never measured / stale
   / current" per vector, shown on home and in the report. Today the app only
   knows about markers it has seen.
3. **Escalation rules** as data, replacing the free-form retest insight with
   a rule-driven plan the LLM explains.
4. **Derived metrics** (non-HDL, TG/HDL, HOMA-IR, eGFR, FIB-4, PhenoAge) as
   virtual metrics with their own ranges and trends.
5. **Non-lab vectors** as first-class inputs: BP, waist, RHR, grip, VO2max
   estimate, with manual entry now and app sync later.
6. **Target presets** (conventional / longevity / aggressive) applied to
   optimal bands and escalation thresholds.
7. The evidence-graded graph and modifiers from the main spec.

For this person specifically, the first report would say: measure Lp(a) once,
put ApoB on the next draw, add urine ACR and GGT, start a 7-day home BP log,
record waist and a grip or VO2max estimate, refresh vitamin D. Everything else
is current.
