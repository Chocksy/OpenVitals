/**
 * Population base rates that are narrower than one number per condition.
 *
 * Two sources fill `hkb_priors`. The country rows come from NCD-RisC through
 * `scripts/hkb-import-priors.ts`. The rows here are the literature ones, by
 * sex and by age band, for the conditions no open country dataset covers.
 *
 * A band is only written where the condition does not already carry a prior
 * modifier on the same axis: `scoreHypotheses` picks one band and then
 * multiplies the modifiers, so a female band plus a "×5 if female" modifier
 * would count the same fact twice. The conditions that express sex or age as a
 * modifier (hashimoto, hypothyroidism, depression, alcohol_use_disorder,
 * hyperthyroidism, gout_hyperuricaemia, osteoporosis_risk, ckd,
 * atrophic_gastritis, perimenopause, male_hypogonadism, ascvd_risk,
 * anaemia_other, low_fitness_sarcopenia) are deliberately absent here.
 *
 * Pure data. `lib/hkb-catalog.ts` hangs these off `priors.bands`.
 */
import type { PriorBand } from "./hypotheses";

const band = (
  sex: PriorBand["sex"],
  ageMin: number | null,
  ageMax: number | null,
  prevalence: number,
  source: string,
): PriorBand => ({ country: null, sex, ageMin, ageMax, prevalence, source });

export const PRIOR_BANDS: Record<string, PriorBand[]> = {
  iron_deficiency: [
    band(
      "female",
      15,
      50,
      0.2,
      "Kassebaum 2016 Hematol Oncol Clin North Am (GBD anaemia): iron deficiency in about a fifth of women of reproductive age in high-income countries.",
    ),
    band(
      "female",
      51,
      null,
      0.06,
      "Kassebaum 2016: the rate falls sharply after menstruation stops, which is also why it becomes a red flag.",
    ),
    band(
      "male",
      18,
      null,
      0.02,
      "Kassebaum 2016: iron deficiency in adult men runs about 2 % and is nearly always a bleeding lesion.",
    ),
  ],
  pcos: [
    band(
      "female",
      15,
      45,
      0.11,
      "Teede 2023 international evidence-based PCOS guideline: 8–13 % of women of reproductive age under Rotterdam criteria.",
    ),
  ],
  sleep_apnoea: [
    band(
      null,
      30,
      49,
      0.045,
      "Peppard 2013 Am J Epidemiol (Wisconsin Sleep Cohort): moderate-to-severe apnoea in about 10 % of men and 3 % of women aged 30–49; the sex split is carried by the ×2 male modifier.",
    ),
    band(
      null,
      50,
      70,
      0.09,
      "Peppard 2013 Am J Epidemiol: 17 % of men and 9 % of women aged 50–70; the sex split is carried by the ×2 male modifier.",
    ),
  ],
  b12_deficiency: [
    band(
      null,
      60,
      null,
      0.15,
      "Allen 2009 Food Nutr Bull: B12 deficiency rises to 10–20 % after 60 because acid-dependent absorption falls.",
    ),
  ],
  nafld: [
    band(
      "male",
      18,
      null,
      0.32,
      "Younossi 2023 Hepatology: pooled global prevalence of steatotic liver disease about 30 %, higher in men.",
    ),
    band(
      "female",
      18,
      null,
      0.24,
      "Younossi 2023 Hepatology: pooled prevalence in women, lower before menopause and converging after it.",
    ),
  ],
  coeliac_disease: [
    band(
      null,
      18,
      null,
      0.01,
      "Singh 2018 Clin Gastroenterol Hepatol: pooled biopsy-confirmed prevalence 0.7 %, seroprevalence 1.4 %, so 1 % is the honest adult figure.",
    ),
  ],
  vitamin_d_deficiency: [
    band(
      null,
      18,
      null,
      0.2,
      "Cashman 2016 Am J Clin Nutr: 13 % of Europeans below 30 nmol/L year-round and about 40 % below 50 nmol/L, so a fifth is the middle of that range for the 20 ng/mL cut-off.",
    ),
  ],
  hepatitis_bc: [
    band(
      null,
      18,
      null,
      0.015,
      "WHO 2024 global hepatitis report: 254 million with hepatitis B and 50 million with hepatitis C, about 1.5 % of adults between them at world level.",
    ),
  ],
  haemochromatosis: [
    band(
      null,
      18,
      null,
      0.004,
      "Adams 2005 NEJM (HEIRS): HFE C282Y homozygosity in 0.44 % of white participants; ancestry is carried by the ×3 European modifier.",
    ),
  ],
};
