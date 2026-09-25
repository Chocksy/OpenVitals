/**
 * The score, day by day, for the calendar behind the Today header. Phase 37
 * task A3, `GET /api/score/days`.
 *
 * `scoreDays` loads the window once and `daysFrom` runs `scoreOf` per day, so
 * a past day is scored by the same arithmetic as today and never stored. Blood
 * as of a day is the newest value per marker on or before it, classified by
 * `statusOf` with the band `getMetricRows` puts on that marker: the same
 * function and the same band the Status counters on `/api/today` come from.
 *
 * `inputOn` builds one day's input, and `todayBody` builds today's with it:
 * blood through `bloodAsOf` and moves through `movesOn`, so today's score and
 * the calendar's last cell agree by construction.
 *
 * The reason under a day is the row that cost the most points more (or fewer)
 * than on the previous scored day, in words the code writes (principle 3).
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { dailyLogs, getDb, habitLogs, meals, protocolItems } from "@/db";
import { genomeBody, type ScoreDays } from "./api-contract";
import { lastDays, localDay, shiftDay } from "./daily";
import { getMetricRows, type MetricRow } from "./data";
import { toApiMeal } from "./meals";
import {
  occurrenceItemOf,
  occurrences,
  type OccurrenceItem,
} from "./plan-line";
import {
  genesLayer,
  scoreOf,
  WEIGHTS,
  type Row,
  type ScoreInput,
} from "./score";
import { statusOf, type Status } from "./status";
import { targetsFor } from "./targets";

/** One lab value, already classified; oldest first. */
export interface LabRow {
  code: string;
  name: string;
  day: string;
  value: number | null;
  status: Status;
  /** a lab draw, not a phone's reading */
  draw: boolean;
}

/** Everything the window needs, loaded once. */
export interface ScoreRows {
  logs: { day: string; sleepHours: number | null }[];
  items: OccurrenceItem[];
  ticks: { itemId: string; day: string; done: boolean }[];
  /** one row per meal, at the servings eaten */
  meals: { day: string; kcal: number | null; proteinG: number | null }[];
  labs: LabRow[];
  targets: { kcal: number | null; proteinG: number | null };
  genes: number | null;
}

type Day = ScoreDays["days"][number];

/** The Status counts as of a day: the newest value per marker, gray left out. */
export function bloodAsOf(labs: LabRow[], day: string): ScoreInput["blood"] {
  const latest = new Map<string, LabRow>();
  for (const l of labs) if (l.day <= day) latest.set(l.code, l);
  const n = { green: 0, amber: 0, rose: 0 };
  for (const l of latest.values()) {
    if (l.status === "green") n.green++;
    else if (l.status === "amber") n.amber++;
    else if (l.status === "red") n.rose++;
  }
  return n.green + n.amber + n.rose ? n : null;
}

/**
 * Every reading as a `LabRow`, oldest first: each classified by `statusOf`
 * with its own lab range and the band `getMetricRows` put on its marker, the
 * inputs `MetricRow.status` is computed from. The sort is stable, so within
 * one day the draw stays after a phone's reading, as `latest` has it.
 */
export function labsOf(metrics: MetricRow[]): LabRow[] {
  const labs: LabRow[] = metrics.flatMap((m) =>
    m.rows.map((r) => ({
      code: m.code,
      name: m.name,
      day: r.observedAt,
      value: r.value,
      status: statusOf({
        value: r.value,
        refLow: r.refLow,
        refHigh: r.refHigh,
        optimalLow: m.optimalLow,
        optimalHigh: m.optimalHigh,
      }),
      draw: r.source == null && !m.derived,
    })),
  );
  return labs.sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Moves on one day: the items due (`occurrences` over `occurrenceItemOf`) and
 * how many of them a done tick marks. A tick on an item not due that day
 * counts for nothing. Null when nothing is due.
 */
export function movesOn(
  dueIds: Iterable<string>,
  ticks: { itemId: string | null; done: boolean }[],
): ScoreInput["moves"] {
  const due = new Set(dueIds);
  if (!due.size) return null;
  const done = new Set(
    ticks
      .filter((t) => t.done && t.itemId != null && due.has(t.itemId))
      .map((t) => t.itemId),
  );
  return { done: done.size, due: due.size };
}

/**
 * One day's score input. `daysFrom` builds every day of the window with it and
 * `todayBody` builds today's, so blood (`bloodAsOf`) and moves (`movesOn`)
 * are computed one way for both.
 */
export function inputOn(
  day: string,
  p: {
    sleepHours: number | null;
    dueIds: Iterable<string>;
    ticks: { itemId: string | null; done: boolean }[];
    kcal: number | null;
    proteinG: number | null;
    targets: ScoreInput["targets"];
    labs: LabRow[];
    genes: number | null;
  },
): ScoreInput {
  return {
    sleepHours: p.sleepHours,
    moves: movesOn(p.dueIds, p.ticks),
    kcal: p.kcal,
    proteinG: p.proteinG,
    targets: p.targets,
    blood: bloodAsOf(p.labs, day),
    genes: p.genes,
  };
}

/* ── the words ────────────────────────────────────────────────────────── */

/** "1 240": thousands grouped by a space, the way the phone prints them. */
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export function sleepLine(hours: number): string {
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) [h, m] = [h + 1, 0];
  return `Sleep ${h}h ${String(m).padStart(2, "0")}`;
}

export const kcalLine = (kcal: number, target: number) =>
  `${grouped(kcal)} of ${grouped(target)} kcal`;

/**
 * "Blood draw: LDL 168 → 131", the marker whose value moved the largest share
 * since its previous draw. A first draw has nothing to move from, so it names
 * its first marker and its value.
 */
export function drawLine(labs: LabRow[], day: string): string | null {
  const drawn = labs.filter((l) => l.draw && l.day === day && l.value != null);
  if (!drawn.length) return null;
  let best: { l: LabRow; was: number; share: number } | null = null;
  for (const l of drawn) {
    const was = labs
      .filter((p) => p.code === l.code && p.day < day && p.value != null)
      .at(-1)?.value;
    if (was == null) continue;
    const share = Math.abs(l.value! - was) / (Math.abs(was) || 1);
    if (!best || share > best.share) best = { l, was, share };
  }
  return best
    ? `Blood draw: ${best.l.name} ${best.was} → ${best.l.value}`
    : `Blood draw: ${drawn[0]!.name} ${drawn[0]!.value}`;
}

/* ── the days ─────────────────────────────────────────────────────────── */

const sumOrNull = (xs: (number | null)[]) => {
  const got = xs.filter((v): v is number => v != null);
  return got.length ? Math.round(got.reduce((a, b) => a + b, 0)) : null;
};

/**
 * What each candidate costs the day, in points off 100. A lifestyle row is a
 * quarter of the Lifestyle weight; blood is the Blood weight.
 */
const ROW_WEIGHT = WEIGHTS.life / 4;

export function daysFrom(
  rows: ScoreRows,
  window: { to: string; n: number },
): Day[] {
  const days = lastDays(window.n, window.to);
  const from = days[0]!;
  const due = new Map<string, Set<string>>();
  for (const o of occurrences(rows.items, from, window.to))
    due.set(o.day, (due.get(o.day) ?? new Set()).add(o.itemId));

  let prev: {
    score: number;
    loss: Partial<Record<Row | "blood", number>>;
  } | null = null;

  return days.map((day): Day => {
    const log = rows.logs.find((l) => l.day === day);
    const ticks = rows.ticks.filter((t) => t.day === day);
    const eaten = rows.meals.filter((m) => m.day === day);
    const draw = rows.labs.some((l) => l.draw && l.day === day);
    const empty = {
      day,
      score: null,
      life: null,
      blood: null,
      genes: null,
      draw,
      reason: null,
    };
    if (log?.sleepHours == null && !ticks.length && !eaten.length && !draw)
      return empty;

    const input = inputOn(day, {
      sleepHours: log?.sleepHours ?? null,
      dueIds: due.get(day) ?? [],
      ticks,
      kcal: sumOrNull(eaten.map((m) => m.kcal)),
      proteinG: sumOrNull(eaten.map((m) => m.proteinG)),
      targets: rows.targets,
      labs: rows.labs,
      genes: rows.genes,
    });
    const r = scoreOf(input);
    if (r.score == null) return empty;

    const loss: Partial<Record<Row | "blood", number>> = {};
    for (const [k, v] of Object.entries(r.rows))
      if (v != null) loss[k as Row] = ROW_WEIGHT * (100 - v);
    if (draw && r.blood != null) loss.blood = WEIGHTS.blood * (100 - r.blood);

    const [pick] = (Object.keys(loss) as (Row | "blood")[])
      .map((k) => ({ k, moved: Math.abs(loss[k]! - (prev?.loss[k] ?? 0)) }))
      .sort((a, b) => b.moved - a.moved);

    const text = !pick
      ? null
      : pick.k === "blood"
        ? drawLine(rows.labs, day)
        : pick.k === "sleep"
          ? sleepLine(input.sleepHours!)
          : pick.k === "moves"
            ? `Moves ${input.moves!.done} of ${input.moves!.due}`
            : pick.k === "kcal"
              ? kcalLine(input.kcal!, input.targets.kcal!)
              : `Protein ${Math.round(input.proteinG!)} g`;

    const out: Day = {
      day,
      score: r.score,
      life: r.life,
      blood: r.blood,
      genes: r.genes,
      draw,
      reason: text
        ? {
            text,
            sub: pick!.k === "blood" ? "Blood" : "Lifestyle",
            effect: prev ? r.score - prev.score : null,
          }
        : null,
    };
    prev = { score: r.score, loss };
    return out;
  });
}

/**
 * The window off the database, then `daysFrom`.
 *
 * An item counts from the day it was started, or else the day it was adopted
 * (`occurrenceItemOf`), so a move added this week is not missed on every day
 * before it.
 * ponytail: archived items drop out of past days too, because nothing stores
 * the day one was archived; add `archived_at` when the history needs it.
 * ponytail: today's targets measure every day of the window.
 */
export async function scoreDays(
  userId: string,
  to: string = localDay(),
  n = 91,
): Promise<ScoreDays> {
  const db = getDb();
  const from = shiftDay(to, -(n - 1));
  const [logs, items, ticks, mealRows, metrics, targets, genome] =
    await Promise.all([
      db
        .select({ day: dailyLogs.day, sleepHours: dailyLogs.sleepHours })
        .from(dailyLogs)
        .where(
          and(
            eq(dailyLogs.userId, userId),
            gte(dailyLogs.day, from),
            lte(dailyLogs.day, to),
          ),
        ),
      db
        .select()
        .from(protocolItems)
        .where(
          and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
        ),
      db
        .select({
          itemId: habitLogs.itemId,
          day: habitLogs.day,
          done: habitLogs.done,
        })
        .from(habitLogs)
        .where(
          and(
            eq(habitLogs.userId, userId),
            gte(habitLogs.day, from),
            lte(habitLogs.day, to),
          ),
        ),
      db
        .select()
        .from(meals)
        .where(
          and(
            eq(meals.userId, userId),
            gte(meals.day, from),
            lte(meals.day, to),
          ),
        ),
      getMetricRows(userId),
      targetsFor(userId, to),
      genomeBody(userId),
    ]);

  return {
    days: daysFrom(
      {
        logs,
        items: items.map(occurrenceItemOf),
        ticks,
        meals: mealRows.map((m) => {
          const t = toApiMeal(m).totals;
          return { day: m.day, kcal: t.kcal, proteinG: t.protein_g };
        }),
        labs: labsOf(metrics),
        targets,
        genes: genesLayer(genome.file ? genome.verdicts : null),
      },
      { to, n },
    ),
  };
}
