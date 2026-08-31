/**
 * Waking a ring-2 disease: the five triggers, and what a woken condition is
 * made of.
 *
 * Ring 2 is ten thousand named diseases with a prior and nothing else. Waking
 * one is what turns it into something the engine scores for one person: a row
 * in `user_conditions`, evidence rules generated from that disease's own HPO
 * phenotype frequencies, and a place in that person's differential until it
 * either climbs or is dismissed.
 *
 * The triggers, all five, in the order the spec lists them:
 *
 *  1. an accepted document diagnosis that resolves to a ring-2 term,
 *  2. a genome call whose catalog row names the condition,
 *  3. a pathognomonic lab (`WAKE_LABS` below, every row sourced),
 *  4. an unresolved finding matched against HPOA by phenotype overlap,
 *  5. the user asking (`lib/lookup.ts`, trigger `user`).
 *
 * Triggers 1–4 run inside `recordBeliefs`, which is already called after every
 * upload, answered question, accepted document item, genome import and adopted
 * action. That is the "keeps reconsidering without a re-run": no scheduler,
 * the same hooks that recompute beliefs also reconsider the rings.
 *
 * The scorers (`personPhenotypes`, `rankByPhenotype`) are pure and tested
 * offline. Everything that writes is at the bottom of the file.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  documentItems,
  getDb,
  hkbAnnotations,
  hkbConditions,
  hkbEvidence,
  hkbFeatures,
  hkbPriors,
  hkbTerms,
  userConditions,
} from "@/db";
import type { ModelInput } from "./coverage";
import { matchCondition } from "./documents";
import { GENOME_CATALOG } from "./genome-catalog";
import { forgetCatalog, recordRevision } from "./hkb";
import { BACKGROUND, FREQUENT, frequencyOf } from "./hpoa";
import type { Grade, HypothesisResult } from "./hypotheses";
import { RARITY_PRIOR, RARITY_SOURCE, rarityOf, ring2Id } from "./rings";

/* ── the person as phenotypes ─────────────────────────────────────────── */

/**
 * One off marker as the HPO term a rare-disease annotation would use for it.
 *
 * Small on purpose: every row here is a threshold somebody published and an
 * HPO term that exists in the imported ontology. A marker with no obvious HPO
 * term (GGT, RDW) is left out rather than guessed at, because a wrong term
 * does not fail loudly, it just quietly ranks the wrong disease first.
 */
export const MARKER_HPO: {
  code: string;
  when: { above?: number; below?: number };
  hpoId: string;
  /** the HPO term's own label, so the card can print what was matched */
  name: string;
  source: string;
  /**
   * How often an adult is over (or under) this threshold for any reason at
   * all. It is the denominator of the likelihood ratio a woken disease scores
   * on: HPOA says how often the disease shows the phenotype, this says how
   * often anybody does. Grade C on every one of them — these are read off
   * survey distributions, not measured as diagnostic denominators.
   */
  p: number;
  backgroundSource: string;
}[] = [
  {
    code: "ferritin",
    when: { above: 300 },
    hpoId: "HP:0003281",
    name: "Increased circulating ferritin concentration",
    source:
      "EASL 2022 haemochromatosis guideline: a ferritin above 300 µg/L in men and 200 in women is the threshold for iron-overload work-up; 300 is used for both here and the sex band is read separately.",
    p: 0.12,
    backgroundSource:
      "Grade C: NHANES 2017-2020 ferritin distributions put roughly an eighth of adult men above 300 µg/L, most of it metabolic rather than genetic.",
  },
  {
    code: "transferrin_saturation",
    when: { above: 45 },
    hpoId: "HP:0012463",
    name: "Elevated transferrin saturation",
    source:
      "EASL 2022 haemochromatosis guideline: transferrin saturation above 45 % is the screening cut-off for iron overload.",
    p: 0.05,
    backgroundSource:
      "Grade C: population iron-studies series (Adams 2005 NEJM, HEIRS) put transferrin saturation above 45 % in about 5 % of adults.",
  },
  {
    code: "sodium",
    when: { below: 135 },
    hpoId: "HP:0002902",
    name: "Hyponatremia",
    source:
      "Spasovski 2014 Eur J Endocrinol (European hyponatraemia guideline): a serum sodium under 135 mmol/L is hyponatraemia.",
    p: 0.03,
    backgroundSource:
      "Grade C: Upadhyay 2006 Am J Med and outpatient audits put mild hyponatraemia in about 3 % of unselected adults.",
  },
  {
    code: "potassium",
    when: { above: 5.1 },
    hpoId: "HP:0002153",
    name: "Hyperkalemia",
    source:
      "Kovesdy 2014 (KDIGO controversies conference): a potassium above 5.0-5.5 mmol/L is hyperkalaemia, and the risk rises steeply above 5.5.",
    p: 0.02,
    backgroundSource:
      "Grade C: Kovesdy 2014 puts hyperkalaemia at 2-3 % of the general adult population, most of it with kidney disease or a blocker of the renin-angiotensin system.",
  },
  {
    code: "calcium",
    when: { above: 10.5 },
    hpoId: "HP:0003072",
    name: "Hypercalcemia",
    source:
      "Bilezikian 2018 (Fourth International Workshop on Asymptomatic Primary Hyperparathyroidism): the upper reference limit for albumin-corrected serum calcium is about 10.5 mg/dL in most laboratories.",
    p: 0.01,
    backgroundSource:
      "Grade C: Yeh 2013 JCEM and outpatient audit series put albumin-corrected calcium above the reference limit in about 1 % of adults.",
  },
  {
    code: "eosinophils_abs",
    when: { above: 0.5 },
    hpoId: "HP:0001880",
    name: "Increased total eosinophil count",
    source:
      "Valent 2012 J Allergy Clin Immunol (consensus on eosinophil disorders): an absolute eosinophil count above 0.5 ×10⁹/L is eosinophilia.",
    p: 0.045,
    backgroundSource:
      "Grade C: Hartl 2020 Eur Respir J (NHANES): about 4-5 % of adults carry a blood eosinophil count above 0.5 x10^9/L.",
  },
  {
    code: "platelets",
    when: { below: 150 },
    hpoId: "HP:0001873",
    name: "Thrombocytopenia",
    source:
      "Rodeghiero 2009 Blood (ITP standardisation): a platelet count under 150 ×10⁹/L is thrombocytopenia.",
    p: 0.015,
    backgroundSource:
      "Grade C: Biino 2013 PLoS One (population platelet distributions): a count under 150 x10^9/L in roughly 1.5 % of adults.",
  },
  {
    code: "hemoglobin",
    when: { below: 12 },
    hpoId: "HP:0001903",
    name: "Anemia",
    source:
      "WHO 2011 haemoglobin thresholds: under 13 g/dL in men and 12 in women; 12 is used here and the sex band is read separately by the iron rules.",
    p: 0.06,
    backgroundSource:
      "Grade C: WHO 2021 anaemia estimates put adult anaemia near 6 % in high-income populations at these thresholds.",
  },
  {
    code: "alt",
    when: { above: 40 },
    hpoId: "HP:0031964",
    name: "Elevated circulating alanine aminotransferase concentration",
    source:
      "Kwo 2017 Am J Gastroenterol (ACG guideline): the laboratory upper limit for ALT is conventionally 40 U/L, and the true limit is lower.",
    p: 0.1,
    backgroundSource:
      "Grade C: Ruhl 2012 Gastroenterology (NHANES): about a tenth of adults sit above the conventional 40 U/L ALT limit.",
  },
  {
    code: "ast",
    when: { above: 40 },
    hpoId: "HP:0031956",
    name: "Elevated circulating aspartate aminotransferase concentration",
    source:
      "Kwo 2017 Am J Gastroenterol (ACG guideline): same threshold as ALT.",
    p: 0.05,
    backgroundSource:
      "Grade C: Ruhl 2012 Gastroenterology (NHANES): AST above 40 U/L in roughly 5 % of adults.",
  },
  {
    code: "alp",
    when: { above: 130 },
    hpoId: "HP:0003155",
    name: "Elevated circulating alkaline phosphatase concentration",
    source:
      "Kwo 2017 Am J Gastroenterol (ACG guideline): the usual adult upper reference limit for alkaline phosphatase is about 130 U/L.",
    p: 0.03,
    backgroundSource:
      "Grade C: NHANES alkaline-phosphatase distributions put about 3 % of adults above 130 U/L.",
  },
  {
    code: "creatinine",
    when: { above: 1.3 },
    hpoId: "HP:0003259",
    name: "Elevated circulating creatinine concentration",
    source:
      "KDIGO 2024 CKD guideline: a creatinine above about 1.3 mg/dL in an adult male is outside the reference interval; eGFR is the number that matters and is read separately.",
    p: 0.05,
    backgroundSource:
      "Grade C: KDIGO 2024 and NHANES eGFR distributions: about 5 % of adults sit above this creatinine, most of them older.",
  },
  {
    code: "hs_crp",
    when: { above: 10 },
    hpoId: "HP:0011227",
    name: "Elevated circulating C-reactive protein concentration",
    source:
      "Pearson 2003 Circulation (AHA/CDC): hs-CRP above 10 mg/L is out of the cardiovascular-risk range altogether and means an inflammatory process.",
    p: 0.05,
    backgroundSource:
      "Grade C: Pearson 2003 Circulation and NHANES hs-CRP distributions: about 5 % of adults are over 10 mg/L on a single draw.",
  },
  {
    code: "tryptase",
    when: { above: 11.4 },
    hpoId: "HP:0031901",
    name: "Elevated total serum tryptase",
    source:
      "Valent 2021 Blood (WHO/ECNM consensus): the upper reference limit for baseline serum tryptase is 11.4 ng/mL.",
    p: 0.05,
    backgroundSource:
      "Grade C: Lyons 2016 Nat Genet: hereditary alpha-tryptasemia raises baseline tryptase in about 5 % of people of European ancestry, which is the background any mastocytosis ratio has to beat.",
  },
  {
    code: "pth",
    when: { above: 65 },
    hpoId: "HP:0003165",
    name: "Elevated circulating parathyroid hormone level",
    source:
      "Bilezikian 2018: the usual adult upper reference limit for intact PTH is about 65 pg/mL.",
    p: 0.05,
    backgroundSource:
      "Grade C: vitamin-D-driven secondary hyperparathyroidism puts roughly a twentieth of adults above the PTH reference limit in European surveys.",
  },
];

/** Does a `when` clause from `BACKGROUND` hold for this answer? */
const answerMatches = (
  answer: string,
  when: Record<string, unknown>,
): boolean => {
  const text = answer.trim().toLowerCase();
  if (!text) return false;
  if (typeof when.equals === "string")
    return text === when.equals.toLowerCase();
  if (typeof when.includes === "string")
    return when.includes
      .toLowerCase()
      .split("|")
      .some((needle) => text.includes(needle));
  return false;
};

export interface PersonPhenotype {
  hpoId: string;
  name: string;
  /** what said so: a symptom answer or an off marker */
  because: string;
}

/**
 * The person as a list of HPO terms: the symptom answers that map to one
 * through `BACKGROUND`, plus the off markers in `MARKER_HPO`. This is the only
 * place the two vocabularies meet, and it is deliberately small — a rare
 * disease is found by a handful of loud findings, not by a hundred quiet ones.
 */
export function personPhenotypes(m: ModelInput): PersonPhenotype[] {
  const out: PersonPhenotype[] = [];
  const seen = new Set<string>();
  const push = (hpoId: string, name: string, because: string) => {
    if (seen.has(hpoId)) return;
    seen.add(hpoId);
    out.push({ hpoId, name, because });
  };

  for (const [hpoId, back] of Object.entries(BACKGROUND)) {
    if (!back.featureId.startsWith("fact:")) continue;
    const key = back.featureId.slice("fact:".length);
    const raw = m.profile[key];
    if (raw == null) continue;
    const answer = Array.isArray(raw) ? raw.join(", ") : String(raw);
    if (answerMatches(answer, back.when))
      push(
        hpoId,
        key.replace(/_/g, " "),
        `${key.replace(/_/g, " ")}: ${answer}`,
      );
  }

  for (const row of MARKER_HPO) {
    const value = m.latest[row.code]?.value;
    if (value == null) continue;
    const hit =
      (row.when.above == null || value > row.when.above) &&
      (row.when.below == null || value < row.when.below);
    if (hit)
      push(
        row.hpoId,
        row.name,
        `${row.code.replace(/_/g, " ")} ${value}${m.latest[row.code]?.unit ? ` ${m.latest[row.code]!.unit}` : ""}`,
      );
  }

  return out;
}

/* ── trigger 4: the phenotype match ───────────────────────────────────── */

/** One HPOA row, reduced to what the ranker reads. */
export interface AnnotationRow {
  diseaseId: string;
  hpoId: string;
  frequency: string | null;
}

export interface PhenotypeMatch {
  diseaseId: string;
  score: number;
  /** the HPO ids of this person that the disease lists */
  matched: string[];
  /** how many frequent phenotypes the disease lists at all */
  breadth: number;
}

/**
 * Rank diseases by how much of this person they explain.
 *
 *   score = Σ frequency(matched) / √(frequent phenotypes the disease lists)
 *
 * The sum rewards a disease in which the person's findings are common rather
 * than incidental. The square root is the whole trick: a syndrome that lists
 * two hundred frequent phenotypes matches everybody, so each of its matches is
 * worth less. Without it the ranking is a list of the most heavily annotated
 * diseases in HPOA and nothing else.
 *
 * A disease that matches only one of the person's findings scores nothing:
 * one finding is what ring 1 is for.
 */
export function rankByPhenotype(
  phenotypes: string[],
  annotations: AnnotationRow[],
  opts: { minMatched?: number } = {},
): PhenotypeMatch[] {
  const minMatched = opts.minMatched ?? 2;
  const wanted = new Set(phenotypes);
  const byDisease = new Map<
    string,
    { hits: Map<string, number>; breadth: number }
  >();

  for (const a of annotations) {
    const f = frequencyOf(a.frequency ?? undefined);
    if (f == null || f < FREQUENT) continue;
    const row = byDisease.get(a.diseaseId) ?? {
      hits: new Map<string, number>(),
      breadth: 0,
    };
    row.breadth++;
    if (wanted.has(a.hpoId))
      row.hits.set(a.hpoId, Math.max(row.hits.get(a.hpoId) ?? 0, f));
    byDisease.set(a.diseaseId, row);
  }

  const out: PhenotypeMatch[] = [];
  for (const [diseaseId, row] of byDisease) {
    if (row.hits.size < minMatched) continue;
    const sum = [...row.hits.values()].reduce((s, f) => s + f, 0);
    out.push({
      diseaseId,
      score: Math.round((sum / Math.sqrt(row.breadth)) * 1000) / 1000,
      matched: [...row.hits.keys()].sort(),
      breadth: row.breadth,
    });
  }
  return out.sort(
    (a, b) => b.score - a.score || a.diseaseId.localeCompare(b.diseaseId),
  );
}

/* ── trigger 3: the pathognomonic table ───────────────────────────────── */

export interface WakeLab {
  id: string;
  /** what the card says fired */
  finding: string;
  /** the metric code it reads, or `document` when a document says it */
  code: string;
  when: { above?: number; below?: number };
  /** the value has to hold on the previous draw too */
  twice?: boolean;
  /** a document item whose text matches wakes it, for findings no lab code carries */
  documentMatches?: string;
  /** the MONDO terms it implicates; ring-2 rows are created on demand */
  mondoIds: string[];
  grade: Grade;
  source: string;
}

/**
 * Findings that on their own demand a rare-disease look. Every row is a
 * published threshold with the paper that set it, and every row names the
 * MONDO terms it points at rather than a free-text guess.
 */
export const WAKE_LABS: WakeLab[] = [
  {
    id: "ferritin_over_1000",
    finding: "ferritin over 1000 on two draws",
    code: "ferritin",
    when: { above: 1000 },
    twice: true,
    mondoIds: [
      "MONDO:0021001", // hemochromatosis type 1 (ring 1 here)
      "MONDO:0019355", // adult-onset Still disease
      "MONDO:0015541", // hereditary haemophagocytic lymphohistiocytosis
      "MONDO:0011426", // aceruloplasminemia
    ],
    grade: "B",
    source:
      "EASL 2022 haemochromatosis guideline: a ferritin above 1000 µg/L is the level at which fibrosis becomes likely and a work-up is mandatory. Henter 2007 Pediatr Blood Cancer (HLH-2004): ferritin above 500 is a diagnostic criterion for haemophagocytic lymphohistiocytosis, and above 10 000 it is near-specific. Fautrel 2002 Medicine: extreme hyperferritinaemia with a low glycosylated fraction is the biochemical signature of adult-onset Still disease.",
  },
  {
    id: "tryptase_over_20",
    finding: "baseline tryptase over 20 ng/mL",
    code: "tryptase",
    when: { above: 20 },
    mondoIds: [
      "MONDO:0016586", // systemic mastocytosis
      "MONDO:0020331", // indolent systemic mastocytosis
    ],
    grade: "A",
    source:
      "Valent 2021 Blood (WHO/ECNM consensus criteria): a persistently raised baseline serum tryptase above 20 ng/mL is a minor diagnostic criterion for systemic mastocytosis.",
  },
  {
    id: "paraprotein",
    finding: "a paraprotein or M-spike named in a document",
    code: "document",
    when: {},
    documentMatches:
      "paraprotein|m-spike|m spike|monoclonal gammopathy|monoclonal protein|monoclonal band|bence jones|free light chain",
    mondoIds: [
      "MONDO:0009693", // plasma cell myeloma
      "MONDO:0019438", // AL amyloidosis
      "MONDO:0100280", // Waldenström macroglobulinaemia
    ],
    grade: "A",
    source:
      "Rajkumar 2014 Lancet Oncol (International Myeloma Working Group): a serum monoclonal protein defines MGUS, and myeloma, AL amyloidosis and Waldenström macroglobulinaemia are the diseases it has to be separated from.",
  },
  {
    id: "eosinophils_over_1_5",
    finding: "eosinophils over 1.5 ×10⁹/L on two draws",
    code: "eosinophils_abs",
    when: { above: 1.5 },
    twice: true,
    mondoIds: [
      "MONDO:0011895", // idiopathic hypereosinophilic syndrome
      "MONDO:0015943", // eosinophilic granulomatosis with polyangiitis
    ],
    grade: "A",
    source:
      "Valent 2012 J Allergy Clin Immunol (international consensus): an absolute eosinophil count above 1.5 ×10⁹/L on two occasions at least a month apart is hypereosinophilia and requires a cause to be found.",
  },
  {
    id: "calcium_over_11_5",
    finding: "calcium over 11.5 mg/dL",
    code: "calcium",
    when: { above: 11.5 },
    mondoIds: [
      "MONDO:0010837", // primary hyperparathyroidism
      "MONDO:0009693", // plasma cell myeloma
      "MONDO:0019338", // sarcoidosis
    ],
    grade: "A",
    source:
      "Bilezikian 2018 (Fourth International Workshop): a calcium more than 1 mg/dL above the upper reference limit is itself an operative criterion in primary hyperparathyroidism. Goldner 2016 J Oncol Pract: hypercalcaemia at this level in an adult is hyperparathyroidism, malignancy or a granulomatous disease until proven otherwise.",
  },
  {
    id: "platelets_under_50",
    finding: "platelets under 50 ×10⁹/L",
    code: "platelets",
    when: { below: 50 },
    mondoIds: [
      "MONDO:0008558", // immune (autoimmune) thrombocytopenic purpura
      "MONDO:0018896", // thrombotic thrombocytopenic purpura
    ],
    grade: "A",
    source:
      "Neunert 2019 Blood Adv (ASH ITP guideline): a platelet count under 50 ×10⁹/L is the level at which immune thrombocytopenia is treated rather than watched. Scully 2012 Br J Haematol: thrombotic thrombocytopenic purpura presents with a platelet count usually under 30 and is a medical emergency.",
  },
];

/** Which `WAKE_LABS` rows this person's readings fire. */
export function firedWakeLabs(m: ModelInput): WakeLab[] {
  return WAKE_LABS.filter((row) => {
    if (row.code === "document") return false;
    const latest = m.latest[row.code];
    if (latest?.value == null) return false;
    const hit = (v: number) =>
      (row.when.above == null || v > row.when.above) &&
      (row.when.below == null || v < row.when.below);
    if (!hit(latest.value)) return false;
    if (!row.twice) return true;
    return latest.prev != null && hit(latest.prev);
  });
}

/**
 * The wake triggers that need no database: a pathognomonic lab (trigger 3) and
 * a genome call (trigger 2). One line each, in the words the card would use.
 *
 * `wakeConditions` is the real thing and it writes rows for one user. A
 * journey has no user and must not write, so it runs these two triggers in
 * memory: they are the only ones a scripted person can fire, because the other
 * three need documents, HPOA annotations or somebody asking.
 */
export function wakeInMemory(m: ModelInput): string[] {
  const out = firedWakeLabs(m).map(
    (lab) =>
      `${lab.finding} (${m.latest[lab.code]!.value}) → ${lab.mondoIds.join(", ")}`,
  );
  for (const row of GENOME_CATALOG) {
    const call = String(m.profile[row.factKey] ?? "").trim();
    if (!call || !row.conditions.length) continue;
    out.push(`${row.gene} ${call} → ${row.conditions.join(", ")}`);
  }
  return out;
}

/* ── writing ──────────────────────────────────────────────────────────── */

export type WakeTrigger = "document" | "genome" | "lab" | "phenotype" | "user";

export interface Woken {
  conditionId: string;
  name: string;
  trigger: WakeTrigger;
  /** false when it was already awake */
  isNew: boolean;
}

/**
 * A ring-2 row for one MONDO term, made from `hkb_terms` if the ring-2 build
 * has not seen it. That is how a ring-3 name becomes scoreable the moment
 * somebody types it into the ask box: ring 3 is names, ring 2 is names with a
 * prior, and this is the one step between them.
 */
export async function ensureRing2(
  mondoId: string,
): Promise<{ id: string; name: string; ring: number } | null> {
  const db = getDb();
  const [existing] = await db
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      ring: hkbConditions.ring,
    })
    .from(hkbConditions)
    .where(eq(hkbConditions.mondoId, mondoId))
    .limit(1);
  if (existing) return existing;

  const [term] = await db
    .select({ id: hkbTerms.id, name: hkbTerms.name, xrefs: hkbTerms.xrefs })
    .from(hkbTerms)
    .where(eq(hkbTerms.id, mondoId))
    .limit(1);
  if (!term) return null;

  const orpha = (term.xrefs ?? [])
    .map((x) => x.replace("Orphanet:", "ORPHA:"))
    .filter((x) => x.startsWith("ORPHA:"));
  const rarity = rarityOf(null, orpha.length > 0);
  const id = ring2Id(term.id);

  await db
    .insert(hkbConditions)
    .values({
      id,
      name: term.name,
      summary: `${term.name}. Ring 2: known to the engine by name and base rate, not scored for anybody until something in one person's data points at it.`,
      management:
        "Nothing here is a plan. A ring-2 disease is woken by one finding, scored against its own HPO phenotype frequencies, and either climbs on its own discriminators or goes back to sleep. A rare-disease diagnosis is made by a clinician, not by this page.",
      mondoId: term.id,
      why: `Promoted from ring 3 on demand. Rarity class ${rarity}.`,
      inCatalog: false,
      ring: 2,
      lenses: {},
    })
    .onConflictDoNothing();

  await db
    .insert(hkbPriors)
    .values({
      conditionId: id,
      country: null,
      sex: null,
      ageMin: null,
      ageMax: null,
      prevalence: RARITY_PRIOR[rarity],
      source: RARITY_SOURCE[rarity],
    })
    .onConflictDoNothing();

  return { id, name: term.name, ring: 2 };
}

/** Onset terms that gate a disease to adults. Nothing gates adults out. */
const ADULT_ONSET: Record<string, number> = {
  "HP:0003581": 16, // Adult onset
  "HP:0003596": 40, // Middle age onset
  "HP:0003584": 60, // Late onset
};

/**
 * The background rate and the rule shape for one HPO term: a symptom question
 * out of `BACKGROUND`, or an off marker out of `MARKER_HPO`.
 *
 * The marker half is what makes a lab-woken disease worth anything. Ferritin
 * over 1000 wakes adult-onset Still disease, and this is what lets the same
 * ferritin then argue for it: HPOA says hyperferritinaemia is very frequent in
 * Still's, `MARKER_HPO` says an eighth of adults are over the threshold for
 * ordinary reasons, and the ratio of the two is the likelihood ratio.
 */
export function backgroundFor(hpoId: string): {
  featureId: string;
  when: Record<string, unknown>;
  p: number;
  source: string;
} | null {
  const symptom = BACKGROUND[hpoId];
  if (symptom) return symptom;
  const marker = MARKER_HPO.find((m) => m.hpoId === hpoId);
  if (!marker) return null;
  return {
    featureId: `metric:${marker.code}`,
    when: marker.when as Record<string, unknown>,
    p: marker.p,
    source: `${marker.source} ${marker.backgroundSource}`,
  };
}

/**
 * The evidence a woken ring-2 disease scores on: its own HPOA frequencies,
 * over the phenotypes this app can actually observe.
 *
 * `lrPos = frequency in the disease ÷ frequency in the adult population`, the
 * same arithmetic `hkb-import-ontology.ts` uses for ring 1, and the same
 * phase-14 rule: only the disease's own term speaks, never a child's.
 *
 * Grade C on every row, because a frequency band read as a point estimate is
 * exactly what grade C is for, and `GRADE_SHRINK` then pulls it toward 1.
 */
async function generateEvidence(
  conditionId: string,
  mondoId: string,
): Promise<{ rules: number; appliesTo: { minAge: number } | null }> {
  const db = getDb();
  const [term] = await db
    .select({ xrefs: hkbTerms.xrefs })
    .from(hkbTerms)
    .where(eq(hkbTerms.id, mondoId))
    .limit(1);
  const diseaseIds = (term?.xrefs ?? [])
    .map((x) => x.replace("Orphanet:", "ORPHA:"))
    .filter((x) => x.startsWith("OMIM:") || x.startsWith("ORPHA:"));
  if (!diseaseIds.length) return { rules: 0, appliesTo: null };

  const rows = await db
    .select({
      diseaseId: hkbAnnotations.diseaseId,
      diseaseName: hkbAnnotations.diseaseName,
      hpoId: hkbAnnotations.hpoId,
      frequency: hkbAnnotations.frequency,
      onset: hkbAnnotations.onset,
    })
    .from(hkbAnnotations)
    .where(inArray(hkbAnnotations.diseaseId, diseaseIds));

  // The onset the annotations agree on, when they say anything at all. Only an
  // adult-onset gate is applied: an adult can live with a childhood disease,
  // so a paediatric onset is not a reason to stop scoring it.
  const onsets = [...new Set(rows.map((r) => r.onset).filter(Boolean))];
  const gate =
    onsets.length && onsets.every((o) => o! in ADULT_ONSET)
      ? { minAge: Math.min(...onsets.map((o) => ADULT_ONSET[o!]!)) }
      : null;

  const best = new Map<
    string,
    {
      lrPos: number;
      f: number;
      source: string;
      featureId: string;
      when: Record<string, unknown>;
    }
  >();
  for (const a of rows) {
    const back = backgroundFor(a.hpoId);
    if (!back) continue;
    const f = frequencyOf(a.frequency ?? undefined);
    if (f == null || f < FREQUENT) continue;
    const key = a.hpoId;
    if ((best.get(key)?.f ?? 0) >= f) continue;
    best.set(key, {
      f,
      featureId: back.featureId,
      when: back.when,
      lrPos: Math.round((f / back.p) * 100) / 100,
      source:
        `HPOA ${a.diseaseId} "${a.diseaseName ?? ""}" ${a.hpoId} frequency ${a.frequency} ` +
        `(${Math.round(f * 100)} %) ÷ background ${back.p} — ${back.source} ` +
        `Generated when this ring-2 disease was woken; grade C.`,
    });
  }
  if (!best.size) return { rules: 0, appliesTo: gate };

  const values = [...best.entries()].map(([hpoId, v]) => ({
    id: `wake_${conditionId}_${hpoId.replace(":", "_")}`,
    conditionId,
    featureId: v.featureId,
    conditionOn: v.when,
    lrPos: v.lrPos,
    lrNeg: null,
    grade: "C",
    source: v.source,
    status: "accepted",
  }));
  // Every rule needs its feature to exist: a marker phenotype can name a code
  // no seeded condition reads (tryptase, PTH), and the foreign key is real.
  await db
    .insert(hkbFeatures)
    .values(
      [...new Set(values.map((v) => v.featureId))].map((id) => ({
        id,
        kind: id.startsWith("metric:") ? "lab" : "fact",
        name: id
          .slice(id.indexOf(":") + 1)
          .replace(/_/g, " ")
          .replace(/^./, (c) => c.toUpperCase()),
        unit: null,
        howTo: null,
      })),
    )
    .onConflictDoNothing();
  await db.insert(hkbEvidence).values(values).onConflictDoNothing();
  if (gate)
    await db
      .update(hkbConditions)
      .set({ appliesTo: gate })
      .where(eq(hkbConditions.id, conditionId));
  return { rules: values.length, appliesTo: gate };
}

/** The genome fact behind a genome-triggered wake, as one evidence row. */
async function generateGenomeEvidence(
  conditionId: string,
  detail: { factKey?: string; call?: string; source?: string; grade?: Grade },
) {
  if (!detail.factKey || !detail.call) return;
  const db = getDb();
  const featureId = `fact:${detail.factKey}`;
  await db
    .insert(hkbFeatures)
    .values({
      id: featureId,
      kind: "genetic",
      name: detail.factKey.replace(/^genome:/, "").toUpperCase(),
      unit: null,
      howTo: detail.source ?? null,
    })
    .onConflictDoNothing();
  await db
    .insert(hkbEvidence)
    .values({
      id: `wake_${conditionId}_genome`,
      conditionId,
      featureId,
      conditionOn: { equals: detail.call },
      lrPos: 20,
      lrNeg: null,
      grade: detail.grade ?? "B",
      source: `Genome call "${detail.call}". ${detail.source ?? ""}`.trim(),
      status: "accepted",
    })
    .onConflictDoNothing();
}

/**
 * Wake one condition for one person. Idempotent: waking an already-awake row
 * changes nothing, and waking a dismissed one puts it back.
 */
export async function wake(
  userId: string,
  conditionId: string,
  trigger: WakeTrigger,
  triggerDetail: Record<string, unknown>,
): Promise<Woken | null> {
  const db = getDb();
  const [condition] = await db
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      ring: hkbConditions.ring,
      mondoId: hkbConditions.mondoId,
    })
    .from(hkbConditions)
    .where(eq(hkbConditions.id, conditionId))
    .limit(1);
  if (!condition) return null;

  const [before] = await db
    .select({ status: userConditions.status })
    .from(userConditions)
    .where(
      and(
        eq(userConditions.userId, userId),
        eq(userConditions.conditionId, conditionId),
      ),
    )
    .limit(1);

  await db
    .insert(userConditions)
    .values({
      userId,
      conditionId,
      trigger,
      triggerDetail,
      status: "awake",
    })
    .onConflictDoUpdate({
      target: [userConditions.userId, userConditions.conditionId],
      set: {
        status: "awake",
        trigger,
        triggerDetail,
        ringWokenAt: new Date(),
        note: null,
      },
    });

  const isNew = before?.status !== "awake";
  if (isNew && condition.ring === 2) {
    if (condition.mondoId)
      await generateEvidence(condition.id, condition.mondoId);
    if (trigger === "genome")
      await generateGenomeEvidence(condition.id, triggerDetail);
    await recordRevision(
      `woke ring-2 ${condition.id} (${condition.name}) by ${trigger}`,
    );
  }
  forgetCatalog(userId);
  return { conditionId, name: condition.name, trigger, isNew };
}

/** Put one back to sleep. The row stays, so the audit trail says we looked. */
export async function dismiss(
  userId: string,
  conditionId: string,
  note: string,
): Promise<void> {
  await getDb()
    .update(userConditions)
    .set({ status: "dismissed", note })
    .where(
      and(
        eq(userConditions.userId, userId),
        eq(userConditions.conditionId, conditionId),
      ),
    );
  forgetCatalog(userId);
}

/* ── the four automatic triggers ──────────────────────────────────────── */

/** A ring-1 condition at least "possible" explains its own markers. */
const EXPLAINED = 0.25;

/** Under this after its own questions are answered, a user-asked wake sleeps again. */
export const AUTO_DISMISS_BELOW = 0.01;

export interface WakeReport {
  woke: Woken[];
  dismissed: string[];
  /** the phenotypes the match ran on, for the report and for /brain */
  phenotypes: PersonPhenotype[];
}

/**
 * Reconsider the rings for one person. Called from `recordBeliefs`, so every
 * hook that recomputes beliefs also reconsiders which rare diseases are worth
 * scoring at all.
 */
export async function wakeConditions(
  userId: string,
  m: ModelInput,
  scored: HypothesisResult[],
): Promise<WakeReport> {
  const db = getDb();
  const out: WakeReport = { woke: [], dismissed: [], phenotypes: [] };
  const already = new Map(
    (
      await db
        .select({
          conditionId: userConditions.conditionId,
          status: userConditions.status,
          trigger: userConditions.trigger,
        })
        .from(userConditions)
        .where(eq(userConditions.userId, userId))
    ).map((r) => [r.conditionId, r]),
  );

  const wakeMondo = async (
    mondoId: string,
    trigger: WakeTrigger,
    detail: Record<string, unknown>,
  ) => {
    const row = await ensureRing2(mondoId);
    if (!row) return;
    // A dismissed row stays dismissed unless the user asks again: the point of
    // dismissing is that the engine stops bringing it back every hour.
    if (already.get(row.id)?.status === "dismissed" && trigger !== "user")
      return;
    const woken = await wake(userId, row.id, trigger, detail);
    if (woken?.isNew) out.woke.push(woken);
  };

  /* 1. a document said so */
  const diagnoses = await db
    .select({ payload: documentItems.payload, excerpt: documentItems.excerpt })
    .from(documentItems)
    .where(
      and(
        eq(documentItems.userId, userId),
        eq(documentItems.kind, "diagnosis"),
        eq(documentItems.status, "accepted"),
      ),
    );
  const ring2Named = await db
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      mondoId: hkbConditions.mondoId,
    })
    .from(hkbConditions)
    .where(eq(hkbConditions.ring, 2));
  for (const d of diagnoses) {
    const p = d.payload as { text?: string; mondoGuess?: string };
    const hit = matchCondition(p, ring2Named);
    if (!hit) continue;
    if (already.get(hit)?.status === "dismissed") continue;
    const woken = await wake(userId, hit, "document", {
      diagnosis: p.text,
      mondoGuess: p.mondoGuess,
      excerpt: d.excerpt,
    });
    if (woken?.isNew) out.woke.push(woken);
  }

  /* 2. a genome call names it */
  for (const row of GENOME_CATALOG) {
    const call = m.profile[row.factKey];
    if (call == null || !String(call).trim()) continue;
    for (const conditionId of row.conditions) {
      if (already.get(conditionId)?.status === "dismissed") continue;
      const woken = await wake(userId, conditionId, "genome", {
        gene: row.gene,
        factKey: row.factKey,
        call: String(call),
        grade: row.grade,
        source: row.source,
      });
      if (woken?.isNew) out.woke.push(woken);
    }
  }

  /* 3. a pathognomonic lab */
  for (const lab of firedWakeLabs(m)) {
    const latest = m.latest[lab.code]!;
    for (const mondoId of lab.mondoIds)
      await wakeMondo(mondoId, "lab", {
        rule: lab.id,
        finding: lab.finding,
        code: lab.code,
        value: latest.value,
        previous: latest.prev ?? null,
        source: lab.source,
      });
  }

  /* 3b. a document names a paraprotein, which no metric code carries */
  const documentText = diagnoses
    .map(
      (d) =>
        `${(d.payload as { text?: string }).text ?? ""} ${d.excerpt ?? ""}`,
    )
    .join(" ")
    .toLowerCase();
  for (const lab of WAKE_LABS) {
    if (!lab.documentMatches) continue;
    const needle = lab.documentMatches
      .split("|")
      .find((n) => documentText.includes(n));
    if (!needle) continue;
    for (const mondoId of lab.mondoIds)
      await wakeMondo(mondoId, "lab", {
        rule: lab.id,
        finding: lab.finding,
        matched: needle,
        source: lab.source,
      });
  }

  /* 4. an unresolved finding, matched against HPOA by phenotype overlap */
  out.phenotypes = personPhenotypes(m);
  if (out.phenotypes.length >= 2 && unresolved(m, scored)) {
    const ids = out.phenotypes.map((p) => p.hpoId);
    const annotated = await db
      .select({
        diseaseId: hkbAnnotations.diseaseId,
        hpoId: hkbAnnotations.hpoId,
        frequency: hkbAnnotations.frequency,
      })
      .from(hkbAnnotations)
      .where(
        // Only diseases that carry at least one of the person's phenotypes are
        // worth loading; `breadth` then comes from the same rows.
        inArray(
          hkbAnnotations.diseaseId,
          db
            .selectDistinct({ diseaseId: hkbAnnotations.diseaseId })
            .from(hkbAnnotations)
            .where(inArray(hkbAnnotations.hpoId, ids)),
        ),
      );
    const ranked = rankByPhenotype(ids, annotated);
    const byDisease = new Map<string, { id: string; name: string }>();
    for (const c of ring2Named)
      if (c.mondoId) byDisease.set(c.mondoId, { id: c.id, name: c.name });
    const xrefRows = await db
      .select({ id: hkbTerms.id, xrefs: hkbTerms.xrefs })
      .from(hkbTerms)
      .where(eq(hkbTerms.ontology, "MONDO"));
    const mondoOf = new Map<string, string>();
    for (const t of xrefRows)
      for (const x of t.xrefs ?? []) {
        const did = x.replace("Orphanet:", "ORPHA:");
        if (!mondoOf.has(did)) mondoOf.set(did, t.id);
      }

    let taken = 0;
    for (const match of ranked) {
      if (taken >= 3) break;
      const mondoId = mondoOf.get(match.diseaseId);
      if (!mondoId) continue;
      const row = await ensureRing2(mondoId);
      if (!row || row.ring !== 2) continue;
      if (already.get(row.id)?.status === "dismissed") continue;
      if (already.get(row.id)?.status === "awake") {
        taken++;
        continue;
      }
      const woken = await wake(userId, row.id, "phenotype", {
        score: match.score,
        matched: match.matched,
        breadth: match.breadth,
        diseaseId: match.diseaseId,
        because: out.phenotypes
          .filter((p) => match.matched.includes(p.hpoId))
          .map((p) => p.because),
      });
      if (woken?.isNew) out.woke.push(woken);
      taken++;
    }
  }

  /* 5b. the auto-dismiss half of trigger 5 */
  const byId = new Map(scored.map((h) => [h.id, h]));
  for (const [conditionId, row] of already) {
    if (row.status !== "awake" || row.trigger !== "user") continue;
    const h = byId.get(conditionId);
    if (!h || h.score >= AUTO_DISMISS_BELOW) continue;
    if (h.missing.length) continue; // its questions are not all answered yet
    await dismiss(
      userId,
      conditionId,
      `Asked for, scored ${(h.score * 100).toFixed(2)} % once its questions were answered, and put back to sleep.`,
    );
    out.dismissed.push(conditionId);
  }

  return out;
}

/**
 * Did ring 1 fail to explain something? True when the person has an off marker
 * that no ring-1 condition at "possible" or better reads.
 */
export function unresolved(m: ModelInput, scored: HypothesisResult[]): boolean {
  const explained = new Set<string>();
  for (const h of scored)
    if (h.score >= EXPLAINED)
      for (const line of h.for) explained.add(line.input);
  return Object.entries(m.latest).some(
    ([code, v]) => v.status === "red" && !explained.has(code),
  );
}

/** Everything one person has awake, newest first, for /brain and the ledger. */
export async function wokenRows(userId: string) {
  return getDb()
    .select({
      conditionId: userConditions.conditionId,
      name: hkbConditions.name,
      ring: hkbConditions.ring,
      trigger: userConditions.trigger,
      triggerDetail: userConditions.triggerDetail,
      status: userConditions.status,
      note: userConditions.note,
      ringWokenAt: userConditions.ringWokenAt,
    })
    .from(userConditions)
    .innerJoin(hkbConditions, eq(hkbConditions.id, userConditions.conditionId))
    .where(eq(userConditions.userId, userId))
    .orderBy(sql`${userConditions.ringWokenAt} desc`);
}
