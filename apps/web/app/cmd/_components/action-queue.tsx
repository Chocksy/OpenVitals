"use client";

import { cn } from "@/lib/utils";
import { CornerEdge } from "@/components/decorations/corner-cross";
import { DashBadge } from "@/components/decorations/dot-badge";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  GitPullRequest,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
} from "lucide-react";

export type ActionType = "approval" | "question" | "review" | "alert";

export interface ActionItem {
  id: string;
  type: ActionType;
  workstream: string;
  title: string;
  description: string;
  agent: string;
  priority: "high" | "medium" | "low";
  createdAt: string;
}

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  approval: GitPullRequest,
  question: MessageSquare,
  review: CheckCircle2,
  alert: AlertTriangle,
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-neutral-50 text-neutral-600 border-neutral-200",
};

interface ActionQueueProps {
  actions: ActionItem[];
}

export function ActionQueue({ actions }: ActionQueueProps) {
  if (actions.length === 0) {
    return (
      <div>
        <DashBadge>Action Queue</DashBadge>
        <div className="mt-3 bg-white px-4 py-6 text-center">
          <p className="text-[13px] text-neutral-400 font-mono">
            No pending actions
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <DashBadge tag={3}>Action Queue</DashBadge>
        <span className="font-mono text-[11px] text-neutral-400">
          {actions.length} pending
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-px bg-neutral-150">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action.type];
          return (
            <li key={action.id}>
              <button className="relative w-full text-left bg-white px-4 py-3 hover:bg-accent-50 transition-colors group">
                <CornerEdge location="tl" />
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <Icon className="size-4 text-neutral-400 group-hover:text-accent-500 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-medium text-neutral-900 truncate">
                        {action.title}
                      </span>
                      <Badge
                        className={cn(
                          "shrink-0 text-[9px] px-1.5 py-0",
                          PRIORITY_STYLES[action.priority],
                        )}
                      >
                        {action.priority}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-neutral-500 line-clamp-1">
                      {action.description}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="font-mono text-[10px] uppercase text-accent-500">
                        {action.workstream}
                      </span>
                      <span className="font-mono text-[10px] text-neutral-400">
                        via {action.agent}
                      </span>
                      <span className="font-mono text-[10px] text-neutral-300 flex items-center gap-1">
                        <Clock className="size-2.5" />
                        {action.createdAt}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-neutral-300 group-hover:text-accent-500 transition-colors mt-1 shrink-0" />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
