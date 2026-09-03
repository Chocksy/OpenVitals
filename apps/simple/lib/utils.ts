import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The one date the design system prints: "Aug 1" on an axis, "Aug 1 2026"
 * anywhere a year matters. No comma — `docs/mockups/v4/blood.html` writes
 * "Dec 9 2025" — and no ISO string, which is a machine's date, not a page's.
 */
export function dayLabel(day: string, year = false): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return year
    ? `${month} ${d.getDate()} ${d.getFullYear()}`
    : `${month} ${d.getDate()}`;
}

/**
 * A count and its noun, agreeing: "1 result", "15 results", "1 reading".
 * Every count on a page goes through it, because "1 results" is the kind of
 * thing a reader trips over and never trusts again.
 */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/**
 * "3 notes read since your last visit", or nothing at all when none were.
 *
 * Phase 34a. It lives here, not in `lib/compose.ts`, because the Today card is
 * a server component in a tree client components import: a printer must not
 * drag the model layer and the database behind it.
 */
export const notesReadLine = (n: number): string | null =>
  n > 0 ? `${plural(n, "note")} read since your last visit` : null;

/** "12 Mar 24" style label for chart ticks. */
export function formatChartDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

export function formatDaysAgo(days: number): string {
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}yr ago`;
}

/** "vital_sign" -> "vital sign" */
export const fmtCategory = (c: string) => c.replace(/_/g, " ");
