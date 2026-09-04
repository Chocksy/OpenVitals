/**
 * The topic watch: the supplement-first feed.
 *
 * Phase 35 section B. `lib/research-watch.ts` asks Europe PMC about the
 * conditions in a person's ledger, which is the right question and never the
 * one somebody actually types. Nobody has "creatine" as a condition. A topic
 * is the other half: a named thing you take, do, or wonder about — `creatine`,
 * `omega-3`, `cold exposure`, `psyllium`.
 *
 * The run asks two questions on purpose. The first is the supporting one
 * (trials, meta-analyses, systematic reviews, cohorts); the second is the
 * contrary one (adverse, risk, cancer, safety), because a page that only ever
 * searched for the good news is an advertisement. Both sides are graded by the
 * same `gradeOf` and printed in the same rows, and a cross-sectional survey is
 * labelled an association wherever it lands.
 *
 * Nothing here writes `hkb_interventions` and nothing here moves a
 * probability. `topic_findings` is knowledge and is shared across users;
 * `topic_watch` is a person's own list.
 *
 * Pure where it can be: the queries, the pre-rank, the row projection, the
 * verdict strip, the tone and `relevanceOf` are all offline-testable, and the
 * extractor is injected exactly the way `researchCondition` injects its own.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { generateObject } from "ai";
import { z } from "zod";
import {
  getDb,
  hkbInterventions,
  paperWatch,
  protocolItems,
  topicFindings,
  topicWatch,
  type TopicFinding,
  type TopicWatch,
} from "@/db";
import { getGoals } from "./daily-data";
import { model } from "./extract";
import { matchIntervention } from "./projections";
import { featuresFor } from "./research";
import { watchConditions } from "./research-watch";
import { BETTER_HIGH, BETTER_LOW } from "./projection";
import {
  BATCH,
  cleanTitle,
  epmc,
  gradeOf,
  isRetracted,
  INTERVENTION_PROMPT,
  STUDY_TYPES,
  toPaper,
  withN,
  type ConditionRef,
  type Feature,
  type Finding,
  type Paper,
  type StudyType,
} from "./research";

const DAY_MS = 86_400_000;

/** How long a topic is left alone between runs. */
export const TOPIC_DAYS = 30;

/** How many papers per query ever reach the model. */
export const TOPIC_PAPERS = 12;

/** How many hits Europe PMC is asked for before the pre-rank cuts them down. */
export const TOPIC_PAGE = 50;

/** The prefix a `paper_watch` row wears when it came from a topic run. */
export const TOPIC_PREFIX = "topic:";

/** `paper_watch.condition_id` for a topic, so the existing feed prints it. */
export const topicConditionId = (topic: string) => `${TOPIC_PREFIX}${topic}`;

/** The topic behind a `paper_watch` row, or null when it is a condition row. */
export const topicOf = (conditionId: string): string | null =>
  conditionId.startsWith(TOPIC_PREFIX)
    ? conditionId.slice(TOPIC_PREFIX.length)
    : null;

/**
 * The key. One person watching "Creatine", "creatine " and "CREATINE" is
 * watching one topic, and the label keeps whichever way they typed it.
 */
export const normalizeTopic = (label: string): string =>
  label.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);

/* ── the two queries ──────────────────────────────────────────────────── */

const DESIGNS =
  '(randomized OR "randomised" OR "meta-analysis" OR "systematic review" OR cohort)';
const CONTRARY = '("adverse" OR "risk" OR "cancer" OR "safety")';

export interface TopicQuery {
  kind: "support" | "contrary";
  query: string;
}

/**
 * Phrases that mean something else entirely, per topic.
 *
 * A free-text search for "creatine" matches every paper that reported serum
 * creatinine or creatine kinase, which is most of nephrology and most of
 * cardiology. There is no clever general rule for this: the near-homographs
 * are a short list per topic, and the list is empty for almost every topic.
 */
export const EXCLUDE: Record<string, string[]> = {
  creatine: ["creatine kinase", "creatinine", "creatine phosphokinase"],
  "omega-3": [],
};

/** The phrases a title may not carry for this topic. */
export const excludedFor = (topic: string): string[] =>
  EXCLUDE[normalizeTopic(topic)] ?? [];

/**
 * What Europe PMC is asked, twice.
 *
 * The topic must be in the **title or the keywords**, not anywhere in the full
 * text. A free-text `"creatine"` returned dialysis pilot studies, a
 * sulforaphane trial and an ALK lung-cancer trial, all of which mention
 * creatine once in a methods table. A paper about a topic says so in its
 * title.
 *
 * The second query is not a filter on the first: it is a search that goes
 * looking for the harm, so a topic whose only bad news sits below the
 * citation cut-off of the first query still gets its row.
 */
export function topicQueries(
  topic: string,
  since: string,
  now: Date = new Date(),
): TopicQuery[] {
  const to = now.toISOString().slice(0, 10);
  const dates = `(FIRST_PDATE:[${since} TO ${to}])`;
  const named = `(TITLE:"${topic}" OR KW:"${topic}")`;
  const not = excludedFor(topic)
    .map((phrase) => ` NOT TITLE:"${phrase}"`)
    .join("");
  return [
    {
      kind: "support",
      query: `${named} AND ${DESIGNS} AND ${dates}${not}`,
    },
    {
      kind: "contrary",
      query: `${named} AND ${CONTRARY} AND ${DESIGNS} AND ${dates}${not}`,
    },
  ];
}

/** "omega-3", "omega 3" and "Omega‑3" are one word to a match. */
const loose = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[-\s]+/g, " ")
    .trim();

/**
 * Is this paper actually about the topic?
 *
 * The query already asks for the title or the keywords, but Europe PMC's
 * keyword index is generous and the second query's `OR` terms widen it
 * further. This is the floor under both: the topic has to appear in the title
 * or the abstract, and the title must not carry one of the near-homographs.
 * A paper that fails is never extracted and never filed — not filed as
 * "found, not read yet" either, because it was not found for this topic.
 *
 * Pure, so the fixture test can prove a creatine-kinase paper and a paper
 * that only mentions creatine in its body both fall out.
 */
export function onTopic(
  paper: { title: string; abstract: string },
  topic: string,
): boolean {
  const needle = loose(topic);
  if (!needle) return false;
  const title = loose(paper.title);
  for (const phrase of excludedFor(topic))
    if (title.includes(loose(phrase))) return false;
  return title.includes(needle) || loose(paper.abstract).includes(needle);
}

/**
 * How far back the very first run of a topic looks.
 *
 * Thirty days is the right cadence and the wrong first question. Creatine's
 * first run under a thirty-day window found eight recent papers and not one
 * meta-analysis, because a meta-analysis of creatine was published years ago
 * and is still the best answer there is. The first run asks five years; every
 * run after it asks since the last one.
 *
 * It does not cost more: `TOPIC_PAPERS` per query is what ever reaches the
 * model, and the pre-rank spends those slots on the meta-analyses first, which
 * is exactly what the wider window is for.
 */
export const FIRST_RUN_YEARS = 5;

/**
 * The window a run asks for: the later of the last run and `TOPIC_DAYS` ago,
 * or `FIRST_RUN_YEARS` back when nothing has ever been run.
 */
export function topicSince(
  lastRun: Date | string | null,
  now: Date = new Date(),
): string {
  if (!lastRun) {
    const first = new Date(now);
    first.setUTCFullYear(first.getUTCFullYear() - FIRST_RUN_YEARS);
    return first.toISOString().slice(0, 10);
  }
  const floor = new Date(now.getTime() - TOPIC_DAYS * DAY_MS);
  const last = new Date(lastRun);
  return (last > floor ? last : floor).toISOString().slice(0, 10);
}

/** True when this topic may be run again today. */
export function topicDue(
  lastRun: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!lastRun) return true;
  return now.getTime() - new Date(lastRun).getTime() >= TOPIC_DAYS * DAY_MS;
}

/* ── the pre-rank ─────────────────────────────────────────────────────── */

/** A Europe PMC paper with the publication types the pre-rank sorts on. */
export interface RankedPaper extends Paper {
  pubTypes: string[];
  publishedAt: string | null;
}

/**
 * What the model's twelve slots are spent on.
 *
 * Europe PMC's own `pubTypeList` is the only design signal available before
 * anything is read, and it is a good one: a meta-analysis is a meta-analysis
 * whatever the abstract says. Editorials, letters and comments go last,
 * because they are opinions about papers rather than papers.
 */
export const PUB_RANK: [RegExp, number][] = [
  [/meta[- ]analysis/i, 0],
  [/systematic review/i, 1],
  [/randomi[sz]ed controlled trial|clinical trial/i, 2],
  [/observational|comparative study/i, 4],
  [/editorial|letter|comment|news|retract/i, 9],
];

/** The best (lowest) rank any of a paper's publication types earns it. */
export function pubRank(types: string[]): number {
  let best = 5;
  for (const t of types)
    for (const [re, rank] of PUB_RANK)
      if (re.test(t)) best = Math.min(best, rank);
  // an editorial is an editorial even when it is also indexed as something
  // else, so the last-place rank is not improved on by a second label
  if (types.some((t) => /editorial|letter|comment|news/i.test(t))) return 9;
  return best;
}

/** Design first, then how often it was cited, then how new it is. */
export function preRank<T extends RankedPaper>(papers: T[]): T[] {
  return [...papers].sort(
    (a, b) =>
      pubRank(a.pubTypes) - pubRank(b.pubTypes) ||
      b.citedBy - a.citedBy ||
      (b.year ?? 0) - (a.year ?? 0),
  );
}

interface CoreHit {
  pubTypeList?: { pubType?: string[] };
  firstPublicationDate?: string;
  journalTitle?: string;
  journalInfo?: { journal?: { title?: string; medlineAbbreviation?: string } };
  [k: string]: unknown;
}

/**
 * Europe PMC's `core` result, with the three fields `toPaper` throws away.
 *
 * `core` does not carry `journalTitle` the way `lite` does — the journal is
 * under `journalInfo.journal` — so a row built off `toPaper` alone loses its
 * journal, and the page prints a title with no source. The abbreviation is
 * preferred because it is what the citation line has room for.
 */
export const toRanked = (h: CoreHit): RankedPaper => {
  const base = toPaper(h as Parameters<typeof toPaper>[0]);
  const j = h.journalInfo?.journal;
  return {
    ...base,
    journal:
      base.journal ?? j?.medlineAbbreviation ?? j?.title ?? null,
    pubTypes: h.pubTypeList?.pubType ?? [],
    publishedAt: h.firstPublicationDate ?? null,
  };
};

/** DOI, then PMID, then the title: one paper is one row. */
export const paperKey = (p: {
  doi: string | null;
  pmid: string | null;
  title: string;
}): string => p.doi?.toLowerCase() ?? p.pmid ?? p.title.slice(0, 200);

/** The best copy of each paper, keeping the one with the most citations. */
export function dedupeRanked<T extends RankedPaper>(papers: T[]): T[] {
  const seen = new Map<string, T>();
  for (const p of papers) {
    const key = paperKey(p);
    const found = seen.get(key);
    if (!found || found.citedBy < p.citedBy) seen.set(key, p);
  }
  return [...seen.values()];
}

/* ── the extraction ───────────────────────────────────────────────────── */

const topicItemSchema = z.object({
  paperIndex: z.number(),
  intervention: z.string(),
  dose: z.string().nullish(),
  duration: z.string().nullish(),
  /** the outcome as the abstract names it; never null for a topic */
  outcomeText: z.string(),
  outcomeFeature: z.string().nullish(),
  effectSize: z.string().nullish(),
  direction: z.enum(["up", "down", "none"]),
  population: z.string(),
  n: z.number().nullish(),
  studyType: z.enum(STUDY_TYPES),
  quote: z.string(),
});

export const topicExtraction = z.object({ items: z.array(topicItemSchema) });

export type TopicItem = z.infer<typeof topicItemSchema>;

/**
 * The intervention prompt, plus the one field a topic needs.
 *
 * A condition run can afford to drop a finding whose outcome is not a catalog
 * marker: the catalog is what it scores. A topic run cannot — "working
 * memory" and "1RM bench press" are the whole answer for creatine — so the
 * outcome arrives in the abstract's own words as well as mapped.
 */
export const TOPIC_PROMPT = `${INTERVENTION_PROMPT}
- \`outcomeText\` is the outcome exactly as the abstract names it ("working
  memory", "1RM bench press", "prostate cancer incidence"). It is never null:
  an item with no outcome is not an item.
- \`intervention\` is the thing the topic names, as the abstract writes it.`;

export interface TopicExtractor {
  (
    papers: Paper[],
    condition: ConditionRef,
    features: Feature[],
  ): Promise<{ items: TopicItem[]; tokens: number }>;
}

const featureList = (features: Feature[]) =>
  features
    .slice(0, 200)
    .map((f) => `${f.id} | ${f.name}${f.unit ? ` (${f.unit})` : ""}`)
    .join("\n");

export const llmTopics =
  (modelId?: string): TopicExtractor =>
  async (papers, condition, features) => {
    const numbered = papers
      .map(
        (p, i) =>
          `[${i + 1}] ${p.title} (${p.journal ?? "?"} ${p.year ?? "?"})\n${p.abstract}`,
      )
      .join("\n\n");
    const { object, usage } = await generateObject({
      model: model(modelId),
      schema: topicExtraction,
      system: TOPIC_PROMPT,
      prompt:
        `Topic: ${condition.name} (id ${condition.id}).\n\n` +
        `CATALOG FEATURES (id | name):\n${featureList(features)}\n\n` +
        `ABSTRACTS:\n${numbered}`,
    });
    return { items: object.items, tokens: usage?.totalTokens ?? 0 };
  };

/* ── the rows ─────────────────────────────────────────────────────────── */

/** The study designs that can say one thing caused another. */
export const TRIAL_TYPES = new Set<StudyType>(["meta", "guideline", "rct"]);

/** True when the design can only show that two things travelled together. */
export const isAssociation = (studyType: string): boolean =>
  !TRIAL_TYPES.has(studyType as StudyType);

/**
 * The sentence an association row carries, in the mockup's own words.
 *
 * It is not a caveat in a footnote: it is on the row, next to the finding,
 * because a page that prints a cross-sectional odds ratio the same way it
 * prints a randomised delta is lying with typography.
 */
export const associationLine = (topic: string, studyType: string): string =>
  NOT_IN_PEOPLE.has(studyType as StudyType)
    ? `${STUDY_WORD[studyType] ?? "a study"}, not people; it cannot say ${topic} does this in a person`
    : `a ${STUDY_WORD[studyType] ?? "study"} of what people already did, not a trial; it cannot say ${topic} causes it`;

/** The designs whose subjects were never people. */
export const NOT_IN_PEOPLE = new Set<StudyType>([
  "animal",
  "in_vitro",
  "computational",
]);

/** Each study type in the words the page prints. */
export const STUDY_WORD: Record<string, string> = {
  meta: "meta-analysis",
  guideline: "guideline",
  rct: "randomised trial",
  cohort: "cohort",
  cross_sectional: "cross-sectional survey",
  case_control: "case-control study",
  case_series: "case series",
  case_report: "case report",
  n_of_1: "n-of-1",
  self_experiment: "self-experiment",
  animal: "an animal study",
  in_vitro: "an in-vitro study",
  computational: "a computational model",
  other: "study",
};

/** "randomised, n = 46": the design in words, with its size when there is one. */
export const designWords = (studyType: string, n: number | null): string => {
  // the citation line is a list of facts, not a sentence: it drops the article
  const word = (STUDY_WORD[studyType] ?? "study").replace(/^an? /, "");
  return n && n > 0 ? `${word}, n = ${n}` : word;
};

export type TopicRow = typeof topicFindings.$inferInsert;

/**
 * Findings into rows. Pure over its inputs, so the fixture test can check the
 * grade, the outcome text and the id without a network or a model.
 */
export function toTopicRows(
  topic: string,
  features: Feature[],
  papers: RankedPaper[],
  items: TopicItem[],
): TopicRow[] {
  const known = new Set(features.map((f) => f.id));
  const rows = new Map<string, TopicRow>();

  for (const f of items) {
    const paper = papers[f.paperIndex - 1];
    if (!paper || paper.retracted) continue;
    if (!f.intervention?.trim() || !f.quote?.trim()) continue;
    const outcomeText = f.outcomeText?.trim();
    if (!outcomeText) continue;

    const grade = gradeOf(
      { studyType: f.studyType, n: f.n ?? null } as Finding,
      { citedBy: paper.citedBy, year: paper.year, resolved: !!paper.doi },
    );
    const externalId = paperKey(paper);
    const mapped = f.outcomeFeature?.trim() ?? "";
    const quote = f.quote.replace(/\s+/g, " ").trim();

    rows.set(`${externalId}|${outcomeText.toLowerCase()}`, {
      id: `tf_${slug(topic)}_${slug(externalId)}_${slug(outcomeText)}`.slice(
        0,
        200,
      ),
      topic,
      name: f.intervention.trim(),
      dose: f.dose?.trim() || null,
      duration: f.duration?.trim() || null,
      outcomeText,
      outcomeFeatureId: known.has(mapped) ? mapped : null,
      effect: f.effectSize?.trim() || null,
      direction: f.direction,
      grade,
      studyType: f.studyType,
      n: f.n ?? null,
      population: withN(f.population, f.n),
      paperExternalId: externalId,
      paper: {
        pmid: paper.pmid,
        doi: paper.doi,
        title: paper.title,
        year: paper.year,
        journal: paper.journal,
        url: paper.url,
        quote,
      },
      quote,
    });
  }
  return [...rows.values()];
}

/** The `paper_watch` rows a topic run files, so the existing feed shows them. */
export function topicPaperRows(
  userId: string,
  topic: string,
  papers: RankedPaper[],
  findings: TopicRow[],
  /**
   * Whether the reader ran at all.
   *
   * This is the difference between "nothing was read" and "it was read and it
   * said nothing about this topic". When the reader ran, a paper it produced
   * no finding for is dropped: filing it would print "found, not read yet"
   * under a paper that was read, which is a lie about which half failed. When
   * the reader could not run, every on-topic paper is filed exactly as before,
   * because then the sentence is true.
   */
  read = true,
): (typeof paperWatch.$inferInsert)[] {
  const byPaper = new Map<string, TopicRow>();
  for (const f of findings)
    if (!byPaper.has(f.paperExternalId)) byPaper.set(f.paperExternalId, f);

  const kept = read
    ? papers.filter((p) => byPaper.has(paperKey(p)))
    : papers;

  return kept.map((p) => {
    const externalId = paperKey(p);
    const first = byPaper.get(externalId);
    return {
      userId,
      conditionId: topicConditionId(topic),
      source: "epmc",
      externalId,
      title: p.title,
      journal: p.journal,
      url: p.url || null,
      publishedAt: p.publishedAt,
      grade: first?.grade ?? null,
      finding: first?.quote ?? null,
      abstract: p.abstract || null,
      // a topic finding never moves a probability: the engine scores only
      // rules a human accepted, and nothing here proposes one
      moves: null,
    };
  });
}

/* ── the verdict strip ────────────────────────────────────────────────── */

/** Free-text outcomes where more of it is the bad news. */
export const BAD_UP = [
  "cancer",
  "mortality",
  "adverse",
  "risk",
  "incidence",
  "injury",
];

export type Tone = "on" | "off" | "none";

/**
 * Good or bad by the outcome, not by up or down.
 *
 * A marker gets the answer the app already has: `BETTER_LOW` and
 * `BETTER_HIGH` in `lib/projection.ts` are what every ruler and every goal
 * already read, so the strip cannot disagree with the marker page. A
 * free-text outcome gets a six-word list, and everything else is neither —
 * which is the honest answer for "body water" and is printed as one.
 */
export function toneOf(
  direction: string,
  outcomeText: string,
  outcomeFeatureId: string | null,
): Tone {
  if (direction === "none") return "none";
  const up = direction === "up";
  const code = outcomeFeatureId?.replace(/^(metric|derived):/, "") ?? "";
  if (code && BETTER_LOW.has(code)) return up ? "off" : "on";
  if (code && BETTER_HIGH.has(code)) return up ? "on" : "off";
  const text = outcomeText.toLowerCase();
  if (BAD_UP.some((w) => text.includes(w))) return up ? "off" : "on";
  return "none";
}

/** "up · good", "down · bad", "up · neither": the strip's second column. */
export const directionWords = (direction: string, tone: Tone): string =>
  direction === "none"
    ? "no change"
    : `${direction} · ${tone === "on" ? "good" : tone === "off" ? "bad" : "neither"}`;

const LADDER = ["A", "B", "C", "D", "E"];
const better = (a: string, b: string) =>
  LADDER.indexOf(a) <= LADDER.indexOf(b) ? a : b;

export interface Verdict {
  outcomeText: string;
  outcomeFeatureId: string | null;
  direction: string;
  tone: Tone;
  grade: string;
  /** how many findings sit behind this line */
  trials: number;
  /** true when nothing behind it is a trial */
  association: boolean;
  /** "3–5 g/day", or the single dose, or null */
  doseRange: string | null;
}

/** "3 g/day" and "5 g/day" become "3–5 g/day"; anything else is listed. */
export function doseRange(doses: (string | null)[]): string | null {
  const seen = [
    ...new Set(doses.map((d) => d?.trim()).filter(Boolean)),
  ] as string[];
  if (!seen.length) return null;
  if (seen.length === 1) return seen[0]!;
  const parsed = seen.map((d) => ({ d, n: Number(d.match(/[\d.]+/)?.[0]) }));
  const unit = seen[0]!.replace(/^[\d.\s–-]+/, "");
  if (parsed.every((p) => Number.isFinite(p.n) && p.d.endsWith(unit))) {
    const ns = parsed.map((p) => p.n).sort((a, b) => a - b);
    return `${ns[0]}–${ns[ns.length - 1]} ${unit}`.replace(/\s+/g, " ").trim();
  }
  return seen.slice(0, 2).join(" · ");
}

/**
 * One line per outcome, best grade first.
 *
 * Grouped on the outcome's own words, lower-cased, because "Muscle strength"
 * and "muscle strength" are one outcome and two rows would read as two
 * findings.
 */
export function verdictsOf(
  findings: Pick<
    TopicFinding,
    | "outcomeText"
    | "outcomeFeatureId"
    | "direction"
    | "grade"
    | "studyType"
    | "dose"
  >[],
): Verdict[] {
  const groups = new Map<string, typeof findings>();
  for (const f of findings) {
    const key = `${f.outcomeText.toLowerCase()}|${f.direction}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  const out: Verdict[] = [];
  for (const rows of groups.values()) {
    const first = rows[0]!;
    const tone = toneOf(
      first.direction,
      first.outcomeText,
      first.outcomeFeatureId,
    );
    out.push({
      outcomeText: first.outcomeText,
      outcomeFeatureId: first.outcomeFeatureId,
      direction: first.direction,
      tone,
      grade: rows.map((r) => r.grade).reduce(better),
      trials: rows.length,
      association: rows.every((r) => isAssociation(r.studyType)),
      doseRange: doseRange(rows.map((r) => r.dose)),
    });
  }

  const toneRank = { on: 0, none: 1, off: 2 } as const;
  return out.sort(
    (a, b) =>
      toneRank[a.tone] - toneRank[b.tone] ||
      LADDER.indexOf(a.grade) - LADDER.indexOf(b.grade) ||
      b.trials - a.trials,
  );
}

/* ── relevance ───────────────────────────────────────────────────────── */

/** What this person has on file that could make a topic theirs. */
export interface TopicPerson {
  /** the text of every active protocol item */
  adopted: string[];
  /** the markers this person set a goal on: feature id and its name */
  goals: { featureId: string; name: string }[];
  /** the loud conditions, with the feature ids their rules read */
  loud: { name: string; state: string; featureIds: string[] }[];
}

export const emptyPerson = (): TopicPerson => ({
  adopted: [],
  goals: [],
  loud: [],
});

/**
 * One sentence saying why this topic is on this person's file. No model call:
 * every clause is a join against something already stored.
 *
 * The clauses are in the order the mockup prints them, joined with a middle
 * dot, and a topic none of them matches says "you asked" — which is the truth
 * for anything typed into the box.
 */
export function relevanceOf(
  topic: { topic: string; label: string; origin: string },
  person: TopicPerson,
  outcomes: { outcomeFeatureId: string | null }[] = [],
): string {
  const said: string[] = [];
  const key = topic.topic.toLowerCase();

  if (person.adopted.some((t) => t.toLowerCase().includes(key)))
    said.push("you take it");

  const features = new Set(
    outcomes.map((o) => o.outcomeFeatureId).filter((id): id is string => !!id),
  );
  const goal = person.goals.find((g) => features.has(g.featureId));
  if (goal) said.push(`you are moving ${goal.name}`);

  const condition = person.loud.find((c) =>
    c.featureIds.some((id) => features.has(id)),
  );
  if (condition) said.push(`${condition.name} is ${condition.state} for you`);

  if (said.length) return said.join(" · ");
  return features.size
    ? "you asked"
    : "you asked · no marker on file for it yet";
}

/* ── the run ─────────────────────────────────────────────────────────── */

export interface TopicResult {
  topic: string;
  since: string;
  found: number;
  stored: number;
  /** how many `topic_findings` rows the run wrote */
  outcomes: number;
  /** false when the reader could not run and only the search happened */
  read: boolean;
  /** why the reading half did not run, when it did not */
  reason?: string;
}

export interface TopicRunOptions {
  now?: Date;
  maxPapers?: number;
  modelId?: string;
  extract?: TopicExtractor;
  features?: Feature[];
  /** search, and skip the reading: the run without the part that costs tokens */
  searchOnly?: boolean;
}

/** Every hit for one topic, ranked, deduped, cut to what the model will read. */
export async function findTopicPapers(
  topic: string,
  since: string,
  options: { now?: Date; maxPapers?: number } = {},
): Promise<RankedPaper[]> {
  const now = options.now ?? new Date();
  const perQuery = options.maxPapers ?? TOPIC_PAPERS;
  const out: RankedPaper[] = [];
  for (const { query } of topicQueries(topic, since, now)) {
    const hits = (await epmc(query, "core", TOPIC_PAGE)) as CoreHit[];
    const ranked = dedupeRanked(hits.map(toRanked)).filter(
      (p) =>
        !p.retracted &&
        !isRetracted(p.pubTypes) &&
        (p.pmid || p.doi) &&
        cleanTitle(p.title).length > 0 &&
        // the floor under the query: a paper that is not about this topic is
        // never read and never filed, not even as "found, not read yet"
        onTopic(p, topic),
    );
    out.push(...preRank(ranked).slice(0, perQuery));
  }
  return dedupeRanked(out);
}

/**
 * One topic, run: search both sides, read the abstracts, grade what came out,
 * and file the findings and the papers.
 *
 * `searchOnly` is the same bargain `searchOnlyWatch` makes: the papers are
 * real, dated and named, and nothing is graded, because a grade comes from the
 * reading and inventing one would be the whole failure of the page.
 */
export async function runTopic(
  userId: string,
  row: Pick<TopicWatch, "topic" | "label"> & { lastRunAt?: Date | null },
  options: TopicRunOptions = {},
): Promise<TopicResult> {
  const now = options.now ?? new Date();
  const since = topicSince(row.lastRunAt ?? null, now);
  const db = getDb();

  const papers = await findTopicPapers(row.topic, since, {
    now,
    ...(options.maxPapers ? { maxPapers: options.maxPapers } : {}),
  });

  let findings: TopicRow[] = [];
  let read = !options.searchOnly;
  let reason: string | undefined;

  if (!options.searchOnly) {
    const extract = options.extract ?? llmTopics(options.modelId);
    const features = options.features ?? [];
    const ref: ConditionRef = {
      id: topicConditionId(row.topic),
      name: row.label,
      inCatalog: false,
    };
    const readable = papers.filter((p) => p.abstract.length > 200);
    try {
      for (let i = 0; i < readable.length; i += BATCH) {
        const batch = readable.slice(i, i + BATCH);
        const answer = await extract(batch, ref, features);
        findings.push(
          ...toTopicRows(
            row.topic,
            features,
            readable,
            answer.items.map((x) => ({ ...x, paperIndex: i + x.paperIndex })),
          ),
        );
      }
    } catch (e) {
      // the key is refused, or the provider is down. The search already
      // happened, so the papers are kept and the page says which half failed.
      findings = [];
      read = false;
      reason = e instanceof Error ? e.message : String(e);
      console.error(`[topic] ${row.topic}: the reader could not run:`, e);
    }
  }

  let outcomes = 0;
  if (findings.length) {
    const written = await db
      .insert(topicFindings)
      .values(findings)
      .onConflictDoNothing({
        target: [
          topicFindings.topic,
          topicFindings.paperExternalId,
          topicFindings.outcomeText,
        ],
      })
      .returning({ id: topicFindings.id });
    outcomes = written.length;
  }

  let stored = 0;
  const values = topicPaperRows(userId, row.topic, papers, findings, read);
  if (values.length) {
    const written = await db
      .insert(paperWatch)
      .values(values)
      .onConflictDoNothing({
        target: [paperWatch.userId, paperWatch.externalId],
      })
      .returning({ id: paperWatch.id });
    stored = written.length;
  }

  await db
    .update(topicWatch)
    .set({ lastRunAt: now })
    .where(and(eq(topicWatch.userId, userId), eq(topicWatch.topic, row.topic)));

  return {
    topic: row.topic,
    since,
    found: papers.length,
    stored,
    outcomes,
    read,
    ...(reason ? { reason } : {}),
  };
}

/**
 * The daily pass: every topic this person watches that has gone `TOPIC_DAYS`
 * without a run.
 *
 * The curator calls this after the condition watch, under the same budget and
 * the same try-catch: a Europe PMC outage must not take the nightly pass down.
 */
export async function runTopicsForUser(
  userId: string,
  options: TopicRunOptions & { max?: number } = {},
): Promise<TopicResult[]> {
  const now = options.now ?? new Date();
  const rows = await listTopics(userId);
  const out: TopicResult[] = [];
  for (const row of rows.slice(0, options.max ?? 3)) {
    if (!topicDue(row.lastRunAt, now)) continue;
    try {
      out.push(await runTopic(userId, row, options));
    } catch (e) {
      console.error(`[topic] ${row.topic} failed:`, e);
    }
  }
  return out;
}

/* ── the list ────────────────────────────────────────────────────────── */

/** Every topic this person watches, oldest first. */
export async function listTopics(userId: string): Promise<TopicWatch[]> {
  return getDb()
    .select()
    .from(topicWatch)
    .where(eq(topicWatch.userId, userId))
    .orderBy(desc(topicWatch.createdAt));
}

export async function getTopic(
  userId: string,
  topic: string,
): Promise<TopicWatch | null> {
  const [row] = await getDb()
    .select()
    .from(topicWatch)
    .where(
      and(
        eq(topicWatch.userId, userId),
        eq(topicWatch.topic, normalizeTopic(topic)),
      ),
    );
  return row ?? null;
}

/** Add one topic. Watching a topic twice is watching it once. */
export async function addTopic(
  userId: string,
  label: string,
  origin: TopicWatch["origin"] = "typed",
): Promise<TopicWatch | null> {
  const topic = normalizeTopic(label);
  if (!topic) return null;
  const [row] = await getDb()
    .insert(topicWatch)
    .values({ userId, topic, label: label.trim(), origin })
    .onConflictDoNothing({ target: [topicWatch.userId, topicWatch.topic] })
    .returning();
  return row ?? (await getTopic(userId, topic));
}

/**
 * Stop watching. The findings stay: stopping the watch stops the next run, it
 * does not delete a paper somebody already read.
 */
export async function removeTopic(
  userId: string,
  topic: string,
): Promise<boolean> {
  const gone = await getDb()
    .delete(topicWatch)
    .where(
      and(
        eq(topicWatch.userId, userId),
        eq(topicWatch.topic, normalizeTopic(topic)),
      ),
    )
    .returning({ id: topicWatch.id });
  return gone.length > 0;
}

/** Every finding on file for one topic, best grade first. */
export async function findingsFor(topic: string): Promise<TopicFinding[]> {
  const rows = await getDb()
    .select()
    .from(topicFindings)
    .where(eq(topicFindings.topic, normalizeTopic(topic)));
  return rows.sort(
    (a, b) =>
      LADDER.indexOf(a.grade) - LADDER.indexOf(b.grade) ||
      (b.paper?.year ?? 0) - (a.paper?.year ?? 0),
  );
}

/** How many findings and how many papers each topic has, in one query. */
export async function topicCounts(
  topics: string[],
): Promise<Map<string, { outcomes: number; papers: number }>> {
  const out = new Map<string, { outcomes: number; papers: number }>();
  if (!topics.length) return out;
  const rows = await getDb()
    .select({
      topic: topicFindings.topic,
      outcomes: sql<number>`count(distinct ${topicFindings.outcomeText})::int`,
      papers: sql<number>`count(distinct ${topicFindings.paperExternalId})::int`,
    })
    .from(topicFindings)
    .where(inArray(topicFindings.topic, topics))
    .groupBy(topicFindings.topic);
  for (const r of rows)
    out.set(r.topic, { outcomes: r.outcomes, papers: r.papers });
  return out;
}

/** The label per `topic:` condition id, so `toApiPaper` can name the row. */
export async function topicLabels(
  userId: string,
): Promise<Map<string, string>> {
  const rows = await listTopics(userId);
  return new Map(rows.map((r) => [topicConditionId(r.topic), r.label]));
}

/* ── where topics come from ──────────────────────────────────────────── */

/**
 * The first noun phrase of a protocol line, for a supplement the catalog has
 * never heard of.
 *
 * Deliberately simple: the words before the first number, unit, comma or
 * preposition. "Creatine monohydrate 5 g with breakfast" is `creatine
 * monohydrate`, and "Walk 30 minutes" is `walk`. It is wrong sometimes, and
 * when it is wrong the topic is a topic nobody watches rather than a paper
 * nobody asked for.
 */
export function firstNounPhrase(text: string): string {
  const cut = text
    .replace(/^(take|start|add|use|do|keep|continue)\s+/i, "")
    .split(
      /\s+(?:\d|with\b|at\b|for\b|per\b|every\b|before\b|after\b|daily\b|twice\b|on\b|in\b|to\b)/i,
    )[0]!
    .split(/[,;:(–—-]/)[0]!;
  return cut.trim().replace(/\s+/g, " ").slice(0, 60);
}

/**
 * Every active protocol item as the topic it names.
 *
 * `matchIntervention` against the intervention catalog first, because it
 * carries the canonical name ("Creatine monohydrate", not "creatine 5g am");
 * the first noun phrase is the fallback, and a line that yields fewer than
 * three characters yields no topic at all.
 */
export async function topicsFromProtocol(
  userId: string,
): Promise<{ label: string; origin: "adopted" }[]> {
  const db = getDb();
  const [items, rows] = await Promise.all([
    db
      .select({ text: protocolItems.text })
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      ),
    db
      .select({ name: hkbInterventions.name })
      .from(hkbInterventions)
      .where(eq(hkbInterventions.status, "accepted")),
  ]);

  const seen = new Set<string>();
  const out: { label: string; origin: "adopted" }[] = [];
  for (const item of items) {
    const match = matchIntervention(item.text, rows);
    const label = (match?.name ?? firstNounPhrase(item.text)).trim();
    const key = normalizeTopic(label);
    if (key.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, origin: "adopted" });
  }
  return out;
}

/** The adopted topics, added to the watch list. Adding one twice adds one. */
export async function syncTopicsFromProtocol(
  userId: string,
): Promise<TopicWatch[]> {
  const out: TopicWatch[] = [];
  for (const { label, origin } of await topicsFromProtocol(userId)) {
    const row = await addTopic(userId, label, origin);
    if (row) out.push(row);
  }
  return out;
}

/**
 * What this person has on file, for `relevanceOf`.
 *
 * Three joins and no model call. The loud conditions carry the feature ids
 * their own rules read, which is what lets "inflammation is borderline for
 * you" appear on a topic whose outcome is hs-CRP.
 */
export async function topicPerson(userId: string): Promise<TopicPerson> {
  const db = getDb();
  const [items, goalRows, loud] = await Promise.all([
    db
      .select({ text: protocolItems.text })
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      ),
    getGoals(userId),
    watchConditions(userId).catch(() => []),
  ]);

  const conditions: TopicPerson["loud"] = [];
  for (const c of loud.slice(0, 6)) {
    const features = await featuresFor(c.id).catch(() => []);
    conditions.push({
      name: c.name,
      state: c.state,
      featureIds: features.map((f) => f.id),
    });
  }

  return {
    adopted: items.map((i) => i.text),
    goals: goalRows.map((g) => ({
      featureId: `metric:${g.metricCode}`,
      name: g.metricName,
    })),
    loud: conditions,
  };
}
