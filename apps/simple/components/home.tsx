/**
 * Home: the cockpit row you read in three seconds, then the ledger of every
 * conclusion in rank order. `docs/mockups/home-options.html`, option B on top
 * of option A, drawn with the kit's own tokens.
 *
 * Server components throughout. The only client parts are the three buttons
 * that write: the inline answer, "Wrong value" and the fact box.
 */
import Link from "next/link";
import { ChevronRight, FlaskConical } from "lucide-react";
import { ASK_HREF, type Ask } from "@/lib/asking";
import { explainInput, type Finding } from "@/lib/explain";
import type { Today } from "@/lib/home-data";
import type { Conclusion, Ledger } from "@/lib/ledger";
import type { Move } from "@/lib/infogain";
import type { TrendMetric } from "@/lib/home-data";
import type { HState, Grade, Lens } from "@/lib/hypotheses";
import { cn, formatDate } from "@/lib/utils";
import { AskLink } from "./ask-link";
import { EditFact, StillTrue, WrongValue } from "./client";
import { PostButton } from "./composer-button";
import { ActionButtons, GeneratePlan } from "./plan";
import { RangeBar } from "./range-bar";
import { StatusBadge } from "./status-badge";
import { TodayAsk } from "./today-ask";
import { TrendChart } from "./trend-chart";
import { Badge, Card } from "./ui-kit";

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
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 font-mono text-[11px] text-neutral-400 transition-colors hover:text-neutral-600"
        >
          {linkLabel}
          <ChevronRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

const LABEL =
  "font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400";
const WHY = "mt-1 font-mono text-[11px] text-neutral-400";
const one = (v: number) => v.toFixed(1);

/**
 * A small link that reads at 11 px but answers to a 40 px finger.
 * `.hit-40` is the pseudo-element from `surfaces.md`; the width stays the
 * link's own so two of them can never overlap.
 */
const SMALL_LINK =
  "hit-40 inline-flex cursor-pointer list-none items-center font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-400 hover:text-neutral-700";

/**
 * A number the ledger can replay in place (`02-number-pop-in.md`): one span
 * per character, the last two staggered. Server-rendered at rest; when an
 * answer moves it, `ledger-motion.tsx` swaps the spans and adds
 * `.is-animating`.
 */
function Digits({
  text,
  className,
  ...rest
}: { text: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const chars = [...text];
  return (
    <span className={cn("t-digit-group tabular-nums", className)} {...rest}>
      {chars.map((ch, i) => (
        <span
          key={`${i}-${ch}`}
          className="t-digit"
          data-stagger={
            i === chars.length - 2
              ? "1"
              : i === chars.length - 1
                ? "2"
                : undefined
          }
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

/**
 * The lens badges said `ENERGY B · WEIGHT A · LIFESPAN A`, which is the
 * engine's vocabulary, not a person's. One line, the lens that weighs most,
 * with the grade the evidence earned.
 */
function lensLine(
  lenses: Partial<Record<Lens, { w: number; grade: Grade }>>,
): string | null {
  const best = Object.entries(lenses).sort((a, b) => b[1].w - a[1].w)[0];
  return best ? `matters most for ${best[0]} (${best[1].grade})` : null;
}

/* ── 1. cockpit ───────────────────────────────────────────────────────── */

/**
 * "Today": the first card in the cockpit, and the shortest one.
 *
 * At most two answers worth re-asking, the one question the engine would ask
 * next, the last check-in's reply in one line, and nothing else. Phase 24a
 * made this the only place in the app that renders an input for a question;
 * every other surface prints the same question as a line and links here.
 */
export function TodayCard({
  today,
  day,
  ask,
  askOptions = [],
}: {
  today: Today;
  day: string;
  /** the single best question by information gain, if there is one */
  ask?: Ask;
  askOptions?: string[];
}) {
  const empty = !today.due.length && !today.post && !ask;
  return (
    // 01: the card's own box changes when the question it holds changes.
    <Card className="t-resize p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className={LABEL}>Today</div>
        <PostButton />
      </div>

      {empty ? (
        <p className="mt-2 font-body text-[13px] text-neutral-500">
          Nothing to ask today. Post anything with +.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {today.due.map((d) => (
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
          {ask && <TodayAsk ask={ask} options={askOptions} />}
          {today.post && (
            <p className="font-body text-[13px] leading-relaxed text-neutral-600">
              <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                {today.post.date} ·{" "}
              </span>
              {today.post.reply ?? `"${today.post.text}"`}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * "Since Aug 31: 0 resolved · 0 new · 0 stronger · 0 weaker" was a line of
 * zeros pretending to be news. Nothing moved is not a sentence, so it is not
 * printed; when something did move, only that part is.
 */
export function SinceLine({ since }: { since: Ledger["since"] }) {
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
  return (
    <p className="font-mono text-[11px] tabular-nums text-neutral-400">
      Since {formatDate(since.at)}:{" "}
      {parts.map(([label, n]) => `${n} ${label}`).join(" · ")}
    </p>
  );
}

export function Cockpit({ ledger }: { ledger: Ledger }) {
  const { bioAge, bioAgeMissing, counters, since } = ledger;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Card className="p-4 lg:row-span-1">
          <div className={LABEL}>Biological age</div>
          {bioAge ? (
            <>
              <div className="mt-1 font-display text-[52px] font-light leading-none tracking-[-0.05em] text-neutral-900">
                {one(bioAge.pheno)}
                <span className="ml-2 font-display text-[18px] font-normal tracking-normal text-neutral-400">
                  at {bioAge.chrono}
                </span>
              </div>
              <p className={WHY}>
                PhenoAge from {bioAge.inputs.length} routine markers
              </p>
            </>
          ) : (
            <>
              <div className="mt-1 font-display text-[52px] font-light leading-none tracking-[-0.05em] text-neutral-300">
                —
              </div>
              <p className={WHY}>
                Still missing {bioAgeMissing.join(", ")}.{" "}
                <Link href="/labs" className="underline hover:text-neutral-600">
                  Upload a lab
                </Link>
              </p>
            </>
          )}
        </Card>

        <Card className="p-4">
          <div className={LABEL}>Markers</div>
          <div className="mt-2 flex items-baseline font-display text-[26px] tabular-nums">
            <Digits
              data-counter="optimal"
              text={String(counters.optimal)}
              className="text-health-normal"
            />
            <span className="px-1.5 text-neutral-300">·</span>
            <Digits
              data-counter="normal"
              text={String(counters.normal)}
              className="text-health-warning"
            />
            <span className="px-1.5 text-neutral-300">·</span>
            <Digits
              data-counter="off"
              text={String(counters.off)}
              className="text-health-critical"
            />
          </div>
          <p className={WHY}>optimal · normal · off</p>
        </Card>

        <Card className="p-4">
          <div className={LABEL}>Questions worth answering</div>
          <Digits
            data-counter="questions"
            text={String(counters.questions)}
            className="mt-2 font-display text-[26px] text-neutral-900"
          />
          {counters.questions > 0 && (
            <p className={WHY}>
              <a
                href={ASK_HREF}
                className="hit-40 inline-flex items-center underline hover:text-neutral-600"
              >
                answer the first one
              </a>
            </p>
          )}
        </Card>

        <Card className="p-4">
          <div className={LABEL}>Next draw</div>
          <div className="mt-2 font-display text-[26px] tabular-nums text-neutral-900">
            {counters.nextDrawWeeks ?? 12} wk
          </div>
          <p className={cn(WHY, "truncate")}>
            {counters.nextDrawCodes.join(", ") || "nothing queued"}
          </p>
        </Card>
      </div>

      <SinceLine since={since} />
    </div>
  );
}

/* ── 2. systems strip ─────────────────────────────────────────────────── */

/** Same three tones as the graph's importance bar, drawn as a ring. */
function ringColor(score: number) {
  if (score >= 0.6) return "var(--color-health-critical)";
  if (score >= 0.3) return "var(--color-health-warning)";
  return "var(--color-accent-500)";
}

export function SystemsStrip({ systems }: { systems: Ledger["systems"] }) {
  const r = 13;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6 xl:grid-cols-12">
      {systems.map((s) => (
        <Link
          key={s.id}
          href="/graph"
          className="card flex w-[104px] shrink-0 snap-start flex-col items-center gap-1.5 p-2.5 text-center hover:border-accent-200 sm:w-auto"
        >
          <svg width="32" height="32" viewBox="0 0 32 32">
            <circle
              cx="16"
              cy="16"
              r={r}
              fill="none"
              stroke="var(--color-neutral-150)"
              strokeWidth="3"
            />
            <circle
              cx="16"
              cy="16"
              r={r}
              fill="none"
              stroke={ringColor(s.score)}
              strokeWidth="3"
              strokeDasharray={`${s.score * circumference} ${circumference}`}
              transform="rotate(-90 16 16)"
              data-system-arc={s.id}
              data-circumference={circumference}
            />
            {/* A zero in a green ring reads as "empty", not as "healthy".
                Nothing off gets a tick; every system with a score keeps its
                number. */}
            {Math.round(s.score * 100) === 0 ? (
              <path
                d="M11 16.2l3.4 3.4L21.4 12"
                fill="none"
                stroke="var(--color-health-normal)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <text
                x="16"
                y="20"
                textAnchor="middle"
                data-system-score={s.id}
                className="fill-neutral-500 font-mono tabular-nums"
                style={{ fontSize: 10 }}
              >
                {Math.round(s.score * 100)}
              </text>
            )}
          </svg>
          <span className="line-clamp-2 font-display text-[11px] font-medium leading-tight text-neutral-800">
            {s.name}
          </span>
          <span className="w-full truncate font-mono text-[10px] text-neutral-400">
            {s.worst
              ? `${s.worst.code.replace(/_/g, " ")} ${s.worst.value ?? "?"}`
              : "never measured"}
          </span>
          {s.worst && (
            <StatusBadge
              status={
                s.worst.status === "red"
                  ? "critical"
                  : s.worst.status === "amber"
                    ? "warning"
                    : s.worst.status === "green"
                      ? "normal"
                      : "neutral"
              }
              label={s.worst.status}
            />
          )}
        </Link>
      ))}
    </div>
  );
}

/* ── 3 + 4. the conclusion card, spear and ledger ─────────────────────── */

const STATE_VARIANT: Record<HState, "critical" | "warning" | "secondary"> = {
  confirmed: "critical",
  likely: "critical",
  possible: "warning",
  unlikely: "secondary",
  ruled_out: "secondary",
};

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
      <div className={LABEL}>{title}</div>
      <ul className="mt-1 space-y-0.5">
        {lines.map((e) => (
          <li key={e.rule} className="font-body text-[12px] text-neutral-600">
            {explainInput(e)}{" "}
            <span className="font-mono text-[11px] tabular-nums text-neutral-400">
              LR {e.lr} · {e.grade}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The small list behind "Not right?": every reading and fact the card read. */
function NotRight({ inputs }: { inputs: Conclusion["inputs"] }) {
  if (!inputs.length) return null;
  return (
    <details className="mt-2">
      <summary className={SMALL_LINK}>Not right?</summary>
      <div className="mt-2 space-y-1.5 border-l-2 border-neutral-150 pl-3">
        {inputs.map((i) =>
          i.kind === "reading" ? (
            <div
              key={`r-${i.id}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="font-body text-[12px] text-neutral-700">
                {i.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-neutral-500">
                {i.value}
                {i.date ? ` · ${i.date}` : ""}
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
  spear = false,
}: {
  c: Conclusion;
  verdict?: string;
  reportId?: string | null;
  actionIndex?: number;
  /** this card's question as a line and a link; the input lives on Today */
  ask?: Ask;
  spear?: boolean;
}) {
  // A question move is never a button here: the Today card takes the answer,
  // so a "(free)" chip repeating the question would be the second asker again.
  const top = c.next.find((m) => m.kind !== "question");
  const lens = lensLine(c.lenses);
  return (
    <Card
      data-card={c.id}
      className={cn("t-flip t-resize p-4", spear && "border-accent-500 p-5")}
    >
      {spear && (
        <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-accent-600">
          Start here
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="tabular-nums">
            {c.rank}
          </Badge>
          {c.risk ? (
            <Badge variant="warning">risk</Badge>
          ) : (
            c.state && (
              <Badge variant={STATE_VARIANT[c.state]} data-state-chip={c.id}>
                <span className="t-text-swap">{c.state.replace("_", " ")}</span>
              </Badge>
            )
          )}
        </div>
        {c.probability != null && (
          <Digits
            data-percent={c.id}
            text={`${Math.round(c.probability * 100)}%`}
            className="font-display text-[28px] font-medium leading-none tracking-[-0.02em] text-neutral-900"
          />
        )}
      </div>

      <h3
        className={cn(
          "mt-2 text-balance font-display font-medium tracking-[-0.02em] text-neutral-900",
          spear ? "text-[24px]" : "text-[17px]",
        )}
      >
        {c.title}
      </h3>

      {lens && (
        <p className="mt-1 font-mono text-[11px] text-neutral-400">
          {lens}
        </p>
      )}

      {verdict && (
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-neutral-600">
          {verdict}
        </p>
      )}

      {c.changed && (
        <p className="mt-1.5 font-mono text-[11px] text-neutral-400">
          was {c.changed.from?.replace("_", " ") ?? "not scored"} →{" "}
          {c.changed.to.replace("_", " ")} ({c.changed.deltaP > 0 ? "+" : ""}
          {Math.round(c.changed.deltaP * 100)} pts)
        </p>
      )}

      {(c.for.length > 0 || c.against.length > 0) && (
        <p className="mt-2 font-body text-[12px] text-neutral-600">
          <span className="font-mono text-[10px] uppercase text-neutral-400">
            For ·{" "}
          </span>
          {c.for
            .slice(0, 2)
            .map((e) => explainInput(e))
            .join(", ") || "nothing yet"}
          <br />
          <span className="font-mono text-[10px] uppercase text-neutral-400">
            Against ·{" "}
          </span>
          {c.against
            .slice(0, 2)
            .map((e) => explainInput(e))
            .join(", ") || "nothing yet"}
        </p>
      )}

      {c.rangeBar && (
        <div className="mt-3">
          <RangeBar {...c.rangeBar} />
        </div>
      )}

      {/* Phase 19: what was written down before the draw, and what the draw
          said about it. Factual, and the only gamified line on the page. */}
      {c.projection && (
        <p className="mt-3 flex items-center gap-2 border-l-2 border-accent-500 bg-accent-50 px-3 py-2 font-mono text-[12px] text-neutral-700">
          {c.projection.verdict && (
            <Badge
              variant={
                c.projection.verdict === "better"
                  ? "normal"
                  : c.projection.verdict === "worse"
                    ? "critical"
                    : "info"
              }
            >
              {c.projection.verdict === "as_expected"
                ? "as expected"
                : c.projection.verdict}
            </Badge>
          )}
          {c.projection.line}
        </p>
      )}

      {spear && c.trend && (
        <div className="mt-3">
          <TrendChart
            height={140}
            data={c.trend.points.map((p) => ({ date: p.date, value: p.value }))}
            referenceRangeLow={c.rangeBar?.refLow}
            referenceRangeHigh={c.rangeBar?.refHigh}
            optimalRangeLow={c.rangeBar?.optimalLow}
            optimalRangeHigh={c.rangeBar?.optimalHigh}
            unit={c.rangeBar?.unit}
          />
          <p className={WHY}>
            {c.trend.code.replace(/_/g, " ")}, {c.trend.points.length} draws
          </p>
        </div>
      )}

      {ask && <AskLink ask={ask} only={c.id} />}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {reportId && c.action && actionIndex != null ? (
          <ActionButtons
            reportId={reportId}
            actionIndex={actionIndex}
            kind={c.action.kind}
          />
        ) : top ? (
          <Link
            href="/plan"
            className="inline-flex h-10 items-center gap-1.5 border border-neutral-200 bg-neutral-0 px-3 font-display text-[12px] tracking-[0.04em] text-neutral-700 transition-[color,background-color,border-color] duration-150 ease-out hover:border-neutral-900 hover:bg-neutral-50 active:scale-[0.96]"
          >
            <FlaskConical className="size-3.5" />
            {top.kind === "test" ? `Order ${top.label}` : top.label} (
            {moveCost(top)})
          </Link>
        ) : null}
      </div>

      <details className="mt-3">
        <summary className={SMALL_LINK}>Why</summary>
        <div className="mt-2 space-y-2 border-t border-neutral-100 pt-2">
          <EvidenceList title="For" lines={c.for} />
          <EvidenceList title="Against" lines={c.against} />
          {c.missing.length > 0 && (
            <p className="font-mono text-[11px] text-neutral-500">
              Never measured: {c.missing.join(", ")}
            </p>
          )}
          {c.confounded.length > 0 && (
            <p className="font-mono text-[11px] text-neutral-500">
              Discounted: {c.confounded.join(", ")}
            </p>
          )}
          {c.next.length > 0 && (
            <p className="font-mono text-[11px] text-neutral-500">
              Next:{" "}
              {c.next
                .map((m) => `${m.label} (${moveCost(m)}, gain ${m.gain})`)
                .join(" · ")}
            </p>
          )}
        </div>
      </details>

      <NotRight inputs={c.inputs} />
    </Card>
  );
}

/* ── the improved card and the quiet line ─────────────────────────────── */

/* ── 4b. the markers nobody explains, one card per system ─────────────── */

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

/**
 * Five cards that each said "Cholesterol, Total 217 mg/dL, off" over two
 * collapsed stubs were filler: same shape, same two links, no sentence. One
 * card per system says the same thing in one line, and the markers stay one
 * tap from their own page.
 */
export function MarkersCard({ group }: { group: MarkerGroup }) {
  const n = group.markers.length;
  return (
    <Card data-card={group.id} className="t-flip t-resize p-4">
      <details>
        <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
          <h3 className="text-balance font-display text-[17px] font-medium tracking-[-0.02em] text-neutral-900">
            {group.systemName}: {n} marker{n === 1 ? "" : "s"} off
          </h3>
          <span
            aria-label="Where these readings came from"
            className="hit-40 flex size-10 shrink-0 items-center justify-center font-mono text-[16px] leading-none text-neutral-400 hover:text-neutral-700"
          >
            …
          </span>
        </summary>
        <div className="mt-2 space-y-1.5 border-l-2 border-neutral-150 pl-3">
          {group.inputs.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2">
              <span className="font-body text-[12px] text-neutral-700">
                {i.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-neutral-500">
                {i.value}
                {i.date ? ` · ${i.date}` : ""}
              </span>
              {i.kind === "reading" && <WrongValue readingId={i.id} />}
            </div>
          ))}
        </div>
      </details>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {group.markers.map((m) => (
          <li key={m.code}>
            <Link
              href={`/m/${m.code}`}
              className="inline-flex h-10 items-center gap-1.5 border border-neutral-200 px-2.5 font-mono text-[11px] tabular-nums text-neutral-600 transition-[color,border-color] duration-150 ease-out hover:border-neutral-900 hover:text-neutral-900 active:scale-[0.96]"
            >
              <span className="font-body">{m.name}</span>
              {m.value}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * "What your genome changed": the three sentences the upload page already
 * writes, on the ledger for a fortnight after the file landed, with a link to
 * all of them. The same card carries a document's accepted items.
 */
export function FindingsCard({ finding }: { finding: Finding }) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className={LABEL}>{finding.title}</div>
        <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
          {formatDate(finding.at)}
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {finding.lines.map((line) => (
          <li key={line.label}>
            <span className="mr-2 inline-block border border-accent-200 bg-accent-50 px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.04em] text-accent-600">
              {line.label}
            </span>
            <span className="font-body text-[13px] leading-relaxed text-neutral-700">
              {line.text}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href={finding.href}
        className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-neutral-400 hover:text-neutral-700"
      >
        see all {finding.total}
        <ChevronRight className="size-3" />
      </Link>
    </Card>
  );
}

export function ImprovedCard({ improved }: { improved: Ledger["improved"] }) {
  if (!improved.length) return null;
  return (
    <Card className="p-4">
      <div className={LABEL}>What improved</div>
      <ul className="mt-2 space-y-1">
        {improved.map((i) => (
          <li
            key={i.code}
            className="font-mono text-[12px] tabular-nums text-neutral-700"
          >
            <span className="font-body text-neutral-800">{i.name}</span>{" "}
            {i.from} → {i.to}
            {i.unit ? ` ${i.unit}` : ""}{" "}
            <span className="text-neutral-400">since {i.since}</span>
          </li>
        ))}
      </ul>
    </Card>
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
          className="flex justify-between gap-2 font-mono text-[11px] tabular-nums text-neutral-500"
        >
          <span className="truncate">{r.name}</span>
          <span>{quietPct(r.p)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two toggles, not one. Unlikely is a thing worth glancing at; ruled out is a
 * thing the engine looked at and dismissed, and after phase 17 most of that
 * list is rare diseases something woke and the arithmetic put back to sleep.
 * Both are closed by default, everywhere.
 */
export function QuietLine({ quiet }: { quiet: Ledger["quiet"] }) {
  if (!quiet.ids.length) return null;
  const summary = cn(SMALL_LINK, "tracking-[0.06em]");
  return (
    <div className="space-y-2">
      {quiet.unlikely > 0 && (
        <details>
          <summary className={summary}>
            {quiet.unlikely} unlikely · show
          </summary>
          <QuietRows rows={quiet.rows} />
        </details>
      )}
      {quiet.ruledOut > 0 && (
        <details>
          <summary className={summary}>
            show ruled out ({quiet.ruledOut})
          </summary>
          <p className="mt-2 font-body text-[12px] text-neutral-400">
            Under 5 %. Every one of these was scored and dismissed; the ring-2
            entries are rare diseases something in your data woke for a look.
          </p>
          <QuietRows rows={quiet.ruledOutRows} />
        </details>
      )}
    </div>
  );
}

/* ── 6. key trends ────────────────────────────────────────────────────── */

export function KeyTrends({ trends }: { trends: TrendMetric[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {trends.map((t) => (
        <Card key={t.metricCode} className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <Link
              href={`/m/${t.metricCode}`}
              className="font-display text-[13px] font-medium text-neutral-800 hover:underline"
            >
              {t.metricName}
            </Link>
            <span className="font-mono text-[10px] text-neutral-400">
              {t.points.length} readings
            </span>
          </div>

          <TrendChart
            height={140}
            data={t.points.map((p) => ({
              date: p.date,
              value: p.value,
              unit: t.unit,
            }))}
            referenceRangeLow={t.refLow}
            referenceRangeHigh={t.refHigh}
            optimalRangeLow={t.optimalLow}
            optimalRangeHigh={t.optimalHigh}
            goalLow={t.goalLow}
            goalHigh={t.goalHigh}
            unit={t.unit}
            status={t.status}
          />

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="font-display text-[26px] font-medium tracking-[-0.03em] text-neutral-900">
              {Number.isInteger(t.latestValue)
                ? t.latestValue
                : t.latestValue.toFixed(1)}
            </span>
            {t.unit && (
              <span className="font-mono text-[11px] text-neutral-400">
                {t.unit}
              </span>
            )}
          </div>
          <div className="mt-2">
            <RangeBar
              value={t.latestValue}
              prev={t.prevValue}
              refLow={t.refLow}
              refHigh={t.refHigh}
              optimalLow={t.optimalLow}
              optimalHigh={t.optimalHigh}
              goal={t.goalLow ?? t.goalHigh}
              unit={t.unit}
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Nothing uploaded yet: one line, one link. */
export function EmptyHome() {
  return (
    <Card className="border-dashed p-10 text-center">
      <p className="font-body text-[13px] text-neutral-500">
        No readings yet.{" "}
        <Link href="/labs" className="underline">
          Upload a lab PDF
        </Link>{" "}
        to get started.
      </p>
      <div className="mt-3 flex justify-center">
        <GeneratePlan />
      </div>
    </Card>
  );
}
