import { desc, eq, sql } from "drizzle-orm";
import { Download } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getDb, uploads, readings } from "@/db";
import { DeleteUpload, UploadButton } from "@/components/client";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

const badge = { done: "normal", failed: "critical", pending: "info" } as const;

export default async function UploadsPage() {
  const userId = await requireUserId();
  const rows = await getDb()
    .select({
      id: uploads.id,
      fileName: uploads.fileName,
      status: uploads.status,
      error: uploads.error,
      createdAt: uploads.createdAt,
      count: sql<number>`(select count(*)::int from ${readings} where ${readings.uploadId} = ${uploads.id})`,
    })
    .from(uploads)
    .where(eq(uploads.userId, userId))
    .orderBy(desc(uploads.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
            Uploads
          </h1>
          <p className="mt-1 font-body text-[13px] text-neutral-500">
            Lab PDFs you imported. Deleting one removes its readings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <a
          href="/api/export.csv"
          className="card inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600 hover:border-accent-200 hover:text-neutral-900"
        >
          <Download className="size-3.5" />
          Readings CSV
        </a>
        <a
          href="/api/export-daily.csv"
          className="card inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600 hover:border-accent-200 hover:text-neutral-900"
        >
          <Download className="size-3.5" />
          Daily log CSV
        </a>
      </div>
          <UploadButton />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card border-dashed p-8 text-center font-body text-[13px] text-neutral-500">
          No uploads yet.
        </p>
      ) : (
        <div className="card divide-y divide-neutral-100">
          {rows.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-body text-[13px] font-medium">
                  {u.fileName ?? "(no name)"}
                </p>
                <p className="font-mono text-[10px] text-neutral-400">
                  {u.createdAt?.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
                  {u.count} readings
                </p>
                {u.error && (
                  <p className="mt-1 font-mono text-[10px] text-[var(--color-health-critical)]">
                    {u.error}
                  </p>
                )}
              </div>
              <StatusBadge
                status={badge[(u.status ?? "pending") as keyof typeof badge] ?? "neutral"}
                label={u.status ?? "pending"}
              />
              <DeleteUpload id={u.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
