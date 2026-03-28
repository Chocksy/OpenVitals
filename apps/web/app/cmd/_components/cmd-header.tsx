"use client";

import { CornerEdge } from "@/components/decorations/corner-cross";
import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";
import { StyledIcon } from "@/components/styled-icon";

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface CmdHeaderProps {
  activeCount: number;
  pendingActions: number;
  runningProcesses: number;
}

export function CmdHeader({
  activeCount,
  pendingActions,
  runningProcesses,
}: CmdHeaderProps) {
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StyledIcon
              icon={Terminal}
              className="bg-accent-50 size-6"
              iconClassName="size-3.5"
            />
            <h1 className="font-mono text-lg uppercase font-medium tracking-[-0.03em] text-neutral-900">
              Command Center
            </h1>
          </div>
          <p className="mt-1.5 text-[13px] text-neutral-500 font-mono">
            {formatDate()}
          </p>
        </div>
      </div>

      {/* Status strip */}
      <div className="mt-4 flex items-center gap-1">
        <StatusChip label="Workstreams" value={activeCount} />
        <StatusChip
          label="Pending Actions"
          value={pendingActions}
          highlight={pendingActions > 0}
        />
        <StatusChip
          label="Running"
          value={runningProcesses}
          active={runningProcesses > 0}
        />
      </div>
    </div>
  );
}

function StatusChip({
  label,
  value,
  highlight,
  active,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-2.5 bg-white px-3 py-2",
        highlight && "bg-amber-50",
        active && "bg-accent-50",
      )}
    >
      <CornerEdge location="tl" />
      <CornerEdge location="br" />
      <span
        className={cn(
          "font-mono text-[18px] font-semibold tracking-[-0.02em] text-neutral-900",
          highlight && "text-amber-700",
          active && "text-accent-600",
        )}
      >
        {value}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-wide text-neutral-500">
        {label}
      </span>
    </div>
  );
}
