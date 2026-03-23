"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { TitleActionHeader } from "@/components/title-action-header";
import { ProviderCard } from "@/components/testing/provider-card";
import {
  ProviderFilters,
  type FilterState,
} from "@/components/testing/provider-filters";
import { PanelCard } from "@/components/testing/panel-card";
import { RetestPlanner } from "@/components/testing/retest-planner";
import { MapTab } from "@/components/testing/map-tab";
import { useUserLocation } from "@/hooks/use-user-location";
import { useState, useCallback, useMemo } from "react";
import { Search, MapPin, Loader2 } from "lucide-react";

type Tab = "directory" | "panels" | "retest" | "map";

const tabs: { id: Tab; label: string }[] = [
  { id: "retest", label: "Retest Planner" },
  { id: "panels", label: "Panels" },
  { id: "directory", label: "Directory" },
  { id: "map", label: "Map" },
];

export default function TestingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab =
    tabParam && tabs.some((t) => t.id === tabParam) ? tabParam : "retest";

  const setTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  return (
    <div>
      <TitleActionHeader
        title="Testing"
        subtitle="Find labs, explore panels, and plan your next tests."
        under={
          <div className="pill-tabs mt-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={cn(
                  "pill-tab",
                  activeTab === tab.id && "pill-tab-active",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      <div
        className={cn("mt-5 animate-fade-in", activeTab === "map" && "mt-3")}
      >
        {activeTab === "directory" && <DirectoryTab />}
        {activeTab === "panels" && <PanelsTab />}
        {activeTab === "retest" && <RetestPlanner />}
        {activeTab === "map" && <MapTab />}
      </div>
    </div>
  );
}

function DirectoryTab() {
  const { data: providers, isLoading } =
    trpc.testing["providers.list"].useQuery();
  const {
    location,
    isLoading: locationLoading,
    hasPermission,
    requestLocation,
  } = useUserLocation();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    serviceType: null,
    features: new Set(),
    priceRange: null,
  });

  const filtered = useMemo(() => {
    let items = providers ?? [];

    // Text search
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      );
    }

    // Service type filter
    if (filters.serviceType) {
      items = items.filter((p) => p.serviceType === filters.serviceType);
    }

    // Feature filters
    for (const feat of filters.features) {
      items = items.filter((p) => p[feat as keyof typeof p] === true);
    }

    // Price filter
    if (filters.priceRange) {
      items = items.filter((p) => p.priceRange === filters.priceRange);
    }

    return items;
  }, [providers, search, filters]);

  // Group: walk-in (has placeSearchQuery) first, then online
  const walkInProviders = filtered.filter((p) => p.placeSearchQuery);
  const onlineProviders = filtered.filter((p) => !p.placeSearchQuery);

  const walkInCount = (providers ?? []).filter(
    (p) => p.placeSearchQuery,
  ).length;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="card h-32 animate-pulse bg-neutral-50"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Location bar */}
      <div className="card flex items-center justify-between px-4 py-3 shadow-xs">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[var(--color-accent-500)]" />
          {location ? (
            <div>
              <span className="text-sm font-medium text-neutral-900">
                Labs near {location.city}, {location.state}
              </span>
              <span className="ml-2 text-xs text-neutral-400">
                {(providers ?? []).length} providers &middot; {walkInCount} with
                walk-in locations
              </span>
            </div>
          ) : locationLoading ? (
            <span className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Getting your location...
            </span>
          ) : (
            <span className="text-sm text-neutral-500">
              Enable location to find labs near you
            </span>
          )}
        </div>

        {!location && !locationLoading && (
          <button
            onClick={requestLocation}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium",
              "bg-[var(--color-accent-500)] text-white",
              "transition-colors hover:bg-[var(--color-accent-600)]",
            )}
          >
            Enable
          </button>
        )}

        {location && (
          <button
            onClick={requestLocation}
            className="text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-700"
          >
            Change
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Search labs, services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400"
        />
      </div>

      {/* Filters */}
      <ProviderFilters filters={filters} onChange={setFilters} />

      {/* Provider list */}
      <div className="space-y-6">
        {walkInProviders.length > 0 && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Walk-in locations
              {location ? ` near ${location.city}, ${location.state}` : ""}
            </h3>
            <div className="space-y-3 stagger-children">
              {walkInProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  userLocation={location}
                />
              ))}
            </div>
          </div>
        )}

        {onlineProviders.length > 0 && (
          <div>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Online ordering
            </h3>
            <div className="space-y-3 stagger-children">
              {onlineProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  userLocation={location}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-neutral-500">
          No providers match your search.
        </p>
      )}
    </div>
  );
}

function PanelsTab() {
  const { data: panels, isLoading } = trpc.testing["panels.list"].useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="card h-36 animate-pulse bg-neutral-50"
          />
        ))}
      </div>
    );
  }

  const items = panels ?? [];

  // Group by category
  const categories = [...new Set(items.map((p) => p.category))];

  return (
    <div className="space-y-6">
      {categories.map((cat) => {
        const catPanels = items.filter((p) => p.category === cat);
        return (
          <div key={cat}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              {cat}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
              {catPanels.map((panel) => (
                <PanelCard key={panel.id} panel={panel} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
