import { actionsForAll } from "@/lib/actions";
import { requireUserId } from "@/lib/auth";
import { getMetricRows } from "@/lib/data";
import { getGoals } from "@/lib/daily-data";
import {
  buildToday,
  buildTrend,
  homeAskPlan,
  linkedAsk,
  optionsFor,
  recentFindings,
  type TrendMetric,
} from "@/lib/home-data";
import { localDay } from "@/lib/daily";
import { buildLedger, isLoud, type Conclusion } from "@/lib/ledger";
import { snapshotLedger } from "@/lib/ledger-diff";
import { NODES, SYSTEMS } from "@/lib/graph";
import { latestReport } from "@/lib/report";
import { catalogFor } from "@/lib/hkb";
import {
  Cockpit,
  ConclusionCard,
  EmptyHome,
  FindingsCard,
  ImprovedCard,
  KeyTrends,
  MarkersCard,
  QuietLine,
  SectionHeader,
  SystemsGrid,
  TodayCard,
  type MarkerGroup,
} from "@/components/home";
import { LedgerMotion } from "@/components/ledger-motion";
import { LedgerList } from "@/components/motion";
import { AskLine } from "@/components/ask-line";

export const dynamic = "force-dynamic";

const KEY_TRENDS = 4;

export default async function Home({
  searchParams,
}: {
  /** `?ask=<fact key>`: the question a link somewhere else asked for */
  searchParams: Promise<{ ask?: string }>;
}) {
  const userId = await requireUserId();

  const want = (await searchParams).ask;
  const day = localDay();
  const [ledger, report, rows, goals, catalog, today, findings] =
    await Promise.all([
      buildLedger(userId),
      latestReport(userId),
      getMetricRows(userId),
      getGoals(userId),
      catalogFor(userId),
      buildToday(userId),
      recentFindings(userId, day),
    ]);

  if (rows.length === 0) return <EmptyHome />;

  // The model writes one sentence per conclusion into `systems[].verdict`,
  // keyed by the condition id. No sentence yet: fall back to the catalog.
  const summaries = new Map(catalog.map((h) => [h.id, h.summary]));
  const management = new Map(catalog.map((h) => [h.id, h.management]));
  const written = new Map(
    (report?.body.systems ?? []).map((s) => [s.id, s.verdict || s.eli5]),
  );
  const verdictOf = (id: string) => written.get(id) ?? summaries.get(id);

  const actions = report?.body.actions ?? [];
  const indexOf = (title: string) => {
    const i = actions.findIndex((a) => a.title === title);
    return i === -1 ? undefined : i;
  };

  /**
   * One asking surface, decided once for the whole page: the Today card takes
   * the answer, every card that would have asked the same thing links to it.
   * `GET /api/ledger` calls the same function, so the question Today advances
   * to after an answer is the one a reload would have shown.
   */
  const plan = homeAskPlan(ledger, today.due, want);
  const askOf = (c: Conclusion) => linkedAsk(ledger, plan, c);

  /**
   * Phase 26 item 6: a card that says a condition is likely or confirmed also
   * says what to do about it. One query for the whole page, and only for the
   * loud cards — a "possible" does not need a to-do list.
   */
  const loudIds = [ledger.spear, ...ledger.conclusions]
    .filter((c) => c != null)
    .filter((c) => c.state === "likely" || c.state === "confirmed")
    .map((c) => c.id);
  const todo = await actionsForAll(userId, [...new Set(loudIds)]);

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

  /**
   * Cards 6-10 of the audit were five bare "Cholesterol, Total 217 mg/dL,
   * off" rows in a line. A run of them collapses to one card per system: the
   * markers stay, as chips that link to their own page, and the five pairs of
   * WHY / NOT RIGHT? stubs become one "…".
   */
  const systemOf = new Map(
    NODES.flatMap((n) =>
      n.kind === "metric" && n.system
        ? [[n.id.slice("metric:".length), n.system] as const]
        : [],
    ),
  );
  const systemName = new Map(SYSTEMS.map((x) => [x.id, x.name]));

  const groupMarkers = (run: Conclusion[]): MarkerGroup[] => {
    const groups = new Map<string, MarkerGroup>();
    for (const c of run) {
      const code = c.id.slice("marker:".length);
      const sys = systemOf.get(code) ?? "other";
      const group = groups.get(sys) ?? {
        id: `markers:${sys}`,
        systemName: systemName.get(sys as never) ?? "Other markers",
        rank: c.rank,
        markers: [],
        inputs: [],
      };
      const m = byCode.get(code);
      const unit = m?.latest.unit ?? m?.unit;
      group.markers.push({
        code,
        name: m?.name ?? code.replace(/_/g, " "),
        value: `${m?.latest.value ?? "?"}${unit ? ` ${unit}` : ""}`,
      });
      group.inputs.push(...c.inputs);
      groups.set(sys, group);
    }
    return [...groups.values()];
  };

  /** The ledger in print order, with each run of marker cards collapsed. */
  const collapse = (list: Conclusion[]): (Conclusion | MarkerGroup)[] => {
    const out: (Conclusion | MarkerGroup)[] = [];
    let run: Conclusion[] = [];
    const flush = () => {
      if (run.length) out.push(...groupMarkers(run));
      run = [];
    };
    for (const c of list) {
      if (c.kind === "marker") run.push(c);
      else {
        flush();
        out.push(c);
      }
    }
    flush();
    return out;
  };

  const card = (c: (typeof rest)[number], isSpear = false) => (
    <ConclusionCard
      key={c.id}
      c={c}
      spear={isSpear}
      verdict={verdictOf(c.id)}
      reportId={report?.id ?? null}
      actionIndex={c.action ? indexOf(c.action.title) : undefined}
      ask={askOf(c)}
      todo={todo[c.id]}
      management={management.get(c.id)}
    />
  );

  const row = (item: Conclusion | MarkerGroup) =>
    "systemName" in item ? (
      <MarkersCard key={item.id} group={item} />
    ) : (
      card(item)
    );

  return (
    <div className="space-y-8">
      <AskLine />

      <TodayCard
        today={today}
        day={day}
        ask={plan.ask}
        askKey={want}
        askOptions={plan.ask ? optionsFor(plan.ask.key) : []}
      />
      <Cockpit ledger={ledger} day={day} />

      <section>
        <SectionHeader title="Systems" href="/graph" linkLabel="Your graph" />
        <SystemsGrid systems={ledger.systems} />
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

      {(rest.length > 0 || findings.length > 0) && (
        <LedgerList className="space-y-2">
          <SectionHeader title="The ledger" />
          {findings.map((f) => (
            <FindingsCard key={f.id} finding={f} />
          ))}
          {collapse(loud).map(row)}
          <ImprovedCard improved={ledger.improved} />
          {collapse(quietTail).map(row)}
        </LedgerList>
      )}

      <QuietLine quiet={ledger.quiet} />

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

      {/* Last child on purpose: it renders a fixed toast, so anywhere else in
          a `space-y-8` stack it would push the card under it down. */}
      <LedgerMotion snapshot={snapshotLedger(ledger)} />
    </div>
  );
}
