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

/** "Psyllium husk 5 g with lunch and dinner" → "Psyllium husk". */
export const shortTitle = (text: string): string => {
  const cut = text.search(
    /\s(\d|with\b|before\b|after\b|at\b|every\b|daily\b)|[,(:;·]/,
  );
  return (cut > 0 ? text.slice(0, cut) : text).trim();
};

const num = (n: number) => String(round(n, 2));

/** "LDL 131 → 104 since Psyllium husk, 5 Oct" */
export function changeText(c: SinceChange, name: string): string {
  return `${name} ${num(c.before.value)} → ${num(c.after.value)} since ${shortTitle(c.item.text)}, ${shortDay(c.item.start)}`;
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
 * case-read row and every paper the watch filed), findings kept (the items a
 * case read proposed, plus watched papers that moved something), and rules
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
  const kept =
    reads.reduce((n, r) => n + (Array.isArray(r.rows) ? r.rows.length : 0), 0) +
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
