import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requireUserId, currentUser } from "@/lib/auth";
import { getDb, reviewItems } from "@/db";
import { getMetricRows } from "@/lib/data";
import { getGoals } from "@/lib/daily-data";
import { buildModelInput } from "@/lib/coverage";
import { computeGraphState, worstMember } from "@/lib/graph-state";
import { SYSTEMS } from "@/lib/graph";
import { healthStatus } from "@/lib/status";
import { latestReport } from "@/lib/report";
import { buildHome, buildTrend, type TrendMetric } from "@/lib/home-data";
import { ReviewItem } from "@/components/client";
import {
  AttentionMetrics,
  FixNext,
  GreetingHeader,
  HealthScore,
  KeyTrends,
  SectionHeader,
  SystemsStrip,
  type SystemTile,
} from "@/components/home";

export const dynamic = "force-dynamic";

const KEY_TRENDS = 4;
const MAX_QUESTIONS = 3;

export default async function Home() {
  const userId = await requireUserId();
  const db = getDb();

  const [user, rows, open, model, plan, goals] = await Promise.all([
    currentUser(),
    getMetricRows(userId),
    db
      .select()
      .from(reviewItems)
      .where(
        and(eq(reviewItems.userId, userId), eq(reviewItems.status, "open")),
      ),
    buildModelInput(userId),
    latestReport(userId),
    getGoals(userId),
  ]);

  const home = buildHome(rows);
  const firstName = (user?.name ?? "").split(/\s+/)[0] ?? "";
  const hasData = rows.length > 0;

  const now = new Date();
  const questions = [
    ...open.filter((i) => i.kind === "profile_question"),
    ...open.filter((i) => i.kind === "check_in" && (i.createdAt ?? now) <= now),
  ].slice(0, MAX_QUESTIONS);

  // 2. the 12 system tiles, worst first, without the arcs.
  const graph = computeGraphState(model, { top: 60 });
  const importance = new Map(graph.nodes.map((n) => [n.id, n.importance]));
  const systems: SystemTile[] = SYSTEMS.map((system) => {
    const worst = worstMember(system.id, model, importance);
    const row = worst ? model.latest[worst.code] : null;
    return {
      id: system.id,
      name: system.name,
      score: importance.get(`system:${system.id}`) ?? 0,
      worstName: worst?.node.name ?? null,
      worstStatus: row ? healthStatus(row) : null,
    };
  }).sort((a, b) => b.score - a.score);

  // 3. the plan's top actions, tests counted separately.
  const indexed = (plan?.body.actions ?? []).map((action, index) => ({
    action,
    index,
  }));
  const topActions = indexed
    .filter((r) => r.action.kind !== "test")
    .sort((a, b) => b.action.weight - a.action.weight)
    .slice(0, 3);
  const testCount = indexed.filter((r) => r.action.kind === "test").length;

  // 4. the four hottest markers with enough history to draw.
  const byCode = new Map(rows.map((m) => [m.code, m]));
  const goalByCode = new Map(goals.map((g) => [g.metricCode, g]));
  const trends: TrendMetric[] = [];
  for (const node of graph.hot) {
    if (trends.length >= KEY_TRENDS) break;
    if (!node.id.startsWith("metric:")) continue;
    const code = node.id.slice("metric:".length);
    const metric = byCode.get(code);
    if (!metric) continue;
    const trend = buildTrend(metric, goalByCode.get(code));
    if (trend) trends.push(trend);
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <GreetingHeader
          firstName={firstName}
          summaryLine={home.summaryLine}
          lastDraw={home.lastDraw}
          questionCount={open.length}
        />
        {hasData && (
          <HealthScore
            score={home.score}
            optimalCount={home.stats.optimalCount}
            normalCount={home.stats.normalCount}
            offCount={home.stats.offCount}
            totalMetrics={home.metricCount}
          />
        )}
      </div>

      {!hasData && (
        <p className="card border-dashed p-10 text-center font-body text-[13px] text-neutral-500">
          No readings yet.{" "}
          <Link href="/labs" className="underline">
            Upload a lab PDF
          </Link>{" "}
          to get started.
        </p>
      )}

      <section>
        <SectionHeader title="Systems" href="/graph" linkLabel="Your graph" />
        <SystemsStrip systems={systems} />
      </section>

      <section>
        <SectionHeader title="Fix next" href="/plan" linkLabel="Full plan" />
        <FixNext
          actions={topActions}
          reportId={plan?.id ?? null}
          testCount={testCount}
        />
      </section>

      {trends.length > 0 && (
        <section>
          <SectionHeader
            title="Key trends"
            href="/biomarkers"
            linkLabel="All markers"
          />
          <KeyTrends trends={trends} />
        </section>
      )}

      {home.attention.length > 0 && (
        <AttentionMetrics metrics={home.attention} />
      )}

      {questions.length > 0 && (
        <section>
          <SectionHeader title="Questions" href="/review" linkLabel="Review" />
          <div className="space-y-2">
            {questions.map((q) => (
              <ReviewItem
                key={q.id}
                id={q.id}
                question={q.question}
                options={q.options}
                detail={q.subject?.detail}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
