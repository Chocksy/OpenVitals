import Link from "next/link";
import { FileText } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getDraws } from "@/lib/daily-data";
import { formatDate } from "@/lib/utils";
import { formatRange, statusColor } from "@/lib/status";

export const dynamic = "force-dynamic";

/** One card per blood draw. Click to see every reading from that day. */
export default async function LabsPage() {
  const userId = await requireUserId();
  const draws = await getDraws(userId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Labs
        </h1>
        <p className="mt-1 font-body text-[13px] text-neutral-500">
          {draws.length} blood draw{draws.length === 1 ? "" : "s"}, newest
          first.
        </p>
      </div>

      {draws.length === 0 ? (
        <p className="card border-dashed p-10 text-center font-body text-[13px] text-neutral-500">
          No readings yet. Upload a lab PDF from{" "}
          <Link href="/uploads" className="underline">
            Uploads
          </Link>
          .
        </p>
      ) : (
        draws.map((draw) => (
          <details key={draw.day} className="card">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3.5 hover:bg-neutral-50">
              <span className="font-display text-[15px] font-medium tracking-[-0.02em]">
                {formatDate(draw.day)}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-neutral-400">
                {draw.count} results
              </span>
              {draw.critical > 0 && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-[var(--color-health-critical)]">
                  <span className="size-[6px] rounded-full bg-[var(--color-health-critical)]" />
                  {draw.critical}
                </span>
              )}
              {draw.flagged - draw.critical > 0 && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-[var(--color-health-warning)]">
                  <span className="size-[6px] rounded-full bg-[var(--color-health-warning)]" />
                  {draw.flagged - draw.critical}
                </span>
              )}
              {draw.fileName && (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-neutral-400">
                  <FileText className="size-3" />
                  {draw.fileName}
                </span>
              )}
              <span className="ml-auto flex flex-wrap gap-1.5">
                {draw.rows
                  .filter((r) => r.status === "red" || r.status === "amber")
                  .slice(0, 3)
                  .map((r, i) => (
                    <span
                      key={`${r.code}-${i}`}
                      className="inline-flex items-center gap-1 border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-body text-[11px] text-neutral-700"
                    >
                      <span
                        className={`size-[5px] rounded-full ${statusColor[r.status]}`}
                      />
                      {r.name}
                    </span>
                  ))}
              </span>
            </summary>

            <table className="w-full border-t border-neutral-200 font-body text-[13px]">
              <tbody className="divide-y divide-neutral-100">
                {/* One draw can hold several rows for the same code (a
                    susceptibility panel, or the same analyte in blood and
                    urine), so the index is part of the key. */}
                {draw.rows.map((r, i) => (
                  <tr key={`${r.code}-${i}`}>
                    <td className="px-4 py-2">
                      <Link href={`/m/${r.code}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                      {r.value ?? r.valueText ?? "—"}
                      <span className="ml-1 text-[10px] font-normal text-neutral-400">
                        {r.unit ?? ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-[11px] tabular-nums text-neutral-400">
                      {formatRange(r.refLow, r.refHigh)}
                    </td>
                    <td className="w-8 px-4 py-2 text-right">
                      <span
                        className={`inline-block size-[6px] rounded-full ${statusColor[r.status]}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ))
      )}
    </div>
  );
}
