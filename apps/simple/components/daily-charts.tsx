"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { rollingAverage } from "@/lib/daily";
import { cn } from "@/lib/utils";
import { MiniSparkline } from "./ui-kit";

export interface TrendRow {
  day: string;
  sleepHours: number | null;
  weightKg: number | null;
  steps: number | null;
  exerciseMin: number | null;
  alcoholUnits: number | null;
  energy: number | null;
  mood: number | null;
}

type Key = keyof Omit<TrendRow, "day">;

const TABS: { id: string; label: string; keys: Key[]; unit: string }[] = [
  { id: "sleep", label: "Sleep", keys: ["sleepHours"], unit: "h" },
  { id: "weight", label: "Weight", keys: ["weightKg"], unit: "kg" },
  { id: "steps", label: "Steps", keys: ["steps"], unit: "" },
  { id: "exercise", label: "Exercise", keys: ["exerciseMin"], unit: "min" },
  { id: "alcohol", label: "Alcohol", keys: ["alcoholUnits"], unit: "units" },
  { id: "mood", label: "Energy / mood", keys: ["energy", "mood"], unit: "1-5" },
];

const RANGES = [30, 90, 365];
const LINE_COLORS = ["var(--color-accent-500)", "var(--color-health-optimal)"];

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const axis = {
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  fill: "var(--color-neutral-400)",
};

/** Sleep, weight, steps, exercise, alcohol and mood over 30/90/365 days. */
export function DailyCharts({
  rows,
  draws,
}: {
  rows: TrendRow[];
  draws: string[];
}) {
  const [tabId, setTabId] = useState(TABS[0]!.id);
  const [range, setRange] = useState(30);
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0]!;

  const data = useMemo(() => {
    const window = rows.slice(-range);
    const avg = rollingAverage(
      window.map((r) => r[tab.keys[0]!] as number | null),
    );
    return window.map((r, i) => ({
      day: r.day,
      a: r[tab.keys[0]!] as number | null,
      b: tab.keys[1] ? (r[tab.keys[1]] as number | null) : null,
      avg: avg[i] ?? null,
    }));
  }, [rows, range, tab]);

  const filled = data.filter((d) => d.a != null || d.b != null).length;
  const visibleDraws = draws.filter((d) => data.some((r) => r.day === d));
  // A sparse series needs its dots, otherwise a single logged day draws nothing.
  const dot = filled <= 45 ? { r: 3, strokeWidth: 0, fill: LINE_COLORS[0] } : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="pill-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTabId(t.id)}
              className={cn("pill-tab", t.id === tabId && "pill-tab-active")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="pill-tabs">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn("pill-tab", r === range && "pill-tab-active")}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4">
        {filled === 0 ? (
          <p className="py-16 text-center font-body text-[13px] text-neutral-500">
            Nothing logged for {tab.label.toLowerCase()} in the last {range}{" "}
            days. Log it on Today.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top: 18, right: 24, bottom: 8, left: 0 }}>
              <CartesianGrid
                stroke="var(--color-neutral-100)"
                vertical={false}
              />
              {visibleDraws.map((d) => (
                <ReferenceLine
                  key={d}
                  x={d}
                  stroke="var(--color-health-critical)"
                  strokeDasharray="3 3"
                  label={{
                    value: "lab",
                    position: "top",
                    fontSize: 9,
                    fontFamily: "var(--font-mono)",
                    fill: "var(--color-health-critical)",
                  }}
                />
              ))}
              <XAxis
                dataKey="day"
                tickFormatter={shortDate}
                interval={Math.max(0, Math.ceil(data.length / 10) - 1)}
                tick={axis}
                axisLine={{ stroke: "var(--color-neutral-200)" }}
                tickLine={false}
                dy={6}
              />
              <YAxis
                tick={axis}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={tab.id === "mood" ? [1, 5] : ["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 6,
                  border: "1px solid var(--color-neutral-200)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                }}
                labelFormatter={(d) => String(d)}
              />
              <Line
                name={tab.keys[0]}
                type="monotone"
                dataKey="a"
                stroke={LINE_COLORS[0]}
                strokeWidth={2}
                dot={dot}
                connectNulls
              />
              {tab.keys[1] && (
                <Line
                  name={tab.keys[1]}
                  type="monotone"
                  dataKey="b"
                  stroke={LINE_COLORS[1]}
                  strokeWidth={2}
                  dot={dot ? { ...dot, fill: LINE_COLORS[1] } : false}
                  connectNulls
                />
              )}
              {!tab.keys[1] && (
                <Line
                  name="7-day avg"
                  type="monotone"
                  dataKey="avg"
                  stroke="var(--color-neutral-900)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="mt-2 font-mono text-[10px] text-neutral-400">
          {filled} of {data.length} days logged
          {visibleDraws.length
            ? ` · ${visibleDraws.length} lab draw${visibleDraws.length === 1 ? "" : "s"} marked in red`
            : ""}
        </p>
      </div>
    </div>
  );
}

/** The three 30-day sparklines under the /today form. */
export function DailySparks({
  series,
}: {
  series: { day: string; sleep: number | null; weight: number | null; steps: number | null }[];
}) {
  const specs = [
    { label: "Sleep", key: "sleep" as const, unit: "h" },
    { label: "Weight", key: "weight" as const, unit: "kg" },
    { label: "Steps", key: "steps" as const, unit: "" },
  ];

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {specs.map((s) => {
        const values = series
          .map((d) => d[s.key])
          .filter((v): v is number => v != null);
        const last = values[values.length - 1];
        return (
          <div key={s.key} className="card flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
                {s.label}
              </span>
              <span className="font-mono text-[16px] font-semibold tabular-nums">
                {last ?? "—"}
                <span className="ml-1 text-[10px] font-normal text-neutral-400">
                  {last != null ? s.unit : ""}
                </span>
              </span>
            </div>
            <MiniSparkline
              data={values.slice(-30)}
              color="var(--color-accent-500)"
              width={90}
              height={26}
            />
          </div>
        );
      })}
    </div>
  );
}
