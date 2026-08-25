import { requireUserId } from "@/lib/auth";
import { getMetricRows, sortForBiomarkerList, toBiomarkerRow } from "@/lib/data";
import { BiomarkerList } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function BiomarkersPage() {
  const userId = await requireUserId();
  const rows = await getMetricRows(userId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Biomarkers
        </h1>
        <p className="mt-1 font-body text-[13px] text-neutral-500">
          {rows.length} tracked metrics, newest reading first.
        </p>
      </div>
      <BiomarkerList rows={sortForBiomarkerList(rows.map(toBiomarkerRow))} />
    </div>
  );
}
