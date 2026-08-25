import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { FlaskConical, Lightbulb, Plus, Sparkles } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import {
  getDb,
  insights,
  checkins,
  type LifestyleBody,
  type RetestBody,
} from "@/db";
import { getMetricNames } from "@/lib/data";
import { cn, formatDate } from "@/lib/utils";
import { GenerateButton, CheckinButtons } from "@/components/client";

export const dynamic = "force-dynamic";

const priorityStyles: Record<
  string,
  { border: string; dot: string; label: string }
> = {
  high: {
    border: "border-l-[var(--color-health-critical)]",
    dot: "bg-[var(--color-health-critical)]",
    label: "Must test",
  },
  medium: {
    border: "border-l-[var(--color-health-warning)]",
    dot: "bg-[var(--color-health-warning)]",
    label: "Should test",
  },
  low: {
    border: "border-l-neutral-300",
    dot: "bg-neutral-400",
    label: "Nice to have",
  },
};

function Chip({ code, name }: { code: string; name: string }) {
  return (
    <Link
      href={`/m/${code}`}
      className="inline-flex items-center border border-neutral-200 bg-neutral-50 px-2 py-1 font-body text-[11px] font-medium text-neutral-700 hover:border-accent-300 hover:text-neutral-900"
    >
      {name}
    </Link>
  );
}

export default async function InsightsPage() {
  const userId = await requireUserId();
  const db = getDb();
  const [rows, names] = await Promise.all([
    db
      .select()
      .from(insights)
      .where(eq(insights.userId, userId))
      .orderBy(desc(insights.createdAt)),
    getMetricNames(),
  ]);

  const lifestyle = rows.find((r) => r.kind === "lifestyle");
  const retest = rows.find((r) => r.kind === "retest");
  const answers = lifestyle
    ? await db
        .select()
        .from(checkins)
        .where(inArray(checkins.insightId, [lifestyle.id]))
        .orderBy(desc(checkins.createdAt))
    : [];

  // A phase-1 retest row has no `groups`; treat it as "nothing generated yet".
  const retestBody = retest?.body as RetestBody | undefined;
  const plan = retestBody?.groups?.length ? retestBody : undefined;
  const life = lifestyle?.body as LifestyleBody | undefined;
  const nameOf = (code: string) => names.get(code) ?? code.replace(/_/g, " ");
  const totalMetrics =
    (plan?.groups ?? []).reduce((n, g) => n + g.metrics.length, 0) +
    (plan?.optional?.metrics?.length ?? 0);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical className="size-4 text-accent-500" />
              <h1 className="font-display text-[20px] font-medium tracking-[-0.02em]">
                Your Next Lab Panel
              </h1>
              <span className="inline-flex items-center gap-1 bg-accent-50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-500">
                <Sparkles className="size-2.5" />
                AI suggested
              </span>
            </div>
            {plan && (
              <p className="mt-1 font-body text-[13px] text-neutral-500">
                {plan.summary}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {retest?.createdAt && (
              <span className="font-mono text-[10px] text-neutral-400">
                {formatDate(retest.createdAt)}
              </span>
            )}
            <GenerateButton
              kind="retest"
              label={plan ? "Regenerate" : "Plan next bloodwork"}
              variant={plan ? "ghost" : "default"}
            />
          </div>
        </div>

        {!plan ? (
          <div className="card border-dashed p-8 text-center">
            <FlaskConical className="mx-auto mb-3 size-8 text-neutral-300" />
            <p className="font-body text-[13px] text-neutral-500">
              The AI will read your biomarker history and design a focused panel
              for your next blood draw.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-neutral-500">
              <span className="font-semibold tabular-nums text-neutral-700">
                {totalMetrics} biomarkers
              </span>
              <span>{plan.groups.length} groups</span>
              <span>due {plan.dueAt}</span>
              {plan.newSuggestions?.length ? (
                <span>+ {plan.newSuggestions.length} new suggestions</span>
              ) : null}
            </div>

            <div className="space-y-3">
              {plan.groups.map((group) => {
                const style = priorityStyles[group.priority] ?? priorityStyles.low!;
                return (
                  <div
                    key={group.domain}
                    className={cn("card border-l-2 p-4", style.border)}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", style.dot)} />
                        <h3 className="font-display text-[14px] font-semibold">
                          {group.domain}
                        </h3>
                        <span className="font-mono text-[10px] uppercase text-neutral-400">
                          {style.label}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-neutral-400">
                        {group.metrics.length} tests
                      </span>
                    </div>
                    <p className="mb-2 font-body text-[12px] text-neutral-500">
                      {group.reason}
                    </p>
                    {group.rationale && (
                      <div className="mb-3 flex items-start gap-2 border border-accent-100 bg-accent-50/50 px-3 py-2">
                        <Lightbulb className="mt-0.5 size-3 shrink-0 text-accent-400" />
                        <p className="font-body text-[11px] leading-relaxed text-neutral-600">
                          {group.rationale}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {group.metrics.map((code) => (
                        <Chip key={code} code={code} name={nameOf(code)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {plan.optional?.metrics?.length ? (
              <details>
                <summary className="flex cursor-pointer items-center gap-1.5 font-display text-[12px] font-medium text-neutral-500 hover:text-neutral-700">
                  <Plus className="size-3" />
                  Optional add-ons ({plan.optional.metrics.length})
                </summary>
                <div className="card mt-2 border-dashed bg-neutral-50/50 p-4">
                  <p className="mb-3 font-body text-[12px] text-neutral-500">
                    {plan.optional.reason}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.optional.metrics.map((code) => (
                      <Chip key={code} code={code} name={nameOf(code)} />
                    ))}
                  </div>
                </div>
              </details>
            ) : null}

            {plan.newSuggestions?.length ? (
              <details open>
                <summary className="flex cursor-pointer items-center gap-1.5 font-display text-[12px] font-medium text-accent-600 hover:text-accent-700">
                  <Lightbulb className="size-3" />
                  New — consider adding ({plan.newSuggestions.length})
                </summary>
                <div className="card mt-2 border-accent-100 bg-accent-50/30 p-4">
                  <p className="mb-3 font-body text-[11px] text-accent-500">
                    Biomarkers you have never tested that would fill a gap in
                    your data.
                  </p>
                  <div className="space-y-2">
                    {plan.newSuggestions.map((s) => (
                      <div
                        key={s.code}
                        className="flex items-start gap-2 border border-accent-100 bg-white px-3 py-2.5"
                      >
                        <Sparkles className="mt-0.5 size-3 shrink-0 text-accent-400" />
                        <div>
                          <span className="block font-body text-[12px] font-medium text-neutral-800">
                            {s.name}
                          </span>
                          <span className="font-body text-[11px] text-neutral-500">
                            {s.reason}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent-500" />
              <h2 className="font-display text-[20px] font-medium tracking-[-0.02em]">
                Lifestyle Plan
              </h2>
            </div>
            <p className="mt-1 font-body text-[13px] text-neutral-500">
              Trackable changes aimed at the markers that are off.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lifestyle?.createdAt && (
              <span className="font-mono text-[10px] text-neutral-400">
                {formatDate(lifestyle.createdAt)}
              </span>
            )}
            <GenerateButton
              kind="lifestyle"
              label={life ? "Regenerate" : "Generate lifestyle plan"}
              variant={life ? "ghost" : "default"}
            />
          </div>
        </div>

        {!life?.items?.length ? (
          <div className="card border-dashed p-8 text-center font-body text-[13px] text-neutral-500">
            Nothing generated yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {life.items.map((item, i) => (
              <div key={i} className="card p-4">
                <p className="font-display text-[14px] font-medium">
                  {item.text}
                </p>
                <p className="mt-1 font-body text-[12px] text-neutral-500">
                  {item.why}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(item.metricCodes ?? []).map((code) => (
                    <Chip key={code} code={code} name={nameOf(code)} />
                  ))}
                </div>
                <CheckinButtons
                  insightId={lifestyle!.id}
                  itemIndex={i}
                  current={answers.find((a) => a.itemIndex === i)?.answer}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
