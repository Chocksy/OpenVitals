/**
 * The twelve interview items. Plain data, so the questionnaire, the review
 * queue and the evidence rules all read one list.
 *
 * Every item is a profile fact with options, so it saves through `saveFact`
 * like any other answer, and an `hkb_features` row of kind `symptom`, so the
 * evidence rules in `lib/hkb-catalog.ts` can carry a likelihood ratio for it.
 * Snoring already existed as `sleep_snoring`; it is listed here rather than
 * asked twice.
 *
 * Nothing here touches the database or the clock.
 */
import type { Sex } from "./vectors";

export interface Symptom {
  /** `profile_facts.key`, and `fact:<key>` as the feature id */
  key: string;
  /** which of the twelve items it belongs to; the mood item has two */
  item: number;
  /** the name the `hkb_features` row carries */
  name: string;
  question: string;
  options: string[];
  appliesTo?: { sex?: Sex; minAge?: number; maxAge?: number };
  /** where the wording comes from, printed on /hkb */
  source: string;
}

/** 0–3 the way PHQ-2 scores it. */
const PHQ = [
  "Not at all",
  "Several days",
  "More than half the days",
  "Nearly every day",
];

export const SYMPTOMS: Symptom[] = [
  {
    key: "sym_energy",
    item: 1,
    name: "Tired most days",
    question: "Have you been tired most days for over a month?",
    options: ["No", "Yes"],
    source:
      "Fatigue is the commonest presenting symptom of hypothyroidism, iron deficiency, B12 deficiency and sleep apnoea; wording from the NICE tiredness-of-unknown-cause summary.",
  },
  {
    key: "sym_cold",
    item: 2,
    name: "Cold intolerance",
    question: "Do you have cold hands and feet, or feel cold when others do not?",
    options: ["No", "Yes"],
    source: "Zulewski 1997 J Clin Endocrinol Metab: cold intolerance is one of the twelve signs in the clinical hypothyroid score.",
  },
  {
    key: "sym_weight",
    item: 3,
    name: "Unintended weight change",
    question:
      "Has your weight changed by more than 3 kg in the last 6 months without trying?",
    options: ["No", "Gained", "Lost"],
    source:
      "Zulewski 1997 (weight gain) and Bahn 2011 ATA/AACE hyperthyroidism guideline (weight loss with normal appetite).",
  },
  {
    key: "sym_hair_skin",
    item: 4,
    name: "Hair thinning or dry skin",
    question: "Is your hair thinning, or your skin very dry?",
    options: ["No", "Yes"],
    source: "Zulewski 1997: dry skin and coarse hair are two of the twelve clinical hypothyroid signs.",
  },
  {
    key: "sleep_snoring",
    item: 5,
    name: "Snoring",
    question: "Do you snore, or has anyone told you that you stop breathing at night?",
    options: ["No", "Sometimes", "Most nights"],
    source: "Chung 2008 Anesthesiology (STOP-Bang): snoring and witnessed apnoea are two of the eight items.",
  },
  {
    key: "sym_sleepiness",
    item: 6,
    name: "Daytime sleepiness",
    question: "Do you fall asleep when you are sitting quietly during the day?",
    options: ["No", "Yes"],
    source: "Johns 1991 Sleep (Epworth): sitting-quietly items carry most of the scale's weight for sleep apnoea.",
  },
  {
    key: "sym_phq2_interest",
    item: 7,
    name: "Little interest or pleasure",
    question: "Over the last 2 weeks: little interest or pleasure in doing things?",
    options: PHQ,
    source: "Kroenke 2003 Med Care: PHQ-2 item 1.",
  },
  {
    key: "sym_phq2_down",
    item: 7,
    name: "Feeling down or hopeless",
    question: "Over the last 2 weeks: feeling down, depressed or hopeless?",
    options: PHQ,
    source: "Kroenke 2003 Med Care: PHQ-2 item 2.",
  },
  {
    key: "sym_bowel",
    item: 8,
    name: "Bowel pattern",
    question: "Most weeks, do you have constipation, or diarrhoea and bloating?",
    options: ["Neither", "Constipation", "Diarrhoea and bloating"],
    source: "Rome IV criteria (Drossman 2016 Gastroenterology): the two stool-pattern branches.",
  },
  {
    key: "sym_cycle",
    item: 9,
    name: "Menstrual pattern",
    question: "Are your periods regular, irregular, heavy, or absent?",
    options: ["Regular", "Irregular", "Heavy", "Absent"],
    appliesTo: { sex: "female", maxAge: 55 },
    source:
      "Rotterdam 2004 consensus (oligo-anovulation) and Harlow 2012 STRAW+10 (cycle change as the perimenopause marker).",
  },
  {
    key: "sym_joint",
    item: 10,
    name: "Acute painful joint",
    question:
      "Have you ever had a sudden painful, swollen joint, usually the big toe or ankle?",
    options: ["No", "Yes"],
    source: "Janssens 2010 Arch Intern Med (gout diagnostic rule): podagra is the single strongest clinical item.",
  },
  {
    key: "sym_thirst",
    item: 11,
    name: "Thirst and urination",
    question: "Are you unusually thirsty, or urinating much more than usual?",
    options: ["No", "Yes"],
    source: "ADA Standards of Care: polyuria and polydipsia are the classic hyperglycaemia symptoms.",
  },
  {
    key: "sym_alcohol",
    item: 12,
    name: "Alcohol frequency",
    question: "How often do you have a drink containing alcohol?",
    options: [
      "Never",
      "Monthly or less",
      "2 to 4 times a month",
      "2 to 3 times a week",
      "4 or more times a week",
    ],
    source: "Bush 1998 Arch Intern Med: AUDIT-C item 1.",
  },
];

/** The twelve numbered items, for the questionnaire page. */
export const SYMPTOM_ITEMS: { item: number; questions: Symptom[] }[] = [
  ...new Set(SYMPTOMS.map((s) => s.item)),
]
  .sort((a, b) => a - b)
  .map((item) => ({ item, questions: SYMPTOMS.filter((s) => s.item === item) }));

/** Facts that are symptoms, so the seed writes `kind = "symptom"`. */
export const SYMPTOM_KEYS = new Set(SYMPTOMS.map((s) => s.key));

export const symptomByKey = (key: string) =>
  SYMPTOMS.find((s) => s.key === key);
