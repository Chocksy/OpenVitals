"use client";

import { cn } from "@/lib/utils";
import { CornerEdge } from "@/components/decorations/corner-cross";
import { DashBadge } from "@/components/decorations/dot-badge";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  ArrowRight,
} from "lucide-react";

export interface WeeklyWorkstreamUpdate {
  workstream: string;
  movement: "forward" | "stuck" | "neutral";
  summary: string;
}

export interface WeeklyReviewData {
  weekOf: string;
  workstreamUpdates: WeeklyWorkstreamUpdate[];
  highestLeverage: string;
  highestLeverageWorkstream: string;
  keyDecisions: string[];
}

const MOVEMENT_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  forward: { icon: TrendingUp, color: "text-green-600", label: "Moved" },
  stuck: { icon: TrendingDown, color: "text-red-500", label: "Stuck" },
  neutral: { icon: Minus, color: "text-neutral-400", label: "Holding" },
};

interface WeeklyReviewProps {
  review: WeeklyReviewData | null;
}

export function WeeklyReview({ review }: WeeklyReviewProps) {
  if (!review) {
    return (
      <div>
        <DashBadge>Weekly Review</DashBadge>
        <div className="mt-3 relative bg-white px-4 py-6">
          <CornerEdge />
          <div className="text-center">
            <p className="text-[13px] text-neutral-500 font-mono">
              No review this week
            </p>
            <p className="mt-1 text-[11px] text-neutral-400">
              Reviews generate automatically on Fridays
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <DashBadge>Weekly Review</DashBadge>
        <span className="font-mono text-[11px] text-neutral-400">
          Week of {review.weekOf}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-px bg-neutral-150">
        {/* Highest leverage callout */}
        <div className="relative bg-accent-50 px-4 py-3.5">
          <CornerEdge />
          <div className="flex items-start gap-2.5">
            <Target className="size-4 text-accent-500 mt-0.5 shrink-0" />
            <div>
              <span className="font-mono text-[10px] uppercase text-accent-500 tracking-wider">
                Highest Leverage This Week
              </span>
              <p className="mt-1 text-[13px] text-neutral-900 font-medium leading-snug">
                {review.highestLeverage}
              </p>
              <span className="mt-1 font-mono text-[10px] text-accent-600 uppercase">
                {review.highestLeverageWorkstream}
              </span>
            </div>
          </div>
        </div>

        {/* Workstream movements */}
        {review.workstreamUpdates.map((update) => {
          const config = MOVEMENT_CONFIG[update.movement];
          const Icon = config.icon;

          return (
            <div
              key={update.workstream}
              className="relative bg-white px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <Icon className={cn("size-3.5 shrink-0", config.color)} />
                <span className="font-mono text-[12px] font-medium text-neutral-900 w-24 shrink-0">
                  {update.workstream}
                </span>
                <span
                  className={cn(
                    "font-mono text-[9px] font-bold uppercase",
                    config.color,
                  )}
                >
                  {config.label}
                </span>
                <span className="text-[11px] text-neutral-500 truncate">
                  {update.summary}
                </span>
              </div>
            </div>
          );
        })}

        {/* Key decisions */}
        {review.keyDecisions.length > 0 && (
          <div className="relative bg-white px-4 py-3">
            <span className="font-mono text-[10px] uppercase text-neutral-400 tracking-wider">
              Key Decisions
            </span>
            <ul className="mt-1.5 flex flex-col gap-1">
              {review.keyDecisions.map((decision, i) => (
                <li key={i} className="flex items-start gap-2">
                  <ArrowRight className="size-3 text-neutral-300 mt-0.5 shrink-0" />
                  <span className="text-[12px] text-neutral-600 leading-snug">
                    {decision}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
