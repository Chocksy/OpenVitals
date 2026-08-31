/**
 * The HPO annotation file as knowledge: which phenotype terms map to a question
 * this app already asks, how common each of those is in the general adult
 * population, and how to read HPOA's frequency column as a number.
 *
 * It lives here rather than in the importer because three things read it: the
 * ontology import (evidence proposals), the Monarch graph import (phenotype
 * edges) and `lib/wake.ts` (the phenotype match that wakes a ring-2 disease).
 *
 * Pure data plus one parser. No database, no clock, no network.
 */

/**
 * How common each phenotype is in the general adult population, so a frequency
 * inside a disease becomes a likelihood ratio. Only phenotypes on this list
 * produce evidence rows: without a background rate there is no ratio to
 * compute, and without one of our own features there is nothing to attach it
 * to.
 */
export const BACKGROUND: Record<
  string,
  {
    /** the `hkb_features` row the rule reads */
    featureId: string;
    /** the answer that counts as present */
    when: Record<string, unknown>;
    /** prevalence in adults */
    p: number;
    source: string;
  }
> = {
  "HP:0012378": {
    featureId: "fact:sym_energy",
    when: { equals: "Yes" },
    p: 0.2,
    source:
      "Fatigue lasting over a month is reported by about 20 % of adults in primary-care surveys (Cullen 2002 Ir J Med Sci; Watanabe 2008).",
  },
  "HP:0002019": {
    featureId: "fact:sym_bowel",
    when: { equals: "Constipation" },
    p: 0.15,
    source:
      "Suares 2011 Am J Gastroenterol: pooled global prevalence of chronic constipation in adults 14 %.",
  },
  "HP:0002028": {
    featureId: "fact:sym_bowel",
    when: { equals: "Diarrhoea and bloating" },
    p: 0.05,
    source:
      "Sperber 2021 Gastroenterology (Rome Foundation global study): diarrhoea-predominant functional bowel disorders in about 5 % of adults.",
  },
  "HP:0001824": {
    featureId: "fact:sym_weight",
    when: { equals: "Lost" },
    p: 0.05,
    source:
      "Wong 2021 J Gen Intern Med: unintentional weight loss in about 5 % of community-dwelling adults per year.",
  },
  "HP:0004324": {
    featureId: "fact:sym_weight",
    when: { equals: "Gained" },
    p: 0.2,
    source:
      "Hutfless 2013 (NHANES): about a fifth of adults report gaining more than 3 kg over a year.",
  },
  "HP:0001596": {
    featureId: "fact:sym_hair_skin",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Gan 2005 J Investig Dermatol Symp Proc: clinically significant hair loss in about 10 % of adult women; dry skin is on the same question.",
  },
  "HP:0000958": {
    featureId: "fact:sym_hair_skin",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Paul 2011 J Eur Acad Dermatol: xerosis in about 10 % of adults outside the elderly, where it is far commoner.",
  },
  "HP:0000821": {
    featureId: "fact:sym_cold",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Grade C: cold intolerance is one of the twelve Zulewski 1997 signs and is reported by roughly a tenth of euthyroid adults in those series; no population survey measures it directly.",
  },
  "HP:0001959": {
    featureId: "fact:sym_thirst",
    when: { equals: "Yes" },
    p: 0.03,
    source:
      "ADA Standards of Care: polydipsia is uncommon outside hyperglycaemia; 3 % is the honest background for an adult questionnaire (grade C for the number).",
  },
  "HP:0000103": {
    featureId: "fact:sym_thirst",
    when: { equals: "Yes" },
    p: 0.03,
    source:
      "ADA Standards of Care: polyuria travels with polydipsia and is asked as the same question here.",
  },
  "HP:0002829": {
    featureId: "fact:sym_joint",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Grade C: an episode of acute monoarthritis is reported by about a tenth of adults; the gout-specific figure is far lower (Janssens 2010 Arch Intern Med).",
  },
  "HP:0001369": {
    featureId: "fact:sym_joint",
    when: { equals: "Yes" },
    p: 0.1,
    source: "Same question as acute arthralgia; see HP:0002829.",
  },
  "HP:0000716": {
    featureId: "fact:sym_phq2_down",
    when: { includes: "more than half|nearly every day" },
    p: 0.08,
    source:
      "Kroenke 2003 Med Care: a positive PHQ-2 item in about 8 % of a primary-care population.",
  },
  "HP:0000141": {
    featureId: "fact:sym_cycle",
    when: { equals: "Absent" },
    p: 0.04,
    source:
      "Teede 2023 PCOS guideline: secondary amenorrhoea in 3–5 % of women of reproductive age.",
  },
  "HP:0000876": {
    featureId: "fact:sym_cycle",
    when: { equals: "Irregular" },
    p: 0.15,
    source:
      "Teede 2023 PCOS guideline: irregular cycles in about 15 % of women of reproductive age.",
  },
  "HP:0000858": {
    featureId: "fact:sym_cycle",
    when: { equals: "Irregular" },
    p: 0.15,
    source: "Same question as oligomenorrhoea; see HP:0000876.",
  },
  "HP:0000823": {
    featureId: "fact:sym_cycle",
    when: { equals: "Heavy" },
    p: 0.2,
    source:
      "Munro 2018 Int J Gynaecol Obstet: heavy menstrual bleeding reported by about a fifth of premenopausal women.",
  },
  "HP:0002189": {
    featureId: "fact:sym_sleepiness",
    when: { equals: "Yes" },
    p: 0.1,
    source:
      "Young 2002 Am J Respir Crit Care Med: excessive daytime sleepiness in about 10 % of adults.",
  },
  "HP:0100786": {
    featureId: "fact:sym_sleepiness",
    when: { equals: "Yes" },
    p: 0.1,
    source: "Same question as excessive somnolence; see HP:0002189.",
  },
  "HP:0010535": {
    featureId: "fact:sleep_snoring",
    when: { equals: "Most nights" },
    p: 0.2,
    source:
      "Peppard 2013 Am J Epidemiol: habitual snoring in roughly a fifth of adults aged 30–70.",
  },
};

/** HPO's frequency terms as one number each, at the middle of their band. */
export const BANDS: Record<string, number> = {
  "HP:0040280": 1, // obligate, 100 %
  "HP:0040281": 0.895, // very frequent, 80–99 %
  "HP:0040282": 0.545, // frequent, 30–79 %
  "HP:0040283": 0.17, // occasional, 5–29 %
  "HP:0040284": 0.025, // very rare, 1–4 %
  "HP:0040285": 0, // excluded
};

/** "HP:0040282", "12/25" and "30%" as one number. Null when it says nothing. */
export function frequencyOf(raw: string | undefined): number | null {
  if (!raw) return null;
  if (raw in BANDS) return BANDS[raw]!;
  if (raw.endsWith("%")) {
    const v = Number(raw.slice(0, -1));
    return Number.isFinite(v) ? v / 100 : null;
  }
  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!fraction) return null;
  const [, a, b] = fraction;
  return Number(b) > 0 ? Number(a) / Number(b) : null;
}

/** "frequent" and above. Below that the phenotype argues nothing useful. */
export const FREQUENT = 0.3;
