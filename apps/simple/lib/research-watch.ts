/**
 * The per-person research feed: what the knowledge base learned lately, cut to
 * the conditions this person actually has, with the delta it would make.
 *
 * Phase 32a section 1, per `docs/mockups/v4/research.html`. The mockup's own
 * build-cost note names four things that did not exist, and this module is
 * three of them:
 *
 *  1. a publication date and an abstract, kept on the row rather than thrown
 *     away — `paper_watch.published_at` and `.abstract`;
 *  2. a per-person match — the run only asks about conditions in this person's
 *     ledger at `possible` or louder, so a row is by construction "for you";
 *  3. "what it would move" — the scorer run twice, with and without the
 *     paper's proposed rule, and the delta stored beside the paper.
 *
 * The fourth, a feed table with seen/unseen state, is `paper_watch` itself.
 *
 * Nothing here invents a number. A paper the intake produced no rule for gets
 * `moves: null`, which the page prints as "nothing for you" — the honest
 * answer most of the time, and printed as plainly as the others.
 *
 * `researchCondition` takes an injectable extractor, so every function below
 * is testable without a model call and without a network.
 */
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  hkbConditions,
  hkbInterventions,
  paperWatch,
  topicWatch,
  type PaperMove,
  type PaperWatch,
} from "@/db";
import { buildModelInput } from "@/lib/coverage";
import { generateObjectSafe } from "@/lib/extract";
import { catalogFor } from "@/lib/hkb";
import {
  scoreHypotheses,
  type Catalog,
  type EvidenceRule,
} from "@/lib/hypotheses";
import { buildLedger, isLoud } from "@/lib/ledger";
import {
  dedupe,
  epmc,
  featuresFor,
  researchCondition,
  toPaper,
  type ConditionRef,
  type Paper,
  type Proposal,
  type ResearchOptions,
} from "@/lib/research";

/**
 * How long a condition is left alone between watches. The same 90 days as
 * `RESEARCH_COOLDOWN_DAYS` in `lib/research.ts`, and the same rule the mockup
 * prints: "the watch runs again when a condition goes 90 days without a read".
 */
export const WATCH_DAYS = 90;

const DAY_MS = 86_400_000;

/** One condition worth watching, as the ledger names it. */
export interface WatchCondition {
  id: string;
  name: string;
  /** the probability the ledger has it at, for the picker on the page */
  probability: number | null;
  state: string;
}

/**
 * The window a run asks Europe PMC for: the later of the last watch and ninety
 * days ago, as `YYYY-MM-DD`.
 *
 * Pure, so the boundary is testable to the day. The later of the two is the
 * point: a condition read yesterday asks for yesterday onwards, and one never
 * read asks for ninety days, not for all of time.
 */
export function watchSince(
  lastRun: Date | string | null,
  now: Date = new Date(),
): string {
  const floor = new Date(now.getTime() - WATCH_DAYS * DAY_MS);
  if (!lastRun) return floor.toISOString().slice(0, 10);
  const last = new Date(lastRun);
  return (last > floor ? last : floor).toISOString().slice(0, 10);
}

/** True when this condition may be researched again today. */
export function watchDue(
  lastRun: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!lastRun) return true;
  return now.getTime() - new Date(lastRun).getTime() >= WATCH_DAYS * DAY_MS;
}

/**
 * The conditions in this person's ledger at `possible` or louder.
 *
 * `isLoud` is the same predicate Home and Plan use, so the feed and the ledger
 * can never disagree about which conditions are this person's.
 */
export async function watchConditions(
  userId: string,
): Promise<WatchCondition[]> {
  const ledger = await buildLedger(userId);
  const all = [ledger.spear, ...ledger.conclusions].filter((c) => c != null);
  const seen = new Set<string>();
  const out: WatchCondition[] = [];
  for (const c of all) {
    if (c.kind !== "condition") continue;
    if (!c.state || !isLoud(c.state)) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    // `title` is "<name>: <state>"; the name is what a search asks for.
    const cut = c.title.lastIndexOf(": ");
    out.push({
      id: c.id,
      name: cut > 0 ? c.title.slice(0, cut) : c.title,
      probability: c.probability ?? null,
      state: c.state,
    });
  }
  return out;
}

/** The newest row this person has for one condition, or null. */
export async function lastWatch(
  userId: string,
  conditionId: string,
): Promise<Date | null> {
  const [row] = await getDb()
    .select({ foundAt: paperWatch.foundAt })
    .from(paperWatch)
    .where(
      and(
        eq(paperWatch.userId, userId),
        eq(paperWatch.conditionId, conditionId),
      ),
    )
    .orderBy(desc(paperWatch.foundAt))
    .limit(1);
  return row?.foundAt ?? null;
}

/* ── what it would move ───────────────────────────────────────────────── */

/**
 * One proposal as the evidence rule the scorer reads.
 *
 * `rowsToCatalog` in `lib/hkb.ts` does this for stored rows; a proposal is not
 * stored yet, so the same two pieces — the feature the rule reads and the
 * condition it is written on — are assembled here. Keep the two in step: a
 * proposal that scores differently here than it would once accepted is a lie
 * about what accepting it does.
 */
export function proposalRule(p: Proposal): EvidenceRule {
  const on = p.conditionOn as Record<string, unknown>;
  const input: EvidenceRule["input"] = p.featureId.startsWith("metric:")
    ? { metric: p.featureId.slice("metric:".length) }
    : p.featureId.startsWith("fact:")
      ? { fact: p.featureId.slice("fact:".length) }
      : p.featureId.startsWith("event:")
        ? { event: p.featureId.slice("event:".length) }
        : { metric: p.featureId };
  return {
    id: p.id,
    input,
    when: on as EvidenceRule["when"],
    lr: p.lrPos,
    ...(p.lrNeg != null ? { lrNeg: p.lrNeg } : {}),
    grade: p.grade as EvidenceRule["grade"],
    source: p.source,
  };
}

/** The catalog with one rule added to one condition. Pure; the input is not mutated. */
export function catalogWith(
  catalog: Catalog,
  conditionId: string,
  rule: EvidenceRule,
): Catalog {
  return catalog.map((h) =>
    h.id === conditionId ? { ...h, evidence: [...h.evidence, rule] } : h,
  );
}

/**
 * The change one proposed rule makes to one condition, scored with and without
 * it, or null when it makes none.
 *
 * `delta` is a change in probability as a fraction: 0.04 is four points. The
 * sign is the direction, and a delta the page would round to nothing is not a
 * move: the floor is half a point, because a paper that shifts a 95 % to a
 * 95.2 % has not told this person anything.
 */
export const MOVE_FLOOR = 0.005;

export function moveOf(
  before: { id: string; score: number }[],
  after: { id: string; score: number }[],
  conditionId: string,
  name: string,
): PaperMove | null {
  const from = before.find((h) => h.id === conditionId)?.score;
  const to = after.find((h) => h.id === conditionId)?.score;
  if (from == null || to == null) return null;
  const delta = to - from;
  if (Math.abs(delta) < MOVE_FLOOR) return null;
  return {
    conclusionId: conditionId,
    name,
    direction: delta > 0 ? "up" : "down",
    delta,
  };
}

/* ── the run ──────────────────────────────────────────────────────────── */

/** What a run wrote, so the page can print a receipt instead of a console. */
export interface WatchResult {
  conditionId: string;
  /** the day the window started at */
  since: string;
  found: number;
  stored: number;
  moved: number;
}

/** A paper and the proposal the intake made from it, if it made one. */
export interface WatchCandidate {
  paper: Paper;
  proposal: Proposal | null;
}

/** The DOI, or the PMID, or the title: one paper is one row. */
export const externalIdOf = (p: {
  doi: string | null;
  pmid: string | null;
  title: string;
}): string => p.doi?.toLowerCase() ?? p.pmid ?? p.title.slice(0, 200);

/**
 * The one sentence of what a paper found: the quote the intake pulled out,
 * which is the model's own copy of the paper's words, or nothing.
 *
 * There is no second sentence written here. A paper with no extracted finding
 * has none, and the row says so by leaving `finding` null rather than
 * paraphrasing an abstract.
 */
export const findingOf = (p: Proposal | null): string | null =>
  p?.paper.quote?.trim() || null;

/** The day a paper was published, and its abstract, keyed by external id. */
export interface PaperFacts {
  publishedAt: string | null;
  abstract: string | null;
}

/**
 * Europe PMC's `firstPublicationDate` and abstract, which `toPaper` drops.
 *
 * The build-cost note calls this out: `HkbPaper` keeps a `year` only and drops
 * the abstract before it writes, so "new since Aug 1" cannot be answered from
 * a stored row. The watch asks for the `core` result type, which carries both,
 * and keeps them on `paper_watch`.
 *
 * One extra search per run, deliberately: the alternative is threading the
 * verified papers back out of `researchCondition`, which would change a
 * signature five other callers depend on.
 */
export async function paperFacts(
  condition: string,
  since: string,
  now: Date = new Date(),
  pageSize = 50,
): Promise<Map<string, PaperFacts>> {
  const to = now.toISOString().slice(0, 10);
  const query = `"${condition}" AND (FIRST_PDATE:[${since} TO ${to}])`;
  const hits = (await epmc(query, "core", pageSize)) as (Parameters<
    typeof toPaper
  >[0] & { firstPublicationDate?: string })[];
  const out = new Map<string, PaperFacts>();
  for (const h of hits) {
    const paper = toPaper(h);
    out.set(externalIdOf(paper), {
      publishedAt: h.firstPublicationDate ?? null,
      abstract: paper.abstract || null,
    });
  }
  return out;
}

/** The rows a run would write, without writing them. Pure over its inputs. */
export function watchRows(
  userId: string,
  condition: WatchCondition,
  candidates: WatchCandidate[],
  moves: Map<string, PaperMove | null>,
  facts: Map<string, PaperFacts> = new Map(),
): (typeof paperWatch.$inferInsert)[] {
  return candidates.map(({ paper, proposal }) => {
    const externalId = externalIdOf(paper);
    const extra = facts.get(externalId);
    return {
      userId,
      conditionId: condition.id,
      source: "epmc",
      externalId,
      title: paper.title,
      journal: paper.journal,
      url: paper.url || null,
      // The day when Europe PMC's core record carried one. A year with no day
      // is a year, and it is stored as one rather than dated to January 1st.
      publishedAt: extra?.publishedAt ?? null,
      grade: proposal?.grade ?? null,
      finding: findingOf(proposal),
      abstract: extra?.abstract ?? (paper.abstract || null),
      moves: moves.get(externalId) ?? null,
    };
  });
}

/**
 * One condition, watched: search since the window, grade through the intake,
 * score the ledger with and without each proposed rule, and file the rows.
 *
 * Writes only `paper_watch`. It never accepts a rule into `hkb_evidence`: a
 * feed row is something to read, and the engine still only scores what a human
 * accepted on `/hkb`.
 */
export async function runWatch(
  userId: string,
  condition: WatchCondition,
  options: ResearchOptions & {
    now?: Date;
    withDates?: boolean;
    /**
     * Search, and skip the intake.
     *
     * The extraction is the whole cost of a run — one model call per five
     * abstracts — and it is the only part that can produce a rule. With
     * `searchOnly` the watch files what Europe PMC returned with no grade, no
     * finding and `moves: null`, which prints as "nothing for you": true, and
     * true for the right reason, because nothing proposed a rule.
     *
     * It is not a cheap version of the run. It is the run without the part
     * that can move a number, and the rows it writes say so by carrying no
     * grade.
     */
    searchOnly?: boolean;
  } = {},
): Promise<WatchResult> {
  const now = options.now ?? new Date();
  const since = watchSince(await lastWatch(userId, condition.id), now);
  const db = getDb();

  if (options.searchOnly)
    return searchOnlyWatch(userId, condition, since, now, {
      ...(options.maxPapers ? { perCondition: options.maxPapers } : {}),
    });

  const features = await featuresFor(condition.id);
  const { rows } = await researchCondition(
    { id: condition.id, name: condition.name, inCatalog: true },
    features,
    options,
  );

  // One proposal per paper: the intake can propose several rules off one
  // abstract, and the feed is a list of papers, not of rules.
  const byPaper = new Map<string, Proposal>();
  for (const p of rows) {
    const key = externalIdOf(p.paper);
    if (!byPaper.has(key)) byPaper.set(key, p);
  }

  const [input, catalog] = await Promise.all([
    buildModelInput(userId),
    catalogFor(userId),
  ]);
  const before = scoreHypotheses(input, { catalog });
  const moves = new Map<string, PaperMove | null>();
  for (const [key, proposal] of byPaper) {
    const after = scoreHypotheses(input, {
      catalog: catalogWith(catalog, condition.id, proposalRule(proposal)),
    });
    moves.set(key, moveOf(before, after, condition.id, condition.name));
  }

  const candidates: WatchCandidate[] = [...byPaper].map(([, proposal]) => ({
    paper: {
      pmid: proposal.paper.pmid,
      doi: proposal.paper.doi,
      title: proposal.paper.title,
      journal: proposal.paper.journal,
      year: proposal.paper.year,
      authors: "",
      citedBy: 0,
      url: proposal.paper.url,
      abstract: "",
    },
    proposal,
  }));

  const facts =
    options.withDates === false
      ? new Map<string, PaperFacts>()
      : await paperFacts(condition.name, since, now).catch(
          () => new Map<string, PaperFacts>(),
        );
  const values = watchRows(userId, condition, candidates, moves, facts);
  let stored = 0;
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

  return {
    conditionId: condition.id,
    since,
    found: candidates.length,
    stored,
    moved: [...moves.values()].filter((m) => m != null).length,
  };
}

/**
 * The search half of a run, filed without the intake.
 *
 * Every row it writes has `grade: null`, `finding: null` and `moves: null`,
 * because nothing read the abstract. The page prints "nothing for you" and it
 * is the honest sentence: no rule was proposed, so no number moved.
 */
async function searchOnlyWatch(
  userId: string,
  condition: WatchCondition,
  since: string,
  now: Date,
  options: { perCondition?: number } = {},
): Promise<WatchResult> {
  const facts = await paperFacts(condition.name, since, now).catch(
    () => new Map<string, PaperFacts>(),
  );
  const to = now.toISOString().slice(0, 10);
  const found = dedupe(
    (
      await epmc(
        `"${condition.name}" AND (FIRST_PDATE:[${since} TO ${to}])`,
        "lite",
        50,
      )
    ).map(toPaper),
  )
    .filter((p) => !p.retracted && (p.pmid || p.doi))
    .slice(0, options.perCondition ?? 8);

  const values = watchRows(
    userId,
    condition,
    found.map((paper) => ({ paper, proposal: null })),
    new Map(),
    facts,
  );
  let stored = 0;
  if (values.length) {
    const written = await getDb()
      .insert(paperWatch)
      .values(values)
      .onConflictDoNothing({
        target: [paperWatch.userId, paperWatch.externalId],
      })
      .returning({ id: paperWatch.id });
    stored = written.length;
  }
  return {
    conditionId: condition.id,
    since,
    found: found.length,
    stored,
    moved: 0,
  };
}

/**
 * The daily pass: every condition in this person's ledger that has gone
 * `WATCH_DAYS` without a read, watched once.
 *
 * The curator calls this. It is deliberately quiet about failure: a Europe PMC
 * outage must not take the nightly pass down with it.
 */
export async function runWatchForUser(
  userId: string,
  options: ResearchOptions & { now?: Date; max?: number } = {},
): Promise<WatchResult[]> {
  const now = options.now ?? new Date();
  const conditions = await watchConditions(userId);
  const out: WatchResult[] = [];
  for (const condition of conditions.slice(0, options.max ?? 3)) {
    if (!watchDue(await lastWatch(userId, condition.id), now)) continue;
    try {
      out.push(await runWatch(userId, condition, options));
    } catch (e) {
      console.error(`[watch] ${condition.id} failed:`, e);
    }
  }
  return out;
}

/* ── the watch feeds the case (42D) ───────────────────────────────────── */

/**
 * The graded rows the watch filed since the last case run, newest first. A
 * graded row is one the intake read; its own one-rule score may sit under
 * `MOVE_FLOOR`, and the case run reads it again against the whole case.
 */
export async function gradedSince(
  userId: string,
  since: Date | null,
): Promise<{ conditionId: string; externalId: string }[]> {
  return getDb()
    .select({
      conditionId: paperWatch.conditionId,
      externalId: paperWatch.externalId,
    })
    .from(paperWatch)
    .where(
      and(
        eq(paperWatch.userId, userId),
        isNotNull(paperWatch.grade),
        ...(since ? [gt(paperWatch.foundAt, since)] : []),
      ),
    )
    .orderBy(desc(paperWatch.foundAt));
}

/** Filed rows as the papers a case run reads; a row with no abstract has nothing to read. */
export async function watchedPapers(
  userId: string,
  dois: string[],
): Promise<Paper[]> {
  const rows = await getDb()
    .select()
    .from(paperWatch)
    .where(
      and(
        eq(paperWatch.userId, userId),
        inArray(
          paperWatch.externalId,
          dois.map((d) => d.toLowerCase()),
        ),
        isNotNull(paperWatch.abstract),
      ),
    );
  // ponytail: the row keeps no authors, so the label falls back to the DOI
  return rows.map((r) => ({
    pmid: null,
    doi: r.externalId,
    title: r.title,
    journal: r.journal,
    year: r.publishedAt ? Number(String(r.publishedAt).slice(0, 4)) : null,
    authors: "",
    citedBy: 0,
    url: r.url ?? `https://doi.org/${r.externalId}`,
    abstract: r.abstract!,
  }));
}

/* ── reading the feed ─────────────────────────────────────────────────── */

/** The rows the page prints: unseen first, then what moves something. */
export async function listWatch(
  userId: string,
  opts: {
    unseen?: boolean;
    conditionId?: string;
    /**
     * Phase 35 section B2. A topic run files its papers with
     * `condition_id = "topic:<topic>"`, so the feed prints them with no new
     * plumbing and the topic page reads its own rows back through here.
     */
    topic?: string;
    limit?: number;
  } = {},
): Promise<PaperWatch[]> {
  const where = [eq(paperWatch.userId, userId), isNull(paperWatch.dismissedAt)];
  if (opts.unseen) where.push(isNull(paperWatch.seenAt));
  if (opts.conditionId)
    where.push(eq(paperWatch.conditionId, opts.conditionId));
  if (opts.topic) where.push(eq(paperWatch.conditionId, `topic:${opts.topic}`));
  const rows = await getDb()
    .select()
    .from(paperWatch)
    .where(and(...where))
    .orderBy(desc(paperWatch.foundAt))
    .limit(opts.limit ?? 50);
  return sortWatch(rows);
}

/**
 * Unseen first, then what moves something, then the newest.
 *
 * The mockup is explicit about the second key: "the panel is sorted by what it
 * moves, not by date: a paper that changes a number you are acting on outranks
 * a newer one that changes nothing."
 */
export function sortWatch<
  T extends Pick<PaperWatch, "seenAt" | "moves" | "foundAt">,
>(rows: T[]): T[] {
  const key = (r: T) => (r.seenAt == null ? 4 : 0) + (r.moves ? 2 : 0);
  return [...rows].sort(
    (a, b) =>
      key(b) - key(a) ||
      (b.foundAt?.getTime() ?? 0) - (a.foundAt?.getTime() ?? 0),
  );
}

/** One row on the wire. The owner is the session, so the row never carries it. */
export interface ApiPaper {
  id: string;
  conditionId: string;
  /**
   * What to print for the condition id. A catalog condition has its name
   * everywhere; a `topic:` row has only the label the person typed, so it
   * travels on the row.
   */
  conditionName: string | null;
  source: string;
  externalId: string;
  title: string;
  journal: string | null;
  url: string | null;
  publishedAt: string | null;
  grade: string | null;
  finding: string | null;
  abstract: string | null;
  moves: PaperMove | null;
  /**
   * Whether the intake ever read this paper.
   *
   * Phase 34 section 3. A row is written the moment Europe PMC names it, and
   * the grade and the one-sentence finding are filled in afterwards by the
   * model. When the key is at its limit the second half never runs, so the row
   * is a title with nothing behind it, and a client that only checks `grade`
   * cannot tell "graded E" from "never read". This says it out loud, so the
   * phone can print "found, not read yet" instead of guessing.
   */
  read: boolean;
  foundAt: string | null;
  seenAt: string | null;
  dismissedAt: string | null;
  /**
   * The paper in plain words, from `explainPapers`: what was studied, in
   * whom, and what came out. Null until that pass has read the row, and null
   * when it read it and the abstract gave it nothing to say.
   */
  summary: string | null;
  /** why this row is on this person's list, in one sentence */
  why: string;
  /** the question "Ask about this" sends, with what the row knows in it */
  ask: string;
  /** the condition id the chat is about, or null for a topic row */
  about: string | null;
  /**
   * The plan action this very paper stands behind, when one is on file:
   * an accepted, graded `hkb_interventions` row citing this DOI or PMID.
   * Null is the usual answer, and no button is drawn for it.
   */
  action: PaperAction | null;
}

/** One action a paper backs, as `/api/plan/adopt` takes it (`int:<id>`). */
export interface PaperAction {
  id: string;
  title: string;
  dose: string | null;
  grade: string;
}

/**
 * A stored row as the contract prints it.
 *
 * The user id comes off: the caller is the session, and a fixture the phone
 * decodes in its tests has no business carrying somebody's id.
 */
export function toApiPaper(
  r: PaperWatch,
  /**
   * The label per condition id, for the `topic:` rows. A topic is not in the
   * catalog, so "topic:cold exposure" has no name anywhere else; the person's
   * own `topic_watch.label` is the name, and a caller with no map gets the
   * topic itself rather than a blank.
   */
  labels?: Map<string, string>,
  /** the action behind each paper, by external id, from `paperActions` */
  actions?: Map<string, PaperAction>,
): ApiPaper {
  return {
    id: r.id,
    conditionId: r.conditionId,
    conditionName: conditionNameOf(r.conditionId, labels),
    source: r.source,
    externalId: r.externalId,
    title: r.title,
    journal: r.journal,
    url: r.url,
    publishedAt: r.publishedAt,
    grade: r.grade,
    finding: r.finding,
    abstract: r.abstract,
    moves: r.moves ?? null,
    read: r.grade != null || r.finding != null,
    foundAt: r.foundAt?.toISOString() ?? null,
    seenAt: r.seenAt?.toISOString() ?? null,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
    summary: summaryOf(r),
    why: whyShown(r, labels),
    ask: askAbout(r),
    about: r.conditionId.startsWith("topic:") ? null : r.conditionId,
    action: actions?.get(r.externalId) ?? null,
  };
}

/* ── making a row readable ────────────────────────────────────────────── */

/** The stored plain line, or null; the empty string means "read, nothing to say". */
export const summaryOf = (r: Pick<PaperWatch, "summary">): string | null =>
  r.summary?.trim() || null;

/**
 * Why this row is on this person's list, in one sentence.
 *
 * Every row was filed for a reason the row itself carries: a topic they
 * watch, or a condition their ledger had at possible or louder when the watch
 * ran. A row that moved a number says that instead, because that is the
 * stronger reason.
 */
export function whyShown(
  r: Pick<PaperWatch, "conditionId" | "moves">,
  names?: Map<string, string>,
): string {
  const name =
    conditionNameOf(r.conditionId, names) ?? r.conditionId.replace(/_/g, " ");
  if (r.moves) return `It changes how likely ${r.moves.name} is for you.`;
  if (r.conditionId.startsWith("topic:")) return `You watch ${name}.`;
  return `Your results flag ${name} as possible.`;
}

/**
 * The question "Ask about this" sends. The chat cannot see the paper, so the
 * question carries what the row knows: the title, the journal and year, and
 * the plain line when there is one. Nothing is added that the row lacks.
 */
export function askAbout(
  r: Pick<PaperWatch, "title" | "journal" | "publishedAt" | "summary">,
): string {
  const cite = [r.journal, r.publishedAt?.slice(0, 4)]
    .filter(Boolean)
    .join(", ");
  const found = summaryOf(r);
  return [
    `What does this paper mean for me? “${r.title}”${cite ? ` (${cite})` : ""}.`,
    found ? `What it found: ${found}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The names to print for each condition id on these rows: the catalog's name
 * for a condition, the person's own label for a topic. `conditionNameOf`
 * reads this map, so a catalog row is named rather than left blank.
 */
export async function paperNames(
  userId: string,
  rows: Pick<PaperWatch, "conditionId">[],
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.conditionId))];
  const catalog = ids.filter((id) => !id.startsWith("topic:"));
  const db = getDb();
  const [named, topics] = await Promise.all([
    catalog.length
      ? db
          .select({ id: hkbConditions.id, name: hkbConditions.name })
          .from(hkbConditions)
          .where(inArray(hkbConditions.id, catalog))
      : [],
    ids.length > catalog.length
      ? db
          .select({ topic: topicWatch.topic, label: topicWatch.label })
          .from(topicWatch)
          .where(eq(topicWatch.userId, userId))
      : [],
  ]);
  return new Map([
    ...named.map((c) => [c.id, c.name] as const),
    ...topics.map((t) => [`topic:${t.topic}`, t.label] as const),
  ]);
}

/** The order a grade is best in, for picking one action per paper. */
const GRADES = ["A", "B", "C", "D", "E"];

/**
 * The plan action each paper stands behind, by external id.
 *
 * Only an accepted, graded intervention whose own paper is this paper counts:
 * a row for the same condition from a different paper is not "what this
 * paper says to do". A drug or a procedure is left out, because starting one
 * takes a doctor and an Add button would say otherwise.
 */
export async function paperActions(
  rows: Pick<PaperWatch, "externalId">[],
): Promise<Map<string, PaperAction>> {
  const keys = [...new Set(rows.map((r) => r.externalId.toLowerCase()))];
  if (!keys.length) return new Map();
  const found = await getDb()
    .select()
    .from(hkbInterventions)
    .where(
      and(
        eq(hkbInterventions.status, "accepted"),
        or(
          inArray(sql<string>`lower(${hkbInterventions.paper}->>'doi')`, keys),
          inArray(sql<string>`${hkbInterventions.paper}->>'pmid'`, keys),
        ),
      ),
    );
  const out = new Map<string, PaperAction>();
  for (const r of found.sort(
    (a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade),
  )) {
    if (r.kind === "drug" || r.kind === "procedure") continue;
    const key = r.paper?.doi?.toLowerCase() ?? r.paper?.pmid ?? null;
    if (!key || out.has(key)) continue;
    out.set(key, {
      id: `int:${r.id}`,
      title: r.name,
      dose: r.dose,
      grade: r.grade,
    });
  }
  return out;
}

/* ── the plain line, written once ─────────────────────────────────────── */

/** Abstracts per call: eight short paragraphs is one cheap prompt. */
export const EXPLAIN_BATCH = 8;

export const EXPLAIN_PROMPT = `You rewrite medical papers for a person with no medical training.

For each numbered paper, write ONE sentence of at most 30 words that says what was studied, in whom, and what came out.

Rules:
- Use only what the title and abstract say. Never add a number, a dose, an effect or a population the abstract does not state.
- Keep the paper's own numbers with their units ("lowered LDL by about 13 mg/dL", "in 3,400 adults with type 2 diabetes").
- Plain words. Spell out an abbreviation the first time, or use the everyday word ("blood pressure", not "BP").
- An observational study finds a link, not a cause: write "was linked to", never "caused" or "lowered".
- No advice. Never say what the reader should do.
- When the paper reports no result (a protocol, a correction, a commentary, a methods paper), say what kind of paper it is and that it reports no health result.
- When the abstract is missing or says nothing you can use, return null for that paper.`;

const explainSchema = z.object({
  items: z.array(
    z.object({
      /** the paper's number in the prompt, from 1 */
      n: z.number().int(),
      line: z.string().nullable(),
    }),
  ),
});

/** What the plain-line pass reads per paper. */
export interface ExplainInput {
  title: string;
  journal: string | null;
  abstract: string | null;
  finding: string | null;
}

/** One batch in, one line (or null) per paper out, in the same order. */
export interface Explainer {
  (papers: ExplainInput[]): Promise<(string | null)[]>;
}

/** An abstract as prose: Europe PMC's `<h4>` headings and tags come off. */
export const plainAbstract = (text: string | null): string =>
  (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

/** A line the model wrote, cleaned: one sentence, no wrapping quotes, capped. */
export const cleanLine = (line: string | null | undefined): string | null => {
  const t = (line ?? "")
    .trim()
    .replace(/^["“'”]+|["”'“]+$/g, "")
    .trim();
  return t ? t.slice(0, 300) : null;
};

/** The default explainer: `AI_DEFAULT_MODEL` through the shared object helper. */
export const llmExplain =
  (modelId?: string): Explainer =>
  async (papers) => {
    const numbered = papers
      .map(
        (p, i) =>
          `[${i + 1}] ${p.title} (${p.journal ?? "?"})\n` +
          (plainAbstract(p.abstract) || "(no abstract)") +
          (p.finding ? `\nKey sentence: ${p.finding}` : ""),
      )
      .join("\n\n");
    const { object } = await generateObjectSafe({
      model: modelId,
      schema: explainSchema,
      system: EXPLAIN_PROMPT,
      prompt: `PAPERS:\n${numbered}`,
      maxOutputTokens: 2000,
    });
    return papers.map((_, i) =>
      cleanLine(object.items.find((x) => x.n === i + 1)?.line),
    );
  };

/**
 * Write the plain line for this person's rows that have none yet.
 *
 * A row is only ever explained once: the line is stored, and a row the model
 * had nothing to say about is stored as the empty string so the next pass
 * skips it. The same paper already explained for somebody else is copied, not
 * paid for again: the line is about the paper, not the person. Returns how
 * many rows got a line.
 */
export async function explainPapers(
  userId: string,
  options: { limit?: number; explain?: Explainer } = {},
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(paperWatch)
    .where(
      and(
        eq(paperWatch.userId, userId),
        isNull(paperWatch.summary),
        isNull(paperWatch.dismissedAt),
        or(isNotNull(paperWatch.abstract), isNotNull(paperWatch.finding)),
      ),
    )
    .orderBy(desc(paperWatch.foundAt))
    .limit(options.limit ?? 24);
  if (!rows.length) return 0;

  const done = await db
    .select({ externalId: paperWatch.externalId, summary: paperWatch.summary })
    .from(paperWatch)
    .where(
      and(
        inArray(
          paperWatch.externalId,
          rows.map((r) => r.externalId),
        ),
        isNotNull(paperWatch.summary),
        ne(paperWatch.summary, ""),
      ),
    );
  const known = new Map(done.map((d) => [d.externalId, d.summary!]));

  const set = (id: string, summary: string) =>
    db.update(paperWatch).set({ summary }).where(eq(paperWatch.id, id));

  let written = 0;
  const todo: PaperWatch[] = [];
  for (const r of rows) {
    const copy = known.get(r.externalId);
    if (copy) {
      await set(r.id, copy);
      written++;
    } else todo.push(r);
  }

  const explain = options.explain ?? llmExplain();
  for (let i = 0; i < todo.length; i += EXPLAIN_BATCH) {
    const batch = todo.slice(i, i + EXPLAIN_BATCH);
    const lines = await explain(batch);
    for (const [k, r] of batch.entries()) {
      const line = lines[k] ?? null;
      await set(r.id, line ?? "");
      if (line) written++;
    }
  }
  return written;
}

/** "topic:cold exposure" is "cold exposure" unless the watch list names it. */
export function conditionNameOf(
  conditionId: string,
  labels?: Map<string, string>,
): string | null {
  const named = labels?.get(conditionId);
  if (named) return named;
  return conditionId.startsWith("topic:")
    ? conditionId.slice("topic:".length)
    : null;
}

/** Mark one row seen or dismissed. Returns the row, or null when it is not theirs. */
export async function patchWatch(
  userId: string,
  id: string,
  patch: { seen?: boolean; dismissed?: boolean },
): Promise<PaperWatch | null> {
  const set: Partial<typeof paperWatch.$inferInsert> = {};
  if (patch.seen != null) set.seenAt = patch.seen ? new Date() : null;
  if (patch.dismissed != null)
    set.dismissedAt = patch.dismissed ? new Date() : null;
  if (!Object.keys(set).length) return null;
  const [row] = await getDb()
    .update(paperWatch)
    .set(set)
    .where(and(eq(paperWatch.id, id), eq(paperWatch.userId, userId)))
    .returning();
  return row ?? null;
}

/** How many rows this person has not seen yet, for the Home and Plan panels. */
export async function unseenCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(paperWatch)
    .where(
      and(
        eq(paperWatch.userId, userId),
        isNull(paperWatch.seenAt),
        isNull(paperWatch.dismissedAt),
      ),
    );
  return row?.n ?? 0;
}
