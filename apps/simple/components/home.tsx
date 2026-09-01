/**
 * Home: the cockpit row you read in three seconds, then the ledger of every
 * conclusion in rank order. `docs/mockups/home-options.html`, option B on top
 * of option A, drawn with the kit's own tokens.
 *
 * Server components throughout. The only client parts are the three buttons
 * that write: the inline answer, "Wrong value" and the fact box.
 *
 * Phase 25b: two families, four styles, one rule — monospace is for numbers,
 * units, codes and dates only. Every abbreviation the cards print goes through
 * `<Term>`, so "what is ALP?" is answered where the question is asked.
 */
import Link from "next/link";
import { CircleQuestionMark, FlaskConical, TriangleAlert } from "lucide-react";
import { ASK_HREF, type Ask } from "@/lib/asking";
import {
  changedLine,
  explainInput,
  explainKey,
  type Finding,
} from "@/lib/explain";
import { termFor } from "@/lib/glossary";
import type { Today } from "@/lib/home-data";
import type { Conclusion, Ledger } from "@/lib/ledger";
import type { Move } from "@/lib/infogain";
import type { HState, Grade, Lens } from "@/lib/hypotheses";
import { cn, formatDate } from "@/lib/utils";
import { AskLink } from "./ask-link";
import { EditFact, StillTrue, WrongValue } from "./client";
import { PostButton } from "./composer-button";
import { ActionButtons, GeneratePlan } from "./plan";
import { RangeBar } from "./range-bar";
import { StatusBadge } from "./status-badge";
import { Digits, SwapText } from "./motion";
import { Term, Terms } from "./term";
import { TodayAsk } from "./today-ask";
import { TrendChart } from "./trend-chart";
import { Badge, Card } from "./ui-kit";

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
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className={LABEL}>{title}</h2>
      {href && (
        <Link
          href={href}
          className="t-meta flex items-center gap-1 text-[12px] transition-colors hover:text-neutral-700"
        >
          {linkLabel}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}

/**
 * The four styles are in `app/globals.css`. Everything here is one of them:
 * a label is quiet sans, never mono, because "Biological age" is a phrase and
 * not a code.
 */
const LABEL =
  "t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400";
const WHY = "t-meta mt-1 text-[12px] text-neutral-500";
const one = (v: number) => v.toFixed(1);

/**
 * A small link that reads at 12 px but answers to a 40 px finger.
 * `.hit-40` is the pseudo-element from `surfaces.md`; the width stays the
 * link's own so two of them can never overlap.
 */
const SMALL_LINK =
  "hit-40 inline-flex cursor-pointer list-none items-center gap-1 t-meta text-[12px] text-neutral-500 hover:text-neutral-900";

/**
 * The lens badges said `ENERGY B · WEIGHT A · LIFESPAN A`, which is the
 * engine's vocabulary, not a person's. One line, the lens that weighs most,
 * with the grade the evidence earned.
 */
function lensLine(
  lenses: Partial<Record<Lens, { w: number; grade: Grade }>>,
): { lens: string; grade: Grade } | null {
  const best = Object.entries(lenses).sort((a, b) => b[1].w - a[1].w)[0];
  return best ? { lens: best[0], grade: best[1].grade } : null;
}

/**
 * "Today": the first card in the cockpit, and the shortest one.
 *
 * At most two answers worth re-asking, the one question the engine would ask
 * next, the last check-in's reply in one line, and nothing else. Phase 24a
 * made this the only place in the app that renders an input for a question;
 * every other surface prints the same question as a line and links here.
 *
 * Phase 25b named the three parts in words a person uses: "Still true?",
 * "One question", "You noted".
 */
export function TodayCard({
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
  const empty = !today.due.length && !today.post && !ask;
  /**
   * A link somewhere else said which question it came to answer, so that one
   * goes first and the card carries on with its own list underneath.
   */
  const due = askKey
    ? [...today.due].sort(
        (a, b) => Number(b.key === askKey) - Number(a.key === askKey),
      )
    : today.due;
  const askFirst = askKey != null && ask?.key === askKey;
  const stillTrue = (
    <>
      {due.length > 0 && <div className={LABEL}>Still true?</div>}
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
    <div className="space-y-1.5">
      <div className={LABEL}>One question</div>
      <TodayAsk ask={ask} options={askOptions} />
    </div>
  );
  return (
    <Card className="t-resize p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className={LABEL}>Today</div>
        <PostButton />
      </div>

      {empty ? (
        <p className="t-body mt-2 text-neutral-500">
          Nothing to ask today. Post anything with +.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
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
          {today.post && (
            <div className="space-y-1">
              <div className={LABEL}>You noted</div>
              <p className="t-body text-neutral-600">
                <span className="t-num mr-1.5 text-[11px] text-neutral-400">
                  {today.post.date}
                </span>
                {today.post.reply ?? `“${today.post.text}”`}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * "Since Aug 31: 0 resolved · 0 new · 0 stronger · 0 weaker" was a line of
 * zeros pretending to be news. Nothing moved is not a sentence, so it is not
 * printed; when something did move, only that part is — and "since yesterday"
 * is what a person calls the day before, so that is what it says.
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
        : `since ${formatDate(since.at)}`;
  return (
    <p className="t-meta text-[12px]">
      {parts.map(([label, n], i) => (
        <span key={label}>
          {i > 0 && " · "}
          <span className="t-num text-neutral-700">{n}</span> {label}
        </span>
      ))}
      {` ${when}`}
    </p>
  );
}

/** "ALP, a liver enzyme that also comes from bone, on any basic blood panel" */
function missingLine(labels: string[]): React.ReactNode {
  const first = termFor(labels[0] ?? "");
  if (labels.length === 1 && first) {
    const what = first.what.replace(/\.$/, "");
    return (
      <>
        Missing one number: <Term code={first.id}>{first.label}</Term>,{" "}
        {what.charAt(0).toLowerCase()}
        {what.slice(1)}, {first.where}.{" "}
      </>
    );
  }
  return (
    <>
      Missing <span className="t-num">{labels.length}</span> numbers:{" "}
      <Terms text={labels.join(", ")} />.{" "}
    </>
  );
}

export function Cockpit({ ledger, day }: { ledger: Ledger; day?: string }) {
  const { bioAge, bioAgeMissing, counters, since } = ledger;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Card className="p-4 lg:row-span-1">
          <div className={LABEL}>Biological age</div>
          {bioAge ? (
            <>
              <div className="mt-1 font-display text-[52px] font-light leading-none tracking-[-0.05em] tabular-nums text-neutral-900">
                {one(bioAge.pheno)}
                <span className="ml-2 font-display text-[18px] font-normal tracking-normal text-neutral-400">
                  at {bioAge.chrono}
                </span>
              </div>
              <p className={WHY}>
                <Term code="phenoage">PhenoAge</Term> from{" "}
                <span className="t-num">{bioAge.inputs.length}</span> routine
                markers
              </p>
            </>
          ) : (
            <>
              <div className="mt-1 font-display text-[52px] font-light leading-none tracking-[-0.05em] text-neutral-300">
                —
              </div>
              <p className={WHY}>
                {missingLine(bioAgeMissing)}
                <Link href="/labs" className="underline hover:text-neutral-800">
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
                className="hit-40 inline-flex items-center underline hover:text-neutral-800"
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
          {/* The codes are the engine's own keys. A person reads names. */}
          <p className={cn(WHY, "truncate")}>
            {counters.nextDrawCodes.length
              ? counters.nextDrawCodes.map((code, i) => (
                  <span key={code}>
                    {i > 0 && ", "}
                    <Term code={code}>{explainKey(code)}</Term>
                  </span>
                ))
              : "nothing queued"}
          </p>
        </Card>
      </div>

      <SinceLine since={since} day={day} />
    </div>
  );
}

/** Same three tones as the graph's importance bar, drawn as a ring. */
function ringColor(score: number) {
  if (score >= 0.6) return "var(--color-health-critical)";
  if (score >= 0.3) return "var(--color-health-warning)";
  return "var(--color-accent-500)";
}

/** "red" is the engine's word for it. A person says "off". */
const WORST_WORD = {
  red: "off",
  amber: "borderline",
  green: "good",
  gray: "no reading",
} as const;

const WORST_TONE = {
  red: "critical",
  amber: "warning",
  green: "normal",
  gray: "neutral",
} as const;

/**
 * Twelve systems in one scrolling row truncated every name and every value:
 * "Blood sugar and i…" over "hba1c 5…". So: a grid that wraps, three across
 * on a phone and six on a desktop, the full system name, the one marker that
 * drives the colour on its own line with its value and its unit, and the
 * status in a word. The name is the link, so nothing nests inside anything.
 */
export function SystemsGrid({ systems }: { systems: Ledger["systems"] }) {
  const r = 13;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {systems.map((s) => {
        const worst = s.worst;
        const href = worst ? `/m/${worst.code}` : "/graph";
        return (
          <Card
            key={s.id}
            className="flex flex-col items-center gap-1.5 p-2.5 text-center"
          >
            <Link
              href={href}
              className="flex flex-col items-center gap-1.5 hover:opacity-80"
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
                    className="fill-neutral-500 tabular-nums"
                    style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
                  >
                    {Math.round(s.score * 100)}
                  </text>
                )}
              </svg>
              <span className="t-title text-[12px] leading-tight text-neutral-800">
                {s.name}
              </span>
            </Link>

            {worst ? (
              <p className="t-meta text-[12px] leading-tight text-neutral-600">
                <Term code={worst.code}>{explainKey(worst.code)}</Term>{" "}
                <span className="t-num whitespace-nowrap text-neutral-800">
                  {worst.value ?? "?"}
                  {worst.unit ? ` ${worst.unit}` : ""}
                </span>
              </p>
            ) : (
              <p className="t-meta text-[12px] leading-tight">never measured</p>
            )}

            {worst && (
              <StatusBadge
                status={WORST_TONE[worst.status]}
                label={WORST_WORD[worst.status]}
              />
            )}
          </Card>
        );
      })}
    </div>
  );
}

const STATE_VARIANT: Record<HState, "critical" | "warning" | "secondary"> = {
  confirmed: "critical",
  likely: "critical",
  possible: "warning",
  unlikely: "secondary",
  ruled_out: "secondary",
};

/**
 * What "Discuss" opens the composer about. The card's title carries the state
 * ("Insulin resistance: likely"), and "About Insulin resistance: likely: " is
 * not a sentence anybody would type.
 */
const topicOf = (c: Conclusion) =>
  c.title.replace(/:\s*(confirmed|likely|possible|unlikely|ruled out)$/i, "");

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
          <li key={e.rule} className="t-body text-[12px] text-neutral-600">
            <Terms text={explainInput(e)} />{" "}
            <span className="t-num text-[11px] text-neutral-400">
              LR {e.lr}
            </span>
            <span className="t-meta text-[11px]"> · grade {e.grade}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The small list behind "Something's off?": every reading and fact it read. */
function NotRight({ inputs }: { inputs: Conclusion["inputs"] }) {
  if (!inputs.length) return null;
  return (
    <details>
      <summary className={SMALL_LINK}>
        <TriangleAlert className="size-3.5 text-neutral-400" />
        Something&rsquo;s off?
      </summary>
      <div className="mt-2 space-y-1.5 border-l-2 border-neutral-150 pl-3">
        {inputs.map((i) =>
          i.kind === "reading" ? (
            <div
              key={`r-${i.id}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="t-body text-[12px] text-neutral-700">
                <Terms text={i.label} />
              </span>
              <span className="t-num text-[11px] text-neutral-500">
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
  const top = c.next.find((m) => m.kind !== "question");
  const lens = lensLine(c.lenses);
  return (
    <Card
      data-card={c.id}
      className={cn("t-flip t-resize p-4", spear && "border-accent-500 p-5")}
    >
      {spear && (
        <div className="t-meta mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-accent-600">
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
                <SwapText text={c.state.replace("_", " ")} />
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
          "t-title mt-2 text-neutral-900",
          spear ? "text-[24px]" : "text-[17px]",
        )}
      >
        {c.title}
      </h3>

      {lens && (
        <p className="t-meta mt-1 text-[12px]">
          matters most for {lens.lens} (
          <Term code="grade">{`grade ${lens.grade}`}</Term>)
        </p>
      )}

      {verdict && (
        <p className="t-body mt-1.5 text-neutral-600">
          <Terms text={verdict} />
        </p>
      )}

      {c.changed && (
        <p className="t-meta mt-1.5 text-[12px]">{changedLine(c.changed)}</p>
      )}

      {(c.for.length > 0 || c.against.length > 0) && (
        <p className="t-body mt-2 text-[12px] text-neutral-600">
          <span className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            For ·{" "}
          </span>
          <Terms
            text={
              c.for
                .slice(0, 2)
                .map((e) => explainInput(e))
                .join(", ") || "nothing yet"
            }
          />
          <br />
          <span className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            Against ·{" "}
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

      {c.rangeBar && (
        <div className="mt-3">
          <RangeBar {...c.rangeBar} />
        </div>
      )}

      {c.projection && (
        <p className="t-body mt-3 flex items-center gap-2 border-l-2 border-accent-500 bg-accent-50 px-3 py-2 text-neutral-700">
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
          <Terms text={c.projection.line} />
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
            <Term code={c.trend.code}>{explainKey(c.trend.code)}</Term>,{" "}
            <span className="t-num">{c.trend.points.length}</span> draws
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
            topic={topicOf(c)}
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

      {/* One row, two quiet buttons: the two things a reader wants to say. */}
      <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-1">
        <details>
          <summary className={SMALL_LINK}>
            <CircleQuestionMark className="size-3.5 text-neutral-400" />
            Why?
          </summary>
          <div className="mt-2 space-y-2 border-t border-neutral-100 pt-2">
            <p className="t-meta text-[11px]">
              <Term code="likelihood_ratio">LR</Term> is how much a finding
              multiplies the odds; <Term code="grade">grade</Term> is how good
              the evidence behind it is.
            </p>
            <EvidenceList title="For" lines={c.for} />
            <EvidenceList title="Against" lines={c.against} />
            {c.missing.length > 0 && (
              <p className="t-meta text-[12px]">
                Never measured: <Terms text={c.missing.join(", ")} />
              </p>
            )}
            {c.confounded.length > 0 && (
              <p className="t-meta text-[12px]">
                Discounted: <Terms text={c.confounded.join(", ")} />
              </p>
            )}
            {c.next.length > 0 && (
              <p className="t-meta text-[12px]">
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
          </div>
        </details>

        <NotRight inputs={c.inputs} />
      </div>
    </Card>
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
          <h3 className="t-title text-[17px] text-neutral-900">
            {group.systemName}: {n} marker{n === 1 ? "" : "s"} off
          </h3>
          <span
            aria-label="Where these readings came from"
            className="hit-40 flex size-10 shrink-0 items-center justify-center text-[16px] leading-none text-neutral-400 hover:text-neutral-700"
          >
            …
          </span>
        </summary>
        <div className="mt-2 space-y-1.5 border-l-2 border-neutral-150 pl-3">
          {group.inputs.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-2">
              <span className="t-body text-[12px] text-neutral-700">
                <Terms text={i.label} />
              </span>
              <span className="t-num text-[11px] text-neutral-500">
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
              className="inline-flex h-10 items-center gap-1.5 border border-neutral-200 px-2.5 text-[12px] text-neutral-600 transition-[color,border-color] duration-150 ease-out hover:border-neutral-900 hover:text-neutral-900 active:scale-[0.96]"
            >
              <span className="t-body text-[12px]">{m.name}</span>
              <span className="t-num text-[11px]">{m.value}</span>
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
        <span className="t-num text-[10px] text-neutral-400">
          {formatDate(finding.at)}
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {finding.lines.map((line) => (
          <li key={line.label}>
            <span className="t-meta mr-2 inline-block border border-accent-200 bg-accent-50 px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] text-accent-600">
              {line.label}
            </span>
            <span className="t-body text-neutral-700">
              <Terms text={line.text} />
            </span>
          </li>
        ))}
      </ul>
      <Link
        href={finding.href}
        className="t-meta mt-3 inline-flex items-center gap-1 text-[12px] hover:text-neutral-900"
      >
        see all {finding.total}
        <span aria-hidden="true">→</span>
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
          <li key={i.code} className="t-body text-neutral-700">
            <Term code={i.code}>{i.name}</Term>{" "}
            <span className="t-num text-neutral-800">
              {i.from} → {i.to}
              {i.unit ? ` ${i.unit}` : ""}
            </span>{" "}
            <span className="t-meta text-[12px]">since {i.since}</span>
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
          className="t-meta flex justify-between gap-2 text-[12px]"
        >
          <span className="truncate">{r.name}</span>
          <span className="t-num">{quietPct(r.p)}</span>
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
  return (
    <div className="space-y-2">
      {quiet.unlikely > 0 && (
        <details>
          <summary className={SMALL_LINK}>
            Show {quiet.unlikely} unlikely
          </summary>
          <QuietRows rows={quiet.rows} />
        </details>
      )}
      {quiet.ruledOut > 0 && (
        <details>
          <summary className={SMALL_LINK}>
            Show {quiet.ruledOut} ruled out
          </summary>
          <p className="t-meta mt-2 text-[12px]">
            Under 5 %. Every one of these was scored and dismissed; the ring-2
            entries are rare diseases something in your data woke for a look.
          </p>
          <QuietRows rows={quiet.ruledOutRows} />
        </details>
      )}
    </div>
  );
}

/** Nothing uploaded yet: one line, one link. */
export function EmptyHome() {
  return (
    <Card className="border-dashed p-10 text-center">
      <p className="t-body text-neutral-500">
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
