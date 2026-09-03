/**
 * `GET /api/meals?d=YYYY-MM-DD` and `POST /api/meals`.
 *
 * Phase 32a section 6, the contract the native app decodes. The reader is the
 * one `/api/capture` already uses — `classifyPhoto` — so a food photo is read
 * once, one way; anything that is not food is refused here by name rather than
 * stored as a meal it is not.
 *
 * The write is `lib/meals.ts`: the row, the photo under the existing upload
 * storage, and the same `mergeNutrition` sum into `daily_logs.nutrition` the
 * capture path uses.
 */
import { randomUUID } from "node:crypto";
import { currentUserId } from "@/lib/auth";
import { classifyPhoto, clockOf } from "@/lib/capture";
import { localDay } from "@/lib/daily";
import { getMeals, mealRowOf, saveMeal, toApiMeal } from "@/lib/meals";
import { extOf, writeUpload } from "@/lib/uploads";

export const maxDuration = 120;

/** The same cap `/api/capture` puts on a photo. Bigger is a mistake. */
const MAX_BYTES = 20 * 1024 * 1024;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const asked = new URL(req.url).searchParams.get("d");
  const day = asked ?? localDay();
  if (!DAY.test(day))
    return Response.json({ error: "bad day" }, { status: 400 });

  return Response.json(await getMeals(userId, day));
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File))
    return Response.json({ error: "no photo" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return Response.json({ error: "that photo is too big" }, { status: 413 });

  const day = String(form!.get("day") ?? "") || localDay();
  if (!DAY.test(day))
    return Response.json({ error: "bad day" }, { status: 400 });
  const asked = String(form!.get("time") ?? "").match(/^\d{2}:\d{2}$/)?.[0];

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name || "photo.jpg";

  try {
    const doc = await classifyPhoto(buffer, fileName);
    // A lab sheet is not a meal. The capture route hands those to the upload
    // reader; here the honest answer is to refuse and say what was in frame.
    if (doc.kind !== "meal")
      return Response.json(
        { error: `that photo is a ${doc.kind.replace(/_/g, " ")}, not a meal` },
        { status: 400 },
      );

    // The id first, so the photo can be written under it before the row is.
    const id = randomUUID();
    const photoKey = await writeUpload(userId, id, buffer, extOf(fileName));
    const row = mealRowOf(doc, {
      day,
      time: asked ?? clockOf(doc, null),
      photoKey,
    });
    if (!row)
      return Response.json(
        { error: "nothing on that plate the reader could name" },
        { status: 400 },
      );

    const meal = await saveMeal(userId, { ...row, id });
    return Response.json(toApiMeal(meal));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[meals] failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
