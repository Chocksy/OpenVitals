"use client";

import { cn } from "@/lib/utils";
import {
  Sparkles,
  RefreshCw,
  ChevronDown,
  FlaskConical,
  Plus,
  Copy,
  Check,
  Lightbulb,
} from "lucide-react";
import { useState } from "react";

interface MetricDetail {
  code: string;
  name: string;
  lastValue?: number | null;
  unit?: string | null;
  daysSince?: number;
}

interface LabPanelGroup {
  domain: string;
  priority: string;
  reason: string;
  rationale?: string;
  metrics: string[];
  metricNames?: string[];
  metricDetails?: MetricDetail[];
}

interface NewSuggestion {
  name: string;
  code: string;
  reason: string;
}

interface LabPanelPlan {
  summary: string;
  groups: LabPanelGroup[];
  optional?: {
    reason: string;
    metrics: string[];
    metricNames?: string[];
    metricDetails?: MetricDetail[];
  };
  newSuggestions?: NewSuggestion[];
}

interface NextLabPanelProps {
  plan: LabPanelPlan | null;
  generatedAt?: string;
  onGenerate: () => void;
  isGenerating: boolean;
}

const priorityStyles: Record<
  string,
  { border: string; dot: string; label: string }
> = {
  high: {
    border: "border-l-red-400",
    dot: "bg-red-500",
    label: "Must test",
  },
  medium: {
    border: "border-l-amber-400",
    dot: "bg-amber-500",
    label: "Should test",
  },
  low: {
    border: "border-l-neutral-300",
    dot: "bg-neutral-400",
    label: "Nice to have",
  },
};

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDaysAgo(days: number): string {
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}yr ago`;
}

function buildCopyText(plan: LabPanelPlan): string {
  const lines: string[] = [];
  lines.push("LAB PANEL — " + plan.summary);
  lines.push("");

  for (const group of plan.groups) {
    const style = priorityStyles[group.priority];
    lines.push(
      `${group.domain.toUpperCase()} [${style?.label ?? group.priority}]`,
    );
    lines.push(`  ${group.reason}`);
    if (group.rationale) {
      lines.push(`  Why: ${group.rationale}`);
    }
    const details = group.metricDetails ?? [];
    for (let i = 0; i < group.metrics.length; i++) {
      const d = details[i];
      const name = d?.name ?? group.metricNames?.[i] ?? group.metrics[i];
      const val =
        d?.lastValue != null ? ` — ${d.lastValue} ${d.unit ?? ""}` : "";
      const age =
        d?.daysSince != null ? ` (${formatDaysAgo(d.daysSince)})` : "";
      lines.push(`  • ${name}${val}${age}`);
    }
    lines.push("");
  }

  if (plan.optional && plan.optional.metrics.length > 0) {
    lines.push("OPTIONAL ADD-ONS");
    lines.push(`  ${plan.optional.reason}`);
    const details = plan.optional.metricDetails ?? [];
    for (let i = 0; i < plan.optional.metrics.length; i++) {
      const d = details[i];
      const name =
        d?.name ?? plan.optional.metricNames?.[i] ?? plan.optional.metrics[i];
      lines.push(`  • ${name}`);
    }
    lines.push("");
  }

  if (plan.newSuggestions && plan.newSuggestions.length > 0) {
    lines.push("NEW — CONSIDER ADDING");
    for (const s of plan.newSuggestions) {
      lines.push(`  • ${s.name} — ${s.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function NextLabPanel({
  plan,
  generatedAt,
  onGenerate,
  isGenerating,
}: NextLabPanelProps) {
  const [showOptional, setShowOptional] = useState(false);
  const [showNewSuggestions, setShowNewSuggestions] = useState(true);
  const [copied, setCopied] = useState(false);

  // No plan yet — show CTA
  if (!plan) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/30 p-8 text-center">
        <FlaskConical className="size-8 text-violet-400 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-neutral-800 mb-1">
          Plan Your Next Lab Panel
        </h3>
        <p className="text-xs text-neutral-500 mb-4 max-w-md mx-auto">
          AI will analyze your biomarker history, medications, and conditions to
          suggest a focused, practical lab panel for your next blood test.
        </p>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
            "bg-violet-500 text-white hover:bg-violet-600 transition-colors",
            isGenerating && "opacity-50 cursor-wait",
          )}
        >
          {isGenerating ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {isGenerating ? "Analyzing your data..." : "Generate Lab Panel"}
        </button>
      </div>
    );
  }

  const totalMetrics =
    plan.groups.reduce((sum, g) => sum + g.metrics.length, 0) +
    (plan.optional?.metrics?.length ?? 0);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildCopyText(plan));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="size-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-neutral-900">
              Your Next Lab Panel
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-mono text-violet-500 uppercase tracking-wider">
              <Sparkles className="size-2.5" />
              AI suggested
            </span>
          </div>
          <p className="text-xs text-neutral-500">{plan.summary}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {generatedAt && (
            <span className="text-[10px] font-mono text-neutral-400">
              {formatTimeAgo(generatedAt)}
            </span>
          )}
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
          >
            {copied ? (
              <Check className="size-3 text-green-500" />
            ) : (
              <Copy className="size-3" />
            )}
            {copied ? "Copied" : "Copy list"}
          </button>
          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium",
              "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors",
              isGenerating && "opacity-50 cursor-wait",
            )}
          >
            <RefreshCw
              className={cn("size-3", isGenerating && "animate-spin")}
            />
            Regenerate
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-neutral-500">
        <span className="tabular-nums font-medium text-neutral-700">
          {totalMetrics} biomarkers
        </span>
        <span>{plan.groups.length} groups</span>
        {plan.optional && plan.optional.metrics.length > 0 && (
          <span>+ {plan.optional.metrics.length} optional</span>
        )}
        {plan.newSuggestions && plan.newSuggestions.length > 0 && (
          <span>+ {plan.newSuggestions.length} new suggestions</span>
        )}
      </div>

      {/* Groups */}
      <div className="space-y-3">
        {plan.groups.map((group) => {
          const style = priorityStyles[group.priority] ?? priorityStyles.low;
          const details = group.metricDetails ?? [];

          return (
            <div
              key={group.domain}
              className={cn(
                "rounded-xl border border-neutral-200 bg-white p-4 border-l-2",
                style.border,
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", style.dot)} />
                  <h4 className="text-sm font-semibold text-neutral-900">
                    {group.domain}
                  </h4>
                  <span className="text-[10px] font-mono text-neutral-400 uppercase">
                    {style.label}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-neutral-400">
                  {group.metrics.length} tests
                </span>
              </div>
              <p className="text-xs text-neutral-500 mb-2">{group.reason}</p>
              {group.rationale && (
                <div className="mb-3 flex gap-2 items-start bg-violet-50/50 rounded-lg px-3 py-2 border border-violet-100">
                  <Lightbulb className="size-3 text-violet-400 mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed text-neutral-600">
                    {group.rationale}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                {details.length > 0
                  ? details.map((d) => (
                      <div
                        key={d.code}
                        className="flex items-center justify-between rounded-md bg-neutral-50 px-2.5 py-1.5"
                      >
                        <span className="text-[11px] font-medium text-neutral-700">
                          {d.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400">
                          {d.lastValue != null && (
                            <span className="text-neutral-600">
                              {d.lastValue} {d.unit ?? ""}
                            </span>
                          )}
                          {d.daysSince != null && (
                            <span>{formatDaysAgo(d.daysSince)}</span>
                          )}
                        </div>
                      </div>
                    ))
                  : (group.metricNames ?? group.metrics).map((name, idx) => (
                      <div
                        key={group.metrics[idx]}
                        className="inline-flex items-center rounded-md bg-neutral-50 border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-700 mr-1.5 mb-1"
                      >
                        {name}
                      </div>
                    ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Optional add-ons */}
      {plan.optional && plan.optional.metrics.length > 0 && (
        <div>
          <button
            onClick={() => setShowOptional(!showOptional)}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            <Plus className="size-3" />
            Optional add-ons ({plan.optional.metrics.length})
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                showOptional && "rotate-180",
              )}
            />
          </button>
          {showOptional && (
            <div className="mt-2 rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 p-4">
              <p className="text-xs text-neutral-500 mb-3">
                {plan.optional.reason}
              </p>
              <div className="space-y-1.5">
                {(plan.optional.metricDetails ?? []).length > 0
                  ? plan.optional.metricDetails!.map((d) => (
                      <div
                        key={d.code}
                        className="flex items-center justify-between rounded-md bg-white px-2.5 py-1.5"
                      >
                        <span className="text-[11px] font-medium text-neutral-600">
                          {d.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400">
                          {d.lastValue != null && (
                            <span className="text-neutral-500">
                              {d.lastValue} {d.unit ?? ""}
                            </span>
                          )}
                          {d.daysSince != null && (
                            <span>{formatDaysAgo(d.daysSince)}</span>
                          )}
                        </div>
                      </div>
                    ))
                  : (plan.optional.metricNames ?? plan.optional.metrics).map(
                      (name, idx) => (
                        <span
                          key={plan.optional!.metrics[idx]}
                          className="inline-flex items-center rounded-md bg-white border border-neutral-200 px-2 py-1 text-[11px] font-medium text-neutral-600 mr-1.5 mb-1"
                        >
                          {name}
                        </span>
                      ),
                    )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* New Suggestions */}
      {plan.newSuggestions && plan.newSuggestions.length > 0 && (
        <div>
          <button
            onClick={() => setShowNewSuggestions(!showNewSuggestions)}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
          >
            <Lightbulb className="size-3" />
            New — consider adding ({plan.newSuggestions.length})
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                showNewSuggestions && "rotate-180",
              )}
            />
          </button>
          {showNewSuggestions && (
            <div className="mt-2 rounded-xl border border-violet-100 bg-violet-50/30 p-4">
              <p className="text-[11px] text-violet-500 mb-3">
                Biomarkers you haven't tested before that could provide valuable
                insights based on your health profile.
              </p>
              <div className="space-y-2">
                {plan.newSuggestions.map((s) => (
                  <div
                    key={s.code}
                    className="flex items-start gap-2 rounded-lg bg-white border border-violet-100 px-3 py-2.5"
                  >
                    <Sparkles className="size-3 text-violet-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[12px] font-medium text-neutral-800 block">
                        {s.name}
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        {s.reason}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
