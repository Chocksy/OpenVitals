/**
 * The genome catalog with this person's call on every row. Rows the array does
 * not carry read "not in this array"; nothing outside the catalog is ever
 * printed, so a raw file never leaks onto the page.
 */
import { movesAnything } from "@/lib/genome-catalog";
import type { GenomeResult } from "@/lib/genome";

export function GenomeTable({ results }: { results: GenomeResult[] }) {
  const called = results.filter((r) => r.result).length;
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] text-neutral-500">
        {called} of {results.length} catalog rows called from this file
      </p>
      <div className="card divide-y divide-neutral-100">
        {results.map(({ row, result, absent }) => (
          <div key={row.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-[14px] font-medium">
                {row.gene}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                {row.rsids.join(", ")} · grade {row.grade}
              </span>
              {result ? (
                <span className="ml-auto border border-accent-200 bg-accent-50 px-2 py-0.5 font-mono text-[11px] text-accent-600">
                  {result.call}
                </span>
              ) : (
                <span className="ml-auto font-mono text-[11px] text-neutral-400">
                  not in this array
                  {absent.length ? ` (${absent.join(", ")})` : ""}
                </span>
              )}
            </div>

            {result && (
              <p className="mt-1 font-mono text-[10px] text-neutral-500">
                {result.genotype}
              </p>
            )}
            <p className="mt-1 font-body text-[12px] text-neutral-700">
              {result ? result.meaning : row.why}
            </p>
            <p className="mt-1 font-body text-[11px] text-neutral-500">
              Why this SNP is here: {row.why}
            </p>
            {result && !movesAnything(row, result) ? (
              <>
                <p className="mt-0.5 font-body text-[11px] text-neutral-500">
                  Effect: no effect for you
                </p>
                <p className="font-body text-[11px] text-neutral-400">
                  {row.effect}
                </p>
              </>
            ) : (
              <p className="mt-0.5 font-body text-[11px] text-neutral-500">
                Effect: {row.effect}
              </p>
            )}
            <p className="mt-0.5 font-mono text-[10px] text-neutral-400">
              {row.source}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
