import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { LabsHeader } from "@/components/labs-header";
import { getPhoneMetrics } from "@/lib/daily-data";
import { formatDate } from "@/lib/utils";
import { formatRange, statusColor, statusStroke } from "@/lib/status";
import { MiniSparkline } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

/** 7.2 stays 7.2, 7120 stays 7120. */
const num = (v: number) =>
  Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);

/**
 * The Phone tab: everything a watch measures, as the time series it is.
 *
 * Phase 24b. These rows used to be dressed up as blood draws, one card per day
 * per metric, which buried the 17 real lab PDFs under 3,266 "draws". A daily
 * line over 90 days, the latest value with its band, and how long the series
 * has run say the same thing in one row.
 */
export default async function PhonePage() {
  const userId = await requireUserId();
  const rows = await getPhoneMetrics(userId);
  const span = rows.map((r) => r.since).sort()[0];

  return (
    <div className="space-y-5">
      <LabsHeader
        active="phone"
        subtitle={
          rows.length
            ? `${rows.length} signal${rows.length === 1 ? "" : "s"} from your phone${span ? `, since ${formatDate(span)}` : ""}.`
            : "Nothing from a phone yet."
        }
      />

      {rows.length === 0 ? (
        <p className="card border-dashed p-10 text-center font-body text-[13px] text-neutral-500">
          Sync Apple Health from the iOS app and your daily numbers land here.
        </p>
      ) : (
        <div className="card divide-y divide-neutral-100">
          {rows.map((m) => {
            const body = (
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`size-[6px] shrink-0 rounded-full ${statusColor[m.status]}`}
                />
                <span className="w-40 flex-1 truncate font-body text-[13px]">
                  {m.name}
                </span>
                <MiniSparkline
                  data={m.points.map((p) => p.value)}
                  color={statusStroke[m.status]}
                  width={180}
                  height={26}
                />
                <span className="w-28 text-right font-mono text-[13px] font-semibold tabular-nums">
                  {m.latest == null ? "—" : num(m.latest)}
                  <span className="ml-1 text-[10px] font-normal text-neutral-400">
                    {m.unit ?? ""}
                  </span>
                </span>
                <span className="w-32 text-right font-mono text-[10px] tabular-nums text-neutral-400">
                  {m.optimalLow != null || m.optimalHigh != null
                    ? formatRange(m.optimalLow, m.optimalHigh)
                    : "no band"}
                </span>
                <span className="w-48 text-right font-mono text-[10px] tabular-nums text-neutral-400">
                  {m.count} {m.noun} since {m.since}
                </span>
              </div>
            );
            return (
              <div key={m.code} className="px-4 py-2.5 hover:bg-neutral-50">
                {m.href ? (
                  <Link href={m.href} className="block">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="font-mono text-[11px] text-neutral-400">
        The line is the last 90 days, one point a day. Tap a row for the whole
        series. Steps, exercise, active energy and workouts have no lab
        equivalent, so they stay here.
      </p>
    </div>
  );
}
