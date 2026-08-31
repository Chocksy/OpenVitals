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
import type { Grade } from "./hypotheses";
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
 * The intervention row an adopted action is: the one whose name the action's
 * text contains, or the other way round. ponytail: no fuzzy matching and no
 * model. An action written by the app carries the intervention's own words,
 * and an action that does not match one simply has no effect size, which the
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
  return hits[0] ?? null;
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

/** Everything this person has adopted, with its effect size and adherence. */
export async function adoptedActions(userId: string): Promise<AdoptedAction[]> {
  const db = getDb();
  const [items, logs, effects] = await Promise.all([
    db
      .select()
      .from(protocolItems)
      .where(and(eq(protocolItems.userId, userId), eq(protocolItems.active, true))),
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

  return items.map((item) => {
    const done = new Set(
      logs.filter((l) => l.itemId === item.id && l.done).map((l) => l.day),
    );
    const hit = [...window].filter((d) => done.has(d)).length;
    const match = matchIntervention(item.text, effects);
    return {
      itemId: item.id,
      text: item.text,
      adoptedAt: (item.createdAt ?? new Date()).toISOString().slice(0, 10),
      adherence: done.size ? hit / window.size : undefined,
      effect: match ? toEffect(match) : null,
    };
  });
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
 * Write a projection for every marker an adopted action moves, unless one is
 * already open for that marker. Called when an action is adopted and by
 * `recordBeliefs`, so a change in adherence is picked up on the next run.
 */
export async function makeProjections(userId: string): Promise<Projection[]> {
  const db = getDb();
  const actions = await adoptedActions(userId);
  const codes = targetCodes(actions);
  if (!codes.length) return [];

  const rows = await getMetricRows(userId);
  const open = await db
    .select({ code: projections.code })
    .from(projections)
    .where(and(eq(projections.userId, userId), isNull(projections.resolvedAt)));
  const alreadyOpen = new Set(open.map((o) => o.code));

  const made: Projection[] = [];
  for (const code of codes) {
    if (alreadyOpen.has(code)) continue;
    const row = rows.find((r) => r.code === code);
    if (row?.latest?.value == null) continue;
    const p = project({
      code,
      unit: row.unit ?? "",
      from: row.latest.value,
      fromDate: localDay(),
      actions,
      optimalLow: row.optimalLow,
      optimalHigh: row.optimalHigh,
    });
    if (!p.contributions.length) continue;
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
export async function resolveProjections(userId: string): Promise<number> {
  const db = getDb();
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
    const earliest = addWeeks(row.retestAt, -RESOLVE_WINDOW_WEEKS);
    const draw = metric.rows.find(
      (r) =>
        r.value != null &&
        r.observedAt >= earliest &&
        r.observedAt > row.madeAt,
    );
    if (!draw?.value) continue;

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
            (observed * (c.delta / (stored.expected - row.fromValue || 1))) * 100,
          ) / 100,
        adherence: c.adherence ?? null,
        projectionId: row.id,
        at: draw.observedAt,
      });
    closed++;
  }
  return closed;
}

/** The line the home ledger prints for one marker. */
export function ledgerLine(p: StoredProjection, unit = ""): string {
  const u = unit ? ` ${unit}` : "";
  if (p.verdict && p.resolvedValue != null)
    return p.verdict === "as_expected"
      ? `As expected: ${p.code} ${p.resolvedValue}${u}, projected ${p.expected}`
      : p.verdict === "better"
        ? `Better than expected: ${p.resolvedValue}${u} against ${p.expected}`
        : `Worse than expected: ${p.resolvedValue}${u} against ${p.expected}`;
  const due = new Date(p.retestAt) <= new Date(localDay());
  return due
    ? `Retest due: ${p.code}, projected ${p.expected}${u} by ${p.retestAt}`
    : `On track: ${p.code} expected ${p.expected}${u} by ${p.retestAt}, retest then`;
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
      `this alone: ${delta > 0 ? "+" : ""}${delta} ${code.replace(/_/g, " ")} in ${weeks} weeks, ` +
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
