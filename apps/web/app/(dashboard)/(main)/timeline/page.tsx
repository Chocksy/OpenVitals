'use client';

import { trpc } from '@/lib/trpc/client';
import { TitleActionHeader } from '@/components/title-action-header';
import { StatusBadge } from '@/components/health/status-badge';
import { ProvenancePill } from '@/components/health/provenance-pill';
import { AnimatedEmptyState } from '@/components/animated-empty-state';
import { formatDate } from '@/lib/utils';
import { Clock, TestTubes, Pill, Upload } from 'lucide-react';

interface TimelineEvent {
  id: string;
  date: Date;
  title: string;
  description: string;
  badge: { status: 'normal' | 'warning' | 'critical' | 'info' | 'neutral'; label: string };
  source: string;
}

const emptyIcons = [Clock, TestTubes, Pill, Upload, Clock, TestTubes];

export default function TimelinePage() {
  const observations = trpc.observations.list.useQuery({ limit: 50 });
  const importJobs = trpc.importJobs.list.useQuery({ limit: 20 });
  const medications = trpc.medications.list.useQuery({});

  const isLoading = observations.isLoading || importJobs.isLoading || medications.isLoading;

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader title="Timeline" subtitle="Loading..." />
        <div className="mt-7 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-neutral-50" />
          ))}
        </div>
      </div>
    );
  }

  const events: TimelineEvent[] = [];

  // Group observations by importJobId and date
  const obsByJob = new Map<string, NonNullable<typeof observations.data>['items']>();
  for (const obs of observations.data?.items ?? []) {
    const key = obs.importJobId ?? obs.id;
    const existing = obsByJob.get(key) ?? [];
    existing.push(obs);
    obsByJob.set(key, existing);
  }

  for (const [key, group] of obsByJob) {
    const first = group[0]!;
    const abnormalCount = group.filter((o) => o.isAbnormal).length;
    events.push({
      id: `obs-${key}`,
      date: new Date(first.observedAt),
      title: `Lab Results — ${group.length} observation${group.length > 1 ? 's' : ''}`,
      description: `${group.map((o) => o.metricCode).slice(0, 3).join(', ')}${group.length > 3 ? ` and ${group.length - 3} more` : ''}`,
      badge: abnormalCount > 0
        ? { status: 'warning', label: `${abnormalCount} flagged` }
        : { status: 'normal', label: 'All normal' },
      source: first.importJobId ? 'Imported document' : 'Manual entry',
    });
  }

  // Add medications as events
  for (const med of medications.data?.items ?? []) {
    events.push({
      id: `med-${med.id}`,
      date: med.startDate ? new Date(med.startDate) : new Date(med.createdAt!),
      title: `Medication ${med.isActive ? 'started' : 'discontinued'} — ${med.name}`,
      description: [med.dosage, med.frequency, med.indication].filter(Boolean).join(' · '),
      badge: med.isActive
        ? { status: 'normal', label: 'Active' }
        : { status: 'neutral', label: 'Ended' },
      source: 'Manual entry',
    });
  }

  // Sort by date descending
  events.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (events.length === 0) {
    return (
      <div>
        <TitleActionHeader title="Timeline" subtitle="Your chronological health record feed." />
        <div className="mt-7">
          <AnimatedEmptyState
            title="No health records yet"
            description="Upload a lab report or add a medication to start building your timeline."
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
            learnMoreHref="/uploads"
            learnMoreClassName="border-accent-200 text-accent-600 hover:bg-accent-50"
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TitleActionHeader title="Timeline" subtitle="Your chronological health record feed." />

      <div className="mt-7 space-y-3">
        {events.map((item) => (
          <div key={item.id} className="card p-5 transition-all hover:border-accent-300 hover:shadow-[0_2px_12px_var(--color-accent-50)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[15px] font-semibold text-neutral-900 font-body">
                  {item.title}
                </div>
                <div className="mt-1 text-[13px] leading-relaxed text-neutral-600 font-body">
                  {item.description}
                </div>
              </div>
              <StatusBadge status={item.badge.status} label={item.badge.label} />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[11px] text-neutral-400 font-mono">{formatDate(item.date)}</span>
              <ProvenancePill label={item.source} icon="◎" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
