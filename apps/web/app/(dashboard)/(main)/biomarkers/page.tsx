"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { TitleActionHeader } from "@/components/title-action-header";
import { AnimatedEmptyState } from "@/components/animated-empty-state";
import { StatusBadge } from "@/components/health/status-badge";
import {
  CategoryNav,
  type CategoryNavItem,
} from "@/components/category-nav";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
} from "@/lib/biomarker-categories";
import {
  Search,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Dna,
  Activity,
  Beaker,
  FlaskConical,
  Microscope,
} from "lucide-react";

const emptyIcons = [
  ListChecks,
  Dna,
  Activity,
  Beaker,
  FlaskConical,
  Microscope,
];

function formatRange(
  low: number | null,
  high: number | null,
  unit: string | null,
): string {
  const u = unit ?? "";
  if (low != null && high != null) return `${low}–${high} ${u}`.trim();
  if (low != null) return `> ${low} ${u}`.trim();
  if (high != null) return `< ${high} ${u}`.trim();
  return "—";
}

export default function BiomarkersPage() {
  const { data: metrics, isLoading: metricsLoading } =
    trpc.metrics.list.useQuery();
  const { data: ranges, isLoading: rangesLoading } =
    trpc.metrics.referenceRanges.useQuery();
  const { data: prefs } = trpc.preferences.get.useQuery();

  const [search, setSearch] = useState("");
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(
    CATEGORY_ORDER[0],
  );
  const observerRef = useRef<IntersectionObserver | null>(null);

  const isLoading = metricsLoading || rangesLoading;

  const allMetrics = metrics ?? [];
  const allRanges = ranges ?? [];

  // Group ranges by metric code
  const rangesByMetric = useMemo(() => {
    const map = new Map<string, typeof allRanges>();
    for (const r of allRanges) {
      const existing = map.get(r.metricCode) ?? [];
      existing.push(r);
      map.set(r.metricCode, existing);
    }
    return map;
  }, [allRanges]);

  // Filter by search
  const lower = search.toLowerCase().trim();
  const filtered = lower
    ? allMetrics.filter(
        (m) =>
          m.name.toLowerCase().includes(lower) ||
          m.id.toLowerCase().includes(lower) ||
          m.category.toLowerCase().includes(lower) ||
          m.aliases.some((a: string) => a.toLowerCase().includes(lower)),
      )
    : allMetrics;

  // Group by category
  const byCategory = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const existing = map.get(m.category) ?? [];
      existing.push(m);
      map.set(m.category, existing);
    }
    return map;
  }, [filtered]);

  // Sorted category keys
  const sortedCategories = useMemo(
    () =>
      [...byCategory.keys()].sort(
        (a, b) =>
          (CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]) === -1
            ? 999
            : CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number])) -
          (CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]) === -1
            ? 999
            : CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number])),
      ),
    [byCategory],
  );

  // Build nav items
  const navCategories: CategoryNavItem[] = useMemo(
    () =>
      sortedCategories
        .map((cat) => {
          const meta = CATEGORY_META[cat];
          if (!meta) return null;
          return {
            id: cat,
            label: meta.label,
            icon: meta.icon,
            count: byCategory.get(cat)?.length ?? 0,
          };
        })
        .filter((c): c is CategoryNavItem => c !== null),
    [sortedCategories, byCategory],
  );

  // Intersection observer for active category tracking
  useEffect(() => {
    observerRef.current?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cat = entry.target.id.replace("biomarker-cat-", "");
            setActiveCategory(cat);
            break;
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );

    observerRef.current = observer;

    for (const cat of sortedCategories) {
      const el = document.getElementById(`biomarker-cat-${cat}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sortedCategories]);

  const handleCategoryClick = useCallback((category: string) => {
    const el = document.getElementById(`biomarker-cat-${category}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (isLoading) {
    return (
      <div>
        <TitleActionHeader title="Biomarkers" subtitle="Loading..." />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="card h-16 animate-pulse bg-neutral-50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (allMetrics.length === 0) {
    return (
      <div>
        <TitleActionHeader
          title="Biomarkers"
          subtitle="Metric definitions and reference ranges."
        />
        <div className="mt-7">
          <AnimatedEmptyState
            title="No metrics defined"
            description="Run db:seed to populate metric definitions and reference ranges."
            cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
          />
        </div>
      </div>
    );
  }

  const userSex = prefs?.biologicalSex ?? null;
  const subtitle = `${allMetrics.length} metrics · ${allRanges.length} reference ranges${userSex ? ` · Profile: ${userSex}` : ""}`;

  return (
    <div>
      <TitleActionHeader title="Biomarkers" subtitle={subtitle} />

      {/* Search */}
      <div className="relative mt-7 mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search metrics, aliases, or categories..."
          className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100 transition-all"
        />
      </div>

      {filtered.length === 0 ? (
        <AnimatedEmptyState
          title="No matches"
          description={`No metrics matching "${search}". Try a different term.`}
          cardIcon={({ index }) => emptyIcons[index % emptyIcons.length]!}
        />
      ) : (
        <>
          {/* Mobile pill nav */}
          <div className="lg:hidden mb-4">
            <CategoryNav
              variant="pills"
              categories={navCategories}
              activeCategory={activeCategory}
              onCategoryClick={handleCategoryClick}
              className="static mx-0 px-0 border-0 bg-transparent"
            />
          </div>

          {/* Desktop: sidebar + content */}
          <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
            <div className="hidden lg:block">
              <CategoryNav
                variant="sidebar"
                categories={navCategories}
                activeCategory={activeCategory}
                onCategoryClick={handleCategoryClick}
              />
            </div>

            <div className="space-y-3">
              {sortedCategories.map((cat) => {
                const catMetrics = byCategory.get(cat)!;
                const meta = CATEGORY_META[cat];
                const IconComponent = meta?.icon ?? ListChecks;
                const label = meta?.label ?? cat;

                return (
                  <div
                    key={cat}
                    id={`biomarker-cat-${cat}`}
                    className="card scroll-mt-20"
                  >
                    {/* Category header */}
                    <div className="flex items-center gap-3 px-5 py-4">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-neutral-100">
                        <IconComponent className="size-4 text-neutral-500" />
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-neutral-900 font-body">
                          {label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-neutral-400 font-mono">
                          {catMetrics.length} metric
                          {catMetrics.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    {/* Header row */}
                    <div className="grid grid-cols-[1.6fr_1fr_1.4fr_0.8fr] gap-3 border-t border-b border-neutral-200 bg-neutral-50 px-5 py-2.5">
                      {["Metric", "Unit", "Default Range", "Aliases"].map(
                        (h) => (
                          <div
                            key={h}
                            className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono"
                          >
                            {h}
                          </div>
                        ),
                      )}
                    </div>

                    {/* Metric rows */}
                    {catMetrics.map((m) => {
                      const metricRanges = rangesByMetric.get(m.id) ?? [];
                      const hasDemographicRanges = metricRanges.length > 0;
                      const isMetricExpanded = expandedMetric === m.id;
                      const aliasList = m.aliases.slice(0, 4);
                      const moreAliases =
                        m.aliases.length > 4 ? m.aliases.length - 4 : 0;

                      return (
                        <div key={m.id}>
                          <div
                            className="grid grid-cols-[1.6fr_1fr_1.4fr_0.8fr] items-center gap-3 border-b border-neutral-100 px-5 py-3.5 transition-colors hover:bg-neutral-50 cursor-pointer"
                            onClick={() =>
                              setExpandedMetric(isMetricExpanded ? null : m.id)
                            }
                          >
                            {/* Name + description */}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-neutral-900 font-body">
                                  {m.name}
                                </span>
                                {hasDemographicRanges && (
                                  <StatusBadge
                                    status="info"
                                    label={`${metricRanges.length} range${metricRanges.length !== 1 ? "s" : ""}`}
                                  />
                                )}
                              </div>
                              {m.description && (
                                <div className="mt-0.5 text-[11px] text-neutral-400 font-mono">
                                  {m.description}
                                </div>
                              )}
                            </div>

                            {/* Unit */}
                            <div className="text-xs text-neutral-600 font-mono">
                              {m.unit ?? "—"}
                            </div>

                            {/* Default range */}
                            <div className="text-xs text-neutral-600 font-mono">
                              {formatRange(
                                m.referenceRangeLow,
                                m.referenceRangeHigh,
                                m.unit,
                              )}
                            </div>

                            {/* Aliases preview */}
                            <div className="flex flex-wrap gap-1">
                              {aliasList.map((a: string) => (
                                <span
                                  key={a}
                                  className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 font-mono"
                                >
                                  {a}
                                </span>
                              ))}
                              {moreAliases > 0 && (
                                <span className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-400 font-mono">
                                  +{moreAliases}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expanded detail: demographic ranges */}
                          {isMetricExpanded && (
                            <div className="border-b border-neutral-100 bg-neutral-50/50 px-5 py-4">
                              <div className="mb-3 flex flex-wrap gap-1.5">
                                {m.aliases.map((a: string) => (
                                  <span
                                    key={a}
                                    className="inline-block rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-[11px] text-neutral-600 font-mono"
                                  >
                                    {a}
                                  </span>
                                ))}
                              </div>

                              {m.loincCode && (
                                <div className="mb-3 text-[11px] text-neutral-400 font-mono">
                                  LOINC: {m.loincCode}
                                </div>
                              )}

                              {metricRanges.length > 0 ? (
                                <div>
                                  <div className="mb-2 text-[12px] font-medium text-neutral-700 font-body">
                                    Reference Ranges
                                  </div>
                                  <div className="card">
                                    <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr] gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2">
                                      {["Sex", "Age", "Range", "Source"].map(
                                        (h) => (
                                          <div
                                            key={h}
                                            className="text-[10px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono"
                                          >
                                            {h}
                                          </div>
                                        ),
                                      )}
                                    </div>
                                    {metricRanges.map((r) => {
                                      const isUserMatch =
                                        userSex &&
                                        (r.sex === null || r.sex === userSex);

                                      return (
                                        <div
                                          key={r.id}
                                          className={`grid grid-cols-[1fr_1fr_1fr_1.2fr] items-center gap-3 border-b border-neutral-100 px-4 py-2.5 ${
                                            isUserMatch ? "bg-accent-50/40" : ""
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs text-neutral-700 font-mono">
                                              {r.sex
                                                ? r.sex
                                                    .charAt(0)
                                                    .toUpperCase() +
                                                  r.sex.slice(1)
                                                : "Any"}
                                            </span>
                                            {isUserMatch && r.sex && (
                                              <span className="inline-block size-1.5 rounded-full bg-accent-500" />
                                            )}
                                          </div>
                                          <div className="text-xs text-neutral-600 font-mono">
                                            {r.ageMin != null &&
                                            r.ageMax != null
                                              ? `${r.ageMin}–${r.ageMax}`
                                              : r.ageMin != null
                                                ? `${r.ageMin}+`
                                                : r.ageMax != null
                                                  ? `≤ ${r.ageMax}`
                                                  : "Any"}
                                          </div>
                                          <div className="text-xs font-medium text-neutral-900 font-mono">
                                            {formatRange(
                                              r.rangeLow,
                                              r.rangeHigh,
                                              m.unit,
                                            )}
                                          </div>
                                          <div className="text-[11px] text-neutral-400 font-mono">
                                            {r.source ?? "—"}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[12px] text-neutral-400 font-body">
                                  No demographic-specific ranges — using default
                                  range only.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
