"use client";

import { cn } from "@/lib/utils";
import { CornerEdge } from "@/components/decorations/corner-cross";
import { DashBadge, CubeBadge } from "@/components/decorations/dot-badge";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ExternalLink, MessageSquare } from "lucide-react";

export type WorkstreamStatus =
  | "active"
  | "building"
  | "early"
  | "running"
  | "paused"
  | "blocked";

export interface Workstream {
  id: string;
  name: string;
  status: WorkstreamStatus;
  summary: string;
  currentBlocker: string;
  lastAction: string;
  nextStep: string;
  updated: string;
}

const STATUS_CONFIG: Record<
  WorkstreamStatus,
  { label: string; dotColor: string; bgColor: string; textColor: string }
> = {
  active: {
    label: "ACTIVE",
    dotColor: "bg-green-500",
    bgColor: "bg-green-50",
    textColor: "text-green-700",
  },
  building: {
    label: "BUILDING",
    dotColor: "bg-accent-500",
    bgColor: "bg-accent-50",
    textColor: "text-accent-700",
  },
  early: {
    label: "EARLY",
    dotColor: "bg-violet-500",
    bgColor: "bg-violet-50",
    textColor: "text-violet-700",
  },
  running: {
    label: "RUNNING",
    dotColor: "bg-green-500",
    bgColor: "bg-green-50",
    textColor: "text-green-700",
  },
  paused: {
    label: "PAUSED",
    dotColor: "bg-neutral-400",
    bgColor: "bg-neutral-50",
    textColor: "text-neutral-600",
  },
  blocked: {
    label: "BLOCKED",
    dotColor: "bg-red-500",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
  },
};

interface WorkstreamPanelProps {
  workstreams: Workstream[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function WorkstreamPanel({
  workstreams,
  selectedId,
  onSelect,
}: WorkstreamPanelProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <DashBadge>Workstreams</DashBadge>
        <span className="font-mono text-[11px] text-neutral-400">
          {workstreams.filter((w) => w.status !== "paused").length} active
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-px bg-neutral-150">
        {workstreams.map((ws) => {
          const config = STATUS_CONFIG[ws.status];
          const isSelected = ws.id === selectedId;

          return (
            <button
              key={ws.id}
              onClick={() => onSelect?.(ws.id)}
              className={cn(
                "relative w-full text-left bg-white px-4 py-3.5 hover:bg-accent-50/50 transition-colors group",
                isSelected && "bg-accent-50",
              )}
            >
              <CornerEdge location="tl" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h4 className="font-mono text-[14px] font-medium text-neutral-900">
                      {ws.name}
                    </h4>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 px-1.5 py-0.5",
                        config.bgColor,
                      )}
                    >
                      <div
                        className={cn(
                          "size-[5px] rounded-full",
                          config.dotColor,
                        )}
                      />
                      <span
                        className={cn(
                          "font-mono text-[9px] font-bold uppercase tracking-wider",
                          config.textColor,
                        )}
                      >
                        {config.label}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-[12px] text-neutral-500 leading-relaxed line-clamp-2">
                    {ws.summary}
                  </p>

                  {/* Key info row */}
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-[10px] uppercase text-neutral-400 w-16 shrink-0 pt-px">
                        Next
                      </span>
                      <span className="text-[11px] text-neutral-700 leading-snug line-clamp-1">
                        {ws.nextStep}
                      </span>
                    </div>
                    {ws.currentBlocker !== "None" &&
                      ws.currentBlocker !==
                        `None — stable, generating revenue` && (
                        <div className="flex items-start gap-2">
                          <span className="font-mono text-[10px] uppercase text-amber-500 w-16 shrink-0 pt-px">
                            Blocker
                          </span>
                          <span className="text-[11px] text-amber-700 leading-snug line-clamp-1">
                            {ws.currentBlocker}
                          </span>
                        </div>
                      )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <ChevronRight className="size-4 text-neutral-300 group-hover:text-accent-500 transition-colors" />
                  <span className="font-mono text-[10px] text-neutral-300">
                    {ws.updated}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
