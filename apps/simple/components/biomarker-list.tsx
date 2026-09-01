"use client";

/**
 * The Biomarkers tab. Ported out of client.tsx so every row can carry a range
 * bar: the status dot on its own never said how far off a number was.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { statusColor, type Status } from "@/lib/status";
import type { BiomarkerRow } from "@/lib/data";
import { fmtCategory } from "@/lib/utils";
import { RangeBar } from "./range-bar";
import { MiniSparkline } from "./ui-kit";

/** A list row plus the bands the range bar draws. */
export interface BiomarkerListRow extends BiomarkerRow {
  numeric: number | null;
  prev: number | null;
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
}

const sparkStroke: Record<Status, string> = {
  red: "var(--color-health-critical)",
  amber: "var(--color-health-warning)",
  green: "var(--color-health-normal)",
  gray: "var(--color-neutral-300)",
};

export function BiomarkerList({ rows }: { rows: BiomarkerListRow[] }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, BiomarkerListRow[]>();
    for (const r of rows) {
      if (q && !r.name.toLowerCase().includes(q) && !r.code.includes(q))
        continue;
      map.set(r.category, [...(map.get(r.category) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows, query]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search biomarkers"
          className="w-full rounded-sm border border-neutral-200 bg-neutral-0 py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {groups.length === 0 && (
        <p className="font-body text-[13px] text-neutral-500">
          Nothing matches “{query}”.
        </p>
      )}

      {groups.map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            {fmtCategory(category)}
          </h2>
          <div className="card divide-y divide-neutral-100">
            {items.map((m) => (
              <Link
                key={m.code}
                href={`/m/${m.code}`}
                className="block px-4 py-2.5 hover:bg-neutral-50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`size-[6px] shrink-0 rounded-full ${statusColor[m.status]}`}
                  />
                  <span className="flex-1 truncate font-body text-[13px]">
                    {m.name}
                    {m.derived && (
                      <span className="ml-1.5 font-mono text-[9px] uppercase text-neutral-400">
                        derived
                      </span>
                    )}
                    {m.phone && (
                      <span className="ml-1.5 font-mono text-[9px] uppercase text-neutral-400">
                        from your phone
                      </span>
                    )}
                  </span>
                  <MiniSparkline
                    data={m.spark}
                    color={sparkStroke[m.status]}
                    width={64}
                    height={20}
                  />
                  <span className="w-28 text-right font-mono text-[13px] font-semibold tabular-nums">
                    {m.value}
                    <span className="ml-1 text-[10px] font-normal text-neutral-400">
                      {m.unit ?? ""}
                    </span>
                  </span>
                  <span className="w-24 text-right font-mono text-[10px] tabular-nums text-neutral-400">
                    {m.observedAt}
                  </span>
                </div>
                <div className="mt-1.5 pl-[18px]">
                  <RangeBar
                    value={m.numeric}
                    prev={m.prev}
                    refLow={m.refLow}
                    refHigh={m.refHigh}
                    optimalLow={m.optimalLow}
                    optimalHigh={m.optimalHigh}
                    unit={m.unit}
                  />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
