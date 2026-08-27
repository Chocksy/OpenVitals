import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getDb, uploads, readings } from "@/db";
import { DeleteUpload, ReanalyzeUpload } from "@/components/client";
import { LabsHeader } from "@/components/labs-header";
import { StatusBadge } from "@/components/status-badge";
import { localPath, MIN_RAW_TEXT } from "@/lib/uploads";
import type { HealthStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

const badge: Record<string, HealthStatus> = {
  done: "normal",
  needs_review: "warning",
  extracting: "info",
  pending: "info",
  failed: "critical",
  deleted: "neutral",
};

const day = (d: Date | string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : "";

export default async function UploadsPage() {
  const userId = await requireUserId();
  const db = getDb();

  // Drizzle renders `uploads.id` unqualified, which a correlated subquery over
  // `readings` would resolve to `readings.id`. Spell the table out.
  const uploadId = sql`"uploads"."id"`;

  const rows = await db
    .select({
      id: uploads.id,
      fileName: uploads.fileName,
      status: uploads.status,
      error: uploads.error,
      createdAt: uploads.createdAt,
      source: uploads.source,
      pages: uploads.pages,
      blobPath: uploads.blobPath,
      readingsCount: uploads.readingsCount,
      deletedAt: uploads.deletedAt,
      textLength: sql<number>`length(coalesce(${uploads.rawText}, ''))`,
      count: sql<number>`(select count(*)::int from ${readings} r where r.upload_id = ${uploadId})`,
      // The two curator tags that mean "look at this row again".
      flagged: sql<number>`(select count(*)::int from ${readings} r
        where r.upload_id = ${uploadId}
          and (r.flags @> '["foreign_reading"]'::jsonb or r.flags @> '["implausible"]'::jsonb))`,
      firstDay: sql<
        string | null
      >`(select min(r.observed_at)::text from ${readings} r where r.upload_id = ${uploadId})`,
      lastDay: sql<
        string | null
      >`(select max(r.observed_at)::text from ${readings} r where r.upload_id = ${uploadId})`,
    })
    .from(uploads)
    .where(
      and(
        eq(uploads.userId, userId),
        // A deleted file stays visible for a day, then goes quiet.
        or(
          isNull(uploads.deletedAt),
          gt(uploads.deletedAt, sql`now() - interval '24 hours'`),
        ),
      ),
    )
    .orderBy(desc(uploads.createdAt));

  const detail = await db
    .select({
      uploadId: readings.uploadId,
      metricCode: readings.metricCode,
      value: readings.value,
      valueText: readings.valueText,
      unit: readings.unit,
      refLow: readings.refLow,
      refHigh: readings.refHigh,
      observedAt: readings.observedAt,
      flags: readings.flags,
    })
    .from(readings)
    .where(eq(readings.userId, userId))
    .orderBy(readings.metricCode);

  const byUpload = new Map<string, typeof detail>();
  for (const r of detail) {
    if (!r.uploadId) continue;
    byUpload.set(r.uploadId, [...(byUpload.get(r.uploadId) ?? []), r]);
  }

  const live = rows.filter((u) => u.status !== "deleted");
  const sourceless = live.filter(
    (u) => !localPath(u.blobPath) && u.textLength <= MIN_RAW_TEXT,
  ).length;
  const summary = [
    `${live.length} files`,
    `${live.reduce((n, u) => n + u.count, 0)} readings`,
    `${live.filter((u) => u.status === "needs_review").length} need review`,
    `${sourceless} without a source`,
  ].join(" · ");

  return (
    <div className="space-y-6">
      <LabsHeader
        active="uploads"
        subtitle="Lab PDFs you imported. Deleting one removes its readings."
      />

      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/export.csv"
          className="card inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600 hover:border-accent-200 hover:text-neutral-900"
        >
          <Download className="size-3.5" />
          Readings CSV
        </a>
        <a
          href="/api/export-daily.csv"
          className="card inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600 hover:border-accent-200 hover:text-neutral-900"
        >
          <Download className="size-3.5" />
          Daily log CSV
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="card border-dashed p-8 text-center font-body text-[13px] text-neutral-500">
          No uploads yet.
        </p>
      ) : (
        <>
          <p className="font-mono text-[11px] tracking-[0.02em] text-neutral-500">
            {summary}
          </p>
          <div className="card divide-y divide-neutral-100">
            {rows.map((u) => {
              const gone = u.status === "deleted";
              const hasFile = !!localPath(u.blobPath);
              const canRedo = hasFile || u.textLength > MIN_RAW_TEXT;
              const items = byUpload.get(u.id) ?? [];
              return (
                <div key={u.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/uploads/${u.id}`}
                        className="block truncate font-body text-[13px] font-medium hover:underline"
                      >
                        {u.fileName ?? "(no name)"}
                      </Link>
                      <p className="font-mono text-[10px] text-neutral-400">
                        {day(u.createdAt)}
                        {gone
                          ? ` · deleted, ${u.readingsCount ?? 0} readings removed`
                          : ` · ${u.count} readings`}
                        {u.flagged > 0 && ` · ${u.flagged} flagged`}
                        {u.firstDay &&
                          ` · ${u.firstDay}${u.lastDay !== u.firstDay ? `–${u.lastDay}` : ""}`}
                        {u.pages ? ` · ${u.pages} pages` : ""}
                      </p>
                    </div>
                    <StatusBadge
                      status="neutral"
                      label={u.source ?? "upload"}
                    />
                    <StatusBadge
                      status={badge[u.status ?? "pending"] ?? "neutral"}
                      label={u.status ?? "pending"}
                      className={
                        u.status === "extracting" ? "animate-pulse" : ""
                      }
                    />
                    {!gone && (
                      <>
                        <ReanalyzeUpload
                          id={u.id}
                          disabled={!canRedo}
                          title={
                            canRedo
                              ? undefined
                              : "original PDF not on this machine"
                          }
                        />
                        <DeleteUpload
                          id={u.id}
                          name={u.fileName ?? "this upload"}
                        />
                      </>
                    )}
                  </div>

                  {u.error && (
                    <p className="mt-1 font-mono text-[10px] text-[var(--color-health-critical)]">
                      {u.error}
                    </p>
                  )}

                  {items.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-500 hover:text-neutral-900">
                        Readings ({items.length})
                      </summary>
                      <div className="mt-2 divide-y divide-neutral-100 border-t border-neutral-100">
                        {items.map((r, i) => (
                          <div
                            key={i}
                            className="flex flex-wrap items-baseline gap-x-3 py-1 font-mono text-[11px]"
                          >
                            <span className="w-56 truncate text-neutral-700">
                              {r.metricCode}
                            </span>
                            <span className="w-24 text-right tabular-nums">
                              {r.value ?? r.valueText ?? "—"}
                            </span>
                            <span className="w-20 text-neutral-400">
                              {r.unit ?? ""}
                            </span>
                            <span className="w-28 text-neutral-400">
                              {r.refLow ?? "?"}–{r.refHigh ?? "?"}
                            </span>
                            <span className="w-24 text-neutral-400">
                              {r.observedAt}
                            </span>
                            <span className="text-[var(--color-health-warning)]">
                              {(r.flags ?? [])
                                .filter((f) => typeof f === "string")
                                .join(" ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
