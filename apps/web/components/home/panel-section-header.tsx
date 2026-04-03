import { cn } from "@/lib/utils";

interface PanelSectionHeaderProps {
  label: string;
  inRangeCount: number;
  totalTested: number;
  totalMetrics: number;
}

export function PanelSectionHeader({
  label,
  inRangeCount,
  totalTested,
  totalMetrics,
}: PanelSectionHeaderProps) {
  const untestedCount = totalMetrics - totalTested;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[15px] font-medium font-display tracking-[-0.02em] text-neutral-900">
        {label}
      </h2>
      <div className="flex items-center gap-2">
        {totalTested > 0 && (
          <span
            className={cn(
              "text-[11px] font-mono",
              inRangeCount === totalTested
                ? "text-[var(--color-health-normal)]"
                : "text-neutral-500",
            )}
          >
            {inRangeCount}/{totalTested} in range
          </span>
        )}
        {untestedCount > 0 && (
          <span className="text-[11px] font-mono text-neutral-400">
            {totalTested === 0
              ? `0/${totalMetrics} tested`
              : `${untestedCount} untested`}
          </span>
        )}
      </div>
    </div>
  );
}
