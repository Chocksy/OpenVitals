'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { TitleActionHeader } from '@/components/title-action-header';
import { StatusBadge, type HealthStatus } from '@/components/health/status-badge';
import { deriveStatus, formatRange } from '@/lib/health-utils';
import { Check, Pencil } from 'lucide-react';

const DOC_TYPE_LABELS: Record<string, string> = {
  lab_report: 'Lab report',
  encounter_note: 'Encounter note',
  imaging_report: 'Imaging report',
  dental_record: 'Dental record',
  immunization_record: 'Immunization record',
  csv_export: 'CSV export',
  wearable_export: 'Wearable export',
  unknown: 'Unknown',
};

const statusMap: Record<string, { label: string; badge: HealthStatus }> = {
  completed: { label: 'Completed', badge: 'normal' },
  pending: { label: 'Pending', badge: 'info' },
  classifying: { label: 'Classifying...', badge: 'info' },
  parsing: { label: 'Parsing...', badge: 'info' },
  normalizing: { label: 'Normalizing...', badge: 'info' },
  review_needed: { label: 'Needs review', badge: 'warning' },
  failed: { label: 'Failed', badge: 'critical' },
};

export default function ImportJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.importJobs.getDetail.useQuery({ id });
  const confirmMutation = trpc.observations.confirm.useMutation({
    onSuccess: () => utils.importJobs.getDetail.invalidate({ id }),
  });
  const correctMutation = trpc.observations.correct.useMutation({
    onSuccess: () => utils.importJobs.getDetail.invalidate({ id }),
  });

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader showBackButton title={undefined} />
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <TitleActionHeader showBackButton title="Not found" subtitle="This import job could not be found." />
      </div>
    );
  }

  const { job, observations } = data;
  const jobStatus = statusMap[job.status] ?? statusMap.completed!;

  const confirmAll = () => {
    const unconfirmed = observations.filter((o) => o.status === 'extracted');
    unconfirmed.forEach((o) => confirmMutation.mutate({ id: o.id }));
  };

  return (
    <div>
      <TitleActionHeader
        showBackButton
        title={job.classifiedType ? (DOC_TYPE_LABELS[job.classifiedType] ?? job.classifiedType) : 'Import details'}
        underTitle={
          <div className="mt-1 flex items-center gap-3">
            <StatusBadge status={jobStatus.badge} label={jobStatus.label} />
            {job.classificationConfidence != null && (
              <span className="text-xs text-neutral-500 font-mono">
                {(job.classificationConfidence * 100).toFixed(0)}% confidence
              </span>
            )}
          </div>
        }
        actions={
          observations.some((o) => o.status === 'extracted') ? (
            <button
              onClick={confirmAll}
              disabled={confirmMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 transition-colors disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm all
            </button>
          ) : undefined
        }
      />

      {job.errorMessage && (
        <div className="mt-6 rounded-lg border border-[var(--color-health-critical-border)] bg-[var(--color-health-critical-bg)] p-3 text-sm text-[var(--color-health-critical)]">
          {job.errorMessage}
        </div>
      )}

      <div className="mt-6">
        {observations.length === 0 ? (
          <p className="text-sm text-neutral-500">No extracted records for this import.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr_0.6fr_auto] gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-2.5">
              {['Metric', 'Value', 'Unit', 'Reference range', 'Status', ''].map((h) => (
                <div
                  key={h}
                  className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono"
                >
                  {h}
                </div>
              ))}
            </div>
            {observations.map((obs) => {
              const healthStatus = deriveStatus(obs);
              const confirmed = obs.status === 'confirmed';
              const corrected = obs.status === 'corrected';

              return (
                <div
                  key={obs.id}
                  className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr_0.6fr_auto] items-center gap-3 border-b border-neutral-100 px-5 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-neutral-900 font-body">
                      {obs.metricCode.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[11px] text-neutral-400 font-mono">{obs.category}</div>
                  </div>
                  <div className="text-sm font-semibold text-neutral-900 font-mono">
                    {obs.valueNumeric != null ? obs.valueNumeric : obs.valueText ?? '—'}
                  </div>
                  <div className="text-xs text-neutral-500 font-mono">{obs.unit ?? '—'}</div>
                  <div className="text-xs text-neutral-500 font-mono">
                    {formatRange(obs.referenceRangeLow, obs.referenceRangeHigh, obs.unit)}
                  </div>
                  <div>
                    {obs.isAbnormal ? (
                      <StatusBadge status={healthStatus} label={healthStatus === 'critical' ? 'High' : 'Abnormal'} />
                    ) : (
                      <StatusBadge status="normal" label="Normal" />
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {confirmed || corrected ? (
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {corrected ? 'Corrected' : 'Confirmed'}
                      </span>
                    ) : (
                      <button
                        onClick={() => confirmMutation.mutate({ id: obs.id })}
                        disabled={confirmMutation.isPending}
                        className="p-1 rounded text-neutral-400 hover:text-accent-600 hover:bg-accent-50 transition-colors"
                        title="Confirm"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
