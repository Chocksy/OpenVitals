'use client';

import { useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useSession } from '@/lib/auth/client';
import { useDynamicStatus } from '@/hooks/use-dynamic-status';
import { formatDate, formatObsValue } from '@/lib/utils';
import { StatusBadge, type HealthStatus } from '@/components/health/status-badge';
import { MiniSparkline } from '@/components/health/mini-sparkline';
import { Printer, FileText } from 'lucide-react';
import { Button } from '@/components/button';
import { cn } from '@/lib/utils';
import { calculateHealthScore } from '@/components/home/health-score';

const CATEGORY_LABELS: Record<string, string> = {
  blood_chemistry: 'Blood Chemistry',
  hematology: 'Hematology',
  endocrine: 'Endocrine',
  vitamins_minerals: 'Vitamins & Minerals',
  inflammation: 'Inflammation',
  liver: 'Liver Function',
  kidney: 'Kidney Function',
  cardiac: 'Cardiac',
  iron_studies: 'Iron Studies',
  urinalysis: 'Urinalysis',
  thyroid: 'Thyroid',
  metabolic: 'Metabolic',
  lipid: 'Lipid Panel',
  cbc: 'Complete Blood Count',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const statusColor: Record<string, string> = {
  normal: 'var(--color-health-normal)',
  warning: 'var(--color-health-warning)',
  critical: 'var(--color-health-critical)',
};

interface MetricRow {
  metricCode: string;
  metricName: string;
  latestValue: number | null;
  valueText: string | null;
  unit: string | null;
  status: HealthStatus;
  refLow: number | null;
  refHigh: number | null;
  observedAt: string | Date;
  sparkData: number[];
  displayPrecision: number | null;
}

interface CategoryGroup {
  category: string;
  metrics: MetricRow[];
  normalCount: number;
  flaggedCount: number;
}

const DATE_RANGES = [
  { key: 'all', label: 'All Time' },
  { key: '3m', label: 'Last 3 Months', months: 3 },
  { key: '6m', label: 'Last 6 Months', months: 6 },
  { key: '1y', label: 'Last Year', months: 12 },
] as const;

type DateRangeKey = (typeof DATE_RANGES)[number]['key'];

export default function ReportsPage() {
  const { data: session } = useSession();
  const { getStatus } = useDynamicStatus();
  const observations = trpc.observations.list.useQuery({ limit: 200 });
  const medications = trpc.medications.list.useQuery({});
  const conditions = trpc.conditions.list.useQuery();
  const encounters = trpc.encounters.list.useQuery();
  const preferences = trpc.preferences.get.useQuery();
  const metricDefs = trpc.metrics.list.useQuery();
  const retests = trpc.testing['retest.getRecommendations'].useQuery();
  const reportRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');

  const isLoading = observations.isLoading || medications.isLoading || preferences.isLoading || metricDefs.isLoading;

  // Filter observations by date range
  const allObsItems = observations.data?.items ?? [];
  const obsItems = useMemo(() => {
    const range = DATE_RANGES.find((r) => r.key === dateRange);
    if (!range || !('months' in range)) return allObsItems;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - range.months);
    return allObsItems.filter((o) => new Date(o.observedAt) >= cutoff);
  }, [allObsItems, dateRange]);
  const medItems = medications.data?.items ?? [];
  const condItems = conditions.data ?? [];
  const encItems = encounters.data ?? [];
  const retestItems = retests.data ?? [];
  const prefs = preferences.data;
  const defs = metricDefs.data ?? [];

  // Build metric definitions lookup
  const defMap = useMemo(() => {
    const map = new Map<string, { name: string; unit: string | null; displayPrecision: number | null }>();
    for (const d of defs) {
      map.set(d.id, { name: d.name, unit: d.unit, displayPrecision: d.displayPrecision });
    }
    return map;
  }, [defs]);

  // Build category groups
  const categoryGroups = useMemo<CategoryGroup[]>(() => {
    const byMetric = new Map<string, typeof obsItems>();
    for (const obs of obsItems) {
      const existing = byMetric.get(obs.metricCode) ?? [];
      existing.push(obs);
      byMetric.set(obs.metricCode, existing);
    }

    const catMap = new Map<string, MetricRow[]>();

    for (const [code, metricObs] of byMetric) {
      const sorted = [...metricObs].sort(
        (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      );
      const latest = sorted[0]!;
      const status = getStatus(latest);
      const def = defMap.get(code);
      const sparkData = sorted.slice(0, 8).reverse().map((o) => o.valueNumeric ?? 0);
      const category = latest.category ?? 'other';

      const row: MetricRow = {
        metricCode: code,
        metricName: def?.name ?? code.replace(/_/g, ' '),
        latestValue: latest.valueNumeric ?? null,
        valueText: latest.valueText ?? null,
        unit: latest.unit ?? def?.unit ?? null,
        status,
        refLow: latest.referenceRangeLow ?? null,
        refHigh: latest.referenceRangeHigh ?? null,
        observedAt: latest.observedAt,
        sparkData,
        displayPrecision: def?.displayPrecision ?? null,
      };

      const existing = catMap.get(category) ?? [];
      existing.push(row);
      catMap.set(category, existing);
    }

    return Array.from(catMap.entries())
      .map(([category, metrics]) => {
        // Sort: flagged first, then alphabetical
        metrics.sort((a, b) => {
          const aFlag = a.status !== 'normal' ? 0 : 1;
          const bFlag = b.status !== 'normal' ? 0 : 1;
          if (aFlag !== bFlag) return aFlag - bFlag;
          return a.metricName.localeCompare(b.metricName);
        });

        return {
          category,
          metrics,
          normalCount: metrics.filter((m) => m.status === 'normal').length,
          flaggedCount: metrics.filter((m) => m.status !== 'normal').length,
        };
      })
      .sort((a, b) => b.flaggedCount - a.flaggedCount || b.metrics.length - a.metrics.length);
  }, [obsItems, defMap]);

  const activeMeds = medItems.filter((m) => m.isActive);
  const totalMetrics = categoryGroups.reduce((sum, g) => sum + g.metrics.length, 0);
  const totalFlagged = categoryGroups.reduce((sum, g) => sum + g.flaggedCount, 0);
  const totalNormal = categoryGroups.reduce((sum, g) => sum + g.normalCount, 0);
  const totalCritical = categoryGroups.reduce((sum, g) => sum + g.metrics.filter((m) => m.status === 'critical').length, 0);
  const totalWarning = totalFlagged - totalCritical;
  const healthScore = calculateHealthScore(totalNormal, totalWarning, totalCritical);

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div>
        <div className="card h-16 animate-pulse bg-neutral-50" />
        <div className="mt-4 card h-96 animate-pulse bg-neutral-50" />
      </div>
    );
  }

  if (obsItems.length === 0) {
    return (
      <div className="card p-8 text-center">
        <FileText className="size-8 text-neutral-300 mx-auto mb-3" />
        <h2 className="text-[16px] font-semibold text-neutral-900 font-display">No data for report</h2>
        <p className="text-[13px] text-neutral-500 font-body mt-1">
          Upload lab results first to generate a health report.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with print button */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-[24px] font-display font-medium tracking-[-0.03em] text-neutral-900">
            Health Report
          </h1>
          <p className="text-[13px] text-neutral-500 font-body mt-1">
            Comprehensive summary of your health data for sharing with providers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range filter */}
          <div className="flex items-center border border-neutral-200 bg-neutral-50 p-0.5">
            {DATE_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setDateRange(r.key)}
                className={cn(
                  'px-2.5 py-1.5 text-[11px] font-mono font-medium transition-all cursor-pointer',
                  dateRange === r.key
                    ? 'bg-white text-neutral-900'
                    : 'text-neutral-400 hover:text-neutral-600',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            icon={<Printer />}
            text="Print"
            onClick={handlePrint}
          />
        </div>
      </div>

      {/* Report content */}
      <div ref={reportRef} className="report-content">
        {/* Report header */}
        <div className="card p-6 print:border-0 print:p-0 print:mb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-[20px] font-display font-semibold text-neutral-900 tracking-[-0.02em]">
                  OpenVitals Health Report
                </h2>
              </div>
              <p className="text-[11px] font-mono text-neutral-400 uppercase tracking-[0.06em]">
                Generated {formatDate(new Date())}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[14px] font-medium text-neutral-900 font-body">
                {session?.user?.name ?? 'Patient'}
              </p>
              {prefs?.dateOfBirth && (
                <p className="text-[11px] font-mono text-neutral-500">
                  DOB: {prefs.dateOfBirth}
                </p>
              )}
              {prefs?.biologicalSex && (
                <p className="text-[11px] font-mono text-neutral-500 capitalize">
                  {prefs.biologicalSex}
                </p>
              )}
              {prefs?.bloodType && (
                <p className="text-[11px] font-mono text-neutral-500">
                  Blood Type: {prefs.bloodType}
                </p>
              )}
            </div>
          </div>

          {/* Summary stats */}
          <div className="mt-4 pt-4 border-t border-neutral-200 grid grid-cols-4 gap-4">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
                Health Score
              </span>
              <p className={cn(
                "text-[24px] font-mono font-semibold tabular-nums",
                healthScore >= 75 ? 'text-health-normal' : healthScore >= 50 ? 'text-health-warning' : 'text-health-critical',
              )}>
                {healthScore}/100
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
                Biomarkers
              </span>
              <p className="text-[24px] font-mono font-semibold text-neutral-900 tabular-nums">
                {totalMetrics}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
                Flagged
              </span>
              <p className={cn(
                "text-[24px] font-mono font-semibold tabular-nums",
                totalFlagged > 0 ? 'text-health-warning' : 'text-health-normal',
              )}>
                {totalFlagged}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-500">
                Medications
              </span>
              <p className="text-[24px] font-mono font-semibold text-neutral-900 tabular-nums">
                {activeMeds.length}
              </p>
            </div>
          </div>
        </div>

        {/* Categories */}
        {categoryGroups.map((group) => (
          <div key={group.category} className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                  {getCategoryLabel(group.category)}
                </h3>
                <div className="flex items-center gap-2">
                  {group.flaggedCount > 0 && (
                    <StatusBadge status="warning" label={`${group.flaggedCount} flagged`} />
                  )}
                  <span className="text-[10px] font-mono text-neutral-400">
                    {group.metrics.length} metrics
                  </span>
                </div>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_120px_80px_64px] gap-2 px-4 py-2 border-b border-neutral-100 print:px-0">
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400">
                Metric
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right">
                Value
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right">
                Reference
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-center">
                Status
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400 text-right print:hidden">
                Trend
              </span>
            </div>

            {/* Metric rows */}
            {group.metrics.map((metric) => {
              const refRange =
                metric.refLow != null && metric.refHigh != null
                  ? `${metric.refLow} – ${metric.refHigh}`
                  : metric.refLow != null
                    ? `> ${metric.refLow}`
                    : metric.refHigh != null
                      ? `< ${metric.refHigh}`
                      : '—';

              return (
                <div
                  key={metric.metricCode}
                  className="grid grid-cols-[1fr_100px_120px_80px_64px] gap-2 items-center px-4 py-2.5 border-b border-neutral-50 last:border-0 print:px-0"
                >
                  <div>
                    <span className="text-[12px] font-medium text-neutral-800 font-body">
                      {metric.metricName}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 ml-2">
                      {formatDate(metric.observedAt)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[13px] font-mono font-semibold text-neutral-900 tabular-nums">
                      {formatObsValue(metric.metricCode, metric.latestValue, metric.valueText, metric.displayPrecision)}
                    </span>
                    {metric.unit && (
                      <span className="text-[10px] font-mono text-neutral-400 ml-1">
                        {metric.unit}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500 text-right tabular-nums">
                    {refRange}
                  </span>
                  <div className="flex justify-center">
                    <StatusBadge status={metric.status} label={metric.status} />
                  </div>
                  <div className="flex justify-end print:hidden">
                    {metric.sparkData.length >= 2 && (
                      <MiniSparkline
                        data={metric.sparkData}
                        color={statusColor[metric.status] ?? statusColor.normal}
                        width={56}
                        height={18}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Medications section */}
        {activeMeds.length > 0 && (
          <div className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                Active Medications
              </h3>
            </div>
            <div className="divide-y divide-neutral-50">
              {activeMeds.map((med) => (
                <div key={med.id} className="px-4 py-3 print:px-0 flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-medium text-neutral-800 font-body">
                      {med.name}
                    </span>
                    {med.genericName && (
                      <span className="text-[11px] text-neutral-400 font-body ml-2">
                        ({med.genericName})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {med.dosage && (
                      <span className="text-[12px] font-mono text-neutral-600">
                        {med.dosage}
                      </span>
                    )}
                    {med.frequency && (
                      <span className="text-[11px] font-mono text-neutral-400">
                        {med.frequency}
                      </span>
                    )}
                    {med.startDate && (
                      <span className="text-[10px] font-mono text-neutral-400">
                        Since {formatDate(med.startDate)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conditions section */}
        {condItems.filter((c) => c.status === 'active').length > 0 && (
          <div className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                Active Conditions
              </h3>
            </div>
            <div className="divide-y divide-neutral-50">
              {condItems
                .filter((c) => c.status === 'active')
                .map((cond) => (
                  <div key={cond.id} className="px-4 py-3 print:px-0 flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-medium text-neutral-800 font-body">
                        {cond.name}
                      </span>
                      {cond.severity && (
                        <StatusBadge
                          status={cond.severity === 'severe' ? 'critical' : cond.severity === 'moderate' ? 'warning' : 'info'}
                          label={cond.severity}
                          className="ml-2"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      {cond.diagnosedBy && (
                        <span className="text-[11px] font-mono text-neutral-400">
                          {cond.diagnosedBy}
                        </span>
                      )}
                      {cond.onsetDate && (
                        <span className="text-[10px] font-mono text-neutral-400">
                          Since {formatDate(cond.onsetDate)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Encounters section */}
        {encItems.length > 0 && (
          <div className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                Recent Encounters
              </h3>
            </div>
            <div className="divide-y divide-neutral-50">
              {encItems.slice(0, 10).map((enc) => (
                <div key={enc.id} className="px-4 py-3 print:px-0 flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-medium text-neutral-800 font-body capitalize">
                      {enc.type.replace(/_/g, ' ')}
                    </span>
                    {enc.chiefComplaint && (
                      <span className="text-[11px] text-neutral-400 font-body ml-2">
                        — {enc.chiefComplaint}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    {enc.provider && (
                      <span className="text-[11px] font-mono text-neutral-400">
                        {enc.provider}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-neutral-400">
                      {formatDate(enc.encounterDate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended retests */}
        {retestItems.filter((r) => r.urgency === 'overdue' || r.urgency === 'due_soon').length > 0 && (
          <div className="card mt-4 print:border-0 print:mt-6 print:break-inside-avoid">
            <div className="px-4 py-3 border-b border-neutral-200 print:px-0">
              <h3 className="text-[14px] font-display font-semibold text-neutral-900">
                Recommended Retests
              </h3>
            </div>
            <div className="divide-y divide-neutral-50">
              {retestItems
                .filter((r) => r.urgency === 'overdue' || r.urgency === 'due_soon')
                .slice(0, 8)
                .map((r) => (
                  <div key={r.metricCode} className="px-4 py-3 print:px-0 flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-medium text-neutral-800 font-body">
                        {r.metricName}
                      </span>
                      <span className="text-[11px] text-neutral-400 font-mono ml-2">
                        Last tested {r.daysSinceLastTest}d ago
                      </span>
                    </div>
                    <StatusBadge
                      status={r.urgency === 'overdue' ? 'critical' : 'warning'}
                      label={r.urgency === 'overdue' ? 'Overdue' : 'Due soon'}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center print:mt-8">
          <p className="text-[10px] font-mono text-neutral-400">
            This report was generated by OpenVitals and is intended for informational purposes only.
            It is not a substitute for professional medical advice, diagnosis, or treatment.
          </p>
          <p className="text-[10px] font-mono text-neutral-300 mt-1">
            openvitals.com
          </p>
        </div>
      </div>
    </div>
  );
}
