import {
  CategoryNav as SharedCategoryNav,
  type CategoryNavItem,
} from "@/components/category-nav";
import { CATEGORY_CONFIG, CATEGORY_ORDER, BIOMARKERS } from "../data";

interface CategoryNavProps {
  activeCategory: string;
  onCategoryClick: (category: string) => void;
  visibleCategories?: string[];
  variant: "sidebar" | "pills";
}

function buildCategories(visibleCategories?: string[]): CategoryNavItem[] {
  const order = visibleCategories
    ? CATEGORY_ORDER.filter((c) => visibleCategories.includes(c))
    : CATEGORY_ORDER;

  return order
    .map((cat): CategoryNavItem | null => {
      const config = CATEGORY_CONFIG[cat];
      if (!config) return null;
      return {
        id: cat as string,
        label: config.label,
        icon: config.icon,
        count: BIOMARKERS.filter((b) => b.category === cat).length,
      };
    })
    .filter((c): c is CategoryNavItem => c !== null);
}

export function CategoryNav({
  activeCategory,
  onCategoryClick,
  visibleCategories,
  variant,
}: CategoryNavProps) {
  const categories = buildCategories(visibleCategories);

  return (
    <SharedCategoryNav
      categories={categories}
      activeCategory={activeCategory}
      onCategoryClick={onCategoryClick}
      variant={variant}
    />
  );
}
