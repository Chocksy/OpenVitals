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
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, paperWatch, type PaperMove, type PaperWatch } from "@/db";
import { buildModelInput } from "@/lib/coverage";
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

  const facts = options.withDates === false
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
  return { conditionId: condition.id, since, found: found.length, stored, moved: 0 };
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

/* ── reading the feed ─────────────────────────────────────────────────── */

/** The rows the page prints: unseen first, then what moves something. */
export async function listWatch(
  userId: string,
  opts: { unseen?: boolean; conditionId?: string; limit?: number } = {},
): Promise<PaperWatch[]> {
  const where = [eq(paperWatch.userId, userId), isNull(paperWatch.dismissedAt)];
  if (opts.unseen) where.push(isNull(paperWatch.seenAt));
  if (opts.conditionId)
    where.push(eq(paperWatch.conditionId, opts.conditionId));
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
  foundAt: string | null;
  seenAt: string | null;
  dismissedAt: string | null;
}

/**
 * A stored row as the contract prints it.
 *
 * The user id comes off: the caller is the session, and a fixture the phone
 * decodes in its tests has no business carrying somebody's id.
 */
export function toApiPaper(r: PaperWatch): ApiPaper {
  return {
    id: r.id,
    conditionId: r.conditionId,
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
    foundAt: r.foundAt?.toISOString() ?? null,
    seenAt: r.seenAt?.toISOString() ?? null,
    dismissedAt: r.dismissedAt?.toISOString() ?? null,
  };
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
