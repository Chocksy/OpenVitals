/**
 * One action from a plan. `/plan` passes the report id, which turns on the
 * adopt/dismiss/discuss buttons and the discussion thread; `/brain` renders a
 * plan that was never saved, so it passes none and gets the card alone.
 */
import type { ReportAction } from "@/db";
import { ActionButtons } from "./plan";
import { Badge, BasisChip, Card, TierChip } from "./ui-kit";

export function ActionCard({
  action,
  index = 0,
  reportId,
}: {
  action: ReportAction;
  index?: number;
  reportId?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-display text-[15px] font-medium">{action.title}</p>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary">weight {action.weight}</Badge>
          <BasisChip basis={action.basis} />
          <TierChip tier={action.tier} />
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

      {reportId && (
        <div className="mt-3">
          <ActionButtons
            reportId={reportId}
            actionIndex={index}
            kind={action.kind}
          />
        </div>
      )}

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
