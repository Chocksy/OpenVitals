/**
 * The measuring stick.
 *
 * Every probability this app prints is a claim, and until now nothing checked
 * them. `calibration_events` records the pair that lets you: what the engine
 * believed just before a strong test came back, and what the test said. Ten
 * conditions the engine called 80 % should turn out true about eight times.
 *
 * Nothing here changes a probability. It exists so `/hkb` can print
 * predicted-band against observed-rate once there are enough rows to read, and
 * so a future phase has something to fit against.
 *
 * `bandsOf` is pure, so the table on the page is testable with no database.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import {
  beliefSnapshots,
  calibrationEvents,
  documentItems,
  getDb,
  type BeliefSnapshotBeliefs,
} from "@/db";
import type { ModelInput } from "./coverage";
import { matchCondition } from "./documents";
import type { Catalog, HypothesisResult } from "./hypotheses";

/** A discriminator this strong settles the question either way. */
export const RESOLVING_LR = 10;

/* ── the pure half ────────────────────────────────────────────────────── */

export interface CalibrationRow {
  predicted: number;
  resolved: number;
}

export interface Band {
  label: string;
  low: number;
  high: number;
  n: number;
  /** the mean probability the engine gave in this band */
  predicted: number | null;
  /** how often it turned out true */
  observed: number | null;
}

/** Enough events to read anything at all. */
export const READABLE_AT = 20;

const BANDS: [string, number, number][] = [
  ["0–5 %", 0, 0.05],
  ["5–25 %", 0.05, 0.25],
  ["25–60 %", 0.25, 0.6],
  ["60–90 %", 0.6, 0.9],
  ["90–100 %", 0.9, 1.0001],
];

/** Predicted band against observed rate, in the five states the engine uses. */
export function bandsOf(rows: CalibrationRow[]): Band[] {
  return BANDS.map(([label, low, high]) => {
    const mine = rows.filter((r) => r.predicted >= low && r.predicted < high);
    const mean = (xs: number[]) =>
      xs.length
        ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 1000) / 1000
        : null;
    return {
      label,
      low,
      high,
      n: mine.length,
      predicted: mean(mine.map((r) => r.predicted)),
      observed: mean(mine.map((r) => r.resolved)),
    };
  });
}

/* ── writing ──────────────────────────────────────────────────────────── */

/** What the engine believed for this condition before today's readings. */
async function believedBefore(
  userId: string,
): Promise<BeliefSnapshotBeliefs | null> {
  const [row] = await getDb()
    .select({ beliefs: beliefSnapshots.beliefs })
    .from(beliefSnapshots)
    .where(eq(beliefSnapshots.userId, userId))
    .orderBy(desc(beliefSnapshots.computedAt))
    .limit(1);
  return row?.beliefs ?? null;
}

async function write(row: {
  userId: string;
  conditionId: string;
  predicted: number;
  resolved: number;
  resolver: string;
}) {
  await getDb()
    .insert(calibrationEvents)
    .values({ ...row, resolvedAt: new Date() })
    .onConflictDoNothing();
}

/**
 * Record every prediction a strong test has now settled.
 *
 * Called from `recordBeliefs`, after the beliefs are recomputed and before the
 * new snapshot is written, so `predicted` is genuinely the belief from before
 * the resolving reading arrived. Unique on (user, condition, resolver), so a
 * test that keeps being read only ever produces one event.
 */
export async function recordCalibration(
  userId: string,
  m: ModelInput,
  scored: HypothesisResult[],
  catalog: Catalog,
): Promise<number> {
  const before = await believedBefore(userId);
  if (!before) return 0;
  const byId = new Map(catalog.map((h) => [h.id, h]));
  let written = 0;

  for (const h of scored) {
    const spec = byId.get(h.id);
    if (!spec) continue;
    const predicted = before[h.id]?.p;
    if (predicted == null) continue;
    for (const d of spec.discriminators) {
      if (d.lrPos < RESOLVING_LR || d.repeatable) continue;
      if (d.typicalPos == null || d.typicalNeg == null) continue;
      const code = d.codes.find((c) => m.latest[c]?.value != null);
      if (!code) continue;
      const value = m.latest[code]!.value!;
      const positive =
        Math.abs(value - d.typicalPos) <= Math.abs(value - d.typicalNeg);
      await write({
        userId,
        conditionId: h.id,
        predicted,
        resolved: positive ? 1 : 0,
        resolver: `test:${code}`,
      });
      written++;
    }
  }
  return written;
}

/**
 * A document that says a condition outright is a resolver too, and a stronger
 * one than most tests. Called from the accept path, where the diagnosis is
 * already matched to a catalog condition.
 */
export async function recordDocumentCalibration(
  userId: string,
  uploadId: string,
  conditions: { id: string; name: string; mondoId: string | null }[],
): Promise<number> {
  const db = getDb();
  const before = await believedBefore(userId);
  if (!before) return 0;

  const items = await db
    .select({ payload: documentItems.payload })
    .from(documentItems)
    .where(
      and(
        eq(documentItems.userId, userId),
        eq(documentItems.uploadId, uploadId),
        eq(documentItems.kind, "diagnosis"),
        eq(documentItems.status, "accepted"),
      ),
    );

  let written = 0;
  for (const item of items) {
    const p = item.payload as {
      text?: string;
      mondoGuess?: string;
      status?: string;
    };
    const conditionId = matchCondition(p, conditions);
    if (!conditionId) continue;
    const status = p.status ?? "confirmed";
    // "suspected" settles nothing, so it is not a resolver.
    const resolved =
      status === "confirmed" || status === "history"
        ? 1
        : status === "ruled_out"
          ? 0
          : null;
    if (resolved == null) continue;
    const predicted = before[conditionId]?.p;
    if (predicted == null) continue;
    await write({
      userId,
      conditionId,
      predicted,
      resolved,
      resolver: `document:${uploadId}`,
    });
    written++;
  }
  return written;
}

/** Every event, for the /hkb tab. */
export async function calibrationRows(): Promise<
  (CalibrationRow & { conditionId: string; resolver: string; at: Date })[]
> {
  const rows = await getDb()
    .select({
      conditionId: calibrationEvents.conditionId,
      predicted: calibrationEvents.predicted,
      resolved: calibrationEvents.resolved,
      resolver: calibrationEvents.resolver,
      at: calibrationEvents.resolvedAt,
    })
    .from(calibrationEvents)
    .where(sql`${calibrationEvents.resolved} is not null`)
    .orderBy(desc(calibrationEvents.resolvedAt));
  return rows.map((r) => ({
    conditionId: r.conditionId,
    predicted: r.predicted,
    resolved: r.resolved!,
    resolver: r.resolver,
    at: r.at ?? new Date(),
  }));
}
