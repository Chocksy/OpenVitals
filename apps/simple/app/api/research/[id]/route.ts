/** Mark one paper seen, or dismiss it. Phase 32a section 1. */
import { currentUserId } from "@/lib/auth";
import {
  paperActions,
  paperNames,
  patchWatch,
  toApiPaper,
} from "@/lib/research-watch";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    seen?: boolean;
    dismissed?: boolean;
  } | null;
  if (typeof body?.seen !== "boolean" && typeof body?.dismissed !== "boolean")
    return Response.json({ error: "bad body" }, { status: 400 });

  const row = await patchWatch(userId, id, {
    ...(typeof body.seen === "boolean" ? { seen: body.seen } : {}),
    ...(typeof body.dismissed === "boolean"
      ? { dismissed: body.dismissed }
      : {}),
  });
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  // The phone swaps the row it had for this one, so it carries the same name
  // and the same action the list gave it.
  const [names, actions] = await Promise.all([
    paperNames(userId, [row]),
    paperActions([row]),
  ]);
  return Response.json(toApiPaper(row, names, actions));
}
