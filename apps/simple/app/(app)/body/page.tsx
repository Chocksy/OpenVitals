import { PillTabs } from "@/components/pill-tabs";
import TodayPage from "../today/page";
import FeelPage from "../feel/page";
import TrendsPage from "../trends/page";
import HistoryPage from "../history/page";

/**
 * Body, phase 30a: the destination exists and carries the tab bar, so
 * `/today`, `/feel`, `/trends` and `/history` can redirect here today and
 * nothing 404s. Each tab still renders the old page's own body; phase 30b
 * rebuilds them per `docs/mockups/v4/body.html` and deletes those routes.
 */
const TABS = [
  { id: "today", label: "Today", href: "/body?tab=today" },
  { id: "feel", label: "How you feel", href: "/body?tab=feel" },
  { id: "trends", label: "Trends", href: "/body?tab=trends" },
  { id: "history", label: "History", href: "/body?tab=history" },
];

export default async function BodyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; d?: string }>;
}) {
  const params = await searchParams;
  const tab = TABS.some((t) => t.id === params.tab) ? params.tab! : "today";

  return (
    <div className="flex flex-col gap-[var(--s21)]">
      <div className="flex flex-wrap items-baseline gap-[var(--s13)]">
        <h1 className="c-title">Body</h1>
        <p className="t-meta">
          Today's numbers from your phone, and the trend behind them.
        </p>
      </div>
      <PillTabs tabs={TABS} active={tab} label="Body" />
      {tab === "today" && (
        <TodayPage searchParams={Promise.resolve({ d: params.d })} />
      )}
      {tab === "feel" && <FeelPage />}
      {tab === "trends" && <TrendsPage />}
      {tab === "history" && <HistoryPage />}
    </div>
  );
}
