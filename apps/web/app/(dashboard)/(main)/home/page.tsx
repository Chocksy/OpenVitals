"use client";

import { useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useSession } from "@/lib/auth/client";
import { useDynamicStatus } from "@/hooks/use-dynamic-status";
import { formatRange, isTrendImproving } from "@/lib/health-utils";
import { PANELS } from "@/lib/panel-config";
import { GreetingHeader } from "@/components/home/greeting-header";
import {
  OnboardingChecklist,
  type ChecklistItem,
} from "@/components/home/onboarding-checklist";
import { BiomarkerPanelCard } from "@/components/home/biomarker-panel-card";
import { WhatChanged, type ChangeItem } from "@/components/home/what-changed";
import {
  Upload,
  Pill,
  HeartPulse,
  ListChecks,
  FileText,
  MessageSquare,
  Sparkles,
} from "lucide-react";

export default function HomePage() {
  const { data: session } = useSession();
  const {
    getStatus,
    isAbnormal: isObsAbnormal,
    getRanges,
  } = useDynamicStatus();
  const observations = trpc.observations.list.useQuery({ limit: 200 });
  const medications = trpc.medications.list.useQuery({});
  const importJobs = trpc.importJobs.list.useQuery({ limit: 20 });
  const metricDefs = trpc.metrics.list.useQuery(undefined, {
    enabled: (observations.data?.items?.length ?? 0) > 0,
  });
  const conditionsQuery = trpc.conditions.list.useQuery();

  const isLoading =
    observations.isLoading || medications.isLoading || importJobs.isLoading;

  const obsItems = observations.data?.items ?? [];
  const medItems = medications.data?.items ?? [];
  const jobItems = importJobs.data?.items ?? [];
  const metricDefsList = metricDefs.data ?? [];
  const condItems = conditionsQuery.data ?? [];
  const hasData = obsItems.length > 0;

  // Build metric name lookup
  const metricNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const def of metricDefsList) {
      map.set(def.id, def.name);
    }
    return map;
  }, [metricDefsList]);

  // Group observations by metric
  const byMetric = useMemo(() => {
    const map = new Map<string, typeof obsItems>();
    for (const obs of obsItems) {
      const existing = map.get(obs.metricCode) ?? [];
      existing.push(obs);
      map.set(obs.metricCode, existing);
    }
    // Sort each metric's observations newest first
    for (const [, arr] of map) {
      arr.sort(
        (a, b) =>
          new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
      );
    }
    return map;
  }, [obsItems]);

  // Panel data for rendering
  const panelData = useMemo(() => {
    return PANELS.map((panel) => {
      const metrics = panel.metrics
        .map((code) => {
          const metricObs = byMetric.get(code);
          if (!metricObs || metricObs.length === 0) return null;

          const latest = metricObs[0]!;
          const previous = metricObs[1];
          const value = latest.valueNumeric;
          if (value == null) return null;

          const sparkData = metricObs
            .slice(0, 8)
            .reverse()
            .map((o) => o.valueNumeric ?? 0);
          const status = getStatus(latest);
          const ranges = getRanges(code);
          const hasOptimal =
            ranges?.optimalLow != null || ranges?.optimalHigh != null;
          const rangeLabel = hasOptimal ? "optimal" : "ref";
          const optimalRange = `${rangeLabel} ${formatRange(
            ranges?.optimalLow ?? ranges?.referenceLow,
            ranges?.optimalHigh ?? ranges?.referenceHigh,
            latest.unit,
          )}`;

          let trendDelta: number | null = null;
          if (previous?.valueNumeric && previous.valueNumeric !== 0) {
            trendDelta =
              ((value - previous.valueNumeric) /
                Math.abs(previous.valueNumeric)) *
              100;
          }

          const trendImproving =
            trendDelta != null
              ? isTrendImproving(trendDelta, ranges, value)
              : null;

          return {
            metricCode: code,
            name: metricNameMap.get(code) ?? code.replace(/_/g, " "),
            value,
            unit: latest.unit ?? "",
            sparkData,
            trendDelta,
            trendImproving,
            optimalRange,
            status,
          };
        })
        .filter(Boolean) as Array<{
        metricCode: string;
        name: string;
        value: number;
        unit: string;
        sparkData: number[];
        trendDelta: number | null;
        trendImproving: boolean | null;
        optimalRange: string;
        status: "normal" | "warning" | "critical" | "info" | "neutral";
      }>;

      return { ...panel, metrics };
    }).filter((p) => p.metrics.length > 0);
  }, [byMetric, metricNameMap, getStatus, getRanges]);

  // What Changed: compare latest 2 distinct blood work dates
  const whatChanged = useMemo(() => {
    const allDates = new Set<string>();
    for (const obs of obsItems) {
      allDates.add(new Date(obs.observedAt).toISOString().slice(0, 10));
    }
    const sortedDates = [...allDates].sort().reverse();
    if (sortedDates.length < 2)
      return { changes: [], previousDate: "", currentDate: "" };

    const currentDate = sortedDates[0]!;
    const previousDate = sortedDates[1]!;

    const changes: ChangeItem[] = [];

    for (const [code, metricObs] of byMetric) {
      const currentObs = metricObs.find(
        (o) =>
          new Date(o.observedAt).toISOString().slice(0, 10) === currentDate,
      );
      const previousObs = metricObs.find(
        (o) =>
          new Date(o.observedAt).toISOString().slice(0, 10) === previousDate,
      );

      if (!currentObs?.valueNumeric || !previousObs?.valueNumeric) continue;
      if (previousObs.valueNumeric === 0) continue;

      const pct =
        ((currentObs.valueNumeric - previousObs.valueNumeric) /
          Math.abs(previousObs.valueNumeric)) *
        100;
      if (Math.abs(pct) < 5) continue;

      // Determine if change is "improved" using range-aware direction
      const ranges = getRanges(code);
      const trendResult = isTrendImproving(
        pct,
        ranges,
        currentObs.valueNumeric,
      );
      const improved = trendResult ?? getStatus(currentObs) === "normal";

      changes.push({
        metricCode: code,
        name: metricNameMap.get(code) ?? code.replace(/_/g, " "),
        oldValue: previousObs.valueNumeric,
        newValue: currentObs.valueNumeric,
        unit: currentObs.unit ?? "",
        percentChange: pct,
        improved,
      });
    }

    // Sort by absolute change
    changes.sort(
      (a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange),
    );

    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    return {
      changes,
      previousDate: fmt(previousDate),
      currentDate: fmt(currentDate),
    };
  }, [obsItems, byMetric, metricNameMap, getStatus]);

  // Derive display values
  const fullName = session?.user?.name ?? "";
  const firstName = fullName.split(/\s+/)[0] ?? "";
  const metricCount = byMetric.size;
  const summaryParts = [];
  if (hasData) summaryParts.push(`${metricCount} metrics tracked`);
  const summaryLine =
    summaryParts.length > 0
      ? summaryParts.join(" · ")
      : "Upload your first lab report to get started";
  const abnormalCount = obsItems.filter((o) => isObsAbnormal(o)).length;

  // Onboarding checklist items
  const checklistItems: ChecklistItem[] = [
    {
      label: "Upload a lab report",
      description:
        "Import your lab results from any provider to start tracking your biomarkers over time.",
      href: "/uploads",
      completed: jobItems.length > 0,
      icon: Upload,
    },
    {
      label: "Add a medication",
      description:
        "Track your medications and supplements so AI insights can factor in what you're taking.",
      href: "/medications",
      completed: medItems.length > 0,
      icon: Pill,
    },
    {
      label: "Track a condition",
      description:
        "Record your health conditions and diagnoses to build a complete health picture.",
      href: "/conditions",
      completed: condItems.length > 0,
      icon: HeartPulse,
    },
    {
      label: "Review your biomarkers",
      description:
        "Explore your lab results organized by category with reference ranges and trend lines.",
      href: "/biomarkers",
      completed: obsItems.length > 0,
      icon: ListChecks,
    },
    {
      label: "Generate a health report",
      description:
        "Create a comprehensive health report to share with your doctor at your next visit.",
      href: "/reports",
      completed: false,
      icon: FileText,
    },
    {
      label: "Ask AI a question",
      description:
        "Chat with your health data — ask about trends, get explanations, or request a summary.",
      href: "/ai",
      completed: false,
      icon: MessageSquare,
    },
  ];

  if (isLoading) {
    return (
      <div>
        <div className="card h-20 animate-pulse bg-neutral-50" />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse bg-neutral-50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stagger-children">
      <GreetingHeader
        firstName={firstName}
        summaryLine={summaryLine}
        abnormalCount={abnormalCount}
      />

      {/* Quick actions */}
      <div className="mt-5 flex gap-3">
        <Link
          href="/uploads"
          className="card inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium font-display hover:border-accent-200 transition-all"
        >
          <Upload className="size-4 text-neutral-500" />
          Upload Blood Work
        </Link>
        <Link
          href="/ai"
          className="card inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium font-display hover:border-accent-200 transition-all"
        >
          <Sparkles className="size-4 text-neutral-500" />
          Ask AI Coach
        </Link>
      </div>

      {/* Onboarding checklist (shown until dismissed or complete) */}
      {!hasData && (
        <div className="mt-6">
          <OnboardingChecklist items={checklistItems} />
        </div>
      )}

      {hasData && (
        <>
          {/* Panel sections */}
          {panelData.map((panel) => (
            <div key={panel.id} className="mt-6">
              <h2 className="text-[15px] font-medium font-display tracking-[-0.02em] text-neutral-900 mb-3">
                {panel.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {panel.metrics.map((m) => (
                  <BiomarkerPanelCard key={m.metricCode} {...m} />
                ))}
              </div>
            </div>
          ))}

          {/* What Changed */}
          {whatChanged.changes.length > 0 && (
            <div className="mt-8">
              <WhatChanged
                changes={whatChanged.changes}
                previousDate={whatChanged.previousDate}
                currentDate={whatChanged.currentDate}
              />
            </div>
          )}

          {/* AI Coach Suggestions placeholder */}
          <div className="mt-8">
            <div className="card p-5 border-dashed">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="size-4 text-neutral-400" />
                <h2 className="text-[15px] font-medium font-display tracking-[-0.02em] text-neutral-500">
                  AI Coach Suggestions
                </h2>
              </div>
              <p className="text-[13px] text-neutral-400 font-display">
                Upload your latest blood work and the AI coach will analyze
                trends and suggest next steps.
              </p>
              <Link
                href="/ai"
                className="mt-3 inline-flex text-[12px] font-medium text-accent-600 font-display hover:text-accent-700"
              >
                Ask AI Coach &rarr;
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
