import { asc, desc, eq } from "drizzle-orm";
import {
  beliefSnapshots,
  getDb,
  habitLogs,
  lifeEvents,
  profileFactHistory,
  protocolItems,
  uploads,
} from "@/db";
import { requireUserId } from "@/lib/auth";
import { getMetricRows } from "@/lib/data";
import { projectionsFor } from "@/lib/projections";
import { Badge } from "@/components/ui-kit";
import {
  HistoryLanes,
  type HistoryMarker,
} from "@/components/history-lanes";

export const dynamic = "force-dynamic";

const TD = "px-3 py-1.5 font-mono tabular-nums";
const TH = "px-3 py-1.5 text-left font-bold";

const KIND_BADGE: Record<string, "secondary" | "info" | "normal" | "warning"> =
  {
    fact: "info",
    corrected: "warning",
    event: "secondary",
    upload: "secondary",
    action: "normal",
  };

const text = (v: unknown) =>
  Array.isArray(v) ? v.join(", ") : String(v ?? "");

/**
 * One axis for everything this person ever told us: facts and how they moved,
 * the life events that give an old blood draw its context, the files, and the
 * actions they took on.
 *
 * Principle 4: every input is disputable and versioned. This is where the
 * versions live, so "I was wrong" is a thing you can see afterwards and not a
 * silent overwrite.
 */
export default async function HistoryPage() {
  const userId = await requireUserId();
  const db = getDb();
  const [facts, events, files, actions, logs, snaps, metrics, made] =
    await Promise.all([
    db
      .select()
      .from(profileFactHistory)
      .where(eq(profileFactHistory.userId, userId))
      .orderBy(asc(profileFactHistory.validFrom)),
    db
      .select()
      .from(lifeEvents)
      .where(eq(lifeEvents.userId, userId))
      .orderBy(asc(lifeEvents.startedAt)),
    db
      .select()
      .from(uploads)
      .where(eq(uploads.userId, userId))
      .orderBy(desc(uploads.createdAt))
      .limit(100),
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
  ]);

  /* ── the three lanes ────────────────────────────────────────────────── */

  const laneFacts = facts.map((f) => ({
    key: f.key,
    value: text(f.value),
    validFrom: f.validFrom,
    validTo: f.validTo,
    changeKind: f.changeKind,
    source: f.source,
    note: f.note,
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
        points: (m?.points ?? []).map((p) => ({ date: p.date, value: p.value })),
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

  const rows: {
    date: string;
    kind: string;
    what: string;
    detail: string;
  }[] = [
    ...facts.map((f) => ({
      date: f.validFrom,
      kind: f.changeKind === "corrected" ? "corrected" : "fact",
      what: f.key.replace(/_/g, " "),
      detail:
        `${text(f.value)} · ${f.changeKind}` +
        (f.validTo ? ` until ${f.validTo}` : "") +
        ` · ${f.source}` +
        (f.note ? ` · ${f.note}` : ""),
    })),
    ...events.map((e) => ({
      date: e.startedAt ?? e.createdAt?.toISOString().slice(0, 10) ?? "",
      kind: "event",
      what: e.kind,
      detail: e.text + (e.endedAt ? ` (to ${e.endedAt})` : ""),
    })),
    ...files.map((u) => ({
      date: u.createdAt?.toISOString().slice(0, 10) ?? "",
      kind: "upload",
      what: u.kind ?? "lab",
      detail: `${u.fileName ?? "file"} · ${u.status}${u.readingsCount ? ` · ${u.readingsCount} readings` : ""}`,
    })),
    ...actions.map((a) => ({
      date: a.createdAt?.toISOString().slice(0, 10) ?? "",
      kind: "action",
      what: a.active ? "adopted" : "dropped",
      detail: a.text,
    })),
  ]
    .filter((r) => r.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          History
        </h1>
        <p className="mt-1 max-w-2xl font-body text-[13px] text-neutral-500">
          Everything you ever told this app, on one axis, with the dates it held
          for. A fact that <em>changed</em> keeps its old period. A fact you
          were wrong about is crossed out and replaced for the whole period.
        </p>
      </div>

      {(laneFacts.length > 0 ||
        laneActions.length > 0 ||
        laneMarkers.length > 0) && (
        <section className="card p-4">
          <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            the path · facts, actions, markers
          </h2>
          <HistoryLanes
            facts={laneFacts}
            actions={laneActions}
            markers={laneMarkers}
            snapshots={laneSnapshots}
          />
        </section>
      )}

      <section className="card p-4">
        <table className="w-full font-body text-[12px]">
          <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            <tr className="border-b border-neutral-200">
              <th className={TH}>from</th>
              <th className={TH}>kind</th>
              <th className={TH}>what</th>
              <th className={TH}>detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && (
              <tr>
                <td className={TD} colSpan={4}>
                  nothing yet — answer a question or upload a file
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.kind}-${i}`}>
                <td className={TD}>{r.date}</td>
                <td className={TD}>
                  <Badge variant={KIND_BADGE[r.kind] ?? "secondary"}>
                    {r.kind}
                  </Badge>
                </td>
                <td className="px-3 py-1.5">{r.what}</td>
                <td
                  className={
                    r.kind === "corrected"
                      ? "px-3 py-1.5 text-[11px] text-neutral-400 line-through"
                      : "px-3 py-1.5 text-[11px] text-neutral-500"
                  }
                >
                  {r.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
