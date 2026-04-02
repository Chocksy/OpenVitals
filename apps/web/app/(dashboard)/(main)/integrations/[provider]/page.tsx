'use client';

import { use, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { TitleActionHeader } from '@/components/title-action-header';
import { StatusBadge, type HealthStatus } from '@/components/health/status-badge';
import { MetricSummaryCard } from '@/components/health/metric-summary-card';
import { DataTable, type DataTableColumn } from '@/components/data-table';
import { formatRange } from '@/lib/health-utils';
import { useDynamicStatus } from '@/hooks/use-dynamic-status';
import { cn, formatDate, formatObsValue, isDurationMetric, getRelativeTime } from '@/lib/utils';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { toast } from 'sonner';
import {
  RefreshCw,
  Unplug,
  Zap,
} from 'lucide-react';

import whoopIcon from '@/assets/marketing/brand-logos/whoop-icon.jpeg';
import appleIcon from '@/assets/marketing/brand-logos/apple-icon.png';
import fitbitIcon from '@/assets/marketing/brand-logos/fitbit-icon.png';
import garminIcon from '@/assets/marketing/brand-logos/garmin-icon.jpeg';
import ouraIcon from '@/assets/marketing/brand-logos/oura-icon.jpeg';
import samsungIcon from '@/assets/marketing/brand-logos/samsung-icon.png';
import questIcon from '@/assets/marketing/brand-logos/quest-icon.png';
import labcorpIcon from '@/assets/marketing/brand-logos/labcorp-icon.png';
import epicIcon from '@/assets/marketing/brand-logos/epic-icon.png';
import cernerIcon from '@/assets/marketing/brand-logos/cerner-icon.png';

const providerCatalog: Record<string, { name: string; brandIconSrc?: string }> = {
  'apple-watch': { name: 'Apple Watch', brandIconSrc: appleIcon.src },
  fitbit: { name: 'Fitbit', brandIconSrc: fitbitIcon.src },
  garmin: { name: 'Garmin', brandIconSrc: garminIcon.src },
  'oura-ring': { name: 'Oura Ring', brandIconSrc: ouraIcon.src },
  whoop: { name: 'Whoop', brandIconSrc: whoopIcon.src },
  'samsung-galaxy-watch': { name: 'Samsung Galaxy Watch', brandIconSrc: samsungIcon.src },
  'apple-health': { name: 'Apple Health', brandIconSrc: appleIcon.src },
  'google-health-connect': { name: 'Google Health Connect' },
  'samsung-health': { name: 'Samsung Health', brandIconSrc: samsungIcon.src },
  'quest-diagnostics': { name: 'Quest Diagnostics', brandIconSrc: questIcon.src },
  labcorp: { name: 'Labcorp', brandIconSrc: labcorpIcon.src },
  'epic-mychart': { name: 'Epic MyChart', brandIconSrc: epicIcon.src },
  cerner: { name: 'Cerner', brandIconSrc: cernerIcon.src },
};

function formatMetricName(code: string) {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function SummaryCard({
  label,
  value,
  subtext,
  variant = 'default',
}: {
  label: string;
  value: string;
  subtext?: string;
  variant?: 'default' | 'warning' | 'success' | 'accent';
}) {
  const valueColor = {
    default: 'text-neutral-900',
    warning: 'text-[var(--color-health-warning)]',
    success: 'text-[var(--color-health-normal)]',
    accent: 'text-accent-600',
  }[variant];

  return (
    <div className="card px-4 py-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono">
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-medium tracking-[-0.03em] font-display', valueColor)}>
        {value}
      </div>
      {subtext && (
        <div className="mt-0.5 text-[11px] text-neutral-400 font-mono">{subtext}</div>
      )}
    </div>
  );
}

type Observation = {
  id: string;
  metricCode: string;
  category: string;
  valueNumeric: number | null;
  valueText: string | null;
  unit: string | null;
  referenceRangeLow: number | null;
  referenceRangeHigh: number | null;
  isAbnormal: boolean | null;
  observedAt: Date;
  status: string;
};

export default function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = use(params);
  const { getStatus, isAbnormal: isObsAbnormal } = useDynamicStatus();

  const { data, isLoading } = trpc.integrations.detail.useQuery({ provider });
  const { data: metricsData } = trpc.metrics.list.useQuery();
  const precisionMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const m of metricsData ?? []) {
      map.set(m.id, m.displayPrecision);
    }
    return map;
  }, [metricsData]);
  const syncMutation = trpc.integrations.sync.useMutation();
  const disconnectMutation = trpc.integrations.disconnect.useMutation();
  const utils = trpc.useUtils();

  const catalog = providerCatalog[provider];
  const providerName = catalog?.name ?? formatMetricName(provider);

  const providerAvatar = (size: string = 'size-10') => (
    <Avatar
      src={catalog?.brandIconSrc ?? null}
      name={providerName}
      className={cn(size, 'rounded-xl shrink-0')}
    />
  );

  const connection = data?.connection ?? null;
  const observations = (data?.observations ?? []) as Observation[];
  const isConnected = connection?.isActive ?? false;

  // Group observations by metricCode for metric cards
  const metricGroups = useMemo(() => {
    const groups = new Map<string, Observation[]>();
    for (const obs of observations) {
      const existing = groups.get(obs.metricCode);
      if (existing) {
        existing.push(obs);
      } else {
        groups.set(obs.metricCode, [obs]);
      }
    }

    return Array.from(groups.entries())
      .map(([code, items]) => {
        // items are already sorted desc by observedAt from the query
        const latest = items[0]!;
        const status: HealthStatus = getStatus(latest);
        const sparkData = items
          .slice(0, 20)
          .reverse()
          .map((o) => o.valueNumeric)
          .filter((v): v is number => v != null);

        return {
          code,
          name: formatMetricName(code),
          latest,
          status,
          statusLabel:
            status === 'critical' ? 'High' : status === 'warning' ? 'Abnormal' : 'Normal',
          resultCount: items.length,
          sparkData,
          referenceRange: formatRange(latest.referenceRangeLow, latest.referenceRangeHigh, latest.unit),
          latestDate: formatDate(latest.observedAt),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.latest.observedAt).getTime() - new Date(a.latest.observedAt).getTime(),
      );
  }, [observations]);

  // Recent observations for table (limit 50)
  const recentObservations = useMemo(() => observations.slice(0, 50), [observations]);

  const tableColumns: DataTableColumn<Observation>[] = useMemo(
    () => [
      {
        id: 'date',
        header: 'Date',
        width: '1fr',
        cell: (obs) => (
          <div className="text-xs text-neutral-500 font-mono">
            {formatDate(obs.observedAt)}
          </div>
        ),
      },
      {
        id: 'metric',
        header: 'Metric',
        width: '1.2fr',
        cell: (obs) => (
          <div className="text-[13px] font-medium text-neutral-700 truncate">
            {formatMetricName(obs.metricCode)}
          </div>
        ),
      },
      {
        id: 'value',
        header: 'Value',
        width: '0.8fr',
        cell: (obs) => {
          const obsStatus = getStatus(obs);
          return (
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'text-[15px] font-semibold tracking-[-0.01em] font-mono tabular-nums',
                  isObsAbnormal(obs)
                    ? obsStatus === 'critical'
                      ? 'text-[var(--color-health-critical)]'
                      : 'text-[var(--color-health-warning)]'
                    : 'text-neutral-900',
                )}
              >
                {formatObsValue(obs.metricCode, obs.valueNumeric, obs.valueText, precisionMap.get(obs.metricCode))}
              </span>
            </div>
          );
        },
      },
      {
        id: 'unit',
        header: 'Unit',
        width: '0.6fr',
        cell: (obs) => (
          <div className="text-[11px] text-neutral-400 font-mono">
            {obs.unit ?? '—'}
          </div>
        ),
      },
    ],
    [precisionMap, getStatus, isObsAbnormal],
  );

  function handleSync() {
    syncMutation.mutate(
      { provider },
      {
        onSuccess: (result) => {
          if (result.error) {
            toast.error(`Sync failed: ${result.error}`);
          } else {
            toast.success(
              `Synced ${result.count} observation${result.count !== 1 ? 's' : ''} from ${providerName}`,
            );
          }
          utils.integrations.detail.invalidate({ provider });
        },
        onError: (err) => {
          toast.error(`Sync failed: ${err.message}`);
        },
      },
    );
  }

  function handleDisconnect() {
    if (!confirm(`Disconnect ${providerName}? You can reconnect later.`)) return;

    disconnectMutation.mutate(
      { provider },
      {
        onSuccess: () => {
          toast.success(`${providerName} disconnected`);
          utils.integrations.detail.invalidate({ provider });
          utils.integrations.list.invalidate();
        },
        onError: (err) => {
          toast.error(`Failed to disconnect: ${err.message}`);
        },
      },
    );
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div>
        <TitleActionHeader showBackButton title={undefined} />
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-20 animate-pulse bg-neutral-50" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-40 animate-pulse bg-neutral-50" />
          ))}
        </div>
        <div className="card mt-6 h-64 animate-pulse bg-neutral-50" />
      </div>
    );
  }

  // Disconnected state (connection exists but inactive)
  if (connection && !isConnected) {
    return (
      <div>
        <TitleActionHeader
          showBackButton
          title={providerName}
          beforeTitle={<div className="mt-1">{providerAvatar()}</div>}
          underTitle={
            <div className="mt-2">
              <StatusBadge status="neutral" label="Disconnected" />
            </div>
          }
        />
        <div className="mt-10 flex flex-col items-center justify-center text-center py-12">
          <Unplug className="h-10 w-10 text-neutral-300 mb-4" />
          <h2 className="text-lg font-semibold text-neutral-700 font-display">Disconnected</h2>
          <p className="mt-1 text-sm text-neutral-500 max-w-md">
            This integration is no longer connected. Reconnect to resume syncing data.
          </p>
          <Button
            className="mt-6"
            text="Reconnect"
            onClick={() => {
              window.location.href = `/api/integrations/${provider}/connect`;
            }}
          />
        </div>
      </div>
    );
  }

  // No connection at all
  if (!connection) {
    return (
      <div>
        <TitleActionHeader
          showBackButton
          title={providerName}
          beforeTitle={<div className="mt-1">{providerAvatar()}</div>}
        />
        <div className="mt-10 flex flex-col items-center justify-center text-center py-12">
          <div className="mb-4">{providerAvatar('size-12')}</div>
          <h2 className="text-lg font-semibold text-neutral-700 font-display">Not Connected</h2>
          <p className="mt-1 text-sm text-neutral-500 max-w-md">
            Connect {providerName} to start syncing your health data.
          </p>
          <Button
            className="mt-6"
            text={`Connect ${providerName}`}
            onClick={() => {
              window.location.href = `/api/integrations/${provider}/connect`;
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="stagger-children">
      <TitleActionHeader
        showBackButton
        title={providerName}
        beforeTitle={<div className="mt-1">{providerAvatar()}</div>}
        underTitle={
          <div className="mt-2">
            <StatusBadge status="normal" label="Connected" />
          </div>
        }
        actions={
          <div className="flex gap-2">
            <Button
              text="Sync Now"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={syncMutation.isPending}
              onClick={handleSync}
            />
            <Button
              text="Disconnect"
              icon={<Unplug className="h-4 w-4" />}
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDisconnect}
              loading={disconnectMutation.isPending}
            />
          </div>
        }
      />

      {/* Connection Summary Cards */}
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Status"
          value="Connected"
          variant="success"
        />
        <SummaryCard
          label="Connected since"
          value={connection.createdAt ? formatDate(connection.createdAt) : '—'}
        />
        <SummaryCard
          label="Last synced"
          value={
            connection.lastSyncAt
              ? getRelativeTime(new Date(connection.lastSyncAt).toISOString())
              : 'Never'
          }
        />
        <SummaryCard
          label="Observations"
          value={String(observations.length)}
          variant="accent"
        />
      </div>

      {/* Metrics Overview */}
      {metricGroups.length > 0 && (
        <>
          <h2 className="mt-8 mb-4 text-sm font-semibold text-neutral-700 font-body">
            Metrics Overview
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {metricGroups.map((metric) => (
              <MetricSummaryCard
                key={metric.code}
                metricCode={metric.code}
                name={metric.name}
                latestValue={formatObsValue(metric.code, metric.latest.valueNumeric, metric.latest.valueText, precisionMap.get(metric.code))}
                unit={isDurationMetric(metric.code) ? '' : (metric.latest.unit ?? '')}
                status={metric.status}
                statusLabel={metric.statusLabel}
                resultCount={metric.resultCount}
                sparkData={metric.sparkData}
                referenceRange={metric.referenceRange}
                latestDate={metric.latestDate}
              />
            ))}
          </div>
        </>
      )}

      {/* Empty state: connected but no observations */}
      {observations.length === 0 && (
        <div className="card mt-8 flex flex-col items-center justify-center py-16 text-center">
          <RefreshCw className="h-10 w-10 text-neutral-300 mb-4" />
          <h2 className="text-lg font-semibold text-neutral-700 font-display">No Data Yet</h2>
          <p className="mt-1 text-sm text-neutral-500 max-w-md">
            {providerName} is connected but no observations have been synced yet. Try syncing now.
          </p>
          <Button
            className="mt-6"
            text="Sync Now"
            icon={<RefreshCw className="h-4 w-4" />}
            loading={syncMutation.isPending}
            onClick={handleSync}
          />
        </div>
      )}

      {/* Recent Observations Table */}
      {recentObservations.length > 0 && (
        <>
          <h2 className="mt-8 mb-4 text-sm font-semibold text-neutral-700 font-body">
            Recent Observations
          </h2>
          <DataTable
            data={recentObservations}
            columns={tableColumns}
            rowConfig={{
              getRowKey: (obs) => obs.id,
              getRowTint: (obs) =>
                isObsAbnormal(obs) ? 'bg-[var(--color-health-warning-bg)]/40' : undefined,
            }}
          />
        </>
      )}
    </div>
  );
}
