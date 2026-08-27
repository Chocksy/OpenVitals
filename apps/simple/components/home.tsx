/**
 * Home, top to bottom: where you stand, what is wrong, what to do. Every card
 * here is a server component fed plain data — no hooks, no client bundle —
 * except the two it borrows from /plan and /review.
 */
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  FlaskConical,
  Stethoscope,
} from "lucide-react";
import type { ReportAction } from "@/db";
import { cn, formatDate } from "@/lib/utils";
import type { AttentionMetric, TrendMetric } from "@/lib/home-data";
import type { HealthStatus } from "@/lib/status";
import { ActionButtons, GeneratePlan } from "./plan";
import { RangeBar } from "./range-bar";
import { StatusBadge } from "./status-badge";
import { TrendChart } from "./trend-chart";
import { BasisChip, Card } from "./ui-kit";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function SectionHeader({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 font-mono text-[11px] text-neutral-400 transition-colors hover:text-neutral-600"
        >
          {linkLabel}
          <ChevronRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

/* ── 1. header strip ─────────────────────────────────────────────────── */

export function GreetingHeader({
  firstName,
  summaryLine,
  lastDraw,
  questionCount,
}: {
  firstName: string;
  summaryLine: string;
  lastDraw: string | null;
  questionCount: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em] text-neutral-900 md:text-[34px]">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 font-display text-[14px] text-neutral-500">
          {summaryLine}
        </p>
        <p className="mt-1 font-mono text-[11px] text-neutral-400">
          {lastDraw
            ? `Last blood draw ${formatDate(lastDraw)}`
            : "No blood draw yet"}
        </p>
      </div>
      {questionCount > 0 && (
        <Link
          href="/review"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-health-warning-border)] bg-[var(--color-health-warning-bg)] px-3 py-1.5 font-body text-[13px] text-neutral-800 hover:border-[var(--color-health-warning)]"
        >
          <ClipboardCheck className="size-3.5 text-[var(--color-health-warning)]" />
          {questionCount} question{questionCount === 1 ? "" : "s"}
        </Link>
      )}
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
  optimalCount,
  normalCount,
  offCount,
  totalMetrics,
}: {
  score: number;
  optimalCount: number;
  normalCount: number;
  offCount: number;
  totalMetrics: number;
}) {
  const radius = 52;
  const circumference = Math.PI * radius;
  const progress = (score / 100) * circumference;
  const arc = `M ${60 - radius} 64 A ${radius} ${radius} 0 0 1 ${60 + radius} 64`;
  const color =
    score >= 75
      ? "var(--color-health-normal)"
      : score >= 40
        ? "var(--color-health-warning)"
        : "var(--color-health-critical)";

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
          Based on {totalMetrics} tracked markers
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-health-normal">
            <span className="size-[5px] bg-health-normal" />
            {optimalCount} optimal
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-health-warning">
            <span className="size-[5px] bg-health-warning" />
            {normalCount} normal
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-health-critical">
            <span className="size-[5px] bg-health-critical" />
            {offCount} off
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 2. systems strip ────────────────────────────────────────────────── */

export interface SystemTile {
  id: string;
  name: string;
  /** 0..1 importance from computeGraphState. Higher is worse. */
  score: number;
  worstName: string | null;
  worstStatus: HealthStatus | null;
}

/** Same three tones as the graph's importance bar, drawn as a ring. */
function ringColor(score: number) {
  if (score >= 0.6) return "var(--color-health-critical)";
  if (score >= 0.3) return "var(--color-health-warning)";
  return "var(--color-accent-500)";
}

export function SystemsStrip({ systems }: { systems: SystemTile[] }) {
  const r = 13;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
      {systems.map((s) => (
        <Link
          key={s.id}
          href="/graph"
          className="card flex flex-col items-center gap-1.5 p-2.5 text-center hover:border-accent-200"
        >
          <svg width="32" height="32" viewBox="0 0 32 32">
            <circle
              cx="16"
              cy="16"
              r={r}
              fill="none"
              stroke="var(--color-neutral-150)"
              strokeWidth="3"
            />
            <circle
              cx="16"
              cy="16"
              r={r}
              fill="none"
              stroke={ringColor(s.score)}
              strokeWidth="3"
              strokeDasharray={`${s.score * circumference} ${circumference}`}
              transform="rotate(-90 16 16)"
            />
            <text
              x="16"
              y="20"
              textAnchor="middle"
              className="fill-neutral-500 font-mono"
              style={{ fontSize: 10 }}
            >
              {Math.round(s.score * 100)}
            </text>
          </svg>
          <span className="line-clamp-2 font-display text-[11px] font-medium leading-tight text-neutral-800">
            {s.name}
          </span>
          <span className="w-full truncate font-mono text-[10px] text-neutral-400">
            {s.worstName ?? "never measured"}
          </span>
          {s.worstStatus && (
            <StatusBadge status={s.worstStatus} label={s.worstStatus} />
          )}
        </Link>
      ))}
    </div>
  );
}

/* ── 3. fix next ─────────────────────────────────────────────────────── */

export function FixNext({
  actions,
  reportId,
  testCount,
}: {
  actions: { action: ReportAction; index: number }[];
  reportId: string | null;
  testCount: number;
}) {
  if (!reportId)
    return (
      <Card className="border-dashed p-8 text-center">
        <Stethoscope className="mx-auto mb-3 size-7 text-neutral-300" />
        <p className="font-body text-[13px] text-neutral-500">
          No plan yet. Write one from everything we already know.
        </p>
        <div className="mt-3 flex justify-center">
          <GeneratePlan />
        </div>
      </Card>
    );

  return (
    <div className="space-y-2">
      {actions.map(({ action, index }) => (
        <Card key={`${action.title}-${index}`} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-display text-[15px] font-medium">
              {action.title}
            </p>
            <BasisChip basis={action.basis} />
          </div>
          {action.dose && (
            <p className="mt-2 font-mono text-[12px] tabular-nums text-neutral-700">
              {action.dose.amount}
              {action.dose.form ? ` · ${action.dose.form}` : ""} ·{" "}
              {action.dose.schedule}
              {action.dose.duration ? ` · ${action.dose.duration}` : ""}
            </p>
          )}
          <p className="mt-2 font-body text-[13px] text-neutral-700">
            {action.why}
          </p>
          <div className="mt-3">
            <ActionButtons
              reportId={reportId}
              actionIndex={index}
              kind={action.kind}
            />
          </div>
        </Card>
      ))}

      <Link
        href="/plan"
        className="card flex items-center gap-2 px-4 py-3 hover:border-accent-200"
      >
        <FlaskConical className="size-3.5 text-neutral-400" />
        <span className="font-body text-[13px] text-neutral-800">
          Tests to order ({testCount})
        </span>
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.06em] text-neutral-400">
          Open the full plan →
        </span>
      </Link>
    </div>
  );
}

/* ── 4. key trends ───────────────────────────────────────────────────── */

export function KeyTrends({ trends }: { trends: TrendMetric[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {trends.map((t) => (
        <Card key={t.metricCode} className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`/m/${t.metricCode}`}
              className="font-display text-[13px] font-medium text-neutral-800 hover:underline"
            >
              {t.metricName}
            </Link>
            <span className="font-mono text-[10px] text-neutral-400">
              {t.points.length} readings
            </span>
          </div>

          <TrendChart
            height={140}
            data={t.points.map((p) => ({
              date: p.date,
              value: p.value,
              unit: t.unit,
            }))}
            referenceRangeLow={t.refLow}
            referenceRangeHigh={t.refHigh}
            optimalRangeLow={t.optimalLow}
            optimalRangeHigh={t.optimalHigh}
            goalLow={t.goalLow}
            goalHigh={t.goalHigh}
            unit={t.unit}
            status={t.status}
          />

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-display text-[26px] font-medium tracking-[-0.03em] text-neutral-900">
              {Number.isInteger(t.latestValue)
                ? t.latestValue
                : t.latestValue.toFixed(1)}
            </span>
            {t.unit && (
              <span className="font-mono text-[11px] text-neutral-400">
                {t.unit}
              </span>
            )}
          </div>
          <div className="mt-2">
            <RangeBar
              value={t.latestValue}
              prev={t.prevValue}
              refLow={t.refLow}
              refHigh={t.refHigh}
              optimalLow={t.optimalLow}
              optimalHigh={t.optimalHigh}
              goal={t.goalLow ?? t.goalHigh}
              unit={t.unit}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── 5. needs attention ──────────────────────────────────────────────── */

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
            className="group block px-4 py-3 transition-colors hover:bg-neutral-50"
          >
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate font-body text-[13px] font-medium text-neutral-900">
                  {m.metricName}
                </span>
                <StatusBadge status={m.status} label={m.status} />
                {m.daysSinceTest !== null && (
                  <span className="hidden font-mono text-[10px] text-neutral-400 sm:inline">
                    {m.daysSinceTest === 0
                      ? "today"
                      : `${m.daysSinceTest}d ago`}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="font-mono text-[14px] font-semibold tabular-nums text-neutral-900">
                  {m.latestValue ?? "—"}
                </span>
                {m.unit && (
                  <span className="ml-1 font-mono text-[10px] text-neutral-400">
                    {m.unit}
                  </span>
                )}
              </div>
              <ChevronRight className="size-3.5 shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500" />
            </div>
            <div className="mt-2">
              <RangeBar
                value={m.latestValue}
                prev={m.prevValue}
                refLow={m.refLow}
                refHigh={m.refHigh}
                optimalLow={m.optimalLow}
                optimalHigh={m.optimalHigh}
                unit={m.unit}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
