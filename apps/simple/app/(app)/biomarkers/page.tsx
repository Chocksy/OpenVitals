import { requireUserId } from "@/lib/auth";
import {
  getMetricRows,
  sortForBiomarkerList,
  toBiomarkerRow,
} from "@/lib/data";
import {
  BiomarkerList,
  type BiomarkerListRow,
} from "@/components/biomarker-list";
import { LabsHeader } from "@/components/labs-header";

export const dynamic = "force-dynamic";

/** The Biomarkers tab of Labs, still on its own URL. */
export default async function BiomarkersPage() {
  const userId = await requireUserId();
  const rows = await getMetricRows(userId);

  const list: BiomarkerListRow[] = rows.map((m) => {
    const withValues = m.rows.filter((r) => r.value != null);
    return {
      ...toBiomarkerRow(m),
      numeric: m.latest.value,
      prev: withValues[withValues.length - 2]?.value ?? null,
      refLow: m.latest.refLow,
      refHigh: m.latest.refHigh,
      optimalLow: m.optimalLow,
      optimalHigh: m.optimalHigh,
    };
  });

  return (
    <div className="space-y-6">
      <LabsHeader
        active="biomarkers"
        subtitle={`${rows.length} tracked markers, newest reading first.`}
      />
      <BiomarkerList rows={sortForBiomarkerList(list) as BiomarkerListRow[]} />
    </div>
  );
}
