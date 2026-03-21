"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketingBiomarker } from "../data";

interface BiomarkerCardProps {
  biomarker: MarketingBiomarker;
}

export function BiomarkerCard({ biomarker }: BiomarkerCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "group rounded-xl border bg-white transition-all duration-200 cursor-pointer",
        expanded
          ? "border-neutral-200 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
          : "border-neutral-100 hover:border-neutral-200",
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="px-5 py-4">
        {/* Name + toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-neutral-900 font-body leading-snug">
              {biomarker.name}
            </div>
            <div className="mt-1 text-[12px] leading-[1.5] text-neutral-400 font-body line-clamp-1">
              {biomarker.description}
            </div>
          </div>
          <div
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors mt-0.5",
              expanded
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-400 group-hover:bg-neutral-200",
            )}
          >
            {expanded ? (
              <Minus className="size-3" strokeWidth={2} />
            ) : (
              <Plus className="size-3" strokeWidth={2} />
            )}
          </div>
        </div>

        {/* Pills */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {biomarker.unit && (
            <span className="rounded-md bg-neutral-50 px-2 py-0.5 text-[10px] font-mono text-neutral-500 border border-neutral-100">
              {biomarker.unit}
            </span>
          )}
          {biomarker.referenceRangeText && (
            <span className="rounded-md bg-neutral-50 px-2 py-0.5 text-[10px] font-mono text-neutral-400 border border-neutral-100">
              {biomarker.referenceRangeText}
            </span>
          )}
        </div>

        {/* Expanded */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="mt-4 border-t border-neutral-100 pt-4 space-y-3">
                {biomarker.aliases.length > 0 && (
                  <div>
                    <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.06em] text-neutral-300 font-mono">
                      Also known as
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {biomarker.aliases.map((alias) => (
                        <span
                          key={alias}
                          className="inline-block rounded-md border border-neutral-100 px-2 py-0.5 text-[10px] text-neutral-400 font-mono"
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-[10px] text-neutral-300 font-mono">
                  {biomarker.id}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
