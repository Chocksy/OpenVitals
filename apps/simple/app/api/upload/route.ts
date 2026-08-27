import { and, eq, ne } from "drizzle-orm";
import { getDb, metrics, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";
import { extractFromPdf } from "@/lib/extract";
import { ensureImported } from "@/lib/import-legacy";
import { runCurator } from "@/lib/curator";
import { generateReport } from "@/lib/report";
import { saveReadings, sha256, writeUpload } from "@/lib/uploads";

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

  // Same bytes, same user, still around: point at the row we already have.
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

  try {
    const blobPath = await writeUpload(userId, upload!.id, buffer);
    await db
      .update(uploads)
      .set({ status: "extracting", blobPath })
      .where(eq(uploads.id, upload!.id));

    const known = await db.select().from(metrics);
    const result = await extractFromPdf(buffer, known);
    if (result.error) throw new Error(result.error);
    const count = await saveReadings(
      userId,
      upload!.id,
      result.readings,
      known,
    );

    await db
      .update(uploads)
      .set({
        status: "done",
        rawText: result.text ?? null,
        pages: result.pages ?? null,
        readingsCount: count,
      })
      .where(eq(uploads.id, upload!.id));

    void runCurator(userId, "upload", { uploadId: upload!.id }).then(() =>
      generateReport(userId, "upload").catch((e) =>
        console.error("[plan] upload report failed:", e),
      ),
    );

    return Response.json({ uploadId: upload!.id, count });
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
