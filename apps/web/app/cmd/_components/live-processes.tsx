"use client";

import { cn } from "@/lib/utils";
import { CornerEdge } from "@/components/decorations/corner-cross";
import { DashBadge } from "@/components/decorations/dot-badge";
import { Loader2, CheckCircle2, XCircle, Pause, Clock } from "lucide-react";

export type ProcessStatus =
  | "running"
  | "completed"
  | "failed"
  | "queued"
  | "paused";

export interface AgentProcess {
  id: string;
  name: string;
  agent: string;
  workstream: string;
  status: ProcessStatus;
  progress?: number;
  startedAt: string;
  duration?: string;
  lastOutput?: string;
}

const STATUS_ICON: Record<ProcessStatus, React.ElementType> = {
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  queued: Clock,
  paused: Pause,
};

const STATUS_STYLES: Record<
  ProcessStatus,
  { icon: string; bg: string; text: string }
> = {
  running: {
    icon: "text-accent-500 animate-spin",
    bg: "bg-accent-50",
    text: "text-accent-700",
  },
  completed: {
    icon: "text-green-500",
    bg: "bg-green-50",
    text: "text-green-700",
  },
  failed: { icon: "text-red-500", bg: "bg-red-50", text: "text-red-700" },
  queued: {
    icon: "text-neutral-400",
    bg: "bg-neutral-50",
    text: "text-neutral-600",
  },
  paused: { icon: "text-amber-500", bg: "bg-amber-50", text: "text-amber-700" },
};

interface LiveProcessesProps {
  processes: AgentProcess[];
}

export function LiveProcesses({ processes }: LiveProcessesProps) {
  const running = processes.filter((p) => p.status === "running");
  const others = processes.filter((p) => p.status !== "running");

  return (
    <div>
      <div className="flex items-center justify-between">
        <DashBadge>Live Processes</DashBadge>
        {running.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="size-[6px] rounded-full bg-green-500 animate-pulse" />
            <span className="font-mono text-[11px] text-green-600">
              {running.length} running
            </span>
          </div>
        )}
      </div>

      {processes.length === 0 ? (
        <div className="mt-3 bg-white px-4 py-6 text-center">
          <p className="text-[13px] text-neutral-400 font-mono">
            No active processes
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-px bg-neutral-150">
          {[...running, ...others].map((proc) => {
            const Icon = STATUS_ICON[proc.status];
            const styles = STATUS_STYLES[proc.status];

            return (
              <div key={proc.id} className="relative bg-white px-4 py-3">
                <CornerEdge location="tl" />
                <div className="flex items-center gap-3">
                  <Icon className={cn("size-4 shrink-0", styles.icon)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-medium text-neutral-900 truncate">
                        {proc.name}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[9px] font-bold uppercase px-1.5 py-0.5",
                          styles.bg,
                          styles.text,
                        )}
                      >
                        {proc.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="font-mono text-[10px] uppercase text-accent-500">
                        {proc.workstream}
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {proc.agent}
                      </span>
                      {proc.duration && (
                        <span className="font-mono text-[10px] text-neutral-300">
                          {proc.duration}
                        </span>
                      )}
                    </div>
                    {proc.lastOutput && (
                      <p className="mt-1.5 text-[11px] text-neutral-400 font-mono truncate">
                        &gt; {proc.lastOutput}
                      </p>
                    )}
                  </div>

                  {/* Progress bar for running processes */}
                  {proc.status === "running" && proc.progress != null && (
                    <div className="w-16 shrink-0">
                      <div className="h-1 bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full bg-accent-500 transition-all duration-500"
                          style={{ width: `${proc.progress}%` }}
                        />
                      </div>
                      <span className="font-mono text-[9px] text-neutral-400 mt-0.5 block text-right">
                        {proc.progress}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
