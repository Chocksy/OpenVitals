/**
 * `PATCH /api/meals/[id]` and `DELETE /api/meals/[id]`. Phase 37 task A4.
 *
 * The phone's meal sheet: a portion, a time, a label, an item removed, or the
 * whole meal gone. Owner only, the way `/api/habits` checks an item: a meal
 * that is not this person's is "not found", never "forbidden". After every
 * write the day's capture nutrition is rebuilt from the meals that are left.
 */
import { currentUserId } from "@/lib/auth";
import {
  deleteMeal,
  findMeal,
  mealPatchSchema,
  patchOf,
  toApiMeal,
  updateMeal,
} from "@/lib/meals";
import { removeUploadFile } from "@/lib/uploads";

const UUID = /^[0-9a-f-]{36}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id))
    return Response.json({ error: "not found" }, { status: 404 });

  const parsed = mealPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "bad body" },
      { status: 400 },
    );

  // `{}` (or only unknown keys) parses; drizzle's `.set({})` throws, so an
  // empty patch is the caller's mistake and says so.
  const set = patchOf(parsed.data);
  if (!Object.keys(set).length)
    return Response.json({ error: "Nothing to change" }, { status: 400 });

  const meal = await findMeal(userId, id);
  if (!meal) return Response.json({ error: "not found" }, { status: 404 });

  // Null when the row went between `findMeal` and the write.
  const saved = await updateMeal(userId, meal, set);
  if (!saved) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(toApiMeal(saved));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id))
    return Response.json({ error: "not found" }, { status: 404 });

  const meal = await findMeal(userId, id);
  if (!meal) return Response.json({ error: "not found" }, { status: 404 });

  await deleteMeal(userId, meal);
  await removeUploadFile(meal.photoKey);
  return Response.json({ ok: true });
}
