'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { HealthStatus } from './status-badge';

interface TrendChartDataPoint {
  date: string;
  value: number;
  unit?: string | null;
}

interface TrendChartProps {
  data: TrendChartDataPoint[];
  referenceRangeLow?: number | null;
  referenceRangeHigh?: number | null;
  unit?: string | null;
  status?: HealthStatus;
}

const statusStroke: Record<string, string> = {
  normal: 'var(--color-health-normal)',
  warning: 'var(--color-health-warning)',
  critical: 'var(--color-health-critical)',
  info: 'var(--color-accent-500)',
  neutral: 'var(--color-neutral-400)',
};

function formatChartDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

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

function CustomTooltip({ active, payload, label, referenceRangeLow, referenceRangeHigh }: CustomTooltipProps) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0];
  const dataPoint = point.payload as TrendChartDataPoint;
  const abnormal = isAbnormal(dataPoint.value, referenceRangeLow, referenceRangeHigh);

  return (
    <div
      className="rounded-lg border bg-white px-3 py-2 shadow-md"
      style={{
        borderColor: abnormal
          ? 'var(--color-health-warning-border)'
          : 'var(--color-neutral-200)',
      }}
    >
      <p className="text-[11px] text-neutral-500 font-mono">
        {formatChartDate(String(label))}
      </p>
      <p
        className="mt-0.5 text-sm font-semibold font-mono tabular-nums"
        style={{
          color: abnormal
            ? 'var(--color-health-warning)'
            : 'var(--color-neutral-900)',
        }}
      >
        {point.value}
        {dataPoint.unit && (
          <span className="ml-1 text-[11px] font-normal text-neutral-400">{dataPoint.unit}</span>
        )}
      </p>
      {abnormal && (
        <p
          className="mt-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em] font-mono"
          style={{ color: 'var(--color-health-warning)' }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: 'var(--color-health-warning)' }}
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
  unit,
  status = 'normal',
}: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-neutral-400">
        No data points available
      </div>
    );
  }

  const stroke = statusStroke[status] ?? statusStroke.normal;

  // Compute Y domain with padding
  const values = data.map((d) => d.value);
  const allValues = [
    ...values,
    ...(referenceRangeLow != null ? [referenceRangeLow] : []),
    ...(referenceRangeHigh != null ? [referenceRangeHigh] : []),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.15 || 1;
  const yMin = Math.floor(minVal - padding);
  const yMax = Math.ceil(maxVal + padding);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 32, bottom: 8, left: 8 }}>
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
        <XAxis
          dataKey="date"
          tickFormatter={formatChartDate}
          tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-neutral-400)' }}
          axisLine={{ stroke: 'var(--color-neutral-200)' }}
          tickLine={false}
          dy={8}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-neutral-400)' }}
          axisLine={false}
          tickLine={false}
          width={45}
          label={
            unit
              ? {
                  value: unit,
                  angle: -90,
                  position: 'insideLeft',
                  offset: 0,
                  style: {
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fill: 'var(--color-neutral-400)',
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
        <Line
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          dot={(props: Record<string, unknown>) => {
            const { cx, cy, index } = props as { cx: number; cy: number; index: number };
            const isLast = index === data.length - 1;
            const pt = data[index];
            const abnormal = pt ? isAbnormal(pt.value, referenceRangeLow, referenceRangeHigh) : false;
            return (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={isLast ? 5 : abnormal ? 4 : 3}
                fill={abnormal ? 'var(--color-health-warning-bg)' : 'white'}
                stroke={abnormal ? 'var(--color-health-warning)' : stroke}
                strokeWidth={2}
              />
            );
          }}
          activeDot={(props: { cx?: number; cy?: number; index?: number }) => {
            const { cx = 0, cy = 0, index = 0 } = props;
            const pt = data[index];
            const abnormal = pt ? isAbnormal(pt.value, referenceRangeLow, referenceRangeHigh) : false;
            return (
              <circle
                cx={cx}
                cy={cy}
                r={5}
                fill={abnormal ? 'var(--color-health-warning)' : stroke}
                stroke="white"
                strokeWidth={2}
              />
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
