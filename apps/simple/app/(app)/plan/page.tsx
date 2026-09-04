/**
 * Plan: one page, ten sections.
 *
 * Phase 30d, per `docs/mockups/v4/plan.html`. `/protocol`, `/goals`,
 * `/insights` and `/patterns/[id]` fold in here and redirect; the review
 * queue that was `/review` is "Answer these". The old URLs carry a `?tab=`,
 * and a tab here is a place on the page, not a place that hides the rest:
 * the section the link asked for is printed first and everything else keeps
 * its order. Nothing is hidden behind JavaScript, so `#answer` and
 * `#patterns` land on real anchors.
 *
 * Phase 32a sections 1 and 2 put Today and This month in front of everything
 * else, per `docs/mockups/v4/plan-month.html`, and add Research, per
 * `research.html`. The phone's Today · Month · All tabs are the same rule as
 * every other tab here: three links to three anchors on one page.
 */
import { Fragment } from "react";
import { closeAnsweredQuestions, queueQuestions } from "@/lib/ask";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import {
  getDb,
  insights,
  protocolItems,
  reviewItems,
  type LifestyleBody,
  type WeeklyBody,
} from "@/db";
import { requireUserId } from "@/lib/auth";
import {
  actionsForAll,
  aimOf,
  saysSomething,
  type PlanLine,
} from "@/lib/actions";
import {
  buildModelInput,
  coverage,
  type CoverageRow,
} from "@/lib/coverage";
import { computeGraphState, graphState } from "@/lib/graph-state";
import { matchPatterns } from "@/lib/patterns";
import { asksFromMoves, inlineAsks } from "@/lib/asking";
import { bootstrapProtocol, getGoals, getProtocol } from "@/lib/daily-data";
import { localDay } from "@/lib/daily";
import { listWatch, watchConditions, WATCH_DAYS } from "@/lib/research-watch";
import { topicsBody } from "@/lib/api-contract";
import { TOPIC_DAYS } from "@/lib/topic-watch";
import { getMetricNames } from "@/lib/data";
import { catalogFor } from "@/lib/hkb";
import { nextMoves } from "@/lib/infogain";
import { scoreHypotheses } from "@/lib/hypotheses";
import { displayNameOf, isLoud } from "@/lib/ledger";
import { latestReport } from "@/lib/report";
import { previewLines } from "@/lib/projections";
import { horizonShelf, mentionLine, type HorizonItem } from "@/lib/trends";
import { VECTORS } from "@/lib/vectors";
import { dayLabel, plural } from "@/lib/utils";
import { ReviewItem } from "@/components/client";
import { ActionCard } from "@/components/action-card";
import { AdoptHorizon, PlanShell } from "@/components/plan";
import { PlanDay } from "@/components/plan-day";
import { PlanMonth } from "@/components/plan-month";
import { ResearchCompact, ResearchSection } from "@/components/research-panel";
import { PillTabs } from "@/components/pill-tabs";
import {
  FactRow,
  GoalRow,
  PatternCard,
  ProtocolItemRow,
  TestRow,
} from "@/components/plan-sections";
import { AddProtocolItem } from "@/components/tracker";
import { Terms } from "@/components/term";
import { StateWord, type StateTone } from "@/components/ui-kit";
import { EvidenceChip } from "@/components/evidence-chip";

export const dynamic = "force-dynamic";

const TIER_LABELS = [
  "Tier 0 · interview and home",
  "Tier 1 · annual core",
  "Tier 2 · conditional",
];

const COVERAGE_TONE: Record<string, StateTone> = {
  current: "on",
  stale: "border",
  never: "none",
  "n/a": "none",
};

/** The sections, in the order the page prints them, and their anchors. */
const SECTIONS = [
  ["today", "Today"],
  ["month", "This month"],
  ["first", "Do this first"],
  ["protocol", "Already doing"],
  ["goals", "Goals"],
  ["patterns", "Patterns"],
  ["tests", "Tests to order"],
  ["research", "Research"],
  ["answer", "Answer these"],
  ["earlier", "Earlier plans"],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function Panel({
  id,
  title,
  right,
  children,
}: {
  id: SectionId;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="panel scroll-mt-24">
      <div className="panel-head">
        <h3>{title}</h3>
        {right && <span className="r">{right}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * "Popular right now — labelled, unproven, measurable."
 *
 * Phase 30d, UX note 7: this is also where an action with no dose and no
 * sentence of its own lands. Home will not print "dihydromyricetin ● A · alt
 * down", because that is a name and a glyph; the shelf will, with its grade
 * and its label said out loud, which is the whole point of the shelf.
 */
function HorizonShelf({
  items,
  parked,
}: {
  items: HorizonItem[];
  parked: PlanLine[];
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Popular right now</h3>
        <span className="r">{items.length + parked.length}</span>
      </div>
      <p className="t-meta mb-3 text-[length:var(--type-sm)]">
        Labelled, unproven, measurable. Nothing here moves a conclusion; it is
        offered so it can be tried and judged.
      </p>
      <div className="rowlist">
        {parked.map((line) => (
          <div key={line.id} className="markerrow said">
            <div className="nm">
              <b>{line.title}</b>
              <span>
                no dose and no sentence yet, so it is not on Home
              </span>
            </div>
            <div className="wd">
              <EvidenceChip basis={line.basis} grade={line.grade} />
            </div>
          </div>
        ))}
        {items.map((item) => (
          <div key={item.id} className="grid gap-2 py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <b className="t-body text-[length:var(--type-sm)]">
                {item.name}
              </b>
              <EvidenceChip basis="anecdotal" grade={item.grade} />
              <span className="t-meta text-[length:var(--type-xs)]">
                from {item.sourceKind}
                {/* Phase 31a item 10: two posts about sardines are one row. */}
                {item.mentions > 1 ? ` · ${mentionLine(item.mentions)}` : ""}
              </span>
            </div>
            {item.quote && (
              <p className="t-meta text-[length:var(--type-sm)] italic">
                &ldquo;{item.quote}&rdquo;
              </p>
            )}
            {item.science.length > 0 && (
              <p className="t-meta text-[length:var(--type-sm)]">
                the science inside it:{" "}
                {item.science
                  .map(
                    (s) =>
                      `${s.name} — grade ${s.grade}${
                        s.effect ? `, ${s.effect}` : ""
                      }`,
                  )
                  .join(" · ")}
              </p>
            )}
            <p className="t-meta text-[length:var(--type-sm)]">
              {item.plan ??
                "It names no marker this app measures, so there is nothing to judge it by yet."}
            </p>
            <AdoptHorizon
              interventionId={item.id}
              adopted={item.adopted}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function Coverage({ rows }: { rows: CoverageRow[] }) {
  const tiers = [0, 1, 2] as const;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Coverage</h3>
        <span className="r">what is still dark</span>
      </div>
      <details className="disclose">
        <summary>What we have and what we do not</summary>
        <div className="inner space-y-3">
          {tiers.map((tier) => {
            const group = rows.filter((r) => r.vector.tier === tier);
            if (!group.length) return null;
            return (
              <div key={tier}>
                <p className="t-meta text-[length:var(--type-xs)]">
                  {TIER_LABELS[tier]}
                </p>
                <div className="rowlist">
                  {group.map((r) => (
                    <div
                      key={r.vector.id}
                      className="flex items-center gap-3 py-1"
                    >
                      <span className="t-body flex-1 truncate text-[length:var(--type-sm)]">
                        {r.vector.name}
                      </span>
                      <span className="t-meta hidden text-[length:var(--type-xs)] sm:inline">
                        {r.detail}
                      </span>
                      <StateWord tone={COVERAGE_TONE[r.state]}>
                        {r.state === "never" ? "never measured" : r.state}
                      </StateWord>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}

export default async function PlanPage({
  searchParams,
}: {
  /** `?tab=protocol`: which section the link that got here came for */
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await requireUserId();
  const db = getDb();
  const want = (await searchParams).tab;

  const report = await latestReport(userId);
  if (!report) await queueQuestions(userId);
  /**
   * Phase 31a item 4. "Answer these" printed the family-history question with
   * the answer already on file, because the row was queued once and nothing
   * closed it. `queueQuestions` closes them too, and it only runs before the
   * first report, so the page closes them itself on every load.
   */
  await closeAnsweredQuestions(userId);
  await bootstrapProtocol(userId);

  const [input, open, earlier, protocol, goals, metricNames, papers] =
    await Promise.all([
      buildModelInput(userId),
      db
        .select()
        .from(reviewItems)
        .where(
          and(eq(reviewItems.userId, userId), eq(reviewItems.status, "open")),
        ),
      db
        .select()
        .from(insights)
        .where(eq(insights.userId, userId))
        .orderBy(desc(insights.createdAt)),
      getProtocol(userId),
      getGoals(userId),
      getMetricNames(),
      listWatch(userId),
    ]);

  const weekly = earlier.find((r) => r.kind === "weekly")?.body as
    | WeeklyBody
    | undefined;
  const lifestyle = earlier.find((r) => r.kind === "lifestyle")?.body as
    | LifestyleBody
    | undefined;

  const cov = coverage(input);
  const patterns = matchPatterns(input).filter((p) => p.matched);
  const graph = patterns.length
    ? await graphState(input)
    : {
        activeEdges: [] as ReturnType<typeof computeGraphState>["activeEdges"],
      };
  const body = report?.body;
  const questions = open.filter((i) => i.kind === "profile_question");
  const now = new Date();
  const checkIns = open.filter(
    (i) => i.kind === "check_in" && (i.createdAt ?? now) <= now,
  );
  /**
   * The month's check-in dots. A check-in row is dated by the day it was
   * minted for, so that day is the day it is due; nothing invents a cadence.
   */
  const checkDays = open
    .filter((i) => i.kind === "check_in")
    .map((i) => localDay(i.createdAt ?? now));
  const today = localDay();

  const tier0 = VECTORS.filter((v) => v.tier === 0 && v.fact);
  const answered = cov.filter(
    (r) => r.vector.tier === 0 && r.state === "current",
  ).length;
  const firstTwo = questions.filter((q) =>
    ["sex", "birth_year"].includes(q.subject?.factKey ?? ""),
  );
  const blocked = !input.sex || input.age == null;

  /**
   * Phase 32a section 1. The picker on "Research now" only offers conditions
   * this person's ledger has at possible or louder, which is the same cut the
   * watch itself makes, so the page and the run can never disagree.
   */
  const conditions = blocked ? [] : await watchConditions(userId);

  /** Phase 35 section C: the topics list, under "New for you". */
  const { topics } = await topicsBody(userId);
  const lastRun =
    papers
      .map((p) => p.foundAt?.toISOString().slice(0, 10) ?? "")
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  const catalog = blocked ? [] : await catalogFor(userId);
  const scored = blocked ? [] : scoreHypotheses(input, { catalog });
  const names = new Map(scored.map((h) => [h.id, displayNameOf(h)]));
  const asks = asksFromMoves(
    nextMoves(input, catalog),
    (id) => names.get(id) ?? id,
  );
  const inline = inlineAsks(
    questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      ...(q.subject?.factKey ? { factKey: q.subject.factKey } : {}),
    })),
    asks,
  );

  const onProtocol = protocol.filter((r) => r.active);
  const archived = protocol.filter((r) => !r.active);
  const adoptedTexts = onProtocol.map((r) => r.text);
  const horizon = await horizonShelf(adoptedTexts);

  /**
   * UX note 7: the rows Home refuses to print, gathered here. The same
   * `actionsForAll` Home calls, over the loud conditions, minus everything
   * that says something on its own — which is what Home already showed.
   */
  const loudIds = scored
    .filter((h) => isLoud(h.state))
    .map((h) => h.id)
    .slice(0, 8);
  const todo = loudIds.length ? await actionsForAll(userId, loudIds) : {};
  const seen = new Set<string>();
  const parked = Object.values(todo)
    .flat()
    .filter((l) => !saysSomething(l))
    .filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));

  const alreadyOf = (title: string) => {
    const row = onProtocol.find((r) => r.text.startsWith(title));
    return row ? { startedAt: row.startedAt } : undefined;
  };

  const actions = body?.actions ?? [];
  const indexed = actions.map((action, index) => ({ action, index }));
  const doFirst = indexed.filter((r) => r.action.kind !== "test");
  const tests = indexed.filter((r) => r.action.kind === "test");
  const previews = await previewLines(doFirst.map((r) => r.action.title));

  /**
   * The suggestions the Today column is allowed to print: an action the report
   * proposed that nobody has adopted. Nothing else is ever "suggested" — the
   * column does not write rows of its own.
   */
  const suggested = doFirst
    .filter(({ action }) => !alreadyOf(action.title))
    .map(({ action, index }) => ({
      title: action.title,
      why: action.why,
      index,
    }));

  const nameOf = (code: string) =>
    metricNames.get(code) ?? code.replace(/_/g, " ");
  const openGoals = goals.filter((g) => !(g.achievedAt || g.reached));
  const reached = goals.filter((g) => g.achievedAt || g.reached);
  const ticked = onProtocol.filter((r) => r.strip30.at(-1) === 1).length;
  const above80 = onProtocol.filter((r) => r.adherence30 >= 80).length;
  const askCount = inline.length + checkIns.length;

  const dayName = new Date(`${today}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const panels: Record<SectionId, React.ReactNode> = {
    today: (
      <PlanDay
        key="today"
        day={today}
        dayName={dayName}
        items={onProtocol}
        goals={openGoals.map((g) => ({
          metricCode: g.metricCode,
          metricName: g.metricName,
        }))}
        suggested={suggested}
        reportId={report?.id ?? null}
        nameOf={nameOf}
      />
    ),

    month: (
      <PlanMonth
        key="month"
        today={today}
        items={onProtocol}
        goals={goals}
        checkDays={checkDays}
        nameOf={nameOf}
      />
    ),

    research: (
      <ResearchSection
        key="research"
        rows={papers}
        conditions={conditions}
        lastRun={lastRun}
        cooldownDays={WATCH_DAYS}
        topics={topics}
        topicDays={TOPIC_DAYS}
      />
    ),

    first:
      doFirst.length > 0 && report ? (
        <Panel
          key="first"
          id="first"
          title="Do this first"
          right={plural(doFirst.length, "action")}
        >
          <div className="space-y-3">
            {doFirst.map(({ action, index }) => (
              <ActionCard
                key={`${action.title}-${index}`}
                action={action}
                index={index}
                reportId={report.id}
                aims={action.targets.map((t) => aimOf(t))}
                {...(previews[action.title]
                  ? { projection: previews[action.title] }
                  : {})}
                {...(alreadyOf(action.title)
                  ? { already: alreadyOf(action.title) }
                  : {})}
              />
            ))}
          </div>
        </Panel>
      ) : null,

    protocol: (
      <Panel
        key="protocol"
        id="protocol"
        title="Already doing"
        right={`${plural(onProtocol.length, "item")} · ${above80} above 80 % · ${ticked} ticked today`}
      >
        {onProtocol.length === 0 ? (
          <div className="empty">
            <span className="k">No plan</span>
            <b className="t-title text-[length:var(--type-md)] font-normal">
              Nothing in your protocol yet
            </b>
            <p>
              Adopt an action from &ldquo;Do this first&rdquo;, or add one by
              hand. Every item you add prints the 30 days behind it.
            </p>
          </div>
        ) : (
          <div className="rowlist">
            {onProtocol.map((item) => (
              <ProtocolItemRow
                key={item.id}
                item={{ ...item, startedAt: item.startedAt ?? null }}
                nameOf={nameOf}
              />
            ))}
          </div>
        )}
        <div className="rowh mt-3">
          <AddProtocolItem
            metricNames={[...metricNames].map(([code, name]) => ({
              code,
              name,
            }))}
          />
        </div>
        {archived.length > 0 && (
          <details className="disclose mt-3">
            <summary>{plural(archived.length, "archived item")}</summary>
            <div className="inner">
              <div className="rowlist">
                {archived.map((item) => (
                  <ProtocolItemRow
                    key={item.id}
                    item={{ ...item, startedAt: item.startedAt ?? null }}
                    nameOf={nameOf}
                  />
                ))}
              </div>
            </div>
          </details>
        )}
      </Panel>
    ),

    goals: (
      <Panel
        key="goals"
        id="goals"
        title="Goals"
        right={plural(openGoals.length, "open goal")}
      >
        {goals.length === 0 ? (
          <div className="empty">
            <span className="k">No goals</span>
            <b className="t-title text-[length:var(--type-md)] font-normal">
              Nothing aimed at a number yet
            </b>
            <p>
              A goal is a marker, a band and a date. Open a marker and set one,
              and it appears here with the distance still to close.
            </p>
            <Link href="/blood?tab=markers">Open your markers</Link>
          </div>
        ) : (
          <div className="rowlist">
            {openGoals.map((g) => (
              <GoalRow key={g.id} g={g} />
            ))}
          </div>
        )}
        {reached.length > 0 && (
          <>
            <div className="sub">
              <h3>Reached</h3>
              <span>each one appeared when the retest landed</span>
            </div>
            <div className="rowlist">
              {reached.map((g) => (
                <GoalRow key={g.id} g={g} />
              ))}
            </div>
          </>
        )}
      </Panel>
    ),

    patterns:
      patterns.length > 0 ? (
        <Panel
          key="patterns"
          id="patterns"
          title="Patterns"
          right={plural(patterns.length, "match", "matches")}
        >
          <p className="t-meta mb-3 text-[length:var(--type-sm)]">
            Two or more findings that usually travel together.
          </p>
          <div className="space-y-3">
            {patterns.map((m) => (
              <PatternCard
                key={m.pattern.id}
                match={m}
                {...(body?.patterns?.find((p) => p.id === m.pattern.id)?.verdict
                  ? {
                      verdict: body.patterns.find(
                        (p) => p.id === m.pattern.id,
                      )!.verdict,
                    }
                  : {})}
                edges={graph.activeEdges.filter(
                  (e) => e.when?.pattern === m.pattern.id,
                )}
                input={input}
              />
            ))}
          </div>
        </Panel>
      ) : null,

    tests:
      tests.length > 0 ? (
        <Panel
          key="tests"
          id="tests"
          title="Tests to order"
          right={plural(tests.length, "test")}
        >
          <div className="rowlist">
            {tests.map(({ action, index }) => (
              <TestRow
                key={`${action.title}-${index}`}
                name={action.title}
                why={action.why}
                tier={action.tier}
                basisChip={<EvidenceChip basis={action.basis} />}
              />
            ))}
          </div>
          <div className="rowh mt-3">
            <Link href="/blood?tab=draws" className="b b-quiet b-sm">
              Plan a draw
            </Link>
          </div>
        </Panel>
      ) : null,

    answer: (
      <Panel
        key="answer"
        id="answer"
        title="Answer these"
        right={askCount || "nothing due"}
      >
        {askCount === 0 ? (
          <div className="empty">
            <span className="k">Nothing due</span>
            <b className="t-title text-[length:var(--type-md)] font-normal">
              No question worth answering
            </b>
            <p>
              The engine only asks when the answer would move a number. It has
              nothing to ask right now, and that is the real state.
            </p>
            <Link href="/">See what it already knows</Link>
          </div>
        ) : (
          <div className="rowlist">
            {inline.map((q) => (
              <ReviewItem
                key={q.id}
                id={q.id}
                question={q.question}
                options={q.options}
                {...(q.detail ? { detail: q.detail } : {})}
              />
            ))}
            {checkIns.map((c) => (
              <ReviewItem
                key={c.id}
                id={c.id}
                question={c.question}
                options={c.options}
                {...(c.subject?.detail ? { detail: c.subject.detail } : {})}
              />
            ))}
          </div>
        )}
      </Panel>
    ),

    earlier:
      weekly || lifestyle ? (
        <Panel
          key="earlier"
          id="earlier"
          title="Earlier plans"
          right="weekly review"
        >
          <div className="rowlist">
            {weekly && (
              <FactRow
                name="Last weekly review"
                detail={weekly.summary}
                value={String(weekly.adherencePct)}
                unit="%"
                word={weekly.adherencePct >= 80 ? "held" : "partial"}
                tone={weekly.adherencePct >= 80 ? "on" : "border"}
              />
            )}
            {(weekly?.nextWeek ?? []).map((line) => (
              <p
                key={line}
                className="t-body py-1 text-[length:var(--type-sm)] text-[var(--ink-2)]"
              >
                {line}
              </p>
            ))}
            {lifestyle?.items?.map((item, i) => (
              <p
                key={i}
                className="t-body py-1 text-[length:var(--type-sm)] text-[var(--ink-2)]"
              >
                <span className="text-[var(--ink)]">{item.text}</span>{" "}
                {item.why}
              </p>
            ))}
          </div>
        </Panel>
      ) : null,
  };

  const order: SectionId[] = SECTIONS.map(([id]) => id);
  if (want && order.includes(want as SectionId))
    order.sort(
      (a, b) => Number(b === want) - Number(a === want),
    );

  return (
    <PlanShell
      date={
        report?.createdAt
          ? dayLabel(report.createdAt.toISOString().slice(0, 10), true)
          : null
      }
    >
      <div className="panel">
        <div className="rowh">
          <span className="t-meta text-[length:var(--type-sm)]">
            Sex{" "}
            <span className="text-[var(--ink)]">{input.sex ?? "not said"}</span>
          </span>
          <span className="t-meta text-[length:var(--type-sm)]">
            Age{" "}
            <span className="t-num text-[var(--ink)]">
              {input.age ?? "not said"}
            </span>
          </span>
          <span className="t-meta text-[length:var(--type-sm)]">
            <span className="t-num text-[var(--ink)]">{answered}</span> of{" "}
            <span className="t-num text-[var(--ink)]">{tier0.length}</span>{" "}
            questions answered
          </span>
          <span className="grow" />
          <nav className="rowh" aria-label="Jump to a section">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="b b-text b-sm">
                {label}
              </a>
            ))}
          </nav>
        </div>

        {blocked && (
          <div className="mt-3 space-y-2">
            <p className="t-body text-[length:var(--type-sm)]">
              Answer these two first; the plan depends on them.
            </p>
            {firstTwo.map((q) => (
              <ReviewItem
                key={q.id}
                id={q.id}
                question={q.question}
                options={q.options}
              />
            ))}
          </div>
        )}
      </div>

      {!blocked && (
        <>
          {/**
           * `plan-month.html` section 06: on the phone Today is the screen,
           * Month is one tab away and the full plan is two. A tab is a place
           * on the page, so all three are anchors and nothing is hidden.
           */}
          <div className="sm:hidden">
            <PillTabs
              label="Plan"
              active={want === "month" ? "month" : want === "all" ? "all" : "today"}
              tabs={[
                { id: "today", label: "Today", href: "#today" },
                { id: "month", label: "Month", href: "#month" },
                { id: "all", label: "All", href: "#first" },
              ]}
            />
          </div>

          {body && (
            <div className="panel">
              <div className="panel-head">
                <h3>What this means</h3>
              </div>
              <p className="conc-prose text-[length:var(--type-md)]">
                <Terms text={body.eli5} />
              </p>
              <details className="disclose mt-3 border-t border-[var(--hair)] pt-3">
                <summary>The longer version</summary>
                <ul className="inner space-y-1">
                  {body.summary.map((line) => (
                    <li
                      key={line}
                      className="t-body text-[length:var(--type-sm)] text-[var(--ink-2)]"
                    >
                      <Terms text={line} />
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {order.map((id) => (
            <Fragment key={id}>
              {panels[id]}
              {/* the compact three-line panel, only when a paper moved
                  something; the empty state stays on the Research tab */}
              {id === "first" && <ResearchCompact rows={papers} />}
            </Fragment>
          ))}

          {!report && (
            <div className="empty">
              <span className="k">No plan</span>
              <b className="t-title text-[length:var(--type-md)] font-normal">
                Nothing to do first
              </b>
              <p>
                Press Generate and the engine writes one from what it already
                knows. Everything else on this page works without it.
              </p>
            </div>
          )}

          {(horizon.length > 0 || parked.length > 0) && (
            <HorizonShelf items={horizon} parked={parked} />
          )}

          <Coverage rows={cov} />
        </>
      )}
    </PlanShell>
  );
}
