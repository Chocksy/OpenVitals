import { and, eq, inArray } from "drizzle-orm";
import { documentItems, getDb, hkbConditions } from "@/db";
import { recordDocumentCalibration } from "@/lib/calibration";
import { currentUserId } from "@/lib/auth";
import { runCurator } from "@/lib/curator";
import { acceptItems } from "@/lib/documents";
import { recordBeliefs } from "@/lib/ledger";
import { findUpload } from "@/lib/uploads";

export const maxDuration = 120;

interface Body {
  action: "accept" | "reject";
  /** One item, or every proposed item of this kind on this document. */
  itemId?: string;
  kind?: string;
  /** An edited payload, saved before the item is accepted. */
  payload?: Record<string, unknown>;
}

/** Accept or reject proposed items. Accepting is the only thing that writes. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upload = await findUpload(userId, id);
  if (!upload) return Response.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as Body;
  if (body.action !== "accept" && body.action !== "reject")
    return Response.json({ error: "unknown action" }, { status: 400 });

  const db = getDb();
  if (body.itemId && body.payload)
    await db
      .update(documentItems)
      .set({ payload: body.payload })
      .where(
        and(
          eq(documentItems.id, body.itemId),
          eq(documentItems.userId, userId),
        ),
      );

  const rows = await db
    .select()
    .from(documentItems)
    .where(
      and(
        eq(documentItems.uploadId, id),
        eq(documentItems.userId, userId),
        eq(documentItems.status, "proposed"),
        ...(body.itemId ? [eq(documentItems.id, body.itemId)] : []),
        ...(body.kind ? [eq(documentItems.kind, body.kind)] : []),
      ),
    );
  if (!rows.length) return Response.json({ accepted: 0, rejected: 0 });

  if (body.action === "reject") {
    await db
      .update(documentItems)
      .set({ status: "rejected" })
      .where(
        inArray(
          documentItems.id,
          rows.map((r) => r.id),
        ),
      );
    return Response.json({ rejected: rows.length });
  }

  const result = await acceptItems(
    userId,
    rows,
    upload.fileName ?? "an uploaded document",
    upload.docMeta ?? null,
  );

  if (result.readings)
    await runCurator(userId, "upload", { uploadId: id }).catch((e) =>
      console.error("[items] curator failed:", e),
    );
  await recordBeliefs(userId).catch((e) =>
    console.error("[items] beliefs failed:", e),
  );
  // A document that names a condition outright settles it, so it is a
  // calibration resolver in its own right. After the beliefs, so the woken
  // ring-2 rows are in the catalog it reads.
  await recordDocumentCalibration(
    userId,
    id,
    await getDb()
      .select({
        id: hkbConditions.id,
        name: hkbConditions.name,
        mondoId: hkbConditions.mondoId,
      })
      .from(hkbConditions),
  ).catch((e) => console.error("[items] calibration failed:", e));

  return Response.json(result);
}
