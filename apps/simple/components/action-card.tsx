/**
 * One action from a plan. `/plan` passes the report id, which turns on the
 * adopt/dismiss/discuss buttons; `/brain` renders a plan that was never
 * saved, so it passes none and gets the card alone.
 *
 * Phase 30d put it on the design system's ConclusionCard shape and fixed the
 * two things the owner read off Home and Plan alike: the dose prints once,
 * under the title, with every part the title already says taken out (UX note
 * 5, `doseParts`), and the targets print as "aim: TPO antibodies under
 * 100 IU/mL · retest in 24 weeks" instead of the engine's own arrow grammar
 * (UX note 6, `aimOf`).
 */
import type { ReportAction } from "@/db";
import { aimLine, doseParts } from "@/lib/plan-line";
import { ActionButtons } from "./plan";
import { Terms } from "./term";
import { StateWord, Tier } from "./ui-kit";
import { EvidenceChip } from "./evidence-chip";
import { dayLabel } from "@/lib/utils";

export function ActionCard({
  action,
  index = 0,
  reportId,
  projection,
  already,
  aims,
}: {
  action: ReportAction;
  index?: number;
  reportId?: string;
  /**
   * "aim: TPO antibodies under 100 IU/mL · retest in 24 weeks", one per
   * target. `/plan` passes them because it can resolve a marker's real name
   * on the server; the `/brain` console renders this card from a client
   * component, where the lookup is not reachable, so it gets the code.
   */
  aims?: string[];
  /** what this one action alone would do, before it is adopted (phase 19) */
  projection?: string;
  /** it is already on the protocol, and since when (phase 27 addendum) */
  already?: { startedAt: string | null };
}) {
  const dose = action.dose
    ? doseParts(action.title, [
        action.dose.amount,
        action.dose.form,
        action.dose.schedule,
        /* "for 6 months" reads; "for until retest" does not. */
        action.dose.duration
          ? /^\d/.test(action.dose.duration)
            ? `for ${action.dose.duration}`
            : action.dose.duration
          : null,
        action.dose.ceiling ? `ceiling ${action.dose.ceiling}` : null,
      ])
    : null;

  return (
    <div className="conc">
      <div className="conc-top">
        <h3 className="conc-name t-title">{action.title}</h3>
        <Tier tier={action.tier} />
        <EvidenceChip basis={action.basis} />
        <StateWord className="ml-auto">weight {action.weight}</StateWord>
      </div>

      {/* UX note 5: the dose on its own line, once. */}
      {dose && (
        <p className="t-meta t-num text-[length:var(--type-xs)]">{dose}</p>
      )}

      {/* UX note 6: what it should move, as a sentence. */}
      {action.targets.length > 0 && (
        <p className="t-meta text-[length:var(--type-sm)]">
          {(
            aims ??
            action.targets.map((t) =>
              aimLine(
                t.code.replace(/_/g, " "),
                t.expect,
                t.measureAfterWeeks,
              ),
            )
          ).join(" · ")}
        </p>
      )}

      <p className="conc-prose">
        <Terms text={action.why} />
      </p>

      {projection && (
        <p className="t-body text-[length:var(--type-sm)] text-[var(--ink-2)]">
          <Terms text={projection} />
        </p>
      )}

      <details className="disclose">
        <summary>Why this one</summary>
        <div className="inner space-y-2">
          {action.reasoning && (
            <p>
              <Terms text={action.reasoning} />
            </p>
          )}
          {action.timing && <p>Timing: {action.timing}</p>}
          {action.interactions?.length ? (
            <p>
              Interactions:{" "}
              <Terms
                text={action.interactions
                  .map((i) => `${i.with} — ${i.rule}`)
                  .join(" · ")}
              />
            </p>
          ) : null}
          {action.evidence.length > 0 && (
            <p>
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
            <p>
              Check-ins:{" "}
              {action.followUp
                .map((f) => `day ${f.afterDays}: ${f.ask}`)
                .join(" · ")}
            </p>
          )}
        </div>
      </details>

      {reportId && (
        <ActionButtons
          reportId={reportId}
          actionIndex={index}
          kind={action.kind}
          topic={action.title}
          {...(already ? { already } : {})}
        />
      )}

      {action.notes?.length ? (
        <div className="space-y-3 border-t border-[var(--hair)] pt-3">
          {action.notes.map((n) => (
            <div key={n.at} className="space-y-1">
              <p className="t-num text-[length:var(--type-xs)] text-[var(--ink-3)]">
                {dayLabel(n.at, true)}
              </p>
              <p className="t-body text-[length:var(--type-sm)] text-[var(--ink-3)]">
                {n.q}
              </p>
              <p className="t-body text-[length:var(--type-sm)] text-[var(--ink)]">
                {n.a}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
