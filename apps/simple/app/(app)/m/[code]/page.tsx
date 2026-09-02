import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getMetricRows } from "@/lib/data";
import { getGoalFor } from "@/lib/daily-data";
import { goalGap, inGoal } from "@/lib/daily";
import { formatRange, healthStatus, statusColor, statusOf } from "@/lib/status";
import { TrendChart } from "@/components/trend-chart";
import { RangeBar } from "@/components/range-bar";
import { GoalForm, OptimalForm } from "@/components/tracker";
import { projectionsFor } from "@/lib/projections";
import { projectionLine } from "@/lib/projection";
import { StateWord, toneOf } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

export default async function MetricPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const userId = await requireUserId();
  const [rows, goal, made] = await Promise.all([
    getMetricRows(userId),
    getGoalFor(userId, code),
    projectionsFor(userId, code),
  ]);
  // The newest projection is the one drawn; an unresolved one takes priority
  // over a resolved one, because that is the one still being judged.
  const projection = made.find((p) => !p.resolvedAt) ?? made[0] ?? null;
  const metric = rows.find((m) => m.code === code);
  if (!metric) notFound();

  // Phase 24b: a marker whose latest reading came from a device is a daily
  // series. It gets a line and a range switch instead of one dot per draw, and
  // the table below shows the last 90 days rather than 776 nights of sleep.
  const phone = metric.rows.some((r) => r.source != null);
  const tableRows = [...metric.rows].reverse().slice(0, phone ? 90 : undefined);

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
          href={phone ? "/labs/phone" : "/biomarkers"}
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-400 hover:text-neutral-600"
        >
          <ChevronLeft className="size-3" />
          {phone ? "Phone" : "Biomarkers"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
            {metric.name}
          </h1>
          <StateWord tone={toneOf(status)} dot>
            {status}
          </StateWord>
          {metric.derived && (
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
              derived, not stored
            </span>
          )}
          {phone && (
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
              from your phone · {metric.points.length} days since{" "}
              {metric.points[0]?.date}
            </span>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-neutral-400">
          <span>
            {metric.unit ?? "no unit"} · reference{" "}
            {formatRange(metric.latest.refLow, metric.latest.refHigh)} · optimal{" "}
            {formatRange(metric.optimalLow, metric.optimalHigh, metric.unit)}
            {metric.optimalSource && ` · ${metric.optimalSource}`}
            {metric.optimalBasis && ` · ${metric.optimalBasis}`}
          </span>
          <OptimalForm
            metricCode={metric.code}
            low={metric.optimalLow}
            high={metric.optimalHigh}
            unit={metric.unit}
            mine={metric.optimalSource === "user"}
          />
        </p>
        {metric.optimalRationale && (
          <p className="mt-1 font-body text-[12px] text-neutral-500">
            {metric.optimalRationale}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {goal ? (
            <p className="font-mono text-[12px] text-neutral-600">
              <span className="font-bold uppercase tracking-[0.06em] text-accent-500">
                Goal
              </span>{" "}
              {formatRange(goal.targetLow, goal.targetHigh, metric.unit)}
              {goal.due && ` by ${goal.due}`}
              {metric.latest.value != null && (
                <span className="text-neutral-400">
                  {" · current "}
                  {metric.latest.value}
                  {inGoal(metric.latest.value, goal.targetLow, goal.targetHigh)
                    ? " · reached"
                    : ` · ${Math.round(goalGap(metric.latest.value, goal.targetLow, goal.targetHigh) * 100) / 100} to go`}
                </span>
              )}
              {goal.note && (
                <span className="text-neutral-400"> · {goal.note}</span>
              )}
            </p>
          ) : (
            <p className="font-mono text-[12px] text-neutral-400">
              No goal set for this biomarker.
            </p>
          )}
          <GoalForm
            metricCode={metric.code}
            targetLow={goal?.targetLow ?? metric.optimalLow}
            targetHigh={goal?.targetHigh ?? metric.optimalHigh}
            due={goal?.due ?? null}
            note={goal?.note ?? null}
            exists={Boolean(goal)}
          />
        </div>
      </div>

      <div className="card p-4">
        <RangeBar
          value={metric.latest.value}
          prev={metric.points.length > 1 ? metric.points[metric.points.length - 2]!.value : null}
          refLow={metric.latest.refLow}
          refHigh={metric.latest.refHigh}
          optimalLow={metric.optimalLow}
          optimalHigh={metric.optimalHigh}
          goal={goal?.targetHigh ?? goal?.targetLow ?? null}
          unit={metric.unit}
        />
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
          goalLow={goal?.targetLow ?? null}
          goalHigh={goal?.targetHigh ?? null}
          unit={metric.unit}
          status={status}
          daily={phone}
          projection={
            projection
              ? {
                  madeAt: projection.fromDate,
                  retestAt: projection.retestAt,
                  expected: projection.expected,
                  low: projection.low,
                  high: projection.high,
                  verdict: projection.verdict,
                  resolvedValue: projection.resolvedValue,
                }
              : null
          }
        />
        {projection && (
          <div className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
            <p className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-neutral-700">
              {projection.verdict && (
                <StateWord
                  tone={
                    projection.verdict === "better"
                      ? "on"
                      : projection.verdict === "worse"
                        ? "off"
                        : "none"
                  }
                >
                  {projection.verdict === "as_expected"
                    ? "as expected"
                    : projection.verdict}
                </StateWord>
              )}
              {projectionLine({ ...projection, unit: metric.unit ?? "" })}
              {projection.resolvedValue != null && (
                <span className="text-neutral-500">
                  · measured {projection.resolvedValue} on {projection.resolvedAt}
                </span>
              )}
            </p>
            {projection.assumptions.map((a) => (
              <p key={a} className="font-body text-[12px] text-neutral-500">
                {a}
              </p>
            ))}
          </div>
        )}
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
          {tableRows.map((r, i) => (
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
