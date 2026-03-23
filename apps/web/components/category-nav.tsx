"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CornerCrosses } from "@/components/decorations/corner-cross";

export interface CategoryNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  count: number;
}

interface CategoryNavProps {
  categories: CategoryNavItem[];
  activeCategory: string;
  onCategoryClick: (category: string) => void;
  variant: "sidebar" | "pills";
  className?: string;
}

export function CategoryNav({
  categories,
  activeCategory,
  onCategoryClick,
  variant,
  className,
}: CategoryNavProps) {
  if (variant === "pills") {
    return (
      <nav
        className={cn(
          "sticky top-16 z-40 -mx-6 px-6 py-3 border-b border-neutral-200 bg-neutral-50 overflow-x-auto scrollbar-hide",
          className,
        )}
      >
        <div className="flex items-center gap-1 min-w-max">
          {categories.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryClick(cat.id)}
                className={cn(
                  "shrink-0 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] transition-all cursor-pointer whitespace-nowrap",
                  isActive
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100",
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // Sidebar variant
  return (
    <nav
      className={cn(
        "sticky top-20 self-start border border-neutral-200 bg-white",
        className,
      )}
    >
      {categories.map((cat) => {
        const isActive = activeCategory === cat.id;
        const Icon = cat.icon;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onCategoryClick(cat.id)}
            className={cn(
              "relative group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer border-b border-neutral-100 last:border-b-0",
              isActive ? "bg-neutral-50" : "hover:bg-neutral-50/50",
            )}
          >
            {isActive && <CornerCrosses />}
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center transition-colors",
                isActive
                  ? "bg-accent-500 text-white"
                  : "bg-neutral-100 text-neutral-400 group-hover:bg-neutral-200 group-hover:text-neutral-500",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span
              className={cn(
                "font-mono text-[11px] font-bold uppercase tracking-[0.04em] transition-colors",
                isActive
                  ? "text-neutral-900"
                  : "text-neutral-400 group-hover:text-neutral-600",
              )}
            >
              {cat.label}
            </span>
            <span
              className={cn(
                "ml-auto font-mono text-[10px] tabular-nums transition-colors",
                isActive ? "text-neutral-500" : "text-neutral-300",
              )}
            >
              {cat.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
