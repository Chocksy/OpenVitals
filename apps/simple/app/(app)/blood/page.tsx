import LabsPage from "../labs/page";
import PhonePage from "../labs/phone/page";
import BiomarkersPage from "../biomarkers/page";
import UploadsPage from "../uploads/page";

/**
 * Blood, phase 30a: the destination exists, so `/labs`, `/biomarkers`,
 * `/labs/phone` and `/uploads` can redirect here today and nothing 404s.
 * Each tab renders the old page's own body, and each of those bodies already
 * draws `LabsHeader`, which is now Blood's title and tab bar. Phase 30c
 * rebuilds the tabs per `blood.html` + `marker.html` and deletes the four
 * old routes.
 */
const TABS = ["draws", "markers", "phone", "uploads"];

export default async function BloodPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active = TABS.includes(tab ?? "") ? tab : "draws";

  if (active === "markers") return <BiomarkersPage />;
  if (active === "phone") return <PhonePage />;
  if (active === "uploads") return <UploadsPage />;
  return <LabsPage />;
}
