"use client";

import { cn } from "@/lib/utils";
import { DashBadge } from "@/components/decorations/dot-badge";
import {
  MessageSquare,
  GitCommit,
  CheckCircle2,
  AlertTriangle,
  Zap,
  FileText,
  ArrowRight,
} from "lucide-react";

export type ActivityType =
  | "chat"
  | "commit"
  | "complete"
  | "alert"
  | "dispatch"
  | "report";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  title: string;
  workstream: string;
  timestamp: string;
  agent?: string;
}

const ACTIVITY_ICONS: Record<ActivityType, React.ElementType> = {
  chat: MessageSquare,
  commit: GitCommit,
  complete: CheckCircle2,
  alert: AlertTriangle,
  dispatch: Zap,
  report: FileText,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  chat: "text-accent-500",
  commit: "text-neutral-500",
  complete: "text-green-500",
  alert: "text-amber-500",
  dispatch: "text-violet-500",
  report: "text-neutral-400",
};

interface ActivityFeedProps {
  events: ActivityEvent[];
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  return (
    <div>
      <DashBadge>Recent Activity</DashBadge>
      <div className="mt-3 bg-white">
        {events.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[13px] text-neutral-400 font-mono">
              No recent activity
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {events.map((event, i) => {
              const Icon = ACTIVITY_ICONS[event.type];
              return (
                <div
                  key={event.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5",
                    i !== events.length - 1 && "border-b border-neutral-50",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      ACTIVITY_COLORS[event.type],
                    )}
                  />
                  <span className="text-[12px] text-neutral-700 truncate flex-1">
                    {event.title}
                  </span>
                  <span className="font-mono text-[10px] text-accent-500 uppercase shrink-0">
                    {event.workstream}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-300 shrink-0">
                    {event.timestamp}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
