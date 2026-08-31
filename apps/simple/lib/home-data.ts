/**
 * The four key-trend charts on Home, derived on the server from the metric
 * rows.
 *
 * ponytail: the counters, the score and the attention list moved into
 * `lib/ledger.ts` with the phase-12 rewrite, so this file is one function now.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  checkinPosts,
  getDb,
  lifeEvents,
  profileFacts,
  profileFactHistory,
  protocolItems,
  readings,
  type CheckinPost,
} from "@/db";
import { buildModelInput } from "./coverage";
import type { MetricRow } from "./data";
import { tagsOfEvent } from "./facts";
import { catalogFor } from "./hkb";
import { nextMoves } from "./infogain";
import { dueFacts, revisitAtFor, type DueFact } from "./revisit";
import { healthStatus, type HealthStatus } from "./status";

/** The bands a reading is judged against, i.e. the range bar's props. */
export interface Bands {
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
}

export interface TrendMetric extends Bands {
  metricCode: string;
  metricName: string;
  unit: string | null;
  status: HealthStatus;
  points: { date: string; value: number }[];
  latestValue: number;
  prevValue: number | null;
  goalLow: number | null;
  goalHigh: number | null;
}

const bandsOf = (m: MetricRow): Bands => ({
  refLow: m.latest.refLow,
  refHigh: m.latest.refHigh,
  optimalLow: m.optimalLow,
  optimalHigh: m.optimalHigh,
});

const rowStatus = (m: MetricRow): HealthStatus =>
  healthStatus({ value: m.latest.value, ...bandsOf(m) });

/** One key-trend chart: the line, its bands and the goal tick. */
export function buildTrend(
  m: MetricRow,
  goal?: { targetLow: number | null; targetHigh: number | null } | null,
): TrendMetric | null {
  if (m.points.length < 3 || m.latest.value == null) return null;
  const values = m.rows.filter((r) => r.value != null);
  return {
    metricCode: m.code,
    metricName: m.name,
    unit: m.latest.unit ?? m.unit,
    status: rowStatus(m),
    points: m.points,
    latestValue: m.latest.value,
    prevValue: values[values.length - 2]?.value ?? null,
    goalLow: goal?.targetLow ?? null,
    goalHigh: goal?.targetHigh ?? null,
    ...bandsOf(m),
  };
}

/* ── the Today card (phase 20) ────────────────────────────────────────── */

export interface Today {
  /** at most two answers worth re-asking, best reason first */
  due: DueFact[];
  /** the last check-in, so Home can print its reply in one line */
  post: {
    id: string;
    date: string;
    text: string;
    reply: string | null;
    chips: number;
  } | null;
}

/**
 * What Home puts at the top: the re-asks that are due, and the last reply.
 *
 * Every trigger `dueFacts` reads is looked up here and nowhere else: the
 * newest draw, the adopted actions, the life events that are going on, and the
 * fact keys the information-gain engine currently wants. The arithmetic stays
 * in `lib/revisit.ts`, which is why it is testable to the day.
 */
export async function buildToday(userId: string): Promise<Today> {
  const db = getDb();
  const [m, catalog] = await Promise.all([
    buildModelInput(userId),
    catalogFor(userId),
  ]);

  const [facts, history, draw, actions, events, posts] = await Promise.all([
    db.select().from(profileFacts).where(eq(profileFacts.userId, userId)),
    db
      .select()
      .from(profileFactHistory)
      .where(eq(profileFactHistory.userId, userId)),
    db
      .select({ observedAt: readings.observedAt })
      .from(readings)
      .where(eq(readings.userId, userId))
      .orderBy(desc(readings.observedAt))
      .limit(1),
    db
      .select({ text: protocolItems.text })
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      ),
    db
      .select()
      .from(lifeEvents)
      .where(
        and(eq(lifeEvents.userId, userId), isNotNull(lifeEvents.startedAt)),
      ),
    db
      .select()
      .from(checkinPosts)
      .where(eq(checkinPosts.userId, userId))
      .orderBy(desc(checkinPosts.createdAt))
      .limit(1),
  ]);

  const openFrom = new Map<string, string>();
  for (const h of history)
    if (h.changeKind !== "corrected" && h.validTo == null)
      openFrom.set(h.key, h.validFrom);

  // A fact answered before phase 20 has no `revisit_at`, so its cadence is
  // worked out from the day it started holding. That is cheaper and safer than
  // a backfill, and it means the column only ever caches the arithmetic.
  const rows = facts.map((f) => {
    const validFrom =
      openFrom.get(f.key) ??
      (f.answeredAt ?? new Date()).toISOString().slice(0, 10);
    return {
      key: f.key,
      value: f.value,
      validFrom,
      revisitAt: f.revisitAt ?? revisitAtFor(f.key, validFrom, f.value),
    };
  });

  // Anything still going on today, by the same tags a confounder uses.
  const eventTags = [
    ...new Set(
      events
        .filter((e) => (e.endedAt ?? m.today) >= m.today)
        .flatMap((e) => tagsOfEvent(e)),
    ),
  ];

  const gainKeys = nextMoves(m, catalog, { max: 6 })
    .filter((mv) => mv.kind === "question")
    .map((mv) => mv.featureId.replace(/^fact:/, ""));

  const due = dueFacts(
    m,
    rows,
    {
      newDrawSince: draw[0]?.observedAt,
      adopted: actions.map((a) => a.text),
      eventTags,
      gainKeys,
    },
    m.today,
  );

  const last = posts[0] as CheckinPost | undefined;
  return {
    due,
    post: last
      ? {
          id: last.id,
          date: (last.createdAt ?? new Date()).toISOString().slice(0, 10),
          text: last.text,
          reply: last.reply,
          chips: (last.chips ?? []).length,
        }
      : null,
  };
}
