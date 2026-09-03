/**
 * Home: one sentence, the rail, the ask, the systems, then the ledger of
 * every conclusion in rank order.
 *
 * Phase 30d rebuilt every card on the design system's own elements
 * (`docs/mockups/v4/system.html` sections 06, 07, 08 and 12, and
 * `home.html`), from the owner's reading of the old page in
 * `docs/plans/2026-09-02-phase30d-home-ux-notes.md`. What changed, and why:
 *
 * - the ConclusionCard is `.conc`: rank, name, state word, likelihood, the
 *   state row, the prose, FOR / AGAINST, the ruler, what to do, one text row
 *   and one why disclosure (notes 4 and 9);
 * - the ruler under a card draws the marker its FOR line names, or nothing
 *   (note 2, the rule itself is in `lib/ledger.ts`);
 * - the doctor's note and "Something's off?" moved inside the why
 *   disclosure, so a card ends with three controls and not seven (note 9);
 * - the evidence legend is printed once, at the top of the ledger (note 8);
 * - every marker name goes through `explainKey` and every date through
 *   `dayLabel` (note 3).
 *
 * Server components throughout. The only client parts are the ones that
 * write: the inline answer, "Wrong value", the fact box, the adds and the
 * copy button.
 */
import Link from "next/link";
import type { PlanLine } from "@/lib/actions";
import type { Ask } from "@/lib/asking";
import { EVIDENCE_LEGEND } from "@/lib/evidence";
import {
  changedLine,
  explainInput,
  explainKey,
  type Finding,
} from "@/lib/explain";
import type { Today } from "@/lib/home-data";
import type { Conclusion, Ledger } from "@/lib/ledger";
import type { Move } from "@/lib/infogain";
import type { HState, Grade, Lens } from "@/lib/hypotheses";
import { cn, dayLabel, plural } from "@/lib/utils";
import { AskLink } from "./ask-link";
import { CopyNote, EditFact, StillTrue, WrongValue } from "./client";
import { ActionButtons, GeneratePlan } from "./plan";
import { EvidenceChip } from "./evidence-chip";
import { Ruler } from "./ruler";
import { Digits, SwapText } from "./motion";
import { Term, Terms } from "./term";
import { TodayAsk } from "./today-ask";
import { WhatToDo } from "./what-to-do";
import { HistoryChart } from "./history-chart";
import { StateWord, type StateTone } from "./ui-kit";

export { KeyTrends } from "./key-trends";

export function SectionHeader({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="sub" style={{ marginTop: 0 }}>
      <h3>{title}</h3>
      {href && (
        <Link href={href} className="ml-auto shrink-0">
          <span>{linkLabel}</span>
        </Link>
      )}
    </div>
  );
}

/** A quiet link that reads at 13 px and answers to a 40 px finger. */
const SMALL_LINK =
  "hit-40 inline-flex cursor-pointer list-none items-center gap-1 text-[length:var(--type-sm)] text-[var(--ink-2)] hover:text-[var(--ink)]";

/**
 * The lens badges said `ENERGY B · WEIGHT A · LIFESPAN A`, which is the
 * engine's vocabulary. Phase 28 cut it to one line; phase 30d fixed the
 * words, because "matters most for energy (grade A)" is the lens weight and
 * nobody reads it that way (UX note 4).
 */
function lensLine(
  lenses: Partial<Record<Lens, { w: number; grade: Grade }>>,
): { lens: string; grade: Grade } | null {
  const best = Object.entries(lenses).sort((a, b) => b[1].w - a[1].w)[0];
  return best ? { lens: best[0], grade: best[1].grade } : null;
}

/**
 * The one question, and the answers worth re-asking.
 *
 * Phase 24a made this the only place in the app that renders an answer
 * input, and `ASK_HREF` is an anchor into it, so every "answer this" link on
 * a conclusion card lands here.
 */
export function TodayQuestions({
  today,
  day,
  ask,
  askKey,
  askOptions = [],
}: {
  today: Today;
  day: string;
  /** the single best question by information gain, if there is one */
  ask?: Ask;
  /** the key `/?ask=…` asked for: that question is rendered first */
  askKey?: string;
  askOptions?: string[];
}) {
  if (!today.due.length && !ask) return null;
  const due = askKey
    ? [...today.due].sort(
        (a, b) => Number(b.key === askKey) - Number(a.key === askKey),
      )
    : today.due;
  const askFirst = askKey != null && ask?.key === askKey;
  const stillTrue = (
    <>
      {due.length > 0 && (
        <div className="panel-head">
          <h3>Still true?</h3>
          <span className="r">{due.length}</span>
        </div>
      )}
      {due.map((d) => (
        <StillTrue
          key={d.key}
          factKey={d.key}
          question={d.question}
          original={d.original}
          options={d.options}
          current={d.current}
          today={day}
        />
      ))}
    </>
  );
  const oneQuestion = ask && (
    <div className="space-y-2">
      <div className="panel-head">
        <h3>One question</h3>
      </div>
      {/**
       * Phase 31a item 3. `TodayAsk` seeds its state from this prop once, so
       * on a soft navigation to `/?ask=sym_thirst#today-question` — which is
       * where every "Answer →" on a card goes, and Home is already the page —
       * the box kept the question it was already showing and clicking Answer
       * looked like it did nothing. The key is the question, so a new question
       * is a new box.
       */}
      <TodayAsk key={ask.key} ask={ask} options={askOptions} />
    </div>
  );
  return (
    <div className="panel t-resize space-y-3">
      {askFirst ? (
        <>
          {oneQuestion}
          {stillTrue}
        </>
      ) : (
        <>
          {stillTrue}
          {oneQuestion}
        </>
      )}
    </div>
  );
}

/**
 * "Since Aug 31: 0 resolved · 0 new" was a line of zeros pretending to be
 * news. Nothing moved is not a sentence, so it is not printed.
 */
export function SinceLine({
  since,
  day,
}: {
  since: Ledger["since"];
  day?: string;
}) {
  if (!since) return null;
  const parts = (
    [
      ["resolved", since.resolved],
      ["new", since.new],
      ["stronger", since.stronger],
      ["weaker", since.weaker],
    ] as const
  ).filter(([, n]) => n > 0);
  if (parts.length === 0) return null;
  const days =
    day != null
      ? Math.round((Date.parse(day) - Date.parse(since.at)) / 86400000)
      : NaN;
  const when =
    days === 0
      ? "today"
      : days === 1
        ? "since yesterday"
        : `since ${dayLabel(since.at)}`;
  return (
    <p className="t-meta text-[length:var(--type-sm)]">
      {parts.map(([label, n], i) => (
        <span key={label}>
          {i > 0 && " · "}
          <span className="t-num text-[var(--ink-2)]">{n}</span> {label}
        </span>
      ))}
      {` ${when}`}
    </p>
  );
}

const STATE_TONE: Record<HState, StateTone> = {
  confirmed: "off",
  likely: "off",
  possible: "border",
  unlikely: "none",
  ruled_out: "none",
};

const CONC_TONE: Record<StateTone, string> = {
  off: "off",
  border: "border",
  on: "on",
  none: "",
};

/**
 * What "Discuss" opens the composer about. The card's title carries the state
 * ("Insulin resistance: likely"), and "About Insulin resistance: likely: " is
 * not a sentence anybody would type.
 */
const topicOf = (c: Conclusion) =>
  c.title.replace(/:\s*(confirmed|likely|possible|unlikely|ruled out)$/i, "");

/** The card's own name, with the state word taken off the end. */
const nameOf = (c: Conclusion) => topicOf(c);

const moveCost = (m: Move) =>
  m.cost === 0 ? "free" : m.priced ? `€${m.cost}` : `cost ${m.cost}`;

function EvidenceList({
  title,
  lines,
}: {
  title: string;
  lines: Conclusion["for"];
}) {
  if (!lines.length) return null;
  return (
    <div>
      <div className="t-meta text-[length:var(--type-xs)]">{title}</div>
      <ul className="mt-1 space-y-0.5">
        {lines.map((e) => (
          <li
            key={e.rule}
            className="t-body text-[length:var(--type-sm)] text-[var(--ink-2)]"
          >
            <Terms text={explainInput(e)} />{" "}
            <span className="t-num text-[length:var(--type-xs)] text-[var(--ink-3)]">
              LR {e.lr}
            </span>{" "}
            <EvidenceChip basis="science" grade={e.grade} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every reading and fact the card read, each one editable. */
function NotRight({ inputs }: { inputs: Conclusion["inputs"] }) {
  if (!inputs.length) return null;
  return (
    <details className="disclose">
      <summary>Something&rsquo;s off?</summary>
      <div className="inner space-y-1.5">
        {inputs.map((i) =>
          i.kind === "reading" ? (
            <div
              key={`r-${i.id}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="t-body text-[length:var(--type-sm)] text-[var(--ink-2)]">
                <Terms text={i.label} />
              </span>
              <span className="t-num text-[length:var(--type-xs)] text-[var(--ink-3)]">
                {i.value}
                {i.date ? ` · ${dayLabel(i.date, true)}` : ""}
              </span>
              <WrongValue readingId={i.id} />
            </div>
          ) : (
            <EditFact
              key={`f-${i.id}`}
              factKey={i.id}
              label={i.label}
              value={i.value}
            />
          ),
        )}
      </div>
    </details>
  );
}

export function ConclusionCard({
  c,
  verdict,
  reportId,
  actionIndex,
  ask,
  todo,
  management,
  spear = false,
}: {
  c: Conclusion;
  verdict?: string;
  reportId?: string | null;
  actionIndex?: number;
  /** this card's question as a line and a link; the input lives on Today */
  ask?: Ask;
  /** the top three things to do about this one (`lib/actions.ts`) */
  todo?: PlanLine[];
  /** the catalog's own management text, copied out of the why disclosure */
  management?: string;
  spear?: boolean;
}) {
  const top = c.next.find((m) => m.kind !== "question");
  const lens = lensLine(c.lenses);
  const tone = c.risk ? "border" : c.state ? STATE_TONE[c.state] : "none";
  return (
    <div
      data-card={c.id}
      className={cn("conc t-flip t-resize", CONC_TONE[tone])}
    >
      <div className="conc-top">
        <span className="conc-rank">{String(c.rank).padStart(2, "0")}</span>
        <h3 className="conc-name t-title">{nameOf(c)}</h3>
        {c.risk ? (
          <StateWord tone="border">risk</StateWord>
        ) : (
          c.state && (
            <StateWord
              tone={STATE_TONE[c.state]}
              tri={STATE_TONE[c.state] === "off"}
              data-state-chip={c.id}
            >
              <SwapText text={c.state.replace("_", " ")} />
            </StateWord>
          )
        )}
        {c.probability != null && (
          <span className="conc-pct">
            <Digits
              data-percent={c.id}
              text={String(Math.round(c.probability * 100))}
            />
            <em>%</em>
          </span>
        )}
      </div>

      {/* UX note 4: the lens weight, in words a person reads, with its grade
          glyph and the tooltip that says what a grade is. */}
      {lens && (
        <p className="t-meta text-[length:var(--type-sm)]">
          weighs most on {lens.lens} ·{" "}
          <Term code="grade">evidence {lens.grade}</Term>{" "}
          <EvidenceChip basis="science" grade={lens.grade} />
        </p>
      )}

      {verdict && (
        <p className="conc-prose">
          <Terms text={verdict} />
        </p>
      )}

      {c.changed && (
        <p className="t-meta text-[length:var(--type-sm)]">
          {changedLine(c.changed)}
        </p>
      )}

      {(c.for.length > 0 || c.against.length > 0) && (
        <p className="conc-prose">
          <span className="t-meta text-[length:var(--type-xs)]">FOR · </span>
          <Terms
            text={
              c.for
                .slice(0, 2)
                .map((e) => explainInput(e))
                .join(", ") || "nothing yet"
            }
          />
          <br />
          <span className="t-meta text-[length:var(--type-xs)]">
            AGAINST ·{" "}
          </span>
          <Terms
            text={
              c.against
                .slice(0, 2)
                .map((e) => explainInput(e))
                .join(", ") || "nothing yet"
            }
          />
        </p>
      )}

      {/* UX note 2: this is the marker the FOR line names, or nothing. */}
      {c.rangeBar && <Ruler {...c.rangeBar} />}

      {c.projection && (
        <p className="t-body flex items-center gap-2 text-[length:var(--type-sm)] text-[var(--ink-2)]">
          {c.projection.verdict && (
            <StateWord
              tone={
                c.projection.verdict === "better"
                  ? "on"
                  : c.projection.verdict === "worse"
                    ? "off"
                    : "none"
              }
            >
              {c.projection.verdict === "as_expected"
                ? "as expected"
                : c.projection.verdict}
            </StateWord>
          )}
          <Terms text={c.projection.line} />
        </p>
      )}

      {spear && c.trend && (
        <div>
          <HistoryChart
            mini
            title={explainKey(c.trend.code)}
            points={c.trend.points}
            refLow={c.rangeBar?.refLow}
            refHigh={c.rangeBar?.refHigh}
            optimalLow={c.rangeBar?.optimalLow}
            optimalHigh={c.rangeBar?.optimalHigh}
            unit={c.rangeBar?.unit}
          />
          <p className="t-meta mt-1 text-[length:var(--type-xs)]">
            <Term code={c.trend.code}>{explainKey(c.trend.code)}</Term> ·{" "}
            {plural(c.trend.points.length, "draw")}
          </p>
        </div>
      )}

      {ask && <AskLink ask={ask} only={c.id} />}

      {todo && (
        <WhatToDo
          conditionId={c.id}
          conditionName={topicOf(c)}
          lines={todo}
          reportId={reportId ?? null}
        />
      )}

      {/* UX note 9: one text row. Not for me · Discuss, and nothing else. */}
      <div className="rowh">
        {reportId && c.action && actionIndex != null ? (
          <ActionButtons
            reportId={reportId}
            actionIndex={actionIndex}
            kind={c.action.kind}
            topic={topicOf(c)}
            about={c.id}
            adopt={!todo?.length}
          />
        ) : top ? (
          <Link href="/plan" className="b b-quiet b-sm">
            {top.kind === "test" ? `Order ${top.label}` : top.label} (
            {moveCost(top)})
          </Link>
        ) : null}
      </div>

      {/* UX note 9: the doctor's note and "Something's off?" live in here. */}
      <details className="disclose">
        <summary>Why this number</summary>
        <div className="inner space-y-2">
          <p className="t-meta text-[length:var(--type-xs)]">
            <Term code="likelihood_ratio">LR</Term> is how much a finding
            multiplies the odds; <Term code="grade">grade</Term> is how good the
            evidence behind it is.
          </p>
          <EvidenceList title="For" lines={c.for} />
          <EvidenceList title="Against" lines={c.against} />
          {c.missing.length > 0 && (
            <p className="t-meta text-[length:var(--type-sm)]">
              Never measured: <Terms text={c.missing.join(", ")} />
            </p>
          )}
          {c.confounded.length > 0 && (
            <p className="t-meta text-[length:var(--type-sm)]">
              Discounted: <Terms text={c.confounded.join(", ")} />
            </p>
          )}
          {c.next.length > 0 && (
            <p className="t-meta text-[length:var(--type-sm)]">
              Next:{" "}
              {c.next.map((m, i) => (
                <span key={m.label}>
                  {i > 0 && " · "}
                  <Terms text={m.label} /> (
                  {m.cost === 0 ? (
                    "free"
                  ) : (
                    <span className="t-num">{moveCost(m)}</span>
                  )}
                  )
                </span>
              ))}
            </p>
          )}
          {management && (
            <div className="space-y-1">
              <p className="t-body text-[length:var(--type-sm)] text-[var(--ink-2)]">
                {management}
              </p>
              <CopyNote text={management} label="Copy the doctor's note" />
            </div>
          )}
          <NotRight inputs={c.inputs} />
        </div>
      </details>
    </div>
  );
}

/** Consecutive "marker off" cards, gathered by the system they belong to. */
export interface MarkerGroup {
  /** `markers:<systemId>`, the card's identity for the diff and the FLIP */
  id: string;
  systemName: string;
  /** the best rank in the group: where the collapsed card sits */
  rank: number;
  markers: { code: string; name: string; value: string }[];
  /** every reading behind the group, for the one "…" menu */
  inputs: Conclusion["inputs"];
}

/** One card per system, with the markers as chips one tap from their page. */
export function MarkersCard({ group }: { group: MarkerGroup }) {
  const n = group.markers.length;
  return (
    <div data-card={group.id} className="conc t-flip t-resize">
      <div className="conc-top">
        <h3 className="conc-name t-title">
          {group.systemName}: {plural(n, "marker")} off
        </h3>
      </div>

      <ul className="chips">
        {group.markers.map((m) => (
          <li key={m.code}>
            <Link href={`/blood/m/${m.code}`} className="chip">
              {m.name}
              <span className="t-num text-[length:var(--type-xs)]">
                {m.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <details className="disclose">
        <summary>Where these readings came from</summary>
        <div className="inner space-y-1.5">
          {group.inputs.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2">
              <span className="t-body text-[length:var(--type-sm)] text-[var(--ink-2)]">
                <Terms text={i.label} />
              </span>
              <span className="t-num text-[length:var(--type-xs)] text-[var(--ink-3)]">
                {i.value}
                {i.date ? ` · ${dayLabel(i.date, true)}` : ""}
              </span>
              {i.kind === "reading" && <WrongValue readingId={i.id} />}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

/**
 * "What your genome changed": the sentences the upload page already writes,
 * on the ledger for a fortnight after the file landed.
 */
export function FindingsCard({ finding }: { finding: Finding }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{finding.title}</h3>
        <span className="r">{dayLabel(finding.at, true)}</span>
      </div>
      {/* A genome line is an answer with a state word on it, so it reads as a
          row: the condition, the gene and its call under it, the factor on the
          right. A document line is still one sentence with its kind beside it. */}
      {finding.lines.some((line) => line.mark) ? (
        <div className="rowlist">
          {finding.lines.map((line) => (
            <div className="markerrow said" key={line.label}>
              <div className="nm">
                <b>{line.label}</b>
                <span>{line.text}</span>
              </div>
              <div />
              <div />
              <div className="wd">
                <StateWord tone={line.tone ?? "none"}>{line.mark}</StateWord>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {finding.lines.map((line) => (
            <li key={line.label}>
              <span className="t-meta mr-2 text-[length:var(--type-xs)]">
                {line.label}
              </span>
              <span className="t-body text-[length:var(--type-sm)] text-[var(--ink-2)]">
                <Terms text={line.text} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href={finding.href} className={cn(SMALL_LINK, "mt-3")}>
        see all {finding.total}
      </Link>
    </div>
  );
}

export function ImprovedCard({ improved }: { improved: Ledger["improved"] }) {
  if (!improved.length) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>What improved</h3>
        <span className="r">{improved.length}</span>
      </div>
      <ul className="space-y-1">
        {improved.map((i) => (
          <li
            key={i.code}
            className="t-body text-[length:var(--type-sm)] text-[var(--ink-2)]"
          >
            <Term code={i.code}>{i.name}</Term>{" "}
            <span className="t-num text-[var(--ink)]">
              {i.from} → {i.to}
              {i.unit ? ` ${i.unit}` : ""}
            </span>{" "}
            <span className="t-meta text-[length:var(--type-xs)]">
              since {dayLabel(i.since, true)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "2 %", and "0.0021 %" for the rare ones ring 2 put in the list. */
const quietPct = (p: number) =>
  p >= 0.01 ? `${Math.round(p * 100)}%` : `${(p * 100).toPrecision(2)}%`;

function QuietRows({
  rows,
}: {
  rows: { id: string; name: string; p: number }[];
}) {
  return (
    <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <li
          key={r.id}
          className="t-meta flex justify-between gap-2 text-[length:var(--type-sm)]"
        >
          <span className="truncate">{r.name}</span>
          <span className="t-num">{quietPct(r.p)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two toggles, not one. Unlikely is worth a glance; ruled out is what the
 * engine looked at and dismissed. Both are closed by default, everywhere.
 */
export function QuietLine({ quiet }: { quiet: Ledger["quiet"] }) {
  if (!quiet.ids.length) return null;
  return (
    <div className="space-y-2">
      {quiet.unlikely > 0 && (
        <details className="disclose">
          <summary>Show {quiet.unlikely} unlikely</summary>
          <div className="inner">
            <QuietRows rows={quiet.rows} />
          </div>
        </details>
      )}
      {quiet.ruledOut > 0 && (
        <details className="disclose">
          <summary>Show {quiet.ruledOut} ruled out</summary>
          <div className="inner">
            <p className="t-meta text-[length:var(--type-sm)]">
              Under 5 %. Every one of these was scored and dismissed; the ring-2
              entries are rare diseases something in your data woke for a look.
            </p>
            <QuietRows rows={quiet.ruledOutRows} />
          </div>
        </details>
      )}
    </div>
  );
}

/** The one legend for the glyphs, at the top of the ledger (UX note 8). */
export function EvidenceLegend() {
  return <p className="legend">{EVIDENCE_LEGEND}</p>;
}

/** Day one: `system.html` section 12. One sentence, one link, no dashes. */
export function EmptyHome() {
  return (
    <div className="empty">
      <span className="k">Day one</span>
      <b className="t-title text-[length:var(--type-md)] font-normal">
        Nothing measured yet
      </b>
      <p>
        Add a lab result, or a photo of one, and the first reading turns this
        into a ledger. Nothing here is a demo.
      </p>
      <Link href="/blood?tab=uploads">Add your first result</Link>
      <div className="mt-2">
        <GeneratePlan />
      </div>
    </div>
  );
}
