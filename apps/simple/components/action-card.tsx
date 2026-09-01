/**
 * One action from a plan. `/plan` passes the report id, which turns on the
 * adopt/dismiss/discuss buttons and the discussion thread; `/brain` renders a
 * plan that was never saved, so it passes none and gets the card alone.
 *
 * Phase 25b: monospace only for the dose, the dates and the numbers. Every
 * marker code the deep half prints goes through `<Term>`.
 */
import type { ReportAction } from "@/db";
import { ActionButtons } from "./plan";
import { Terms } from "./term";
import { Badge, BasisChip, Card, TierChip } from "./ui-kit";

export function ActionCard({
  action,
  index = 0,
  reportId,
  projection,
}: {
  action: ReportAction;
  index?: number;
  reportId?: string;
  /** what this one action alone would do, before it is adopted (phase 19) */
  projection?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="t-title text-[15px]">{action.title}</p>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary">weight {action.weight}</Badge>
          <BasisChip basis={action.basis} />
          <TierChip tier={action.tier} />
        </div>
      </div>

      {action.dose && (
        <p className="t-num mt-2 text-[12px] text-neutral-700">
          {action.dose.amount}
          {action.dose.form ? ` · ${action.dose.form}` : ""} ·{" "}
          {action.dose.schedule}
          {action.dose.duration ? ` · ${action.dose.duration}` : ""}
          {action.dose.ceiling ? ` · ceiling ${action.dose.ceiling}` : ""}
        </p>
      )}

      <p className="t-body mt-2 text-neutral-700">
        <Terms text={action.why} />
      </p>

      {projection && (
        <p className="t-body mt-2 border-l-2 border-accent-500 bg-accent-50 px-3 py-1.5 text-[12px] text-neutral-700">
          <Terms text={projection} />
        </p>
      )}

      <div className="deep mt-3 space-y-2 border-t border-neutral-100 pt-3">
        {action.reasoning && (
          <p className="t-body text-[12px] text-neutral-600">
            <span className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
              Reasoning ·{" "}
            </span>
            <Terms text={action.reasoning} />
          </p>
        )}
        {action.targets.length > 0 && (
          <p className="t-meta text-[12px]">
            Targets:{" "}
            <Terms
              text={action.targets
                .map(
                  (t) =>
                    `${t.code} ${t.direction} → ${t.expect} (measure after ${t.measureAfterWeeks}w)`,
                )
                .join(" · ")}
            />
          </p>
        )}
        {action.timing && (
          <p className="t-meta text-[12px]">Timing: {action.timing}</p>
        )}
        {action.interactions?.length ? (
          <p className="t-meta text-[12px]">
            Interactions:{" "}
            <Terms
              text={action.interactions
                .map((i) => `${i.with} — ${i.rule}`)
                .join(" · ")}
            />
          </p>
        ) : null}
        {action.evidence.length > 0 && (
          <p className="t-meta text-[12px]">
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
          <p className="t-meta text-[12px]">
            Check-ins:{" "}
            {action.followUp
              .map((f) => `day ${f.afterDays}: ${f.ask}`)
              .join(" · ")}
          </p>
        )}
      </div>

      {reportId && (
        <div className="mt-3">
          <ActionButtons
            reportId={reportId}
            actionIndex={index}
            kind={action.kind}
            topic={action.title}
          />
        </div>
      )}

      {action.notes?.length ? (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
          {action.notes.map((n) => (
            <div key={n.at} className="space-y-1">
              <p className="t-num text-[10px] text-neutral-400">
                {n.at.slice(0, 10)}
              </p>
              <p className="t-body text-neutral-500">{n.q}</p>
              <p className="t-body text-neutral-800">{n.a}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
