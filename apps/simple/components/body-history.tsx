/**
 * The history lanes and their replay slider, as one server component.
 *
 * Phase 30b folds `/history` into the Body page's Trends tab. The queries are
 * the ones the old page ran, unchanged; the raw event table is gone because
 * the lanes carry the same rows and the mockup drops it.
 */
import { asc, desc, eq } from "drizzle-orm";
import {
  beliefSnapshots,
  checkinPosts,
  getDb,
  habitLogs,
  profileFactHistory,
  protocolItems,
} from "@/db";
import { getMetricRows } from "@/lib/data";
import { projectionsFor } from "@/lib/projections";
import {
  HistoryLanes,
  type HistoryMarker,
  type HistoryPost,
} from "./history-lanes";

const text = (v: unknown) =>
  Array.isArray(v) ? v.join(", ") : String(v ?? "");

export async function BodyHistory({ userId }: { userId: string }) {
  const db = getDb();
  const [facts, actions, logs, snaps, metrics, made, posts] =
    await Promise.all([
      db
        .select()
        .from(profileFactHistory)
        .where(eq(profileFactHistory.userId, userId))
        .orderBy(asc(profileFactHistory.validFrom)),
      db
        .select()
        .from(protocolItems)
        .where(eq(protocolItems.userId, userId))
        .orderBy(desc(protocolItems.createdAt))
        .limit(100),
      db.select().from(habitLogs).where(eq(habitLogs.userId, userId)),
      db
        .select()
        .from(beliefSnapshots)
        .where(eq(beliefSnapshots.userId, userId))
        .orderBy(asc(beliefSnapshots.computedAt))
        .limit(200),
      getMetricRows(userId),
      projectionsFor(userId),
      db
        .select()
        .from(checkinPosts)
        .where(eq(checkinPosts.userId, userId))
        .orderBy(desc(checkinPosts.createdAt))
        .limit(200),
    ]);

  const lanePosts: HistoryPost[] = posts
    .filter((p) => p.createdAt)
    .map((p) => ({
      id: p.id,
      date: p.createdAt!.toISOString().slice(0, 10),
      text: p.text,
      chips: (p.chips ?? []).length,
    }));

  const laneFacts = facts.map((f) => ({
    key: f.key,
    value: text(f.value),
    validFrom: f.validFrom,
    validTo: f.validTo,
    changeKind: f.changeKind,
    source: f.source,
    note: f.note,
    confirmations: f.confirmations ?? [],
  }));

  const laneActions = actions
    .filter((a) => a.createdAt)
    .map((a) => {
      const done = logs.filter((l) => l.itemId === a.id && l.done).length;
      const days = Math.max(
        1,
        Math.round(
          (Date.now() - (a.createdAt?.getTime() ?? Date.now())) / 86_400_000,
        ),
      );
      return {
        id: a.id,
        text: a.text,
        from: a.createdAt!.toISOString().slice(0, 10),
        active: a.active,
        adherence: Math.min(1, done / Math.min(days, 30)),
      };
    });

  // Every marker a projection was ever made about, plus anything off today.
  const codes = [
    ...new Set([
      ...made.map((p) => p.code),
      ...metrics.filter((m) => m.status === "red").map((m) => m.code),
    ]),
  ].slice(0, 4);
  const laneMarkers: HistoryMarker[] = codes
    .map((code) => {
      const m = metrics.find((x) => x.code === code);
      return {
        code,
        unit: m?.unit ?? null,
        points: (m?.points ?? []).map((p) => ({
          date: p.date,
          value: p.value,
        })),
        projections: made
          .filter((p) => p.code === code)
          .map((p) => ({
            madeAt: p.fromDate,
            retestAt: p.retestAt,
            expected: p.expected,
            low: p.low,
            high: p.high,
            verdict: p.verdict,
            resolvedValue: p.resolvedValue,
            resolvedAt: p.resolvedAt,
          })),
      };
    })
    .filter((m) => m.points.length || m.projections.length);

  const laneSnapshots = snaps.map((s) => ({
    at: s.computedAt.toISOString().slice(0, 10),
    beliefs: Object.fromEntries(
      Object.entries(s.beliefs as Record<string, unknown>).map(([id, v]) => [
        id,
        typeof v === "number" ? v : Number((v as { p?: number })?.p ?? 0),
      ]),
    ),
  }));

  const empty =
    !laneFacts.length &&
    !laneActions.length &&
    !laneMarkers.length &&
    !lanePosts.length;

  return (
    <>
      <div className="sub">
        <h3>History</h3>
        <span>
          facts, actions and markers on one axis, and a slider that replays what
          was believed on any day
        </span>
      </div>
      <div className="panel">
        {empty ? (
          <p className="cap">
            Nothing on the axis yet. A fact, a file or an adopted action puts
            the first mark on it.
          </p>
        ) : (
          <HistoryLanes
            facts={laneFacts}
            actions={laneActions}
            markers={laneMarkers}
            snapshots={laneSnapshots}
            posts={lanePosts}
          />
        )}
      </div>
    </>
  );
}
