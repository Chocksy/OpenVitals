import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getDb, metrics, readings } from "@/db";
import { findUpload, localPath, MIN_RAW_TEXT } from "@/lib/uploads";
import { DeleteUpload, ReanalyzeUpload } from "@/components/client";
import { ReadingRows } from "@/components/reading-rows";
import { StatusBadge } from "@/components/status-badge";
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

export default async function UploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const upload = await findUpload(userId, id);
  if (!upload) notFound();

  const db = getDb();
  const [rows, known] = await Promise.all([
    db
      .select({
        id: readings.id,
        metricCode: readings.metricCode,
        metricName: metrics.name,
        value: readings.value,
        valueText: readings.valueText,
        unit: readings.unit,
        refLow: readings.refLow,
        refHigh: readings.refHigh,
        observedAt: readings.observedAt,
        flags: readings.flags,
      })
      .from(readings)
      .innerJoin(metrics, eq(metrics.code, readings.metricCode))
      .where(eq(readings.uploadId, id))
      .orderBy(asc(metrics.name)),
    db
      .select({ code: metrics.code, name: metrics.name })
      .from(metrics)
      .orderBy(asc(metrics.name)),
  ]);

  const hasFile = !!localPath(upload.blobPath);
  const canRedo = hasFile || (upload.rawText?.length ?? 0) > MIN_RAW_TEXT;
  const status = upload.status ?? "pending";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/uploads"
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-400 hover:text-neutral-600"
        >
          <ChevronLeft className="size-3" />
          Uploads
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate font-display text-[28px] font-medium tracking-[-0.03em]">
            {upload.fileName ?? "(no name)"}
          </h1>
          <StatusBadge status="neutral" label={upload.source ?? "upload"} />
          <StatusBadge
            status={badge[status] ?? "neutral"}
            label={status}
            className={status === "extracting" ? "animate-pulse" : ""}
          />
          {status !== "deleted" && (
            <>
              <ReanalyzeUpload
                id={upload.id}
                disabled={!canRedo}
                title={canRedo ? undefined : "original PDF not on this machine"}
              />
              <DeleteUpload
                id={upload.id}
                name={upload.fileName ?? "this upload"}
              />
            </>
          )}
        </div>
        <p className="mt-1 font-mono text-[11px] text-neutral-400">
          {upload.createdAt?.toISOString().slice(0, 10)} · {rows.length}{" "}
          readings
          {upload.pages ? ` · ${upload.pages} pages` : ""}
        </p>
        {upload.error && (
          <p className="mt-1 font-mono text-[11px] text-[var(--color-health-critical)]">
            {upload.error}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <ReadingRows
          rows={rows.map((r) => ({
            ...r,
            flags: (r.flags ?? []).filter(
              (f): f is string => typeof f === "string",
            ),
          }))}
          metrics={known}
        />

        <div className="space-y-2">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            {hasFile ? "The file" : "What we read"}
          </h2>
          {hasFile ? (
            <iframe
              src={`/api/uploads/${upload.id}/file`}
              title={upload.fileName ?? "PDF"}
              className="h-[70vh] w-full border border-neutral-200 bg-neutral-50"
            />
          ) : (
            <>
              <p className="font-body text-[12px] text-neutral-500">
                The original PDF is not on this machine. This is the text kept
                from the import.
              </p>
              <pre className="card max-h-[70vh] overflow-auto whitespace-pre-wrap p-3 font-mono text-[10px] leading-[1.5] text-neutral-600">
                {upload.rawText || "(nothing was stored)"}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
