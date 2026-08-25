import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getMetricRows } from "@/lib/data";
import { formatRange, healthStatus, statusColor, statusOf } from "@/lib/status";
import { TrendChart } from "@/components/trend-chart";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function MetricPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const userId = await requireUserId();
  const metric = (await getMetricRows(userId)).find((m) => m.code === code);
  if (!metric) notFound();

  const ranges = {
    value: metric.latest.value,
    refLow: metric.latest.refLow,
    refHigh: metric.latest.refHigh,
    optimalLow: metric.optimalLow,
    optimalHigh: metric.optimalHigh,
  };
  const status = healthStatus(ranges);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/biomarkers"
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-400 hover:text-neutral-600"
        >
          <ChevronLeft className="size-3" />
          Biomarkers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
            {metric.name}
          </h1>
          <StatusBadge status={status} label={status} />
          {metric.derived && (
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
              derived, not stored
            </span>
          )}
        </div>
        <p className="mt-1 font-mono text-[11px] text-neutral-400">
          {metric.unit ?? "no unit"} · reference{" "}
          {formatRange(metric.latest.refLow, metric.latest.refHigh)} · optimal{" "}
          {formatRange(metric.optimalLow, metric.optimalHigh)}
        </p>
      </div>

      <div className="card p-4">
        <TrendChart
          data={metric.points.map((p) => ({
            date: p.date,
            value: p.value,
            unit: metric.unit,
          }))}
          referenceRangeLow={metric.latest.refLow}
          referenceRangeHigh={metric.latest.refHigh}
          optimalRangeLow={metric.optimalLow}
          optimalRangeHigh={metric.optimalHigh}
          unit={metric.unit}
          status={status}
        />
      </div>

      <table className="card w-full font-body text-[13px]">
        <thead className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          <tr className="border-b border-neutral-200">
            <th className="px-4 py-2 text-left font-bold">Date</th>
            <th className="px-4 py-2 text-right font-bold">Value</th>
            <th className="px-4 py-2 text-right font-bold">Reference</th>
            <th className="px-4 py-2 text-right font-bold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {[...metric.rows].reverse().map((r, i) => (
            <tr key={`${r.observedAt}-${i}`}>
              <td className="px-4 py-2 font-mono tabular-nums">
                {r.observedAt}
              </td>
              <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                {r.value ?? r.valueText ?? "—"}
                <span className="ml-1 text-[10px] font-normal text-neutral-400">
                  {r.unit ?? ""}
                </span>
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums text-neutral-500">
                {formatRange(r.refLow, r.refHigh)}
              </td>
              <td className="px-4 py-2 text-right">
                <span
                  className={`inline-block size-[6px] rounded-full ${
                    statusColor[
                      statusOf({
                        value: r.value,
                        refLow: r.refLow,
                        refHigh: r.refHigh,
                        optimalLow: metric.optimalLow,
                        optimalHigh: metric.optimalHigh,
                      })
                    ]
                  }`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
