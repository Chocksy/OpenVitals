/**
 * Everything the three upload routes share: where the PDF lives on disk, which
 * source a re-analyze can use, and turning extracted rows into `readings`.
 *
 * ponytail: plain `node:fs`, no storage abstraction. The file is a file.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { getDb, metrics, readings, uploads, type Metric } from "@/db";
import { readDocumentText, saveDocument } from "./documents";
import type { ExtractedReading } from "./extract";
import { extractFromPdf, extractFromText, slugify } from "./extract";
import { looksLikeGenome, saveGenome } from "./genome";
import { canonicalCode } from "./merge-metrics";

/** Below this many characters the stored text is a scan artefact, not a report. */
export const MIN_RAW_TEXT = 200;

export const uploadDir = () => process.env.UPLOAD_DIR ?? "./data/uploads";

/** `report.PDF` -> `pdf`. Anything without one is treated as a PDF. */
export const extOf = (fileName: string | null | undefined) =>
  (fileName?.match(/\.([a-z0-9]+)$/i)?.[1] ?? "pdf").toLowerCase();

export const uploadPath = (userId: string, uploadId: string, ext = "pdf") =>
  join(uploadDir(), userId, `${uploadId}.${ext}`);

export const sha256 = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");

/** The stored file, if this machine has it. Legacy `file:///data/blobs/...` rows do not. */
export function localPath(blobPath: string | null | undefined): string | null {
  if (!blobPath) return null;
  const path = blobPath.replace(/^file:\/\//, "");
  return existsSync(path) ? path : null;
}

/** Pure: what a re-analyze can read. `null` means "nothing left on this machine". */
export function pickSource(
  hasFile: boolean,
  rawText: string | null | undefined,
): "file" | "text" | null {
  if (hasFile) return "file";
  return (rawText?.trim().length ?? 0) > MIN_RAW_TEXT ? "text" : null;
}

export async function writeUpload(
  userId: string,
  uploadId: string,
  buffer: Buffer,
  ext = "pdf",
): Promise<string> {
  const path = uploadPath(userId, uploadId, ext);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  return path;
}

/**
 * Extracted rows → `readings`, minting a metric for an analyte the catalog has
 * never seen. Returns how many rows landed.
 */
export async function saveReadings(
  userId: string,
  uploadId: string,
  extracted: ExtractedReading[],
  known: Metric[],
): Promise<number> {
  const db = getDb();
  const codes = new Set(known.map((m) => m.code));
  const values = [];
  for (const r of extracted) {
    const suggested = r.code ? canonicalCode(r.code, r.analyte) : null;
    let code = suggested && codes.has(suggested) ? suggested : null;
    if (!code) {
      code = canonicalCode(slugify(r.analyte), r.analyte);
      if (!codes.has(code)) {
        await db
          .insert(metrics)
          .values({
            code,
            name: r.analyte || code,
            category: "other",
            unit: r.unit,
          })
          .onConflictDoNothing();
        codes.add(code);
      }
    }
    values.push({
      userId,
      uploadId,
      metricCode: code,
      value: r.value,
      valueText: r.valueText,
      unit: r.unit,
      refLow: r.refLow,
      refHigh: r.refHigh,
      observedAt: r.observedAt,
    });
  }
  if (values.length) await db.insert(readings).values(values);
  return values.length;
}

/** Drop an upload's readings and the curator questions that point at them. */
export async function dropReadings(
  userId: string,
  uploadId: string,
): Promise<number> {
  const db = getDb();
  await db.execute(
    sql`delete from review_items where user_id = ${userId}
        and subject->>'readingId' in
            (select id::text from readings where upload_id = ${uploadId})`,
  );
  const gone = await db
    .delete(readings)
    .where(and(eq(readings.userId, userId), eq(readings.uploadId, uploadId)))
    .returning({ id: readings.id });
  return gone.length;
}

/** Best effort: the row survives even when the file is already gone. */
export async function removeUploadFile(blobPath: string | null | undefined) {
  const path = localPath(blobPath);
  if (path) await rm(path, { force: true });
}

/** One upload row, scoped to its owner. */
export async function findUpload(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, id), eq(uploads.userId, userId)))
    .limit(1);
  return row ?? null;
}

/* ── which kind of file is this, and what to do with it ───────────────── */

/**
 * What an upload's state actually is, in three words.
 *
 * Phase 31a item 8. `needs_review` was set by `lib/import-legacy.ts` on the
 * one legacy import and nothing has ever read it or cleared it, so an upload
 * with nothing wrong with it printed "needs a check" beside a check nobody
 * could do. An upload is parsed, or it failed, or it is still being read.
 * Pure, so `lib/uploads.test.ts` is the whole contract.
 */
export type UploadState = "parsed" | "failed" | "reading" | "deleted";

export function uploadState(
  status: string | null | undefined,
  deleted = false,
): UploadState {
  if (deleted || status === "deleted") return "deleted";
  if (status === "failed") return "failed";
  if (status === "extracting" || status === "pending") return "reading";
  return "parsed";
}

/** The state in the words the page speaks. */
export const UPLOAD_WORD: Record<UploadState, string> = {
  parsed: "parsed",
  failed: "could not read it",
  reading: "reading it now",
  deleted: "deleted",
};

/**
 * The one date an upload row prints: the day the blood was drawn when the file
 * carries one, else the day it was read. Never both — a row with two dates on
 * it made the reader guess which one the reading actually happened on.
 */
export function uploadDate(
  u: {
    firstDay?: string | null;
    lastDay?: string | null;
    createdAt?: string | null;
  },
  /** how the surface writes a day; the default keeps the stored form */
  fmt: (day: string) => string = (day) => day,
): string | null {
  if (u.firstDay)
    return u.lastDay && u.lastDay !== u.firstDay
      ? `${fmt(u.firstDay)} – ${fmt(u.lastDay)}`
      : fmt(u.firstDay);
  return u.createdAt ? fmt(u.createdAt) : null;
}

export type UploadKind = "lab" | "genome" | "document";

export const UPLOAD_KINDS: UploadKind[] = ["lab", "genome", "document"];

/** A PDF is a lab report when the extractor finds at least this many results. */
export const LAB_MIN_READINGS = 5;

const TEXT_EXTS = new Set(["txt", "csv", "tsv"]);

/** The sniff test, before a single model call. */
export function detectKind(fileName: string, buffer: Buffer): UploadKind {
  const ext = extOf(fileName);
  if (
    TEXT_EXTS.has(ext) &&
    looksLikeGenome(buffer.subarray(0, 4000).toString("utf8"))
  )
    return "genome";
  return ext === "pdf" ? "lab" : "document";
}

export interface ProcessResult {
  kind: UploadKind;
  /** readings for a lab, catalog variants for a genome, items for a document. */
  count: number;
  text: string | null;
  pages: number | null;
  note?: string;
}

/**
 * One file into whichever of the three pipelines it belongs to. `want` is the
 * kind the user chose on the upload page; without it the sniff test decides,
 * and a PDF that turns out not to be a lab sheet falls through to the document
 * path rather than failing.
 */
export async function processUpload(
  userId: string,
  uploadId: string,
  buffer: Buffer,
  fileName: string,
  want?: UploadKind,
): Promise<ProcessResult> {
  const db = getDb();
  let kind = want ?? detectKind(fileName, buffer);

  if (kind === "genome") {
    const text = buffer.toString("utf8");
    const { variants, facts } = await saveGenome(userId, uploadId, text);
    if (!variants && !want) throw new Error("no catalog rsids in this file");
    return {
      kind,
      count: variants,
      text: text.slice(0, 4000),
      pages: null,
      note: `${variants} catalog variants, ${facts} facts`,
    };
  }

  let carried: { text: string; pages: number | null } | null = null;
  if (kind === "lab") {
    const known = await db.select().from(metrics);
    // A photographed lab sheet has no text layer at all, so it is transcribed
    // first and then read by the same extractor a PDF goes through. Phase 23:
    // this is the door `/api/capture` opens for a photo of a results page.
    const shot = /\.pdf$/i.test(fileName)
      ? null
      : await readDocumentText(buffer, fileName);
    if (shot) carried = { text: shot.text, pages: shot.pages };
    const result = shot
      ? { ...(await extractFromText(shot.text, known)), pages: shot.pages ?? 0 }
      : await extractFromPdf(buffer, known);
    if (result.error && want) throw new Error(result.error);
    if (!result.error && (result.readings.length >= LAB_MIN_READINGS || want)) {
      const count = await saveReadings(
        userId,
        uploadId,
        result.readings,
        known,
      );
      return {
        kind,
        count,
        text: result.text ?? null,
        pages: result.pages ?? null,
      };
    }
    // Too few results to be a lab sheet: read it as a document instead, and
    // reuse the text the PDF already gave up so nothing is read twice.
    kind = "document";
    if (result.text)
      carried = { text: result.text, pages: result.pages ?? null };
  }

  const { text, pages } = carried ?? (await readDocumentText(buffer, fileName));
  const { items } = await saveDocument(userId, uploadId, text);
  return { kind, count: items, text, pages, note: `${items} proposed items` };
}
