/**
 * `POST /api/meals/[id]/reread` `{ note }`: "that was two eggs, not one".
 * Phase 37 task A4.
 *
 * The stored photo goes back through `classifyPhoto` with the note as its
 * caption, and the new read replaces the items and the label; servings go back
 * to 1. A read that finds no plate is 422 and the meal stays as it was.
 */
import { readFile } from "node:fs/promises";
import { currentUserId } from "@/lib/auth";
import { findMeal, rereadOf, toApiMeal, updateMeal } from "@/lib/meals";
import { localPath } from "@/lib/uploads";

export const maxDuration = 120;

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id))
    return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    note?: unknown;
  } | null;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (note.length < 1 || note.length > 500)
    return Response.json(
      { error: "a note of 1 to 500 characters" },
      { status: 400 },
    );

  const meal = await findMeal(userId, id);
  if (!meal) return Response.json({ error: "not found" }, { status: 404 });
  const path = localPath(meal.photoKey);
  if (!path)
    return Response.json({ error: "this meal has no photo" }, { status: 404 });

  try {
    const read = await rereadOf(meal, await readFile(path), note);
    if (!read)
      return Response.json(
        { error: "no plate the reader could name in that photo" },
        { status: 422 },
      );
    const saved = await updateMeal(userId, meal, read);
    if (!saved) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(toApiMeal(saved));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[meals] reread failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
