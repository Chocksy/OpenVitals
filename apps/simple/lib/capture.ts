/**
 * The camera as an input: one photo, one vision call, chips back.
 *
 * Same shape as `lib/documents.ts`: a closed schema, a confidence on every
 * item, and a verbatim `basis` — the words printed on the label, or what is
 * actually on the plate — so nothing the model says is unattributable. The
 * model classifies and estimates; the server does every sum, every unit and
 * every write, which is principle 3 with a camera pointed at it.
 *
 * Four destinations:
 *  - `meal` → `daily_logs` nutrition, labelled `estimated`, plus a
 *    `last_meal_hour` chip when the photo says when it was taken.
 *  - `supplement` / `medication` → the `supplements` / `medications` list
 *    facts, through the same appender the document path uses.
 *  - `lab_sheet` and `other_medical` → the existing upload pipeline, untouched.
 *
 * `classifyPhoto` is the only impure function here. `toChips` and the totals
 * are pure and tested, and `evals/capture.ts` runs them over described photos
 * with no model in the loop.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { dailyLogs, getDb, type DailyNutrition } from "@/db";
import { asClock, type Chip } from "./compose";
import { saveFact } from "./coverage";
import { localDay } from "./daily";
import { appendListFact } from "./documents";
import { model } from "./extract";
import { mergeNutrition, NUTRITION_KEYS } from "./healthkit";

/* ── the schema the model answers in ──────────────────────────────────── */

export const PHOTO_KINDS = [
  "meal",
  "supplement_label",
  "medication_label",
  "lab_sheet",
  "other_medical",
  "other",
] as const;

export type PhotoKind = (typeof PHOTO_KINDS)[number];

const confidence = z
  .number()
  .describe("0..1, how sure you are of this reading of the photo");

export const captureSchema = z.object({
  kind: z.enum(PHOTO_KINDS),
  /** The words on the label, or what is on the plate, in the photo's own words. */
  basis: z
    .string()
    .describe(
      "what you actually see: the text printed on the label copied verbatim, or the food on the plate named plainly",
    ),
  confidence,
  items: z
    .array(
      z.object({
        name: z.string(),
        portion: z
          .string()
          .describe("the portion you assumed, e.g. '150 g' or 'one bowl'"),
        kcal: z.number(),
        proteinG: z.number(),
        carbsG: z.number(),
        fatG: z.number(),
        confidence,
      }),
    )
    .describe("meal only: one entry per food item on the plate; empty otherwise"),
  product: z
    .object({
      name: z.string(),
      dose: z.string().optional(),
      form: z.string().optional(),
      confidence,
    })
    .optional()
    .describe("supplement or medication label only"),
  /** `HH:MM` when a clock, a receipt or a screen in the photo says so. */
  clockTime: z.string().optional(),
});

export type CaptureExtract = z.infer<typeof captureSchema>;

export const CAPTURE_PROMPT = `You are looking at one photo a person took in a health app they own. Say what it is, and read what is in it. You never write to their record: everything you output is shown to them as a chip they confirm or delete.

RULES:
1. \`kind\` is one of: meal (food or drink), supplement_label, medication_label, lab_sheet (a printed table of blood results), other_medical (a letter, a report, a device screen), other (anything else). Pick exactly one.
2. \`basis\` is what you actually see, never an interpretation. For a label, copy the printed name and dose verbatim. For a plate, name the foods plainly ("grilled salmon, rice, green beans").
3. For a meal: list every food item you can see, with the portion you assumed, and estimate kcal, protein, carbohydrate and fat in grams for that portion. These are estimates and are labelled as estimates; be honest rather than precise, and put your uncertainty in \`confidence\`.
4. Never total the items. The app does the arithmetic.
5. For a label: \`product.name\` is the product, \`product.dose\` is the amount per serving exactly as printed ("4000 IU", "500 mg").
6. For a lab sheet or anything else medical: set the kind and stop. Do not read the numbers; another part of the app does that properly.
7. \`clockTime\` only when a clock, a till receipt or a device screen in the photo shows the time. Never guess it.
8. Say nothing about causes, diagnoses, diets or what they should do.`;

const isImage = (name: string) =>
  /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);

export const mediaTypeOf = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpeg";
  if (!isImage(fileName)) return "image/jpeg";
  return `image/${ext === "jpg" ? "jpeg" : ext}`;
};

/** One vision call. The only impure function in this file. */
export async function classifyPhoto(
  buffer: Buffer,
  fileName: string,
  caption?: string,
): Promise<CaptureExtract> {
  const { object } = await generateObject({
    model: model(),
    schema: captureSchema,
    maxOutputTokens: 4000,
    system: CAPTURE_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: buffer, mediaType: mediaTypeOf(fileName) },
          {
            type: "text",
            text: caption?.trim()
              ? `What they wrote with the photo: "${caption.trim()}"`
              : "No caption.",
          },
        ],
      },
    ],
  });
  return object;
}

/* ── the arithmetic, which is the server's ────────────────────────────── */

/** A macro estimate outside this is a misread label, not a meal. */
const PLAUSIBLE: Record<string, [number, number]> = {
  kcal: [1, 6000],
  proteinG: [0, 500],
  carbsG: [0, 800],
  fatG: [0, 400],
};

export interface MealTotals {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** The lowest per-item confidence: a total is only as good as its worst item. */
  confidence: number;
  /** "salmon, rice, green beans" */
  label: string;
}

/**
 * The plate's items into one total.
 *
 * The model estimates per item and never totals: the sum, the rounding and the
 * plausibility floor all live here, so two photos of the same plate add up the
 * same way and an item with a 9000 kcal typo cannot poison the day.
 */
export function mealTotals(doc: CaptureExtract): MealTotals | null {
  const items = (doc.items ?? []).filter((i) => i?.name);
  if (!items.length) return null;
  const sum = (key: (typeof NUTRITION_KEYS)[number]) => {
    const xs = items
      .map((i) => Number(i[key]))
      .filter((v) => Number.isFinite(v) && v >= 0);
    if (!xs.length) return null;
    const total = Math.round(xs.reduce((a, b) => a + b, 0));
    const [low, high] = PLAUSIBLE[key]!;
    return total >= low && total <= high ? total : null;
  };
  const confidences = items.map((i) =>
    Math.min(1, Math.max(0, Number(i.confidence) || 0.5)),
  );
  return {
    kcal: sum("kcal"),
    proteinG: sum("proteinG"),
    carbsG: sum("carbsG"),
    fatG: sum("fatG"),
    confidence: Math.min(...confidences),
    label: items.map((i) => i.name).join(", "),
  };
}

const CHIP_UNITS: Record<string, string> = {
  kcal: "kcal",
  proteinG: "g protein",
  carbsG: "g carbs",
  fatG: "g fat",
};

/** `HH:MM` out of whatever the client sent, or null. */
export function clockOf(
  doc: CaptureExtract,
  takenAt?: string | null,
): string | null {
  const said = String(doc.clockTime ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (said && Number(said[1]) < 24)
    return asClock(Number(said[1]) + Number(said[2]) / 60);
  const at = String(takenAt ?? "").match(/[T ](\d{2}):(\d{2})/);
  if (at) return asClock(Number(at[1]) + Number(at[2]) / 60);
  return null;
}

/**
 * What one photo is worth, as the chips the composer already draws.
 *
 * Pure: the same extraction, the same day and the same taken-at give the same
 * chips for ever, which is what `evals/capture.ts` checks with no model in the
 * loop. A lab sheet and anything else medical produce no chips at all — they
 * go to the upload pipeline, and inventing a chip for them would be a second
 * extractor nobody asked for.
 */
export function toChips(
  doc: CaptureExtract,
  opts: { today: string; takenAt?: string | null } = { today: localDay() },
): Chip[] {
  // A photo of last night's dinner belongs to last night. The day the phone
  // wrote on the asset wins, as long as it is not in the future.
  const taken = String(opts.takenAt ?? "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const date = taken && taken <= opts.today ? taken : opts.today;
  const out: Chip[] = [];
  const basis = String(doc.basis ?? "").slice(0, 400);
  const sure = Math.min(1, Math.max(0, Number(doc.confidence) || 0.5));

  if (doc.kind === "meal") {
    const totals = mealTotals(doc);
    if (!totals) return out;
    for (const key of NUTRITION_KEYS) {
      const value = totals[key];
      if (value == null) continue;
      out.push({
        kind: "nutrition",
        key,
        label: `${value} ${CHIP_UNITS[key]} · estimate`,
        value,
        date,
        quote: basis,
        confidence: Math.min(sure, totals.confidence),
        by: "model",
      });
    }
    const clock = clockOf(doc, opts.takenAt);
    if (clock)
      out.push({
        kind: "fact",
        key: "last_meal_hour",
        label: `last meal ${clock}`,
        value: clock,
        date,
        quote: basis,
        confidence: 0.7,
        by: "model",
      });
    return out;
  }

  if (doc.kind === "supplement_label" || doc.kind === "medication_label") {
    const name = String(doc.product?.name ?? "").trim();
    if (!name) return out;
    const value = [name, doc.product?.dose?.trim()].filter(Boolean).join(" ");
    const key = doc.kind === "supplement_label" ? "supplements" : "medications";
    out.push({
      kind: "fact",
      key,
      label: `${key.slice(0, -1)} · ${value.toLowerCase()}`,
      value,
      date,
      quote: basis,
      confidence: Math.min(
        sure,
        Math.min(1, Math.max(0, Number(doc.product?.confidence) || 0.6)),
      ),
      by: "model",
    });
  }
  return out;
}

/** Where a photo goes when it is not food and not a label. */
export const routeOf = (kind: PhotoKind): "lab" | "document" | null =>
  kind === "lab_sheet" ? "lab" : kind === "other_medical" ? "document" : null;

/* ── writing, through the writers that already exist ──────────────────── */

/** A chip the client sent back, re-checked exactly the way `/api/compose` does. */
export function cleanCaptureChips(chips: Chip[], today: string): Chip[] {
  const out: Chip[] = [];
  for (const c of chips ?? []) {
    if (!c?.key || !c.kind) continue;
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(String(c.date)) && c.date <= today
        ? c.date
        : today;
    if (c.kind === "nutrition") {
      if (!(NUTRITION_KEYS as readonly string[]).includes(c.key)) continue;
      const value = Number(c.value);
      if (!Number.isFinite(value) || value < 0) continue;
      const [low, high] = PLAUSIBLE[c.key]!;
      if (value < low || value > high) continue;
      out.push({ ...c, value, date });
      continue;
    }
    if (c.kind === "fact") {
      const value = String(c.value ?? "").trim();
      if (!value) continue;
      if (!["supplements", "medications", "last_meal_hour"].includes(c.key))
        continue;
      out.push({ ...c, value, date });
    }
  }
  return out;
}

export interface CaptureWrite {
  facts: string[];
  nutrition: DailyNutrition | null;
  day: string | null;
}

/**
 * Confirmed chips into rows, through the writers that already exist:
 * `appendListFact` for the two list facts (so an existing supplement is never
 * dropped), `saveFact` for the timing fact, and one `daily_logs` upsert whose
 * totals `mergeNutrition` recomputes from the day's entries.
 */
export async function writeCaptureChips(
  userId: string,
  chips: Chip[],
  opts: { label?: string; at?: string | null } = {},
): Promise<CaptureWrite> {
  const db = getDb();
  const out: CaptureWrite = { facts: [], nutrition: null, day: null };

  for (const c of chips.filter((x) => x.kind === "fact")) {
    if (c.key === "supplements" || c.key === "medications")
      await appendListFact(userId, c.key, String(c.value));
    else
      await saveFact(userId, c.key, String(c.value), {
        kind: "changed",
        date: c.date,
        note: c.quote,
      });
    out.facts.push(c.key);
  }

  const food = chips.filter((c) => c.kind === "nutrition");
  if (!food.length) return out;

  const day = food[0]!.date;
  const [existing] = await db
    .select()
    .from(dailyLogs)
    .where(and(eq(dailyLogs.userId, userId), eq(dailyLogs.day, day)));
  const entry = {
    ...(opts.at ? { at: opts.at } : {}),
    label: opts.label?.slice(0, 200) || "a photo",
    source: "capture",
    estimated: true,
    ...Object.fromEntries(food.map((c) => [c.key, Number(c.value)])),
  };
  const nutrition = mergeNutrition(
    (existing?.nutrition as DailyNutrition | null) ?? null,
    entry,
  ) as DailyNutrition;

  await db
    .insert(dailyLogs)
    .values({ userId, day, nutrition })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.day],
      set: { nutrition, updatedAt: sql`now()` },
    });
  out.nutrition = nutrition;
  out.day = day;
  return out;
}
