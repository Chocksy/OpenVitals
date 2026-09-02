import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb, profileFactHistory, profileFacts } from "@/db";
import { requireUserId } from "@/lib/auth";
import { buildModelInput } from "@/lib/coverage";
import { getBodyDay, getBodyTrends } from "@/lib/body-data";
import { getToday } from "@/lib/daily-data";
import { localDay, shiftDay } from "@/lib/daily";
import { historyLine } from "@/lib/facts";
import { buildLedger } from "@/lib/ledger";
import { SYMPTOM_ITEMS } from "@/lib/symptoms";
import { formatDate } from "@/lib/utils";
import { PillTabs } from "@/components/pill-tabs";
import { BodyDayList, SyncLine } from "@/components/body-day";
import { BodyHistory } from "@/components/body-history";
import { HabitChecklist, QuickNumbers } from "@/components/checkin";
import { DailyLine } from "@/components/daily-line";
import { Feel, type FeelAsk } from "@/components/feel";
import { ConsistencyHeatmap } from "@/components/heatmap";

export const dynamic = "force-dynamic";

/**
 * Body, phase 30b, per `docs/mockups/v4/body.html`.
 *
 * One destination for everything the phone knows and everything you answer:
 * today's numbers with their sources, the check-in, how you feel, and the
 * trends with the history lanes under them. It absorbs `/today`, `/feel`,
 * `/trends` and `/history`, which redirect here with their tab in `?tab=`.
 */
const TABS = [
  { id: "today", label: "Today" },
  { id: "checkin", label: "Check-in" },
  { id: "feel", label: "How you feel" },
  { id: "trends", label: "Trends" },
];

/** `/history` redirects to `?tab=history`, and history lives under Trends. */
const ALIAS: Record<string, string> = { history: "trends" };

const RANGES = [30, 90, 365];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface Params {
  tab?: string;
  d?: string;
  metric?: string;
  range?: string;
}

const href = (params: Params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v));
  return `/body?${q.toString()}`;
};

export default async function BodyPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const userId = await requireUserId();
  const params = await searchParams;
  const asked = ALIAS[params.tab ?? ""] ?? params.tab;
  const tab = TABS.some((t) => t.id === asked) ? asked! : "today";

  const today = localDay();
  const day = params.d && DAY.test(params.d) ? params.d : today;
  // One query for the day list, read twice: once by the meta line beside the
  // tabs, once by the list itself.
  const dayView = tab === "today" ? await getBodyDay(userId, day) : null;

  return (
    <div className="flex flex-col gap-[var(--s21)]">
      <div className="rowh items-baseline">
        <h1 className="c-title">Body</h1>
        <p className="lede">
          Everything the phone knows and everything you answer, on one page.
        </p>
      </div>

      <div className="rowh justify-between">
        <PillTabs
          label="Body"
          active={tab}
          tabs={TABS.map((t) => ({
            ...t,
            href: href({ tab: t.id, d: params.d }),
          }))}
        />
        {dayView && <SyncLine view={dayView} />}
      </div>

      {dayView && <BodyDayList view={dayView} />}
      {tab === "checkin" && (
        <CheckinTab userId={userId} day={day} today={today} />
      )}
      {tab === "feel" && <FeelTab userId={userId} today={today} />}
      {tab === "trends" && <TrendsTab userId={userId} params={params} />}
    </div>
  );
}

/* ── Check-in: habits, numbers, ratings, notes ────────────────────────── */

async function CheckinTab({
  userId,
  day,
  today,
}: {
  userId: string;
  day: string;
  today: string;
}) {
  const view = await getToday(userId, day);
  const arrow = "b b-quiet b-icon";

  return (
    <>
      <div className="rowh justify-between">
        <div className="rowh gap-[var(--s8)]">
          <Link
            href={href({ tab: "checkin", d: shiftDay(day, -1) })}
            className={arrow}
            aria-label="The day before"
          >
            <ChevronLeft className="ic" />
          </Link>
          <span className="t-num">{formatDate(day)}</span>
          {day < today ? (
            <Link
              href={href({ tab: "checkin", d: shiftDay(day, 1) })}
              className={arrow}
              aria-label="The day after"
            >
              <ChevronRight className="ic" />
            </Link>
          ) : (
            <span className={`${arrow} pointer-events-none opacity-30`}>
              <ChevronRight className="ic" />
            </span>
          )}
          {day !== today && (
            <Link href={href({ tab: "checkin" })} className="b b-text b-sm">
              Back to today
            </Link>
          )}
        </div>
        <span className="t-meta">
          It saves as you go, and every row is dated {formatDate(day)}.
        </span>
      </div>
      <div className="grid2">
        <HabitChecklist day={day} habits={view.habits} streak={view.streak} />
        <QuickNumbers key={day} day={day} values={view.values} />
      </div>
    </>
  );
}

/* ── How you feel: every question on one screen ───────────────────────── */

async function FeelTab({ userId, today }: { userId: string; today: string }) {
  const db = getDb();
  const [m, facts, history, ledger] = await Promise.all([
    buildModelInput(userId),
    db.select().from(profileFacts).where(eq(profileFacts.userId, userId)),
    db
      .select()
      .from(profileFactHistory)
      .where(eq(profileFactHistory.userId, userId)),
    buildLedger(userId),
  ]);

  const items = SYMPTOM_ITEMS.map((group) => ({
    ...group,
    questions: group.questions.filter((q) => {
      const gate = q.appliesTo;
      if (!gate) return true;
      if (gate.sex && m.sex !== gate.sex) return false;
      if (gate.minAge != null && (m.age == null || m.age < gate.minAge))
        return false;
      if (gate.maxAge != null && (m.age == null || m.age > gate.maxAge))
        return false;
      return true;
    }),
  })).filter((group) => group.questions.length > 0);

  const keys = new Set(items.flatMap((g) => g.questions.map((q) => q.key)));
  const mine = facts.filter((f) => keys.has(f.key));
  const answers = Object.fromEntries(
    mine.map((f) => [f.key, String(f.value ?? "")]),
  );
  const answeredAt = Object.fromEntries(
    mine
      .filter((f) => f.answeredAt)
      .map((f) => [f.key, f.answeredAt!.toISOString().slice(0, 10)]),
  );

  // "since 2026-03: no; before: yes" under any answer that ever moved.
  const lines: Record<string, string> = {};
  for (const key of keys) {
    const line = historyLine(history.filter((h) => h.key === key));
    if (line) lines[key] = line;
  }

  // What the engine would act on today, straight off the ledger's own asks.
  const asks: Record<string, FeelAsk> = {};
  for (const ask of ledger.asks) {
    if (!keys.has(ask.key)) continue;
    asks[ask.key] = {
      names: ask.moves.map((mv) => mv.name),
      points: Math.round(Math.abs(ask.moves[0]!.to - ask.moves[0]!.from) * 100),
    };
  }

  return (
    <Feel
      items={items}
      answers={answers}
      answeredAt={answeredAt}
      asks={asks}
      history={lines}
      today={today}
    />
  );
}

/* ── Trends: the daily line, the year grid, the history lanes ─────────── */

async function TrendsTab({
  userId,
  params,
}: {
  userId: string;
  params: Params;
}) {
  const range = RANGES.includes(Number(params.range))
    ? Number(params.range)
    : 90;
  const [trends, view] = await Promise.all([
    getBodyTrends(userId, range),
    getToday(userId),
  ]);

  const series =
    trends.series.find((s) => s.id === params.metric) ?? trends.series[0];
  const to = localDay();
  const from = shiftDay(to, -(range - 1));

  return (
    <>
      <div className="rowh justify-between">
        {trends.series.length > 0 && (
          <PillTabs
            label="Which measure"
            active={series?.id ?? ""}
            tabs={trends.series.map((s) => ({
              id: s.id,
              label: s.label,
              href: href({ tab: "trends", metric: s.id, range: String(range) }),
            }))}
          />
        )}
        <PillTabs
          label="How far back"
          active={String(range)}
          tabs={RANGES.map((r) => ({
            id: String(r),
            label: `${r} d`,
            href: href({
              tab: "trends",
              metric: series?.id,
              range: String(r),
            }),
          }))}
        />
      </div>

      {series ? (
        <DailyLine
          series={series}
          draws={trends.draws}
          days={range}
          from={from}
          to={to}
        />
      ) : (
        <div className="panel">
          <p className="cap">
            Nothing has two values in the last {range} days yet. A phone sync or
            a check-in puts the first points on the line.
          </p>
        </div>
      )}

      <div className="sub">
        <h3>Consistency</h3>
        <span>a year of what you did, and what the phone sent</span>
      </div>
      <ConsistencyHeatmap days={view.heat} />

      <BodyHistory userId={userId} />
    </>
  );
}
