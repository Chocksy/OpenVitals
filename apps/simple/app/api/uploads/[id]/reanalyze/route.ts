import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb, metrics, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";
import { runCurator } from "@/lib/curator";
import { extractFromPdf, extractFromText } from "@/lib/extract";
import {
  dropReadings,
  findUpload,
  localPath,
  pickSource,
  saveReadings,
} from "@/lib/uploads";

export const maxDuration = 120;

/** Read the file again if we still have it, else the text we kept from last time. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upload = await findUpload(userId, id);
  if (!upload) return Response.json({ error: "not found" }, { status: 404 });

  const file = localPath(upload.blobPath);
  const source = pickSource(!!file, upload.rawText);
  if (!source)
    return Response.json(
      {
        error:
          "no source to re-analyze; the original PDF is not on this machine",
      },
      { status: 422 },
    );

  const db = getDb();
  await db
    .update(uploads)
    .set({ status: "extracting", error: null })
    .where(eq(uploads.id, id));

  try {
    await dropReadings(userId, id);
    const known = await db.select().from(metrics);
    const result =
      source === "file"
        ? await extractFromPdf(await readFile(file!), known)
        : await extractFromText(upload.rawText!, known);
    if (result.error) throw new Error(result.error);

    const count = await saveReadings(userId, id, result.readings, known);
    const [row] = await db
      .update(uploads)
      .set({
        status: "done",
        error: null,
        readingsCount: count,
        // Only the file gives fresh text; a text re-run would just echo itself.
        ...(source === "file"
          ? {
              rawText: result.text ?? upload.rawText,
              pages: result.pages ?? upload.pages,
            }
          : {}),
      })
      .where(eq(uploads.id, id))
      .returning();

    void runCurator(userId, "upload", { uploadId: id }).catch((e) =>
      console.error("[reanalyze] curator failed:", e),
    );

    return Response.json(row);
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
