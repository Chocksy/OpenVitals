/**
 * The rows Plan is built out of, phase 30d, from `docs/mockups/v4/plan.html`
 * and `system.html` section 08.
 *
 * `/plan` absorbed `/protocol`, `/goals`, `/insights` and `/patterns/[id]`,
 * so the four pages' content became four row shapes on one page: the
 * protocol row with its 30-cell adherence strip, the goal row with its
 * progress bar, the pattern as a `.conc` card with the whole pattern page
 * behind one disclosure, and the marker row the coverage and earlier-plans
 * panels share.
 *
 * Server components: every one of them is markup over numbers the page
 * already fetched. The writes live in `components/tracker.tsx` and
 * `components/client.tsx`.
 */
import Link from "next/link";
import type { GoalView } from "@/lib/daily-data";
import type { ModelInput } from "@/lib/coverage";
import type { GraphEdge } from "@/lib/graph";
import { NODES } from "@/lib/graph";
import type { PatternMatch } from "@/lib/patterns";
import { formatRange } from "@/lib/status";
import { dayLabel, plural } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ArchiveButton } from "./tracker";
import { Terms } from "./term";
import { StateWord, Tier, type StateTone } from "./ui-kit";

const NAMES = new Map(NODES.map((n) => [n.id, n.name]));

const CONFIDENCE_TONE: Record<string, StateTone> = {
  established: "on",
  probable: "none",
  speculative: "none",
};

/* ── the protocol row ────────────────────────────────────────────────── */

export interface ProtocolRow {
  id: string;
  text: string;
  why: string | null;
  cadence: string;
  active: boolean;
  startedAt: string | null;
  metricCodes: string[];
  adherence30: number;
  strip30: number[];
}

/**
 * "What you decided to do, and the 30 days behind it." The strip is 30 cells,
 * one a day, oldest on the left, and the last one is today.
 */
export function ProtocolItemRow({
  item,
  nameOf,
}: {
  item: ProtocolRow;
  nameOf: (code: string) => string;
}) {
  const done = item.strip30.filter((v) => v === 1).length;
  return (
    <div className="protorow">
      <div>
        <b>{item.text}</b>
        <div className="psub">
          {item.cadence}
          {item.startedAt ? ` · since ${dayLabel(item.startedAt, true)}` : ""}
          {item.metricCodes.length > 0 && (
            <>
              {" · "}
              {item.metricCodes.map((code, i) => (
                <span key={code}>
                  {i > 0 && ", "}
                  <Link href={`/blood/m/${code}`}>{nameOf(code)}</Link>
                </span>
              ))}
            </>
          )}
        </div>
        {item.why && <div className="psub">{item.why}</div>}
      </div>
      <div>
        <span className="pct">{item.adherence30} %</span>
        <div className="t-meta text-right text-[length:var(--type-xs)]">
          {done === 0
            ? "never ticked"
            : `${done} of the last 30 days`}
        </div>
        <div className="mt-1 text-right">
          <ArchiveButton id={item.id} active={item.active} />
        </div>
      </div>
      <div className="strip30" aria-hidden="true">
        {item.strip30.map((v, i) => (
          <s
            key={i}
            className={cn(
              v === 1 && "on",
              i === item.strip30.length - 1 && "today",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ── the goal row ────────────────────────────────────────────────────── */

/**
 * "The same card, aimed at a number and a date. A goal without a second
 * reading says so instead of drawing a bar that means nothing."
 */
export function GoalRow({ g }: { g: GoalView }) {
  const target = formatRange(g.targetLow, g.targetHigh, g.unit);
  const overdue =
    g.due != null && !g.reached && g.due < new Date().toISOString().slice(0, 10);
  const hasStart = g.start != null && g.current != null;
  return (
    <div className="goalrow">
      <div>
        <b>
          <Link href={`/blood/m/${g.metricCode}`}>{g.metricName}</Link>{" "}
          {target}
        </b>
        <div className="t-meta text-[length:var(--type-xs)]">
          {g.due ? (
            <span className={overdue ? "tone-bad" : undefined}>
              due {dayLabel(g.due, true)}
            </span>
          ) : (
            "no date set"
          )}
          {g.currentAt ? ` · measured ${dayLabel(g.currentAt, true)}` : ""}
          {g.reached
            ? " · in the target band"
            : g.current == null
              ? " · no reading yet, so no progress to draw"
              : hasStart
                ? ` · ${g.progress} % of the way`
                : " · one draw only, so the bar is the value against the floor"}
          {g.note ? ` · ${g.note}` : ""}
        </div>
      </div>
      <div className="tgt">
        {g.current == null
          ? `target ${target}`
          : g.start != null && g.start !== g.current
            ? `${g.start} → ${g.current} → target ${target}`
            : `${g.current} of ${target}`}
      </div>
      {g.current != null && (
        <div className="progress">
          <i style={{ "--p": `${g.progress}%` } as React.CSSProperties} />
        </div>
      )}
    </div>
  );
}

/* ── the pattern ─────────────────────────────────────────────────────── */

/**
 * `/patterns/[id]` was one page per pattern, reached from a chip. It is one
 * card per pattern here, with the whole of that page behind the disclosure:
 * why it matched, what is contested, what to do, the tests that would settle
 * it, the edges it owns and the questions it wants.
 */
export function PatternCard({
  match,
  verdict,
  edges,
  input,
  questionNodes,
}: {
  match: PatternMatch;
  verdict?: string;
  edges: GraphEdge[];
  input: ModelInput;
  /** the open review item for each of the pattern's questions, if any */
  questionNodes?: Record<string, React.ReactNode>;
}) {
  const { pattern, stage, reasons } = match;
  const overrides = new Map(
    (pattern.effects.edgeOverrides ?? []).map((o) => [o.edgeId, o]),
  );
  const measured = (suggest: string) => {
    const text = suggest.toLowerCase();
    return Object.entries(input.latest).some(
      ([code, row]) =>
        row.value != null &&
        (text.includes(code.replace(/_/g, " ")) || text.includes(code)),
    );
  };
  return (
    <div className="conc border">
      <div className="conc-top">
        <h3 className="conc-name t-title">{pattern.name}</h3>
        {stage && <StateWord tone="border">{stage}</StateWord>}
      </div>

      <p className="conc-prose">
        <Terms text={pattern.summary} />
      </p>
      {verdict && (
        <p className="conc-prose">
          <Terms text={verdict} />
        </p>
      )}
      <p className="t-meta text-[length:var(--type-sm)]">
        {match.matched
          ? `why this matched · ${reasons.join("; ") || "the detector matched"}`
          : `what it looks for · ${pattern.detects}`}
      </p>

      <details className="disclose">
        <summary>
          What this pattern is, and what would settle it
        </summary>
        <div className="inner space-y-3">
          <p>
            <b>Contested.</b> {pattern.controversy}
          </p>
          <p>
            <b>Management.</b> {pattern.management}
          </p>

          <div>
            <b>
              {plural(pattern.effects.escalations.length, "test")} that would
              confirm it
            </b>
            <ul className="mt-1 space-y-1">
              {pattern.effects.escalations.map((e) => (
                <li key={e.id}>
                  <Terms text={e.suggest} />
                  {measured(e.suggest) && (
                    <span className="t-meta"> · done</span>
                  )}
                  <span className="t-meta text-[length:var(--type-xs)]">
                    {" "}
                    · {e.why} · tier {e.tier} · {e.ref}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {edges.length > 0 && (
            <div>
              <b>{plural(edges.length, "edge")} this pattern owns</b>
              <ul className="mt-1 space-y-1">
                {edges.map((edge) => {
                  const override = overrides.get(edge.id);
                  const confidence = override?.confidence ?? edge.confidence;
                  return (
                    <li key={edge.id} className="flex flex-wrap gap-2">
                      <StateWord tone={CONFIDENCE_TONE[confidence]}>
                        {confidence}
                      </StateWord>
                      <span className="flex-1">
                        {NAMES.get(edge.from) ?? edge.from} {edge.relation}{" "}
                        {NAMES.get(edge.to) ?? edge.to} —{" "}
                        <Terms text={edge.mechanism} />
                        {override?.note ? ` (${override.note})` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {pattern.effects.questions.length > 0 && (
            <div className="space-y-2">
              <b>{plural(pattern.effects.questions.length, "question")}</b>
              {pattern.effects.questions.map((q) => {
                const answered = input.profile[q.key] != null;
                const node = questionNodes?.[q.key];
                if (!answered && node) return <div key={q.key}>{node}</div>;
                return (
                  <div key={q.key} className="flex flex-wrap gap-2">
                    <span className="flex-1">{q.text}</span>
                    <StateWord tone={answered ? "on" : "none"}>
                      {answered ? "answered" : "not asked yet"}
                    </StateWord>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

/* ── the test row ────────────────────────────────────────────────────── */

export function TestRow({
  name,
  why,
  tier,
  basisChip,
}: {
  name: string;
  why: string;
  tier?: string | null;
  basisChip?: React.ReactNode;
}) {
  return (
    <div className="drow plain">
      <div>
        <div className="nm">{name}</div>
        <div className="dsub">
          <Terms text={why} />
        </div>
      </div>
      <div className="cost">
        {basisChip}
        <Tier tier={tier} />
      </div>
    </div>
  );
}

/* ── the coverage and earlier-plans rows ─────────────────────────────── */

export function FactRow({
  name,
  detail,
  value,
  unit,
  word,
  tone = "none",
}: {
  name: string;
  detail?: string;
  value: string;
  unit?: string;
  word: string;
  tone?: StateTone;
}) {
  return (
    <div className="markerrow said">
      <div className="nm">
        <b>{name}</b>
        {detail && <span>{detail}</span>}
      </div>
      <div className="val">
        {value}
        {unit && <em>{unit}</em>}
      </div>
      <div className="wd">
        <StateWord tone={tone}>{word}</StateWord>
      </div>
    </div>
  );
}
