"use client";

import { cn } from "@/lib/utils";
import { CornerEdge } from "@/components/decorations/corner-cross";
import { DashBadge } from "@/components/decorations/dot-badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  MessageSquare,
  Search,
  FileText,
  GitBranch,
  Zap,
  RotateCcw,
} from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  shortcut?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "new-chat",
    label: "New Agent Chat",
    description: "Start a conversation with context",
    icon: MessageSquare,
    shortcut: "N",
  },
  {
    id: "dispatch",
    label: "Dispatch Task",
    description: "Assign a task to an agent",
    icon: Zap,
    shortcut: "D",
  },
  {
    id: "research",
    label: "Research",
    description: "Deep research on a topic",
    icon: Search,
    shortcut: "R",
  },
  {
    id: "review",
    label: "Code Review",
    description: "Review changes across repos",
    icon: GitBranch,
  },
  {
    id: "report",
    label: "Generate Report",
    description: "Status report or summary",
    icon: FileText,
  },
  {
    id: "retry",
    label: "Retry Failed",
    description: "Re-run failed processes",
    icon: RotateCcw,
  },
];

export function QuickDispatch() {
  return (
    <div>
      <DashBadge>Quick Actions</DashBadge>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-px bg-neutral-150">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              className="relative bg-white px-3 py-3 text-left hover:bg-accent-50 transition-colors group"
            >
              <CornerEdge location="tl" />
              <div className="flex items-start justify-between">
                <Icon className="size-4 text-neutral-400 group-hover:text-accent-500 transition-colors" />
                {action.shortcut && (
                  <kbd className="font-mono text-[9px] text-neutral-300 bg-neutral-50 px-1 py-0.5 border border-neutral-100">
                    {action.shortcut}
                  </kbd>
                )}
              </div>
              <h4 className="mt-2 font-mono text-[12px] font-medium text-neutral-900">
                {action.label}
              </h4>
              <p className="mt-0.5 text-[11px] text-neutral-400 leading-snug">
                {action.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
