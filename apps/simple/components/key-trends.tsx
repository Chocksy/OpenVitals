"use client";

/**
 * Key trends on Home: the same history chart and the same ruler the marker
 * page draws, at drawer size.
 *
 * Four charts on a phone is four screens of scrolling before the ledger, so
 * on a phone the section shows one chart with a switcher above it; from `lg`
 * up all four are drawn.
 *
 * Phase 30c: recharts is gone. `HistoryChart` is a server component but this
 * one holds the switcher's state, so it stays a client component and renders
 * the chart's markup as its child.
 */
import { useState } from "react";
import Link from "next/link";
import type { TrendMetric } from "@/lib/home-data";
import { HistoryChart } from "./history-chart";
import { PillTabs } from "./pill-tabs";
import { Ruler } from "./ruler";
import { Term } from "./term";
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
              <span className="t-title text-[13px]">
                <Term code={t.metricCode}>{t.metricName}</Term>
              </span>
              <span className="t-meta text-[11px]">
                <span className="t-num">{t.points.length}</span> readings
              </span>
            </div>

            <div className="mt-2">
              <HistoryChart
                mini
                title="History"
                unit={t.unit}
                points={t.points}
                refLow={t.refLow}
                refHigh={t.refHigh}
                optimalLow={t.optimalLow}
                optimalHigh={t.optimalHigh}
                noun="readings"
              />
            </div>

            <div className="mt-3">
              <Ruler
                value={t.latestValue}
                prev={t.prevValue}
                prevDate={t.prevDate}
                refLow={t.refLow}
                refHigh={t.refHigh}
                optimalLow={t.optimalLow}
                optimalHigh={t.optimalHigh}
                target={t.goalLow ?? t.goalHigh}
                targetLow={t.goalLow}
                targetHigh={t.goalHigh}
                targetDate={t.goalDue}
                unit={t.unit}
              />
            </div>

            <Link
              href={`/blood/m/${t.metricCode}`}
              className="t-meta hit-40 mt-2 inline-flex items-center gap-1 text-[12px]"
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
