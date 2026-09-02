import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { documentItems, genomeVariants, getDb, metrics, readings } from "@/db";
import { callGenome } from "@/lib/genome";
import { findUpload, localPath, MIN_RAW_TEXT } from "@/lib/uploads";
import { dayLabel, plural } from "@/lib/utils";
import { ChangeKind, DeleteUpload, ReanalyzeUpload } from "@/components/client";
import { DocumentItems } from "@/components/document-items";
import { GenomeTable } from "@/components/genome-table";
import { ReadingRows } from "@/components/reading-rows";
import { StateWord, type StateTone } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

/**
 * One upload, opened: `docs/mockups/v4/blood.html` section 05.
 *
 * What kind of change it was, the rows it produced, the genes it read, the
 * items it wants you to accept or reject, and the raw text it read them from.
 * Phase 30c: it absorbs `/uploads/[id]`, which is now a redirect.
 */
const TONE: Record<string, StateTone> = {
  done: "on",
  needs_review: "border",
  extracting: "none",
  pending: "none",
  failed: "off",
  deleted: "none",
};

const WORD: Record<string, string> = {
  done: "parsed",
  needs_review: "needs a check",
  extracting: "reading it now",
  pending: "waiting",
  failed: "could not read it",
  deleted: "deleted",
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

  const called = kind === "genome" ? callGenome(variants) : [];
  const moved = called.filter((r) => r.result).length;

  return (
    <div className="stackv gap-[var(--s21)]">
      <div>
        <Link className="asklink" href="/blood?tab=uploads">
          <ChevronLeft className="ic" aria-hidden="true" />
          Uploads
        </Link>
      </div>

      <div className="panel">
        <div className="drawer-head">
          <h3>
            {upload.fileName ?? "(no name)"}{" "}
            <span className="src">
              · {kind.toUpperCase()}
              {upload.createdAt
                ? ` · read ${dayLabel(upload.createdAt.toISOString().slice(0, 10), true)}`
                : ""}
              {upload.pages ? ` · ${upload.pages} pages` : ""}
            </span>
          </h3>
          <div className="rowh gap-[var(--s5)]">
            <StateWord tone={TONE[status] ?? "none"} dot>
              {WORD[status] ?? status}
            </StateWord>
            {status !== "deleted" && (
              <>
                <ReanalyzeUpload
                  id={upload.id}
                  disabled={!canRedo}
                  title={
                    canRedo ? undefined : "the original file is not on this machine"
                  }
                />
                <DeleteUpload
                  id={upload.id}
                  name={upload.fileName ?? "this upload"}
                />
              </>
            )}
          </div>
        </div>

        <div className="rowh mb-[var(--s13)]">
          <div className="field max-w-[240px]">
            <label htmlFor="kind">What kind of change</label>
            <ChangeKind id={upload.id} kind={kind} />
          </div>
          <div className="kpi">
            {kind === "genome" ? (
              <>
                <div>
                  <b>{variants.length}</b>
                  <span>variants read</span>
                </div>
                <div>
                  <b>{moved}</b>
                  <span>with a known effect</span>
                </div>
              </>
            ) : kind === "document" ? (
              <div>
                <b>{items.length}</b>
                <span>{items.length === 1 ? "item read" : "items read"}</span>
              </div>
            ) : (
              <div>
                <b>{rows.length}</b>
                <span>{rows.length === 1 ? "reading" : "readings"}</span>
              </div>
            )}
          </div>
        </div>

        {upload.docMeta && (
          <p className="t-meta">
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
        {upload.error && <p className="t-meta text-[var(--bad)]">{upload.error}</p>}

        {kind === "genome" ? (
          <>
            <div className="sub">
              <h3>Genome</h3>
              <span>
                {moved} of {called.length} catalog rows called from this file
              </span>
            </div>
            <GenomeTable results={called} />
            <p className="cap">
              A variant shifts a starting point; your numbers decide the rest.
              If a marker and a variant disagree, the marker wins, because it
              is what your body is doing today.
            </p>
          </>
        ) : kind === "document" ? (
          <>
            <div className="sub">
              <h3>Items to accept or reject</h3>
              <span>what the reader thinks it found, before it is written</span>
            </div>
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
          </>
        ) : (
          <>
            <div className="sub">
              <h3>Reading rows</h3>
              <span>editable before they are written</span>
            </div>
            <ReadingRows
              rows={rows.map((r) => ({
                ...r,
                flags: (r.flags ?? []).filter(
                  (f): f is string => typeof f === "string",
                ),
              }))}
              metrics={known}
            />
          </>
        )}

        {hasFile ? (
          <details className="disclose mt-[var(--s13)]">
            <summary>
              The file, as it came in
              <ChevronDown className="ic" aria-hidden="true" />
            </summary>
            <div className="inner">
              <iframe
                src={`/api/uploads/${upload.id}/file`}
                title={upload.fileName ?? "the file"}
                className="h-[70vh] w-full rounded-[var(--r-inner)] bg-[var(--surface-flat)]"
              />
            </div>
          </details>
        ) : (
          <details className="disclose mt-[var(--s13)]">
            <summary>
              Raw text, as read
              <ChevronDown className="ic" aria-hidden="true" />
            </summary>
            <div className="inner">
              <p className="cap m-0">
                The original file is not on this machine. This is the text kept
                from the import.
              </p>
              <pre className="m-0 max-h-[70vh] overflow-auto whitespace-pre-wrap font-mono text-[length:var(--type-xs)] text-[var(--ink-3)]">
                {upload.rawText || "(nothing was stored)"}
              </pre>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
