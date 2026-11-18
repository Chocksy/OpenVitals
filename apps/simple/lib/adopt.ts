/**
 * Taking an action off the plan and making it real, without a Request.
 *
 * Phase 28c. `/api/plan/adopt` was the only place that knew how to turn one
 * action into a protocol item, its check-ins and its goals, so a thread tool
 * could not adopt anything without a second copy of it. The route is now four
 * lines around this function and the tool calls the same one.
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  getDb,
  goals,
  hkbInterventions,
  metrics,
  protocolItems,
  readings,
  reports,
  reviewItems,
  type ReportAction,
} from "@/db";
import { adoptBodyOf } from "@/lib/actions";
import { localDay, shiftDay } from "@/lib/daily";
import { addMonths, scheduleOf } from "@/lib/plan-line";
import { recordBeliefs } from "@/lib/ledger";
import { markersFor } from "@/lib/projections";
import { queueResearch } from "@/lib/research";

const DAY = 86_400_000;

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const ROUGHLY = String.raw`(?:(?:about|around|roughly|approximately|approx\.?|under|below|over|above|at least|at most|less than|more than)\s*|[~<>≤≥]\s*)?`;
/** "131 to about 118", "131 mg/dL → 118": where it starts, then where it lands. */
const TRANSITION = new RegExp(
  String.raw`(?<![a-z])${NUMBER}\s*(?:[a-zµ%/]+\s*)?(?:→|->|=>|\bto\b|\btowards\b)\s*${ROUGHLY}${NUMBER}`,
  "i",
);
/** "70-100 mg/dL": a band, not a sum. */
const RANGE = new RegExp(String.raw`(?<![a-z\d.])${NUMBER}\s*[-–—]\s*${NUMBER}`, "i");
/** "-13", "−13 mg/dL", "+5": a change, signed. */
const SIGNED = new RegExp(String.raw`(?:^|[\s(])([+\-−])\s*${NUMBER}`);
/** "down about 13", "lower by 13", "drop of 13": a change, in words. */
const WORDED = new RegExp(
  String.raw`\b(?:(?:down|up|lower(?:ed|s)?|higher|drops?|falls?|reduc(?:e|es|ed|tion)|decreas(?:e|es|ed)|increas(?:e|es|ed)|rais(?:e|es|ed)|rises?)\s+(?:by\s+|of\s+)?|\bby\s+)${ROUGHLY}${NUMBER}\s*(%)?`,
  "i",
);
/** A number that is a time or a date, never a target: "in 12 weeks", "2026-12-01". */
const NOT_A_TARGET =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d+(?:\.\d+)?\s*(?:weeks?|wks?|months?|days?|years?|yrs?|h|hours?)\b/gi;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The value a target's `expect` aims at, or null when it does not say one.
 *
 * Batch 5A. The old reading took the first number, so "131 to about 118
 * mg/dL" stored 131, the value it started from, and the next curator pass
 * closed the goal the day after on the reading that prompted it. The forms:
 *
 *  - "131 to about 118 mg/dL", "131 → 118": where it lands, 118; a landing
 *    on the wrong side of the start for the direction is unclear, so null;
 *  - "70-100 mg/dL": the band's far edge for the direction (down: 100); a
 *    "band" whose ends run downhill ("131 - 118") is unclear, so null;
 *  - "down about 13 mg/dL", "-13", "lower by 13": `latest` moved by 13 in
 *    the target's direction, null without a latest value or for a relative
 *    percent ("down 10 %"), which is no number in the marker's unit;
 *  - one number and nothing else: that number;
 *  - anything else: null, and no goal is written.
 *
 * Pure.
 */
export function goalTarget(
  expect: string,
  direction: "up" | "down",
  latest: number | null | undefined,
): number | null {
  const text = expect
    .replace(/(\d)[,\s](?=\d{3}\b)/g, "$1")
    .replace(NOT_A_TARGET, " ");

  const move = TRANSITION.exec(text);
  if (move) {
    const [from, to] = [Number(move[1]), Number(move[2])];
    if (direction === "down" ? to > from : to < from) return null;
    return to;
  }

  const band = RANGE.exec(text);
  if (band) {
    const [a, b] = [Number(band[1]), Number(band[2])];
    return a < b ? (direction === "down" ? b : a) : null;
  }

  const relative = (n: number, sign: 1 | -1 | null): number | null => {
    if (latest == null || !Number.isFinite(n) || n === 0) return null;
    const way = direction === "down" ? -1 : 1;
    if (sign != null && sign !== way) return null;
    return round2(latest + way * n);
  };
  const signed = SIGNED.exec(text);
  if (signed) {
    if (/^\s*%/.test(text.slice(signed.index + signed[0].length))) return null;
    return relative(Number(signed[2]), signed[1] === "+" ? 1 : -1);
  }
  const worded = WORDED.exec(text);
  if (worded) return worded[2] ? null : relative(Number(worded[1]), null);

  const numbers = [...text.matchAll(/(?<![a-z\d.])\d+(?:\.\d+)?/gi)];
  return numbers.length === 1 ? Number(numbers[0]![0]) : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The newest value of each marker, for a target that is a change ("-13"). */
async function latestValues(
  userId: string,
  codes: string[],
): Promise<Map<string, number>> {
  if (!codes.length) return new Map();
  const rows = await getDb()
    .select({ code: readings.metricCode, value: readings.value })
    .from(readings)
    .where(
      and(
        eq(readings.userId, userId),
        inArray(readings.metricCode, codes),
        isNotNull(readings.value),
      ),
    )
    .orderBy(desc(readings.observedAt));
  const out = new Map<string, number>();
  for (const r of rows)
    if (r.value != null && !out.has(r.code)) out.set(r.code, r.value);
  return out;
}

/**
 * The id of the protocol item this action already is, when it is one.
 *
 * `lib/ledger.ts` joins the plan to the protocol by "the item's text starts
 * with the action's title", so the same join answers "have they got this
 * already?" and adopting twice is one line rather than two.
 */
async function onProtocol(userId: string, text: string): Promise<string | null> {
  const title = text.split(" — ")[0]!;
  const rows = await getDb()
    .select({ id: protocolItems.id, text: protocolItems.text })
    .from(protocolItems)
    .where(
      and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
    );
  return rows.find((r) => r.text.startsWith(title))?.id ?? null;
}

/**
 * Phase 32a section 2. The plan's own line carries a time of day, a set of
 * weekdays, an amount, a unit, what to take it with and how long for, and
 * until now all of it landed in one `cadence` text column that only ever said
 * "daily" or "weekly". `scheduleOf` reads the same text the row stores, so an
 * adopted item arrives with its schedule and `plan-month.html` has something
 * to print. `dose_amount` is `numeric`, which drizzle takes as a string.
 *
 * `cadence` is untouched: everything that already reads it still reads it.
 */
function scheduleColumns(text: string, startedAt: string | null) {
  const s = scheduleOf(text);
  return {
    timeOfDay: s.timeOfDay,
    daysOfWeek: s.daysOfWeek,
    doseAmount: s.doseAmount == null ? null : String(s.doseAmount),
    doseUnit: s.doseUnit,
    withWhat: s.withWhat,
    endsAt:
      s.months == null ? null : addMonths(startedAt ?? localDay(), s.months),
  };
}

const doseSummary = (a: ReportAction) =>
  a.dose ? `${a.title} — ${a.dose.amount}, ${a.dose.schedule}` : a.title;

/**
 * Take one action off the plan and turn it into everything that makes it real:
 * a protocol item to tick, a check-in for each follow-up dated in the future,
 * and a goal for every target whose expected value is a number.
 */

/** What the caller gets back: the route prints it, the tool reads `id`. */
export type AdoptResult =
  | { ok: true; id?: string; adopted?: string; already?: boolean; removed?: number }
  | { error: string; status: number };

/** The action id shapes `adoptBodyOf` reads, or a report/intervention by hand. */
export interface AdoptBody {
  /**
   * Phase 27. One chip in an answer knows the action only by the id the
   * model was given (`plan:<reportId>:<index>`, `int:<id>`), so the id is
   * a third way to say the same two bodies and `adoptBodyOf` is the only
   * place that reads it.
   */
  id?: string;
  reportId?: string;
  actionIndex?: number;
  /** the horizon shelf and the card blocks: one claim, adopted */
  interventionId?: string;
  /**
   * The undo behind every "Added N actions" toast. Phase 26: adding said
   * nothing and could not be taken back, so nobody trusted the button.
   */
  removeIds?: string[];
  /**
   * The day this person says they started doing it, when they said so —
   * "i already do this, since March". The addendum path writes it; every
   * other caller leaves it null and the row is dated by `createdAt`.
   */
  startedAt?: string;
}

export async function adopt(
  userId: string,
  body: AdoptBody,
): Promise<AdoptResult> {
  const startedAt = DATE.test(body.startedAt ?? "") ? body.startedAt! : null;
  const named = body.id ? adoptBodyOf(body.id) : null;
  if (body.id && !named)
    return { error: "no action", status: 400 };
  const { reportId, actionIndex, interventionId, removeIds } = {
    ...body,
    ...(named ?? {}),
  };
  const db = getDb();

  if (removeIds?.length) {
    await db
      .delete(protocolItems)
      .where(
        and(
          eq(protocolItems.userId, userId),
          inArray(protocolItems.id, removeIds),
        ),
      );
    await recordBeliefs(userId);
    return { ok: true, removed: removeIds.length };
  }

  /**
   * A claim off the horizon shelf. It becomes a protocol item like anything
   * else, but nothing pretends it has an effect size: grade E never projects,
   * so the card says what it will be judged on and the research queue gets the
   * condition, which is exactly the phase 19 behaviour for a pair with no
   * number on file.
   */
  if (interventionId) {
    const [row] = await db
      .select()
      .from(hkbInterventions)
      .where(eq(hkbInterventions.id, interventionId));
    if (!row) return { error: "not found", status: 404 };
    const code = row.outcomeFeatureId?.replace(/^metric:/, "") ?? null;
    /**
     * A horizon row is a popular claim and says so. An accepted row is a
     * graded intervention off a card's "What to do" block, and its label is
     * its grade — phase 26, where the labels have to survive the adopt.
     */
    const why =
      row.status === "horizon"
        ? `popular right now, grade ${row.grade}, anecdotal (from ${
            row.population ?? "unknown"
          }): ${row.quote ?? ""}`
        : `grade ${row.grade}${row.dose ? `, ${row.dose}` : ""}${
            row.effect ? `, ${row.direction} ${row.effect}` : ""
          } for ${row.conditionId}`;
    const text = `${row.name}${row.dose ? ` — ${row.dose}` : ""}`.slice(0, 300);
    const already = await onProtocol(userId, text);
    if (already)
      return { ok: true, id: already, adopted: row.name };
    const [item] = await db
      .insert(protocolItems)
      .values({
        userId,
        text,
        why: why.slice(0, 500),
        metricCodes: code ? [code] : await markersFor(text),
        cadence: "daily",
        ...scheduleColumns(text, startedAt),
        startedAt: startedAt ?? localDay(),
      })
      .returning({ id: protocolItems.id });
    await queueResearch(row.conditionId).catch(() => false);
    await recordBeliefs(userId);
    return { ok: true, id: item?.id, adopted: row.name };
  }

  if (!reportId || typeof actionIndex !== "number")
    return { error: "no action", status: 400 };

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report || report.userId !== userId)
    return { error: "not found", status: 404 };

  const action = report.body.actions[actionIndex];
  if (!action) return { error: "not found", status: 404 };

  /**
   * The same action, adopted twice, is one line on the protocol. The addendum
   * path adopts what a person says they already do, and they can say it after
   * having pressed Add, so this is the difference between one habit and two.
   */
  const text = doseSummary(action).slice(0, 300);
  const already = await onProtocol(userId, text);
  if (already) {
    if (startedAt)
      await db
        .update(protocolItems)
        .set({ startedAt })
        .where(eq(protocolItems.id, already));
    await recordBeliefs(userId);
    return { ok: true, id: already, already: true };
  }

  /**
   * Batch 5A. Every item carries the day it started, so "since you started"
   * has a date to count from (8 of 8 of the owner's items had none). An
   * action with no targets borrows the markers its intervention moves.
   */
  const started = startedAt ?? localDay();
  const targeted = action.targets.map((t) => t.code);
  const [item] = await db
    .insert(protocolItems)
    .values({
      userId,
      text,
      why: action.why.slice(0, 500),
      metricCodes: targeted.length ? targeted : await markersFor(text),
      cadence: /week/i.test(action.dose?.schedule ?? "") ? "weekly" : "daily",
      ...scheduleColumns(text, startedAt),
      startedAt: started,
    })
    .returning({ id: protocolItems.id });

  for (const [i, f] of action.followUp.entries())
    await db.insert(reviewItems).values({
      userId,
      kind: "check_in",
      subject: {
        key: `${reportId}:${actionIndex}:${i}`,
        reportId,
        actionIndex,
        ask: f.ask,
        detail: `${action.title} · day ${f.afterDays}`,
      },
      question: f.ask,
      options: ["Yes", "No", "Note…"],
      createdAt: new Date(Date.now() + f.afterDays * DAY),
    });

  const codes = action.targets.map((t) => t.code);
  const known = codes.length
    ? new Set(
        (
          await db
            .select({ code: metrics.code })
            .from(metrics)
            .where(inArray(metrics.code, codes))
        ).map((m) => m.code),
      )
    : new Set<string>();

  /**
   * Batch 5A. A goal aims where the target says it lands ("131 to about 118"
   * is 118, not 131), is due when the target says to measure, and is made
   * now, so only a reading stored after today can close it (`goalState`).
   */
  const latest = await latestValues(userId, codes);
  for (const t of action.targets) {
    if (!known.has(t.code)) continue;
    const target = goalTarget(t.expect, t.direction, latest.get(t.code));
    if (target == null) continue;
    const band =
      t.direction === "down"
        ? { targetLow: null, targetHigh: target }
        : { targetLow: target, targetHigh: null };
    const due =
      t.measureAfterWeeks > 0
        ? shiftDay(started, Math.round(t.measureAfterWeeks * 7))
        : null;
    const set = {
      ...band,
      due,
      note: `${action.title}: ${t.expect}`,
      achievedAt: null,
    };
    await db
      .insert(goals)
      .values({ userId, metricCode: t.code, ...set })
      .onConflictDoUpdate({
        target: [goals.userId, goals.metricCode],
        set: { ...set, createdAt: sql`now()` },
      });
  }

  await recordBeliefs(userId);
  return { ok: true, id: item?.id };
}
