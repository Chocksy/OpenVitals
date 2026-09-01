import { queueQuestions } from "@/lib/ask";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Check, CheckCircle2, Network, Stethoscope } from "lucide-react";
import {
  getDb,
  insights,
  protocolItems,
  reviewItems,
  type LifestyleBody,
  type ReportAction,
  type WeeklyBody,
} from "@/db";
import { requireUserId } from "@/lib/auth";
import {
  buildModelInput,
  coverage,
  type CoverageRow,
  type ModelInput,
} from "@/lib/coverage";
import { computeGraphState, graphState } from "@/lib/graph-state";
import { matchPatterns, type PatternMatch } from "@/lib/patterns";
import { asksFromMoves, inlineAsks } from "@/lib/asking";
import { catalogFor } from "@/lib/hkb";
import { nextMoves } from "@/lib/infogain";
import { scoreHypotheses } from "@/lib/hypotheses";
import { displayNameOf } from "@/lib/ledger";
import { latestReport } from "@/lib/report";
import { VECTORS } from "@/lib/vectors";
import { ReviewItem } from "@/components/client";
import { ActionCard } from "@/components/action-card";
import { previewLines } from "@/lib/projections";
import { horizonShelf, type HorizonItem } from "@/lib/trends";
import { AdoptHorizon, PlanShell } from "@/components/plan";
import { Terms } from "@/components/term";
import { Badge, BasisChip, Card, TierChip } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

const TIER_LABELS = [
  "Tier 0 · interview and home",
  "Tier 1 · annual core",
  "Tier 2 · conditional",
];

const STATE_BADGE = {
  current: "normal",
  stale: "warning",
  never: "critical",
  "n/a": "secondary",
} as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="t-meta mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
      {children}
    </h2>
  );
}

/**
 * Rule-driven tests are the floor of the plan, not the plan: one compact row
 * each, no adopt or dismiss, and a single link to the retest planner.
 */
function TestList({
  rows,
}: {
  rows: { action: ReportAction; index: number }[];
}) {
  return (
    <div className="card divide-y divide-neutral-100">
      {rows.map(({ action, index }) => (
        <div key={`${action.title}-${index}`} className="px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex-1 font-body text-[13px] text-neutral-800">
              {action.title}
            </p>
            <span className="flex items-center gap-1.5">
              <BasisChip basis={action.basis} />
              <TierChip tier={action.tier} />
            </span>
          </div>
          <p className="deep mt-1 font-body text-[12px] text-neutral-500">
            {action.why}
          </p>
        </div>
      ))}
      <div className="px-4 py-3">
        <Link
          href="/insights"
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-neutral-200 bg-neutral-0 px-3 font-display text-[12px] tracking-[0.04em] text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50"
        >
          <Stethoscope className="size-3.5" /> Plan retest
        </Link>
      </div>
    </div>
  );
}

function CoverageSection({ rows }: { rows: CoverageRow[] }) {
  const tiers = [0, 1, 2] as const;
  return (
    <details className="card p-4">
      <summary className="hit-40 t-meta cursor-pointer text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400 hover:text-neutral-600">
        What we have and what we do not
      </summary>
      <div className="mt-3 space-y-4">
        {tiers.map((tier) => {
          const group = rows.filter((r) => r.vector.tier === tier);
          if (!group.length) return null;
          return (
            <div key={tier}>
              <p className="t-meta mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
                {TIER_LABELS[tier]}
              </p>
              <div className="card divide-y divide-neutral-100">
                {group.map((r) => (
                  <div
                    key={r.vector.id}
                    className={`flex items-center gap-3 px-4 py-2 ${
                      r.state === "n/a" ? "deep text-neutral-400" : ""
                    }`}
                  >
                    <span className="flex-1 truncate font-body text-[13px]">
                      {r.vector.name}
                    </span>
                    <span className="t-meta hidden text-[11px] sm:inline">
                      {r.detail}
                    </span>
                    <Badge variant={STATE_BADGE[r.state]}>{r.state}</Badge>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/**
 * ponytail: an escalation counts as done when a reading whose code is named in
 * the suggestion arrived after the plan was written. No new table for "when
 * did this pattern first match".
 */
function escalationDone(
  suggest: string,
  input: ModelInput,
  since: string,
): boolean {
  const text = suggest.toLowerCase();
  return Object.entries(input.latest).some(
    ([code, row]) =>
      (text.includes(code.replace(/_/g, " ")) || text.includes(code)) &&
      row.date > since,
  );
}

const CONFIDENCE_BADGE = {
  established: "normal",
  probable: "info",
  speculative: "secondary",
} as const;

function PatternCard({
  match,
  verdict,
  edges,
  input,
  since,
}: {
  match: PatternMatch;
  verdict?: string;
  edges: ReturnType<typeof computeGraphState>["activeEdges"];
  input: ModelInput;
  since: string;
}) {
  const { pattern, stage, reasons } = match;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link
          href={`/patterns/${pattern.id}`}
          className="font-display text-[15px] font-medium hover:underline"
        >
          {pattern.name}
        </Link>
        {stage && <Badge variant="warning">{stage}</Badge>}
      </div>

      <p className="t-body mt-2 text-neutral-700">
        <Terms text={pattern.summary} />
      </p>
      {verdict && (
        <p className="t-body mt-2 text-neutral-800">
          <Terms text={verdict} />
        </p>
      )}

      {/* "NOT YET" was a status for an admin. What a reader wants to know is
          which test would settle it, so the list says that once, at the top. */}
      <p className="t-meta mt-3 text-[12px]">
        {pattern.effects.escalations.length === 1
          ? "Test that would confirm it"
          : "Tests that would confirm it"}
      </p>
      <ul className="mt-1 space-y-1">
        {pattern.effects.escalations.map((e) => {
          const done = escalationDone(e.suggest, input, since);
          return (
            <li key={e.id} className="t-body flex items-start gap-2">
              <span className="mt-[3px] size-3.5 shrink-0 text-[var(--color-health-normal)]">
                {done ? <Check className="size-3.5" /> : null}
              </span>
              <span className="flex-1">
                <Terms text={e.suggest} />
                {done && <span className="t-meta text-[12px]"> · done</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        <Link
          href={`/patterns/${pattern.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-neutral-200 bg-neutral-0 px-3 font-display text-[12px] tracking-[0.04em] text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50"
        >
          <Network className="size-3.5" /> See how this connects
        </Link>
      </div>

      <div className="deep mt-3 space-y-2 border-t border-neutral-100 pt-3">
        <p className="t-body text-[12px] text-neutral-600">
          <span className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            Why this matched ·{" "}
          </span>
          {reasons.join("; ")}
        </p>
        <p className="t-body text-[12px] text-neutral-600">
          <span className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            Contested ·{" "}
          </span>
          {pattern.controversy}
        </p>
        <p className="t-body text-[12px] text-neutral-600">
          <span className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            Management ·{" "}
          </span>
          {pattern.management}
        </p>
        {edges.length > 0 && (
          <div className="space-y-1">
            {edges.map((e) => (
              <div key={e.id} className="flex items-start gap-2">
                <Badge variant={CONFIDENCE_BADGE[e.confidence]}>
                  {e.confidence}
                </Badge>
                <span className="t-body flex-1 text-[12px] text-neutral-600">
                  <Terms text={e.mechanism} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * "Popular right now — labelled, unproven, measurable."
 *
 * Everything the trends inbox filed, with its labels said out loud: anecdotal,
 * grade E, where it came from. When the marker it names already has graded
 * science behind it, that is printed next to it, because those are two
 * different claims and the shelf must never let them blur.
 */
function HorizonShelf({ items }: { items: HorizonItem[] }) {
  return (
    <section>
      <Label>Popular right now · {items.length}</Label>
      <p className="mb-2 font-body text-[12px] text-neutral-500">
        Labelled, unproven, measurable. Nothing here moves a conclusion; it is
        offered so it can be tried and judged.
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="flex-1 font-body text-[14px] text-neutral-800">
                {item.name}
              </p>
              <span className="flex flex-wrap items-center gap-1.5">
                <BasisChip basis="anecdotal" />
                <Badge variant="secondary">{item.grade}</Badge>
                <span className="t-meta text-[10px] font-bold uppercase tracking-[0.04em] text-neutral-400">
                  from {item.sourceKind}
                </span>
              </span>
            </div>
            {item.quote && (
              <p className="mt-1 border-l-2 border-neutral-200 pl-2 font-body text-[12px] italic text-neutral-500">
                “{item.quote}”
              </p>
            )}
            {item.science.length > 0 && (
              <p className="mt-2 font-body text-[12px] text-neutral-600">
                the science inside it:{" "}
                {item.science
                  .map(
                    (s) =>
                      `${s.name} — grade ${s.grade}${
                        s.effect ? `, ${s.effect}` : ""
                      } for ${s.outcomeFeatureId?.replace(/^metric:/, "") ?? "it"}`,
                  )
                  .join(" · ")}
              </p>
            )}
            <p className="mt-1 font-body text-[12px] text-neutral-600">
              {item.plan ??
                "It names no marker this app measures, so there is nothing to judge it by yet."}
            </p>
            <div className="mt-3">
              <AdoptHorizon interventionId={item.id} adopted={item.adopted} />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default async function PlanPage() {
  const userId = await requireUserId();
  const db = getDb();

  const report = await latestReport(userId);
  if (!report) await queueQuestions(userId);

  const [input, open, earlier] = await Promise.all([
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

  const tier0 = VECTORS.filter((v) => v.tier === 0 && v.fact);
  const answered = cov.filter(
    (r) => r.vector.tier === 0 && r.state === "current",
  ).length;
  const firstTwo = questions.filter((q) =>
    ["sex", "birth_year"].includes(q.subject?.factKey ?? ""),
  );
  const blocked = !input.sex || input.age == null;

  /**
   * The engine's own questions, as lines. The input for them lives in the
   * Today card on Home and nowhere else (phase 24a), so this section prints
   * what each one would move and links there.
   */
  const catalog = blocked ? [] : await catalogFor(userId);
  const names = new Map(
    scoreHypotheses(input, { catalog }).map((h) => [h.id, displayNameOf(h)]),
  );
  const asks = asksFromMoves(
    nextMoves(input, catalog),
    (id) => names.get(id) ?? id,
  );
  /**
   * Phase 26 item 7: Plan answers its own questions. Each row says what the
   * answer would move; the input is right there, and the page re-renders
   * around it. Home's Today card is still the only place Home asks.
   */
  const inline = inlineAsks(
    questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      ...(q.subject?.factKey ? { factKey: q.subject.factKey } : {}),
    })),
    asks,
  );

  // The trends inbox, with what this person has already adopted marked off.
  const onProtocol = await db
    .select({ text: protocolItems.text, startedAt: protocolItems.startedAt })
    .from(protocolItems)
    .where(
      and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
    );
  const adoptedTexts = onProtocol.map((r) => r.text);
  const horizon = await horizonShelf(adoptedTexts);

  /**
   * Phase 27 addendum item 3. An action this person already does is not
   * something to add: `lib/ledger.ts` joins the plan to the protocol by "the
   * item's text starts with the action's title", and the same join answers it
   * here, so the card says "you're already doing this" and the report writer
   * sees it as adopted.
   */
  const alreadyOf = (title: string) => {
    const row = onProtocol.find((r) => r.text.startsWith(title));
    return row ? { startedAt: row.startedAt } : undefined;
  };

  const actions = body?.actions ?? [];
  const indexed = actions.map((action, index) => ({ action, index }));
  const doFirst = indexed.filter((r) => r.action.kind !== "test");
  const tests = indexed.filter((r) => r.action.kind === "test");
  // What each action would do on its own, shown before it is adopted.
  const previews = await previewLines(doFirst.map((r) => r.action.title));

  return (
    <PlanShell date={report?.createdAt?.toISOString().slice(0, 10) ?? null}>
      {/* 2. Profile strip */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="t-meta text-[12px]">
            Sex <span className="text-[13px] text-neutral-800">{input.sex ?? "—"}</span>
          </span>
          <span className="t-meta text-[12px]">
            Age{" "}
            <span className="t-num text-[13px] text-neutral-800">
              {input.age ?? "—"}
            </span>
          </span>
          <span className="t-meta text-[12px]">
            {answered} of {tier0.length} questions answered
          </span>
        </div>

        {patterns.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
            <span className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
              Patterns
            </span>
            {patterns.map((m) => (
              <Link
                key={m.pattern.id}
                href={`/patterns/${m.pattern.id}`}
                className="inline-flex items-center gap-1.5 border border-neutral-200 bg-neutral-50 px-2.5 py-1 font-body text-[12px] text-neutral-700 hover:border-neutral-900 hover:text-neutral-900"
              >
                {m.pattern.name}
                {m.stage && <Badge variant="warning">{m.stage}</Badge>}
              </Link>
            ))}
          </div>
        )}

        {blocked && (
          <div className="mt-3 space-y-2">
            <p className="font-body text-[13px] text-neutral-700">
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
      </Card>

      {!blocked && (
        <>
          {/* 3. Anything waiting for an answer, before anything to read.
              Questions at the bottom of a long page are questions nobody
              answers. */}
          {inline.length + checkIns.length > 0 && (
            <section>
              <Label>
                Answer these first · {inline.length + checkIns.length}
              </Label>
              <div className="space-y-2">
                {inline.map((q) => (
                  <ReviewItem
                    key={q.id}
                    id={q.id}
                    question={q.question}
                    options={q.options}
                    detail={q.detail}
                  />
                ))}
                {checkIns.map((c) => (
                  <ReviewItem
                    key={c.id}
                    id={c.id}
                    question={c.question}
                    options={c.options}
                    detail={c.subject?.detail}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 4. ELI5 in simple, the summary lines in deep */}
          {body && (
            <section>
              <Label>What this means</Label>
              <Card className="p-4">
                <p className="font-body text-[15px] leading-relaxed text-neutral-800">
                  {body.eli5}
                </p>
                <ul className="deep mt-3 space-y-1 border-t border-neutral-100 pt-3">
                  {body.summary.map((line) => (
                    <li
                      key={line}
                      className="font-body text-[13px] text-neutral-600"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {/* 4. Do this first */}
          {patterns.length > 0 && (
            <section>
              <Label>Patterns · {patterns.length}</Label>
              <p className="t-meta mb-2 text-[12px]">
                Two or more findings that usually travel together.
              </p>
              <div className="space-y-2">
                {patterns.map((m) => (
                  <PatternCard
                    key={m.pattern.id}
                    match={m}
                    verdict={
                      body?.patterns?.find((p) => p.id === m.pattern.id)
                        ?.verdict
                    }
                    edges={graph.activeEdges.filter(
                      (e) => e.when?.pattern === m.pattern.id,
                    )}
                    input={input}
                    since={
                      report?.createdAt?.toISOString().slice(0, 10) ??
                      input.today
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {doFirst.length > 0 && report && (
            <section>
              <Label>Do this first · {doFirst.length}</Label>
              <div className="space-y-2">
                {doFirst.map(({ action, index }) => (
                  <ActionCard
                    key={`${action.title}-${index}`}
                    action={action}
                    index={index}
                    reportId={report.id}
                    projection={previews[action.title]}
                    {...(alreadyOf(action.title)
                      ? { already: alreadyOf(action.title) }
                      : {})}
                  />
                ))}
              </div>
            </section>
          )}

          {tests.length > 0 && (
            <section>
              <Label>Tests to order · {tests.length}</Label>
              <TestList rows={tests} />
            </section>
          )}

          {horizon.length > 0 && <HorizonShelf items={horizon} />}

          {!report && (
            <Card className="border-dashed p-10 text-center">
              <CheckCircle2 className="mx-auto mb-3 size-8 text-neutral-300" />
              <p className="font-display text-[15px] font-medium">
                No plan yet
              </p>
              <p className="mt-1 font-body text-[13px] text-neutral-500">
                Press Generate. Everything below already works without it.
              </p>
            </Card>
          )}

          {/* 7. The older, narrower plans, out of the way. */}
          {(weekly || lifestyle) && (
            <details className="card p-4">
              <summary className="hit-40 t-meta cursor-pointer text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400 hover:text-neutral-600">
                Earlier plans
              </summary>
              <div className="mt-3 space-y-4">
                {weekly && (
                  <div>
                    <p className="t-meta mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
                      Weekly review · {weekly.adherencePct}% adherence
                    </p>
                    <p className="font-body text-[13px] text-neutral-700">
                      {weekly.summary}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {(weekly.nextWeek ?? []).map((line) => (
                        <li
                          key={line}
                          className="font-body text-[12px] text-neutral-600"
                        >
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {lifestyle?.items?.length ? (
                  <div>
                    <p className="t-meta mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
                      Lifestyle plan
                    </p>
                    <ul className="space-y-1.5">
                      {lifestyle.items.map((item, i) => (
                        <li key={i} className="font-body text-[12px]">
                          <span className="text-neutral-800">{item.text}</span>{" "}
                          <span className="text-neutral-500">{item.why}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Link
                  href="/insights"
                  className="inline-flex h-8 items-center rounded-sm border border-neutral-200 bg-neutral-0 px-3 font-display text-[12px] tracking-[0.04em] text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50"
                >
                  Open the old insights page
                </Link>
              </div>
            </details>
          )}

          {/* 8. Coverage */}
          <CoverageSection rows={cov} />
        </>
      )}
    </PlanShell>
  );
}
