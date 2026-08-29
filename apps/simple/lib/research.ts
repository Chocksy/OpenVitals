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
  hkbTests,
} from "@/db";
import { model } from "./extract";

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
}

export interface Feature {
  id: string;
  name: string;
  unit: string | null;
}

export interface ConditionRef {
  id: string;
  name: string;
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
  studyType: "meta" | "rct" | "cohort" | "case_control" | "guideline" | "other";
  quote: string;
}

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

export const toPaper = (h: EpmcHit): Paper => ({
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
  studyType: z.enum([
    "meta",
    "rct",
    "cohort",
    "case_control",
    "guideline",
    "other",
  ]),
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

/** meta and guideline are A, a big RCT or cohort is B, everything else is C. */
export function gradeOf(f: Finding): "A" | "B" | "C" {
  if (f.studyType === "meta" || f.studyType === "guideline") return "A";
  if ((f.studyType === "rct" || f.studyType === "cohort") && (f.n ?? 0) >= 500)
    return "B";
  return "C";
}

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
export const sourceLine = (paper: Paper, quote: string) =>
  [
    `${paper.authors.split(",")[0]?.trim() || "anonymous"} ${paper.year ?? "n.d."} ${paper.journal ?? "unknown journal"}`,
    paper.doi ? `doi:${paper.doi}` : `pmid:${paper.pmid ?? "none"}`,
    `quote: "${quote.replace(/\s+/g, " ").trim()}"`,
  ].join("; ");

/** Findings plus their papers into rows `hkb_evidence` will take. */
export function toProposals(
  condition: ConditionRef,
  features: Feature[],
  papers: Paper[],
  findings: Finding[],
): { rows: Proposal[]; unmapped: number; skipped: number } {
  const known = new Set(features.map((f) => f.id));
  const rows = new Map<string, Proposal>();
  let unmapped = 0;
  let skipped = 0;

  for (const f of findings) {
    const paper = papers[f.paperIndex - 1];
    if (!paper) {
      skipped++;
      continue;
    }
    const featureId = f.featureId ?? "";
    if (!featureId || !known.has(featureId)) {
      unmapped++;
      continue;
    }
    const on = conditionOn(featureId, f);
    const lr = likelihoodRatios(f);
    if (!on || !lr || !f.quote?.trim()) {
      skipped++;
      continue;
    }
    const id = proposalId(condition.id, featureId, paper);
    rows.set(`${featureId}|${JSON.stringify(on)}`, {
      id,
      conditionId: condition.id,
      featureId,
      conditionOn: on,
      lrPos: lr.lrPos,
      lrNeg: lr.lrNeg,
      grade: gradeOf(f),
      source: sourceLine(paper, f.quote),
      population: f.population || null,
      status: "proposed",
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
  return { rows: [...rows.values()], unmapped, skipped };
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
): Promise<{ rows: Proposal[]; counts: RunCounts }> {
  const maxPapers = options.maxPapers ?? 20;
  const extract = options.extract ?? llmExtract(options.modelId);

  const found: Paper[] = [];
  for (const query of buildQueries(condition.name, features))
    found.push(...(await epmc(query, "lite")).map(toPaper));
  found.push(
    ...(await semanticScholar(
      `${condition.name} diagnostic accuracy likelihood ratio`,
    )),
  );

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
      counts: {
        hits,
        papers: papers.length,
        verified: verified.length,
        extracted: 0,
        proposed: 0,
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

  const { rows, unmapped, skipped } = toProposals(
    condition,
    features,
    verified,
    findings,
  );
  return {
    rows,
    counts: {
      hits,
      papers: papers.length,
      verified: verified.length,
      extracted: findings.length,
      proposed: rows.length,
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
): Promise<number> {
  if (!rows.length) return 0;
  const db = getDb();
  const existing = await db
    .select({
      featureId: hkbEvidence.featureId,
      conditionOn: hkbEvidence.conditionOn,
    })
    .from(hkbEvidence)
    .where(eq(hkbEvidence.conditionId, conditionId));
  const seen = new Set(
    existing.map((e) => `${e.featureId}|${JSON.stringify(e.conditionOn)}`),
  );
  const fresh = rows.filter(
    (r) => !seen.has(`${r.featureId}|${JSON.stringify(r.conditionOn)}`),
  );
  if (!fresh.length) return 0;
  const written = await db
    .insert(hkbEvidence)
    .values(fresh)
    .onConflictDoNothing()
    .returning({ id: hkbEvidence.id });
  return written.length;
}
