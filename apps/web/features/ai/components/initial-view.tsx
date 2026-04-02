'use client';

import { Logo } from '@/assets/app/images/logo';
import { ChatInput } from './chat-input';

import { trpc } from '@/lib/trpc/client';
import { useDynamicStatus } from '@/hooks/use-dynamic-status';
import { useMemo } from 'react';

interface InitialViewProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSuggestionClick: (suggestion: string) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const DEFAULT_SUGGESTIONS = [
  'Summarize my most recent lab results',
  'What trends should I discuss with my doctor?',
  'Are any of my medications interacting?',
  'How have my lipid results changed this year?',
];

export function InitialView({ input, onInputChange, onSubmit, onSuggestionClick }: InitialViewProps) {
  const { getStatus } = useDynamicStatus();
  const observations = trpc.observations.list.useQuery({ limit: 200 });
  const medications = trpc.medications.list.useQuery({});
  const conditions = trpc.conditions.list.useQuery();

  // Generate dynamic suggestions based on user data
  const suggestions = useMemo(() => {
    const dynamic: string[] = [];
    const obsItems = observations.data?.items ?? [];
    const medItems = medications.data?.items ?? [];
    const condItems = conditions.data ?? [];

    // Find abnormal metrics
    const byMetric = new Map<string, typeof obsItems>();
    for (const obs of obsItems) {
      const existing = byMetric.get(obs.metricCode) ?? [];
      existing.push(obs);
      byMetric.set(obs.metricCode, existing);
    }

    const abnormalMetrics: string[] = [];
    for (const [code, metricObs] of byMetric) {
      const sorted = [...metricObs].sort(
        (a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      );
      const status = getStatus(sorted[0]!);
      if (status !== 'normal') {
        abnormalMetrics.push(code.replace(/_/g, ' '));
      }
    }

    if (abnormalMetrics.length > 0) {
      dynamic.push(`Why is my ${abnormalMetrics[0]} flagged and what should I do?`);
    }

    if (medItems.length > 0 && obsItems.length > 0) {
      dynamic.push('How might my medications be affecting my lab results?');
    }

    if (condItems.filter((c) => c.status === 'active').length > 0) {
      const condName = condItems.find((c) => c.status === 'active')?.name;
      if (condName) {
        dynamic.push(`What lab markers should I monitor for ${condName}?`);
      }
    }

    if (obsItems.length > 10) {
      dynamic.push('Prepare a summary I can share with my doctor');
    }

    // Fill with defaults up to 4
    const all = [...dynamic, ...DEFAULT_SUGGESTIONS];
    return all.slice(0, 4);
  }, [observations.data, medications.data, conditions.data]);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl">
        <div className="mb-10 text-center">
          <Logo className="mx-auto mb-5 size-14" />
          <h1 className="text-[28px] font-medium tracking-[-0.025em] text-neutral-900 font-display">
            {getGreeting()}
          </h1>
          <p className="mt-2 text-[15px] text-neutral-500 font-body">
            Ask me anything about your health records.
          </p>
        </div>

        <ChatInput value={input} onChange={onInputChange} onSubmit={onSubmit} autoFocus className="px-0 pb-0" />

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestionClick(s)}
              className="border border-neutral-200 bg-white px-3.5 py-2 text-[12px] text-neutral-600 transition-all hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 active:scale-[0.98] font-body"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
