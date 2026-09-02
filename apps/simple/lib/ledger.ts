/**
 * The ledger: every conclusion the engine will stand behind today, ranked by
 * how much it matters, with what moved since the last time we looked.
 *
 * Deterministic end to end. `scoreHypotheses` says what is true, `nextMoves`
 * says what to do about it, the readings say what improved. The LLM only ever
 * writes the one sentence on a card, and that arrives from the latest report.
 */
import { and, asc, desc, eq, gt, isNull, lt } from "drizzle-orm";
import {
  beliefSnapshots,
  getDb,
  goals,
  hkbRevisions,
  lifeEvents,
  profileFactHistory,
  protocolItems,
  readings,
  type ReportAction,
} from "@/db";
import type { RulerProps } from "@/components/ruler";
import { recordCalibration } from "./calibration";
import { buildModelInput, type ModelInput } from "./coverage";
import { eventConfounders } from "./facts";
import { explainKey } from "./explain";
import { getMetricRows, type MetricRow, type Point } from "./data";
import { SYSTEMS } from "./graph";
import { graphState, worstMember } from "./graph-state";
import { catalogFor, currentRevision } from "./hkb";
import {
  ledgerLine,
  makeProjections,
  projectionsFor,
  resolveProjections,
  type StoredProjection,
} from "./projections";
import {
  isRiskState,
  scoreHypotheses,
  type Grade,
  type HState,
  type Hypothesis,
  type HypothesisResult,
  type Lens,
} from "./hypotheses";
import { nextMoves, type Move } from "./infogain";
import { asksFromMoves, type Ask } from "./asking";
import { wakeConditions } from "./wake";
import { latestReport } from "./report";
import { queueResearch } from "./research";
import type { Status } from "./status";

/** One line of evidence, exactly as `scoreHypotheses` emits it. */
export type EvidenceLine = HypothesisResult["for"][number];

export interface Conclusion {
  /** condition id, `marker:<code>` for an off marker no condition reads */
  id: string;
  kind: "condition" | "marker" | "improved";
  rank: number;
  /** "<name>: <state>", or "<metric> <value> <unit>, <status>" for a marker */
  title: string;
  /** a risk state, not a disease: the card wears a RISK chip and risk words */
  risk?: true;
  probability?: number;
  state?: HState;
  lenses: Partial<Record<Lens, { w: number; grade: Grade }>>;
  /** score × lensWeight for the chosen lens, the number `rank` sorts on */
  matters: number;
  for: EvidenceLine[];
  against: EvidenceLine[];
  missing: string[];
  confounded: string[];
  inputs: {
    kind: "reading" | "fact";
    id: string;
    label: string;
    value: string;
    date?: string;
  }[];
  /** the three best moves that touch this conclusion */
  next: Move[];
  /** the best free question among `next`, rendered inline on the card */
  question?: Move;
  /** the latest report action whose targets name one of this one's codes */
  action?: ReportAction;
  rangeBar?: RulerProps;
  trend?: { code: string; points: Point[] };
  /**
   * The projection for this conclusion's lead marker, as one line: "On track:
   * HbA1c expected 5.6 by Nov 20", or the verdict once the draw has landed.
   * Phase 19.
   */
  projection?: { code: string; line: string; verdict: string | null };
  changed?: {
    from?: HState;
    to: HState;
    deltaP: number;
    /** the fact edit that explains the flip, when one does */
    because?: string;
    /**
     * Which kind of change this was. `data` is the same knowledge base reading
     * new inputs; `knowledge` is the same inputs read by a knowledge base that
     * learned something; `both` is both, and `unknown` is a snapshot from
     * before phase 17, which carries no revision.
     */
    kind: "data" | "knowledge" | "both" | "unknown";
    /** the `hkb_revisions` summaries that name this condition */
    knowledge?: string[];
    /** the whole sentence, already written */
    line: string;
  };
}

export interface Ledger {
  bioAge?: { pheno: number; chrono: number; inputs: string[] };
  /** what PhenoAge is still waiting for, when `bioAge` is undefined */
  bioAgeMissing: string[];
  counters: {
    optimal: number;
    normal: number;
    off: number;
    questions: number;
    nextDrawWeeks?: number;
    nextDrawCodes: string[];
  };
  systems: {
    id: string;
    name: string;
    score: number;
    worst?: {
      code: string;
      value: number | null;
      unit: string | null;
      status: Status;
    };
  }[];
  spear?: Conclusion;
  conclusions: Conclusion[];
  /**
   * Every question worth asking today, one entry per fact key with the
   * conditions it would move. The Today card asks the first one; every other
   * surface prints a line and links back. Phase 24a.
   */
  asks: Ask[];
  quiet: {
    unlikely: number;
    ruledOut: number;
    ids: string[];
    /** the unlikely ones, with what the line prints: name and probability */
    rows: { id: string; name: string; p: number }[];
    /**
     * The ruled-out ones, kept apart so the page can hide them behind their
     * own toggle. Ring 2 means this list is mostly rare diseases the engine
     * looked at and dismissed, which is exactly what it should be.
     */
    ruledOutRows: { id: string; name: string; p: number; ring?: number }[];
  };
  improved: {
    code: string;
    name: string;
    from: number;
    to: number;
    unit: string | null;
    since: string;
  }[];
  since?: {
    at: string;
    resolved: number;
    new: number;
    stronger: number;
    weaker: number;
    /** the knowledge-base revision then and now */
    wasKbRevision?: number | null;
    kbRevision?: number | null;
    /** how many mutation batches the knowledge base took in between */
    knowledgeBatches?: number;
  };
}

/* ── the small rules the whole file leans on ──────────────────────────── */

const RANK: Record<HState, number> = {
  ruled_out: 0,
  unlikely: 1,
  possible: 2,
  likely: 3,
  confirmed: 4,
};

/** "possible" is the line between a card and a line in the quiet list. */
export const isLoud = (state: HState) => RANK[state] >= RANK.possible;

const STATUS_RANK: Record<Status, number> = {
  red: 3,
  amber: 2,
  gray: 1,
  green: 0,
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** How far a probability has to move before a knowledge change is worth a line. */
const KNOWLEDGE_DELTA = 0.02;

/** score × lensWeight, the same product `scoreHypotheses` already sorts on. */
export const mattersOf = (h: HypothesisResult) =>
  round3(h.score * h.lensWeight);

/**
 * The band a conclusion sits in, which is the first thing the order reads.
 *
 * An off marker sits between "possible" and "unlikely": a number outside its
 * range is a fact, so it beats a condition nobody believes in, and it loses to
 * a condition somebody does.
 */
const BAND: Record<HState, number> = {
  confirmed: 5,
  likely: 4,
  possible: 3,
  unlikely: 1,
  ruled_out: 0,
};
const MARKER_BAND = 2;

/** Everything `rankKeyOf` needs, which is less than a whole `Conclusion`. */
export interface Rankable {
  id: string;
  state?: HState;
  /** score × lensWeight for the chosen lens */
  matters: number;
  probability?: number;
  title: string;
  /** set when the catalog row carries the flag rather than the id */
  kind?: string;
}

/**
 * The order the ledger stands behind: certainty first, the lens second.
 *
 * Sorting on `matters` alone put a 49 % "possible" cardiovascular risk score
 * above a 92.6 % **confirmed** iron deficiency, because the lifespan lens
 * weights the risk 3× and the deficiency 1×. Arithmetic, and wrong: a thing
 * we know is true outranks a thing that might be. So the band comes first and
 * the lens only reorders inside a band. Risk states are not diseases, so they
 * sort after diseases of the same band whatever the lens says.
 */
export const rankKeyOf = (c: Rankable) => ({
  band: c.state ? BAND[c.state] : MARKER_BAND,
  /** 0 disease, 1 risk state: lower first */
  risk: isRiskState(c) ? 1 : 0,
  matters: c.matters,
  probability: c.probability ?? 0,
  title: c.title,
});

/** `rankKeyOf` as a comparator, which is the only way anything uses it. */
export function byRank(a: Rankable, b: Rankable): number {
  const x = rankKeyOf(a);
  const y = rankKeyOf(b);
  return (
    y.band - x.band ||
    x.risk - y.risk ||
    y.matters - x.matters ||
    y.probability - x.probability ||
    x.title.localeCompare(y.title)
  );
}

/**
 * What a risk state's score is called, because "possible" is the wrong word
 * for a number about the future. 49 % ASCVD is not "possible atherosclerosis";
 * it is a raised risk.
 */
export const RISK_WORD: Record<HState, string> = {
  confirmed: "very high",
  likely: "high",
  possible: "raised",
  unlikely: "low",
  ruled_out: "low",
};

/**
 * The short noun a risk state wears, and the word to use when the plain state
 * word would lie: a screening gap is "overdue", not "raised", and fitness is
 * "low", not "high".
 */
const RISK_TITLE: Record<string, { name: string; word?: string }> = {
  ascvd_risk: { name: "Cardiovascular risk" },
  cancer_screening_due: { name: "Screening", word: "overdue" },
  low_fitness_sarcopenia: { name: "Fitness", word: "low" },
};

/** "Cardiovascular risk", not "Low fitness and muscle loss", on a card or a line. */
export const displayNameOf = (h: {
  id: string;
  name: string;
  kind?: string;
}): string => (isRiskState(h) ? (RISK_TITLE[h.id]?.name ?? h.name) : h.name);

/**
 * The title a card prints. "Cardiovascular risk: raised", never
 * "Atherosclerotic risk: possible"; a disease keeps its state word.
 */
export const titleOf = (h: {
  id: string;
  name: string;
  state: HState;
  kind?: string;
}): string =>
  isRiskState(h)
    ? `${displayNameOf(h)}: ${RISK_TITLE[h.id]?.word ?? RISK_WORD[h.state]}`
    : `${h.name}: ${h.state.replace("_", " ")}`;

/**
 * A condition earns a card when it is at least possible, when a rule fired for
 * it and there is still a test that would move it, or when it changed state
 * since the last snapshot. Everything else is a line in the quiet list.
 *
 * Phase 17: ruled out is ruled out. A posterior under 5 % never gets a card,
 * not even on a state change, because ring 2 put ten thousand diseases in the
 * engine and every one of them "changes state" the day it is woken. It is
 * still in the quiet list, behind the "show ruled out" toggle.
 */
export const isConclusion = (h: HypothesisResult, changed = false): boolean =>
  h.state !== "ruled_out" &&
  (isLoud(h.state) || changed || (h.for.length > 0 && h.nextTests.length > 0));

/** The markers a condition is scored on: how an action is tied to a card. */
export const metricCodesOf = (h: Hypothesis): string[] => [
  ...new Set([
    ...h.evidence.map((r) => r.input.metric).filter((c): c is string => !!c),
    ...h.discriminators.flatMap((d) => d.codes),
  ]),
];

const factKeysOf = (h: Hypothesis): string[] => [
  ...new Set(
    h.evidence.map((r) => r.input.fact).filter((k): k is string => !!k),
  ),
];

const pretty = (code: string) => code.replace(/_/g, " ");

/* ── snapshots ────────────────────────────────────────────────────────── */

export type Beliefs = Record<string, { p: number; state: string }>;

export const beliefsOf = (rows: HypothesisResult[]): Beliefs =>
  Object.fromEntries(rows.map((h) => [h.id, { p: h.score, state: h.state }]));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The newest snapshot older than an hour: what "since" and "changed" read. */
async function previousSnapshot(userId: string) {
  const [row] = await getDb()
    .select()
    .from(beliefSnapshots)
    .where(
      and(
        eq(beliefSnapshots.userId, userId),
        lt(beliefSnapshots.computedAt, new Date(Date.now() - HOUR)),
      ),
    )
    .orderBy(desc(beliefSnapshots.computedAt))
    .limit(1);
  return row ?? null;
}

async function writeSnapshot(
  userId: string,
  beliefs: Beliefs,
  oncePerDay: boolean,
) {
  const db = getDb();
  if (oncePerDay) {
    const [last] = await db
      .select({ at: beliefSnapshots.computedAt })
      .from(beliefSnapshots)
      .where(eq(beliefSnapshots.userId, userId))
      .orderBy(desc(beliefSnapshots.computedAt))
      .limit(1);
    if (last?.at && Date.now() - last.at.getTime() < DAY) return;
  }
  // The knowledge base as it stood, so "what changed" can tell a new lab
  // result from a changed likelihood ratio.
  await db
    .insert(beliefSnapshots)
    .values({ userId, beliefs, kbRevision: await currentRevision() });
}

/**
 * What the knowledge base learned between two revisions, and which of it names
 * this condition.
 *
 * Every mutation batch writes one `hkb_revisions` row with the condition id in
 * its summary where it has one, so a plain substring is enough to say "the
 * evidence for Hashimoto's changed" rather than "something changed".
 */
async function knowledgeSince(
  from: number | null,
  to: number | null,
): Promise<{ id: number; summary: string }[]> {
  if (from == null || to == null || to <= from) return [];
  return getDb()
    .select({ id: hkbRevisions.id, summary: hkbRevisions.summary })
    .from(hkbRevisions)
    .where(gt(hkbRevisions.id, from))
    .orderBy(asc(hkbRevisions.id));
}

/**
 * Score this person and keep the row. Called after an upload's curator run,
 * an answered question, and an adopted or dismissed action, so the next page
 * load can say what changed.
 */
export async function recordBeliefs(
  userId: string,
  opts: { oncePerDay?: boolean } = {},
): Promise<void> {
  const [input, catalog, before] = await Promise.all([
    buildModelInput(userId),
    catalogFor(userId),
    previousSnapshot(userId),
  ]);
  let rows = scoreHypotheses(input, { catalog });

  // The rings are reconsidered by exactly the hooks that recompute beliefs, so
  // a ferritin of 1200 or an accepted diagnosis reaches the differential on the
  // same request that recorded it. A wake changes the catalog, so anything that
  // woke is scored before the snapshot is written.
  const wakes = await wakeConditions(userId, input, rows).catch((e) => {
    console.error("[wake] could not reconsider the rings:", e);
    return null;
  });
  if (wakes && (wakes.woke.length || wakes.dismissed.length))
    rows = scoreHypotheses(input, { catalog: await catalogFor(userId) });

  // Before the new snapshot, so `predicted` is the belief from before today's
  // readings and not the one they already moved.
  await recordCalibration(userId, input, rows, await catalogFor(userId)).catch(
    (e) => console.error("[calibration] could not record:", e),
  );
  // A draw that lands after a projection's retest window closes it, and a new
  // adoption or a changed adherence opens the next one. Both hang off the same
  // hook that recomputes beliefs, so nothing has to be scheduled.
  await resolveProjections(userId).catch((e) =>
    console.error("[projection] could not resolve:", e),
  );
  await makeProjections(userId).catch((e) =>
    console.error("[projection] could not project:", e),
  );

  await writeSnapshot(userId, beliefsOf(rows), opts.oncePerDay ?? false);
  await queueNewlyPossible(rows, (before?.beliefs ?? null) as Beliefs | null);
}

/**
 * A condition that just became worth arguing about is a condition worth
 * reading papers on. The queue is drained by the timer in
 * `instrumentation.ts`, and a condition read in the last 90 days is skipped.
 */
async function queueNewlyPossible(
  rows: HypothesisResult[],
  before: Beliefs | null,
) {
  for (const h of rows) {
    if (!isLoud(h.state)) continue;
    if (before && isLoud((before[h.id]?.state ?? "ruled_out") as HState))
      continue;
    try {
      await queueResearch(h.id);
    } catch (e) {
      console.error("[research] could not queue", h.id, e);
    }
  }
}

/* ── the pure halves, so the tests need no database ───────────────────── */

/** resolved / new / stronger / weaker against a snapshot. */
export function sinceOf(
  rows: HypothesisResult[],
  before: Beliefs,
  at: string,
): Ledger["since"] {
  let resolved = 0;
  let added = 0;
  let stronger = 0;
  let weaker = 0;
  const now = new Map(rows.map((h) => [h.id, h]));

  for (const [id, was] of Object.entries(before)) {
    const h = now.get(id);
    const wasLoud = isLoud(was.state as HState);
    if (wasLoud && !(h && isLoud(h.state))) resolved++;
  }
  for (const h of rows) {
    const was = before[h.id];
    if (isLoud(h.state) && !(was && isLoud(was.state as HState))) {
      added++;
      continue;
    }
    if (!was) continue;
    if (isLoud(was.state as HState) && !isLoud(h.state)) continue; // resolved
    const delta = h.score - was.p;
    if (delta >= 0.05) stronger++;
    else if (delta <= -0.05) weaker++;
  }
  return { at, resolved, new: added, stronger, weaker };
}

/**
 * A marker moved toward optimal: inside the band now, outside it two or more
 * draws ago. Anything that was always inside is not news.
 */
export function improvedOf(rows: MetricRow[]): Ledger["improved"] {
  const out: Ledger["improved"] = [];
  for (const m of rows) {
    if (m.points.length < 3) continue;
    if (m.optimalLow == null && m.optimalHigh == null) continue;
    const inside = (v: number) =>
      (m.optimalLow == null || v >= m.optimalLow) &&
      (m.optimalHigh == null || v <= m.optimalHigh);
    const latest = m.points[m.points.length - 1]!;
    if (!inside(latest.value)) continue;
    const older = m.points
      .slice(0, -2)
      .filter((p) => !inside(p.value))
      .pop();
    if (!older) continue;
    out.push({
      code: m.code,
      name: m.name,
      from: older.value,
      to: latest.value,
      unit: m.latest.unit ?? m.unit,
      since: older.date,
    });
  }
  return out;
}

/* ── what changed, and whether it was you or us ───────────────────────── */

/** The `hkb_revisions` summaries that name this condition by id or by name. */
const namesIt = (
  h: HypothesisResult,
  revisions: { summary: string }[],
): string[] =>
  revisions
    .filter(
      (r) =>
        r.summary.includes(h.id) ||
        r.summary.toLowerCase().includes(h.name.toLowerCase()),
    )
    // The summary starts with the condition id so `namesIt` can find it; the
    // sentence does not need to say it twice.
    .map((r) => r.summary.replace(new RegExp(`^${h.id}:\\s*`), ""));

const pct = (p: number) =>
  p >= 0.01 ? `${Math.round(p * 100)} %` : `${(p * 100).toPrecision(2)} %`;

/**
 * "Hashimoto's 5 % → 8 %: the evidence for anti-Tg was updated (pooled with
 * Sheppard 2022), your data did not change."
 *
 * Two diffs, not one. Same knowledge base and different inputs means the
 * person changed; same inputs and a different knowledge base means we did. The
 * distinction matters because only one of the two is about them.
 */
export function changeOf(
  h: HypothesisResult,
  prev: { p: number; state: string },
  because: string | undefined,
  dataChanged: boolean,
  revisions: { summary: string }[],
  wasRevision: number | null,
  nowRevision: number | null,
): NonNullable<Conclusion["changed"]> {
  const knowledge = namesIt(h, revisions);
  const kind: NonNullable<Conclusion["changed"]>["kind"] =
    wasRevision == null || nowRevision == null
      ? "unknown"
      : knowledge.length && dataChanged
        ? "both"
        : knowledge.length
          ? "knowledge"
          : dataChanged
            ? "data"
            : "unknown";

  const move = `${h.name} ${pct(prev.p)} → ${pct(h.score)}`;
  const why =
    kind === "knowledge"
      ? `${knowledge[0]}, your data did not change.`
      : kind === "both"
        ? `${knowledge[0]}, and your data changed too${because ? ` (${because})` : ""}.`
        : kind === "data"
          ? because
            ? `${because}. What we know did not change.`
            : "your data changed; what we know did not."
          : because
            ? `${because}.`
            : "the inputs moved.";

  return {
    from: prev.state as HState,
    to: h.state,
    deltaP: round3(h.score - prev.p),
    ...(because ? { because } : {}),
    kind,
    ...(knowledge.length ? { knowledge } : {}),
    line: `${move}: ${why}`,
  };
}

/* ── the ledger ───────────────────────────────────────────────────────── */

/** The nine markers PhenoAge reads, plus the age it needs to read them with. */
const PHENO_INPUTS: [string, string][] = [
  ["albumin", "albumin"],
  ["creatinine", "creatinine"],
  ["glucose", "glucose"],
  ["hs_crp", "hs-CRP"],
  ["lymphocytes_pct", "lymphocytes %"],
  ["mcv", "MCV"],
  ["rdw", "RDW"],
  ["alp", "ALP"],
  ["wbc", "WBC"],
];

function phenoInputs(input: ModelInput) {
  const has = (code: string) =>
    code === "hs_crp"
      ? input.latest.hs_crp?.value != null || input.latest.crp?.value != null
      : code === "rdw"
        ? input.latest.rdw?.value != null || input.latest.rdw_cv?.value != null
        : input.latest[code]?.value != null;
  const present = PHENO_INPUTS.filter(([code]) => has(code)).map(([, l]) => l);
  const missing = PHENO_INPUTS.filter(([code]) => !has(code)).map(([, l]) => l);
  if (input.age == null) missing.push("your birth year");
  return { present, missing };
}

/** Which off-optimal draw the card leads with: worst status wins. */
function headline(codes: string[], byCode: Map<string, MetricRow>) {
  let best: MetricRow | null = null;
  for (const code of codes) {
    const row = byCode.get(code);
    if (!row || row.latest.value == null) continue;
    if (!best || STATUS_RANK[row.status] > STATUS_RANK[best.status]) best = row;
  }
  return best;
}

/**
 * The projection line for a conclusion: the newest open one for any marker it
 * reads, else the newest resolved one, so the card can say either "on track"
 * or what the draw said.
 */
function projectionFor(
  codes: string[],
  made: StoredProjection[],
  rows: MetricRow[],
): Conclusion["projection"] {
  const mine = made.filter((p) => codes.includes(p.code));
  const p = mine.find((x) => !x.resolvedAt) ?? mine[0];
  if (!p) return undefined;
  const unit = rows.find((r) => r.code === p.code)?.unit ?? "";
  return { code: p.code, line: ledgerLine(p, unit), verdict: p.verdict };
}

const rangeBarOf = (m: MetricRow): RulerProps => ({
  value: m.latest.value,
  prev: m.rows.filter((r) => r.value != null).at(-2)?.value ?? null,
  prevDate: m.rows.filter((r) => r.value != null).at(-2)?.observedAt ?? null,
  refLow: m.latest.refLow,
  refHigh: m.latest.refHigh,
  optimalLow: m.optimalLow,
  optimalHigh: m.optimalHigh,
  unit: m.latest.unit ?? m.unit,
});

const DEFAULT_DRAW_WEEKS = 12;
const DAY_MS = 86_400_000;

/** One planned draw: a goal with a date on it, or an adopted action's target. */
export interface DrawTarget {
  code: string;
  /** how many weeks from today, rounded up; already-due is 0 */
  weeks: number;
}

/**
 * What the Next draw tile says, from the three places a date can come from.
 *
 * Phase 27 put "Plan retest: HbA1c in 12 weeks" under every answer, and it
 * writes a goal with a due date — the same row `/goals` has always had. So the
 * tile reads the soonest thing that is actually planned: a dated goal first,
 * then the targets of the actions this person adopted, then, when nothing at
 * all is planned, the tests the engine would buy next.
 *
 * Pure, so the arithmetic is testable without a clock or a database.
 */
export function nextDraw(
  planned: DrawTarget[],
  adopted: { code: string; weeks: number }[],
  suggested: string[],
): { weeks: number; codes: string[] } {
  const rows = planned.length ? planned : adopted;
  if (!rows.length)
    return { weeks: DEFAULT_DRAW_WEEKS, codes: [...new Set(suggested)].slice(0, 4) };
  return {
    weeks: Math.min(...rows.map((r) => r.weeks)),
    codes: [...new Set(rows.map((r) => r.code))].slice(0, 4),
  };
}

/** A due date into whole weeks from today, never negative. */
export const weeksUntil = (due: string, today: string): number =>
  Math.max(
    0,
    Math.round(
      (new Date(`${due}T00:00:00Z`).getTime() -
        new Date(`${today}T00:00:00Z`).getTime()) /
        (7 * DAY_MS),
    ),
  );

export async function buildLedger(
  userId: string,
  lens: Lens = "lifespan",
): Promise<Ledger> {
  const db = getDb();
  const [
    input,
    catalog,
    rows,
    report,
    protocol,
    rawReadings,
    before,
    events,
    made,
    dated,
  ] = await Promise.all([
    buildModelInput(userId),
    catalogFor(userId),
    getMetricRows(userId),
    latestReport(userId),
    db
      .select()
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      ),
    db
      .select({
        id: readings.id,
        metricCode: readings.metricCode,
        value: readings.value,
        unit: readings.unit,
        observedAt: readings.observedAt,
      })
      .from(readings)
      .where(eq(readings.userId, userId))
      .orderBy(asc(readings.observedAt)),
    previousSnapshot(userId),
    db.select().from(lifeEvents).where(eq(lifeEvents.userId, userId)),
    projectionsFor(userId),
    // The retests somebody actually planned: a goal with a date on it, still
    // open. `achievedAt` closes one, and a date in the past is a draw that was
    // missed rather than a draw that is next.
    db
      .select({ metricCode: goals.metricCode, due: goals.due })
      .from(goals)
      .where(and(eq(goals.userId, userId), isNull(goals.achievedAt))),
  ]);

  // An old draw gets its context from the timeline, not from a question: an
  // illness or a pregnancy that was going on when a marker was drawn discounts
  // that marker exactly the way a tagged confounder does.
  const confounderTags = eventConfounders(
    events,
    Object.fromEntries(
      Object.entries(input.latest).map(([code, v]) => [code, v.date]),
    ),
  );

  const scored = scoreHypotheses(input, { catalog, lens, confounderTags });
  const moves = nextMoves(input, catalog, { lens });
  const nameOf = new Map(scored.map((h) => [h.id, displayNameOf(h)]));
  const asks = asksFromMoves(moves, (id) => nameOf.get(id) ?? pretty(id));

  // What a person told us since the last snapshot, so a flip can name its
  // cause instead of just its size.
  const edits = before
    ? await db
        .select()
        .from(profileFactHistory)
        .where(
          and(
            eq(profileFactHistory.userId, userId),
            gt(profileFactHistory.createdAt, before.computedAt),
          ),
        )
    : [];
  const editText = new Map(
    edits.map((e) => [
      e.key,
      `${pretty(e.key)} ${Array.isArray(e.value) ? e.value.join(", ") : String(e.value)} ` +
        `${e.changeKind === "corrected" ? "corrected" : "entered"} ${e.validFrom}`,
    ]),
  );
  // The other half of "what changed": what the knowledge base learned in the
  // same window, and whether any reading arrived at all.
  const kbRevision = await currentRevision();
  const revisions = await knowledgeSince(
    before?.kbRevision ?? null,
    kbRevision,
  );
  const dataChanged =
    edits.length > 0 ||
    (before != null &&
      rawReadings.some(
        (r) => new Date(r.observedAt).getTime() >= before.computedAt.getTime(),
      ));

  const byId = new Map(catalog.map((h) => [h.id, h]));
  const byCode = new Map(rows.map((m) => [m.code, m]));
  const latestReading = new Map(rawReadings.map((r) => [r.metricCode, r]));
  const was = (before?.beliefs ?? null) as Beliefs | null;

  /* conditions */
  const actions = report?.body.actions ?? [];
  const conclusions: Conclusion[] = [];
  const quiet: Ledger["quiet"] = {
    unlikely: 0,
    ruledOut: 0,
    ids: [],
    rows: [],
    ruledOutRows: [],
  };

  for (const h of scored) {
    const prev = was?.[h.id];
    const spec0 = byId.get(h.id);
    const because = spec0
      ? factKeysOf(spec0)
          .map((k) => editText.get(k))
          .find(Boolean)
      : undefined;
    // A state change always counts. So does a plain probability move, but only
    // when the knowledge base moved too: "Hashimoto's 5 % -> 8 % because the
    // anti-Tg evidence was updated" is the sentence phase 17 exists to write,
    // and 5 % to 8 % is not a state change.
    const knowledgeMoved =
      revisions.length > 0 &&
      prev != null &&
      Math.abs(h.score - prev.p) >= KNOWLEDGE_DELTA;
    const changed =
      prev != null && (prev.state !== h.state || knowledgeMoved)
        ? changeOf(
            h,
            prev,
            because,
            dataChanged,
            revisions,
            before?.kbRevision ?? null,
            kbRevision,
          )
        : undefined;

    if (!isConclusion(h, changed != null)) {
      quiet.ids.push(h.id);
      if (h.state === "ruled_out") {
        quiet.ruledOut++;
        quiet.ruledOutRows.push({
          id: h.id,
          name: h.name,
          p: h.score,
          ring: byId.get(h.id)?.ring ?? 1,
        });
      } else {
        quiet.unlikely++;
        quiet.rows.push({ id: h.id, name: h.name, p: h.score });
      }
      continue;
    }

    const spec = byId.get(h.id);
    const codes = spec ? metricCodesOf(spec) : [];
    const facts = spec ? factKeysOf(spec) : [];
    const lead = headline(codes, byCode);
    const next = moves
      .filter((m) => m.moves.some((x) => x.id === h.id))
      .slice(0, 3);

    conclusions.push({
      id: h.id,
      kind: "condition",
      rank: 0,
      title: titleOf(h),
      ...(isRiskState(h) ? { risk: true as const } : {}),
      probability: h.score,
      state: h.state,
      lenses: h.lenses,
      matters: mattersOf(h),
      for: h.for,
      against: h.against,
      /**
       * Two rules waiting on the same marker are one thing to measure, so the
       * "Never measured" line says Testosterone once.
       */
      missing: [...new Set(h.missing.map((x) => explainKey(x.input)))],
      confounded: [
        ...new Set(
          h.confounded.map((c) => `${explainKey(c.input)} (${c.tag})`),
        ),
      ],
      inputs: [
        ...codes.flatMap((code) => {
          const r = latestReading.get(code);
          if (!r) return [];
          return [
            {
              kind: "reading" as const,
              id: r.id,
              label: byCode.get(code)?.name ?? explainKey(code),
              value: `${r.value ?? "?"}${r.unit ? ` ${r.unit}` : ""}`,
              date: r.observedAt,
            },
          ];
        }),
        ...facts.flatMap((key) => {
          const v = input.profile[key];
          if (v == null || String(v).trim() === "") return [];
          return [
            {
              kind: "fact" as const,
              id: key,
              label: explainKey(key),
              value: Array.isArray(v) ? v.join(", ") : String(v),
            },
          ];
        }),
      ],
      next,
      question: next.find((m) => m.kind === "question" && m.cost === 0),
      action: actions.find((a) =>
        a.targets.some((t) => codes.includes(t.code)),
      ),
      rangeBar: lead ? rangeBarOf(lead) : undefined,
      trend:
        lead && lead.points.length >= 3
          ? { code: lead.code, points: lead.points }
          : undefined,
      projection: projectionFor(codes, made, rows),
      changed,
    });
  }

  /* markers nobody explains */
  const explained = new Set(
    conclusions.flatMap((c) => {
      const spec = byId.get(c.id);
      return spec ? metricCodesOf(spec) : [];
    }),
  );
  for (const m of rows) {
    if (m.status !== "red" || explained.has(m.code)) continue;
    const r = latestReading.get(m.code);
    const unit = m.latest.unit ?? m.unit;
    conclusions.push({
      id: `marker:${m.code}`,
      kind: "marker",
      rank: 0,
      title: `${m.name} ${m.latest.value ?? "?"}${unit ? ` ${unit}` : ""}, off`,
      lenses: {},
      matters: 0,
      for: [],
      against: [],
      missing: [],
      confounded: [],
      inputs: r
        ? [
            {
              kind: "reading",
              id: r.id,
              label: m.name,
              value: `${r.value ?? "?"}${r.unit ? ` ${r.unit}` : ""}`,
              date: r.observedAt,
            },
          ]
        : [],
      next: moves.filter((x) => x.featureId === `metric:${m.code}`).slice(0, 3),
      rangeBar: rangeBarOf(m),
      trend:
        m.points.length >= 3 ? { code: m.code, points: m.points } : undefined,
      projection: projectionFor([m.code], made, rows),
    });
  }

  conclusions.sort(byRank);
  conclusions.forEach((c, i) => (c.rank = i + 1));

  const first = conclusions[0];
  const spear =
    first && (first.kind === "marker" || (first.state && isLoud(first.state)))
      ? first
      : undefined;

  /* the cockpit row */
  let optimal = 0;
  let normal = 0;
  let off = 0;
  for (const m of rows) {
    if (m.status === "green") optimal++;
    else if (m.status === "amber") normal++;
    else if (m.status === "red") off++;
  }

  const adopted = actions.filter((a) =>
    protocol.some((p) => p.text.startsWith(a.title)),
  );
  const draw = nextDraw(
    dated
      .filter((g) => g.due != null)
      .map((g) => ({
        code: g.metricCode,
        weeks: weeksUntil(g.due!, input.today),
      })),
    adopted.flatMap((a) =>
      a.targets.map((t) => ({ code: t.code, weeks: t.measureAfterWeeks })),
    ),
    moves
      .filter((m) => m.kind === "test")
      .slice(0, 3)
      .map((m) => m.label),
  );
  const nextDrawWeeks = draw.weeks;
  const nextDrawCodes = draw.codes;

  const graph = await graphState(input, { top: 60 });
  const importance = new Map(graph.nodes.map((n) => [n.id, n.importance]));
  const systems: Ledger["systems"] = SYSTEMS.map((s) => {
    const worst = worstMember(s.id, input, importance);
    const row = worst ? input.latest[worst.code] : null;
    return {
      id: s.id,
      name: s.name,
      score: round2(importance.get(`system:${s.id}`) ?? 0),
      worst:
        worst && row
          ? {
              code: worst.code,
              value: row.value,
              unit: row.unit,
              status: row.status,
            }
          : undefined,
    };
  }).sort((a, b) => b.score - a.score);

  const pheno = phenoInputs(input);
  await writeSnapshot(userId, beliefsOf(scored), true);

  return {
    bioAge:
      input.derived.phenoAge != null && input.age != null
        ? {
            pheno: input.derived.phenoAge,
            chrono: input.age,
            inputs: pheno.present,
          }
        : undefined,
    bioAgeMissing: pheno.missing,
    counters: {
      optimal,
      normal,
      off,
      questions: asks.length,
      nextDrawWeeks,
      nextDrawCodes,
    },
    systems,
    spear,
    conclusions,
    asks,
    quiet,
    improved: improvedOf(rows),
    since:
      was && before
        ? {
            ...sinceOf(
              scored,
              was,
              before.computedAt.toISOString().slice(0, 10),
            )!,
            wasKbRevision: before.kbRevision,
            kbRevision,
            knowledgeBatches: revisions.length,
          }
        : undefined,
  };
}
