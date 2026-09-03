import { and, eq, ne } from "drizzle-orm";
import { getDb, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";
import { ensureImported } from "@/lib/import-legacy";
import { runCurator } from "@/lib/curator";
import { recordBeliefs } from "@/lib/ledger";
import { ledgerNow, recordUploadMove } from "@/lib/read-receipt";
import { generateReport } from "@/lib/report";
import { extOf, processUpload, sha256, writeUpload } from "@/lib/uploads";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const file = (await req.formData()).get("file");
  if (!(file instanceof File))
    return Response.json({ error: "no file" }, { status: 400 });

  await ensureImported();
  const db = getDb();
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = sha256(buffer);

  const [dupe] = await db
    .select({ id: uploads.id, fileName: uploads.fileName })
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
    return Response.json(
      {
        error: `already uploaded as ${dupe.fileName ?? "(no name)"}`,
        uploadId: dupe.id,
        fileName: dupe.fileName,
      },
      { status: 409 },
    );

  const [upload] = await db
    .insert(uploads)
    .values({
      userId,
      fileName: file.name,
      status: "pending",
      sha256: hash,
      source: "upload",
    })
    .returning();

  // The read receipt's "before": the ledger as it stands with this file not
  // yet read. Taken here, ahead of the parse, because it cannot be
  // reconstructed once the readings are in.
  const before = await ledgerNow(userId);

  try {
    const blobPath = await writeUpload(
      userId,
      upload!.id,
      buffer,
      extOf(file.name),
    );
    await db
      .update(uploads)
      .set({ status: "extracting", blobPath })
      .where(eq(uploads.id, upload!.id));

    const result = await processUpload(userId, upload!.id, buffer, file.name);

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

    // A lab sheet moves readings, so the curator runs. A genome file moves
    // facts, so only the beliefs are re-recorded. A document has moved nothing
    // yet: its items are proposed and accepting one is what writes.
    // The receipt is recorded inside the same continuation the curator runs
    // in, never beside it: a diff taken before the scorer has seen the new
    // readings would say "nothing moved" every time.
    if (result.kind === "lab")
      void runCurator(userId, "upload", { uploadId: upload!.id })
        .then(() => recordBeliefs(userId))
        .then(() => recordUploadMove(userId, upload!.id, before))
        .then(() =>
          generateReport(userId, "upload").catch((e) =>
            console.error("[plan] upload report failed:", e),
          ),
        );
    else if (result.kind === "genome")
      void recordBeliefs(userId)
        .then(() => recordUploadMove(userId, upload!.id, before))
        .catch((e) => console.error("[upload] genome beliefs failed:", e));
    // A document writes nothing to the ledger until its items are accepted, so
    // its receipt is honestly all zeros rather than absent.
    else void recordUploadMove(userId, upload!.id, before);

    return Response.json({
      uploadId: upload!.id,
      kind: result.kind,
      count: result.count,
      note: result.note,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[upload] failed:", e);
    await db
      .update(uploads)
      .set({ status: "failed", error })
      .where(eq(uploads.id, upload!.id));
    return Response.json({ uploadId: upload!.id, error }, { status: 500 });
  }
}
