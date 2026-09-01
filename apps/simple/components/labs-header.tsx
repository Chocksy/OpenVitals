/**
 * One header for the four lab routes. `/labs` is the Draws tab, `/biomarkers`,
 * `/labs/phone` and `/uploads` are the others, so every old URL keeps working
 * and the tab bar is the same component with a different tab lit.
 */
import { UploadButton } from "./client";
import { PillTabs } from "./pill-tabs";

export type LabsTab = "biomarkers" | "draws" | "phone" | "uploads";

const TABS: { id: LabsTab; name: string; href: string }[] = [
  { id: "biomarkers", name: "Biomarkers", href: "/biomarkers" },
  { id: "draws", name: "Draws", href: "/labs" },
  { id: "phone", name: "Phone", href: "/labs/phone" },
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

      <PillTabs
        label="Labs"
        active={active}
        tabs={TABS.map((t) => ({ id: t.id, label: t.name, href: t.href }))}
      />
    </div>
  );
}
