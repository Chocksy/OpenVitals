/**
 * The arithmetic behind the tracker: day strings, streaks, adherence, goal
 * progress, heatmap buckets and CSV. All pure, all tested in `daily.test.ts`.
 *
 * Days are plain `YYYY-MM-DD` strings in the user's local timezone, the same
 * shape Postgres hands back for a `date` column, so nothing ever needs a
 * timezone conversion.
 */

export const DAY_MS = 86_400_000;

/** Local calendar date, not UTC: `new Date().toISOString()` is off after 22:00. */
export function localDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return localDay(new Date(y, m - 1, d + delta));
}

/** `n` day strings ending at `end`, oldest first. */
export function lastDays(n: number, end: string = localDay()): string[] {
  return Array.from({ length: n }, (_, i) => shiftDay(end, i - n + 1));
}

export function daysBetween(from: string, to: string): number {
  const p = (s: string) => {
    const [y, m, d] = s.split("-").map(Number) as [number, number, number];
    return new Date(y, m - 1, d).getTime();
  };
  return Math.round((p(to) - p(from)) / DAY_MS);
}

/**
 * Consecutive active days ending today. A day that is not over yet does not
 * break the run, so an empty today still counts yesterday's streak.
 */
export function streak(
  activeDays: Iterable<string>,
  from: string = localDay(),
): number {
  const set = new Set(activeDays);
  let cursor = set.has(from) ? from : shiftDay(from, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

/** Percent of `window` days on which the habit was done. */
export function adherence(doneDays: Iterable<string>, window: string[]): number {
  if (window.length === 0) return 0;
  const set = new Set(doneDays);
  const done = window.filter((d) => set.has(d)).length;
  return Math.round((done / window.length) * 100);
}

export function inGoal(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): boolean {
  if (value == null) return false;
  if (low == null && high == null) return false;
  return (low == null || value >= low) && (high == null || value <= high);
}

/** Distance to the nearest edge of the goal band. 0 once inside. */
export function goalGap(
  value: number,
  low: number | null | undefined,
  high: number | null | undefined,
): number {
  if (low != null && value < low) return low - value;
  if (high != null && value > high) return value - high;
  return 0;
}

/** How far the user has travelled from the reading they started at, 0-100. */
export function goalProgress(
  start: number | null | undefined,
  current: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): number {
  if (current == null) return 0;
  if (inGoal(current, low, high)) return 100;
  if (start == null) return 0;
  const startGap = goalGap(start, low, high);
  if (startGap === 0) return 0; // started inside, now outside: no progress
  const gap = goalGap(current, low, high);
  return Math.max(0, Math.min(100, Math.round((1 - gap / startGap) * 100)));
}

/** GitHub-style intensity, 0 (nothing) to 4 (everything). */
export function heatmapBucket(ratio: number): 0 | 1 | 2 | 3 | 4 {
  if (!(ratio > 0)) return 0;
  if (ratio >= 1) return 4;
  if (ratio > 0.66) return 3;
  if (ratio > 0.33) return 2;
  return 1;
}

/** Centered-right rolling mean: each point averages itself and the n-1 before. */
export function rollingAverage(
  values: (number | null)[],
  window = 7,
): (number | null)[] {
  return values.map((_, i) => {
    const slice = values
      .slice(Math.max(0, i - window + 1), i + 1)
      .filter((v): v is number => v != null);
    if (!slice.length) return null;
    return (
      Math.round((slice.reduce((s, v) => s + v, 0) / slice.length) * 100) / 100
    );
  });
}


/* ------------------------------------------------------------------ *
 * The /today form, described once so the client and the server agree.
 * ------------------------------------------------------------------ */

/** The six numbers on /today; energy and mood are the two 1-5 pickers. */
export const NUMERIC_FIELDS = [
  { key: "sleepHours", label: "Sleep", unit: "h", step: 0.25 },
  { key: "weightKg", label: "Weight", unit: "kg", step: 0.1 },
  { key: "steps", label: "Steps", unit: "", step: 100 },
  { key: "exerciseMin", label: "Exercise", unit: "min", step: 5 },
  { key: "alcoholUnits", label: "Alcohol", unit: "units", step: 0.5 },
  { key: "fastingHours", label: "Fasting", unit: "h", step: 0.5 },
] as const;

export type NumericField = (typeof NUMERIC_FIELDS)[number]["key"];
export type LogValues = Partial<
  Record<NumericField | "energy" | "mood", number | null>
> & { notes?: string | null };

export interface HabitView {
  id: string;
  text: string;
  why: string | null;
  metricCodes: string[];
  cadence: string;
  doneToday: boolean;
  weekCount: number;
  adherence30: number;
  strip30: number[];
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/** RFC 4180: quote when the cell holds a comma, a quote, a newline or an edge space. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = Array.isArray(value) ? value.join(" ") : String(value);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/* ── phase 24b: whose day is it ───────────────────────────────────────── */

/** The four `daily_logs` columns a phone sync may fill by itself. */
export const PHONE_COLUMNS: readonly string[] = [
  "sleepHours",
  "weightKg",
  "steps",
  "exerciseMin",
];

/**
 * Did a person put something into this day, as opposed to a watch?
 *
 * `wrote` is the sync's own list of the columns it filled (`wearable.wrote`),
 * so a step count nobody typed does not count as a day the person logged. The
 * consistency heatmap and the streak are about the person; the phone gets its
 * own mode on the same grid.
 */
export function humanLogged(
  values: LogValues | undefined | null,
  wrote: readonly string[] = [],
): boolean {
  if (!values) return false;
  const owned = new Set(wrote);
  return Object.entries(values).some(
    ([key, v]) =>
      v != null &&
      v !== "" &&
      !(PHONE_COLUMNS.includes(key) && owned.has(key)),
  );
}

/** A day is not over yet: before noon, or with fewer steps than a walk. */
export function partialDay(hour: number, steps: number | null): boolean {
  return hour < 12 || (steps ?? 0) < 1000;
}
