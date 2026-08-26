import { and, eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { getDb, reviewItems, type ReportAction } from "@/db";
import { requireUserId } from "@/lib/auth";
import {
  buildModelInput,
  coverage,
  queueProfileQuestions,
  type CoverageRow,
} from "@/lib/coverage";
import { latestReport } from "@/lib/report";
import { VECTORS } from "@/lib/vectors";
import { ReviewItem } from "@/components/client";
import { ActionButtons, PlanShell } from "@/components/plan";
import { Badge, Card } from "@/components/ui-kit";

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

/** science solid, opinion accent, anecdotal dotted. Nothing else hedges. */
const BASIS_CLASS: Record<string, string> = {
  science: "border-neutral-900 text-neutral-900",
  opinion: "border-accent-500 text-accent-600",
  anecdotal: "border-dashed border-neutral-400 text-neutral-500",
};

function BasisChip({ basis }: { basis: string }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] ${BASIS_CLASS[basis] ?? BASIS_CLASS.science}`}
    >
      {basis}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
      {children}
    </h2>
  );
}

function ActionCard({
  action,
  index,
  reportId,
}: {
  action: ReportAction;
  index: number;
  reportId: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-display text-[15px] font-medium">{action.title}</p>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary">weight {action.weight}</Badge>
          <BasisChip basis={action.basis} />
        </div>
      </div>

      {action.dose && (
        <p className="mt-2 font-mono text-[12px] tabular-nums text-neutral-700">
          {action.dose.amount}
          {action.dose.form ? ` · ${action.dose.form}` : ""} ·{" "}
          {action.dose.schedule}
          {action.dose.duration ? ` · ${action.dose.duration}` : ""}
          {action.dose.ceiling ? ` · ceiling ${action.dose.ceiling}` : ""}
        </p>
      )}

      <p className="mt-2 font-body text-[13px] text-neutral-700">
        {action.why}
      </p>

      <div className="deep mt-3 space-y-2 border-t border-neutral-100 pt-3">
        {action.reasoning && (
          <p className="font-body text-[12px] text-neutral-600">
            <span className="font-mono text-[10px] uppercase text-neutral-400">
              Reasoning ·{" "}
            </span>
            {action.reasoning}
          </p>
        )}
        {action.targets.length > 0 && (
          <p className="font-mono text-[11px] text-neutral-500">
            Targets:{" "}
            {action.targets
              .map(
                (t) =>
                  `${t.code} ${t.direction} → ${t.expect} (measure after ${t.measureAfterWeeks}w)`,
              )
              .join(" · ")}
          </p>
        )}
        {action.timing && (
          <p className="font-mono text-[11px] text-neutral-500">
            Timing: {action.timing}
          </p>
        )}
        {action.interactions?.length ? (
          <p className="font-mono text-[11px] text-neutral-500">
            Interactions:{" "}
            {action.interactions
              .map((i) => `${i.with} — ${i.rule}`)
              .join(" · ")}
          </p>
        ) : null}
        {action.evidence.length > 0 && (
          <p className="font-mono text-[11px] text-neutral-500">
            Evidence:{" "}
            {action.evidence
              .map(
                (e) =>
                  `${e.kind}: ${e.title}${e.source ? ` (${e.source})` : ""}`,
              )
              .join(" · ")}
          </p>
        )}
        {action.followUp.length > 0 && (
          <p className="font-mono text-[11px] text-neutral-500">
            Check-ins:{" "}
            {action.followUp
              .map((f) => `day ${f.afterDays}: ${f.ask}`)
              .join(" · ")}
          </p>
        )}
      </div>

      <div className="mt-3">
        <ActionButtons
          reportId={reportId}
          actionIndex={index}
          kind={action.kind}
        />
      </div>

      {action.notes?.length ? (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
          {action.notes.map((n) => (
            <div key={n.at} className="space-y-1">
              <p className="font-mono text-[10px] tabular-nums text-neutral-400">
                {n.at.slice(0, 10)}
              </p>
              <p className="font-body text-[13px] text-neutral-500">{n.q}</p>
              <p className="font-body text-[13px] leading-relaxed text-neutral-800">
                {n.a}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function CoverageSection({ rows }: { rows: CoverageRow[] }) {
  const tiers = [0, 1, 2] as const;
  return (
    <section>
      <Label>Coverage · what we have and what we do not</Label>
      <div className="space-y-4">
        {tiers.map((tier) => {
          const group = rows.filter((r) => r.vector.tier === tier);
          if (!group.length) return null;
          return (
            <div key={tier}>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
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
                    <span className="hidden font-mono text-[10px] text-neutral-400 sm:inline">
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
    </section>
  );
}

export default async function PlanPage() {
  const userId = await requireUserId();
  const db = getDb();

  const report = await latestReport(userId);
  if (!report) await queueProfileQuestions(userId);

  const [input, open] = await Promise.all([
    buildModelInput(userId),
    db
      .select()
      .from(reviewItems)
      .where(
        and(eq(reviewItems.userId, userId), eq(reviewItems.status, "open")),
      ),
  ]);

  const cov = coverage(input);
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

  const actions = body?.actions ?? [];

  return (
    <PlanShell date={report?.createdAt?.toISOString().slice(0, 10) ?? null}>
      {/* 2. Profile strip */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-neutral-400">
            Sex{" "}
            <span className="text-[13px] normal-case text-neutral-800">
              {input.sex ?? "—"}
            </span>
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-neutral-400">
            Age{" "}
            <span className="text-[13px] tabular-nums text-neutral-800">
              {input.age ?? "—"}
            </span>
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-neutral-400">
            {answered} of {tier0.length} facts
          </span>
        </div>

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
          {/* 3. ELI5 in simple, the summary lines in deep */}
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
          {actions.length > 0 && report && (
            <section>
              <Label>Do this first · {actions.length}</Label>
              <div className="space-y-2">
                {actions.map((a, i) => (
                  <ActionCard
                    key={`${a.title}-${i}`}
                    action={a}
                    index={i}
                    reportId={report.id}
                  />
                ))}
              </div>
            </section>
          )}

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

          {/* 5. Coverage */}
          <CoverageSection rows={cov} />

          {/* 6. Questions */}
          {questions.length > 0 && (
            <section>
              <Label>Questions · {questions.length}</Label>
              <div className="space-y-2">
                {questions.map((q) => (
                  <ReviewItem
                    key={q.id}
                    id={q.id}
                    question={q.question}
                    options={q.options}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 7. Check-ins due */}
          {checkIns.length > 0 && (
            <section>
              <Label>Check-ins due · {checkIns.length}</Label>
              <div className="space-y-2">
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
        </>
      )}
    </PlanShell>
  );
}
