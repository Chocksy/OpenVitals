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
import type { ExtractedReading } from "./extract";
import { slugify } from "./extract";
import { canonicalCode } from "./merge-metrics";

/** Below this many characters the stored text is a scan artefact, not a report. */
export const MIN_RAW_TEXT = 200;

export const uploadDir = () => process.env.UPLOAD_DIR ?? "./data/uploads";

export const uploadPath = (userId: string, uploadId: string) =>
  join(uploadDir(), userId, `${uploadId}.pdf`);

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
): Promise<string> {
  const path = uploadPath(userId, uploadId);
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
