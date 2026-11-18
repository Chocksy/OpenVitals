/**
 * Projections against the database: what has been adopted, what the papers say
 * it does, what was written down before the draw, and what the draw said.
 *
 * `lib/projection.ts` is the arithmetic and is pure. This file is the part
 * that reads `protocol_items`, `habit_logs` and `hkb_interventions`, writes
 * `projections`, and closes them with `intervention_outcomes` when the marker
 * is measured again.
 */
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  getDb,
  habitLogs,
  hkbInterventions,
  interventionOutcomes,
  projections,
  protocolItems,
} from "@/db";
import { getMetricRows } from "./data";
import { localDay } from "./daily";
import { explainKey } from "./explain";
import { dayLabel } from "./utils";
import type { Grade } from "./hypotheses";
import {
  personalMultipliers,
  type PersonalMultiplier,
} from "./personal-effects";
import {
  addWeeks,
  betterDirection,
  project,
  RETEST_WEEKS,
  verdictOf,
  type AdoptedAction,
  type EffectSource,
  type Projection,
  type Verdict,
} from "./projection";

/** How close to the retest date a draw has to be to count as the retest. */
const RESOLVE_WINDOW_WEEKS = 2;

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Words too common to say which intervention a line is: units of time, meals,
 * the word "vitamin" (D and B12 share it), and the generic kinds. A token has
 * to survive this list and be five letters or longer to count.
 */
const STOP = new Set([
  "vitamin",
  "vitamins",
  "supplement",
  "supplements",
  "supplementation",
  "daily",
  "weekly",
  "twice",
  "times",
  "fibre",
  "fiber",
  "with",
  "before",
  "after",
  "minutes",
  "hours",
  "weeks",
  "months",
  "lunch",
  "dinner",
  "breakfast",
  "meals",
  "morning",
  "evening",
  "night",
  "bedtime",
  "training",
  "exercise",
  "habit",
  "water",
  "glass",
  "tablet",
  "tablets",
  "capsule",
  "capsules",
  "powder",
  "extract",
  "intake",
  "therapy",
  "treatment",
  "replacement",
  "start",
  "starting",
  "every",
  "about",
  "least",
  "lower",
  "higher",
  "reduce",
  "increase",
  "plus",
  "other",
  "while",
  "until",
  "during",
  "dose",
  "doses",
  "grams",
]);

/** Spellings that name the same thing: "D3" is cholecalciferol. */
const ALIAS: [RegExp, string][] = [
  [/\bvitamin d ?3?\b|\bd3\b/g, " cholecalciferol "],
  [/\bvitamin b12\b|\bb12\b/g, " cobalamin "],
];

/** The words in a line that say which intervention it is. */
export function distinctiveTokens(text: string): Set<string> {
  let t = normalise(text);
  for (const [re, to] of ALIAS) t = t.replace(re, to);
  return new Set(
    t.split(" ").filter((w) => w.length >= 5 && !STOP.has(w) && !/\d/.test(w)),
  );
}

/**
 * The intervention row an adopted action is.
 *
 * First the old rule: the one whose name the action's text contains, or the
 * other way round. Batch 5A: the plan writes its own words ("Psyllium husk
 * 5 g with lunch and dinner") and the seed has "Psyllium fibre", so nothing
 * matched and no projection was ever written. The fallback is distinctive
 * word overlap (`distinctiveTokens`): the row sharing the most such words
 * wins, then the row with the fewest words of its own (the closer name), then
 * the shorter name. ponytail: still no fuzzy matching and no model; a line
 * that shares no distinctive word with any row has no effect size, which the
 * projection says out loud.
 */
export function matchIntervention<T extends { name: string }>(
  text: string,
  rows: T[],
): T | null {
  const t = normalise(text);
  const hits = rows
    .filter((r) => {
      const n = normalise(r.name);
      return n.length > 6 && (t.includes(n) || n.includes(t));
    })
    .sort((a, b) => b.name.length - a.name.length);
  if (hits[0]) return hits[0];

  const mine = distinctiveTokens(text);
  if (!mine.size) return null;
  const scored = rows
    .map((r) => {
      const theirs = distinctiveTokens(r.name);
      const shared = [...theirs].filter((w) => mine.has(w)).length;
      return { r, shared, own: theirs.size };
    })
    .filter((s) => s.shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        a.own - b.own ||
        a.r.name.length - b.r.name.length,
    );
  return scored[0]?.r ?? null;
}

/**
 * Every row that is the same intervention as the match: berberine is one
 * name with an LDL row and a glucose row, and a line adopting it moves both.
 */
export function matchInterventions<T extends { name: string }>(
  text: string,
  rows: T[],
): T[] {
  const hit = matchIntervention(text, rows);
  if (!hit) return [];
  const name = normalise(hit.name);
  return rows.filter((r) => normalise(r.name) === name);
}

/** The marker codes a line moves, from its intervention rows. Pure. */
export function markersOf(
  text: string,
  rows: { name: string; outcomeFeatureId: string | null }[],
): string[] {
  return [
    ...new Set(
      matchInterventions(text, rows)
        .map((r) => r.outcomeFeatureId ?? "")
        .filter((id) => id.startsWith("metric:"))
        .map((id) => id.slice("metric:".length)),
    ),
  ];
}

/**
 * Batch 5A item 6. The markers a protocol line moves, for an item that came
 * with none ("Berberine" added by hand had `metric_codes` []). Empty when the
 * line matches no accepted intervention.
 */
export async function markersFor(text: string): Promise<string[]> {
  const rows = await getDb()
    .select({
      name: hkbInterventions.name,
      outcomeFeatureId: hkbInterventions.outcomeFeatureId,
    })
    .from(hkbInterventions)
    .where(eq(hkbInterventions.status, "accepted"));
  return markersOf(text, rows);
}

const toEffect = (row: {
  id: string;
  name: string;
  outcomeFeatureId: string | null;
  effect: string | null;
  direction: string;
  grade: string;
  duration: string | null;
  quote: string | null;
  paper: unknown;
}): EffectSource | null =>
  row.outcomeFeatureId
    ? {
        id: row.id,
        name: row.name,
        outcomeFeatureId: row.outcomeFeatureId,
        effect: row.effect,
        direction: (row.direction as EffectSource["direction"]) ?? "none",
        grade: (row.grade as Grade) ?? "C",
        duration: row.duration,
        source:
          (row.paper as { title?: string } | null)?.title ??
          row.quote?.slice(0, 120) ??
          row.id,
      }
    : null;

/**
 * Anything that reads and writes like the database: `getDb()` or a
 * transaction, so the repair script can run the same code and roll it back.
 */
type Db = Pick<ReturnType<typeof getDb>, "select" | "insert" | "update">;

/**
 * Everything this person has adopted, with its effect size and adherence.
 * One entry per (item, intervention row): a line whose intervention moves two
 * markers is two entries with the same `itemId`. An item is dated by the day
 * it started (`started_at`), else the day it was written down.
 */
export async function adoptedActions(
  userId: string,
  db: Db = getDb(),
): Promise<AdoptedAction[]> {
  const [items, logs, effects] = await Promise.all([
    db
      .select()
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      ),
    db.select().from(habitLogs).where(eq(habitLogs.userId, userId)),
    db
      .select()
      .from(hkbInterventions)
      .where(eq(hkbInterventions.status, "accepted")),
  ]);

  const today = localDay();
  const window = new Set(
    Array.from({ length: 30 }, (_, i) =>
      new Date(new Date(today).getTime() - i * 86_400_000)
        .toISOString()
        .slice(0, 10),
    ),
  );

  return items.flatMap((item) => {
    const done = new Set(
      logs.filter((l) => l.itemId === item.id && l.done).map((l) => l.day),
    );
    const hit = [...window].filter((d) => done.has(d)).length;
    const base = {
      itemId: item.id,
      text: item.text,
      adoptedAt:
        item.startedAt ??
        (item.createdAt ?? new Date()).toISOString().slice(0, 10),
      adherence: done.size ? hit / window.size : undefined,
    };
    const matches = matchInterventions(item.text, effects);
    if (!matches.length) return [{ ...base, effect: null }];
    return matches.map((m) => ({ ...base, effect: toEffect(m) }));
  });
}

/**
 * This person's own multipliers, by pair.
 *
 * Every closed projection wrote one `intervention_outcomes` row per
 * contribution, so this is simply what has already happened to them, grouped.
 * Two cycles of the same pair is the floor; anything thinner returns nothing
 * and the projection stays at the literature's own number.
 */
export async function personalFor(
  userId: string,
  db: Db = getDb(),
): Promise<Record<string, PersonalMultiplier>> {
  const rows = await db
    .select({
      pair: interventionOutcomes.pair,
      predicted: interventionOutcomes.predictedDelta,
      observed: interventionOutcomes.observedDelta,
      adherence: interventionOutcomes.adherence,
    })
    .from(interventionOutcomes)
    .where(eq(interventionOutcomes.userId, userId))
    .orderBy(asc(interventionOutcomes.at));
  return personalMultipliers(rows);
}

/** The marker codes a set of actions can move, from their effect rows. */
export const targetCodes = (actions: AdoptedAction[]): string[] => [
  ...new Set(
    actions
      .map((a) => a.effect?.outcomeFeatureId ?? "")
      .filter((id) => id.startsWith("metric:"))
      .map((id) => id.slice("metric:".length)),
  ),
];

export interface StoredProjection extends Projection {
  id: string;
  resolvedValue: number | null;
  resolvedAt: string | null;
  verdict: Verdict | null;
}

const toStored = (row: typeof projections.$inferSelect): StoredProjection => ({
  id: row.id,
  code: row.code,
  unit: "",
  from: row.fromValue,
  fromDate: row.madeAt,
  horizonWeeks: row.horizonWeeks,
  expected: row.expected,
  low: row.low,
  high: row.high,
  contributions: row.contributions as Projection["contributions"],
  assumptions: (row.assumptions as string[] | null) ?? [],
  retestAt: row.retestAt,
  gaps: [],
  resolvedValue: row.resolvedValue,
  resolvedAt: row.resolvedAt,
  verdict: (row.verdict as Verdict | null) ?? null,
});

/** Every projection this person has, newest first. */
export async function projectionsFor(
  userId: string,
  code?: string,
): Promise<StoredProjection[]> {
  const rows = await getDb()
    .select()
    .from(projections)
    .where(
      code
        ? and(eq(projections.userId, userId), eq(projections.code, code))
        : eq(projections.userId, userId),
    )
    .orderBy(desc(projections.madeAt));
  return rows.map(toStored);
}

/**
 * The day a projection for `code` starts from. Pure.
 *
 * Batch 5A. It used to be today, always, which is right on the day of the
 * adoption and wrong for anything adopted before its intervention matched:
 * the owner's psyllium (2026-10-05) would have been projected from the
 * November draw it should have predicted. Now it is the day the earliest
 * action that moves the marker started, or the day the previous projection
 * for it was resolved when that is later (each draw opens the next cycle),
 * and never after today.
 */
export function projectionStart(
  code: string,
  actions: AdoptedAction[],
  lastResolved: string | null | undefined,
  today: string,
): string {
  const starts = actions
    .filter(
      (a) =>
        a.effect?.outcomeFeatureId === `metric:${code}` ||
        a.effect?.outcomeFeatureId === `derived:${code}`,
    )
    .map((a) => a.adoptedAt)
    .sort();
  let start = starts[0] ?? today;
  if (lastResolved && lastResolved > start) start = lastResolved;
  return start > today ? today : start;
}

/** The last value drawn on or before `day`, oldest-first rows. Pure. */
export function baselineAt(
  rows: { observedAt: string; value: number | null }[],
  day: string,
): { observedAt: string; value: number } | null {
  let hit: { observedAt: string; value: number } | null = null;
  for (const r of rows)
    if (r.value != null && r.observedAt.slice(0, 10) <= day)
      if (!hit || r.observedAt >= hit.observedAt)
        hit = { observedAt: r.observedAt, value: r.value };
  return hit;
}

/**
 * Write a projection for every marker an adopted action moves, unless one is
 * already open for that marker. Called when an action is adopted and by
 * `recordBeliefs`, so a change in adherence is picked up on the next run.
 */
export async function makeProjections(
  userId: string,
  db: Db = getDb(),
): Promise<Projection[]> {
  const actions = await adoptedActions(userId, db);
  const codes = targetCodes(actions);
  if (!codes.length) return [];

  const rows = await getMetricRows(userId);
  const personal = await personalFor(userId, db);
  const mine = await db
    .select({ code: projections.code, resolvedAt: projections.resolvedAt })
    .from(projections)
    .where(eq(projections.userId, userId));
  const alreadyOpen = new Set(
    mine.filter((o) => o.resolvedAt == null).map((o) => o.code),
  );
  const lastResolved = new Map<string, string>();
  for (const o of mine)
    if (o.resolvedAt && o.resolvedAt > (lastResolved.get(o.code) ?? ""))
      lastResolved.set(o.code, o.resolvedAt);

  const today = localDay();
  const made: Projection[] = [];
  for (const code of codes) {
    if (alreadyOpen.has(code)) continue;
    const row = rows.find((r) => r.code === code);
    if (!row) continue;
    const fromDate = projectionStart(
      code,
      actions,
      lastResolved.get(code),
      today,
    );
    const from = baselineAt(row.rows, fromDate);
    if (!from) continue;
    const p = project({
      code,
      unit: row.unit ?? "",
      from: from.value,
      fromDate,
      actions,
      personal,
      optimalLow: row.optimalLow,
      optimalHigh: row.optimalHigh,
    });
    if (!p.contributions.length) continue;
    // Honest about a projection written after its start (an intervention
    // that only matched later): the arithmetic reads the papers, never the
    // draw, but the page should not pretend it was written on that day.
    if (fromDate < today && fromDate !== lastResolved.get(code))
      p.assumptions.push(
        `written on ${today} for a start on ${fromDate}, from the published effect sizes alone`,
      );
    await db.insert(projections).values({
      userId,
      code,
      madeAt: p.fromDate,
      horizonWeeks: p.horizonWeeks,
      fromValue: p.from,
      expected: p.expected,
      low: p.low,
      high: p.high,
      contributions: p.contributions,
      assumptions: p.assumptions,
      retestAt: p.retestAt,
    });
    made.push(p);
  }
  return made;
}

/**
 * Close every open projection whose marker has been measured again.
 *
 * The draw has to land inside the window (`retest_at` minus two weeks or
 * later) and after the projection was made, so a reading from before the
 * change never resolves it.
 */
/**
 * The draw that answers a projection: the first value after it was made and
 * no earlier than two weeks before its retest date. Pure; oldest-first rows.
 */
export function drawFor(
  p: { madeAt: string; retestAt: string },
  rows: { observedAt: string; value: number | null }[],
): { observedAt: string; value: number } | null {
  const earliest = addWeeks(p.retestAt, -RESOLVE_WINDOW_WEEKS);
  const hit = rows.find(
    (r) =>
      r.value != null && r.observedAt >= earliest && r.observedAt > p.madeAt,
  );
  return hit?.value != null
    ? { observedAt: hit.observedAt, value: hit.value }
    : null;
}

export async function resolveProjections(
  userId: string,
  db: Db = getDb(),
): Promise<number> {
  const open = await db
    .select()
    .from(projections)
    .where(and(eq(projections.userId, userId), isNull(projections.resolvedAt)));
  if (!open.length) return 0;

  const rows = await getMetricRows(userId);
  let closed = 0;

  for (const row of open) {
    const metric = rows.find((r) => r.code === row.code);
    if (!metric) continue;
    const draw = drawFor(row, metric.rows);
    if (!draw) continue;

    const stored = toStored(row);
    const verdict = verdictOf(
      { ...stored, unit: metric.unit ?? "" },
      draw.value,
      betterDirection(row.code, metric.optimalLow, metric.optimalHigh),
    );
    await db
      .update(projections)
      .set({
        resolvedValue: draw.value,
        resolvedAt: draw.observedAt,
        verdict,
      })
      .where(eq(projections.id, row.id));

    // What actually happened to each pair, for pooling later.
    const observed = draw.value - row.fromValue;
    for (const c of stored.contributions)
      await db.insert(interventionOutcomes).values({
        userId,
        pair: `${c.intervention} -> ${row.code}`,
        predictedDelta: c.delta,
        observedDelta:
          Math.round(
            observed * (c.delta / (stored.expected - row.fromValue || 1)) * 100,
          ) / 100,
        adherence: c.adherence ?? null,
        projectionId: row.id,
        at: draw.observedAt,
      });
    closed++;
  }
  return closed;
}

/**
 * The line the home ledger prints for one marker.
 *
 * Phase 30d, UX note 3: "On track: hba1c expected 5.26 % by 2026-11-23" put
 * an engine code and a machine's date on the page. The marker goes through
 * `explainKey` and the day through `dayLabel`, here and everywhere.
 */
export function ledgerLine(p: StoredProjection, unit = ""): string {
  const u = unit ? ` ${unit}` : "";
  const name = explainKey(p.code);
  if (p.verdict && p.resolvedValue != null)
    return p.verdict === "as_expected"
      ? `As expected: ${name} ${p.resolvedValue}${u}, projected ${p.expected}`
      : p.verdict === "better"
        ? `Better than expected: ${p.resolvedValue}${u} against ${p.expected}`
        : `Worse than expected: ${p.resolvedValue}${u} against ${p.expected}`;
  const due = new Date(p.retestAt) <= new Date(localDay());
  const when = dayLabel(p.retestAt, true);
  return due
    ? `Retest due: ${name}, projected ${p.expected}${u} by ${when}`
    : `On track: ${name} expected ${p.expected}${u} by ${when}, retest then`;
}

/**
 * "This alone: -0.3 % HbA1c in 12 weeks, grade B (Goldenberg 2021 BMJ)".
 *
 * What one action would do on its own, for the moment before it is adopted.
 * One query for a whole plan, keyed by the action's title.
 */
export async function previewLines(
  texts: string[],
): Promise<Record<string, string>> {
  if (!texts.length) return {};
  const rows = await getDb()
    .select()
    .from(hkbInterventions)
    .where(eq(hkbInterventions.status, "accepted"));
  const out: Record<string, string> = {};
  for (const text of texts) {
    const match = matchIntervention(text, rows);
    const effect = match ? toEffect(match) : null;
    if (!effect) continue;
    const code = effect.outcomeFeatureId.replace(/^(metric|derived):/, "");
    const weeks = RETEST_WEEKS[code] ?? 12;
    const p = project({
      code,
      unit: "",
      from: 0,
      fromDate: "2000-01-01",
      actions: [{ itemId: "preview", text, adoptedAt: "2000-01-01", effect }],
    });
    const delta = p.contributions[0]?.delta;
    if (delta == null) continue;
    out[text] =
      `this alone: ${delta > 0 ? "+" : ""}${delta} ${explainKey(code)} in ${weeks} weeks, ` +
      `grade ${effect.grade} (${effect.source})`;
  }
  return out;
}

/** The pairs with no effect size, for `hkb:research --effects`. */
export async function projectionGaps(userId: string): Promise<string[]> {
  const actions = await adoptedActions(userId);
  return actions.filter((a) => !a.effect).map((a) => a.text);
}

export { RETEST_WEEKS };
