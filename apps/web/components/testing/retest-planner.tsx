"use client";

import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { RetestItem } from "./retest-item";
import { RetestSettingsDialog } from "./retest-settings-dialog";
import { NextLabPanel } from "./next-lab-panel";
import { useState } from "react";
import { Sparkles, RefreshCw, ChevronDown } from "lucide-react";

type Urgency = "overdue" | "due_soon" | "upcoming" | "on_track";

const urgencyConfig: Record<
  Urgency,
  { label: string; color: string; bg: string }
> = {
  overdue: {
    label: "Overdue",
    color: "var(--color-testing-overdue)",
    bg: "var(--color-testing-overdue-bg)",
  },
  due_soon: {
    label: "Due Soon",
    color: "var(--color-testing-due)",
    bg: "var(--color-testing-due-bg)",
  },
  upcoming: {
    label: "Upcoming",
    color: "var(--color-testing-upcoming)",
    bg: "var(--color-testing-upcoming-bg)",
  },
  on_track: {
    label: "On Track",
    color: "var(--color-testing-on-track)",
    bg: "var(--color-testing-on-track-bg)",
  },
};

// Health domain grouping for the AI summary
const DOMAIN_LABELS: Record<string, string> = {
  lipid: "Lipid Panel",
  metabolic: "Metabolic",
  thyroid: "Thyroid",
  cbc: "Blood Count",
  liver: "Liver",
  kidney: "Kidney",
  inflammation: "Inflammation",
  vitamin: "Vitamins & Minerals",
  hormone: "Hormones",
  urinalysis: "Urinalysis",
  lab_result: "General Labs",
};

function getDomainLabel(category: string): string {
  return DOMAIN_LABELS[category] ?? category.replace(/_/g, " ");
}

export function RetestPlanner() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } =
    trpc.testing["retest.getRecommendations"].useQuery();
  const triageQuery = trpc.testing["retest.getCachedTriage"].useQuery();
  const triageMutation = trpc.testing["retest.triage"].useMutation({
    onSuccess: () => triageQuery.refetch(),
  });
  const setOverride = trpc.testing["retest.setOverride"].useMutation({
    onSuccess: () => utils.testing["retest.getRecommendations"].invalidate(),
  });
  const deleteOverride = trpc.testing["retest.deleteOverride"].useMutation({
    onSuccess: () => utils.testing["retest.getRecommendations"].invalidate(),
  });
  const togglePause = trpc.testing["retest.togglePause"].useMutation({
    onSuccess: () => utils.testing["retest.getRecommendations"].invalidate(),
  });
  const planQuery = trpc.testing["retest.getCachedPlan"].useQuery();
  const planMutation = trpc.testing["retest.generatePlan"].useMutation({
    onSuccess: () => planQuery.refetch(),
  });

  const [editMetric, setEditMetric] = useState<string | null>(null);
  const [showFullList, setShowFullList] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50"
            />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50"
          />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
        <p className="text-sm text-neutral-500">
          No lab data yet. Upload a lab report to get personalized retest
          recommendations.
        </p>
      </div>
    );
  }

  // Build triage lookup
  const triageMap = new Map(
    triageQuery.data?.items.map((t) => [t.metricCode, t]) ?? [],
  );
  const hasTriage = triageQuery.data && triageQuery.data.items.length > 0;

  // Group by urgency
  const groups: Record<Urgency, typeof items> = {
    overdue: [],
    due_soon: [],
    upcoming: [],
    on_track: [],
  };
  for (const item of items) {
    const group = groups[item.urgency as Urgency];
    if (group) group.push(item);
  }

  const counts = {
    overdue: groups.overdue.length,
    due_soon: groups.due_soon.length,
    upcoming: groups.upcoming.length,
    on_track: groups.on_track.length,
  };

  // Build health domain summary from triage data
  const domainSummary = hasTriage ? buildDomainSummary(items, triageMap) : null;

  const editingItem = editMetric
    ? items.find((i) => i.metricCode === editMetric)
    : null;

  return (
    <div className="space-y-5">
      {/* Next Lab Panel — primary view */}
      <NextLabPanel
        plan={planQuery.data?.plan ?? null}
        generatedAt={planQuery.data?.generatedAt}
        onGenerate={() => planMutation.mutate()}
        isGenerating={planMutation.isPending}
      />

      {/* Full Retest List — collapsible */}
      <div className="border-t border-neutral-200 pt-4">
        <button
          onClick={() => setShowFullList(!showFullList)}
          className="flex items-center gap-2 text-xs font-medium text-neutral-500 hover:text-neutral-700 transition-colors w-full"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              showFullList && "rotate-180",
            )}
          />
          <span>All biomarkers ({items.length})</span>
          <span className="text-[10px] font-mono text-neutral-400">
            {counts.overdue} overdue · {counts.due_soon} due soon ·{" "}
            {counts.upcoming} upcoming · {counts.on_track} on track
          </span>
        </button>
      </div>

      {showFullList && (
        <>
          {/* AI Triage header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasTriage && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-mono text-violet-600 uppercase tracking-wider">
                  <Sparkles className="size-3" />
                  AI Prioritized
                </span>
              )}
              {hasTriage && triageQuery.data?.generatedAt && (
                <span className="text-[10px] font-mono text-neutral-400">
                  {formatTimeAgo(triageQuery.data.generatedAt)}
                </span>
              )}
            </div>
            <button
              onClick={() => triageMutation.mutate()}
              disabled={triageMutation.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                hasTriage
                  ? "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                  : "bg-violet-500 text-white hover:bg-violet-600",
                triageMutation.isPending && "opacity-50 cursor-wait",
              )}
            >
              {triageMutation.isPending ? (
                <RefreshCw className="size-3 animate-spin" />
              ) : hasTriage ? (
                <RefreshCw className="size-3" />
              ) : (
                <Sparkles className="size-3" />
              )}
              {triageMutation.isPending
                ? "Analyzing..."
                : hasTriage
                  ? "Refresh Analysis"
                  : "Analyze with AI"}
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 stagger-children">
            {(
              Object.entries(urgencyConfig) as [
                Urgency,
                (typeof urgencyConfig)[Urgency],
              ][]
            ).map(([key, config]) => (
              <div
                key={key}
                className="rounded-xl border border-neutral-200 bg-white p-3.5"
              >
                <p className="text-xs font-medium text-neutral-500">
                  {config.label}
                </p>
                <p
                  className="mt-1 stat-number text-2xl"
                  style={{ color: config.color }}
                >
                  {counts[key]}
                </p>
              </div>
            ))}
          </div>

          {/* Grouped lists */}
          {(["overdue", "due_soon", "upcoming", "on_track"] as Urgency[]).map(
            (urgency) => {
              const group = groups[urgency];
              if (group.length === 0) return null;
              const config = urgencyConfig[urgency];

              return (
                <div key={urgency}>
                  <h3
                    className="mb-2 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: config.color }}
                  >
                    {config.label} ({group.length})
                  </h3>
                  <div className="space-y-2">
                    {group.map((item) => (
                      <RetestItem
                        key={item.metricCode}
                        item={item}
                        triageReason={triageMap.get(item.metricCode)?.reason}
                        triagePriority={
                          triageMap.get(item.metricCode)?.priority
                        }
                        onCustomize={setEditMetric}
                        onTogglePause={(code, paused) =>
                          togglePause.mutate({
                            metricCode: code,
                            isPaused: paused,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            },
          )}

          {/* Settings dialog */}
          {editingItem && (
            <RetestSettingsDialog
              metricCode={editingItem.metricCode}
              metricName={editingItem.metricName}
              currentIntervalDays={editingItem.userOverrideIntervalDays}
              onSave={(code, days) => {
                setOverride.mutate({
                  metricCode: code,
                  retestIntervalDays: days,
                });
                setEditMetric(null);
              }}
              onReset={(code) => {
                deleteOverride.mutate({ metricCode: code });
                setEditMetric(null);
              }}
              onClose={() => setEditMetric(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface DomainSummaryItem {
  category: string;
  label: string;
  highCount: number;
  mediumCount: number;
  totalCount: number;
}

function buildDomainSummary(
  items: Array<{ metricCode: string; category: string }>,
  triageMap: Map<
    string,
    { metricCode: string; priority: string; reason: string }
  >,
): DomainSummaryItem[] {
  const domains = new Map<string, DomainSummaryItem>();

  for (const item of items) {
    const triage = triageMap.get(item.metricCode);
    if (!triage) continue;

    const cat = item.category;
    if (!domains.has(cat)) {
      domains.set(cat, {
        category: cat,
        label: getDomainLabel(cat),
        highCount: 0,
        mediumCount: 0,
        totalCount: 0,
      });
    }
    const domain = domains.get(cat)!;
    domain.totalCount++;
    if (triage.priority === "high") domain.highCount++;
    else if (triage.priority === "medium") domain.mediumCount++;
  }

  // Sort: domains with high-priority items first, then by total count
  return [...domains.values()]
    .filter((d) => d.highCount > 0 || d.mediumCount > 0)
    .sort((a, b) => {
      if (a.highCount !== b.highCount) return b.highCount - a.highCount;
      if (a.mediumCount !== b.mediumCount) return b.mediumCount - a.mediumCount;
      return b.totalCount - a.totalCount;
    });
}
