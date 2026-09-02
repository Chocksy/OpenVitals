/**
 * The Blood header. Phase 30a folded `/labs`, `/biomarkers`, `/labs/phone`
 * and `/uploads` into `/blood`, so this is the destination's own title and
 * tab bar; the four old routes redirect into it. Phase 30c rebuilds the tabs
 * themselves per `docs/mockups/v4/blood.html`.
 */
import { UploadButton } from "./client";
import { PillTabs } from "./pill-tabs";

export type LabsTab = "draws" | "markers" | "phone" | "uploads";

const TABS: { id: LabsTab; name: string; href: string }[] = [
  { id: "draws", name: "Draws", href: "/blood?tab=draws" },
  { id: "markers", name: "Markers", href: "/blood?tab=markers" },
  { id: "phone", name: "Phone", href: "/blood?tab=phone" },
  { id: "uploads", name: "Uploads", href: "/blood?tab=uploads" },
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
          <h1 className="c-title">Blood</h1>
          <p className="t-meta mt-[var(--s3)]">{subtitle}</p>
        </div>
        <UploadButton />
      </div>

      <PillTabs
        label="Blood"
        active={active}
        tabs={TABS.map((t) => ({ id: t.id, label: t.name, href: t.href }))}
      />
    </div>
  );
}
