/**
 * How stale a condition's knowledge is, and which ones the next run reads.
 *
 * Phase 22. Everything in the knowledge base has a shelf life, and the shelf
 * life depends on what kind of claim it is: a contested diagnostic criterion is
 * stale the day it is written, a popular trend claim goes off in a quarter, a
 * pooled RCT effect keeps for a year, a guideline-anchored rule keeps until the
 * next revision cycle. The monthly run takes the stalest.
 *
 * This replaces the row-count pick from phase 15 without losing it: a condition
 * with fewer than three accepted rows is infinitely stale, so thin-first
 * survives as a special case, and the 21b CONTESTED list survives as the class
 * whose shelf life is zero.
 *
 * Pure. No database, no network, no clock: the caller passes `today`.
 */

export type RefreshClass = "contested" | "horizon" | "pooled" | "guideline";

/** How long a claim of each kind is allowed to stand before it is read again. */
export const REFRESH_DAYS: Record<RefreshClass, number> = {
  // The 21b list: criteria that are themselves in motion, always re-read.
  contested: 0,
  // D and E rows and trend claims. Popularity moves fast and so does the
  // literature that catches up with it.
  horizon: 90,
  // Pooled RCT effects: a year between looks.
  pooled: 365,
  // Guideline-anchored rules move on revision cycles, which are years.
  guideline: 730,
};

/** Below this many accepted rows a condition is not "fresh", it is empty. */
export const MIN_ROWS = 3;

/** One row behind a condition, as thin as the class rule needs it. */
export interface FreshnessRow {
  /** A–E. */
  grade: string;
  /** The papers pooled behind the row; more than one makes it a pooled effect. */
  sources?: unknown;
}

const pooledRow = (r: FreshnessRow): boolean =>
  Array.isArray(r.sources) ? r.sources.length > 1 : r.sources != null;

/**
 * The most volatile class present among the condition's rows.
 *
 * Contested wins outright, then any D/E row (the horizon, including a filed
 * trend claim), then any pooled row, then guideline. A condition with no rows
 * at all reads as `guideline`; it is `MIN_ROWS` that makes it infinitely stale,
 * not its class.
 */
export function conditionClass(
  rows: FreshnessRow[],
  contested: Set<string>,
  id: string,
): RefreshClass {
  if (contested.has(id)) return "contested";
  if (rows.some((r) => r.grade === "D" || r.grade === "E")) return "horizon";
  if (rows.some(pooledRow)) return "pooled";
  return "guideline";
}

const DAY_MS = 86_400_000;

/** Whole days between two ISO days, negative clamped to zero. */
export const daysBetween = (from: string, to: string): number =>
  Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);

/**
 * Days since the last look, over the shelf life of the class: 1 means due, 2
 * means twice overdue, and never-looked is infinitely stale.
 */
export function staleness(
  lastLookedAt: string | null,
  cls: RefreshClass,
  today: string,
): number {
  if (!lastLookedAt) return Infinity;
  const days = REFRESH_DAYS[cls];
  if (!days) return Infinity;
  const since = daysBetween(lastLookedAt.slice(0, 10), today);
  return Number.isFinite(since) ? since / days : Infinity;
}

/** One condition, its class, and how overdue it is. */
export interface ConditionFreshness {
  id: string;
  name: string;
  /** `hkb_conditions.in_catalog`, carried so the pick is a `ConditionRef`. */
  inCatalog?: boolean;
  cls: RefreshClass;
  /** Accepted rows behind it. Under `MIN_ROWS` it is infinitely stale. */
  rows: number;
  lastLookedAt: string | null;
  score: number;
}

/** The class and the score for one condition, from its rows and its last run. */
export function freshnessOf(
  condition: { id: string; name: string; inCatalog?: boolean },
  rows: FreshnessRow[],
  contested: Set<string>,
  lastLookedAt: string | null,
  today: string,
): ConditionFreshness {
  const cls = conditionClass(rows, contested, condition.id);
  const thin = rows.length < MIN_ROWS;
  return {
    ...condition,
    cls,
    rows: rows.length,
    lastLookedAt,
    score: thin ? Infinity : staleness(lastLookedAt, cls, today),
  };
}

/**
 * The `n` stalest, contested first.
 *
 * Contested ids always come out ahead of everything else, which is exactly the
 * 21b promise; among the rest the score orders it, and ties break on id so two
 * runs of the same database pick the same list.
 */
export function pickConditions(
  all: ConditionFreshness[],
  n: number,
): ConditionFreshness[] {
  const seen = new Set<string>();
  return [...all]
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .sort(
      (a, b) =>
        Number(b.cls === "contested") - Number(a.cls === "contested") ||
        b.score - a.score ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, n));
}

/** "pcos contested ∞ (last looked 2026-07-02, 4 rows)", for the CLI and /hkb. */
export const freshnessLine = (c: ConditionFreshness): string =>
  `${c.id} · ${c.cls} · ${Number.isFinite(c.score) ? c.score.toFixed(2) : "∞"} ` +
  `(${c.rows} rows, last looked ${c.lastLookedAt?.slice(0, 10) ?? "never"})`;
