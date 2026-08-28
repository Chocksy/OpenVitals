# Phase 11: the real differential: ontology imports, population priors, symptom set, prices

Approved 2026-08-28. Turns the 8-row catalog into a burden-derived one
with population priors by country, sex and age, a symptom questionnaire
whose answers carry cited likelihood ratios, and test prices so the path
ranks per euro. Everything labelled by grade and source; nothing enters
inference without a source string.

Everything in `apps/simple`. Migrations additive. Downloads go to
`apps/simple/data/hkb/` (gitignored; add to `.gitignore`), fetched by
scripts with a `--offline` flag that uses small fixtures under
`evals/fixtures/hkb/` for tests. No new npm deps (Node 22 has `fetch`,
`zlib`, streams).

## 1. Conditions: the burden-derived catalog (`lib/hkb-catalog.ts` + seed)

Replace the hand-picked eight with 32 conditions chosen by adult burden
and testability (from `health-vectors.md` §2 and the brainstorm). Each row
carries a MONDO id, lens weights with grades, and a "why in the catalog"
line (burden source). The eight existing keep their evidence; the 24 new
ones get evidence drafted with named sources (guidelines, JAMA Rational
Clinical Examination, systematic reviews) and grade per row; anything
you cannot cite gets grade C and a rationale in `source`. Status `seed`.

| id                                | MONDO                                    | notes                                                                                       |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| hypertension                      | MONDO:0005044                            | evidence: home BP, family, age, waist, snoring; tests: 7-day home BP, ACR                   |
| ascvd_risk                        | MONDO:0005311 (atherosclerosis)          | ApoB, LDL, non-HDL, Lp(a), family MI, smoking, hsCRP; tests: ApoB, Lp(a), CAC               |
| familial_hypercholesterolaemia    | MONDO:0007750                            | LDL > 190, family early MI, tendon xanthoma fact; test: genetic panel                       |
| lpa_elevated                      | MONDO:0011340                            | Lp(a) > 50; test once                                                                       |
| insulin_resistance (exists)       | MONDO:0100320                            |                                                                                             |
| type2_diabetes                    | MONDO:0005148                            | HbA1c ≥ 6.5, glucose ≥ 126, symptoms; OGTT                                                  |
| masld (rename nafld)              | MONDO:0013209                            |                                                                                             |
| ckd                               | MONDO:0005300                            | eGFR < 60 or ACR > 30 twice; cystatin C                                                     |
| sleep_apnoea (exists)             | MONDO:0007147                            |                                                                                             |
| depression                        | MONDO:0002050                            | PHQ-2 items as facts, sleep, fatigue; test: PHQ-9                                           |
| alcohol_use_disorder              | MONDO:0007079                            | AUDIT-C facts, GGT, MCV, tracker units                                                      |
| iron_deficiency (exists)          | MONDO:0001356                            |                                                                                             |
| iron_deficiency_cause_gi (exists) | keep, MONDO:0005011 (coeliac) as nearest |                                                                                             |
| coeliac_disease                   | MONDO:0005130                            | tTG-IgA, HLA-DQ2/8 fact, family, bloating/diarrhoea facts                                   |
| atrophic_gastritis                | MONDO:0001364                            | parietal-cell Ab, intrinsic factor Ab, gastrin, pepsinogen, B12, H. pylori                  |
| b12_deficiency (exists)           | MONDO:0021094                            |                                                                                             |
| folate_deficiency                 | MONDO:0043422                            | folate low, MCV high, homocysteine                                                          |
| vitamin_d_deficiency              | MONDO:0005520                            | 25-OH D < 20, winter, latitude fact (country)                                               |
| hypothyroidism                    | MONDO:0005420                            | TSH, fT4, symptoms (Zulewski items), family; parent of hashimoto                            |
| hashimoto (exists)                | MONDO:0007699                            | parent_id hypothyroidism                                                                    |
| hyperthyroidism                   | MONDO:0004425                            | TSH low, fT4 high, weight loss, tremor, TRAb                                                |
| pcos (exists)                     | MONDO:0008487                            |                                                                                             |
| perimenopause                     | MONDO:0021147 (nearest)                  | female 40–55, cycle change, hot flushes, FSH, estradiol                                     |
| male_hypogonadism                 | MONDO:0015691                            | male, testosterone morning ×2, LH, SHBG, symptoms                                           |
| gout_hyperuricaemia               | MONDO:0005393                            | uric acid, joint fact, alcohol                                                              |
| osteoporosis_risk                 | MONDO:0005298                            | age, sex, menopause, steroids fact, low BMI, vitamin D; test: DEXA                          |
| low_fitness_sarcopenia            | MONDO:0100076 (sarcopenia)               | grip, VO2max estimate, steps, age                                                           |
| haemochromatosis                  | MONDO:0021001                            | ferritin > 300, transferrin sat > 45, HFE fact, ancestry                                    |
| chronic_inflammation              | MONDO:0021166 (nearest)                  | hsCRP > 3 twice, ferritin high, ESR                                                         |
| hepatitis_bc                      | MONDO:0005344 / MONDO:0005231            | HBsAg, anti-HCV (already in DB), ALT                                                        |
| anaemia_other                     | MONDO:0002280                            | haemoglobin low with normal ferritin; MCV, reticulocytes, B12, kidney                       |
| cancer_screening_due              | (no MONDO; a screening state)            | age/sex rules, screening_dates facts; tests: colonoscopy, mammography, PSA discussion, LDCT |

Lens weights: lifespan from the GBD mortality share of the cause (A),
quality of life from years lived with disability (B), mood from the
psychiatric-comorbidity literature (B/C). Write the numbers into the seed
with the source string. `burden_daly` filled from the GBD import (§3)
when the cause name matches; else null with the source explaining.

The existing detectors in `lib/patterns.ts` stay as they are (they drive
the pattern cards); every pattern id maps to a condition id.

## 2. Ontology import (`scripts/hkb-import-ontology.ts`)

Downloads (cache in `data/hkb/`):

- HPO: `https://purl.obolibrary.org/obo/hp.json` (JSON-LD graph); import
  every term id, name, synonyms, parent ids into a new table
  `hkb_terms { id text pk, ontology text, name, synonyms jsonb, parents jsonb }`.
- HPOA: `https://purl.obolibrary.org/obo/hp/hpoa/phenotype.hpoa`;
  import rows into `hkb_annotations { disease_id, disease_name, hpo_id,
frequency text, onset text, source text }` (OMIM/Orphanet disease ids).
- MONDO: `https://purl.obolibrary.org/obo/mondo.json`; import into
  `hkb_terms` with `ontology = "MONDO"`, plus `xrefs jsonb` so OMIM and
  Orphanet ids from HPOA can be joined to MONDO.

Sizes: HPO ~19k terms, MONDO ~30k terms, HPOA ~270k rows. Stream-parse
(the JSON files are large but flat: use a simple streaming approach or
load once; note memory). `--offline` reads 200-row fixtures. Idempotent
upserts; a second run changes nothing. Add `hkb:import` to package.json.

Mapping to our catalog: for every `hkb_conditions` row with a MONDO id,
join HPOA through xrefs to get its phenotype frequencies; for each
phenotype with frequency ≥ "frequent" (HP:0040282) create an
`hkb_evidence` row with `status = "proposed"`, `lr_pos` derived as
frequency_in_disease / background_frequency where background is taken
from a small table of population symptom prevalences in the seed
(fatigue 0.2, hair loss 0.1, cold intolerance 0.1, constipation 0.15, ...
with sources) and `grade = "C"`, `source = "HPOA <disease id>"`. These
rows do not score until accepted (status filter in `loadCatalog`); they
appear on a new admin page `/hkb` (section 6) for review. This is the
"thousands of conditions" backbone: conditions outside the catalog are
importable later with the same mapping.

## 3. Population priors (`scripts/hkb-import-priors.ts`)

- NCD-RisC (open CSV, no login): diabetes, hypertension, BMI ≥ 30 by
  country, sex, year. URLs from `https://ncdrisc.org/data-downloads.html`
  (download the country-level CSVs). Import into `hkb_priors` for
  `type2_diabetes`, `hypertension`, and as a `waist`/`bmi` proxy for
  `insulin_resistance` (prevalence of BMI ≥ 30 × a documented factor,
  grade C).
- GBD: the results tool needs a login; provide an importer that reads a
  GBD prevalence CSV placed at `data/hkb/gbd-prevalence.csv` (columns as
  exported by the tool: location, sex, age, cause, metric, val) and maps
  causes to condition ids via a table in the script. Document the exact
  query to run on the site in the script header. Skip silently when the
  file is absent.
- Literature priors for the rest, by sex and age band, world-region
  granularity when country data does not exist, each with a source
  string (e.g. Hashimoto's: antibody positivity ~10 % women, overt
  hypothyroidism ~2 % women; PCOS 8–13 % women 15–45 (Rotterdam); OSA
  ~10 % men 30–49 (Peppard 2013); coeliac 1 %; haemochromatosis HFE
  C282Y homozygous 0.4 % Northern European ancestry; etc.).

Tier-0 facts added to `PROFILE_QUESTIONS` in `lib/vectors.ts`:
`country` (free text mapped to ISO-3166 alpha-2 by a small alias table)
and `ancestry` (options: European, South Asian, East Asian, South-East
Asian, Middle Eastern / North African, Sub-Saharan African, Latin
American, Mixed / other, Prefer not to say). Ancestry modifiers in
`hkb_prior_modifiers`: South Asian ×2 for insulin_resistance and
type2_diabetes (BMI cut-off note), African ancestry ×1.5 for
lpa_elevated, Northern European ×3 for haemochromatosis, Mediterranean /
SE Asian ×3 for thalassaemia trait under anaemia_other. Sources on each.

`scoreHypotheses` prior lookup order: exact (country, sex, age band) →
(country, sex) → (null country, sex, age band) → base. Tests for the
fallback chain.

## 4. The symptom set (`lib/symptoms.ts` + seed)

Twelve interview items, asked as tier-0 facts with options, each an
`hkb_features` row of kind `symptom`, each with evidence rows carrying
LR+ and LR− per condition from cited sources (JAMA Rational Clinical
Examination where it exists; Zulewski 1997 for hypothyroid symptoms;
STOP-Bang literature for OSA; PHQ-2 validation for depression; Rome IV
for GI):

1. Energy: "Tired most days for over a month?" (yes / no)
2. Cold: "Cold hands and feet or feel cold when others do not?"
3. Weight: "Weight change over 3 kg in the last 6 months without trying?" (gained / lost / no)
4. Hair and skin: "Hair thinning or very dry skin?"
5. Sleep: "Snoring or told you stop breathing at night?" (exists as sleep_snoring; merge)
6. Daytime sleepiness: "Fall asleep when sitting quietly?"
7. Mood: PHQ-2 as two items: little interest; feeling down (0–3 each)
8. Bowel: "Constipation, or diarrhoea and bloating most weeks?" (constipation / diarrhoea-bloating / neither)
9. Cycles (female ≤ 55): "Periods regular, irregular, heavy, or absent?"
10. Joints: "Sudden painful swollen joint, big toe or ankle?" (gout)
11. Thirst and urination: "Unusual thirst or urinating much more?" (diabetes)
12. Alcohol: AUDIT-C first item: "How often a drink with alcohol?"

Dependent questions ask as pairs (height with waist). The questionnaire
is asked by the existing profile-question queue only when a hypothesis is
between unlikely and possible and the item is among its top moves by
information gain; the whole set is available on demand under Tracker as
"How do you feel" (one page, 12 items, saves facts).

## 5. Prices (`lib/prices.ts` + seed)

`hkb_tests.cost_by_country` filled for RO from public list prices of the
three big Romanian chains (Synevo, Regina Maria, MedLife), fetched by a
script `scripts/hkb-import-prices.ts` that reads a CSV you maintain at
`data/hkb/prices-ro.csv` (test id, lab, price RON, url, checked_at);
seed the CSV with the ~30 tests in the catalog from the labs' public
pages (record the URL and date per row). Path ranking uses
`gain / max(price_eur, 5)` when a price exists for the user's country,
else the cost band as today. `/brain` shows prices on moves and the tree,
and Budget switches to euros when a country is set.

## 6. `/hkb` admin page

Tabs: Conditions (rows, in_catalog toggle, evidence count, prior source),
Evidence (filter by status; Accept / Reject on proposed rows; the row
shows LR, grade, source, and for HPOA rows the disease and frequency),
Priors (by condition, country, sex, age), Tests (prices by country),
Imports (last run per script with row counts, and Run buttons that call
the scripts through an API route, admin only).

## 7. Migration 0007 (CREATE / ALTER ADD only)

`hkb_terms`, `hkb_annotations`, `hkb_import_runs { script, ran_at, rows,
notes }`; `hkb_conditions` gains `mondo_id text`, `why text`;
`hkb_evidence.status` already exists; `hkb_tests.cost_by_country` exists.

## 8. Verification

```
command pnpm --filter simple typecheck
command pnpm --filter simple test                # offline fixtures for importers
command pnpm --filter simple db:generate && command pnpm --filter simple db:migrate
command pnpm --filter simple hkb:seed            # 32 conditions; counts printed; run twice
command pnpm --filter simple hkb:import          # HPO, MONDO, HPOA (network); counts and duration
command pnpm --filter simple hkb:import:priors   # NCD-RisC; GBD if file present
command pnpm --filter simple hkb:import:prices
```

Then on `/brain`: empty female 34, country RO: first column, top moves
with € prices; empty male 52, country RO: expect ApoB, home BP, HbA1c
near the top; empty female 34, ancestry South Asian: insulin_resistance
prior vs European; Razvan full: the belief table for all 32 with states
(paste), tree root, and the tokens table (HYPOTHESES section must stay
under 600 tokens; if it grows past that, cap the section to the top 8 by
score and count the rest). `/hkb` Evidence tab: proposed HPOA rows for
hashimoto and pcos visible with frequencies; accept one and show it
scoring in `/brain`. Screenshots to `/tmp/brain11/`.

Report: files changed, all outputs with row counts and timings, the four
brain runs with numbers, deviations (expect zero; explain any), and a
list of every evidence row you graded C without a citation.
