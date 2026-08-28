import { and, eq } from "drizzle-orm";
import { getDb, metrics, readings, reviewItems, uploads } from "@/db";
import { currentUserId } from "@/lib/auth";
import { aliasesFor, confirmValueAsk, findSheetLine } from "@/lib/raw-verify";

/**
 * "Wrong value" on a Home card. One `confirm_value` review item, with the lab
 * sheet's own line quoted when the upload kept its text, so /review answers it
 * with the curator's existing Keep / Discard / Note handler.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { readingId } = (await req.json()) as { readingId?: string };
  if (!readingId)
    return Response.json({ error: "no reading" }, { status: 400 });

  const db = getDb();
  const [r] = await db
    .select()
    .from(readings)
    .where(and(eq(readings.id, readingId), eq(readings.userId, userId)));
  if (!r) return Response.json({ error: "not found" }, { status: 404 });

  const [m] = await db
    .select()
    .from(metrics)
    .where(eq(metrics.code, r.metricCode));
  if (!m) return Response.json({ error: "not found" }, { status: 404 });

  const [upload] = r.uploadId
    ? await db
        .select({ rawText: uploads.rawText })
        .from(uploads)
        .where(eq(uploads.id, r.uploadId))
    : [];
  const line = upload?.rawText
    ? (findSheetLine(
        upload.rawText,
        aliasesFor(m, m.aliases ?? []),
        r.unit ?? m.unit,
        r.metricCode,
        r.value,
      )?.line ?? null)
    : null;

  const item = confirmValueAsk(r, m, line);
  if (item.type !== "queue")
    return Response.json({ error: "nothing to ask" }, { status: 400 });

  const open = await db
    .select()
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(reviewItems.kind, "confirm_value"),
        eq(reviewItems.status, "open"),
      ),
    );
  const same = open.find((i) => i.subject?.readingId === readingId);
  if (same) return Response.json({ ok: true, id: same.id });

  const [row] = await db
    .insert(reviewItems)
    .values({
      userId,
      kind: item.kind,
      subject: item.subject,
      question: item.question,
      options: item.options,
    })
    .returning({ id: reviewItems.id });
  return Response.json({ ok: true, id: row!.id });
}
