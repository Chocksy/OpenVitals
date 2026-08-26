/**
 * The old home dashboard's cards, ported into one file and fed plain data from
 * the server. ponytail: none of them need hooks any more, so they stay server
 * components — same markup, no client bundle.
 */
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  FlaskConical,
  Sparkles,
  Stethoscope,
  Target,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { MiniSparkline } from "./ui-kit";
import { StatusBadge } from "./status-badge";
import type { HealthStatus } from "@/lib/status";
import type {
  AttentionMetric,
  ChangeItem,
  HealthInsight,
  PanelMetric,
  PanelView,
  RetestPreview,
} from "@/lib/home-data";

const healthColor: Record<string, string> = {
  normal: "var(--color-health-normal)",
  warning: "var(--color-health-warning)",
  critical: "var(--color-health-critical)",
  info: "var(--color-accent-500)",
  neutral: "var(--color-neutral-400)",
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function GreetingHeader({
  firstName,
  summaryLine,
  abnormalCount,
}: {
  firstName: string;
  summaryLine: string;
  abnormalCount: number;
}) {
  return (
    <div>
      <h1 className="font-display text-[28px] font-medium tracking-[-0.03em] text-neutral-900 md:text-[34px]">
        {greeting()}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <div className="mt-2 flex items-center gap-3">
        <p className="font-display text-[14px] text-neutral-500">
          {summaryLine}
        </p>
        {abnormalCount > 0 && (
          <StatusBadge status="warning" label={`${abnormalCount} flagged`} />
        )}
      </div>
      <p className="mt-1 font-mono text-[11px] text-neutral-400">
        {formatDate(new Date())}
      </p>
    </div>
  );
}

function scoreLabel(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Needs Attention";
  return "At Risk";
}

function scoreClass(score: number) {
  if (score >= 75) return "text-health-normal border-health-normal";
  if (score >= 40) return "text-health-warning border-health-warning";
  return "text-health-critical border-health-critical";
}

export function HealthScore({
  score,
  normalCount,
  warningCount,
  criticalCount,
  totalMetrics,
}: {
  score: number;
  normalCount: number;
  warningCount: number;
  criticalCount: number;
  totalMetrics: number;
}) {
  const radius = 52;
  const circumference = Math.PI * radius;
  const progress = (score / 100) * circumference;
  const arc = `M ${60 - radius} 64 A ${radius} ${radius} 0 0 1 ${60 + radius} 64`;
  const color =
    score >= 75
      ? healthColor.normal
      : score >= 40
        ? healthColor.warning
        : healthColor.critical;

  return (
    <div className="card flex items-center gap-6 p-5">
      <div className="relative shrink-0">
        <svg width="120" height="68" viewBox="0 0 120 68">
          <path
            d={arc}
            fill="none"
            stroke="var(--color-neutral-100)"
            strokeWidth={6}
            strokeLinecap="square"
          />
          <path
            d={arc}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="square"
            strokeDasharray={`${progress} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span
            className={cn(
              "font-mono text-[28px] font-bold leading-none tabular-nums",
              scoreClass(score),
            )}
          >
            {score}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            Health Score
          </span>
          <span
            className={cn(
              "border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em]",
              scoreClass(score),
            )}
          >
            {scoreLabel(score)}
          </span>
        </div>
        <p className="mt-1.5 font-body text-[11px] text-neutral-500">
          Based on {totalMetrics} tracked biomarkers
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-health-normal">
            <span className="size-[5px] bg-health-normal" />
            {normalCount} normal
          </span>
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-health-warning">
              <span className="size-[5px] bg-health-warning" />
              {warningCount} warning
            </span>
          )}
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-health-critical">
              <span className="size-[5px] bg-health-critical" />
              {criticalCount} critical
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface Stat {
  label: string;
  value: number;
  icon: React.ElementType;
  href: string;
  accent?: "default" | "warning" | "critical";
  sub?: string;
  underText: string;
}

export function DashboardStats({
  metricCount,
  totalResults,
  flaggedCount,
  criticalCount,
  warningCount,
  uploadCount,
  retestCount,
  retestDue,
}: {
  metricCount: number;
  totalResults: number;
  flaggedCount: number;
  criticalCount: number;
  warningCount: number;
  uploadCount: number;
  retestCount: number;
  retestDue: string | null;
}) {
  const stats: Stat[] = [
    {
      label: "Biomarkers",
      value: metricCount,
      icon: FlaskConical,
      href: "/biomarkers",
      sub: "tracked",
      underText: `Across ${totalResults} total results`,
    },
    {
      label: "Flagged",
      value: flaggedCount,
      icon: AlertTriangle,
      href: "/biomarkers",
      accent:
        criticalCount > 0 ? "critical" : flaggedCount > 0 ? "warning" : "default",
      sub: criticalCount > 0 ? `${criticalCount} critical` : undefined,
      underText:
        flaggedCount === 0
          ? "All metrics in range"
          : `${warningCount} warning, ${criticalCount} critical`,
    },
    {
      label: "Uploads",
      value: uploadCount,
      icon: Sparkles,
      href: "/uploads",
      sub: "reports",
      underText: uploadCount ? "Lab PDFs imported" : "Upload a lab PDF",
    },
    {
      label: "Retests",
      value: retestCount,
      icon: Activity,
      href: "/insights",
      accent: retestCount > 0 ? "warning" : "default",
      sub: retestCount > 0 ? "planned" : "none",
      underText: retestDue ? `Due ${retestDue}` : "Generate a retest plan",
    },
  ];

  const accentStyles = {
    default: "text-neutral-900",
    warning: "text-health-warning",
    critical: "text-health-critical",
  };

  return (
    <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col rounded-md border border-b bg-neutral-200 md:border-b-0"
        >
          <Link
            href={stat.href}
            className="card block p-4 transition-colors hover:border-accent-300"
          >
            <div className="mb-2 flex items-center gap-2">
              <stat.icon className="size-3.5 text-neutral-400" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-500">
                {stat.label}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "font-mono text-[28px] font-semibold leading-none tabular-nums",
                  accentStyles[stat.accent ?? "default"],
                )}
              >
                {stat.value}
              </span>
              {stat.sub && (
                <span className="font-mono text-[11px] text-neutral-400">
                  {stat.sub}
                </span>
              )}
            </div>
          </Link>
          <div className="flex flex-1 items-center px-1.5">
            <p className="truncate font-mono text-[11px] text-neutral-400">
              {stat.underText}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AttentionMetrics({ metrics }: { metrics: AttentionMetric[] }) {
  if (metrics.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-health-warning" />
          <h2 className="font-display text-[13px] font-semibold text-neutral-900">
            Needs Attention
          </h2>
          <span className="bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-neutral-500">
            {metrics.length}
          </span>
        </div>
        <Link
          href="/biomarkers"
          className="flex items-center gap-1 font-mono text-[11px] text-neutral-400 transition-colors hover:text-neutral-600"
        >
          View all
          <ChevronRight className="size-3" />
        </Link>
      </div>
      <div className="divide-y divide-neutral-100">
        {metrics.map((m) => (
          <Link
            key={m.metricCode}
            href={`/m/${m.metricCode}`}
            className="group flex items-center px-4 py-3 transition-colors hover:bg-neutral-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-body text-[13px] font-medium text-neutral-900">
                  {m.metricName}
                </span>
                <StatusBadge status={m.status} label={m.status} />
              </div>
              {m.daysSinceTest !== null && (
                <span className="mt-0.5 block font-mono text-[10px] text-neutral-400">
                  {m.daysSinceTest === 0 ? "Today" : `${m.daysSinceTest}d ago`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <MiniSparkline
                data={m.sparkData}
                color={healthColor[m.status] ?? healthColor.normal!}
                width={64}
                height={20}
              />
              <div className="min-w-[60px] text-right">
                <span className="font-mono text-[14px] font-semibold tabular-nums text-neutral-900">
                  {m.latestValue ?? "—"}
                </span>
                {m.unit && (
                  <span className="ml-1 font-mono text-[10px] text-neutral-400">
                    {m.unit}
                  </span>
                )}
              </div>
              <ChevronRight className="size-3.5 text-neutral-300 transition-colors group-hover:text-neutral-500" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const insightConfig = {
  improvement: {
    icon: ArrowDownRight,
    color: "text-health-normal",
    bg: "bg-green-50",
    border: "border-green-100",
  },
  decline: {
    icon: ArrowUpRight,
    color: "text-health-warning",
    bg: "bg-amber-50",
    border: "border-amber-100",
  },
  alert: {
    icon: AlertTriangle,
    color: "text-health-critical",
    bg: "bg-red-50",
    border: "border-red-100",
  },
  milestone: {
    icon: CheckCircle2,
    color: "text-accent-600",
    bg: "bg-accent-50",
    border: "border-accent-100",
  },
};

export function HealthInsights({ insights }: { insights: HealthInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <Sparkles className="size-3.5 text-accent-500" />
        <h2 className="font-display text-[13px] font-semibold text-neutral-900">
          Insights
        </h2>
      </div>
      <div className="divide-y divide-neutral-100">
        {insights.map((insight) => {
          const config = insightConfig[insight.type];
          const Icon = config.icon;
          return (
            <Link
              key={insight.id}
              href={`/m/${insight.metricCode}`}
              className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-neutral-50"
            >
              <div
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center border",
                  config.bg,
                  config.border,
                )}
              >
                <Icon className={cn("size-3", config.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-body text-[12px] font-medium text-neutral-800">
                  {insight.title}
                </p>
                <p className="mt-0.5 font-body text-[11px] text-neutral-500">
                  {insight.description}
                </p>
              </div>
              <ChevronRight className="mt-1 size-3.5 shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const priorityDot: Record<string, string> = {
  high: "bg-[var(--color-health-critical)]",
  medium: "bg-[var(--color-health-warning)]",
  low: "bg-neutral-300",
};

export function UpcomingRetests({ plan }: { plan: RetestPreview | null }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-neutral-400" />
          <h2 className="font-display text-[13px] font-semibold text-neutral-900">
            Upcoming Retests
          </h2>
          {plan && (
            <span className="bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-neutral-500">
              {plan.items.length}
            </span>
          )}
        </div>
        <Link
          href="/insights"
          className="flex items-center gap-1 font-mono text-[11px] text-neutral-400 transition-colors hover:text-neutral-600"
        >
          Plan
          <ChevronRight className="size-3" />
        </Link>
      </div>

      {!plan ? (
        <div className="px-4 py-6 text-center">
          <FlaskConical className="mx-auto mb-2 size-6 text-neutral-300" />
          <p className="font-body text-[12px] text-neutral-500">
            No bloodwork planned yet.
          </p>
          <Link
            href="/insights"
            className="mt-2 inline-flex font-display text-[12px] font-medium text-accent-600 hover:text-accent-700"
          >
            Plan your next panel &rarr;
          </Link>
        </div>
      ) : (
        <>
          <p className="border-b border-neutral-100 bg-neutral-50 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
            Due {plan.dueAt}
          </p>
          <div className="divide-y divide-neutral-100">
            {plan.items.slice(0, 8).map((item) => (
              <Link
                key={`${item.domain}-${item.metricCode}`}
                href={`/m/${item.metricCode}`}
                className="flex items-center px-4 py-3 hover:bg-neutral-50"
              >
                <span
                  className={cn(
                    "mr-3 size-[5px] shrink-0 rounded-full",
                    priorityDot[item.priority] ?? "bg-neutral-300",
                  )}
                />
                <span className="min-w-0 flex-1 truncate font-body text-[12px] font-medium text-neutral-700">
                  {item.metricName}
                </span>
                <span className="ml-2 shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.04em] text-neutral-400">
                  {item.domain}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PanelSectionHeader({ panel }: { panel: PanelView }) {
  const untested = panel.totalMetrics - panel.totalTested;
  const pct = (n: number) => `${(n / panel.totalMetrics) * 100}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[15px] font-medium tracking-[-0.02em] text-neutral-900">
          {panel.label}
        </h2>
        <div className="flex items-center gap-2">
          {panel.totalTested > 0 && (
            <span className="font-mono text-[11px] text-neutral-500">
              {panel.inRangeCount}/{panel.totalTested} in range
            </span>
          )}
          {untested > 0 && (
            <span className="font-mono text-[11px] text-neutral-300">
              {panel.totalTested === 0
                ? `0/${panel.totalMetrics} tested`
                : `· ${untested} untested`}
            </span>
          )}
        </div>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {panel.inRangeCount > 0 && (
          <div
            className="bg-[var(--color-health-normal)]"
            style={{ width: pct(panel.inRangeCount) }}
          />
        )}
        {panel.warningCount > 0 && (
          <div
            className="bg-[var(--color-health-warning)]"
            style={{ width: pct(panel.warningCount) }}
          />
        )}
        {panel.criticalCount > 0 && (
          <div
            className="bg-[var(--color-health-critical)]"
            style={{ width: pct(panel.criticalCount) }}
          />
        )}
        {untested > 0 && (
          <div
            className="flex-1"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, var(--color-neutral-200) 0px, var(--color-neutral-200) 2px, transparent 2px, transparent 5px)",
            }}
          />
        )}
      </div>
    </div>
  );
}

const statusValueColor: Record<string, string> = {
  normal: "text-neutral-900",
  warning: "text-[var(--color-health-warning)]",
  critical: "text-[var(--color-health-critical)]",
  info: "text-neutral-900",
  neutral: "text-neutral-600",
};

const statusDotColor: Record<string, string> = {
  normal: "bg-[var(--color-health-normal)]",
  warning: "bg-[var(--color-health-warning)]",
  critical: "bg-[var(--color-health-critical)]",
  info: "bg-[var(--color-health-info)]",
  neutral: "bg-neutral-400",
};

export function BiomarkerPanelCard({ metric }: { metric: PanelMetric }) {
  if (metric.type === "empty") {
    return (
      <Link
        href={`/m/${metric.metricCode}`}
        className="card flex min-w-0 cursor-pointer flex-col gap-2 border-dashed p-4 transition-all hover:border-accent-200"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="size-[6px] shrink-0 rounded-full bg-neutral-200" />
          <span className="truncate font-display text-[12px] font-medium uppercase tracking-[0.02em] text-neutral-400">
            {metric.name}
          </span>
        </div>
        <span className="font-display text-[14px] font-medium text-neutral-300">
          No data yet
        </span>
        <span className="truncate font-mono text-[10px] text-neutral-400">
          {metric.reason}
        </span>
      </Link>
    );
  }

  const status = (metric.status ?? "normal") as HealthStatus;
  const value = metric.value!;

  return (
    <Link
      href={`/m/${metric.metricCode}`}
      className="card flex min-w-0 cursor-pointer flex-col gap-2 p-4 transition-all hover:border-accent-200"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "size-[6px] shrink-0 rounded-full",
              statusDotColor[status],
            )}
          />
          <span className="truncate font-display text-[12px] font-medium uppercase tracking-[0.02em] text-neutral-500">
            {metric.name}
          </span>
        </div>
        {metric.trendDelta != null && (
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] font-medium",
              metric.trendImproving === true
                ? "text-[var(--color-health-normal)]"
                : metric.trendImproving === false
                  ? "text-[var(--color-health-warning)]"
                  : "text-neutral-400",
            )}
          >
            {metric.trendDelta > 0 ? "+" : ""}
            {Math.round(metric.trendDelta)}%
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              "font-display text-[22px] font-medium tracking-[-0.03em]",
              statusValueColor[status],
            )}
          >
            {Number.isInteger(value) ? value : value.toFixed(1)}
          </span>
          <span className="font-mono text-[11px] text-neutral-400">
            {metric.unit}
          </span>
        </div>
        <MiniSparkline
          data={metric.sparkData ?? []}
          color={
            status === "normal"
              ? healthColor.info!
              : (healthColor[status] ?? healthColor.info!)
          }
          width={80}
          height={24}
        />
      </div>

      <span className="truncate font-mono text-[10px] text-neutral-400">
        {metric.optimalRange}
      </span>
    </Link>
  );
}

export function WhatChanged({
  changes,
  previousDate,
  currentDate,
}: {
  changes: ChangeItem[];
  previousDate: string;
  currentDate: string;
}) {
  if (changes.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-[15px] font-medium tracking-[-0.02em] text-neutral-900">
          What Changed
        </h2>
        <span className="font-mono text-[11px] text-neutral-400">
          {previousDate} vs {currentDate}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {changes.map((c) => (
          <Link
            key={c.metricCode}
            href={`/m/${c.metricCode}`}
            className="card flex items-center justify-between gap-3 p-3"
          >
            <div className="min-w-0">
              <span className="block truncate font-display text-[12px] font-medium text-neutral-600">
                {c.name}
              </span>
              <span className="font-mono text-[11px] text-neutral-400">
                {c.oldValue.toFixed(1)} &rarr; {c.newValue.toFixed(1)} {c.unit}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 font-mono text-[13px] font-medium",
                c.improved
                  ? "text-[var(--color-health-normal)]"
                  : "text-[var(--color-health-warning)]",
              )}
            >
              {c.percentChange > 0 ? "+" : ""}
              {c.percentChange.toFixed(0)}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Today's progress, small enough to sit next to the goals card. */
export function TodayCard({
  streak,
  habitsDone,
  habitCount,
  logged,
}: {
  streak: number;
  habitsDone: number;
  habitCount: number;
  logged: boolean;
}) {
  return (
    <Link href="/today" className="card block p-4 hover:border-accent-200">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
          Today
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[12px] font-semibold tabular-nums text-neutral-700">
          <Flame className="size-3.5 text-[var(--color-health-warning)]" />
          {streak}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-[28px] font-semibold leading-none tabular-nums">
          {habitsDone}
          <span className="text-neutral-300">/{habitCount}</span>
        </span>
        <span className="font-mono text-[11px] text-neutral-400">habits</span>
      </div>
      <p className="mt-2 font-mono text-[11px] text-neutral-400">
        {habitCount === 0
          ? "Build a protocol to track"
          : habitsDone === habitCount
            ? "All done for today"
            : `${habitCount - habitsDone} left`}
        {logged ? " · numbers logged" : " · nothing logged yet"}
      </p>
    </Link>
  );
}

/** The three goals with the nearest due date. */
export function GoalsCard({
  goals,
}: {
  goals: {
    id: string;
    metricCode: string;
    metricName: string;
    unit: string | null;
    current: number | null;
    progress: number;
    due: string | null;
    reached: boolean;
  }[];
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="size-3.5 text-neutral-400" />
          <h2 className="font-display text-[13px] font-semibold text-neutral-900">
            Goals
          </h2>
        </div>
        <Link
          href="/goals"
          className="flex items-center gap-1 font-mono text-[11px] text-neutral-400 hover:text-neutral-600"
        >
          All
          <ChevronRight className="size-3" />
        </Link>
      </div>

      {goals.length === 0 ? (
        <p className="px-4 py-6 text-center font-body text-[12px] text-neutral-500">
          No goals yet. Open a biomarker and set a target band.
        </p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {goals.map((g) => (
            <Link
              key={g.id}
              href={`/m/${g.metricCode}`}
              className="block px-4 py-3 hover:bg-neutral-50"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate font-body text-[12px] font-medium text-neutral-700">
                  {g.metricName}
                </span>
                <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums">
                  {g.current ?? "—"}
                  <span className="ml-1 text-[10px] font-normal text-neutral-400">
                    {g.unit ?? ""}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-neutral-150">
                <div
                  className="h-full"
                  style={{
                    width: `${g.progress}%`,
                    backgroundColor: g.reached
                      ? "var(--color-health-normal)"
                      : "var(--color-accent-500)",
                  }}
                />
              </div>
              <span className="mt-1 block font-mono text-[10px] text-neutral-400">
                {g.progress}%{g.due ? ` · due ${g.due}` : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** The plan in two lines: what to do first, and how much is still unmeasured. */
export function PlanCard({
  actions,
  neverCount,
}: {
  actions: string[];
  neverCount: number;
}) {
  return (
    <Link href="/plan" className="card block p-4 hover:border-accent-200">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
          Plan
        </span>
        <Stethoscope className="size-3.5 text-neutral-400" />
      </div>
      {actions.length ? (
        <ul className="mt-2 space-y-1">
          {actions.map((a) => (
            <li key={a} className="truncate font-body text-[13px] text-neutral-800">
              {a}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 font-body text-[13px] text-neutral-500">
          No plan yet. Open it and press Generate.
        </p>
      )}
      <p className="mt-2 font-mono text-[11px] text-neutral-400">
        {neverCount} core marker{neverCount === 1 ? "" : "s"} never measured
      </p>
    </Link>
  );
}
