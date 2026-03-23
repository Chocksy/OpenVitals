"use client";

import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { TitleActionHeader } from "@/components/title-action-header";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatMetricName(code: string) {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const inputClass =
  "w-24 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm font-mono tabular-nums text-right focus:border-accent-300 focus:outline-none focus:ring-1 focus:ring-accent-300";

export default function OptimalRangesPage() {
  const { data: optimalData, isLoading } =
    trpc.optimalRanges.forUser.useQuery();
  const { data: overrides } = trpc.optimalRanges.getUserOverrides.useQuery();
  const { data: metricsData } = trpc.metrics.list.useQuery();

  const utils = trpc.useUtils();
  const setOverrideMutation = trpc.optimalRanges.setOverride.useMutation({
    onSuccess: () => {
      utils.optimalRanges.forUser.invalidate();
      utils.optimalRanges.getUserOverrides.invalidate();
      toast.success("Override saved");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteOverrideMutation = trpc.optimalRanges.deleteOverride.useMutation({
    onSuccess: () => {
      utils.optimalRanges.forUser.invalidate();
      utils.optimalRanges.getUserOverrides.invalidate();
      toast.success("Reset to default");
    },
    onError: (err) => toast.error(err.message),
  });

  const overrideSet = useMemo(
    () => new Set((overrides ?? []).map((o) => o.metricCode)),
    [overrides],
  );

  type EditState = Record<string, { low: string; high: string }>;
  const [edits, setEdits] = useState<EditState>({});

  useEffect(() => {
    if (!optimalData) return;
    const initial: EditState = {};
    for (const [code, range] of Object.entries(optimalData)) {
      initial[code] = {
        low: range.rangeLow != null ? String(range.rangeLow) : "",
        high: range.rangeHigh != null ? String(range.rangeHigh) : "",
      };
    }
    setEdits(initial);
  }, [optimalData]);

  const metricNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of metricsData ?? []) {
      map.set(m.id, m.name);
    }
    return map;
  }, [metricsData]);

  const sortedCodes = useMemo(
    () =>
      Object.keys(optimalData ?? {}).sort((a, b) => {
        const nameA = metricNames.get(a) ?? formatMetricName(a);
        const nameB = metricNames.get(b) ?? formatMetricName(b);
        return nameA.localeCompare(nameB);
      }),
    [optimalData, metricNames],
  );

  const handleSave = (code: string) => {
    const edit = edits[code];
    if (!edit) return;
    const low = edit.low === "" ? null : parseFloat(edit.low);
    const high = edit.high === "" ? null : parseFloat(edit.high);
    if ((low !== null && isNaN(low)) || (high !== null && isNaN(high))) {
      toast.error("Invalid number");
      return;
    }
    setOverrideMutation.mutate({
      metricCode: code,
      rangeLow: low,
      rangeHigh: high,
    });
  };

  const handleReset = (code: string) => {
    deleteOverrideMutation.mutate({ metricCode: code });
  };

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader
          showBackButton
          title="Optimal Ranges"
          subtitle="Loading..."
        />
        <div className="card mt-7 max-w-2xl h-64 animate-pulse bg-neutral-50" />
      </div>
    );
  }

  return (
    <div>
      <TitleActionHeader
        showBackButton
        title="Optimal Ranges"
        subtitle="Customize longevity-focused ranges per metric. Overrides apply only to your account."
      />

      <div className="mt-7 max-w-2xl">
        <div className="card">
          {/* Header */}
          <div className="grid grid-cols-[1fr_6rem_6rem_5rem] gap-2 px-4 py-2.5 border-b border-neutral-100 bg-neutral-50">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono">
              Metric
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono text-right">
              Low
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono text-right">
              High
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono text-right">
              Action
            </span>
          </div>

          {/* Rows */}
          {sortedCodes.map((code) => {
            const range = optimalData![code]!;
            const edit = edits[code];
            const isOverride = overrideSet.has(code);
            const hasChanges =
              edit &&
              (edit.low !==
                (range.rangeLow != null ? String(range.rangeLow) : "") ||
                edit.high !==
                  (range.rangeHigh != null ? String(range.rangeHigh) : ""));

            return (
              <div
                key={code}
                className={cn(
                  "grid grid-cols-[1fr_6rem_6rem_5rem] gap-2 items-center px-4 py-2.5 border-b border-neutral-100 last:border-b-0",
                  isOverride && "bg-[var(--color-health-optimal-bg)]/50",
                )}
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-neutral-700 font-body truncate block">
                    {metricNames.get(code) ?? formatMetricName(code)}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {range.source}
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={edit?.low ?? ""}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      [code]: { ...prev[code]!, low: e.target.value },
                    }))
                  }
                  onBlur={() => hasChanges && handleSave(code)}
                  className={inputClass}
                  placeholder="—"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={edit?.high ?? ""}
                  onChange={(e) =>
                    setEdits((prev) => ({
                      ...prev,
                      [code]: { ...prev[code]!, high: e.target.value },
                    }))
                  }
                  onBlur={() => hasChanges && handleSave(code)}
                  className={inputClass}
                  placeholder="—"
                />
                <div className="text-right">
                  {isOverride ? (
                    <button
                      onClick={() => handleReset(code)}
                      className="text-[11px] font-medium text-neutral-400 hover:text-neutral-600 transition-colors font-mono"
                    >
                      Reset
                    </button>
                  ) : (
                    <span className="text-[11px] text-neutral-300 font-mono">
                      Default
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {sortedCodes.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-neutral-400">
              No optimal ranges available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
