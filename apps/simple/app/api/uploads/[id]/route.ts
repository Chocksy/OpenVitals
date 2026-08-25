import { and, eq } from "drizzle-orm";
import { getDb, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";

// readings.upload_id cascades, so deleting the upload removes its readings.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const deleted = await getDb()
    .delete(uploads)
    .where(and(eq(uploads.id, id), eq(uploads.userId, userId)))
    .returning({ id: uploads.id });
  if (!deleted.length)
    return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
