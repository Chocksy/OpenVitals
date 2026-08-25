import { requireUserId } from "@/lib/auth";
import { getTrends } from "@/lib/daily-data";
import { DailyCharts } from "@/components/daily-charts";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const userId = await requireUserId();
  const { rows, draws } = await getTrends(userId, 365);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Trends
        </h1>
        <p className="mt-1 font-body text-[13px] text-neutral-500">
          What you logged, with your blood draws marked, so you can see what you
          were doing before each one.
        </p>
      </div>
      <DailyCharts rows={rows} draws={draws} />
    </div>
  );
}
