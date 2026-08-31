/**
 * `POST /api/capture` — the camera as an input.
 *
 * Two shapes, one route, the same split `/api/compose` uses:
 *  - `multipart/form-data` with a `photo`: one vision call, chips back, nothing
 *    written. A lab sheet or a medical letter is handed to the existing upload
 *    pipeline instead, which is the only thing allowed to read those.
 *  - `application/json` with `chips`: the person confirmed, so the chips are
 *    re-checked here and written through the writers that already exist.
 */
import { and, eq, ne } from "drizzle-orm";
import { getDb, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";
import {
  classifyPhoto,
  cleanCaptureChips,
  mealTotals,
  routeOf,
  toChips,
  writeCaptureChips,
} from "@/lib/capture";
import type { Chip } from "@/lib/compose";
import { localDay } from "@/lib/daily";
import { ensureImported } from "@/lib/import-legacy";
import { recordBeliefs } from "@/lib/ledger";
import { runCurator } from "@/lib/curator";
import { extOf, processUpload, sha256, writeUpload } from "@/lib/uploads";

export const maxDuration = 120;

/** Bigger than this is not a phone photo, it is a mistake. */
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const today = localDay();

  /* ── confirming ───────────────────────────────────────────────────────── */
  if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
    const body = (await req.json().catch(() => null)) as {
      chips?: Chip[];
      label?: string;
      at?: string;
    } | null;
    const chips = cleanCaptureChips(body?.chips ?? [], today);
    if (!chips.length)
      return Response.json({ error: "nothing to write" }, { status: 400 });
    const wrote = await writeCaptureChips(userId, chips, {
      label: body?.label,
      // Whatever the client sends — a clock or a whole instant — the entry
      // keeps the clock only.
      at: String(body?.at ?? "").match(/\d{2}:\d{2}/)?.[0] ?? null,
    });
    await recordBeliefs(userId).catch((e) =>
      console.error("[capture] beliefs failed:", e),
    );
    return Response.json({ ok: true, ...wrote, chips });
  }

  /* ── reading a photo ──────────────────────────────────────────────────── */
  const form = await req.formData();
  const file = form.get("photo");
  if (!(file instanceof File))
    return Response.json({ error: "no photo" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json({ error: "that photo is too big" }, { status: 413 });

  const caption = String(form.get("caption") ?? "").slice(0, 500);
  const takenAt = String(form.get("takenAt") ?? "") || null;
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "photo.jpg";

  try {
    const doc = await classifyPhoto(buffer, fileName, caption);
    const route = routeOf(doc.kind);

    // A lab sheet and a doctor's letter have a pipeline already. It reads the
    // photo properly, keeps the file, and files everything as proposed; this
    // route only decides which door to open.
    if (route) {
      const result = await handOver(userId, buffer, fileName, route);
      return Response.json({
        ok: true,
        kind: doc.kind,
        basis: doc.basis,
        chips: [],
        routedTo: result.kind,
        uploadId: result.uploadId,
        count: result.count,
        note: result.note,
      });
    }

    const chips = toChips(doc, { today, takenAt });
    const totals = doc.kind === "meal" ? mealTotals(doc) : null;
    return Response.json({
      ok: true,
      kind: doc.kind,
      basis: doc.basis,
      confidence: doc.confidence,
      label: totals?.label ?? doc.product?.name ?? null,
      chips,
      /** Every food number is a guess and says so, here and in the UI. */
      estimated: doc.kind === "meal",
      items: doc.items ?? [],
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[capture] failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}

/** The existing upload path, called exactly the way `/api/upload` calls it. */
async function handOver(
  userId: string,
  buffer: Buffer,
  fileName: string,
  want: "lab" | "document",
) {
  await ensureImported();
  const db = getDb();
  const hash = sha256(buffer);
  const [dupe] = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(
      and(
        eq(uploads.userId, userId),
        eq(uploads.sha256, hash),
        ne(uploads.status, "deleted"),
      ),
    )
    .limit(1);
  if (dupe)
    return {
      uploadId: dupe.id,
      kind: want,
      count: 0,
      note: "already uploaded",
    };

  const [upload] = await db
    .insert(uploads)
    .values({
      userId,
      fileName,
      status: "extracting",
      sha256: hash,
      source: "capture",
    })
    .returning();
  const blobPath = await writeUpload(
    userId,
    upload!.id,
    buffer,
    extOf(fileName),
  );
  await db.update(uploads).set({ blobPath }).where(eq(uploads.id, upload!.id));

  try {
    const result = await processUpload(
      userId,
      upload!.id,
      buffer,
      fileName,
      want,
    );
    await db
      .update(uploads)
      .set({
        status: "done",
        kind: result.kind,
        rawText: result.text ?? null,
        pages: result.pages ?? null,
        readingsCount: result.kind === "lab" ? result.count : 0,
      })
      .where(eq(uploads.id, upload!.id));
    if (result.kind === "lab")
      void runCurator(userId, "upload", { uploadId: upload!.id })
        .then(() => recordBeliefs(userId))
        .catch((e) => console.error("[capture] curator failed:", e));
    return {
      uploadId: upload!.id,
      kind: result.kind,
      count: result.count,
      note: result.note,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db
      .update(uploads)
      .set({ status: "failed", error })
      .where(eq(uploads.id, upload!.id));
    throw e;
  }
}
