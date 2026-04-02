'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useDynamicStatus } from '@/hooks/use-dynamic-status';
import { formatDate, formatObsValue } from '@/lib/utils';
import { StatusBadge, type HealthStatus } from '@/components/health/status-badge';
import { MiniSparkline } from '@/components/health/mini-sparkline';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Pill,
  ArrowRight,
  GitCompareArrows,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CorrelationMetric {
  metricCode: string;
  metricName: string;
  unit: string | null;
  beforeAvg: number;
  afterAvg: number;
  changePct: number;
  beforeStatus: HealthStatus;
  afterStatus: HealthStatus;
  direction: 'improved' | 'worsened' | 'unchanged';
  sparkData: number[];
  medStartIndex: number; // index in sparkData where medication started
}

interface MedicationCorrelation {
  medicationId: string;
  medicationName: string;
  dosage: string | null;
  startDate: string;
  daysSinceStart: number;
  metrics: CorrelationMetric[];
}

export default function CorrelationsPage() {
  const { getStatus } = useDynamicStatus();
  const observations = trpc.observations.list.useQuery({ limit: 200 });
  const medications = trpc.medications.list.useQuery({});
  const metricDefs = trpc.metrics.list.useQuery();

  const [selectedMedId, setSelectedMedId] = useState<string | null>(null);

  const isLoading = observations.isLoading || medications.isLoading || metricDefs.isLoading;

  const obsItems = observations.data?.items ?? [];
  const medItems = medications.data?.items ?? [];
  const defs = metricDefs.data ?? [];

  const defMap = useMemo(() => {
    const map = new Map<string, { name: string; unit: string | null; displayPrecision: number | null }>();
    for (const d of defs) {
      map.set(d.id, { name: d.name, unit: d.unit, displayPrecision: d.displayPrecision });
    }
    return map;
  }, [defs]);

  // Compute correlations for each medication
  const correlations = useMemo<MedicationCorrelation[]>(() => {
    const medsWithDates = medItems.filter((m) => m.startDate);
    if (medsWithDates.length === 0 || obsItems.length === 0) return [];

    const now = Date.now();

    return medsWithDates.map((med) => {
      const medStart = new Date(med.startDate!).getTime();
      const daysSinceStart = Math.floor((now - medStart) / (1000 * 60 * 60 * 24));

      // Group observations by metric
      const byMetric = new Map<string, typeof obsItems>();
      for (const obs of obsItems) {
        const existing = byMetric.get(obs.metricCode) ?? [];
        existing.push(obs);
        byMetric.set(obs.metricCode, existing);
      }

      const metrics: CorrelationMetric[] = [];

      for (const [code, metricObs] of byMetric) {
        const sorted = [...metricObs].sort(
          (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
        );

        const before = sorted.filter(
          (o) => new Date(o.observedAt).getTime() < medStart && o.valueNumeric != null,
        );
        const after = sorted.filter(
          (o) => new Date(o.observedAt).getTime() >= medStart && o.valueNumeric != null,
        );

        // Need data on both sides to show a correlation
        if (before.length === 0 || after.length === 0) continue;

        const beforeAvg = before.reduce((sum, o) => sum + (o.valueNumeric ?? 0), 0) / before.length;
        const afterAvg = after.reduce((sum, o) => sum + (o.valueNumeric ?? 0), 0) / after.length;
        const changePct = beforeAvg !== 0 ? ((afterAvg - beforeAvg) / Math.abs(beforeAvg)) * 100 : 0;

        // Determine if change is improvement, worsening, or unchanged
        const latestBefore = before[before.length - 1]!;
        const latestAfter = after[after.length - 1]!;
        const beforeStatus = getStatus(latestBefore);
        const afterStatus = getStatus(latestAfter);

        let direction: 'improved' | 'worsened' | 'unchanged';
        const statusOrder = { critical: 0, warning: 1, normal: 2 };
        const beforeOrd = statusOrder[beforeStatus as keyof typeof statusOrder] ?? 2;
        const afterOrd = statusOrder[afterStatus as keyof typeof statusOrder] ?? 2;

        if (afterOrd > beforeOrd) {
          direction = 'improved';
        } else if (afterOrd < beforeOrd) {
          direction = 'worsened';
        } else if (Math.abs(changePct) < 5) {
          direction = 'unchanged';
        } else {
          // Same status but notable change - check if moving toward or away from normal
          // If value was out of range and moved closer to range → improved
          const refLow = latestAfter.referenceRangeLow;
          const refHigh = latestAfter.referenceRangeHigh;
          if (refLow != null && refHigh != null) {
            const mid = (refLow + refHigh) / 2;
            const beforeDist = Math.abs(beforeAvg - mid);
            const afterDist = Math.abs(afterAvg - mid);
            direction = afterDist < beforeDist ? 'improved' : afterDist > beforeDist ? 'worsened' : 'unchanged';
          } else {
            direction = 'unchanged';
          }
        }

        // Build sparkline data (chronological, all observations)
        const allSorted = sorted.filter((o) => o.valueNumeric != null);
        const sparkData = allSorted.map((o) => o.valueNumeric ?? 0);
        // Find the index where medication started
        const medStartIndex = allSorted.findIndex(
          (o) => new Date(o.observedAt).getTime() >= medStart,
        );

        const def = defMap.get(code);

        metrics.push({
          metricCode: code,
          metricName: def?.name ?? code.replace(/_/g, ' '),
          unit: latestAfter.unit ?? def?.unit ?? null,
          beforeAvg: Math.round(beforeAvg * 100) / 100,
          afterAvg: Math.round(afterAvg * 100) / 100,
          changePct: Math.round(changePct * 10) / 10,
          beforeStatus,
          afterStatus,
          direction,
          sparkData,
          medStartIndex: medStartIndex >= 0 ? medStartIndex : 0,
        });
      }

      // Sort: improved first, then worsened, then unchanged
      const dirOrder = { improved: 0, worsened: 1, unchanged: 2 };
      metrics.sort(
        (a, b) => dirOrder[a.direction] - dirOrder[b.direction] || Math.abs(b.changePct) - Math.abs(a.changePct),
      );

      return {
        medicationId: med.id,
        medicationName: med.name,
        dosage: med.dosage,
        startDate: med.startDate!,
        daysSinceStart,
        metrics,
      };
    }).filter((c) => c.metrics.length > 0);
  }, [obsItems, medItems, defMap]);

  const selectedCorrelation = selectedMedId
    ? correlations.find((c) => c.medicationId === selectedMedId) ?? correlations[0]
    : correlations[0];

  // Auto-select first medication
  const effectiveSelected = selectedCorrelation ?? null;

  if (isLoading) {
    return (
      <div>
        <div className="card h-16 animate-pulse bg-neutral-50" />
        <div className="mt-4 card h-64 animate-pulse bg-neutral-50" />
      </div>
    );
  }

  if (correlations.length === 0) {
    return (
      <div>
        <h1 className="text-[24px] font-display font-medium tracking-[-0.03em] text-neutral-900 mb-6">
          Correlations
        </h1>
        <div className="card p-8 text-center">
          <GitCompareArrows className="size-8 text-neutral-300 mx-auto mb-3" />
          <h2 className="text-[16px] font-semibold text-neutral-900 font-display">No correlations found</h2>
          <p className="text-[13px] text-neutral-500 font-body mt-1 max-w-md mx-auto">
            Correlations show how your biomarkers changed after starting medications.
            You need lab results from both before and after starting a medication to see correlations.
          </p>
        </div>
      </div>
    );
  }

  const improved = effectiveSelected?.metrics.filter((m) => m.direction === 'improved') ?? [];
  const worsened = effectiveSelected?.metrics.filter((m) => m.direction === 'worsened') ?? [];
  const unchanged = effectiveSelected?.metrics.filter((m) => m.direction === 'unchanged') ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[24px] font-display font-medium tracking-[-0.03em] text-neutral-900">
          Correlations
        </h1>
        <p className="text-[13px] text-neutral-500 font-body mt-1">
          How your biomarkers changed after starting medications
        </p>
      </div>

      {/* Medication selector */}
      {correlations.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {correlations.map((c) => (
            <button
              key={c.medicationId}
              onClick={() => setSelectedMedId(c.medicationId)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 text-[12px] font-medium font-body border transition-colors cursor-pointer',
                (effectiveSelected?.medicationId === c.medicationId)
                  ? 'border-accent-500 bg-accent-50 text-accent-700'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300',
              )}
            >
              <Pill className="size-3" />
              {c.medicationName}
              <span className="text-[10px] font-mono text-neutral-400 ml-1">
                {c.metrics.length} metrics
              </span>
            </button>
          ))}
        </div>
      )}

      {effectiveSelected && (
        <>
          {/* Medication info */}
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-8 bg-accent-50 border border-accent-100">
                  <Pill className="size-4 text-accent-600" />
                </div>
                <div>
                  <span className="text-[15px] font-semibold text-neutral-900 font-display">
                    {effectiveSelected.medicationName}
                  </span>
                  {effectiveSelected.dosage && (
                    <span className="text-[12px] text-neutral-500 font-mono ml-2">
                      {effectiveSelected.dosage}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono text-neutral-500 block">
                  Started {formatDate(effectiveSelected.startDate)}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">
                  {effectiveSelected.daysSinceStart} days ago
                </span>
              </div>
            </div>

            {/* Quick summary */}
            <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-4">
              {improved.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-health-normal">
                  <TrendingUp className="size-3" />
                  {improved.length} improved
                </span>
              )}
              {worsened.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-health-warning">
                  <TrendingDown className="size-3" />
                  {worsened.length} worsened
                </span>
              )}
              {unchanged.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-neutral-400">
                  <Minus className="size-3" />
                  {unchanged.length} stable
                </span>
              )}
            </div>
          </div>

          {/* Correlation sections */}
          {improved.length > 0 && (
            <CorrelationSection
              title="Improved"
              metrics={improved}
              accentColor="var(--color-health-normal)"
            />
          )}
          {worsened.length > 0 && (
            <CorrelationSection
              title="Worsened"
              metrics={worsened}
              accentColor="var(--color-health-warning)"
            />
          )}
          {unchanged.length > 0 && (
            <CorrelationSection
              title="Stable"
              metrics={unchanged}
              accentColor="var(--color-neutral-400)"
            />
          )}
        </>
      )}
    </div>
  );
}

function CorrelationSection({
  title,
  metrics,
  accentColor,
}: {
  title: string;
  metrics: CorrelationMetric[];
  accentColor: string;
}) {
  return (
    <div className="card mt-4">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-center gap-2">
        <span
          className="size-[5px]"
          style={{ backgroundColor: accentColor }}
        />
        <h3 className="text-[13px] font-semibold text-neutral-900 font-display">
          {title}
        </h3>
        <span className="text-[10px] font-mono text-neutral-400 ml-1">
          {metrics.length}
        </span>
      </div>
      <div className="divide-y divide-neutral-50">
        {metrics.map((m) => (
          <div
            key={m.metricCode}
            className="px-4 py-3 grid grid-cols-[1fr_auto_auto_auto] items-center gap-4"
          >
            <div>
              <span className="text-[13px] font-medium text-neutral-800 font-body block">
                {m.metricName}
              </span>
              <div className="flex items-center gap-1 mt-0.5">
                <StatusBadge status={m.beforeStatus} label={m.beforeStatus} />
                <ArrowRight className="size-3 text-neutral-300" />
                <StatusBadge status={m.afterStatus} label={m.afterStatus} />
              </div>
            </div>

            {/* Before/After values */}
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-neutral-400">
                  {m.beforeAvg}
                </span>
                <ArrowRight className="size-3 text-neutral-300" />
                <span className="text-[13px] font-mono font-semibold text-neutral-900 tabular-nums">
                  {m.afterAvg}
                </span>
                {m.unit && (
                  <span className="text-[10px] font-mono text-neutral-400">
                    {m.unit}
                  </span>
                )}
              </div>
            </div>

            {/* Change percentage */}
            <div className="min-w-[60px] text-right">
              <span
                className="text-[12px] font-mono font-bold tabular-nums"
                style={{ color: accentColor }}
              >
                {m.changePct > 0 ? '+' : ''}
                {m.changePct}%
              </span>
            </div>

            {/* Sparkline with medication start marker */}
            <div className="flex items-center">
              {m.sparkData.length >= 2 && (
                <CorrelationSparkline
                  data={m.sparkData}
                  medStartIndex={m.medStartIndex}
                  color={accentColor}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CorrelationSparkline({
  data,
  medStartIndex,
  color,
}: {
  data: number[];
  medStartIndex: number;
  color: string;
}) {
  const width = 80;
  const height = 24;
  const pad = 3;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  if (data.length < 2) return null;

  const divisor = data.length - 1;
  const coords = data.map((v, i) => ({
    x: pad + (i / divisor) * (width - pad * 2),
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));

  const points = coords.map((c) => `${c.x},${c.y}`).join(' ');

  // Medication start line X position
  const medX = medStartIndex >= 0 && medStartIndex < data.length
    ? pad + (medStartIndex / divisor) * (width - pad * 2)
    : null;

  const last = coords[coords.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Medication start marker line */}
      {medX !== null && (
        <line
          x1={medX}
          y1={0}
          x2={medX}
          y2={height}
          stroke="var(--color-accent-300)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <rect x={last.x - 2.5} y={last.y - 2.5} width="5" height="5" fill={color} />}
    </svg>
  );
}
