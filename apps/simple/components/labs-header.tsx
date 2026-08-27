/**
 * One header for the three lab routes. `/labs` is the Draws tab, `/biomarkers`
 * and `/uploads` are the other two, so every old URL keeps working and the tab
 * bar is the same component with a different tab lit.
 */
import Link from "next/link";
import { UploadButton } from "./client";
import { cn } from "@/lib/utils";

export type LabsTab = "biomarkers" | "draws" | "uploads";

const TABS: { id: LabsTab; name: string; href: string }[] = [
  { id: "biomarkers", name: "Biomarkers", href: "/biomarkers" },
  { id: "draws", name: "Draws", href: "/labs" },
  { id: "uploads", name: "Uploads", href: "/uploads" },
];

export function LabsHeader({
  active,
  subtitle,
}: {
  active: LabsTab;
  subtitle: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
            Labs
          </h1>
          <p className="mt-1 font-body text-[13px] text-neutral-500">
            {subtitle}
          </p>
        </div>
        <UploadButton />
      </div>

      <nav className="flex items-center gap-1 rounded border bg-neutral-100 p-0.5">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "flex h-[30px] items-center px-3 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
              tab.id === active
                ? "bg-accent-50 text-accent-500"
                : "text-neutral-500 hover:text-neutral-900",
            )}
          >
            {tab.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
