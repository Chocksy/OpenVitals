/**
 * What changed since a person started something, and what research did.
 *
 * Batch 5B. The owner took psyllium from 5 Oct, LDL went 131 to 104 on the
 * 17 Nov draw, and the only place that said so was a collapsed block on Plan.
 * `sinceStarted` is that sentence as data: for each active protocol item that
 * names a marker, the last reading on or before the day it started against
 * the newest reading after it. `researchWeek` is the one line saying what the
 * research pass did this week.
 *
 * Pure. No database, no clock, no network.
 */
import { betterDirection } from "./projection";

export interface ChangeItem {
  id: string;
  text: string;
  metricCodes: string[] | null;
  active: boolean;
  /** `YYYY-MM-DD`, the day the person says they started */
  startedAt: string | null;
  /** the fallback when `startedAt` is null */
  createdAt: Date | string | null;
}

export interface ChangeReading {
  code: string;
  value: number;
  /** `YYYY-MM-DD` */
  date: string;
  optimalLow?: number | null;
  optimalHigh?: number | null;
}

export interface SinceChange {
  item: { id: string; text: string; start: string };
  code: string;
  before: { value: number; date: string };
  after: { value: number; date: string };
  delta: number;
  /** percent change against `before`, one decimal; null when before is 0 */
  pct: number | null;
  better: boolean;
  /** no move worth a word: equal values, or the same distance to the band */
  same: boolean;
}

const dayOf = (d: Date | string | null): string | null =>
  d == null
    ? null
    : typeof d === "string"
      ? d.slice(0, 10)
      : d.toISOString().slice(0, 10);

/** The day an item started: `started_at`, else the day it was added. */
export const startOf = (item: Pick<ChangeItem, "startedAt" | "createdAt">) =>
  dayOf(item.startedAt) ?? dayOf(item.createdAt);

/** Distance to the band, 0 inside it. */
const gapTo = (v: number, low?: number | null, high?: number | null) =>
  low != null && v < low ? low - v : high != null && v > high ? v - high : 0;

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * One row per (active item, named marker) with a reading on both sides of
 * the start day. A marker with nothing before the start, or nothing after
 * it, is skipped: there is no "since" to say. Better rows first, then the
 * larger move.
 */
export function sinceStarted(
  items: ChangeItem[],
  readings: ChangeReading[],
): SinceChange[] {
  const byCode = new Map<string, ChangeReading[]>();
  for (const r of readings) {
    if (!Number.isFinite(r.value)) continue;
    const list = byCode.get(r.code) ?? [];
    list.push(r);
    byCode.set(r.code, list);
  }
  for (const list of byCode.values())
    list.sort((a, b) => a.date.localeCompare(b.date));

  const out: SinceChange[] = [];
  for (const item of items) {
    if (!item.active) continue;
    const start = startOf(item);
    if (!start) continue;
    for (const code of new Set(item.metricCodes ?? [])) {
      const list = byCode.get(code);
      if (!list?.length) continue;
      const before = list.filter((r) => r.date <= start).at(-1);
      const after = list.filter((r) => r.date > start).at(-1);
      if (!before || !after) continue;
      const delta = round(after.value - before.value, 2);
      const low = after.optimalLow ?? before.optimalLow;
      const high = after.optimalHigh ?? before.optimalHigh;
      const way = betterDirection(code, low, high);
      // No direction and no band: neither better, worse nor same can be said.
      if (way !== "lower" && way !== "higher" && low == null && high == null) continue;
      const better =
        way === "lower"
          ? delta < 0
          : way === "higher"
            ? delta > 0
            : low != null || high != null
              ? gapTo(after.value, low, high) < gapTo(before.value, low, high)
              : false;
      const same =
        delta === 0 ||
        (way !== "lower" &&
          way !== "higher" &&
          gapTo(after.value, low, high) === gapTo(before.value, low, high));
      out.push({
        item: { id: item.id, text: item.text, start },
        code,
        before: { value: before.value, date: before.date },
        after: { value: after.value, date: after.date },
        delta,
        pct: before.value === 0 ? null : round((delta / before.value) * 100, 1),
        better,
        same,
      });
    }
  }
  return out.sort(
    (a, b) =>
      Number(b.better) - Number(a.better) ||
      Number(b.same) - Number(a.same) ||
      Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0),
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "5 Oct" off a `YYYY-MM-DD`, without a timezone in the way. */
export const shortDay = (day: string): string => {
  const [, m, d] = day.slice(0, 10).split("-").map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : day;
};

const UNITS = new Set(
  "g mg mcg µg iu ml l kg min mins minute minutes h hr hrs hour hours x times steps km cups cup tbsp tsp caps capsules tablets %".split(
    " ",
  ),
);

/**
 * "Psyllium husk 5 g with lunch and dinner" → "Psyllium husk". A small number
 * right after one word with no unit after it is part of the name ("Omega 3
 * 2 g" → "Omega 3"), the same rule as iOS `ScreensKit.split`.
 */
export const shortTitle = (text: string): string => {
  const cuts =
    /\s(\d|with\b|before\b|after\b|at\b|every\b|daily\b)|\s[—–-]\s|[,(:;·]/g;
  for (const m of text.matchAll(cuts)) {
    const at = m.index!;
    if (at === 0) continue;
    const head = text.slice(0, at);
    const [number, next] = text.slice(at + 1).split(" ");
    const partOfName =
      /^\s\d/.test(m[0]) &&
      !head.includes(" ") &&
      /^\d{1,2}$/.test(number ?? "") &&
      (next == null || !UNITS.has(next.toLowerCase()));
    if (!partOfName) return head.trim();
  }
  return text.trim();
};

const num = (n: number) => String(round(n, 2));

/** "LDL 131 → 104 since Psyllium husk, 5 Oct" */
export function changeText(c: SinceChange, name: string): string {
  return `${name} ${num(c.before.value)} → ${num(c.after.value)} since ${shortTitle(c.item.text)}, ${shortDay(c.item.start)}`;
}

/**
 * "Triglycerides 106 → 139. Retest before changing anything."
 *
 * Batch 6: a worse line names no item. One draw against one start day cannot
 * say which of eight things moved a marker the wrong way, so it asks for the
 * retest instead of blaming whatever started last.
 */
export function worseText(c: SinceChange, name: string): string {
  return `${name} ${num(c.before.value)} → ${num(c.after.value)}. Retest before changing anything.`;
}

/** "Reached: LDL ≤118" */
export function reachedText(
  name: string,
  low: number | null,
  high: number | null,
): string {
  const band =
    low != null && high != null
      ? `${low}–${high}`
      : high != null
        ? `≤${high}`
        : low != null
          ? `≥${low}`
          : "";
  return `Reached: ${name}${band ? ` ${band}` : ""}`;
}

/* ── research, this week ───────────────────────────────────────────────── */

export interface ResearchWeekRows {
  /** `hkb_import_runs` rows with script `case-read` */
  caseReads: { ranAt: Date | null; rows: unknown }[];
  /** `case-run` rows: their `accepted` counter is what survived judging */
  caseRuns: { ranAt: Date | null; rows: unknown }[];
  /** this person's `paper_watch` rows */
  papers: { foundAt: Date | null; moves: unknown }[];
  /** `hkb_revisions` */
  revisions: { changedAt: Date; summary: string }[];
}

export interface ResearchWeek {
  read: number;
  kept: number;
  changed: number;
  /** `YYYY-MM-DD` of the newest non-seed revision, any week */
  lastChange: string | null;
}

/** A seed revision restates the shipped catalog; it is not research. */
const isSeed = (summary: string) => /^seed\b/i.test(summary.trim());

/**
 * What research did in the seven days up to `now`: papers read (every
 * case-read row and every paper the watch filed), findings kept (what case
 * runs accepted after judging, plus watched papers that moved something), and rules
 * changed (non-seed revisions).
 */
export function researchWeek(
  rows: ResearchWeekRows,
  now: Date,
  days = 7,
): ResearchWeek {
  const from = now.getTime() - days * 86_400_000;
  const inWeek = (d: Date | null) =>
    d != null && d.getTime() >= from && d.getTime() <= now.getTime();

  const reads = rows.caseReads.filter((r) => inWeek(r.ranAt));
  const papers = rows.papers.filter((p) => inWeek(p.foundAt));
  // A case read caches raw proposals before judging; only `accepted` on the
  // run that judged them counts as kept.
  const accepted = (r: unknown) => {
    const n = (r as { accepted?: unknown } | null)?.accepted;
    return typeof n === "number" && n > 0 ? n : 0;
  };
  const kept =
    rows.caseRuns
      .filter((r) => inWeek(r.ranAt))
      .reduce((n, r) => n + accepted(r.rows), 0) +
    papers.filter((p) => p.moves != null).length;

  const real = rows.revisions.filter((r) => !isSeed(r.summary));
  const newest = real.reduce<Date | null>(
    (max, r) => (!max || r.changedAt > max ? r.changedAt : max),
    null,
  );
  return {
    read: reads.length + papers.length,
    kept,
    changed: real.filter((r) => inWeek(r.changedAt)).length,
    lastChange: newest ? newest.toISOString().slice(0, 10) : null,
  };
}

/** "This week research read 4 papers, kept 2 findings, changed 1 rule. Last rule change: 12 Nov." */
export function researchLine(w: ResearchWeek): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  return (
    `This week research read ${n(w.read, "paper")}, kept ${n(w.kept, "finding")}, changed ${n(w.changed, "rule")}.` +
    (w.lastChange ? ` Last rule change: ${shortDay(w.lastChange)}.` : "")
  );
}

/* ── the one-tap backfill ──────────────────────────────────────────────── */

/**
 * "Took it most days?" applies: fewer than `sparse` done ticks since the
 * start, and some day from the start to `until` has no row yet (a backfill
 * would write something). Rows are every habit_logs row of the item.
 */
export function asksBackfill(
  start: string,
  until: string,
  rows: { day: string; done: boolean }[],
  sparse: number,
): boolean {
  const done = rows.filter((r) => r.done && r.day >= start).length;
  if (done >= sparse) return false;
  return missingDays(start, until, rows.map((r) => r.day), 1).length > 0;
}

/**
 * The days from `start` to `until` inclusive that have no `habit_logs` row,
 * for "I took it most days". Capped so a bad date cannot write a decade.
 */
export function missingDays(
  start: string,
  until: string,
  logged: Iterable<string>,
  cap = 400,
): string[] {
  const have = new Set(logged);
  const out: string[] = [];
  const d = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const end = until.slice(0, 10);
  while (out.length < cap) {
    const day = d.toISOString().slice(0, 10);
    if (day > end) break;
    if (!have.has(day)) out.push(day);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/* ── what the pages and `/api/today` carry ─────────────────────────────── */

/**
 * One line of the "What changed" card, and one entry of `/api/today`'s
 * `changes`. `since` is a marker against the day an item started; `reached`
 * is a goal the curator closed in the last 30 days.
 */
export interface ChangeLine {
  kind: "since" | "reached";
  code: string;
  name: string;
  unit: string | null;
  /** "LDL 131 → 104 since Psyllium husk, 5 Oct", "Reached: LDL ≤118" */
  text: string;
  better: boolean;
  /** unchanged, neither better nor worse */
  same: boolean;
  /** the protocol item a `since` line reads, null for `reached` */
  itemId: string | null;
  /** false when the item has no tick since it started: "not logged" */
  logged: boolean | null;
  before: { value: number; date: string } | null;
  after: { value: number; date: string } | null;
  delta: number | null;
  pct: number | null;
}

/** An item with no tick since it started, offered "I took it most days". */
export interface UntrackedItem {
  itemId: string;
  title: string;
  start: string;
  /** the draw date the ticks would run up to */
  until: string;
}

export interface WhatChanged {
  lines: ChangeLine[];
  untracked: UntrackedItem[];
}

/**
 * A reached goal belongs to the page of the draw that reached it: on or after
 * `since`, and before the next draw (`until`) when the page is an older one.
 * Pure.
 */
export function reachedHere(
  achievedAt: Date | null,
  since: Date,
  until: Date | null,
): boolean {
  return !!achievedAt && achievedAt >= since && (!until || achievedAt < until);
}

/**
 * Batch 6: the card, shorter and fair. Unchanged lines go; reached goals come
 * first, then better lines by the size of the move, then worse ones. Pure.
 */
export function orderLines(lines: ChangeLine[]): ChangeLine[] {
  const rank = (l: ChangeLine) =>
    l.kind === "reached" ? 0 : l.better ? 1 : 2;
  // A worse line names no item, so two items on one marker are one line.
  const seen = new Set<string>();
  return lines
    .filter((l) => !l.same)
    .filter((l) => {
      if (l.kind !== "since" || l.better) return true;
      if (seen.has(l.code)) return false;
      seen.add(l.code);
      return true;
    })
    .map((l, i) => ({ l, i }))
    .sort(
      (a, b) =>
        rank(a.l) - rank(b.l) ||
        (rank(a.l) === 1
          ? Math.abs(b.l.pct ?? 0) - Math.abs(a.l.pct ?? 0)
          : 0) ||
        a.i - b.i,
    )
    .map(({ l }) => l);
}

/**
 * One line for the header: the best better move and how many goals the draw
 * reached. "LDL 131 → 104 · 2 goals reached". Null when neither exists. Pure.
 */
export function headlineOf(lines: ChangeLine[]): string | null {
  const best = orderLines(lines).find(
    (l) => l.kind === "since" && l.better && l.before && l.after,
  );
  const reached = new Set(
    lines.filter((l) => l.kind === "reached").map((l) => l.code),
  ).size;
  // A draw with only worse lines still gets its moment: the first worse move.
  const lead =
    best ??
    (reached
      ? undefined
      : orderLines(lines).find((l) => l.kind === "since" && l.before && l.after));
  const parts = [
    lead
      ? `${lead.name} ${num(lead.before!.value)} → ${num(lead.after!.value)}`
      : null,
    reached ? `${reached} goal${reached === 1 ? "" : "s"} reached` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/* ── batch 6: one paper for Home ──────────────────────────────────────── */

/** The fields of a `paper_watch` row the pick reads. */
export interface PaperPick {
  id: string;
  conditionId: string;
  grade: string | null;
  moves: { conclusionId: string } | null;
  publishedAt: string | null;
  foundAt: Date | null;
  seenAt: Date | null;
}

export interface PaperContext {
  /** `YYYY-MM-DD`, the person's day: the pick holds for all of it */
  day: string;
  /** active plan item lines */
  items: string[];
  /** marker codes the person is acting on: open goals and active items */
  codes: Set<string>;
  /** marker names for those codes, lower case */
  names: string[];
  /** a condition id's evidence markers, for a non-topic row */
  markersOf: (conditionId: string) => string[];
}

const GRADED = new Set(["A", "B", "C"]);

/** A topic or condition row that touches what the person is doing. */
export function paperMatches(p: PaperPick, ctx: PaperContext): boolean {
  if (p.conditionId.startsWith("topic:")) {
    const topic = p.conditionId.slice("topic:".length).trim().toLowerCase();
    if (!topic) return false;
    return (
      ctx.items.some((t) => {
        const line = t.toLowerCase();
        const short = shortTitle(t).toLowerCase();
        return line.includes(topic) || (!!short && topic.includes(short));
      }) || ctx.names.some((n) => n.includes(topic) || topic.includes(n))
    );
  }
  return ctx.markersOf(p.conditionId).some((c) => ctx.codes.has(c));
}

/**
 * The one paper Home shows today. Graded A to C only. Unseen before seen,
 * then papers that move something, then papers that touch an active item or
 * an open goal's marker, then the newest by `publishedAt`, then the id.
 *
 * Stable for the day: "seen" is read as of the day's start, so opening the
 * paper does not swap it out, and a paper filed during the day only shows
 * when nothing older qualifies. So at most one new paper a day. Pure.
 */
export function pickPaper<T extends PaperPick>(
  rows: T[],
  ctx: PaperContext,
): T | null {
  // Local midnight, the same clock `localDay()` reads the day on.
  const start = Date.parse(`${ctx.day.slice(0, 10)}T00:00:00`);
  const graded = rows.filter((r) => r.grade != null && GRADED.has(r.grade));
  const older = graded.filter(
    (r) => r.foundAt == null || r.foundAt.getTime() < start,
  );
  // Nothing from before today: the first paper filed today holds the day, so
  // a better one filed this afternoon waits for tomorrow.
  const first = [...graded].sort(
    (a, b) =>
      (a.foundAt?.getTime() ?? 0) - (b.foundAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  )[0];
  const pool = older.length ? older : first ? [first] : [];
  const unseen = (r: T) => r.seenAt == null || r.seenAt.getTime() >= start;
  const key = (r: T) =>
    (unseen(r) ? 4 : 0) + (r.moves ? 2 : 0) + (paperMatches(r, ctx) ? 1 : 0);
  return (
    [...pool].sort(
      (a, b) =>
        key(b) - key(a) ||
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}

/**
 * "You: LDL 104", for the first marker the paper's moved condition reads that
 * the person has a value for. Null when the paper moves nothing, or the
 * person has none of its markers. Pure.
 */
export function youLine(
  markers: string[],
  latest: Map<string, { name: string; value: number }>,
): string | null {
  for (const code of markers) {
    const hit = latest.get(code);
    if (hit) return `You: ${hit.name} ${num(hit.value)}`;
  }
  return null;
}
