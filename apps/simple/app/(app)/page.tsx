import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { ClipboardCheck, MessageSquare } from "lucide-react";
import { requireUserId, currentUser } from "@/lib/auth";
import { getDb, insights, uploads, type RetestBody } from "@/db";
import { getMetricRows } from "@/lib/data";
import { openReviewCount } from "@/lib/curator";
import { getHomeExtras } from "@/lib/daily-data";
import { buildHome, buildRetestPreview } from "@/lib/home-data";
import { UploadButton } from "@/components/client";
import {
  AttentionMetrics,
  BiomarkerPanelCard,
  DashboardStats,
  GoalsCard,
  GreetingHeader,
  HealthInsights,
  HealthScore,
  PanelSectionHeader,
  TodayCard,
  UpcomingRetests,
  WhatChanged,
} from "@/components/home";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await requireUserId();
  const [user, rows] = await Promise.all([currentUser(), getMetricRows(userId)]);
  const db = getDb();

  const [uploadCount, latestRetest, reviewCount, extras] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(uploads)
      .where(eq(uploads.userId, userId))
      .then((r) => r[0]?.n ?? 0),
    db
      .select()
      .from(insights)
      .where(eq(insights.userId, userId))
      .orderBy(desc(insights.createdAt))
      .then((r) => r.find((i) => i.kind === "retest")),
    openReviewCount(userId),
    getHomeExtras(userId),
  ]);

  const home = buildHome(rows);
  const retest = buildRetestPreview(
    latestRetest?.body as RetestBody | undefined,
    new Map(rows.map((m) => [m.code, m])),
  );
  const firstName = (user?.name ?? "").split(/\s+/)[0] ?? "";
  const hasData = rows.length > 0;

  return (
    <div className="stagger-children">
      <GreetingHeader
        firstName={firstName}
        summaryLine={home.summaryLine}
        abnormalCount={home.abnormalCount}
      />

      {reviewCount > 0 && (
        <Link
          href="/review"
          className="mt-4 flex items-center gap-2 border border-[var(--color-health-warning-border)] bg-[var(--color-health-warning-bg)] px-3 py-2 font-body text-[13px] text-neutral-800 hover:border-[var(--color-health-warning)]"
        >
          <ClipboardCheck className="size-4 text-[var(--color-health-warning)]" />
          {reviewCount} data question{reviewCount === 1 ? "" : "s"} waiting
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-500">
            Review →
          </span>
        </Link>
      )}

      {hasData && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
          <HealthScore
            score={home.score}
            normalCount={home.stats.normalCount}
            warningCount={home.stats.warningCount}
            criticalCount={home.stats.criticalCount}
            totalMetrics={home.metricCount}
          />
          <DashboardStats
            metricCount={home.metricCount}
            totalResults={home.totalResults}
            flaggedCount={home.abnormalCount}
            criticalCount={home.stats.criticalCount}
            warningCount={home.stats.warningCount}
            uploadCount={uploadCount}
            retestCount={retest?.items.length ?? 0}
            retestDue={retest?.dueAt ?? null}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <UploadButton />
        <Link
          href="/chat"
          className="card inline-flex items-center gap-2 px-4 py-2.5 font-display text-[13px] font-medium transition-all hover:border-accent-200"
        >
          <MessageSquare className="size-4 text-neutral-500" />
          Ask the AI coach
        </Link>
      </div>

      {!hasData && (
        <p className="mt-6 font-body text-[13px] text-neutral-500">
          No readings yet. Upload a lab PDF to get started.
        </p>
      )}

      {home.insights.length > 0 && (
        <div className="mt-6">
          <HealthInsights insights={home.insights} />
        </div>
      )}

      {hasData && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AttentionMetrics metrics={home.attention} />
          <UpcomingRetests plan={retest} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <TodayCard
          streak={extras.streak}
          habitsDone={extras.habitsDone}
          habitCount={extras.habitCount}
          logged={extras.logged}
        />
        <GoalsCard goals={extras.goals} />
      </div>

      {hasData &&
        home.panels.map((panel) => (
          <div key={panel.id} className="mt-6">
            <PanelSectionHeader panel={panel} />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {panel.metrics.map((m) => (
                <BiomarkerPanelCard key={m.metricCode} metric={m} />
              ))}
            </div>
          </div>
        ))}

      {home.changed.changes.length > 0 && (
        <div className="mt-8">
          <WhatChanged
            changes={home.changed.changes}
            previousDate={home.changed.previousDate}
            currentDate={home.changed.currentDate}
          />
        </div>
      )}
    </div>
  );
}
