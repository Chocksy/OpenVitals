import { eq } from "drizzle-orm";
import { getDb, metrics, readings, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";
import { extractFromPdf, slugify } from "@/lib/extract";
import { canonicalCode } from "@/lib/merge-metrics";
import { ensureImported } from "@/lib/import-legacy";
import { runCurator } from "@/lib/curator";
import { generateReport } from "@/lib/report";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const file = (await req.formData()).get("file");
  if (!(file instanceof File))
    return Response.json({ error: "no file" }, { status: 400 });

  await ensureImported();
  const db = getDb();
  const [upload] = await db
    .insert(uploads)
    .values({ userId, fileName: file.name, status: "pending" })
    .returning();

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const known = await db.select().from(metrics);
    const result = await extractFromPdf(buffer, known);
    if (result.error) throw new Error(result.error);

    const codes = new Set(known.map((m) => m.code));
    const values = [];
    for (const r of result.readings) {
      const suggested = r.code ? canonicalCode(r.code, r.analyte) : null;
      let code = suggested && codes.has(suggested) ? suggested : null;
      if (!code) {
        // Unmatched analyte: mint a metric on the fly.
        code = canonicalCode(slugify(r.analyte), r.analyte);
        if (!codes.has(code)) {
          await db
            .insert(metrics)
            .values({
              code,
              name: r.analyte || code,
              category: "other",
              unit: r.unit,
            })
            .onConflictDoNothing();
          codes.add(code);
        }
      }
      values.push({
        userId,
        uploadId: upload!.id,
        metricCode: code,
        value: r.value,
        valueText: r.valueText,
        unit: r.unit,
        refLow: r.refLow,
        refHigh: r.refHigh,
        observedAt: r.observedAt,
      });
    }
    if (values.length) await db.insert(readings).values(values);

    await db
      .update(uploads)
      .set({ status: "done" })
      .where(eq(uploads.id, upload!.id));

    // Fire and forget: runCurator writes its own failures into curator_runs.
    void runCurator(userId, "upload", { uploadId: upload!.id }).then(() =>
      generateReport(userId, "upload").catch((e) =>
        console.error("[plan] upload report failed:", e),
      ),
    );

    return Response.json({ uploadId: upload!.id, count: values.length });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[upload] failed:", e);
    await db
      .update(uploads)
      .set({ status: "failed", error })
      .where(eq(uploads.id, upload!.id));
    return Response.json({ uploadId: upload!.id, error }, { status: 500 });
  }
}
