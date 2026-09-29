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
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  documentItems,
  getDb,
  metrics,
  readings,
  uploads,
  type DocMeta,
  type Metric,
  type ReadingFlag,
} from "@/db";
import { readDocumentText, saveDocument } from "./documents";
import type { ExtractedReading } from "./extract";
import {
  extractFromPdf,
  extractFromText,
  NEEDS_PASSWORD,
  slugify,
} from "./extract";
import { looksLikeGenome, saveGenome } from "./genome";
import { sameValue } from "./data";
import { canonicalCode } from "./merge-metrics";
import { convert } from "./units";

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

type Db = ReturnType<typeof getDb>;
/** A transaction handle: the same query API as `getDb()`. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** One row a lab sheet gives, ready for `readings`. */
export interface NewRow {
  metricCode: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  observedAt: string;
  flags: ReadingFlag[] | null;
}

/** A stored row, as far as the duplicate and supersede rules look at it. */
export interface StoredRow {
  id: string;
  uploadId: string | null;
  metricCode: string;
  observedAt: string;
  value: number | null;
  valueText?: string | null;
  refLow?: number | null;
  refHigh?: number | null;
  flags?: ReadingFlag[] | null;
}

type Keyed = Pick<NewRow, "metricCode" | "observedAt" | "value"> & {
  valueText?: string | null;
};

/** Same metric, same day, same number. A row with no number keys on its text. */
export const rowKey = (r: Keyed) =>
  `${r.metricCode}|${r.observedAt}|${r.value ?? r.valueText ?? ""}`;
/** Same metric, same day, whatever the number. */
export const dayKey = (r: Pick<NewRow, "metricCode" | "observedAt">) =>
  `${r.metricCode}|${r.observedAt}`;

/** Same metric, same day, same number within `sameValue`'s tolerance. */
const sameDraw = (a: Keyed, b: Keyed) =>
  a.metricCode === b.metricCode &&
  a.observedAt === b.observedAt &&
  (a.value != null || b.value != null
    ? sameValue(a.value, b.value)
    : (a.valueText ?? "") === (b.valueText ?? ""));

const hasRange = (r: { refLow?: number | null; refHigh?: number | null }) =>
  r.refLow != null || r.refHigh != null;

export const isAntecedent = (flags: ReadingFlag[] | null | undefined) =>
  (flags ?? []).includes("antecedent");

/**
 * Pure: an extracted row and the antecedent it carries into `readings` rows.
 * The antecedent keeps the result's range: it is the same lab printing its
 * own earlier value, and a range-less row would never read as low.
 */
export function toRows(
  r: ExtractedReading,
  metricCode: string,
): { row: NewRow; antecedent: NewRow | null } {
  const row: NewRow = {
    metricCode,
    value: r.value,
    valueText: r.valueText,
    unit: r.unit,
    refLow: r.refLow,
    refHigh: r.refHigh,
    observedAt: r.observedAt,
    flags: r.censored ? [{ censored: r.censored }] : null,
  };
  const a = r.antecedent;
  // The model is told to write the antecedent in the result's unit; when it
  // did not, convert, and drop a value no factor explains.
  const value = a
    ? a.unit && r.unit
      ? convert(a.value, a.unit, r.unit, metricCode)
      : a.value
    : null;
  return {
    row,
    antecedent:
      a && value != null
        ? {
            ...row,
            value,
            valueText: String(a.value),
            observedAt: a.date,
            // `raw_confirmed` keeps raw-verify off it: the sheet's line for
            // this test holds today's value, and would "correct" this one.
            flags: ["antecedent", "raw_confirmed"],
          }
        : null,
  };
}

/** Days either side of an antecedent where the same value means the same draw. */
export const ANTECEDENT_NEAR_DAYS = 3;

const dayNo = (d: string) =>
  Math.round(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/** The days an antecedent's twin could sit on, for the stored-row query. */
export const nearDays = (d: string): string[] =>
  Array.from({ length: 2 * ANTECEDENT_NEAR_DAYS + 1 }, (_, i) =>
    new Date((dayNo(d) + i - ANTECEDENT_NEAR_DAYS) * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );

/**
 * Pure: what to write, given what is already stored for these metrics.
 *  - a sheet's own row replaces an antecedent row of the same test and day;
 *  - a row identical on (metric, day, value) to a stored one, or to one
 *    earlier in the same batch, is skipped (values within 1e-4, phase 42E);
 *    when the stored twin has no lab range and this one does, the range is
 *    copied onto it (`ranges`) rather than lost;
 *  - an antecedent lands only on a (metric, day) nothing else holds, and not
 *    when the same metric with the same value sits within `ANTECEDENT_NEAR_DAYS`
 *    of it: a sheet that prints the previous value dated by report day instead
 *    of collection day (zinc 77 on 10.12 beside the real 77 on 09.12).
 */
export function planInsert(
  fresh: NewRow[],
  antecedents: NewRow[],
  existing: StoredRow[],
): {
  insert: NewRow[];
  replace: string[];
  skipped: number;
  ranges: { id: string; refLow: number | null; refHigh: number | null }[];
} {
  const replace = new Set<string>();
  const ranges: {
    id: string;
    refLow: number | null;
    refHigh: number | null;
  }[] = [];
  const byDay = new Map<string, StoredRow[]>();
  for (const e of existing)
    byDay.set(dayKey(e), [...(byDay.get(dayKey(e)) ?? []), e]);

  const insert: NewRow[] = [];
  const taken = new Set<string>();
  let skipped = 0;
  for (const r of fresh) {
    const same = byDay.get(dayKey(r)) ?? [];
    for (const e of same) if (isAntecedent(e.flags)) replace.add(e.id);
    const twin = same.find((e) => !replace.has(e.id) && sameDraw(e, r));
    const again = insert.findIndex((w) => sameDraw(w, r));
    if (twin || again >= 0) {
      skipped++;
      if (
        twin &&
        !hasRange(twin) &&
        hasRange(r) &&
        !ranges.some((x) => x.id === twin.id)
      )
        ranges.push({ id: twin.id, refLow: r.refLow, refHigh: r.refHigh });
      if (again >= 0 && !hasRange(insert[again]!) && hasRange(r))
        insert[again] = {
          ...insert[again]!,
          refLow: r.refLow,
          refHigh: r.refHigh,
        };
      continue;
    }
    taken.add(dayKey(r));
    insert.push(r);
  }
  const near = (a: NewRow, r: Keyed) =>
    r.metricCode === a.metricCode &&
    r.value != null &&
    sameValue(r.value, a.value) &&
    Math.abs(dayNo(r.observedAt) - dayNo(a.observedAt)) <= ANTECEDENT_NEAR_DAYS;
  for (const a of antecedents) {
    const held = (byDay.get(dayKey(a)) ?? []).some((e) => !replace.has(e.id));
    const twin =
      existing.some((e) => !replace.has(e.id) && near(a, e)) ||
      insert.some((r) => near(a, r));
    if (held || twin || taken.has(dayKey(a))) {
      skipped++;
      continue;
    }
    taken.add(dayKey(a));
    insert.push(a);
  }
  return { insert, replace: [...replace], skipped, ranges };
}

/** Share of an older upload's rows the newer one must repeat to be the same report. */
export const SAME_REPORT_SHARE = 0.8;

/**
 * Pure: is `older` an earlier upload of the report `newer` came from? Either
 * the lab's report number is on it (in its meta, or in its text for a legacy
 * row that never had meta), or it is the same collection day and at least
 * 80 % of its rows that day come back identical.
 */
export function sameReport(
  older: {
    reportNo?: string | null;
    rawText?: string | null;
    rows: StoredRow[];
  },
  newer: { reportNo?: string; day?: string; rows: Keyed[] },
): boolean {
  const no = newer.reportNo;
  if (
    no &&
    no.length >= 6 &&
    /\d/.test(no) &&
    (older.reportNo === no || !!older.rawText?.includes(no))
  )
    return true;
  const mine = older.rows.filter(
    (r) => r.observedAt === newer.day && !isAntecedent(r.flags),
  );
  if (!newer.day || !mine.length) return false;
  const keys = new Set(newer.rows.map(rowKey));
  return (
    mine.filter((r) => keys.has(rowKey(r))).length / mine.length >=
    SAME_REPORT_SHARE
  );
}

/**
 * Pure: an older upload of the same report gives up every row the newer one
 * repeats (same test, same day), and hands over the rest, so a value only the
 * older file had is kept, now owned by the newer upload. A dropped row's lab
 * range goes onto the newer row that has none (`ranges`, by index into
 * `newer`), so a re-upload never loses the range. Phase 42E.
 */
export function planSupersede(
  older: StoredRow[],
  newer: Pick<NewRow, "metricCode" | "observedAt" | "refLow" | "refHigh">[],
): {
  drop: string[];
  move: string[];
  ranges: { index: number; refLow: number | null; refHigh: number | null }[];
} {
  const days = new Set(newer.map(dayKey));
  const drop: string[] = [];
  const move: string[] = [];
  const ranges: {
    index: number;
    refLow: number | null;
    refHigh: number | null;
  }[] = [];
  for (const r of older) {
    if (!days.has(dayKey(r))) {
      move.push(r.id);
      continue;
    }
    drop.push(r.id);
    const index = newer.findIndex(
      (n, i) =>
        dayKey(n) === dayKey(r) &&
        !hasRange(n) &&
        !ranges.some((x) => x.index === i),
    );
    if (index >= 0 && hasRange(r))
      ranges.push({
        index,
        refLow: r.refLow ?? null,
        refHigh: r.refHigh ?? null,
      });
  }
  return { drop, move, ranges };
}

/** What the sheet said about itself, kept in `uploads.doc_meta`. */
export interface LabMeta {
  collectionDate?: string;
  labName?: string;
  reportNo?: string;
  pending?: string[];
}

export interface LabSave {
  /** rows this upload owns after the save */
  count: number;
  inserted: number;
  antecedents: number;
  skipped: number;
  superseded: string[];
}

/** Drop rows by id, and the curator questions that point at them. */
async function dropIds(db: Db | Tx, userId: string, ids: string[]) {
  if (!ids.length) return;
  await db.execute(
    sql`delete from review_items where user_id = ${userId}
        and subject->>'readingId' in (${sql.join(ids, sql`, `)})`,
  );
  await db.delete(readings).where(inArray(readings.id, ids));
}

/**
 * Extracted rows → `readings`, minting a metric for an analyte the catalog has
 * never seen (category `other`, which is what the curator's metric-identity
 * step reads, so it can merge the new code later).
 *
 * One transaction: with `replace`, the upload's previous rows go first (the
 * re-analyze path, after its extraction already succeeded); an earlier upload
 * of the same report is superseded; then the new rows land under the
 * duplicate and antecedent rules of `planInsert`.
 */
export async function saveReadings(
  userId: string,
  uploadId: string,
  extracted: ExtractedReading[],
  known: Metric[],
  meta: LabMeta = {},
  { replace = false }: { replace?: boolean } = {},
): Promise<LabSave> {
  const db = getDb();
  const codes = new Set(known.map((m) => m.code));
  const fresh: NewRow[] = [];
  const antecedents: NewRow[] = [];
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
    const { row, antecedent } = toRows(r, code);
    fresh.push(row);
    if (antecedent) antecedents.push(antecedent);
  }

  return db.transaction(async (tx) => {
    // Phase 42E: two saves for one person at once each saw the other's rows
    // missing and both wrote them. One save per person at a time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    if (replace) {
      await dropReadings(userId, uploadId, tx);
      await tx
        .delete(documentItems)
        .where(eq(documentItems.uploadId, uploadId));
    }

    // An earlier upload of this same report: same day, or same report number.
    const day = meta.collectionDate;
    const candidates = await tx
      .select({
        id: uploads.id,
        docMeta: uploads.docMeta,
        rawText: uploads.rawText,
      })
      .from(uploads)
      .where(
        and(
          eq(uploads.userId, userId),
          ne(uploads.id, uploadId),
          ne(uploads.status, "deleted"),
          sql`${uploads.docMeta}->>'supersededBy' is null`,
          sql`(${uploads.id} in (select upload_id from readings
                 where user_id = ${userId} and observed_at = ${day ?? null}::date)
               or ${uploads.docMeta}->>'reportNo' = ${meta.reportNo ?? null}
               or (${meta.reportNo ?? null}::text is not null
                   and ${uploads.rawText} like '%' || ${meta.reportNo ?? null}::text || '%'))`,
        ),
      );
    const superseded: string[] = [];
    for (const c of candidates) {
      const rows = await tx
        .select()
        .from(readings)
        .where(and(eq(readings.userId, userId), eq(readings.uploadId, c.id)));
      if (
        !sameReport(
          { reportNo: c.docMeta?.reportNo, rawText: c.rawText, rows },
          { reportNo: meta.reportNo, day, rows: fresh },
        )
      )
        continue;
      const { drop, move, ranges } = planSupersede(rows, fresh);
      for (const { index, refLow, refHigh } of ranges)
        fresh[index] = { ...fresh[index]!, refLow, refHigh };
      await dropIds(tx, userId, drop);
      if (move.length)
        await tx
          .update(readings)
          .set({ uploadId })
          .where(inArray(readings.id, move));
      await tx
        .update(uploads)
        .set({
          docMeta: {
            ...(c.docMeta ?? { docType: "lab" }),
            supersededBy: uploadId,
          },
          readingsCount: 0,
        })
        .where(eq(uploads.id, c.id));
      superseded.push(c.id);
    }

    const all = [...fresh, ...antecedents];
    const existing = all.length
      ? await tx
          .select({
            id: readings.id,
            uploadId: readings.uploadId,
            metricCode: readings.metricCode,
            observedAt: readings.observedAt,
            value: readings.value,
            valueText: readings.valueText,
            refLow: readings.refLow,
            refHigh: readings.refHigh,
            flags: readings.flags,
          })
          .from(readings)
          .where(
            and(
              eq(readings.userId, userId),
              isNull(readings.source),
              inArray(readings.metricCode, [
                ...new Set(all.map((r) => r.metricCode)),
              ]),
              inArray(readings.observedAt, [
                ...new Set([
                  ...fresh.map((r) => r.observedAt),
                  ...antecedents.flatMap((r) => nearDays(r.observedAt)),
                ]),
              ]),
            ),
          )
      : [];
    const plan = planInsert(fresh, antecedents, existing);
    await dropIds(tx, userId, plan.replace);
    for (const { id, refLow, refHigh } of plan.ranges)
      await tx
        .update(readings)
        .set({ refLow, refHigh })
        .where(eq(readings.id, id));
    if (plan.insert.length)
      await tx
        .insert(readings)
        .values(plan.insert.map((r) => ({ ...r, userId, uploadId })));

    const docMeta: DocMeta = {
      docType: "lab",
      ...(day ? { date: day } : {}),
      ...(meta.labName ? { institution: meta.labName } : {}),
      ...(meta.reportNo ? { reportNo: meta.reportNo } : {}),
      ...(meta.pending?.length ? { pending: meta.pending } : {}),
    };
    await tx.update(uploads).set({ docMeta }).where(eq(uploads.id, uploadId));

    const [{ n }] = (await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(readings)
      .where(eq(readings.uploadId, uploadId))) as [{ n: number }];
    return {
      count: n,
      inserted: plan.insert.filter((r) => !isAntecedent(r.flags)).length,
      antecedents: plan.insert.filter((r) => isAntecedent(r.flags)).length,
      skipped: plan.skipped,
      superseded,
    };
  });
}

/** Drop an upload's readings and the curator questions that point at them. */
export async function dropReadings(
  userId: string,
  uploadId: string,
  db: Db | Tx = getDb(),
): Promise<number> {
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
  if (status === "failed" || status === "needs_password") return "failed";
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

export interface ProcessOptions {
  /** For an encrypted PDF; never stored. */
  password?: string;
  /**
   * Re-analyze: whatever this upload wrote last time is replaced, inside the
   * save's own transaction, and only once the new read has succeeded.
   */
  replace?: boolean;
}

/**
 * One file into whichever of the three pipelines it belongs to. `want` is the
 * kind the user chose on the upload page; without it the sniff test decides.
 *
 * A lab read that fails (cut off, unparseable, OCR error) throws, so the
 * upload is `failed` with the reason; it never falls through to the document
 * path. Only a file the model calls "not a lab sheet" (or one with no result
 * and nothing pending) is read as a document. An encrypted PDF throws
 * `NEEDS_PASSWORD` before any OCR call.
 */
export async function processUpload(
  userId: string,
  uploadId: string,
  buffer: Buffer,
  fileName: string,
  want?: UploadKind,
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  const db = getDb();
  let kind = want ?? detectKind(fileName, buffer);

  if (kind === "genome") {
    const text = buffer.toString("utf8");
    const { variants, facts } = await saveGenome(userId, uploadId, text);
    if (!variants && !want) throw new Error("no catalog rsids in this file");
    if (opts.replace)
      await db.transaction(async (tx) => {
        await dropReadings(userId, uploadId, tx);
        await tx
          .delete(documentItems)
          .where(eq(documentItems.uploadId, uploadId));
      });
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
      : await extractFromPdf(buffer, known, opts.password);
    if (result.error) throw new Error(result.error);
    const notLab =
      result.notLab || (!result.readings.length && !result.pending?.length);
    if (!notLab || want) {
      const saved = await saveReadings(
        userId,
        uploadId,
        result.readings,
        known,
        result,
        { replace: opts.replace },
      );
      const bits = [
        `${saved.inserted} readings`,
        saved.antecedents && `${saved.antecedents} earlier values`,
        saved.skipped && `${saved.skipped} already stored`,
        saved.superseded.length &&
          `replaces ${saved.superseded.length} earlier upload`,
        result.pending?.length && `${result.pending.length} still pending`,
      ].filter(Boolean);
      return {
        kind,
        count: saved.count,
        text: result.text ?? null,
        pages: result.pages ?? null,
        note: bits.join(", "),
      };
    }
    // The model says this is not a lab sheet: read it as a document instead,
    // and reuse the text the PDF already gave up so nothing is read twice.
    kind = "document";
    if (result.text)
      carried = { text: result.text, pages: result.pages ?? null };
  }

  const { text, pages } =
    carried ?? (await readDocumentText(buffer, fileName, opts.password));
  const { items } = await saveDocument(userId, uploadId, text, {
    replace: opts.replace,
  });
  return { kind, count: items, text, pages, note: `${items} proposed items` };
}

/** The status an upload gets when `processUpload` threw `error`. */
export const failedStatus = (error: string) =>
  error === NEEDS_PASSWORD ? "needs_password" : "failed";

/** The words the upload row keeps beside that status. */
export const failedError = (error: string) =>
  error === NEEDS_PASSWORD
    ? "this PDF is password protected: re-analyze it with the password"
    : error;
