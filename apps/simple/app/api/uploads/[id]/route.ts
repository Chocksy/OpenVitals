import { eq } from "drizzle-orm";
import { getDb, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";
import { dropReadings, findUpload, removeUploadFile } from "@/lib/uploads";

/**
 * Soft delete: the readings and the file go, the row stays for a day so the
 * list can say what happened.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upload = await findUpload(userId, id);
  if (!upload) return Response.json({ error: "not found" }, { status: 404 });

  const removed = await dropReadings(userId, id);
  await removeUploadFile(upload.blobPath);
  await getDb()
    .update(uploads)
    .set({
      status: "deleted",
      deletedAt: new Date(),
      readingsCount: removed,
      blobPath: null,
    })
    .where(eq(uploads.id, id));

  return Response.json({ ok: true, removed });
}
