import { cn } from "@/lib/utils";
import { CATEGORY_CONFIG, CATEGORY_ORDER, BIOMARKERS } from "../data";

interface CategoryNavProps {
  activeCategory: string;
  onCategoryClick: (category: string) => void;
  visibleCategories?: string[];
  variant: "sidebar" | "pills";
}

function getCategoryCount(category: string) {
  return BIOMARKERS.filter((b) => b.category === category).length;
}

export function CategoryNav({
  activeCategory,
  onCategoryClick,
  visibleCategories,
  variant,
}: CategoryNavProps) {
  const categories = visibleCategories
    ? CATEGORY_ORDER.filter((c) => visibleCategories.includes(c))
    : CATEGORY_ORDER;

  if (variant === "pills") {
    return (
      <nav
        className="sticky top-12 z-40 -mx-6 px-6 py-3 border-b border-neutral-200/40 overflow-x-auto scrollbar-hide"
        style={{
          backgroundColor: "rgba(250,249,247,0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <div className="flex items-center gap-1.5 min-w-max">
          {categories.map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            if (!config) return null;
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryClick(cat)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-body transition-all cursor-pointer whitespace-nowrap",
                  isActive
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/80",
                )}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </nav>
    );
  }

  // Sidebar variant
  return (
    <nav className="sticky top-20 self-start">
      <div className="space-y-px">
        {categories.map((cat) => {
          const config = CATEGORY_CONFIG[cat];
          if (!config) return null;
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryClick(cat)}
              className={cn(
                "group flex w-full items-center gap-2 py-[7px] text-left transition-colors cursor-pointer border-l-[1.5px]",
                isActive
                  ? "border-neutral-900 pl-3"
                  : "border-transparent pl-3 hover:border-neutral-200",
              )}
            >
              <span
                className={cn(
                  "text-[13px] font-body transition-colors",
                  isActive
                    ? "font-medium text-neutral-900"
                    : "text-neutral-400 group-hover:text-neutral-600",
                )}
              >
                {config.label}
              </span>
              <span
                className={cn(
                  "ml-auto text-[11px] font-mono tabular-nums transition-colors",
                  isActive ? "text-neutral-400" : "text-neutral-300",
                )}
              >
                {getCategoryCount(cat)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
