"use client";

import Link from "next/link";
import {
  Clock,
  ChevronRight,
  FlaskConical,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RetestItem {
  metricCode: string;
  metricName: string;
  urgency: "overdue" | "due_soon" | "upcoming" | "on_track" | "never_tested";
  dueInDays: number;
  daysSinceLastTest: number;
  healthStatus: string;
  preventionPanel?: string | null;
  preventionWhy?: string | null;
}

export interface TriageData {
  items: Array<{
    metricCode: string;
    priority: string;
    reason: string;
  }>;
  generatedAt: string;
  generatedBy: string;
}

interface UpcomingRetestsProps {
  items: RetestItem[];
  triage?: TriageData | null;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
}

const urgencyStyles: Record<
  string,
  { dot: string; text: string; label: string }
> = {
  overdue: {
    dot: "bg-testing-overdue",
    text: "text-testing-overdue",
    label: "OVERDUE",
  },
  due_soon: {
    dot: "bg-testing-due",
    text: "text-testing-due",
    label: "DUE SOON",
  },
  upcoming: {
    dot: "bg-testing-upcoming",
    text: "text-testing-upcoming",
    label: "UPCOMING",
  },
  on_track: {
    dot: "bg-testing-on-track",
    text: "text-testing-on-track",
    label: "ON TRACK",
  },
  never_tested: {
    dot: "bg-neutral-300",
    text: "text-neutral-500",
    label: "GET TESTED",
  },
};

const priorityDot: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-neutral-300",
};

export function UpcomingRetests({
  items,
  triage,
  onAnalyze,
  isAnalyzing,
}: UpcomingRetestsProps) {
  const actionable = items.filter((i) => i.urgency !== "on_track");

  if (actionable.length === 0) return null;

  // When triage exists, filter and sort by AI priority
  const triageMap = new Map(triage?.items.map((t) => [t.metricCode, t]) ?? []);
  const hasTriage = triage && triage.items.length > 0;

  let retests: RetestItem[];
  let gaps: RetestItem[];

  if (hasTriage) {
    // Show only high/medium priority items
    const prioritized = actionable
      .filter((i) => {
        const t = triageMap.get(i.metricCode);
        return t && (t.priority === "high" || t.priority === "medium");
      })
      .sort((a, b) => {
        const pa = triageMap.get(a.metricCode)?.priority === "high" ? 0 : 1;
        const pb = triageMap.get(b.metricCode)?.priority === "high" ? 0 : 1;
        return pa - pb;
      });

    retests = prioritized
      .filter((i) => i.urgency !== "never_tested")
      .slice(0, 8);
    gaps = prioritized.filter((i) => i.urgency === "never_tested").slice(0, 3);
  } else {
    // Original behavior — show first 8 actionable items
    const sliced = actionable.slice(0, 8);
    retests = sliced.filter((i) => i.urgency !== "never_tested");
    gaps = sliced.filter((i) => i.urgency === "never_tested");
  }

  if (retests.length === 0 && gaps.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5 text-neutral-400" />
          <h2 className="text-[13px] font-semibold text-neutral-900 font-display">
            Upcoming Retests
          </h2>
          {hasTriage && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-mono text-violet-500 uppercase tracking-wider">
              <Sparkles className="size-2.5" />
              AI prioritized
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAnalyze && (
            <button
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className={cn(
                "text-[10px] font-mono uppercase tracking-wider flex items-center gap-1 transition-colors",
                hasTriage
                  ? "text-neutral-400 hover:text-neutral-600"
                  : "text-violet-500 hover:text-violet-700",
                isAnalyzing && "opacity-50 cursor-wait",
              )}
            >
              {isAnalyzing ? (
                <RefreshCw className="size-2.5 animate-spin" />
              ) : hasTriage ? (
                <RefreshCw className="size-2.5" />
              ) : (
                <Sparkles className="size-2.5" />
              )}
              {hasTriage ? "Refresh" : "Analyze"}
            </button>
          )}
          <Link
            href="/testing"
            className="text-[11px] font-mono text-neutral-400 hover:text-neutral-600 transition-colors flex items-center gap-1"
          >
            Plan
            <ChevronRight className="size-3" />
          </Link>
        </div>
      </div>
      <div className="divide-y divide-neutral-100">
        {retests.map((item) => {
          const style = urgencyStyles[item.urgency] ?? urgencyStyles.on_track;
          const triageItem = triageMap.get(item.metricCode);
          const dueText =
            item.dueInDays <= 0
              ? `${Math.abs(item.dueInDays)}d overdue`
              : `in ${item.dueInDays}d`;

          return (
            <div key={item.metricCode} className="flex items-center px-4 py-3">
              <span
                className={cn(
                  "size-[5px] rounded-full shrink-0 mr-3",
                  hasTriage && triageItem
                    ? (priorityDot[triageItem.priority] ?? "bg-neutral-300")
                    : style.dot,
                )}
              />
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-medium text-neutral-700 font-body truncate block">
                  {item.metricName}
                </span>
                {hasTriage && triageItem ? (
                  <span className="text-[10px] font-body text-neutral-400 truncate block">
                    {triageItem.reason}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-neutral-400">
                    Last tested {item.daysSinceLastTest}d ago
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-mono font-bold uppercase tracking-[0.04em] shrink-0 ml-2",
                  style.text,
                )}
              >
                {dueText}
              </span>
            </div>
          );
        })}

        {/* Prevention gap separator */}
        {gaps.length > 0 && retests.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-neutral-50">
            <FlaskConical className="size-3 text-neutral-400" />
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.06em]">
              Recommended tests
            </span>
          </div>
        )}

        {gaps.map((item) => (
          <div
            key={item.metricCode}
            className="flex items-center px-4 py-3 bg-neutral-50/50"
          >
            <span className="size-[5px] rounded-full shrink-0 mr-3 bg-neutral-300 ring-2 ring-neutral-200" />
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-medium text-neutral-600 font-body truncate block">
                {item.metricName}
              </span>
              {item.preventionPanel && (
                <span className="text-[10px] font-mono text-neutral-400">
                  {item.preventionPanel}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.04em] text-accent-500">
              Get tested
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
