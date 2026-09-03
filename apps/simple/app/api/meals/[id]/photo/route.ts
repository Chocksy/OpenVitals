import { readFile } from "node:fs/promises";
import { currentUserId } from "@/lib/auth";
import { mediaTypeOf } from "@/lib/capture";
import { findMeal } from "@/lib/meals";
import { localPath } from "@/lib/uploads";

const UUID = /^[0-9a-f-]{36}$/i;

/** The stored photograph, for the meal card. Owner only, like an upload's file. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id))
    return Response.json({ error: "not found" }, { status: 404 });

  const meal = await findMeal(userId, id);
  const path = localPath(meal?.photoKey);
  if (!path) return Response.json({ error: "not found" }, { status: 404 });

  const body = new Uint8Array(await readFile(path));
  return new Response(body, {
    headers: {
      "Content-Type": mediaTypeOf(path),
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename="${id}.${path.split(".").pop()}"`,
    },
  });
}
