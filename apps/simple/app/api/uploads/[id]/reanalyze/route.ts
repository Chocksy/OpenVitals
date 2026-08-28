import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { documentItems, genomeVariants, getDb, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";
import { runCurator } from "@/lib/curator";
import {
  dropReadings,
  findUpload,
  localPath,
  pickSource,
  processUpload,
  UPLOAD_KINDS,
  type UploadKind,
} from "@/lib/uploads";

export const maxDuration = 120;

/**
 * Read the file again if we still have it, else the text we kept from last
 * time. `kind` in the body overrides the sniff test, which is how the user
 * says "this PDF is a document, not a lab sheet".
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upload = await findUpload(userId, id);
  if (!upload) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const want = UPLOAD_KINDS.includes(body.kind as UploadKind)
    ? (body.kind as UploadKind)
    : undefined;

  const file = localPath(upload.blobPath);
  const source = pickSource(!!file, upload.rawText);
  if (!source)
    return Response.json(
      {
        error:
          "no source to re-analyze; the original file is not on this machine",
      },
      { status: 422 },
    );
  if (!file && (want ?? upload.kind) === "genome")
    return Response.json(
      { error: "a genome file can only be re-read from the file itself" },
      { status: 422 },
    );

  const db = getDb();
  await db
    .update(uploads)
    .set({ status: "extracting", error: null })
    .where(eq(uploads.id, id));

  try {
    // Everything the last run wrote for this upload goes first, so a re-read
    // never doubles up. Accepted document items are dropped with the rest:
    // what they wrote (readings, facts, evidence) stays, as the audit does.
    await dropReadings(userId, id);
    await db.delete(documentItems).where(eq(documentItems.uploadId, id));
    await db
      .delete(genomeVariants)
      .where(
        and(eq(genomeVariants.userId, userId), eq(genomeVariants.uploadId, id)),
      );

    const buffer = file
      ? await readFile(file)
      : Buffer.from(upload.rawText!, "utf8");
    const result = await processUpload(
      userId,
      id,
      buffer,
      upload.fileName ?? (file ? file : "document.txt"),
      want,
    );

    const [row] = await db
      .update(uploads)
      .set({
        status: "done",
        error: null,
        kind: result.kind,
        readingsCount: result.kind === "lab" ? result.count : 0,
        ...(file
          ? {
              rawText: result.text ?? upload.rawText,
              pages: result.pages ?? upload.pages,
            }
          : {}),
      })
      .where(eq(uploads.id, id))
      .returning();

    if (result.kind === "lab")
      void runCurator(userId, "upload", { uploadId: id }).catch((e) =>
        console.error("[reanalyze] curator failed:", e),
      );

    return Response.json({ ...row, count: result.count, note: result.note });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[reanalyze] failed:", e);
    await db
      .update(uploads)
      .set({ status: "failed", error })
      .where(eq(uploads.id, id));
    return Response.json({ error }, { status: 500 });
  }
}
