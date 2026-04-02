"use client";

import { useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { useDynamicStatus } from "@/hooks/use-dynamic-status";
import { TitleActionHeader } from "@/components/title-action-header";
import { StatusBadge } from "@/components/health/status-badge";
import { ProvenancePill } from "@/components/health/provenance-pill";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import { formatDate } from "@/lib/utils";
import {
  Clock,
  TestTubes,
  Pill,
  Upload,
  HeartPulse,
  CheckCircle2,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StyledIcon } from "@/components/styled-icon";

interface TimelineEvent {
  id: string;
  date: Date;
  type:
    | "lab_results"
    | "medication_start"
    | "medication_end"
    | "condition_onset"
    | "condition_resolved"
    | "encounter";
  title: string;
  description: string;
  badge: {
    status: "normal" | "warning" | "critical" | "info" | "neutral";
    label: string;
  };
  source: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}

const emptyIcons = [Clock, TestTubes, Pill, Upload, HeartPulse, Stethoscope];

function getMonthKey(date: Date): string {
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

export default function TimelinePage() {
  const { isAbnormal: isObsAbnormal } = useDynamicStatus();
  const observations = trpc.observations.list.useQuery({ limit: 200 });
  const importJobs = trpc.importJobs.list.useQuery({ limit: 20 });
  const medications = trpc.medications.list.useQuery({});
  const conditions = trpc.conditions.list.useQuery();
  const encounters = trpc.encounters.list.useQuery();

  const isLoading =
    observations.isLoading ||
    importJobs.isLoading ||
    medications.isLoading ||
    conditions.isLoading ||
    encounters.isLoading;

  const events = useMemo<TimelineEvent[]>(() => {
    const result: TimelineEvent[] = [];

    // Group observations by importJobId and date
    const obsByJob = new Map<
      string,
      NonNullable<typeof observations.data>["items"]
    >();
    for (const obs of observations.data?.items ?? []) {
      const key = obs.importJobId ?? obs.id;
      const existing = obsByJob.get(key) ?? [];
      existing.push(obs);
      obsByJob.set(key, existing);
    }

    for (const [key, group] of obsByJob) {
      const first = group[0]!;
      const abnormalCount = group.filter((o) => isObsAbnormal(o)).length;
      const metricNames = group
        .map((o) => o.metricCode.replace(/_/g, " "))
        .slice(0, 3);

      result.push({
        id: `obs-${key}`,
        date: new Date(first.observedAt),
        type: "lab_results",
        title: `Lab Results — ${group.length} observation${group.length > 1 ? "s" : ""}`,
        description: `${metricNames.join(", ")}${group.length > 3 ? ` and ${group.length - 3} more` : ""}`,
        badge:
          abnormalCount > 0
            ? { status: "warning", label: `${abnormalCount} flagged` }
            : { status: "normal", label: "All normal" },
        source: first.importJobId ? "Imported" : "Manual",
        icon: TestTubes,
        iconColor: "text-accent-600",
        iconBg: "bg-accent-50",
      });
    }

    // Add medication events
    for (const med of medications.data?.items ?? []) {
      // Start event
      if (med.startDate) {
        result.push({
          id: `med-start-${med.id}`,
          date: new Date(med.startDate),
          type: "medication_start",
          title: `Started ${med.name}`,
          description: [med.dosage, med.frequency, med.indication]
            .filter(Boolean)
            .join(" · "),
          badge: { status: "info", label: "Started" },
          source: "Manual",
          icon: Pill,
          iconColor: "text-health-info",
          iconBg: "bg-blue-50",
        });
      }

      // End event (if discontinued)
      if (!med.isActive && med.endDate) {
        result.push({
          id: `med-end-${med.id}`,
          date: new Date(med.endDate),
          type: "medication_end",
          title: `Discontinued ${med.name}`,
          description: med.notes ?? "",
          badge: { status: "neutral", label: "Ended" },
          source: "Manual",
          icon: Pill,
          iconColor: "text-neutral-400",
          iconBg: "bg-neutral-50",
        });
      }
    }

    // Add condition events
    for (const cond of conditions.data ?? []) {
      // Onset event
      if (cond.onsetDate) {
        result.push({
          id: `cond-onset-${cond.id}`,
          date: new Date(cond.onsetDate),
          type: "condition_onset",
          title: `Diagnosed: ${cond.name}`,
          description: [
            cond.severity && `Severity: ${cond.severity}`,
            cond.diagnosedBy && `By: ${cond.diagnosedBy}`,
          ]
            .filter(Boolean)
            .join(" · "),
          badge: {
            status:
              cond.severity === "severe"
                ? "critical"
                : cond.severity === "moderate"
                  ? "warning"
                  : "info",
            label: cond.severity ?? "Diagnosed",
          },
          source: cond.importJobId ? "Imported" : "Manual",
          icon: HeartPulse,
          iconColor: "text-health-warning",
          iconBg: "bg-amber-50",
        });
      }

      // Resolution event
      if (cond.status === "resolved" && cond.resolutionDate) {
        result.push({
          id: `cond-resolved-${cond.id}`,
          date: new Date(cond.resolutionDate),
          type: "condition_resolved",
          title: `Resolved: ${cond.name}`,
          description: cond.notes ?? "Condition marked as resolved.",
          badge: { status: "normal", label: "Resolved" },
          source: "Manual",
          icon: CheckCircle2,
          iconColor: "text-health-normal",
          iconBg: "bg-green-50",
        });
      }
    }

    // Add encounter events
    for (const enc of encounters.data ?? []) {
      const typeLabels: Record<string, string> = {
        checkup: "Checkup",
        specialist: "Specialist Visit",
        urgent_care: "Urgent Care",
        emergency: "Emergency Visit",
        telehealth: "Telehealth",
        lab_visit: "Lab Visit",
        imaging: "Imaging",
        dental: "Dental Visit",
        therapy: "Therapy",
        other: "Visit",
      };

      result.push({
        id: `enc-${enc.id}`,
        date: new Date(enc.encounterDate),
        type: "encounter",
        title: typeLabels[enc.type] ?? enc.type,
        description: [
          enc.chiefComplaint,
          enc.provider && `Provider: ${enc.provider}`,
          enc.facility && `at ${enc.facility}`,
        ]
          .filter(Boolean)
          .join(" · "),
        badge: { status: "info", label: enc.type.replace(/_/g, " ") },
        source: enc.importJobId ? "Imported" : "Manual",
        icon: Stethoscope,
        iconColor: "text-accent-600",
        iconBg: "bg-accent-50",
      });
    }

    // Sort by date descending
    result.sort((a, b) => b.date.getTime() - a.date.getTime());
    return result;
  }, [observations.data, medications.data, conditions.data, encounters.data]);

  // Group events by month
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      const key = getMonthKey(event.date);
      const existing = groups.get(key) ?? [];
      existing.push(event);
      groups.set(key, existing);
    }
    return Array.from(groups.entries());
  }, [events]);

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

  if (events.length === 0) {
    return (
      <div>
        <TitleActionHeader
          title="Timeline"
          subtitle="Your chronological health record feed."
        />
        <div className="mt-7">
          <AnimatedEmptyState
            title="No health records yet"
            description="Upload a lab report, add a medication, or track a condition to start building your timeline."
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
      <TitleActionHeader
        title="Timeline"
        subtitle={`${events.length} events across your health journey`}
      />

      <div className="mt-7">
        {groupedEvents.map(([monthKey, monthEvents]) => (
          <div key={monthKey} className="mb-6">
            {/* Month header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-mono font-bold uppercase tracking-[0.06em] text-neutral-400">
                {monthKey}
              </span>
              <div className="flex-1 h-px bg-neutral-200" />
              <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                {monthEvents.length}
              </span>
            </div>

            {/* Events with timeline connector */}
            <div className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-[15px] top-4 bottom-4 w-px bg-neutral-200" />

              <div className="space-y-0">
                {monthEvents.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className="relative flex gap-4 pb-4 last:pb-0"
                    >
                      {/* Timeline dot */}

                      <StyledIcon
                        icon={item.icon}
                        className={cn(
                          "relative z-10 flex items-center justify-center shrink-0",
                          item.iconBg,
                        )}
                      />

                      {/* Event content */}
                      <div className="card flex-1 p-4 hover:border-accent-300 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-semibold text-neutral-900 font-body">
                              {item.title}
                            </p>
                            {item.description && (
                              <p className="mt-1 text-[12px] text-neutral-500 font-body truncate">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <StatusBadge
                            status={item.badge.status}
                            label={item.badge.label}
                          />
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {formatDate(item.date)}
                          </span>
                          <ProvenancePill label={item.source} icon="◎" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
