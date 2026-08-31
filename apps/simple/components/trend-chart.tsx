"use client";

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
      <p className="text-[11px] text-neutral-500 font-mono">
        {formatChartDate(String(label))}
      </p>
      <p
        className="mt-0.5 text-sm font-semibold font-mono tabular-nums"
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
          className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] font-mono"
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
  data,
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
}: TrendChartProps) {
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
  // Compute Y domain with padding
  const values = data.map((d) => d.value);
  const allValues = [
    ...values,
    ...(referenceRangeLow != null ? [referenceRangeLow] : []),
    ...(referenceRangeHigh != null ? [referenceRangeHigh] : []),
    ...(optimalRangeLow != null ? [optimalRangeLow] : []),
    ...(optimalRangeHigh != null ? [optimalRangeHigh] : []),
    ...(goalLow != null ? [goalLow] : []),
    ...(goalHigh != null ? [goalHigh] : []),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.15 || 1;
  const yMin = Math.floor(minVal - padding);
  const yMax = Math.ceil(maxVal + padding);

  const hasOptimal = optimalRangeLow != null || optimalRangeHigh != null;
  const hasReference = referenceRangeLow != null || referenceRangeHigh != null;
  const hasGoal = goalLow != null || goalHigh != null;

  return (
    <div>
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
            strokeWidth={2}
            dot={(props: Record<string, unknown>) => {
              const { cx, cy, index } = props as {
                cx: number;
                cy: number;
                index: number;
              };
              const isLast = index === data.length - 1;
              const pt = series[index];
              const abnormal = pt
                ? isAbnormal(pt.value, referenceRangeLow, referenceRangeHigh)
                : false;
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={isLast ? 5 : abnormal ? 4 : 3}
                  fill={abnormal ? "var(--color-health-warning-bg)" : "white"}
                  stroke={abnormal ? "var(--color-health-warning)" : stroke}
                  strokeWidth={2}
                />
              );
            }}
            activeDot={(props: {
              cx?: number;
              cy?: number;
              index?: number;
            }) => {
              const { cx = 0, cy = 0, index = 0 } = props;
              const pt = data[index];
              const abnormal = pt
                ? isAbnormal(pt.value, referenceRangeLow, referenceRangeHigh)
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
              <span className="text-[11px] text-neutral-400 font-mono">
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
              <span className="text-[11px] text-neutral-400 font-mono">
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
              <span className="text-[11px] text-neutral-400 font-mono">
                Your goal
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
