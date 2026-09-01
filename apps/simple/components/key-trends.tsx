"use client";

/**
 * Four charts on a phone is four screens of scrolling before the ledger. On a
 * phone the section shows one chart with a switcher above it; from `lg` up all
 * four are drawn as before, so the desktop loses nothing.
 *
 * ponytail: no carousel, no measuring. One index in state and a `hidden
 * lg:block` on the charts that are not it.
 */
import { useState } from "react";
import Link from "next/link";
import type { TrendMetric } from "@/lib/home-data";
import { PillTabs } from "./pill-tabs";
import { RangeBar } from "./range-bar";
import { Term } from "./term";
import { TrendChart } from "./trend-chart";
import { Card } from "./ui-kit";

export function KeyTrends({ trends }: { trends: TrendMetric[] }) {
  const [active, setActive] = useState(trends[0]?.metricCode ?? "");

  return (
    <div className="space-y-2">
      {trends.length > 1 && (
        <div className="lg:hidden">
          <PillTabs
            label="Which trend"
            active={active}
            tabs={trends.map((t) => ({
              id: t.metricCode,
              label: t.metricName,
            }))}
            onSelect={setActive}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {trends.map((t) => (
          <Card
            key={t.metricCode}
            className={t.metricCode === active ? "p-4" : "hidden p-4 lg:block"}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="t-title text-[13px] text-neutral-800">
                <Term code={t.metricCode}>{t.metricName}</Term>
              </span>
              <span className="t-meta text-[11px]">
                <span className="t-num">{t.points.length}</span> readings
              </span>
            </div>

            <TrendChart
              height={140}
              data={t.points.map((p) => ({
                date: p.date,
                value: p.value,
                unit: t.unit,
              }))}
              referenceRangeLow={t.refLow}
              referenceRangeHigh={t.refHigh}
              optimalRangeLow={t.optimalLow}
              optimalRangeHigh={t.optimalHigh}
              goalLow={t.goalLow}
              goalHigh={t.goalHigh}
              unit={t.unit}
              status={t.status}
            />

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display text-[26px] font-medium tracking-[-0.03em] tabular-nums text-neutral-900">
                {Number.isInteger(t.latestValue)
                  ? t.latestValue
                  : t.latestValue.toFixed(1)}
              </span>
              {t.unit && (
                <span className="t-num text-[11px] text-neutral-400">
                  {t.unit}
                </span>
              )}
            </div>
            <div className="mt-2">
              <RangeBar
                value={t.latestValue}
                prev={t.prevValue}
                refLow={t.refLow}
                refHigh={t.refHigh}
                optimalLow={t.optimalLow}
                optimalHigh={t.optimalHigh}
                goal={t.goalLow ?? t.goalHigh}
                unit={t.unit}
              />
            </div>
            <Link
              href={`/m/${t.metricCode}`}
              className="t-meta mt-2 inline-flex h-10 items-center gap-1 text-[12px] hover:text-neutral-900"
            >
              Every reading
              <span aria-hidden="true">→</span>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
