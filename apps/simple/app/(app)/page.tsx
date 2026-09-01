import { requireUserId } from "@/lib/auth";
import { getMetricRows } from "@/lib/data";
import { getGoals } from "@/lib/daily-data";
import { buildToday, buildTrend, type TrendMetric } from "@/lib/home-data";
import { localDay } from "@/lib/daily";
import { buildLedger, isLoud } from "@/lib/ledger";
import { askSurfaces } from "@/lib/asking";
import { latestReport } from "@/lib/report";
import { catalogFor } from "@/lib/hkb";
import { PROFILE_QUESTIONS } from "@/lib/vectors";
import {
  Cockpit,
  ConclusionCard,
  EmptyHome,
  ImprovedCard,
  KeyTrends,
  QuietLine,
  SectionHeader,
  SystemsStrip,
  TodayCard,
} from "@/components/home";
import { AskBox } from "@/components/ask-box";

export const dynamic = "force-dynamic";

const KEY_TRENDS = 4;

export default async function Home() {
  const userId = await requireUserId();

  const [ledger, report, rows, goals, catalog, today] = await Promise.all([
    buildLedger(userId),
    latestReport(userId),
    getMetricRows(userId),
    getGoals(userId),
    catalogFor(userId),
    buildToday(userId),
  ]);

  if (rows.length === 0) return <EmptyHome />;

  // The model writes one sentence per conclusion into `systems[].verdict`,
  // keyed by the condition id. No sentence yet: fall back to the catalog.
  const summaries = new Map(catalog.map((h) => [h.id, h.summary]));
  const written = new Map(
    (report?.body.systems ?? []).map((s) => [s.id, s.verdict || s.eli5]),
  );
  const verdictOf = (id: string) => written.get(id) ?? summaries.get(id);

  const actions = report?.body.actions ?? [];
  const indexOf = (title: string) => {
    const i = actions.findIndex((a) => a.title === title);
    return i === -1 ? undefined : i;
  };

  const optionsOf = (key: string) => PROFILE_QUESTIONS[key]?.options ?? [];

  /**
   * One asking surface, decided once for the whole page: the Today card takes
   * the answer, every card that would have asked the same thing links to it.
   */
  const keyOf = (c: (typeof ledger.conclusions)[number]) =>
    c.question?.featureId.replace(/^fact:/, "");
  const plan = askSurfaces({
    due: today.due.map((d) => d.key),
    gain: ledger.asks,
    others: ledger.conclusions.flatMap((c) => {
      const key = keyOf(c);
      return key ? [{ where: `card:${c.id}`, keys: [key] }] : [];
    }),
  });
  const askOf = (c: (typeof ledger.conclusions)[number]) => {
    const key = keyOf(c);
    if (!key || !plan.links.includes(key)) return undefined;
    return (
      ledger.asks.find((a) => a.key === key) ?? {
        key,
        question: c.question!.label,
        moves: [],
      }
    );
  };

  const { spear } = ledger;
  const rest = ledger.conclusions.filter((c) => c.id !== spear?.id);
  // "What improved" sits after the last possible-or-higher conclusion.
  const lastLoud = rest.reduce(
    (last, c, i) => (c.state && isLoud(c.state) ? i : last),
    -1,
  );
  const loud = rest.slice(0, lastLoud + 1);
  const quietTail = rest.slice(lastLoud + 1);

  const byCode = new Map(rows.map((m) => [m.code, m]));
  const goalByCode = new Map(goals.map((g) => [g.metricCode, g]));
  const trends: TrendMetric[] = [];
  for (const c of [spear, ...rest].filter((c) => c != null)) {
    if (trends.length >= KEY_TRENDS) break;
    const metric = c.trend ? byCode.get(c.trend.code) : null;
    if (!metric || trends.some((t) => t.metricCode === metric.code)) continue;
    const trend = buildTrend(metric, goalByCode.get(metric.code));
    if (trend) trends.push(trend);
  }

  const card = (c: (typeof rest)[number], isSpear = false) => (
    <ConclusionCard
      key={c.id}
      c={c}
      spear={isSpear}
      verdict={verdictOf(c.id)}
      reportId={report?.id ?? null}
      actionIndex={c.action ? indexOf(c.action.title) : undefined}
      ask={askOf(c)}
    />
  );

  return (
    <div className="space-y-8">
      <TodayCard
        today={today}
        day={localDay()}
        ask={plan.ask}
        askOptions={plan.ask ? optionsOf(plan.ask.key) : []}
      />
      <Cockpit ledger={ledger} />

      <section>
        <SectionHeader title="Systems" href="/graph" linkLabel="Your graph" />
        <SystemsStrip systems={ledger.systems} />
      </section>

      {spear && (
        <section>
          <SectionHeader
            title="Fix this first"
            href="/plan"
            linkLabel="Full plan"
          />
          {card(spear, true)}
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-2">
          <SectionHeader title="The ledger" />
          {loud.map((c) => card(c))}
          <ImprovedCard improved={ledger.improved} />
          {quietTail.map((c) => card(c))}
        </section>
      )}

      <QuietLine quiet={ledger.quiet} />

      <section>
        <SectionHeader title="Ask" />
        <AskBox />
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
    </div>
  );
}
