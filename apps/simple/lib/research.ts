/**
 * Papers into proposed likelihood ratios.
 *
 * Europe PMC is searched for reviews, meta-analyses and guidelines that put a
 * number on how well a feature discriminates a condition; one `generateObject`
 * call reads five abstracts at a time and pulls the numbers out with a
 * verbatim quote; the DOI is resolved back through Europe PMC before anything
 * is written; and what lands in `hkb_evidence` is `status = "proposed"` for a
 * human to accept on /hkb. Nothing here can make the engine score differently
 * on its own.
 *
 * ponytail: no HTTP client, no retry framework, no queue. `fetch`, one
 * `URLSearchParams`, and the two REST endpoints below. Everything except
 * `researchCondition`'s network and LLM calls is pure and tested offline
 * against `evals/fixtures/hkb/research-europepmc.json`.
 */
import { generateObject } from "ai";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  hkbConditionTests,
  hkbConditions,
  hkbEvidence,
  hkbFeatures,
  hkbInterventions,
  hkbTests,
} from "@/db";
import { model } from "./extract";
import { dueAgain } from "./hkb-import";
import { decide, statusOf, type PolicyInput } from "./hkb-policy";
import type { Grade } from "./hypotheses";
import { normalizeName } from "./merge-metrics";

const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
const S2 = "https://api.semanticscholar.org/graph/v1/paper/search";

/** How far back a diagnostic-accuracy number is still worth reading. */
const YEARS = 15;

/** Abstracts per `generateObject` call. Five keeps the prompt honest and cheap. */
export const BATCH = 5;

/** The run stops when the estimated prompt+completion tokens pass this. */
export const TOKEN_BUDGET = 200_000;

/* ── the shapes ───────────────────────────────────────────────────────── */

export interface Paper {
  pmid: string | null;
  doi: string | null;
  title: string;
  journal: string | null;
  year: number | null;
  /** "Zulewski H, Muller B, Exer P." as Europe PMC writes it. */
  authors: string;
  citedBy: number;
  url: string;
  abstract: string;
  /** Europe PMC's retraction flag, or a Crossref retraction update. */
  retracted?: boolean;
}

export interface Feature {
  id: string;
  name: string;
  unit: string | null;
}

export interface ConditionRef {
  id: string;
  name: string;
  /** Out of the catalog means out of the engine: the policy rejects its rows. */
  inCatalog?: boolean;
}

/** One thing the model claims a paper says. */
export interface Finding {
  paperIndex: number;
  feature: string;
  featureId?: string | null;
  condition: string;
  direction: "present" | "absent" | "above" | "below";
  threshold?: number | null;
  unit?: string | null;
  lrPos?: number | null;
  lrNeg?: number | null;
  sensitivity?: number | null;
  specificity?: number | null;
  population: string;
  n?: number | null;
  studyType: StudyType;
  quote: string;
}

/** Every kind of study the grades in `ROADMAP.md` principle 2 distinguish. */
export const STUDY_TYPES = [
  "meta",
  "guideline",
  "rct",
  "cohort",
  "cross_sectional",
  "case_control",
  "case_series",
  "case_report",
  "n_of_1",
  "self_experiment",
  "animal",
  "in_vitro",
  "computational",
  "other",
] as const;

export type StudyType = (typeof STUDY_TYPES)[number];

export interface Proposal {
  id: string;
  conditionId: string;
  featureId: string;
  conditionOn: Record<string, unknown>;
  lrPos: number;
  lrNeg: number | null;
  grade: string;
  source: string;
  population: string | null;
  status: string;
  /** The policy let it score and still wants a human to look at it. */
  needsLook: boolean;
  paper: {
    pmid: string | null;
    doi: string | null;
    title: string;
    year: number | null;
    journal: string | null;
    url: string;
    quote: string;
  };
}

export interface RunCounts {
  hits: number;
  papers: number;
  verified: number;
  extracted: number;
  proposed: number;
  /** Of `proposed`, the ones the policy would not let score. */
  rejected: number;
  /** Of `proposed`, the ones flagged for a human to look at. */
  needsLook: number;
  /** New `hkb_features` rows the run had to invent. */
  minted: number;
  /** Rows written to `hkb_interventions`, established and horizon together. */
  interventions: number;
  skipped: number;
  unmapped: number;
  tokens: number;
}

/* ── the search ───────────────────────────────────────────────────────── */

const ACCURACY =
  '("likelihood ratio" OR "sensitivity" OR "specificity" OR "diagnostic accuracy")';
const TYPES =
  '(PUB_TYPE:"review" OR PUB_TYPE:"meta-analysis" OR PUB_TYPE:"guideline")';

/** One Europe PMC query per feature the condition reads or could read. */
export function buildQueries(
  condition: string,
  features: Feature[],
  now = new Date(),
): string[] {
  const to = now.getFullYear();
  const dates = `(FIRST_PDATE:[${to - YEARS}-01-01 TO ${to}-12-31])`;
  return features.map(
    (f) =>
      `"${condition}" AND ${ACCURACY} AND ("${f.name}") AND ${TYPES} AND ${dates}`,
  );
}

interface EpmcHit {
  pubTypeList?: { pubType?: string[] };
  pmid?: string;
  doi?: string;
  title?: string;
  journalTitle?: string;
  pubYear?: string;
  authorString?: string;
  citedByCount?: number;
  abstractText?: string;
}

/** Europe PMC, or nothing at all: a search that fails is not worth a retry. */
export async function epmc(
  query: string,
  resultType: "lite" | "core",
  pageSize = 25,
): Promise<EpmcHit[]> {
  const url = `${EPMC}?${new URLSearchParams({
    query,
    format: "json",
    resultType,
    pageSize: String(pageSize),
  })}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      resultList?: { result?: EpmcHit[] };
    };
    return data.resultList?.result ?? [];
  } catch (e) {
    console.error("[research] europe pmc failed:", e);
    return [];
  }
}

/**
 * Europe PMC keeps the publisher's markup in the title, so "HbA1c" arrives as
 * `HbA&lt;sub&gt;1c&lt;/sub&gt;`. Entities first, then tags, then the trailing
 * full stop nobody wants in a link.
 */
export const cleanTitle = (raw: string): string =>
  raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");

/** "Retracted Publication" in the type list, whichever way it is spelled. */
export const isRetracted = (types: string[] | undefined): boolean =>
  (types ?? []).some((t) => /retract/i.test(t));

export const toPaper = (h: EpmcHit): Paper => ({
  retracted: isRetracted(h.pubTypeList?.pubType),
  pmid: h.pmid ?? null,
  doi: h.doi ?? null,
  title: cleanTitle(h.title ?? ""),
  journal: h.journalTitle ?? null,
  year: h.pubYear ? Number(h.pubYear) : null,
  authors: h.authorString ?? "",
  citedBy: h.citedByCount ?? 0,
  url: h.doi
    ? `https://doi.org/${h.doi}`
    : h.pmid
      ? `https://europepmc.org/article/MED/${h.pmid}`
      : "",
  abstract: h.abstractText ?? "",
});

/** DOI first, then PMID, then the title: one paper is one row. */
export const keyOf = (p: {
  doi: string | null;
  pmid: string | null;
  title: string;
}) => p.doi?.toLowerCase() ?? p.pmid ?? p.title.toLowerCase();

export function dedupe(papers: Paper[]): Paper[] {
  const seen = new Map<string, Paper>();
  for (const p of papers) {
    const key = keyOf(p);
    const found = seen.get(key);
    if (!found || found.citedBy < p.citedBy) seen.set(key, p);
  }
  return [...seen.values()];
}

/**
 * Semantic Scholar, only for the citation counts Europe PMC does not carry.
 * The keyless API answers 429 most of the time, and that is fine: the run
 * loses a sort key, not a paper.
 */
export async function semanticScholar(query: string): Promise<Paper[]> {
  const url = `${S2}?${new URLSearchParams({
    query,
    limit: "25",
    fields: "title,year,venue,abstract,citationCount,externalIds",
  })}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: {
        title?: string;
        year?: number;
        venue?: string;
        abstract?: string;
        citationCount?: number;
        externalIds?: { DOI?: string; PubMed?: string };
      }[];
    };
    return (data.data ?? []).map((p) => ({
      pmid: p.externalIds?.PubMed ?? null,
      doi: p.externalIds?.DOI ?? null,
      title: cleanTitle(p.title ?? ""),
      journal: p.venue ?? null,
      year: p.year ?? null,
      authors: "",
      citedBy: p.citationCount ?? 0,
      url: p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : "",
      abstract: p.abstract ?? "",
    }));
  } catch {
    return [];
  }
}

/** The abstracts Europe PMC's `lite` answer leaves out, 25 ids at a time. */
export async function withAbstracts(papers: Paper[]): Promise<Paper[]> {
  const ids = papers.map((p) => p.pmid).filter((id): id is string => !!id);
  const abstracts = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const core = await epmc(
      batch.map((id) => `EXT_ID:${id}`).join(" OR "),
      "core",
      batch.length,
    );
    for (const h of core) abstracts.set(h.pmid ?? "", h.abstractText ?? "");
  }
  return papers
    .map((p) => ({
      ...p,
      abstract: p.abstract || abstracts.get(p.pmid ?? "") || "",
    }))
    .filter((p) => p.abstract.length > 200);
}

/**
 * How many diagnostic-accuracy numbers an abstract actually carries.
 *
 * Europe PMC matches "sensitivity" anywhere in a paper, and "insulin
 * sensitivity" is not a likelihood ratio. Ranking the candidates by the
 * phrases that only appear next to a real number is what stops the run
 * spending its token budget on association meta-analyses.
 */
export const quantified = (paper: Paper): number =>
  (
    paper.abstract.match(
      /likelihood ratio|sensitivit(?:y|ies) of |specificit(?:y|ies) of |predictive value|diagnostic accuracy|diagnostic odds|area under the (?:receiver|curve|roc)|\bAUROC\b|\bAUC\b|\bROC\b|cut-?off|c-statistic/gi,
    ) ?? []
  ).length;

/* ── the verification ─────────────────────────────────────────────────── */

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Two titles are the same paper when one contains the other's first 60 chars. */
export function titleMatches(a: string, b: string): boolean {
  const [x, y] = [normalise(a), normalise(b)];
  if (!x || !y) return false;
  return x.startsWith(y.slice(0, 60)) || y.startsWith(x.slice(0, 60));
}

/**
 * The DOI back through Europe PMC, with the title as the check. A paper whose
 * DOI resolves to nothing, or to a different title, does not get to propose a
 * likelihood ratio.
 */
export async function verify(paper: Paper): Promise<Paper | null> {
  if (!paper.doi) return null;
  const [hit] = await epmc(`DOI:"${paper.doi}"`, "lite", 1);
  if (!hit?.title || !titleMatches(paper.title, hit.title)) return null;
  return {
    ...paper,
    retracted: paper.retracted || isRetracted(hit.pubTypeList?.pubType),
    pmid: hit.pmid ?? paper.pmid,
    title: cleanTitle(hit.title ?? paper.title),
    journal: hit.journalTitle ?? paper.journal,
    year: hit.pubYear ? Number(hit.pubYear) : paper.year,
    authors: hit.authorString || paper.authors,
    url: `https://doi.org/${paper.doi}`,
  };
}

/* ── the extraction ───────────────────────────────────────────────────── */

const findingSchema = z.object({
  /** Which of the numbered abstracts this came from; 1-based. */
  paperIndex: z.number(),
  feature: z.string(),
  featureId: z.string().nullish(),
  condition: z.string(),
  direction: z.enum(["present", "absent", "above", "below"]),
  threshold: z.number().nullish(),
  unit: z.string().nullish(),
  lrPos: z.number().nullish(),
  lrNeg: z.number().nullish(),
  sensitivity: z.number().nullish(),
  specificity: z.number().nullish(),
  population: z.string(),
  n: z.number().nullish(),
  studyType: z.enum(STUDY_TYPES),
  quote: z.string(),
});

export const extractionSchema = z.object({ items: z.array(findingSchema) });

export const EXTRACT_PROMPT = `You read medical abstracts and pull out the numbers that say how well a
feature discriminates a condition. Report only what the abstract itself states
or what follows from its own numbers. Never estimate, never fill a gap from
your own knowledge, and never round a number the abstract does not give.

Rules:
- One item per (feature, condition, cut-off) the abstract quantifies. No item at
  all is the right answer for an abstract that quantifies nothing.
- \`quote\` must be a verbatim span copied from that abstract, with the number in it.
- \`paperIndex\` is the number of the abstract the item came from.
- \`direction\`: "above"/"below" for a numeric cut-off (set \`threshold\` and \`unit\`),
  "present"/"absent" for a symptom, sign or answer.
- Map \`featureId\` to one of the listed catalog feature ids when the feature is
  clearly the same thing. Leave it null otherwise; do not force a match.
- Give sensitivity and specificity as fractions between 0 and 1.`;

export const featureList = (features: Feature[]) =>
  features
    .map((f) => `${f.id} | ${f.name}${f.unit ? ` (${f.unit})` : ""}`)
    .join("\n");

/** Roughly four characters to the token, plus the standing prompt. */
export const estimateTokens = (papers: Paper[], features: Feature[]): number =>
  Math.round(
    (papers.reduce((n, p) => n + p.abstract.length + p.title.length, 0) +
      Math.ceil(papers.length / BATCH) *
        (EXTRACT_PROMPT.length + featureList(features).length)) /
      4,
  ) * 2;

export interface Extractor {
  (
    papers: Paper[],
    condition: ConditionRef,
    features: Feature[],
  ): Promise<{ items: Finding[]; tokens: number }>;
}

/** Five abstracts, one call, one list of findings. The only LLM in the file. */
export const llmExtract =
  (modelId?: string): Extractor =>
  async (papers, condition, features) => {
    const numbered = papers
      .map(
        (p, i) =>
          `[${i + 1}] ${p.title} (${p.journal ?? "?"} ${p.year ?? "?"})\n${p.abstract}`,
      )
      .join("\n\n");
    const { object, usage } = await generateObject({
      model: model(modelId),
      schema: extractionSchema,
      system: EXTRACT_PROMPT,
      prompt:
        `Condition: ${condition.name} (id ${condition.id}).\n\n` +
        `CATALOG FEATURES (id | name):\n${featureList(features)}\n\n` +
        `ABSTRACTS:\n${numbered}`,
    });
    return {
      items: object.items as Finding[],
      tokens: usage?.totalTokens ?? 0,
    };
  };

/* ── the arithmetic ───────────────────────────────────────────────────── */

/** A percentage the model wrote as 85 instead of 0.85. */
const asFraction = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v)
    ? null
    : v > 1 && v <= 100
      ? v / 100
      : v > 0 && v <= 1
        ? v
        : null;

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * The likelihood ratios, from the paper when it gives them and from
 * sensitivity and specificity when it does not. Null when neither is there or
 * the arithmetic runs off the end (specificity of exactly 1).
 */
export function likelihoodRatios(f: Finding): {
  lrPos: number;
  lrNeg: number | null;
} | null {
  const sens = asFraction(f.sensitivity);
  const spec = asFraction(f.specificity);
  let lrPos = f.lrPos ?? null;
  let lrNeg = f.lrNeg ?? null;
  if (lrPos == null && sens != null && spec != null && spec < 1)
    lrPos = sens / (1 - spec);
  if (lrNeg == null && sens != null && spec != null && spec > 0)
    lrNeg = (1 - sens) / spec;
  if (lrPos == null || !Number.isFinite(lrPos) || lrPos <= 0) return null;
  if (lrPos > 1000) return null;
  return {
    lrPos: round(lrPos),
    lrNeg:
      lrNeg != null && Number.isFinite(lrNeg) && lrNeg > 0 && lrNeg < 1000
        ? round(lrNeg)
        : null,
  };
}

const LADDER: Grade[] = ["A", "B", "C", "D", "E"];

/** One step down the ladder, and never off the end of it. */
export const downgrade = (g: Grade, steps = 1): Grade =>
  LADDER[Math.min(LADDER.indexOf(g) + steps, LADDER.length - 1)]!;

/** The worse of two grades. */
export const worst = (a: Grade, b: Grade): Grade =>
  LADDER.indexOf(a) >= LADDER.indexOf(b) ? a : b;

/** What the paper's own quality says, before anything is taken off it. */
export function baseGrade(f: Finding): Grade {
  const n = f.n ?? 0;
  switch (f.studyType) {
    case "meta":
    case "guideline":
      return "A";
    case "rct":
      return "B";
    case "cohort":
    case "cross_sectional":
      return n >= 500 ? "B" : "C";
    case "case_series":
      return n > 0 && n <= 10 ? "D" : "C";
    case "case_report":
    case "n_of_1":
    case "self_experiment":
      return "D";
    case "animal":
    case "in_vitro":
    case "computational":
      return "E";
    default:
      return "C";
  }
}

/** What the paper around a finding can take off its grade. */
export interface GradeContext {
  /** Semantic Scholar's citation count, when we have one. */
  citedBy?: number;
  year?: number | null;
  /** The DOI resolved back to the same paper. */
  resolved?: boolean;
  /** The venue is one Semantic Scholar knows. */
  venueKnown?: boolean;
  /** The year the run happens in, so the test does not move in January. */
  thisYear?: number;
}

/**
 * The grade, with the four downgrades of the spec applied: a DOI that did not
 * resolve caps the row at C, a paper with no citations after three years drops
 * a step, and so does a venue Semantic Scholar has never heard of. A retracted
 * paper is not downgraded here; the policy drops it whole.
 */
export function gradeOf(f: Finding, ctx: GradeContext = {}): Grade {
  let grade = baseGrade(f);
  if (ctx.resolved === false) grade = worst(grade, "C");
  const year = ctx.year ?? null;
  const thisYear = ctx.thisYear ?? new Date().getFullYear();
  if (ctx.citedBy === 0 && year != null && thisYear - year > 3)
    grade = downgrade(grade);
  if (ctx.venueKnown === false) grade = downgrade(grade);
  return grade;
}

/** "Journal of Clinical Endocrinology & Metabolism" and "J Clin Endocrinol Metab". */
const venueKey = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Which venues Semantic Scholar answered with. When it answered with nothing
 * at all — the keyless API is rate-limited most of the time — no paper is
 * punished for an index that was not there.
 */
export const venueIndex = (papers: Paper[]) => {
  const known = new Set(
    papers.map((p) => venueKey(p.journal ?? "")).filter(Boolean),
  );
  return (journal: string | null): boolean =>
    known.size === 0 || (!!journal && known.has(venueKey(journal)));
};

const numeric = (featureId: string) =>
  featureId.startsWith("metric:") || featureId.startsWith("derived:");

/**
 * direction + threshold as the `when` the engine already reads.
 *
 * A paper that reports "a positive anti-tTG IgA had a sensitivity of 0.93"
 * gives no cut-off, because "positive" means the lab's own reference range.
 * That is exactly what `status: "red"` reads, so the rule says it rather than
 * inventing a threshold the paper never printed.
 */
export function conditionOn(
  featureId: string,
  f: Finding,
): Record<string, unknown> | null {
  if (numeric(featureId)) {
    if (f.threshold != null && (f.direction === "above" || f.direction === "below"))
      return { [f.direction]: f.threshold };
    // "raised", "positive": out of range, with no number of its own.
    if (f.direction === "above" || f.direction === "present")
      return { status: "red" };
    return null;
  }
  if (f.direction === "above" || f.direction === "below") return null;
  return { equals: f.direction === "present" ? "Yes" : "No" };
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** `res_hashimoto_metric_tsh_pm12345678`, stable across runs. */
export const proposalId = (
  conditionId: string,
  featureId: string,
  paper: Paper,
) =>
  `res_${conditionId}_${slug(featureId)}_${slug(
    paper.pmid ?? paper.doi ?? paper.title.slice(0, 20),
  )}`.slice(0, 120);

/** "Zulewski 1997 J Clin Endocrinol Metab; doi:10.1210/…; quote: "…"" */
export const sourceLine = (paper: Paper, quote: string, n?: number | null) =>
  [
    `${paper.authors.split(",")[0]?.trim() || "anonymous"} ${paper.year ?? "n.d."} ${paper.journal ?? "unknown journal"}`,
    paper.doi ? `doi:${paper.doi}` : `pmid:${paper.pmid ?? "none"}`,
    ...(n != null && n > 0 ? [`n = ${n}`] : []),
    `quote: "${quote.replace(/\s+/g, " ").trim()}"`,
  ].join("; ");

/** The test classes the minted cost table knows, cheapest first. */
const TEST_CLASS: { cost: number; words: RegExp }[] = [
  { cost: 1, words: /antibod|antigen|serolog|igg|iga|igm|titre|titer/i },
  {
    cost: 3,
    words: /ultrasound|mri|ct\b|scan|elastograph|imaging|dexa|echocardio|x-?ray|densitometr/i,
  },
  { cost: 4, words: /biopsy|endoscop|colonoscop|catheter|puncture|aspirat/i },
];

/** serology 1, imaging 3, invasive 4, everything else special chemistry 2. */
export const testCost = (name: string): number =>
  TEST_CLASS.find((c) => c.words.test(name))?.cost ?? 2;

/**
 * The feature id a name would mint as. The curator's metric-identity
 * normaliser runs first, so "Anti-endomysial antibodies" and "EmA IgA"
 * collapse onto one id instead of two.
 */
export const mintedId = (name: string) => `metric:${normalizeName(name)}`;

/** A feature the extractor asked for that the catalog does not carry yet. */
export interface Mint {
  id: string;
  name: string;
  unit: string;
  doi: string | null;
  lrPos: number;
  lrNeg: number | null;
}

/**
 * Findings plus their papers into rows `hkb_evidence` will take, each one
 * already judged by `lib/hkb-policy`. A feature the catalog does not carry is
 * minted rather than dropped, so a paper about a marker nobody thought of
 * still lands.
 */
export function toProposals(
  condition: ConditionRef,
  features: Feature[],
  papers: Paper[],
  findings: Finding[],
  opts: { inCatalog?: boolean; venueKnown?: (j: string | null) => boolean } = {},
): {
  rows: Proposal[];
  mints: Mint[];
  unmapped: number;
  skipped: number;
  rejected: number;
} {
  const known = new Map(features.map((f) => [f.id, f]));
  const byName = new Map(features.map((f) => [normalizeName(f.name), f]));
  const rows = new Map<string, Proposal>();
  const mints = new Map<string, Mint>();
  let unmapped = 0;
  let skipped = 0;
  let rejected = 0;

  for (const f of findings) {
    const paper = papers[f.paperIndex - 1];
    if (!paper) {
      skipped++;
      continue;
    }

    // The catalog id the model picked, then the same analyte under another
    // name, then a new id minted from the paper.
    const named = f.feature?.trim() ? byName.get(normalizeName(f.feature)) : undefined;
    const mintable = !!f.feature?.trim() && !!f.unit?.trim();
    const featureId =
      (f.featureId && known.has(f.featureId) ? f.featureId : null) ??
      named?.id ??
      (mintable ? mintedId(f.feature) : null);
    if (!featureId) {
      unmapped++;
      continue;
    }

    const on = conditionOn(featureId, f);
    const lr = likelihoodRatios(f);
    if (!on || !lr || !f.quote?.trim()) {
      skipped++;
      continue;
    }

    const grade = gradeOf(f, {
      citedBy: paper.citedBy,
      year: paper.year,
      resolved: !!paper.doi,
      venueKnown: opts.venueKnown ? opts.venueKnown(paper.journal) : undefined,
    });

    const policy: PolicyInput = {
      conditionId: condition.id,
      featureId: known.has(featureId) || named ? featureId : null,
      featureName: f.feature,
      featureUnit: f.unit,
      targetUnit: known.get(featureId)?.unit ?? named?.unit ?? null,
      conditionOn: on,
      lrPos: lr.lrPos,
      lrNeg: lr.lrNeg,
      grade,
      quote: f.quote,
      numbers: [f.lrPos, f.lrNeg, f.sensitivity, f.specificity, f.threshold],
      retracted: paper.retracted,
      conditionInCatalog: opts.inCatalog ?? true,
    };
    const decision = decide(policy);
    if (decision === "rejected") rejected++;

    if (decision !== "rejected" && !known.has(featureId) && !named)
      mints.set(featureId, {
        id: featureId,
        name: f.feature.trim(),
        unit: f.unit!.trim(),
        doi: paper.doi,
        lrPos: lr.lrPos,
        lrNeg: lr.lrNeg,
      });

    const id = proposalId(condition.id, featureId, paper);
    rows.set(`${featureId}|${JSON.stringify(on)}`, {
      id,
      conditionId: condition.id,
      featureId,
      conditionOn: on,
      lrPos: lr.lrPos,
      lrNeg: lr.lrNeg,
      grade,
      source: sourceLine(paper, f.quote, f.n),
      population: f.population || null,
      ...statusOf(decision),
      paper: {
        pmid: paper.pmid,
        doi: paper.doi,
        title: paper.title,
        year: paper.year,
        journal: paper.journal,
        url: paper.url,
        quote: f.quote.replace(/\s+/g, " ").trim(),
      },
    });
  }
  return {
    rows: [...rows.values()],
    mints: [...mints.values()],
    unmapped,
    skipped,
    rejected,
  };
}

/* ── one condition, end to end ────────────────────────────────────────── */

export interface ResearchOptions {
  maxPapers?: number;
  /** Injected by the test so the whole pipeline runs offline. */
  extract?: Extractor;
  /** How many tokens the whole run has already spent. */
  spent?: number;
  modelId?: string;
  /** Printed before the LLM is called at all. */
  onEstimate?: (tokens: number, papers: number) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Search, extract, derive, verify, and hand back rows nobody has accepted yet.
 * No database: `saveProposals` is the only thing here that writes.
 */
export async function researchCondition(
  condition: ConditionRef,
  features: Feature[],
  options: ResearchOptions = {},
): Promise<{ rows: Proposal[]; mints: Mint[]; counts: RunCounts }> {
  const maxPapers = options.maxPapers ?? 20;
  const extract = options.extract ?? llmExtract(options.modelId);

  const found: Paper[] = [];
  for (const query of buildQueries(condition.name, features))
    found.push(...(await epmc(query, "lite")).map(toPaper));
  const s2 = await semanticScholar(
    `${condition.name} diagnostic accuracy likelihood ratio`,
  );
  found.push(...s2);
  const venueKnown = venueIndex(s2);

  // Europe PMC answers in relevance order, one query at a time, so the
  // candidates keep the order the searches returned them; sorting by citations
  // here would put the most-cited off-topic review on top. What does reorder
  // them is whether the abstract carries an accuracy number at all, because
  // the ones that do not cost tokens and return nothing.
  const hits = found.length;
  const candidates = await withAbstracts(dedupe(found).slice(0, 50));
  const papers = candidates
    .map((p, i) => ({ p, i, q: quantified(p) }))
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .slice(0, maxPapers)
    .map((x) => x.p);

  const verified: Paper[] = [];
  for (const p of papers) {
    const ok = await verify(p);
    if (ok) verified.push(ok);
  }

  const estimate = estimateTokens(verified, features);
  options.onEstimate?.(estimate, verified.length);
  if ((options.spent ?? 0) + estimate > TOKEN_BUDGET)
    return {
      rows: [],
      mints: [],
      counts: {
        hits,
        papers: papers.length,
        verified: verified.length,
        extracted: 0,
        proposed: 0,
        rejected: 0,
        needsLook: 0,
        minted: 0,
        interventions: 0,
        skipped: 0,
        unmapped: 0,
        tokens: 0,
      },
    };

  const findings: Finding[] = [];
  let tokens = 0;
  for (let i = 0; i < verified.length; i += BATCH) {
    const batch = verified.slice(i, i + BATCH);
    const out = await extract(batch, condition, features);
    tokens += out.tokens;
    // paperIndex is 1-based inside the batch; make it 1-based over the run.
    for (const item of out.items)
      findings.push({ ...item, paperIndex: i + item.paperIndex });
    if (i + BATCH < verified.length) await sleep(200);
  }

  const { rows, mints, unmapped, skipped, rejected } = toProposals(
    condition,
    features,
    verified,
    findings,
    { inCatalog: condition.inCatalog ?? true, venueKnown },
  );
  return {
    rows,
    mints,
    counts: {
      hits,
      papers: papers.length,
      verified: verified.length,
      extracted: findings.length,
      proposed: rows.length,
      rejected,
      needsLook: rows.filter((r) => r.needsLook).length,
      minted: mints.length,
      interventions: 0,
      skipped,
      unmapped,
      tokens,
    },
  };
}

/* ── the database ─────────────────────────────────────────────────────── */

/** The features a condition already reads, plus the ones its tests would write. */
export async function featuresFor(conditionId: string): Promise<Feature[]> {
  const db = getDb();
  const [rules, tests, all] = await Promise.all([
    db
      .select({ featureId: hkbEvidence.featureId })
      .from(hkbEvidence)
      .where(eq(hkbEvidence.conditionId, conditionId)),
    db
      .select({ featureIds: hkbTests.featureIds })
      .from(hkbConditionTests)
      .innerJoin(hkbTests, eq(hkbTests.id, hkbConditionTests.testId))
      .where(eq(hkbConditionTests.conditionId, conditionId)),
    db.select().from(hkbFeatures).orderBy(asc(hkbFeatures.id)),
  ]);

  const wanted = new Set(rules.map((r) => r.featureId));
  for (const t of tests)
    for (const code of t.featureIds ?? []) wanted.add(`metric:${code}`);

  return all
    .filter((f) => wanted.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, unit: f.unit }));
}

/** The conditions with the least evidence behind them, thinnest first. */
export async function thinnestConditions(n: number): Promise<ConditionRef[]> {
  const rows = await getDb()
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      n: sql<number>`(
        select count(*)::int from hkb_evidence e
        where e.condition_id = ${hkbConditions.id}
          and e.status in ('seed', 'accepted')
      )`,
    })
    .from(hkbConditions)
    .where(eq(hkbConditions.inCatalog, true))
    .orderBy(
      sql`(select count(*)::int from hkb_evidence e where e.condition_id = ${hkbConditions.id} and e.status in ('seed','accepted')) asc`,
      asc(hkbConditions.id),
    )
    .limit(n);
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * The rows, minus any (condition, feature, condition_on) the table already
 * carries in any status. `on conflict do nothing` covers the race; this covers
 * the count.
 */
export async function saveProposals(
  conditionId: string,
  rows: Proposal[],
  mints: Mint[] = [],
): Promise<{ written: number; minted: number }> {
  if (!rows.length) return { written: 0, minted: 0 };
  const db = getDb();
  const existing = await db
    .select({
      featureId: hkbEvidence.featureId,
      conditionOn: hkbEvidence.conditionOn,
      lrPos: hkbEvidence.lrPos,
      status: hkbEvidence.status,
    })
    .from(hkbEvidence)
    .where(eq(hkbEvidence.conditionId, conditionId));

  const keyOfRow = (featureId: string, on: unknown) =>
    `${featureId}|${JSON.stringify(on)}`;
  const seen = new Set(
    existing.map((e) => keyOfRow(e.featureId, e.conditionOn)),
  );
  const peers = new Map<string, number[]>();
  for (const e of existing) {
    if (e.status !== "seed" && e.status !== "accepted") continue;
    const key = keyOfRow(e.featureId, e.conditionOn);
    peers.set(key, [...(peers.get(key) ?? []), e.lrPos]);
  }

  const fresh = rows.filter(
    (r) => !seen.has(keyOfRow(r.featureId, r.conditionOn)),
  );
  if (!fresh.length) return { written: 0, minted: 0 };

  // The features the run invented have to exist before a rule can point at
  // them, and only for the rows that survived.
  const wanted = new Set(fresh.map((r) => r.featureId));
  const minted = mints.filter((m) => wanted.has(m.id));
  for (const m of minted) {
    await db
      .insert(hkbFeatures)
      .values({
        id: m.id,
        kind: "lab",
        name: m.name,
        unit: m.unit,
        howTo: null,
        mintedFrom: m.doi,
      })
      .onConflictDoNothing();
    const code = m.id.slice("metric:".length);
    await db
      .insert(hkbTests)
      .values({
        id: code,
        name: m.name,
        featureIds: [code],
        cost: testCost(m.name),
        lrPos: m.lrPos,
        lrNeg: m.lrNeg ?? 1,
      })
      .onConflictDoNothing();
  }

  // The peers only exist once the table has been read, so the "two verified
  // rows disagree by more than 3x" branch of the policy is settled here.
  const judged = fresh.map((r) => {
    const known = peers.get(keyOfRow(r.featureId, r.conditionOn)) ?? [];
    if (r.status === "rejected" || !known.length) return r;
    const decision = decide({
      conditionId: r.conditionId,
      featureId: r.featureId,
      conditionOn: r.conditionOn,
      lrPos: r.lrPos,
      lrNeg: r.lrNeg,
      grade: r.grade as Grade,
      quote: r.paper.quote,
      conditionInCatalog: true,
      peers: known,
    });
    return { ...r, ...statusOf(decision) };
  });

  const written = await db
    .insert(hkbEvidence)
    .values(judged)
    .onConflictDoNothing()
    .returning({ id: hkbEvidence.id });
  return { written: written.length, minted: minted.length };
}

/* ── what might help ──────────────────────────────────────────────────── */

const HELP = "(treatment OR supplementation OR intervention)";
const TRIALS = '(randomized OR "meta-analysis")';
const HORIZON = '(case report OR pilot OR "n-of-1" OR animal OR mice OR "in vitro")';

/** How far back each of the two intervention searches looks. */
export const INTERVENTION_YEARS = 15;
export const HORIZON_YEARS = 3;

/** The two queries that ask what helps, rather than what discriminates. */
export function interventionQueries(
  condition: string,
  now = new Date(),
): { kind: "intervention" | "horizon"; query: string }[] {
  const to = now.getFullYear();
  const dates = (years: number) =>
    `(FIRST_PDATE:[${to - years}-01-01 TO ${to}-12-31])`;
  return [
    {
      kind: "intervention",
      query: `"${condition}" AND ${HELP} AND ${TRIALS} AND ${dates(INTERVENTION_YEARS)}`,
    },
    {
      kind: "horizon",
      query: `"${condition}" AND ${HELP} AND ${TRIALS} AND ${HORIZON} AND ${dates(HORIZON_YEARS)}`,
    },
  ];
}

const interventionSchema = z.object({
  paperIndex: z.number(),
  intervention: z.string(),
  dose: z.string().nullish(),
  duration: z.string().nullish(),
  outcomeFeature: z.string().nullish(),
  effectSize: z.string().nullish(),
  direction: z.enum(["up", "down", "none"]),
  population: z.string(),
  studyType: z.enum(STUDY_TYPES),
  quote: z.string(),
});

export const interventionExtraction = z.object({
  items: z.array(interventionSchema),
});

export type InterventionFinding = z.infer<typeof interventionSchema>;

export const INTERVENTION_PROMPT = `You read medical abstracts and pull out what was given to people and what
changed because of it. Report only what the abstract itself states.

Rules:
- One item per (intervention, outcome) the abstract reports. No item at all is
  the right answer for an abstract that gave nobody anything.
- \`quote\` must be a verbatim span copied from that abstract, with the effect in it.
- \`paperIndex\` is the number of the abstract the item came from.
- \`dose\` and \`duration\` exactly as written ("200 ug/day", "12 weeks"), or null.
- \`outcomeFeature\` is the marker that moved, mapped to a listed catalog feature
  id when it clearly is the same thing, and null otherwise.
- \`direction\` is what happened to that marker: "up", "down", or "none" for a
  trial that found nothing.
- \`effectSize\` is the number with its unit, as the abstract prints it.`;

export interface InterventionExtractor {
  (
    papers: Paper[],
    condition: ConditionRef,
    features: Feature[],
  ): Promise<{ items: InterventionFinding[]; tokens: number }>;
}

export const llmInterventions =
  (modelId?: string): InterventionExtractor =>
  async (papers, condition, features) => {
    const numbered = papers
      .map(
        (p, i) =>
          `[${i + 1}] ${p.title} (${p.journal ?? "?"} ${p.year ?? "?"})\n${p.abstract}`,
      )
      .join("\n\n");
    const { object, usage } = await generateObject({
      model: model(modelId),
      schema: interventionExtraction,
      system: INTERVENTION_PROMPT,
      prompt:
        `Condition: ${condition.name} (id ${condition.id}).\n\n` +
        `CATALOG FEATURES (id | name):\n${featureList(features)}\n\n` +
        `ABSTRACTS:\n${numbered}`,
    });
    return { items: object.items, tokens: usage?.totalTokens ?? 0 };
  };

export interface InterventionRow {
  id: string;
  conditionId: string;
  name: string;
  dose: string | null;
  duration: string | null;
  outcomeFeatureId: string | null;
  effect: string | null;
  direction: string;
  grade: string;
  paper: Proposal["paper"];
  quote: string;
  status: string;
  population: string | null;
}

/**
 * Intervention findings into rows. The horizon search only ever produces D and
 * E: it went looking for case reports and mice on purpose, so a row out of it
 * never claims more than that.
 */
export function toInterventions(
  condition: ConditionRef,
  features: Feature[],
  papers: Paper[],
  findings: InterventionFinding[],
  kind: "intervention" | "horizon",
): InterventionRow[] {
  const known = new Set(features.map((f) => f.id));
  const rows = new Map<string, InterventionRow>();

  for (const f of findings) {
    const paper = papers[f.paperIndex - 1];
    if (!paper || paper.retracted) continue;
    if (!f.intervention?.trim() || !f.quote?.trim()) continue;

    const base = gradeOf(
      { studyType: f.studyType, n: null } as Finding,
      { citedBy: paper.citedBy, year: paper.year, resolved: !!paper.doi },
    );
    const grade =
      kind === "horizon" ? (base === "E" ? "E" : worst(base, "D")) : base;

    const outcome = f.outcomeFeature?.trim() ?? "";
    const id = `int_${condition.id}_${slug(f.intervention).slice(0, 40)}_${slug(
      paper.pmid ?? paper.doi ?? paper.title.slice(0, 20),
    )}`.slice(0, 120);

    rows.set(`${slug(f.intervention)}|${outcome}`, {
      id,
      conditionId: condition.id,
      name: f.intervention.trim(),
      dose: f.dose?.trim() || null,
      duration: f.duration?.trim() || null,
      outcomeFeatureId: known.has(outcome) ? outcome : null,
      effect: f.effectSize?.trim() || null,
      direction: f.direction,
      grade,
      paper: {
        pmid: paper.pmid,
        doi: paper.doi,
        title: paper.title,
        year: paper.year,
        journal: paper.journal,
        url: paper.url,
        quote: f.quote.replace(/\s+/g, " ").trim(),
      },
      quote: f.quote.replace(/\s+/g, " ").trim(),
      status: "accepted",
      population: f.population || null,
    });
  }
  return [...rows.values()];
}

/**
 * The two "what might help" searches for one condition. Same shape as
 * `researchCondition`: search, verify the DOIs, extract, hand back rows.
 */
export async function researchInterventions(
  condition: ConditionRef,
  features: Feature[],
  options: {
    maxPapers?: number;
    modelId?: string;
    extract?: InterventionExtractor;
    now?: Date;
  } = {},
): Promise<{ rows: InterventionRow[]; tokens: number }> {
  const maxPapers = options.maxPapers ?? 10;
  const extract = options.extract ?? llmInterventions(options.modelId);
  const out: InterventionRow[] = [];
  let tokens = 0;

  for (const { kind, query } of interventionQueries(
    condition.name,
    options.now,
  )) {
    const found = (await epmc(query, "lite")).map(toPaper);
    const candidates = await withAbstracts(dedupe(found).slice(0, 30));
    const verified: Paper[] = [];
    for (const p of candidates.slice(0, maxPapers)) {
      const ok = await verify(p);
      if (ok && !ok.retracted) verified.push(ok);
    }
    for (let i = 0; i < verified.length; i += BATCH) {
      const batch = verified.slice(i, i + BATCH);
      const answer = await extract(batch, condition, features);
      tokens += answer.tokens;
      out.push(
        ...toInterventions(
          condition,
          features,
          verified,
          answer.items.map((x) => ({ ...x, paperIndex: i + x.paperIndex })),
          kind,
        ),
      );
      if (i + BATCH < verified.length) await sleep(200);
    }
  }
  return { rows: out, tokens };
}

/* ── the queue ────────────────────────────────────────────────────────── */

/**
 * Conditions somebody's differential just made interesting.
 *
 * ponytail: a module-level Set, drained by the same in-process timer that runs
 * the curator. There is one web replica; when there are two, this becomes a
 * table and nothing else changes.
 */
const queued = new Set<string>();

/** How long a condition is left alone after a research run. */
export const RESEARCH_COOLDOWN_DAYS = 90;

/** Ask for a condition to be read, unless it was read in the last 90 days. */
export async function queueResearch(conditionId: string): Promise<boolean> {
  if (queued.has(conditionId)) return false;
  if (!(await dueAgain("hkb-research", RESEARCH_COOLDOWN_DAYS, `${conditionId}:`)))
    return false;
  queued.add(conditionId);
  return true;
}

/** Everything asked for since the last drain. */
export function takeQueuedResearch(): string[] {
  const out = [...queued];
  queued.clear();
  return out;
}

/** The rows, minus the (condition, name, outcome) keys already on the table. */
export async function saveInterventions(
  rows: InterventionRow[],
): Promise<number> {
  if (!rows.length) return 0;
  const written = await getDb()
    .insert(hkbInterventions)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: hkbInterventions.id });
  return written.length;
}
