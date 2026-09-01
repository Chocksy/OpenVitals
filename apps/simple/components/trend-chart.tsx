"use client";

import { useEffect, useRef, useState } from "react";
import { chartDomain } from "./chart-domain";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from "recharts";
import { formatChartDate } from "@/lib/utils";
import type { HealthStatus } from "@/lib/status";

interface TrendChartDataPoint {
  date: string;
  value: number;
  unit?: string | null;
  /** the dashed line that runs from the last reading to the expected value */
  projected?: number;
}

/** What the engine wrote down before the draw, drawn ahead of the line. */
export interface TrendProjection {
  madeAt: string;
  retestAt: string;
  expected: number;
  low: number;
  high: number;
  verdict?: "better" | "as_expected" | "worse" | "unmeasured" | null;
  resolvedValue?: number | null;
}

interface TrendChartProps {
  data: TrendChartDataPoint[];
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  optimalRangeLow?: number | null;
  optimalRangeHigh?: number | null;
  goalLow?: number | null;
  goalHigh?: number | null;
  unit?: string | null;
  status?: HealthStatus;
  /** Home draws the same chart small; /m/[code] keeps the full height. */
  height?: number;
  projection?: TrendProjection | null;
  /**
   * Phase 24b: a phone series is a daily line, not a row of dots. 776 nights
   * of sleep drawn as circles is a caterpillar; the same data as a line with a
   * 30/90/365/all switch is a trend.
   */
  daily?: boolean;
}

const RANGES: { label: string; days: number | null }[] = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "all", days: null },
];

/** The points inside the last `days`, counted back from the newest one. */
export function inRange<T extends { date: string }>(
  points: T[],
  days: number | null,
): T[] {
  const last = points[points.length - 1]?.date;
  if (days == null || !last) return points;
  const from = new Date(
    new Date(`${last}T00:00:00Z`).getTime() - days * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  return points.filter((p) => p.date >= from);
}

const statusStroke: Record<string, string> = {
  normal: "var(--color-health-normal)",
  warning: "var(--color-health-warning)",
  critical: "var(--color-health-critical)",
  info: "var(--color-accent-500)",
  neutral: "var(--color-neutral-400)",
};

function isAbnormal(
  value: number,
  low?: number | null,
  high?: number | null,
): boolean {
  if (low != null && value < low) return true;
  if (high != null && value > high) return true;
  return false;
}

interface CustomTooltipProps {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<{ value?: any; payload?: any }>;
  label?: string | number;
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
}

function CustomTooltip({
  active,
  payload,
  label,
  referenceRangeLow,
  referenceRangeHigh,
}: CustomTooltipProps) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0];
  const dataPoint = point.payload as TrendChartDataPoint;
  const abnormal = isAbnormal(
    dataPoint.value,
    referenceRangeLow,
    referenceRangeHigh,
  );

  return (
    <div
      className="rounded-lg border bg-neutral-0 px-3 py-2 shadow-md"
      style={{
        borderColor: abnormal
          ? "var(--color-health-warning-border)"
          : "var(--color-neutral-200)",
      }}
    >
      <p className="t-meta text-[11px]">
        {formatChartDate(String(label))}
      </p>
      <p
        className="t-num mt-0.5 text-sm font-semibold"
        style={{
          color: abnormal
            ? "var(--color-health-warning)"
            : "var(--color-neutral-900)",
        }}
      >
        {point.value}
        {dataPoint.unit && (
          <span className="ml-1 text-[11px] font-normal text-neutral-400">
            {dataPoint.unit}
          </span>
        )}
      </p>
      {abnormal && (
        <p
          className="t-meta mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
          style={{ color: "var(--color-health-warning)" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "var(--color-health-warning)" }}
          />
          Abnormal
        </p>
      )}
    </div>
  );
}

export function TrendChart({
  data: all,
  referenceRangeLow,
  referenceRangeHigh,
  optimalRangeLow,
  optimalRangeHigh,
  goalLow,
  goalHigh,
  unit,
  status = "normal",
  height = 300,
  projection = null,
  daily = false,
}: TrendChartProps) {
  const [days, setDays] = useState<number | null>(90);
  /**
   * Phase 24d, the blank chart on Home's spear card.
   *
   * `ResponsiveContainer` with a percentage width renders **nothing** —
   * server-side and on the first client paint — because recharts starts it at
   * `initialDimension {-1,-1}` and returns `null` for a non-positive size
   * (recharts 3.8 `component/ResponsiveContainer.js`). The server therefore
   * ships `<div class="recharts-responsive-container" style="height:140px">`
   * with an empty child, and the card's caption and legend render around a
   * void until the client's ResizeObserver reports a width. That void is what
   * the audit photographed.
   *
   * The fix is a skeleton in the same slot (`14-skeleton-reveal.md`), revealed
   * the moment recharts puts an `<svg>` in it. The signal is the drawing
   * itself rather than `ResponsiveContainer`'s `onResize`, which recharts 3.8
   * only fires from its ResizeObserver and which never arrived here on the
   * first paint. A chart that never measures now keeps a loading state
   * instead of leaving a labelled hole.
   */
  const slot = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = slot.current;
    if (!el || drawn) return;
    if (el.querySelector("svg")) {
      setDrawn(true);
      return;
    }
    const seen = new MutationObserver(() => {
      if (el.querySelector("svg")) setDrawn(true);
    });
    seen.observe(el, { childList: true, subtree: true });
    return () => seen.disconnect();
  }, [drawn]);

  const data = daily ? inRange(all, days) : all;

  if (data.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-neutral-400"
      >
        No data points available
      </div>
    );
  }

  const stroke = statusStroke[status] ?? statusStroke.normal;

  // The projection is one more point on the x axis, at the retest date, joined
  // to the last real reading by a dashed line. Recharts wants it in the same
  // array as the readings, so it is added here rather than drawn separately.
  const series: TrendChartDataPoint[] = projection
    ? [
        ...data.map((d, i) =>
          i === data.length - 1 ? { ...d, projected: d.value } : d,
        ),
        ...(data.some((d) => d.date === projection.retestAt)
          ? []
          : [
              {
                date: projection.retestAt,
                value: Number.NaN,
                projected: projection.expected,
              },
            ]),
      ]
    : data;

  // ponytail: the old guess at the label count read `window.innerWidth`, which
  // is wrong for any chart that is not the full page. `minTickGap` lets
  // recharts drop the colliding labels itself, at any container width.
  const { yMin, yMax } = chartDomain(data, {
    referenceRangeLow,
    referenceRangeHigh,
    optimalRangeLow,
    optimalRangeHigh,
    goalLow,
    goalHigh,
  });

  const hasOptimal = optimalRangeLow != null || optimalRangeHigh != null;
  const hasReference = referenceRangeLow != null || referenceRangeHigh != null;
  const hasGoal = goalLow != null || goalHigh != null;

  return (
    <div>
      {daily && (
        <div className="mb-2 flex items-center justify-end">
          <div className="pill-tabs">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setDays(r.days)}
                className={`pill-tab${r.days === days ? " pill-tab-active" : ""}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        ref={slot}
        className={`t-skel${drawn ? " is-revealed" : ""}`}
        style={{ height }}
      >
        <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
          <div className="skeleton size-full" />
        </div>
        <div className="t-skel-content">
          <ResponsiveContainer width="100%" height={height}>
            <LineChart
              data={series}
              margin={{ top: 8, right: 32, bottom: 8, left: 8 }}
            >
              {referenceRangeLow != null && referenceRangeHigh != null && (
                <ReferenceArea
                  y1={referenceRangeLow}
                  y2={referenceRangeHigh}
                  fill="var(--color-health-normal-bg)"
                  stroke="var(--color-health-normal-border)"
                  strokeDasharray="3 3"
                  fillOpacity={0.6}
                />
              )}
              {optimalRangeLow != null && optimalRangeHigh != null && (
                <ReferenceArea
                  y1={optimalRangeLow}
                  y2={optimalRangeHigh}
                  fill="var(--color-health-optimal-bg)"
                  stroke="var(--color-health-optimal-border)"
                  strokeDasharray="4 2"
                  fillOpacity={0.4}
                />
              )}
              {hasGoal && (
                <ReferenceArea
                  y1={goalLow ?? yMin}
                  y2={goalHigh ?? yMax}
                  fill="var(--color-accent-500)"
                  stroke="var(--color-accent-500)"
                  strokeDasharray="6 3"
                  fillOpacity={0.07}
                />
              )}
              {projection && (
                <ReferenceArea
                  y1={projection.low}
                  y2={projection.high}
                  fill="var(--color-accent-500)"
                  stroke="var(--color-accent-500)"
                  strokeDasharray="2 4"
                  fillOpacity={0.12}
                  label={{
                    value: `expected ${projection.expected} by ${projection.retestAt}`,
                    position: "insideTopRight",
                    style: {
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fill: "var(--color-accent-600)",
                    },
                  }}
                />
              )}
              <XAxis
                dataKey="date"
                tickFormatter={formatChartDate}
                interval="preserveStartEnd"
                minTickGap={44}
                tick={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--color-neutral-400)",
                }}
                axisLine={{ stroke: "var(--color-neutral-200)" }}
                tickLine={false}
                dy={8}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fill: "var(--color-neutral-400)",
                }}
                axisLine={false}
                tickLine={false}
                width={45}
                label={
                  unit
                    ? {
                        value: unit,
                        angle: -90,
                        position: "insideLeft",
                        offset: 0,
                        style: {
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          fill: "var(--color-neutral-400)",
                        },
                      }
                    : undefined
                }
              />
              <Tooltip
                content={(props) => (
                  <CustomTooltip
                    {...props}
                    referenceRangeLow={referenceRangeLow}
                    referenceRangeHigh={referenceRangeHigh}
                  />
                )}
              />
              {projection && (
                <Line
                  type="linear"
                  dataKey="projected"
                  isAnimationActive={false}
                  stroke="var(--color-accent-500)"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  connectNulls
                  dot={false}
                  activeDot={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                isAnimationActive={false}
                stroke={stroke}
                strokeWidth={daily ? 1.5 : 2}
                dot={
                  daily
                    ? false
                    : (props: Record<string, unknown>) => {
                        const { cx, cy, index } = props as {
                          cx: number;
                          cy: number;
                          index: number;
                        };
                        const isLast = index === data.length - 1;
                        const pt = series[index];
                        const abnormal = pt
                          ? isAbnormal(
                              pt.value,
                              referenceRangeLow,
                              referenceRangeHigh,
                            )
                          : false;
                        return (
                          <circle
                            key={index}
                            cx={cx}
                            cy={cy}
                            r={isLast ? 5 : abnormal ? 4 : 3}
                            fill={
                              abnormal
                                ? "var(--color-health-warning-bg)"
                                : "white"
                            }
                            stroke={
                              abnormal ? "var(--color-health-warning)" : stroke
                            }
                            strokeWidth={2}
                          />
                        );
                      }
                }
                activeDot={(props: {
                  cx?: number;
                  cy?: number;
                  index?: number;
                }) => {
                  const { cx = 0, cy = 0, index = 0 } = props;
                  const pt = data[index];
                  const abnormal = pt
                    ? isAbnormal(
                        pt.value,
                        referenceRangeLow,
                        referenceRangeHigh,
                      )
                    : false;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={abnormal ? "var(--color-health-warning)" : stroke}
                      stroke="white"
                      strokeWidth={2}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      {(hasReference || hasOptimal || hasGoal) && (
        <div className="mt-2 flex items-center gap-4 px-2">
          {hasReference && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-5 rounded-sm border border-dashed"
                style={{
                  backgroundColor: "var(--color-health-normal-bg)",
                  borderColor: "var(--color-health-normal-border)",
                }}
              />
              <span className="t-meta text-[11px]">
                Standard
              </span>
            </div>
          )}
          {hasOptimal && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-5 rounded-sm border border-dashed"
                style={{
                  backgroundColor: "var(--color-health-optimal-bg)",
                  borderColor: "var(--color-health-optimal-border)",
                }}
              />
              <span className="t-meta text-[11px]">
                Optimal
              </span>
            </div>
          )}
          {hasGoal && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-5 rounded-sm border border-dashed"
                style={{
                  backgroundColor: "var(--color-accent-50)",
                  borderColor: "var(--color-accent-500)",
                }}
              />
              <span className="t-meta text-[11px]">
                Your goal
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
