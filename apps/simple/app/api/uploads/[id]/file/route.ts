import { readFile } from "node:fs/promises";
import { currentUserId } from "@/lib/auth";
import { findUpload, localPath } from "@/lib/uploads";

/** The stored PDF, for the viewer on the upload page. Owner only. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upload = await findUpload(userId, id);
  const path = localPath(upload?.blobPath);
  if (!path) return Response.json({ error: "not found" }, { status: 404 });

  const body = new Uint8Array(await readFile(path));
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      // The built-in PDF viewer wants a length before it paints anything.
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename="${(upload!.fileName ?? "lab").replace(/["\\]/g, "")}"`,
    },
  });
}
