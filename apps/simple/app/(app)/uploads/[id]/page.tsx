import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { documentItems, genomeVariants, getDb, metrics, readings } from "@/db";
import { callGenome } from "@/lib/genome";
import { findUpload, localPath, MIN_RAW_TEXT } from "@/lib/uploads";
import {
  ChangeKind,
  DeleteUpload,
  ReanalyzeUpload,
} from "@/components/client";
import { DocumentItems } from "@/components/document-items";
import { GenomeTable } from "@/components/genome-table";
import { ReadingRows } from "@/components/reading-rows";
import { StateWord, type StateTone } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

const tone: Record<string, StateTone> = {
  done: "on",
  needs_review: "border",
  extracting: "none",
  pending: "none",
  failed: "off",
  deleted: "none",
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
  const kind = upload.kind ?? "lab";

  const variants =
    kind === "genome"
      ? await db
          .select()
          .from(genomeVariants)
          .where(
            and(
              eq(genomeVariants.userId, userId),
              eq(genomeVariants.uploadId, id),
            ),
          )
      : [];
  const items =
    kind === "document"
      ? await db
          .select()
          .from(documentItems)
          .where(eq(documentItems.uploadId, id))
          .orderBy(asc(documentItems.createdAt))
      : [];

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
          <StateWord dot>{upload.source ?? "upload"}</StateWord>
          <StateWord dot>{kind}</StateWord>
          <StateWord
            tone={tone[status]}
            dot
            className={status === "extracting" ? "animate-pulse" : ""}
          >
            {status}
          </StateWord>
          {status !== "deleted" && (
            <>
              <ChangeKind id={upload.id} kind={kind} />
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
          {upload.createdAt?.toISOString().slice(0, 10)}
          {kind === "genome"
            ? ` · ${variants.length} catalog variants`
            : kind === "document"
              ? ` · ${items.length} items read`
              : ` · ${rows.length} readings`}
          {upload.pages ? ` · ${upload.pages} pages` : ""}
        </p>
        {upload.docMeta && (
          <p className="mt-1 font-mono text-[11px] text-neutral-500">
            {[
              upload.docMeta.docType,
              upload.docMeta.date,
              upload.docMeta.institution,
              upload.docMeta.specialty,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {upload.error && (
          <p className="mt-1 font-mono text-[11px] text-[var(--color-health-critical)]">
            {upload.error}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        {kind === "genome" ? (
          <GenomeTable results={callGenome(variants)} />
        ) : kind === "document" ? (
          <DocumentItems
            uploadId={upload.id}
            items={items.map((i) => ({
              id: i.id,
              kind: i.kind,
              payload: i.payload,
              excerpt: i.excerpt,
              status: i.status,
            }))}
          />
        ) : (
        <ReadingRows
          rows={rows.map((r) => ({
            ...r,
            flags: (r.flags ?? []).filter(
              (f): f is string => typeof f === "string",
            ),
          }))}
          metrics={known}
        />
        )}

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
