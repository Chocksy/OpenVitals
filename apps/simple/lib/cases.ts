/**
 * Case research: the catalog grows from a person. Phase 41C.
 *
 * The summary is code (`caseOf`). One model call turns it into at most six
 * Europe PMC queries, each tying two or more of the summary's own items
 * together; code throws away the rest. The papers are read the way the topic
 * watch reads them (pre-ranked by design, DOI verified), one model call per
 * batch proposes rules with a verbatim quote, and `hkb-policy.judge` decides
 * every one of them. The model proposes; nothing it says scores until code
 * has checked the DOI, the quote, the number and the grade.
 *
 * `researchCase(..., { dryRun: true })` writes nothing and hands back a
 * `CatalogOverlay` that `withOverlay` merges into a catalog in memory, which
 * is how the blind replay (41D) scores "what the engine would have believed".
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  beliefSnapshots,
  getDb,
  hkbConditionTests,
  hkbConditions,
  hkbEvidence,
  hkbFeatures,
  hkbImportRuns,
  hkbPriorModifiers,
  hkbPriors,
  hkbTerms,
  hkbTests,
  hunches,
  metrics,
  type HunchExplanation,
} from "@/db";
import type { ModelInput } from "./coverage";
import { DEFAULT_MODEL, generateObjectSafe } from "./extract";
import {
  catalogFor,
  forgetCatalog,
  modifierOf,
  pooledEvidence,
  recordRevision,
  rowsToCatalog,
  type CatalogRows,
  type ConditionRow,
  type EvidenceRow,
  type ModifierRow,
} from "./hkb";
import { judge, promoted, statusOf, type Decision } from "./hkb-policy";
import { normalizeName } from "./merge-metrics";
import {
  noResponse,
  PRIOR_MODIFIER_CAP,
  treatedWith,
  TREATMENT_TARGETS,
  type Catalog,
  type Grade,
  type Hypothesis,
  type HypothesisResult,
} from "./hypotheses";
import { dueAgain, lastRun, recordRun } from "./hkb-import";
import type { Differential } from "./hunches";
import {
  epmc,
  EpmcUnavailable,
  featuresFor,
  gradeOf,
  likelihoodRatios,
  proposalId,
  sourceLine,
  STUDY_TYPES,
  upTo,
  verify,
  withAbstracts,
  type Feature,
  type Paper,
} from "./research";
import { chronicOf, fmt, type Signal } from "./signals";
import { SYMPTOMS } from "./symptoms";
import {
  dedupeRanked,
  preRank,
  toRanked,
  type RankedPaper,
} from "./topic-watch";

/* ── the summary ──────────────────────────────────────────────────────── */

export type CaseItemKind =
  | "chronic"
  | "ever"
  | "no_response"
  | "treated"
  | "antibody_rising"
  | "discordance"
  | "genome"
  | "cause"
  | "belief"
  | "untested";

export interface CaseItem {
  /** stable: `kind:code`, what a query cites */
  key: string;
  kind: CaseItemKind;
  /** one line with the numbers and the dates */
  text: string;
  codes: string[];
  /** the feature this item offers the proposal call, when it is one */
  feature?: Feature;
  /**
   * A value the person had in the past (an out-of-range draw, or chronic
   * since `date`): a rule on this marker is saved in the `ever` form.
   */
  past?: { code: string; dir: "low" | "high"; date: string };
  /** search words for the query call, when code has better ones than the text */
  terms?: string[];
}

export interface CaseSummary {
  asOf: string;
  items: CaseItem[];
  beliefs: { id: string; name: string; p: number; state: string }[];
}

/** How many beliefs the summary names, and how many out-of-range items. */
export const TOP_BELIEFS = 8;
export const MAX_EVER = 15;
export const MAX_UNTESTED = 10;

const nameOf = (code: string) => code.replace(/_/g, " ");
const ANTIBODY = /(^anti_|_antibod|antibod)/i;

/**
 * Pairs that normally move together, so one without the other is worth a
 * query. ponytail: one pair, typed by hand and never scored; it only feeds
 * the summary. Upgrade path: the kg's same-direction edges once they exist.
 */
export const EXPECTED_WITH: {
  code: string;
  below: number;
  other: string;
  otherAtLeast: number;
  text: string;
  source: string;
}[] = [
  {
    code: "ferritin",
    below: 15,
    other: "mcv",
    otherAtLeast: 90,
    text: "iron-deficient ferritin with a normal-to-large MCV",
    source:
      "Camaschella 2015 NEJM: iron deficiency anaemia is typically microcytic",
  },
];

/**
 * How the literature names a treatment that did not work, per target marker:
 * the agent and the state it treats. ponytail: one row per `TREATMENT_TARGETS`
 * code, typed by hand; a code with no row gets no search words.
 */
export const FAILURE_WORDS: Record<string, { agent: string; state: string }> = {
  ferritin: { agent: "iron", state: "iron deficiency" },
  vitamin_b12: { agent: "vitamin B12", state: "vitamin B12 deficiency" },
  vitamin_d: { agent: "vitamin D", state: "vitamin D deficiency" },
  folic_acid: { agent: "folic acid", state: "folate deficiency" },
  tsh: { agent: "levothyroxine", state: "hypothyroidism" },
};

/** "refractory iron deficiency", "oral iron failure": from the failing routes. */
export function failureTerms(code: string, routes: string): string[] {
  const w = FAILURE_WORDS[code];
  if (!w) return [];
  const route = routes
    .split(/,\s*/)
    .map((r) => (r === "iv" ? "intravenous" : r))
    .filter((r) => r && r !== "any");
  return [
    `refractory ${w.state}`,
    ...route.map((r) => `${r} ${w.agent} failure`),
    ...(route.length ? [] : [`${w.agent} failure`]),
  ];
}

const within = (a: string, b: string, days: number) =>
  Math.abs(Date.parse(a) - Date.parse(b)) <= days * 86_400_000;

/**
 * The case, as code. Every item carries its numbers and dates; the beliefs and
 * the tests never measured come off the engine's own results.
 */
export function caseOf(
  input: ModelInput,
  signals: Signal[],
  beliefs: HypothesisResult[],
): CaseSummary {
  const items: CaseItem[] = [];
  const today = input.today;
  const drawsOf = (code: string) =>
    (input.latest[code]?.history?.draws ?? []).filter((d) => d.date <= today);
  const metric = (code: string, suffix = ""): Feature => ({
    id: `metric:${code}`,
    name: `${nameOf(code)}${suffix}`,
    unit: input.latest[code]?.unit ?? null,
  });

  // chronic: most draws out of range for years
  const chronic = new Map<string, "up" | "down">();
  for (const code of Object.keys(input.latest).sort()) {
    const unit = input.latest[code]!.unit;
    const pts = drawsOf(code).map((d) => ({ ...d, unit }));
    const c = chronicOf(code, pts);
    if (!c) continue;
    chronic.set(code, c.dir);
    const last = pts[pts.length - 1]!;
    const u = unit ? ` ${unit}` : "";
    items.push({
      key: `chronic:${code}`,
      kind: "chronic",
      text: `${nameOf(code)} chronically ${c.dir === "down" ? "low" : "high"}: ${c.out.length} of ${pts.length} draws over ${c.years} years out of range since ${c.first.date}, last ${fmt(last.value)}${u} on ${last.date}`,
      codes: [code],
      feature: metric(code),
      past: {
        code,
        dir: c.dir === "down" ? "low" : "high",
        date: c.first.date,
      },
    });
  }

  // ever lows and highs that are not already chronic that way
  const ever: (CaseItem & { out: number; off: number })[] = [];
  for (const code of Object.keys(input.latest).sort()) {
    const draws = drawsOf(code);
    const u = input.latest[code]!.unit ? ` ${input.latest[code]!.unit}` : "";
    const low = draws.filter((d) => d.refLow != null && d.value < d.refLow);
    const high = draws.filter((d) => d.refHigh != null && d.value > d.refHigh);
    for (const [dir, out] of [
      ["down", low],
      ["up", high],
    ] as const) {
      if (!out.length || chronic.get(code) === dir) continue;
      const worst = out.reduce((a, b) =>
        dir === "down"
          ? b.value < a.value
            ? b
            : a
          : b.value > a.value
            ? b
            : a,
      );
      ever.push({
        key: `ever_${dir === "down" ? "low" : "high"}:${code}`,
        kind: "ever",
        text: `${nameOf(code)} ${dir === "down" ? "below" : "above"} its lab range on ${out.length} of ${draws.length} draws, ${dir === "down" ? "lowest" : "highest"} ${fmt(worst.value)}${u} on ${worst.date} (range ${worst.refLow ?? "?"}-${worst.refHigh ?? "?"})`,
        codes: [code],
        feature: metric(code, " (any past draw)"),
        past: { code, dir: dir === "down" ? "low" : "high", date: worst.date },
        out: out.length,
        // how far outside its own range the worst draw sat, as a share
        off:
          dir === "down"
            ? (worst.refLow! - worst.value) / Math.abs(worst.refLow! || 1)
            : (worst.value - worst.refHigh!) / Math.abs(worst.refHigh! || 1),
      });
    }
  }
  items.push(
    ...ever
      .sort(
        (a, b) => b.out - a.out || b.off - a.off || a.key.localeCompare(b.key),
      )
      .slice(0, MAX_EVER)
      .map(({ out: _, off: __, ...i }) => i),
  );

  // treatments that did not move their marker, and the ones running now
  for (const code of [...new Set(TREATMENT_TARGETS.map((t) => t.code))]) {
    const failed = noResponse(input, code);
    const on = treatedWith(input, code);
    const said = (input.treatments ?? [])
      .filter((t) =>
        TREATMENT_TARGETS.some((x) => x.code === code && x.words.test(t.what)),
      )
      .map(
        (t) =>
          `${t.what} ${t.route} from ${t.started}${t.stopped ? ` to ${t.stopped}` : ""}`,
      )
      .join("; ");
    if (failed && failed !== "none") {
      const terms = failureTerms(code, failed);
      items.push({
        key: `no_response:${code}`,
        kind: "no_response",
        text: `no response of ${nameOf(code)} to ${failed} treatment (${said})${terms.length ? `; searched as ${terms.map((t) => `"${t}"`).join(" OR ")}` : ""}`,
        codes: [code],
        terms,
        feature: {
          id: `fact:no_response:${code}`,
          name: `no response of ${nameOf(code)} to treatment (value: route)`,
          unit: null,
        },
      });
    } else if (on)
      items.push({
        key: `treated:${code}`,
        kind: "treated",
        text: `on ${on} treatment aimed at ${nameOf(code)} (${said})`,
        codes: [code],
        feature: {
          id: `fact:treated:${code}`,
          name: `on treatment aimed at ${nameOf(code)} (value: route)`,
          unit: null,
        },
      });
  }

  // antibodies moving up: a step or drift signal, or a rising slope
  const rising = new Set(
    signals
      .filter(
        (s) => (s.kind === "step" || s.kind === "drift") && s.dir === "up",
      )
      .flatMap((s) => s.codes),
  );
  for (const code of Object.keys(input.latest).sort()) {
    if (!ANTIBODY.test(code)) continue;
    const v = input.latest[code]!;
    if (!rising.has(code) && !((v.slope?.perYear ?? 0) > 0)) continue;
    const draws = drawsOf(code);
    if (!draws.length) continue;
    items.push({
      key: `antibody_rising:${code}`,
      kind: "antibody_rising",
      text: `${nameOf(code)} rising: ${draws.map((d) => `${fmt(d.value)} (${d.date})`).join(", ")}; range to ${draws[draws.length - 1]!.refHigh ?? "?"}`,
      codes: [code],
      feature: metric(code),
    });
  }

  // discordances: a pair that should move together and did not
  for (const pair of EXPECTED_WITH) {
    const hits = drawsOf(pair.code)
      .filter((d) => d.value < pair.below)
      .flatMap((d) => {
        const o = drawsOf(pair.other).find((x) => within(x.date, d.date, 31));
        return o && o.value >= pair.otherAtLeast ? [{ d, o }] : [];
      });
    if (!hits.length) continue;
    const last = hits[hits.length - 1]!;
    items.push({
      key: `discordance:${pair.code}_${pair.other}`,
      kind: "discordance",
      text: `${pair.text}: ${nameOf(pair.code)} under ${pair.below} with ${nameOf(pair.other)} at or over ${pair.otherAtLeast} on ${hits.length} draws, last ${fmt(last.d.value)} with ${fmt(last.o.value)} on ${last.d.date}`,
      codes: [pair.code, pair.other],
    });
  }

  // genome calls that are not a plain "no variant"
  for (const [key, raw] of Object.entries(input.profile).sort()) {
    if (!key.startsWith("genome:")) continue;
    const value = String(raw ?? "").trim();
    if (!value || /^no\b/i.test(value)) continue;
    items.push({
      key: `genome:${key.slice(7)}`,
      kind: "genome",
      text: `${key.slice(7).toUpperCase()}: ${value}`,
      codes: [],
      feature: {
        id: `fact:${key}`,
        name: `${key.slice(7)} genotype`,
        unit: null,
      },
    });
  }

  // settled conditions whose cause is the open question
  for (const s of signals.filter((s) => s.kind === "cause"))
    items.push({
      key: `cause:${s.numbers.conditionId}`,
      kind: "cause",
      text: `${s.numbers.name} is ${s.numbers.state} (p ${s.numbers.p}); its cause is open`,
      codes: s.codes,
      // the condition's plain name, what the cause track searches for
      terms: [
        String(s.numbers.name)
          .replace(/\s*\([^)]*\)/g, "")
          .trim(),
      ],
    });

  // the engine's top beliefs, and what it would test that was never measured
  const top = [...beliefs]
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_BELIEFS);
  for (const b of top)
    items.push({
      key: `belief:${b.id}`,
      kind: "belief",
      text: `${b.name}: p ${b.score.toFixed(2)} (${b.state})`,
      codes: [],
      feature: {
        id: `hypothesis:${b.id}`,
        name: `probability of ${b.name}`,
        unit: null,
      },
    });
  const untested = new Map<string, CaseItem>();
  for (const b of top)
    for (const t of b.tests) {
      if (t.codes.some((c) => input.latest[c]?.value != null)) continue;
      const key = `untested:${t.codes[0] ?? t.test}`;
      if (untested.has(key) || untested.size >= MAX_UNTESTED) continue;
      untested.set(key, {
        key,
        kind: "untested",
        text: `${t.test} never measured (offered for ${b.name})`,
        codes: t.codes,
      });
    }
  items.push(...untested.values());

  return {
    asOf: today,
    items,
    beliefs: top.map((b) => ({
      id: b.id,
      name: b.name,
      p: +b.score.toFixed(3),
      state: b.state,
    })),
  };
}

/** The summary as the model reads it: one `key | text` line per item. */
export const summaryText = (s: CaseSummary) =>
  s.items.map((i) => `${i.key} | ${i.text}`).join("\n");

/* ── the queries ──────────────────────────────────────────────────────── */

export const MAX_QUERIES = 6;

export const querySchema = z.object({
  queries: z.array(
    z.object({
      /** Europe PMC syntax: quoted phrases joined by AND/OR */
      query: z.string(),
      /** the summary keys this query combines */
      items: z.array(z.string()),
    }),
  ),
});
export type RawQuery = z.infer<typeof querySchema>["queries"][number];

export const QUERY_PROMPT = `You turn one person's medical case summary into literature searches.

Each line of the summary is "key | fact". Write at most ${MAX_QUERIES} Europe PMC queries
that look for papers explaining how two or more of these facts go together.

Rules:
- Every query combines at least two different summary items, and \`items\` lists
  their keys exactly as written. A query about one item alone is discarded.
- Use only what the summary says. Do not add a diagnosis the summary does not name.
- Europe PMC syntax: quoted phrases joined with AND, synonyms grouped with OR in
  parentheses. Two or three concept groups per query, each phrase short enough
  to appear in a title or an abstract. No field tags, no dates.
- Prefer combinations that are unusual together: they are where an explanation hides.`;

/** Queries that cite fewer than two real summary items are thrown away. */
export function checkQueries(
  raw: RawQuery[],
  summary: CaseSummary,
): { accepted: RawQuery[]; rejected: { query: RawQuery; why: string }[] } {
  const keys = new Set(summary.items.map((i) => i.key));
  const accepted: RawQuery[] = [];
  const rejected: { query: RawQuery; why: string }[] = [];
  for (const q of raw) {
    const cited = [...new Set(q.items.filter((k) => keys.has(k)))];
    if (!q.query.trim()) rejected.push({ query: q, why: "empty query" });
    else if (cited.length < 2)
      rejected.push({
        query: q,
        why: `combines ${cited.length} summary item${cited.length === 1 ? "" : "s"}`,
      });
    else if (accepted.length >= MAX_QUERIES)
      rejected.push({ query: q, why: `over the cap of ${MAX_QUERIES}` });
    else accepted.push({ query: q.query.trim(), items: cited });
  }
  return { accepted, rejected };
}

/**
 * A treatment that failed is the strongest clue a case has, so a query always
 * carries it: when the model's queries leave a `no_response` item out, code
 * adds one of its own, the failure's search words with the open cause of the
 * same marker. It takes the last slot when all six are used.
 */
export function withFailureQuery(
  accepted: RawQuery[],
  summary: CaseSummary,
): RawQuery[] {
  const out = [...accepted];
  for (const nr of summary.items) {
    if (nr.kind !== "no_response" || !nr.terms?.length) continue;
    if (out.some((q) => q.items.includes(nr.key))) continue;
    const cause = summary.items.find(
      (i) => i.kind === "cause" && i.codes.some((c) => nr.codes.includes(c)),
    );
    if (!cause) continue;
    const q: RawQuery = {
      query: `(${nr.terms.map((t) => `"${t}"`).join(" OR ")}) AND (etiology OR aetiology OR cause OR causes)`,
      items: [nr.key, cause.key],
    };
    if (out.length >= MAX_QUERIES) out[out.length - 1] = q;
    else out.push(q);
  }
  return out;
}

const CAUSE_WORDS = "etiology aetiology causes cause underlying".split(" ");

/**
 * The cause track: for each settled condition whose cause is open, its causes
 * as the literature lists them, and the causes of its treatment failing when
 * the case has one. Code writes these; the model is not asked. The condition
 * sits in the title: a paper that only mentions it in passing (a global burden
 * table) says nothing about what causes it.
 */
export function causeQueries(summary: CaseSummary): string[] {
  const out: string[] = [];
  for (const c of summary.items) {
    if (c.kind !== "cause" || !c.terms?.[0]) continue;
    out.push(
      `TITLE:"${c.terms[0]}" AND (${CAUSE_WORDS.map((w) => `TITLE:${w}`).join(" OR ")})`,
    );
    const nr = summary.items.find(
      (i) =>
        i.kind === "no_response" &&
        i.terms?.length &&
        i.codes.some((x) => c.codes.includes(x)),
    );
    if (nr)
      out.push(
        `(${nr.terms!.map((t) => `TITLE:"${t}"`).join(" OR ")}) AND (${CAUSE_WORDS.join(" OR ")})`,
      );
  }
  return [...new Set(out)];
}

/* ── the proposals ────────────────────────────────────────────────────── */

const whenSchema = z.object({
  above: z.number().nullish(),
  below: z.number().nullish(),
  equals: z.string().nullish(),
  includes: z.string().nullish(),
  /** positive / out of the lab range, with no number of its own */
  outOfRange: z.boolean().nullish(),
  /** the value at any past draw rather than the latest one */
  ever: z.boolean().nullish(),
  years: z.number().nullish(),
});

const proposalSchema = z.object({
  kind: z.enum(["evidence", "modifier", "cause", "condition"]),
  paperIndex: z.number(),
  doi: z.string(),
  /** a listed condition id, or empty when the condition is not listed */
  conditionId: z.string().nullish(),
  conditionName: z.string().nullish(),
  mondoId: z.string().nullish(),
  featureId: z.string().nullish(),
  featureName: z.string().nullish(),
  unit: z.string().nullish(),
  when: whenSchema.nullish(),
  lrPos: z.number().nullish(),
  lrNeg: z.number().nullish(),
  sensitivity: z.number().nullish(),
  specificity: z.number().nullish(),
  /** for a modifier: how many times the prior odds change (OR, RR, prevalence ratio) */
  times: z.number().nullish(),
  /**
   * for a modifier when the abstract prints a proportion, not a ratio, and
   * always for a cause: the share of people with the feature who had the
   * condition (fraction 0-1)
   */
  prevalence: z.number().nullish(),
  /** with `prevalence`: the group the share is taken of, words from the quote */
  among: z.string().nullish(),
  /** with `prevalence`: the group counted inside it, words from the quote */
  shareOf: z.string().nullish(),
  /**
   * for a cause printed as counts: the people found with the condition, and
   * the size of the group they were counted in ("19 of 71")
   */
  count: z.number().nullish(),
  total: z.number().nullish(),
  design: z.enum(STUDY_TYPES),
  n: z.number().nullish(),
  quote: z.string(),
});
/** `.nullish()` fields as plain `.optional()`: no null, so no union types. */
function optionalOnly(o: z.ZodObject): z.ZodObject {
  return z.object(
    Object.fromEntries(
      Object.entries(o.shape).map(([k, v]) => {
        let t = v as z.ZodType;
        while (t instanceof z.ZodOptional || t instanceof z.ZodNullable)
          t = t.unwrap() as z.ZodType;
        return [k, v instanceof z.ZodOptional ? t.optional() : t];
      }),
    ),
  );
}

/**
 * What the model is asked for. Anthropic refuses a schema with more than 24
 * optional fields or 16 union-typed ones, so the model's copy has no nulls
 * and no MONDO id (a name finds a ring-2 row as well).
 */
export const proposalsSchema = z.object({
  items: z.array(
    optionalOnly(proposalSchema.omit({ mondoId: true })).extend({
      when: optionalOnly(whenSchema).optional(),
    }),
  ),
});
export type RawProposal = z.infer<typeof proposalSchema>;

export const READ_PROMPT = `You read medical abstracts for one person's case and propose rules a
diagnostic engine could use. Report only what an abstract states with a number.

Kinds:
- "evidence": a feature that changes how likely a listed condition is. Give lrPos
  (and lrNeg) or sensitivity and specificity (fractions 0-1).
- "modifier": something that raises or lowers the prior of a condition: another
  condition (featureId "hypothesis:<id>"), a marker (latest or \`ever\`), or a fact
  from the feature list. Give \`times\` (the odds ratio, relative risk or
  prevalence ratio the abstract prints), or \`prevalence\` when it only prints
  the share of people with that feature who had the condition. With
  \`prevalence\`, copy from the quote the group the share is taken of
  (\`among\`) and the group counted (\`shareOf\`).
- "cause": the abstract prints the share of people with a condition under OPEN
  CAUSES (or with that condition's treatment failure) who turned out to have an
  underlying condition C. conditionId is C (or conditionName when C is not
  listed), featureId is "hypothesis:<open cause id>" or the failure fact from the
  feature list, \`prevalence\` is the share, and \`among\`/\`shareOf\` are copied
  from the quote as for a modifier. When the abstract prints counts rather
  than a percent, give \`count\` (people found with C) and \`total\` (the group
  they were counted in) instead of \`prevalence\`.
- "condition": the abstract points at a condition that is not in the CONDITIONS
  list and fits this case. Give conditionName (and mondoId if you know it), and
  also propose its evidence or modifier rows with the same conditionName.

Rules:
- \`quote\` is a verbatim span of that abstract with the number in it. \`doi\` is the
  DOI printed after the abstract. \`paperIndex\` is the abstract's number.
- \`featureId\` is one of the listed FEATURES when it is the same thing; otherwise
  leave it empty and give featureName and unit.
- \`when\`: above/below for a numeric cut-off, outOfRange for "positive"/"raised"
  with no number, equals/includes for a fact's answer, ever=true when the paper
  is about a value at any time rather than now. For "hypothesis:" use above 0.5.
- \`design\`: the study type; \`n\`: the number of people.
- No rule is the right answer for an abstract that quantifies nothing.`;

/** 12 or 0.12 → 0.12; anything else is no share. */
const asShare = (v: number | null | undefined) =>
  v == null || !(v > 0) ? null : v <= 1 ? v : v <= 100 ? v / 100 : null;

/** An empty `when` answer is no rule at all. */
function conditionOnOf(
  featureId: string,
  w: RawProposal["when"],
): Record<string, unknown> | null {
  // a treatment fact answers with its routes; "it failed" is any route at all
  if (/^fact:(no_response|treated):/.test(featureId) && !w?.equals?.trim())
    return {
      includes: w?.includes?.trim().toLowerCase() || "oral|iv|any",
    };
  // a condition as a feature is "it holds", whatever the paper's words
  if (featureId.startsWith("hypothesis:")) return { above: w?.above ?? 0.5 };
  if (!w) return null;
  const on: Record<string, unknown> = {};
  if (featureId.startsWith("metric:") || featureId.startsWith("derived:")) {
    if (w.ever) {
      const ever: Record<string, unknown> = {};
      if (w.above != null) ever.above = w.above;
      if (w.below != null) ever.below = w.below;
      if (w.outOfRange && w.above == null && w.below == null)
        ever.aboveRef = true;
      if (!Object.keys(ever).length) return null;
      if (w.years != null && w.years > 0) ever.years = w.years;
      return { ever };
    }
    if (w.above != null) on.above = w.above;
    if (w.below != null) on.below = w.below;
    if (!Object.keys(on).length && w.outOfRange) on.status = "red";
    return Object.keys(on).length ? on : null;
  }
  if (w.equals?.trim()) on.equals = w.equals.trim();
  if (w.includes?.trim()) on.includes = w.includes.trim().toLowerCase();
  return Object.keys(on).length ? on : null;
}

/**
 * A rule on a marker the case holds as history reads the history. "B12 under
 * 200" fires on today's draw only; the person's 172 was in 2021. So when the
 * summary has the marker out of range in the past (or chronic since a date),
 * code writes the `ever` form with a window that reaches that draw. The model
 * is never asked.
 */
export function historyOn(
  featureId: string,
  on: Record<string, unknown>,
  items: CaseItem[],
  today: string,
): Record<string, unknown> {
  if (!featureId.startsWith("metric:") || on.slopePerYear) return on;
  const code = featureId.slice(7);
  const was = on.ever as Record<string, unknown> | undefined;
  const cut = was ?? on;
  const want = cut.below != null ? "low" : cut.above != null ? "high" : null;
  const past = items.find(
    (i) => i.past?.code === code && (want == null || i.past.dir === want),
  )?.past;
  if (!past) return on;
  const years = Math.max(
    1,
    Math.ceil(
      (Date.parse(today) - Date.parse(past.date)) / (365.25 * 86_400_000),
    ),
  );
  const ever: Record<string, unknown> =
    cut.below != null
      ? { below: cut.below }
      : cut.above != null
        ? { above: cut.above }
        : past.dir === "low"
          ? { belowRef: true }
          : { aboveRef: true };
  return { ever: { ...ever, years } };
}

const STOP = new Set(
  "a an the of in with and or any past draw value level levels serum patient people subject disease syndrome disorder probability".split(
    " ",
  ),
);
const SPELLING: [RegExp, string][] = [
  [/coeliac/g, "celiac"],
  [/anaemi/g, "anemi"],
  [/haem/g, "hem"],
  [/cobalamin/g, "b12"],
];
const wordsOf = (t: string) =>
  SPELLING.reduce((a, [re, to]) => a.replace(re, to), squash(t))
    .split(" ")
    // a sentence's full stop is no part of its last word
    .map((w) => w.replace(/^\.+|\.+$/g, "").replace(/(es|s)$/, ""))
    .filter((w) => w && !STOP.has(w));

/**
 * Endings that turn one word into another form of the same word:
 * "hypothyroid(ism)", "deficien(t|cy)", "anaemi(a|c)", "autoimmun(e|ity)".
 */
const INFLECTIONS = new Set([
  "",
  "a",
  "e",
  "y",
  "al",
  "ic",
  "ia",
  "ed",
  "ing",
  "ism",
  "cy",
  "t",
  "ity",
  "ies",
  "ous",
]);

/**
 * One word, whole: the same word, or two forms of it that share a stem of five
 * letters or more and differ only by an ending in `INFLECTIONS`. A cut at the
 * first seven letters made "hypothyroxinemia" read as "hypothyroidism"
 * (Thyroid 2017, 41C round 3); this does not.
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  // the stem may end before the shared letters do: "anaemi|a" vs "anaemi|c"
  // only reads as "anaem|ia" vs "anaem|ic"
  for (let k = i; k >= 5; k--)
    if (INFLECTIONS.has(a.slice(k)) && INFLECTIONS.has(b.slice(k))) return true;
  return false;
}

/** Does `text` name `name`: every word of the name, each as a whole word. */
export function namesIt(text: string, name: string): boolean {
  const want = wordsOf(name);
  const have = wordsOf(text);
  return want.length > 0 && want.every((w) => have.some((h) => sameWord(h, w)));
}

/**
 * A printed share converts to a multiplier in one direction only: "18.9 % of
 * B12-deficient patients had PA" is P(PA | low B12), a rule on PA read off
 * B12, never the other way. The group the share is taken of has to be the
 * feature, the group counted has to be the condition, both in the quote, and
 * the first has to follow "of", "among", "in" or "with" there. ponytail: word
 * matching, not a parser; a quote that hides its groups is not converted.
 */
export function shareDirection(
  r: Pick<RawProposal, "quote" | "among" | "shareOf">,
  featureNames: string[],
  conditionNames: string[],
): string | null {
  const among = r.among?.trim();
  const counted = r.shareOf?.trim();
  if (!among || !counted)
    return "a share without its two groups is not converted";
  const q = squash(r.quote);
  if (!q.includes(squash(among)) || !q.includes(squash(counted)))
    return "the share's groups are not words of the quote";
  const first = squash(among).split(" ")[0]!;
  if (!new RegExp(`\\b(of|among|in|with)( \\S+){0,3} ${first}\\b`).test(q))
    return "the quote does not take the share among that group";
  if (!featureNames.some((n) => namesIt(among, n)))
    return "the share is not taken among people with the feature";
  if (!conditionNames.some((n) => namesIt(counted, n)))
    return "the group counted is not the condition";
  return null;
}

/** "Autoimmune thyroiditis (Hashimoto's)" reads as both of its halves. */
export const nameParts = (n: string) =>
  [
    n.replace(/\s*\([^)]*\)/g, ""),
    ...[...n.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!),
  ]
    .map((x) => x.trim())
    .filter(Boolean);

/** One token of two to six letters with two capitals: "HT", "TPOAb", "CD". */
const isAbbr = (n: string) =>
  /^[A-Za-z]{2,6}$/.test(n.trim()) && /[A-Z].*[A-Z]/.test(n);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does the quote name the thing: one of its long names, every word, or an
 * abbreviation the abstract itself defines for one of them ("iron deficiency
 * anaemia (IDA)"). A stored abbreviation alone never counts, "HT" or "CD"
 * mean too many things. ponytail: a definition is the long name in the last
 * few words before "(ABBR)"; a paper that defines it another way is missed.
 */
export function namedIn(
  quote: string,
  abstract: string,
  names: string[],
): boolean {
  const long = [...new Set(names.flatMap(nameParts))].filter(
    (n) => !isAbbr(n) && wordsOf(n).length,
  );
  if (long.some((n) => namesIt(quote, n))) return true;
  const plain = abstract.replace(/<\/?[a-z][a-z0-9]*(\s[^<>]*)?>/gi, " ");
  for (const m of plain.matchAll(/\(\s*([A-Za-z][A-Za-z0-9-]{1,7})\s*[);,]/g)) {
    const abbr = m[1]!;
    if (!/[A-Z].*[A-Z]/.test(abbr)) continue;
    if (
      !new RegExp(`(^|[^A-Za-z0-9])${escapeRe(abbr)}([^A-Za-z0-9]|$)`).test(
        quote,
      )
    )
      continue;
    const lead = plain.slice(0, m.index).split(/\s+/).filter(Boolean);
    if (
      long.some((n) =>
        namesIt(lead.slice(-(wordsOf(n).length + 1)).join(" "), n),
      )
    )
      return true;
  }
  return false;
}

/**
 * A genome fact is named by its gene ("HLA-DR", or an allele of it, "HLA-DR3").
 * A quote whose genotype joins alleles ("DR3-DQ2/DR4-DQ8") is about that
 * combination, not about carrying one part of it.
 */
export function genomeNamed(quote: string, key: string): string | null {
  const gene = key.split("_").filter(Boolean);
  const toks = squash(quote).split(" ");
  const named = gene.every((g, i) =>
    toks.some(
      (t) =>
        t === g ||
        (i === gene.length - 1 &&
          t.startsWith(g) &&
          /^\d/.test(t.slice(g.length))),
    ),
  );
  if (!named) return "the quote does not name the feature";
  if (/[A-Za-z]+\d[\w.]*\s*\/\s*[A-Za-z]*\d/.test(quote))
    return "the quote's genotype is a combination; the rule reads one part of it";
  return null;
}

/** How the literature names a treatment fact: "refractory iron deficiency". */
function treatmentNames(featureId: string): string[] {
  const [, kind, code] = featureId.split(":");
  const w = FAILURE_WORDS[code ?? ""];
  if (!w) return [];
  return kind === "no_response"
    ? [
        `refractory ${w.state}`,
        `${w.agent} refractory`,
        `${w.agent} failure`,
        `${w.agent} resistant`,
        `${w.agent} unresponsive`,
        `${w.agent} non responder`,
      ]
    : [
        `${w.agent} treatment`,
        `${w.agent} therapy`,
        `${w.agent} supplementation`,
      ];
}

/** Study designs that print numbers, as the topic watch asks for them. */
const DESIGNS =
  '(randomized OR "meta-analysis" OR "systematic review" OR cohort OR "cross-sectional" OR "case-control")';
/** The cause track: reviews and series that print how often each cause was found. */
export const CAUSE_DESIGNS =
  '(review OR "systematic review" OR "meta-analysis" OR cohort OR prospective OR retrospective OR "cross-sectional")';

/**
 * The model's query as Europe PMC is asked it: designs that count, an
 * abstract to read, no case reports, published by `asOf`. `strict` puts every
 * quoted phrase in the title or the abstract and sorts by citations; without
 * it a phrase may sit anywhere in the full text, which is the fallback for a
 * strict query that finds almost nothing. ponytail: citation counts are
 * today's, so a replay's ranking knows a little of the future; the date clause
 * keeps the papers themselves out of it.
 */
export function caseQuery(
  q: string,
  asOf?: string,
  strict = true,
  designs = DESIGNS,
): string {
  const where = strict
    ? q.replace(/(\w+:)?"([^"]+)"/g, (all, field, p) =>
        // a phrase with its own field (the cause track's TITLE:) stays put
        field ? all : `(TITLE:"${p}" OR ABSTRACT:"${p}")`,
      )
    : q;
  const base = upTo(
    `(${where}) AND ${designs} AND HAS_ABSTRACT:y NOT PUB_TYPE:"Case Reports"`,
    asOf,
  );
  return strict ? `${base} sort_cited:y` : base;
}

/**
 * Titles that report no finding about people: a trial not run yet, or a test
 * of a chatbot. ponytail: a title regex; the design pre-rank handles the rest.
 */
export const OFF_TOPIC =
  /\b(study|trial) protocol\b|\bprotocol for\b|large language model|\bLLMs?\b|chatgpt|chatbot/i;

/** Fewer strict hits than this and the query is asked again, loosely. */
export const MIN_STRICT_HITS = 3;

/** Tags out (Europe PMC keeps `<i>p</i>`), case and punctuation folded. */
const squash = (s: string) =>
  s
    .replace(/<\/?(h[1-6]|p|br|div|li|ul|ol)\b[^<>]*>/gi, " ") // "biopsies.<h4>Results</h4>A" keeps its breaks
    .replace(/<\/?[a-z][a-z0-9]*(\s[^<>]*)?>/gi, "") // tags only: "P < 0.001" stays
    .toLowerCase()
    .replace(/[^a-z0-9.%]+/g, " ")
    .trim();

export interface CaseProposal {
  kind: RawProposal["kind"];
  /** a cause rule: the settled condition whose open cause it explains */
  causeOf?: string;
  origin: "paper";
  conditionId: string | null;
  conditionName: string | null;
  featureId: string | null;
  conditionOn: Record<string, unknown> | null;
  /** LR+ for evidence, `times` for a modifier */
  lrPos: number | null;
  lrNeg: number | null;
  grade: Grade | null;
  design: string;
  n: number | null;
  doi: string;
  quote: string;
  source: string | null;
  paper: { doi: string; title: string; year: number | null } | null;
  decision: Decision;
  reason: string;
  /** ring-2 at the time of the run */
  ring2: boolean;
}

export interface JudgeContext {
  papers: Paper[];
  /** every condition the engine scores now, by id */
  catalog: Map<string, { name: string; base?: number }>;
  /** ring-2 rows, by id, lower-cased name and MONDO id */
  ring2: Map<string, { id: string; name: string }>;
  features: Feature[];
  /** the case, for the history form of a rule; absent in a bare judge */
  summary?: CaseSummary;
  /**
   * more names, by condition id or `metric:` feature id: MONDO synonyms,
   * metric names and aliases. What the name check reads besides the catalog.
   */
  names?: Map<string, string[]>;
  /** every known metric, by `normalizeName` of its code, name and aliases */
  metrics?: Map<string, { code: string; unit: string | null }>;
  /** verified LRs already on the same (condition, feature, condition_on) */
  peers?: Map<string, number[]>;
  thisYear?: number;
  /**
   * who reads whose probability in the catalog now (`needsOf`), so a rule that
   * would close a reading cycle is refused; the catalog test fails on one
   */
  needs?: Map<string, Set<string>>;
}

/** Reading order of a catalog: condition id to the condition ids it reads. */
export function needsOf(catalog: Catalog): Map<string, Set<string>> {
  return new Map(
    catalog.map((h) => [
      h.id,
      new Set(
        [
          h.requires?.id,
          ...h.evidence.map((e) => e.input.hypothesis),
          ...h.priors.modifiers.map((m) => m.when.hypothesis),
        ].filter((id): id is string => !!id && id !== h.id),
      ),
    ]),
  );
}

/** `from` reads `to`, directly or through others. */
function reads(needs: Map<string, Set<string>>, from: string, to: string) {
  const seen = new Set<string>();
  const walk = (id: string): boolean =>
    id === to ||
    (!seen.has(id) && (seen.add(id), [...(needs.get(id) ?? [])].some(walk)));
  return walk(from);
}

export const peerKey = (conditionId: string, featureId: string, on: unknown) =>
  `${conditionId}|${featureId}|${JSON.stringify(on)}`;

/**
 * "19 with atrophic gastritis" among the 71 studied: both numbers printed in
 * the abstract, the count in the quote, and the count inside the group.
 */
function countShare(
  r: Pick<RawProposal, "count" | "total" | "quote">,
  paper: Paper,
): number | null {
  const { count, total } = r;
  if (count == null || total == null || !(count > 0) || count > total)
    return null;
  const has = (text: string, n: number) =>
    new RegExp(`(^|[^0-9.])${n}([^0-9]|$)`).test(squash(text));
  return has(r.quote, count) && has(paper.abstract, total)
    ? +(count / total).toFixed(3)
    : null;
}

/**
 * The paper's title names the feature as the population whose causes it
 * counts: "causes of refractory iron deficiency anemia", "a frequent cause
 * of X". A title where X itself causes something ("X causes Y") does not.
 */
export function titlePopulation(
  paper: Pick<Paper, "title" | "abstract">,
  featureNames: string[],
): boolean {
  const m = paper.title.match(
    /\b(causes?|a?etiolog\w*|sources?|origins?)\s+(of|for|in)\b(.*)$/i,
  );
  return !!m && namedIn(m[3]!, paper.abstract, featureNames);
}

/**
 * With the population in the title, the quote only has to name what it
 * counted: the model's `shareOf`, or else, for a count, the words right after
 * the count in the quote ("19 with atrophic gastritis"), read by code.
 */
function countedGroup(
  r: Pick<RawProposal, "quote" | "shareOf" | "count">,
  conditionNames: string[],
): string | null {
  const words = squash(r.quote).split(" ");
  const at = r.count != null ? words.indexOf(String(r.count)) : -1;
  const counted =
    r.shareOf?.trim() ||
    (at >= 0 ? words.slice(at, at + 6).join(" ") : undefined);
  if (!counted) return "a share without its two groups is not converted";
  if (!squash(r.quote).includes(squash(counted)))
    return "the share's groups are not words of the quote";
  if (!conditionNames.some((n) => namesIt(counted, n)))
    return "the group counted is not the condition";
  return null;
}

/** A condition's names: the catalog's or ring 2's, its id, and its synonyms. */
function namesOfCondition(id: string, ctx: JudgeContext): string[] {
  return [
    ctx.catalog.get(id)?.name ?? "",
    ctx.ring2.get(id)?.name ?? "",
    id.replace(/^mondo_\d+$/, "").replace(/_/g, " "),
    ...(ctx.names?.get(id) ?? []),
  ].filter(Boolean);
}

/** A feature's names: a condition's for `hypothesis:`, a marker's and its aliases. */
function namesOfFeature(featureId: string, ctx: JudgeContext): string[] {
  if (featureId.startsWith("hypothesis:"))
    return namesOfCondition(featureId.slice(11), ctx);
  if (/^fact:(no_response|treated):/.test(featureId))
    return treatmentNames(featureId);
  const offered = ctx.features.find((f) => f.id === featureId)?.name ?? "";
  return [
    offered,
    featureId.split(":").slice(1).join(" ").replace(/_/g, " "),
    ...(ctx.names?.get(featureId) ?? []),
  ].filter(Boolean);
}

/**
 * Symptom groups a study can leave out ("patients without gastrointestinal
 * symptoms"), by the words papers use, and the interview items that ask about
 * them. A person who answered any of those items with a symptom is outside
 * the study, so its share does not apply to them. ponytail: one group so far;
 * add a row when a paper excludes another.
 */
export const SYMPTOM_SYSTEMS: { words: RegExp; keys: string[] }[] = [
  {
    words:
      /^(gastrointestinal|gi|digestive|abdominal|bowel|gastric|dyspeptic)$/i,
    keys: ["sym_bowel", "sym_bloating"],
  },
];

/**
 * The population a share was counted in, when the paper narrows it by what
 * its patients did not have: the title first, then the abstract. `unless`
 * holds the interview answers that put a person outside it: every option of
 * the item except its first ("No", "Neither").
 */
export function populationOf(paper: Pick<Paper, "title" | "abstract">): {
  population: string;
  unless?: { fact: string; includes: string }[];
} | null {
  const plain = (t: string) =>
    t.replace(/<\/?[a-z][a-z0-9]*(\s[^<>]*)?>/gi, " ").replace(/\s+/g, " ");
  for (const text of [paper.title, paper.abstract].map(plain)) {
    const m = text.match(
      /\b(?:([a-z]+)\s+)?(?:without|with no|free of)\s+(?:any\s+)?([a-z]+(?:[- ][a-z]+)?)\s+(?:symptoms|complaints)\b/i,
    );
    if (!m) continue;
    const words = m[2]!.split(/[- ]/);
    const keys = SYMPTOM_SYSTEMS.filter((s) =>
      words.some((w) => s.words.test(w)),
    ).flatMap((s) => s.keys);
    const unless = SYMPTOMS.filter((s) => keys.includes(s.key)).map((s) => ({
      fact: s.key,
      includes: s.options.slice(1).join("|").toLowerCase(),
    }));
    return {
      population: m[0].trim(),
      ...(unless.length ? { unless } : {}),
    };
  }
  return null;
}

/**
 * Every proposal decided in code: the paper, the DOI, the verbatim quote, the
 * feature, the numbers, the grade, and `hkb-policy.judge` over all of it. Then
 * the run-level step: a ring-2 condition is promoted only when one of its A or
 * B rules was accepted, and its rules fall with it when it is not.
 */
/**
 * The quote is in the abstract word for word. An elided quote ("A ... B",
 * "A [...] B") passes when every part is verbatim and the parts come in the
 * abstract's order: a stronger model cites the group size and the count that
 * way when the sentences between them are long.
 */
export function verbatimIn(quote: string, abstract: string): boolean {
  const parts = quote
    .split(/\s*(?:\[\s*(?:\.{3}|…)\s*\]|\.{3}|…)\s*/)
    .map(squash)
    .filter(Boolean);
  if (!parts.length) return false;
  const text = squash(abstract);
  let at = 0;
  for (const p of parts) {
    const i = text.indexOf(p, at);
    if (i < 0) return false;
    at = i + p.length;
  }
  return true;
}

export function judgeProposals(
  raw: RawProposal[],
  ctx: JudgeContext,
): { proposals: CaseProposal[]; promote: string[] } {
  const offered = new Map(ctx.features.map((f) => [f.id, f]));
  const conditionOf = (r: RawProposal) => {
    const id = r.conditionId?.trim();
    if (id && ctx.catalog.has(id)) return { id, ring2: false };
    for (const k of [
      id,
      r.mondoId?.trim(),
      r.conditionName?.trim().toLowerCase(),
    ])
      if (k && ctx.ring2.has(k))
        return { id: ctx.ring2.get(k)!.id, ring2: true };
    return null;
  };

  const out: CaseProposal[] = raw.map((r) => {
    const paper = ctx.papers[r.paperIndex - 1] ?? null;
    const c = conditionOf(r);
    const base: CaseProposal = {
      kind: r.kind,
      origin: "paper",
      conditionId: c?.id ?? null,
      conditionName: r.conditionName ?? null,
      featureId: null,
      conditionOn: null,
      lrPos: null,
      lrNeg: null,
      grade: null,
      design: r.design,
      n: r.n ?? null,
      doi: r.doi,
      quote: r.quote,
      source: paper ? sourceLine(paper, r.quote, r.n) : null,
      paper: paper
        ? { doi: paper.doi ?? "", title: paper.title, year: paper.year }
        : null,
      decision: "rejected",
      reason: "",
      ring2: c?.ring2 ?? false,
    };
    const no = (reason: string): CaseProposal => ({ ...base, reason });
    if (!paper?.doi || paper.doi.toLowerCase() !== r.doi.trim().toLowerCase())
      return no("DOI is not the verified paper's");
    if (!verbatimIn(r.quote, paper.abstract))
      return no("quote is not verbatim in the abstract");
    if (!c)
      return no(
        r.kind === "condition"
          ? "no hkb_conditions row by that name or MONDO id"
          : "condition not in the catalog or ring 2",
      );
    const grade = gradeOf(
      { studyType: r.design, n: r.n } as Parameters<typeof gradeOf>[0],
      {
        citedBy: paper.citedBy,
        year: paper.year,
        resolved: true,
        thisYear: ctx.thisYear,
      },
    );
    if (r.kind === "condition")
      return {
        ...base,
        grade,
        decision: "accepted",
        reason: "matched; promoted only with an A/B rule",
      };

    // the feature: an offered id, a catalog condition, or a metric the app
    // already knows by code, name or alias. Case research never mints one: a
    // name that matches no metric is the model's word, not a marker.
    const asked = r.featureId?.trim() || null;
    const metricOf = (t: string | null | undefined) =>
      t?.trim() ? ctx.metrics?.get(normalizeName(t)) : undefined;
    const metric = asked?.startsWith("metric:")
      ? metricOf(asked.slice(7))
      : undefined;
    const named = metric ?? metricOf(r.featureName);
    const featureId =
      asked && offered.has(asked)
        ? asked
        : asked?.startsWith("hypothesis:") && ctx.catalog.has(asked.slice(11))
          ? asked
          : named
            ? `metric:${named.code}`
            : null;
    if (!featureId)
      return no(
        asked || r.featureName?.trim()
          ? "the feature matches no known metric"
          : "feature neither offered nor nameable",
      );

    // a cause rule reads one settled condition whose cause is open, or the
    // failure of its treatment
    const openCause = (id: string) =>
      ctx.summary?.items.find(
        (i) =>
          i.kind === "cause" &&
          (id === `hypothesis:${i.key.slice(6)}` ||
            (/^fact:no_response:/.test(id) && i.codes.includes(id.slice(17)))),
      );
    const cause = r.kind === "cause" ? openCause(featureId) : undefined;
    if (r.kind === "cause" && !cause)
      return {
        ...base,
        featureId,
        grade,
        reason: "the feature is not a condition whose cause is open",
      };
    const causeOf = cause?.key.slice(6);
    const asked_on = conditionOnOf(featureId, r.when);
    if (!asked_on)
      return { ...base, featureId, grade, reason: "no usable `when`" };
    const on = ctx.summary
      ? historyOn(featureId, asked_on, ctx.summary.items, ctx.summary.asOf)
      : asked_on;

    const modifier = r.kind === "modifier" || r.kind === "cause";
    // a proportion becomes a ratio against the condition's own base rate, in
    // code, the way sensitivity and specificity become an LR; a cause rule is
    // always a proportion
    const counted = r.kind === "cause" ? countShare(r, paper) : null;
    const share =
      r.kind === "cause"
        ? (asShare(r.prevalence) ?? counted)
        : r.times == null
          ? asShare(r.prevalence)
          : null;
    if (r.kind === "cause" && share == null)
      return {
        ...base,
        featureId,
        conditionOn: on,
        grade,
        causeOf,
        reason: "a cause rule needs the share the paper printed",
      };
    const conditionNames = namesOfCondition(c.id, ctx);
    const featureNames = namesOfFeature(featureId, ctx);
    // a cause series names its population in the title ("causes of X"); the
    // quote then only has to count the cause
    const population =
      r.kind === "cause" && titlePopulation(paper, featureNames);
    if (modifier && share != null) {
      const wrong = population
        ? countedGroup(r, conditionNames)
        : shareDirection(r, featureNames, conditionNames);
      if (wrong)
        return {
          ...base,
          featureId,
          conditionOn: on,
          grade,
          causeOf,
          reason: wrong,
        };
    }
    const baseRate = ctx.catalog.get(c.id)?.base;
    // ponytail: capped where the engine caps all of a condition's modifiers
    const times =
      (r.kind === "cause" ? null : r.times) ??
      (share != null && baseRate
        ? Math.min(+(share / baseRate).toFixed(2), PRIOR_MODIFIER_CAP)
        : null);
    const lr = modifier
      ? times != null && times > 0 && times <= 1000
        ? { lrPos: times, lrNeg: null }
        : null
      : likelihoodRatios({
          lrPos: r.lrPos,
          lrNeg: r.lrNeg,
          sensitivity: r.sensitivity,
          specificity: r.specificity,
        } as Parameters<typeof likelihoodRatios>[0]);
    if (!lr)
      return {
        ...base,
        featureId,
        conditionOn: on,
        grade,
        reason: "no usable LR or times",
      };

    const known = offered.get(featureId);
    const j = judge({
      conditionId: c.id,
      featureId,
      featureName: r.featureName ?? known?.name,
      featureUnit: r.unit,
      targetUnit: known?.unit ?? named?.unit ?? null,
      conditionOn: on,
      lrPos: lr.lrPos,
      lrNeg: lr.lrNeg,
      grade,
      quote: r.quote,
      numbers: [
        r.lrPos,
        r.lrNeg,
        r.sensitivity,
        r.specificity,
        r.times,
        r.prevalence,
        r.count,
        r.when?.above,
        r.when?.below,
      ],
      retracted: paper.retracted,
      conditionInCatalog: !c.ring2,
      ring2: c.ring2,
      modifier,
      peers: ctx.peers?.get(peerKey(c.id, featureId, on)),
    });
    // the quote has to name both ends of the rule itself: a number printed
    // for a neighbour (TPO positivity, a combined genotype) is no rule here
    const unnamed =
      j.decision === "rejected"
        ? null
        : !namedIn(r.quote, paper.abstract, conditionNames)
          ? "the quote does not name the condition"
          : featureId.startsWith("fact:genome:")
            ? genomeNamed(r.quote, featureId.slice(12))
            : !population && !namedIn(r.quote, paper.abstract, featureNames)
              ? "the quote does not name the feature"
              : null;
    // a share is P(condition | feature) and is scored as a mixture, so the
    // row keeps the share itself, and the population it was counted in
    const fromShare =
      modifier && share != null && (r.kind === "cause" || r.times == null);
    const pop = fromShare ? populationOf(paper) : null;
    return {
      ...base,
      featureId,
      conditionOn: fromShare ? { ...on, share, ...(pop ?? {}) } : on,
      lrPos: lr.lrPos,
      lrNeg: lr.lrNeg,
      grade,
      causeOf,
      decision: unnamed ? "rejected" : j.decision,
      reason:
        unnamed ??
        (j.decision !== "rejected" && (grade === "D" || grade === "E")
          ? `${j.reason}; grade ${grade} is stored, never scored`
          : j.reason),
    };
  });

  const promote = promoted(
    out
      .filter((p) => p.kind !== "condition" && p.conditionId && p.grade)
      .map((p) => ({
        conditionId: p.conditionId!,
        ring2: p.ring2,
        grade: p.grade!,
        decision: p.decision,
      })),
  );
  const settled = out.map((p) =>
    p.ring2 &&
    p.conditionId &&
    !promote.has(p.conditionId) &&
    p.decision !== "rejected"
      ? {
          ...p,
          decision: "rejected" as const,
          reason: "ring-2 condition not promoted: no A/B rule accepted",
        }
      : p.kind === "condition" && p.decision === "accepted"
        ? { ...p, reason: "promoted: an A/B rule was accepted" }
        : p,
  );
  // a rule on C reading X, where X already reads C, closes a cycle nobody can
  // score in order. Cause rules go first: C reading its cause's parent X is
  // the direction the case track asks for.
  if (ctx.needs) {
    const needs = new Map(
      [...ctx.needs].map(([k, v]) => [k, new Set(v)] as const),
    );
    const order = settled
      .map((p, i) => ({ p, i }))
      .sort((a, b) => +(b.p.kind === "cause") - +(a.p.kind === "cause"));
    for (const { p, i } of order) {
      const x = p.featureId?.startsWith("hypothesis:")
        ? p.featureId.slice("hypothesis:".length)
        : null;
      if (p.decision === "rejected" || !x || !p.conditionId) continue;
      if (reads(needs, x, p.conditionId))
        settled[i] = {
          ...p,
          decision: "rejected",
          reason: `closes a reading cycle: ${x} already reads ${p.conditionId}`,
        };
      else
        needs.set(
          p.conditionId,
          (needs.get(p.conditionId) ?? new Set()).add(x),
        );
    }
  }
  return { proposals: settled, promote: [...promote] };
}

/* ── the overlay ──────────────────────────────────────────────────────── */

export interface CatalogOverlay {
  evidence: EvidenceRow[];
  modifiers: ModifierRow[];
  /** ring-2 ids this run promoted */
  promote: string[];
  /** the promoted conditions as the engine reads them, rules included */
  conditions: Hypothesis[];
}

const scores = (p: CaseProposal) =>
  (p.decision === "accepted" || p.decision === "review") &&
  p.grade !== "D" &&
  p.grade !== "E";

/** The accepted proposals as the rows `hkb_evidence`/`hkb_prior_modifiers` take. */
export function overlayRows(proposals: CaseProposal[]): {
  evidence: EvidenceRow[];
  modifiers: ModifierRow[];
} {
  const evidence: EvidenceRow[] = [];
  const modifiers: ModifierRow[] = [];
  for (const p of proposals) {
    if (!p.conditionId || !p.featureId || !p.conditionOn || p.lrPos == null)
      continue;
    if (!scores(p) && p.decision !== "held") continue;
    if (p.kind === "evidence")
      evidence.push({
        id: proposalId(p.conditionId, p.featureId, {
          pmid: null,
          doi: p.doi,
          title: p.paper?.title ?? "",
        } as Paper),
        conditionId: p.conditionId,
        featureId: p.featureId,
        conditionOn: p.conditionOn,
        lrPos: p.lrPos,
        lrNeg: p.lrNeg,
        grade: p.grade!,
        source: p.source ?? "",
        population: null,
        confoundedBy: null,
        ...statusOf(p.decision),
      });
    else if ((p.kind === "modifier" || p.kind === "cause") && scores(p))
      modifiers.push({
        conditionId: p.conditionId,
        featureId: p.featureId,
        conditionOn: p.conditionOn,
        times: p.lrPos,
        // "cause of <id>" is what makes the hunches read it as a cause link
        why: `${p.featureId} (${p.grade}; case research${p.causeOf ? `, cause of ${p.causeOf}` : ""}, doi:${p.doi})`,
        grade: p.grade,
        source: p.source,
      });
  }
  return { evidence, modifiers };
}

/**
 * Score order: whoever reads another condition's probability goes after it.
 * The overlay can add a `hypothesis:` read the database order never saw.
 */
function reorder(catalog: Catalog): Catalog {
  const ids = new Set(catalog.map((h) => h.id));
  const needs = (h: Hypothesis) =>
    [
      h.requires?.id,
      ...h.evidence.map((e) => e.input.hypothesis),
      ...h.priors.modifiers.map((m) => m.when.hypothesis),
    ].filter((id): id is string => !!id && id !== h.id && ids.has(id));
  const out: Hypothesis[] = [];
  const done = new Set<string>();
  const queue = [...catalog];
  while (queue.length) {
    const i = queue.findIndex((h) => needs(h).every((n) => done.has(n)));
    // ponytail: a cycle keeps the queue head first, as `rowsToCatalog` does
    const [next] = queue.splice(i === -1 ? 0 : i, 1);
    out.push(next!);
    done.add(next!.id);
  }
  return out;
}

/** The catalog with a case run's rules merged in, in memory. */
export function withOverlay(
  catalog: Catalog,
  overlay: CatalogOverlay,
): Catalog {
  const present = new Set(catalog.map((h) => h.id));
  const merged = catalog.map((h) => {
    const ev = overlay.evidence.filter(
      (e) =>
        e.conditionId === h.id &&
        e.status === "accepted" &&
        e.grade !== "D" &&
        e.grade !== "E",
    );
    const mods = overlay.modifiers.filter((m) => m.conditionId === h.id);
    if (!ev.length && !mods.length) return h;
    return {
      ...h,
      // one factor per input in the engine, so a rule on an input the catalog
      // already reads competes with it rather than stacking on it
      evidence: [...h.evidence, ...pooledEvidence(ev)],
      priors: {
        ...h.priors,
        modifiers: [...h.priors.modifiers, ...mods.map(modifierOf)],
      },
    };
  });
  return reorder([
    ...merged,
    ...overlay.conditions.filter((h) => !present.has(h.id)),
  ]);
}

/* ── the best read ────────────────────────────────────────────────────── */

export interface BestRead {
  name: string;
  p: number;
  why: string[];
  sources: { doi: string; title: string; grade: Grade }[];
  confirmWith: { doctor: string; tests: string[] };
  /** "Our best read: …" */
  sentence: string;
}

export const BEST_READ_WEIGHT = 0.35;
const LOUD = new Set(["possible", "likely", "confirmed"]);

/**
 * Who confirms it, read off the condition's own management text. ponytail: a
 * word list, not a medical rule; "your GP" when the text names nobody.
 */
const SPECIALTY: [RegExp, string][] = [
  [
    /gastroenterolog|endoscop|biopsy|colonoscop|gastroscop/i,
    "gastroenterologist",
  ],
  [/endocrinolog/i, "endocrinologist"],
  [/haematolog|hematolog/i, "haematologist"],
  [/rheumatolog/i, "rheumatologist"],
  [/cardiolog/i, "cardiologist"],
  [/hepatolog/i, "hepatologist"],
  [/nephrolog/i, "nephrologist"],
  [/neurolog/i, "neurologist"],
  [/gynaecolog|gynecolog/i, "gynaecologist"],
  [/dermatolog/i, "dermatologist"],
];

/** Who confirms a condition, from its management text; "your GP" when it names nobody. */
export const specialtyOf = (management: string | undefined): string =>
  SPECIALTY.find(([re]) => re.test(management ?? ""))?.[1] ?? "your GP";

const doiOf = (source: string) =>
  source.match(/doi:\s*([^\s;]+)/i)?.[1] ?? null;

/**
 * "Our best read": the top explanation of a hunch, when it holds at least
 * 0.35 of the hunch or the engine already calls it possible or louder.
 */
export function bestReadOf(
  hunch: { explanations: HunchExplanation[] | null },
  beliefs: Record<
    string,
    { p: number; state: string; for?: HypothesisResult["for"] }
  > | null,
  catalog: Catalog,
): BestRead | null {
  const expl = hunch.explanations ?? [];
  if (!expl.length) return null;
  const top = expl.reduce((a, b) => (b.weight > a.weight ? b : a));
  const belief = top.conditionId ? beliefs?.[top.conditionId] : undefined;
  if (top.weight < BEST_READ_WEIGHT && !(belief && LOUD.has(belief.state)))
    return null;
  const h = top.conditionId
    ? catalog.find((c) => c.id === top.conditionId)
    : undefined;
  const name = h?.name ?? top.text;
  const p = +(belief?.p ?? top.weight).toFixed(2);

  const fired = [...(belief?.for ?? [])].sort((a, b) => b.lr - a.lr);
  const why = [
    top.text !== name ? top.text : null,
    ...fired.map((f) => `${f.input} ${f.value} (LR ${f.lr}, grade ${f.grade})`),
  ]
    .filter((w): w is string => !!w)
    .slice(0, 3);

  const rules = h
    ? fired.length
      ? h.evidence.filter((e) => fired.some((f) => f.rule === e.id))
      : h.evidence.filter((e) => e.lr > 1)
    : [];
  const seen = new Set<string>();
  const sources = [
    ...(top.source ? [{ source: top.source, grade: top.grade }] : []),
    ...rules.flatMap((r) =>
      r.sources?.length
        ? r.sources.map((s) => ({ source: s.source, grade: s.grade }))
        : [{ source: r.source, grade: r.grade }],
    ),
  ]
    .map((s) => ({
      doi: doiOf(s.source),
      title: s.source.split(";")[0]!.trim(),
      grade: s.grade,
    }))
    .filter((s): s is { doi: string; title: string; grade: Grade } => {
      if (!s.doi || seen.has(s.doi)) return false;
      seen.add(s.doi);
      return true;
    })
    .sort((a, b) => a.grade.localeCompare(b.grade))
    .slice(0, 3);

  const tests = [...(h?.discriminators ?? [])]
    .sort((a, b) => b.lrPos - a.lrPos || a.cost - b.cost)
    .slice(0, 3)
    .map((d) => d.test);
  const doctor = specialtyOf(h?.management);

  return {
    name,
    p,
    why,
    sources,
    confirmWith: { doctor, tests },
    sentence: `Our best read: ${name} (${Math.round(p * 100)} %).${tests.length ? ` Confirm with ${doctor}: ${tests.join(", ")}.` : ""}`,
  };
}

/* ── the run ──────────────────────────────────────────────────────────── */

/** Abstracts per proposal call, and papers per case. */
export const READ_BATCH = 4;
export const MAX_PAPERS = 12;
/** Papers the cause track adds, and conditions the abstracts can add. */
export const MAX_CAUSE_PAPERS = 6;
export const MAX_CANDIDATES = 8;
/** Relevance-ranked hits kept per query before the design pre-rank. */
export const PER_QUERY = 8;
export const DEFAULT_BUDGET_USD = 0.3;
/** Bump when a prompt changes, so the paper-read cache does not serve old reads. */
export const PROMPT_VERSION = "41c-3";

const hash = (s: string) =>
  createHash("sha1").update(s).digest("hex").slice(0, 16);

/** What a model call cost: OpenRouter's own figure, else a token estimate. */
export function costOf(res: {
  usage?: { inputTokens?: number; outputTokens?: number };
  providerMetadata?: Record<string, unknown>;
}): number {
  const or = res.providerMetadata?.openrouter as
    | { usage?: { cost?: number } }
    | undefined;
  if (typeof or?.usage?.cost === "number") return or.usage.cost;
  const raw = (res.usage as { raw?: { cost?: number } } | undefined)?.raw;
  if (typeof raw?.cost === "number") return raw.cost;
  // ponytail: Gemini Flash list prices, rounded up; only used when the
  // provider did not report a cost
  return (
    ((res.usage?.inputTokens ?? 0) * 0.5 + (res.usage?.outputTokens ?? 0) * 3) /
    1e6
  );
}

/** A condition as the proposal call sees it; a candidate lists its tests. */
export interface CaseCondition {
  id: string;
  name: string;
  tests?: string[];
  ring2?: boolean;
}

/** The seams the test replaces: the two model calls and the paper search. */
export interface CaseDeps {
  ask: (
    summary: CaseSummary,
  ) => Promise<{ queries: RawQuery[]; costUsd: number }>;
  search: (
    queries: string[],
    asOf?: string,
    designs?: string,
  ) => Promise<Paper[]>;
  read: (
    papers: Paper[],
    summary: CaseSummary,
    conditions: CaseCondition[],
    features: Feature[],
  ) => Promise<{ items: RawProposal[]; costUsd: number }>;
  /** conditions the papers name, with their features and tests */
  widen?: (
    papers: Paper[],
    summary: CaseSummary,
  ) => Promise<{ conditions: CaseCondition[]; features: Feature[] }>;
}

export interface CaseRun {
  queries: string[];
  rejectedQueries: { query: string; why: string }[];
  /** the cause track's own queries, and what it found */
  causeQueries: string[];
  causePapers: Paper[];
  papers: Paper[];
  /** the conditions the abstracts named, beyond the case's */
  candidates: CaseCondition[];
  /** what the proposal call was offered, candidates included */
  conditions: CaseCondition[];
  features: Feature[];
  raw: RawProposal[];
  costUsd: number;
  /** the budget ran out before every batch was read */
  stopped: boolean;
  /** the paper search could not run ("Europe PMC unavailable: HTTP 503") */
  failed?: string;
}

/**
 * Summary → queries → papers → proposals, under a budget. Pure apart from its
 * deps: the budget is checked before every model call, so a run stops cleanly
 * between calls rather than in the middle of one.
 */
export async function runCase(
  summary: CaseSummary,
  deps: CaseDeps,
  ctx: {
    asOf?: string;
    budgetUsd: number;
    conditions: CaseCondition[];
    features: Feature[];
    /** papers read first: the ones the watch filed for this case (42D) */
    seeds?: Paper[];
  },
): Promise<CaseRun> {
  const seeds = ctx.seeds ?? [];
  const run: CaseRun = {
    queries: [],
    rejectedQueries: [],
    causeQueries: causeQueries(summary),
    causePapers: [],
    papers: [],
    candidates: [],
    conditions: ctx.conditions,
    features: ctx.features,
    raw: [],
    costUsd: 0,
    stopped: false,
  };
  if (ctx.budgetUsd <= 0) return { ...run, stopped: true };
  const asked = await deps.ask(summary);
  run.costUsd += asked.costUsd;
  const { accepted, rejected } = checkQueries(asked.queries, summary);
  run.queries = withFailureQuery(accepted, summary).map((q) => q.query);
  run.rejectedQueries = rejected.map((r) => ({
    query: r.query.query,
    why: r.why,
  }));
  if (!run.queries.length && !run.causeQueries.length && !seeds.length)
    return run;

  let main: Paper[];
  try {
    main = run.queries.length
      ? (await deps.search(run.queries, ctx.asOf)).slice(0, MAX_PAPERS)
      : [];
    run.causePapers = run.causeQueries.length
      ? (await deps.search(run.causeQueries, ctx.asOf, CAUSE_DESIGNS)).slice(
          0,
          MAX_CAUSE_PAPERS,
        )
      : [];
  } catch (e) {
    // no papers because the search was down is not "no papers exist"
    if (!(e instanceof EpmcUnavailable)) throw e;
    console.error(`[cases] ${e.message}`);
    return { ...run, failed: e.message };
  }
  const seen = new Set<string>();
  run.papers = [...seeds, ...main, ...run.causePapers].filter((p) => {
    const k = p.doi?.toLowerCase();
    return !k || (!seen.has(k) && !!seen.add(k));
  });

  if (deps.widen) {
    const more = await deps.widen(run.papers, summary);
    const had = new Set(ctx.conditions.map((c) => c.id));
    run.candidates = more.conditions;
    run.conditions = [
      ...ctx.conditions.map(
        (c) => more.conditions.find((m) => m.id === c.id) ?? c,
      ),
      ...more.conditions.filter((m) => !had.has(m.id)),
    ];
    const fids = new Set(ctx.features.map((f) => f.id));
    run.features = [
      ...ctx.features,
      ...more.features.filter((f) => !fids.has(f.id) && fids.add(f.id)),
    ];
  }

  for (let i = 0; i < run.papers.length; i += READ_BATCH) {
    if (run.costUsd >= ctx.budgetUsd) {
      run.stopped = true;
      break;
    }
    const batch = run.papers.slice(i, i + READ_BATCH);
    const out = await deps.read(batch, summary, run.conditions, run.features);
    run.costUsd += out.costUsd;
    for (const item of out.items)
      run.raw.push({ ...item, paperIndex: i + item.paperIndex });
  }
  return run;
}

/* ── the live deps ────────────────────────────────────────────────────── */

const OR_USAGE = { openrouter: { usage: { include: true } } };

/**
 * Case research's own model: `AI_CASE_MODEL`, else `AI_DEFAULT_MODEL`.
 * `AI_CASE_REASONING` (low | medium | high) turns the provider's reasoning on.
 * Temperature 0 where the model takes one: not with reasoning, and not on
 * Anthropic's models through OpenRouter, which list no temperature.
 */
export function caseModelSettings(modelId?: string) {
  const id =
    modelId ??
    process.env.AI_CASE_MODEL ??
    process.env.AI_DEFAULT_MODEL ??
    DEFAULT_MODEL;
  const effort = process.env.AI_CASE_REASONING?.trim();
  return {
    id,
    // Anthropic lists no temperature; Gemini keeps 0 with reasoning on.
    ...(id.startsWith("anthropic/") ? {} : { temperature: 0 }),
    providerOptions: {
      openrouter: {
        ...OR_USAGE.openrouter,
        ...(effort ? { reasoning: { effort } } : {}),
      },
    },
  };
}

async function cached<T>(script: string, notes: string): Promise<T | null> {
  const [row] = await getDb()
    .select({ rows: hkbImportRuns.rows })
    .from(hkbImportRuns)
    .where(
      and(eq(hkbImportRuns.script, script), eq(hkbImportRuns.notes, notes)),
    )
    .limit(1);
  return (row?.rows as unknown as T) ?? null;
}

const remember = (script: string, notes: string, value: unknown) =>
  recordRun(script, value as Record<string, number>, notes);

/**
 * Europe PMC answers, kept for the life of the process: repeated runs (the
 * stability check, a replay's two checkpoints) fetch each paper once and
 * write nothing. ponytail: unbounded; a long-lived server would want an LRU.
 */
const MEMO = new Map<string, Promise<unknown>>();
/** The process cache keeps successes only: a failed call is asked again. */
export const memo = <T>(key: string, f: () => Promise<T>): Promise<T> => {
  if (!MEMO.has(key))
    MEMO.set(
      key,
      f().catch((e) => {
        MEMO.delete(key);
        throw e;
      }),
    );
  return MEMO.get(key) as Promise<T>;
};

/** Europe PMC for case research: a search that did not run throws. */
export async function searchOrThrow(
  q: string,
  pageSize: number,
  search: typeof epmc = epmc,
): Promise<Awaited<ReturnType<typeof epmc>>> {
  const hits = await search(q, "core", pageSize);
  if (hits.failed) throw new EpmcUnavailable(hits.failed);
  return hits;
}

/**
 * The shared structured call (`generateObjectSafe`: a submit tool on
 * Anthropic, OpenAI and Meta, generateObject elsewhere), with case research's
 * own output cap: the proposals need room to reason (41F-M).
 */
async function objectCall<S extends z.ZodType>(
  modelId: string,
  schema: S,
  args: { system: string; prompt: string } & Omit<
    ReturnType<typeof caseModelSettings>,
    "id"
  >,
): Promise<{
  object: z.infer<S>;
  usage?: { inputTokens?: number; outputTokens?: number };
  providerMetadata?: Record<string, unknown>;
}> {
  return generateObjectSafe({
    model: modelId,
    schema,
    maxOutputTokens: CASE_MAX_OUTPUT_TOKENS,
    ...args,
  });
}

/** Case research's per-call output cap; the global default stays 8192. */
const CASE_MAX_OUTPUT_TOKENS = 16000;

/**
 * The live model calls and Europe PMC. `write` is false on a dry run: the
 * caches are read, never filled.
 */
export function liveDeps(opts: { write: boolean; modelId?: string }): CaseDeps {
  const { id: modelId, ...settings } = caseModelSettings(opts.modelId);
  // a cached read is only as good as the model that made it
  const tag = `${PROMPT_VERSION}|${modelId}`;
  return {
    async ask(summary) {
      const key = `${hash(
        summary.items
          .map((i) => i.key)
          .sort()
          .join(","),
      )}|${tag}`;
      const hit = await cached<RawQuery[]>("case-queries", key);
      if (hit) return { queries: hit, costUsd: 0 };
      const res = await objectCall(modelId, querySchema, {
        system: QUERY_PROMPT,
        prompt: `CASE SUMMARY (key | fact):\n${summaryText(summary)}`,
        ...settings,
      });
      if (opts.write) await remember("case-queries", key, res.object.queries);
      return { queries: res.object.queries, costUsd: costOf(res) };
    },

    async search(queries, asOf, designs = DESIGNS) {
      const perQuery: RankedPaper[][] = [];
      const ask = (q: string) =>
        memo(`epmc|${q}`, () => searchOrThrow(q, PER_QUERY));
      for (const q of queries) {
        let hits = await ask(caseQuery(q, asOf, true, designs));
        if (hits.length < MIN_STRICT_HITS)
          hits = [...hits, ...(await ask(caseQuery(q, asOf, false, designs)))];
        // Europe PMC picks the candidates, the design orders them
        perQuery.push(
          preRank(
            dedupeRanked(
              hits.map((h) => toRanked(h as Parameters<typeof toRanked>[0])),
            ),
          ),
        );
      }
      // round robin over the queries, so one broad query cannot take all twelve
      const order: RankedPaper[] = [];
      const seen = new Set<string>();
      for (let i = 0; perQuery.some((l) => l[i]); i++)
        for (const list of perQuery) {
          const p = list[i];
          const key = p?.doi?.toLowerCase() ?? p?.pmid ?? p?.title;
          if (!p || !key || seen.has(key)) continue;
          seen.add(key);
          order.push(p);
        }
      const todo = order
        .filter((p) => p.doi && !p.retracted)
        .slice(0, MAX_PAPERS * 3);
      const withText = await memo(
        `abstracts|${todo.map((p) => p.doi).join(",")}`,
        () => withAbstracts(todo, { strict: true }),
      );
      const out: Paper[] = [];
      for (const p of withText) {
        if (out.length >= MAX_PAPERS) break;
        if (OFF_TOPIC.test(p.title)) continue;
        if (asOf && p.year != null && p.year > Number(asOf.slice(0, 4)))
          continue;
        const ok = await memo(`verify|${p.doi}`, () =>
          verify(p, { strict: true }),
        );
        if (ok) out.push(ok);
      }
      return out;
    },

    async read(papers, summary, conditions, features) {
      const fkey = hash(
        JSON.stringify([
          conditions.map((c) => c.id),
          features.map((f) => f.id),
        ]),
      );
      const items: RawProposal[] = [];
      const todo: { p: Paper; i: number }[] = [];
      for (const [i, p] of papers.entries()) {
        const hit = await cached<RawProposal[]>(
          "case-read",
          `${p.doi}|${fkey}|${tag}`,
        );
        if (hit) items.push(...hit.map((r) => ({ ...r, paperIndex: i + 1 })));
        else todo.push({ p, i });
      }
      if (!todo.length) return { items, costUsd: 0 };
      const numbered = todo
        .map(
          ({ p }, k) =>
            `[${k + 1}] ${p.title} (${p.journal ?? "?"} ${p.year ?? "?"}) doi:${p.doi}\n${p.abstract}`,
        )
        .join("\n\n");
      const res = await objectCall(modelId, proposalsSchema, {
        system: READ_PROMPT,
        prompt:
          `CASE SUMMARY:\n${summaryText(summary)}\n\n` +
          `CONDITIONS (id | name | tests):\n${conditions.map((c) => `${c.id} | ${c.name}${c.tests?.length ? ` | ${c.tests.join(", ")}` : ""}`).join("\n")}\n\n` +
          `OPEN CAUSES (id | name):\n${
            summary.items
              .filter((i) => i.kind === "cause")
              .map((i) => `${i.key.slice(6)} | ${i.terms?.[0] ?? ""}`)
              .join("\n") || "none"
          }\n\n` +
          `FEATURES (id | name):\n${features.map((f) => `${f.id} | ${f.name}${f.unit ? ` (${f.unit})` : ""}`).join("\n")}\n\n` +
          `ABSTRACTS:\n${numbered}`,
        ...settings,
      });
      if (process.env.CASE_DEBUG)
        console.error(
          `[cases] read ${todo.length} papers, ${res.object.items.length} items`,
          process.env.CASE_DEBUG === "raw"
            ? JSON.stringify(res.object.items)
            : "",
        );
      for (const [k, { p, i }] of todo.entries()) {
        const mine = (res.object.items as RawProposal[]).filter(
          (r) => r.paperIndex === k + 1,
        );
        items.push(...mine.map((r) => ({ ...r, paperIndex: i + 1 })));
        if (opts.write)
          await remember("case-read", `${p.doi}|${fkey}|${tag}`, mine);
      }
      return { items, costUsd: costOf(res) };
    },
  };
}

/* ── names: conditions the abstracts mention, markers the app knows ───── */

export interface NamedCondition {
  id: string;
  name: string;
  ring: 1 | 2;
  names: string[];
}

/** Two names share a word: a MONDO term that shares none is a wrong mapping. */
const shareAWord = (a: string, b: string) => {
  const wb = wordsOf(b);
  return wordsOf(a).some((w) =>
    wb.some(
      (x) => x === w || (w.length >= 7 && x.slice(0, 7) === w.slice(0, 7)),
    ),
  );
};

/**
 * Every condition the abstracts name, ring 1 or 2, by its name or a MONDO
 * synonym, word for word; an abbreviation never names one here (a paper
 * that defines it spells the long name out first). Ring 1 first, then by how many abstracts name it. ponytail:
 * n-gram lookup of normalised words, no stemming beyond a plural.
 */
export function mentionedConditions(
  papers: Paper[],
  all: NamedCondition[],
  skip: Set<string>,
  max = MAX_CANDIDATES,
): { id: string; ring: 1 | 2; papers: number }[] {
  const grams = papers.map((p) => {
    const w = wordsOf(`${p.title} ${p.abstract}`);
    const g = new Set<string>();
    for (let i = 0; i < w.length; i++)
      for (let n = 1; n <= 6 && i + n <= w.length; n++)
        g.add(w.slice(i, i + n).join(" "));
    return g;
  });
  const found: { id: string; ring: 1 | 2; papers: number }[] = [];
  for (const c of all) {
    if (skip.has(c.id)) continue;
    const keys = [
      ...new Set(
        c.names
          .flatMap(nameParts)
          .filter((n) => !isAbbr(n))
          .map((n) => wordsOf(n).join(" "))
          // one short word ("pain", "gout") says too little on its own
          .filter((k) => k.length >= 5 && !/^[\d. ]+$/.test(k)),
      ),
    ];
    const hits = grams.filter((g) => keys.some((k) => g.has(k))).length;
    if (hits) found.push({ id: c.id, ring: c.ring, papers: hits });
  }
  return found
    .sort(
      (a, b) =>
        a.ring - b.ring || b.papers - a.papers || a.id.localeCompare(b.id),
    )
    .slice(0, max);
}

let conditionNamesOnce: Promise<NamedCondition[]> | null = null;
/** Every hkb condition with its MONDO name and synonyms, once per process. */
export function allConditionNames(): Promise<NamedCondition[]> {
  conditionNamesOnce ??= getDb()
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      ring: hkbConditions.ring,
      inCatalog: hkbConditions.inCatalog,
      term: hkbTerms.name,
      synonyms: hkbTerms.synonyms,
    })
    .from(hkbConditions)
    .leftJoin(hkbTerms, eq(hkbTerms.id, hkbConditions.mondoId))
    .then((rows) =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        ring: (r.inCatalog || r.ring === 1 ? 1 : 2) as 1 | 2,
        // a MONDO id that points at another disease brings none of its names
        names: [
          r.name,
          ...(r.term && shareAWord(r.name, r.term)
            ? [r.term, ...(r.synonyms ?? [])]
            : []),
        ],
      })),
    );
  return conditionNamesOnce;
}

let metricsOnce: Promise<{
  index: Map<string, { code: string; unit: string | null }>;
  names: Map<string, string[]>;
}> | null = null;
/** Every metric by `normalizeName` of its code, name and aliases. */
export function knownMetrics() {
  metricsOnce ??= getDb()
    .select({
      code: metrics.code,
      name: metrics.name,
      unit: metrics.unit,
      aliases: metrics.aliases,
    })
    .from(metrics)
    .then((rows) => {
      const index = new Map<string, { code: string; unit: string | null }>();
      const names = new Map<string, string[]>();
      for (const r of rows) {
        const all = [r.code.replace(/_/g, " "), r.name, ...(r.aliases ?? [])];
        names.set(`metric:${r.code}`, all);
        for (const n of all) {
          const k = normalizeName(n);
          if (k && !index.has(k)) index.set(k, { code: r.code, unit: r.unit });
        }
      }
      return { index, names };
    });
  return metricsOnce;
}

/**
 * The live `widen`: the conditions the papers name that the case did not
 * already offer features for, each with its own features and its tests.
 */
export function liveWiden(
  catalog: { id: string; name: string }[],
): NonNullable<CaseDeps["widen"]> {
  return async (papers, summary) => {
    const all = await allConditionNames();
    const offered = new Set(summary.beliefs.map((b) => b.id));
    const found = mentionedConditions(papers, all, offered);
    if (!found.length) return { conditions: [], features: [] };
    const ids = found.map((f) => f.id);
    const [tests, features] = await Promise.all([
      getDb()
        .select({
          conditionId: hkbConditionTests.conditionId,
          name: hkbTests.name,
        })
        .from(hkbConditionTests)
        .innerJoin(hkbTests, eq(hkbTests.id, hkbConditionTests.testId))
        .where(inArray(hkbConditionTests.conditionId, ids)),
      Promise.all(ids.map((id) => featuresFor(id))),
    ]);
    const byId = new Map(all.map((c) => [c.id, c]));
    return {
      conditions: found.map((f) => ({
        id: f.id,
        name: catalog.find((c) => c.id === f.id)?.name ?? byId.get(f.id)!.name,
        tests: tests.filter((t) => t.conditionId === f.id).map((t) => t.name),
        ring2: f.ring === 2,
      })),
      features: [...new Map(features.flat().map((f) => [f.id, f])).values()],
    };
  };
}

/* ── one person, end to end ───────────────────────────────────────────── */

export interface CaseResult {
  summary: CaseSummary;
  queries: string[];
  rejectedQueries: { query: string; why: string }[];
  papers: { doi: string; title: string; year: number }[];
  /** the cause track: its queries and the papers it found */
  causeQueries: string[];
  causePapers: { doi: string; title: string; year: number }[];
  /** conditions the abstracts named, offered with their features and tests */
  candidates: CaseCondition[];
  proposals: CaseProposal[];
  accepted: number;
  costUsd: number;
  stopped: boolean;
  catalogOverlay?: CatalogOverlay;
  /** the paper search could not run: nothing was judged or saved */
  failed?: string;
  /** the engine's beliefs before and after, two points or more (42D) */
  moves: CaseMove[];
}

/** The kind `hkb_features` files a feature under, by its prefix. */
const featureKind = (id: string) =>
  id.startsWith("hypothesis:")
    ? "hypothesis"
    : id.startsWith("fact:genome:")
      ? "genetic"
      : id.startsWith("metric:")
        ? "lab"
        : "fact";

export async function researchCase(
  userId: string,
  opts: {
    asOf?: string;
    dryRun?: boolean;
    budgetUsd?: number;
    deps?: CaseDeps;
    /** dated facts laid over the profile, as the blind replay seeds them */
    seed?: Record<string, unknown>;
    /** DOIs the condition watch filed for this case, read first (42D) */
    seedDois?: string[];
  } = {},
): Promise<CaseResult> {
  const db = getDb();
  const { buildModelInput } = await import("./coverage");
  const { priorFor, scoreHypotheses } = await import("./hypotheses");
  const { refreshHunches } = await import("./hunches");
  const budgetUsd =
    opts.budgetUsd ?? Number(process.env.CASE_BUDGET_USD ?? DEFAULT_BUDGET_USD);

  const input = await buildModelInput(userId, opts.asOf, opts.seed);
  const catalog = await catalogFor(userId);
  const results = scoreHypotheses(input, { catalog });
  const beliefMap = Object.fromEntries(
    results.map((r) => [r.id, { p: r.score, state: r.state }]),
  );
  const signals = await refreshHunches(userId, input.today, {
    asOf: opts.asOf,
    dryRun: true,
    beliefs: beliefMap,
  });
  const summary = caseOf(
    input,
    [...signals.raised, ...signals.unraised],
    results,
  );

  const caseFeatures = summary.items.flatMap((i) =>
    i.feature ? [i.feature] : [],
  );
  const featureLists = await Promise.all(
    summary.beliefs.map((b) => featuresFor(b.id, { forCase: caseFeatures })),
  );
  const features = [
    ...new Map(featureLists.flat().map((f) => [f.id, f])).values(),
  ];
  const conditions = catalog.map((h) => ({
    id: h.id,
    name: h.name,
    // this person's base rate, what a printed proportion is read against
    base: priorFor(h, input).prevalence,
  }));
  const seeds = opts.seedDois?.length
    ? await (
        await import("./research-watch")
      ).watchedPapers(userId, opts.seedDois)
    : [];

  const run = await runCase(
    summary,
    opts.deps ?? {
      ...liveDeps({ write: !opts.dryRun }),
      widen: liveWiden(conditions),
    },
    {
      asOf: opts.asOf,
      budgetUsd,
      conditions,
      features,
      seeds,
    },
  );

  // ring-2 rows the proposals named, by id, name or MONDO id
  const names = run.raw
    .filter(
      (r) => !r.conditionId || !conditions.some((c) => c.id === r.conditionId),
    )
    .flatMap((r) => [r.conditionId, r.conditionName, r.mondoId])
    .filter((s): s is string => !!s?.trim())
    .map((s) => s.trim());
  const ring2Rows = names.length
    ? await db
        .select()
        .from(hkbConditions)
        .where(
          and(
            eq(hkbConditions.ring, 2),
            or(
              inArray(hkbConditions.id, names),
              inArray(hkbConditions.mondoId, names),
              inArray(
                sql`lower(${hkbConditions.name})`,
                names.map((n) => n.toLowerCase()),
              ),
            ),
          ),
        )
    : [];
  const ring2 = new Map<string, { id: string; name: string }>();
  for (const c of run.candidates.filter((c) => c.ring2))
    ring2.set(c.id, { id: c.id, name: c.name });
  for (const r of ring2Rows) {
    ring2.set(r.id, r);
    ring2.set(r.name.toLowerCase(), r);
    if (r.mondoId) ring2.set(r.mondoId, r);
  }

  const verified = await db
    .select({
      conditionId: hkbEvidence.conditionId,
      featureId: hkbEvidence.featureId,
      conditionOn: hkbEvidence.conditionOn,
      lrPos: hkbEvidence.lrPos,
    })
    .from(hkbEvidence)
    .where(inArray(hkbEvidence.status, ["seed", "accepted"]));
  const peers = new Map<string, number[]>();
  for (const e of verified) {
    const k = peerKey(e.conditionId, e.featureId, e.conditionOn);
    peers.set(k, [...(peers.get(k) ?? []), e.lrPos]);
  }

  const [named, known] = await Promise.all([
    allConditionNames(),
    knownMetrics(),
  ]);
  const { proposals, promote } = judgeProposals(run.raw, {
    papers: run.papers,
    catalog: new Map(conditions.map((c) => [c.id, c])),
    ring2,
    features: run.features,
    summary,
    names: new Map([
      ...named.map((c) => [c.id, c.names] as [string, string[]]),
      ...known.names,
    ]),
    metrics: known.index,
    peers,
    thisYear: Number(input.today.slice(0, 4)),
    needs: needsOf(catalog),
  });
  const rows = overlayRows(proposals);
  const promotable = [
    ...ring2Rows,
    ...(run.candidates.some((c) => c.ring2 && promote.includes(c.id))
      ? await db
          .select()
          .from(hkbConditions)
          .where(
            inArray(
              hkbConditions.id,
              run.candidates.filter((c) => c.ring2).map((c) => c.id),
            ),
          )
      : []),
  ];
  const promotedRows = [
    ...new Map(
      promotable.filter((r) => promote.includes(r.id)).map((r) => [r.id, r]),
    ).values(),
  ];
  // the rules of a promoted condition carry the admin chip
  for (const e of rows.evidence)
    if (promote.includes(e.conditionId)) e.needsLook = true;

  const result: CaseResult = {
    summary,
    queries: run.queries,
    rejectedQueries: run.rejectedQueries,
    papers: run.papers.map((p) => ({
      doi: p.doi ?? "",
      title: p.title,
      year: p.year ?? 0,
    })),
    causeQueries: run.causeQueries,
    causePapers: run.causePapers.map((p) => ({
      doi: p.doi ?? "",
      title: p.title,
      year: p.year ?? 0,
    })),
    candidates: run.candidates,
    proposals,
    accepted: proposals.filter((p) => p.decision === "accepted").length,
    costUsd: +run.costUsd.toFixed(4),
    stopped: run.stopped,
    moves: [],
    ...(run.failed ? { failed: run.failed } : {}),
  };

  // a run whose search was down learned nothing, so it saves nothing either
  if (run.failed) return result;
  if (opts.dryRun) {
    result.catalogOverlay = {
      ...rows,
      promote,
      conditions: promotedRows.length
        ? await promotedHypotheses(promotedRows as ConditionRow[], rows)
        : [],
    };
    result.moves = movesOf(
      results,
      scoreHypotheses(input, {
        catalog: withOverlay(catalog, result.catalogOverlay),
      }),
      proposals,
    );
    return result;
  }

  await saveCase(
    userId,
    opts.asOf,
    rows,
    promotedRows.map((r) => r.id),
    result,
    // the beliefs after the save, off the catalog it grew (42D)
    async () =>
      movesOf(
        results,
        scoreHypotheses(input, { catalog: await catalogFor(userId) }),
        proposals,
      ),
  );
  return result;
}

/** The promoted ring-2 rows as hypotheses, with this run's rules on them. */
async function promotedHypotheses(
  conditions: ConditionRow[],
  rows: { evidence: EvidenceRow[]; modifiers: ModifierRow[] },
): Promise<Hypothesis[]> {
  const db = getDb();
  const ids = conditions.map((c) => c.id);
  const [features, priors, links, stored] = await Promise.all([
    db.select().from(hkbFeatures),
    db.select().from(hkbPriors).where(inArray(hkbPriors.conditionId, ids)),
    db
      .select()
      .from(hkbConditionTests)
      .where(inArray(hkbConditionTests.conditionId, ids)),
    db.select().from(hkbEvidence).where(inArray(hkbEvidence.conditionId, ids)),
  ]);
  const tests = links.length
    ? await db
        .select()
        .from(hkbTests)
        .where(
          inArray(
            hkbTests.id,
            links.map((l) => l.testId),
          ),
        )
    : [];
  return rowsToCatalog({
    conditions: conditions.map((c) => ({ ...c, inCatalog: true })),
    features,
    priors,
    modifiers: rows.modifiers.filter((m) => ids.includes(m.conditionId)),
    evidence: [
      ...(stored as EvidenceRow[]),
      ...rows.evidence.filter((e) => ids.includes(e.conditionId)),
    ],
    tests,
    links,
  } as CatalogRows);
}

/** Not a dry run: the rules, the features they need, the promotions, one revision. */
async function saveCase(
  userId: string,
  asOf: string | undefined,
  rows: { evidence: EvidenceRow[]; modifiers: ModifierRow[] },
  promote: string[],
  result: CaseResult,
  movesAfter: () => Promise<CaseMove[]>,
) {
  const db = getDb();
  const needed = [
    ...new Set([...rows.evidence, ...rows.modifiers].map((r) => r.featureId)),
  ];
  for (const id of needed)
    await db
      .insert(hkbFeatures)
      .values({
        id,
        kind: featureKind(id),
        name: id.split(":").slice(1).join(":").replace(/_/g, " "),
        unit: null,
        mintedFrom: "case research",
      })
      .onConflictDoNothing();
  if (rows.evidence.length)
    await db
      .insert(hkbEvidence)
      .values(
        rows.evidence.map((e) => {
          const p = result.proposals.find(
            (x) =>
              x.kind === "evidence" &&
              x.featureId === e.featureId &&
              x.conditionId === e.conditionId &&
              JSON.stringify(x.conditionOn) === JSON.stringify(e.conditionOn),
          );
          return {
            ...e,
            needsLook: e.needsLook ?? false,
            reviewNote: "origin: paper (case research, phase 41C)",
            paper: p?.paper
              ? {
                  pmid: null,
                  doi: p.doi,
                  title: p.paper.title,
                  year: p.paper.year,
                  journal: null,
                  url: `https://doi.org/${p.doi}`,
                  quote: p.quote,
                }
              : null,
          };
        }),
      )
      .onConflictDoNothing();
  if (rows.modifiers.length)
    await db
      .insert(hkbPriorModifiers)
      .values(rows.modifiers)
      .onConflictDoNothing();
  if (promote.length)
    await db
      .update(hkbConditions)
      .set({ inCatalog: true })
      .where(inArray(hkbConditions.id, promote));
  forgetCatalog();
  result.moves = await movesAfter();
  await recordRun(
    "case-run",
    {
      queries: result.queries.length,
      papers: result.papers.length,
      proposals: result.proposals.length,
      accepted: result.accepted,
      promoted: promote.length,
      costMicroUsd: Math.round(result.costUsd * 1e6),
      // ponytail: the column is typed as counters; the moves ride in the same jsonb
      moves: result.moves as unknown as number,
    },
    `${userId}:${asOf ?? "now"}`,
  );
  if (rows.evidence.length || rows.modifiers.length || promote.length) {
    await recordRevision(
      revisionSummary(result.moves, {
        rules: rows.evidence.length,
        modifiers: rows.modifiers.length,
        promoted: promote.length,
      }),
    );
    // the open hunches fill again off the grown catalog on the next refresh
    const { forgetExplanations } = await import("./hunches");
    await forgetExplanations(userId);
  }
}

/** At most one case run a day per user, for the curator's post-upload pass. */
export const caseRunDue = (userId: string) =>
  dueAgain("case-run", 1, `${userId}:`);

/* ── what a run moved, and when the daily pass runs one (42D) ─────────── */

/** A belief moved when it changed by at least two points. */
export const MOVE_POINTS = 0.02;

/** One belief a run moved, and the papers whose rules moved it. */
export interface CaseMove {
  conditionId: string;
  name: string;
  /** the engine's belief before and after, 0..1 */
  from: number;
  to: number;
  dois: string[];
  /** "Annibale 2001", one per DOI, in the same order */
  labels: string[];
}

/** "Annibale B 2001 Am J Med; doi:…" is "Annibale 2001"; no author, the DOI. */
export function paperLabel(source: string | null, doi: string): string {
  const m = source?.match(/^(.+?)\s+(\d{4})\b/);
  if (!m || m[1] === "anonymous") return doi;
  return `${m[1]!.replace(/(\s+[A-Z]{1,3}\.?)+$/, "")} ${m[2]}`;
}

/**
 * The engine's beliefs before and after a run, as the moves of two points or
 * more. Code, never the model. Pure. A move carries the DOIs of the rules the
 * run wrote on that condition; one that moved only through another (a
 * `requires` child) carries every DOI the run wrote. A run that wrote no
 * scoring rule moved nothing, whatever else changed meanwhile.
 */
export function movesOf(
  before: Pick<HypothesisResult, "id" | "name" | "score">[],
  after: Pick<HypothesisResult, "id" | "name" | "score">[],
  proposals: CaseProposal[],
): CaseMove[] {
  const wrote = proposals.filter((p) => p.decision === "accepted" && scores(p));
  if (!wrote.length) return [];
  const papersOf = (ps: CaseProposal[]) => {
    const by = new Map(ps.map((p) => [p.doi, paperLabel(p.source, p.doi)]));
    return { dois: [...by.keys()], labels: [...by.values()] };
  };
  const all = papersOf(wrote);
  const was = new Map(before.map((h) => [h.id, h.score]));
  const round = (p: number) => Math.round(p * 1000) / 1000;
  return after
    .flatMap((h) => {
      const from = was.get(h.id) ?? 0;
      // a hair under two points in floating point is still two points
      if (Math.abs(h.score - from) < MOVE_POINTS - 1e-9) return [];
      const own = papersOf(
        wrote.filter((p) => p.conditionId === h.id || p.causeOf === h.id),
      );
      return [
        {
          conditionId: h.id,
          name: h.name,
          from: round(from),
          to: round(h.score),
          ...(own.dois.length ? own : all),
        },
      ];
    })
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
}

/**
 * The revision line: the moved condition ids first, then the DOIs, so the
 * ledger's `changeOf` names what we learned ("knowledge") rather than "the
 * inputs moved".
 */
export function revisionSummary(
  moves: CaseMove[],
  n: { rules: number; modifiers: number; promoted: number },
): string {
  const line = `case research for one user: ${n.rules} rules, ${n.modifiers} modifiers, ${n.promoted} promoted`;
  if (!moves.length) return line;
  const dois = [...new Set(moves.flatMap((m) => m.dois))];
  return `${moves.map((m) => m.conditionId).join(", ")}: ${dois.map((d) => `doi:${d}`).join(", ")}; ${line}`;
}

export type DailyCase = "watch" | "weekly" | null;

/**
 * Why the daily pass reads this person's case today, or null. Pure. One run
 * a day at most, whatever the reason; a graded paper on an option of an open
 * differential skips the week; otherwise a person with an open cause or a
 * likely or confirmed belief is read again once a week.
 */
export function dailyCaseWhy(s: {
  dayDue: boolean;
  weekDue: boolean;
  open: boolean;
  seeds: string[];
}): DailyCase {
  if (!s.dayDue) return null;
  if (s.seeds.length) return "watch";
  return s.weekDue && s.open ? "weekly" : null;
}

/**
 * The DOIs of graded watch rows on an option of an open cause's differential.
 * `externalIdOf` keys a paper with a DOI by the DOI; a PMID or a title has
 * nothing a case run can seed. Pure.
 */
export function caseSeeds(
  open: { signal: unknown }[],
  graded: { conditionId: string; externalId: string }[],
): string[] {
  const options = new Set(
    open.flatMap(
      (h) =>
        (
          h.signal as { differential?: Differential | null }
        ).differential?.options.map((o) => o.id) ?? [],
    ),
  );
  return [
    ...new Set(
      graded
        .filter(
          (r) => options.has(r.conditionId) && r.externalId.startsWith("10."),
        )
        .map((r) => r.externalId),
    ),
  ];
}

const DAY_MS = 86_400_000;

/** The daily pass's case: whether it runs, and the DOIs it reads first. */
export async function dailyCase(
  userId: string,
): Promise<{ why: DailyCase; seeds: string[] }> {
  const db = getDb();
  const [open, [snap], last] = await Promise.all([
    db
      .select({ signal: hunches.signal })
      .from(hunches)
      .where(
        and(
          eq(hunches.userId, userId),
          eq(hunches.kind, "cause"),
          ne(hunches.state, "closed"),
        ),
      ),
    db
      .select({ beliefs: beliefSnapshots.beliefs })
      .from(beliefSnapshots)
      .where(eq(beliefSnapshots.userId, userId))
      .orderBy(desc(beliefSnapshots.computedAt))
      .limit(1),
    lastRun("case-run", `${userId}:`),
  ]);
  const seeds = open.length
    ? caseSeeds(
        open,
        await (await import("./research-watch")).gradedSince(userId, last),
      )
    : [];
  const loud = Object.values(snap?.beliefs ?? {}).some(
    (b) => b.state === "likely" || b.state === "confirmed",
  );
  const ago = last ? Date.now() - last.getTime() : Infinity;
  return {
    // `dueAgain`'s arithmetic, off one read of the last run
    why: dailyCaseWhy({
      dayDue: ago > DAY_MS,
      weekDue: ago > 7 * DAY_MS,
      open: open.length > 0 || loud,
      seeds,
    }),
    seeds,
  };
}
