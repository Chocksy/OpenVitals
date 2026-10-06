/**
 * Research: what the knowledge base learned lately, cut to this person.
 *
 * Phase 32a section 1, `docs/mockups/v4/research.html` sections 01, 02, 03 and
 * 05. One row a paper: the title, the journal with the grade the intake gave
 * it and the day it was published, one sentence of what it found, and what it
 * would move. A paper that moves nothing leaves that line off; the "for you"
 * line already says why it is on the list.
 *
 * The rows come from `paper_watch` through `listWatch`, already sorted unseen
 * first and then by what they move. Nothing here re-sorts, re-scores or
 * invents a sentence: `finding` is the intake's own quote and `moves` is the
 * scorer run twice, with and without the paper's rule.
 *
 * A title is not something a person can act on, so each row also says, from
 * what is stored: the paper in plain words (`summary`, written once by
 * `explainPapers`), why it is on this person's list (`whyShown`), the plan
 * action it stands behind when there is one, and two doors: ask about it, or
 * add that action.
 *
 * Server components, but for the writes: "Research now", "Ask about this"
 * and "Add to plan", which are in `components/research-now.tsx`.
 */
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { PaperWatch } from "@/db";
import {
  askAbout,
  summaryOf,
  whyShown,
  type PaperAction,
  type WatchCondition,
} from "@/lib/research-watch";
import { dayLabel, plural } from "@/lib/utils";
import { EvidenceChip } from "./evidence-chip";
import {
  AddPaperAction,
  DiscussPaper,
  ResearchNow,
  SeenOnOpen,
} from "./research-now";
import { WatchTopic } from "./topic-actions";
import { StateWord, type StateTone } from "./ui-kit";

/** Up on a condition is bad news, down is good, and no rule is neither. */
const MOVE_TONE: Record<string, StateTone> = {
  up: "off",
  down: "on",
  none: "none",
};

/** "four points", as the fraction `moves.delta` stores it. */
export const deltaWords = (delta: number): string => {
  const points = Math.abs(delta) * 100;
  const said = points >= 10 ? Math.round(points) : Math.round(points * 10) / 10;
  return `${said} point${said === 1 ? "" : "s"}`;
};

/** What the "moves →" line says about one row. */
export function movesLine(row: PaperWatch): string {
  if (!row.moves) return "nothing for you";
  const { direction, delta } = row.moves;
  return direction === "none"
    ? "no change to the number"
    : `${direction} ${deltaWords(delta)}`;
}

/** What a row needs beyond itself, from `paperNames` and `paperActions`. */
export interface PaperLookups {
  names?: Map<string, string>;
  actions?: Map<string, PaperAction>;
}

export function PaperRow({
  row,
  names,
  actions,
}: { row: PaperWatch } & PaperLookups) {
  const moved = row.moves;
  const summary = summaryOf(row);
  const action = actions?.get(row.externalId) ?? null;
  const about = row.conditionId.startsWith("topic:") ? null : row.conditionId;
  return (
    <div className="paper">
      <span className="pg">
        <FileText className="ic" aria-hidden="true" />
      </span>
      <div className="ptitle">{row.title}</div>
      <div className="pcite">
        {row.journal && <span>{row.journal}</span>}
        {row.grade && <EvidenceChip basis="science" grade={row.grade} />}
        {row.publishedAt && (
          <span>published {dayLabel(row.publishedAt, true)}</span>
        )}
        {row.foundAt && (
          <span>
            read {dayLabel(row.foundAt.toISOString().slice(0, 10), true)}
          </span>
        )}
      </div>
      {summary && <p className="psum">{summary}</p>}
      {row.finding && <p className="pfound">{row.finding}</p>}
      <div className="pmoves">
        <span className="arrow">for you →</span>
        <span>{whyShown(row, names)}</span>
      </div>
      {action && (
        <div className="pmoves">
          <span className="arrow">backs →</span>
          <span>
            {action.title}
            {action.dose ? ` · ${action.dose}` : ""}
          </span>
          <EvidenceChip basis="science" grade={action.grade} />
        </div>
      )}
      {/* A paper that moves nothing says so by saying nothing: "for you"
          above already says why it is here. */}
      {moved && (
        <div className="pmoves">
          <span className="arrow">moves →</span>
          <StateWord tone={MOVE_TONE[moved.direction] ?? "none"}>
            {moved.name}
          </StateWord>
          <span>{movesLine(row)}</span>
        </div>
      )}
      <div className="pact">
        {row.url && (
          <a
            className="b b-quiet b-sm"
            href={row.url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="ic" aria-hidden="true" /> Open
          </a>
        )}
        <DiscussPaper title={row.title} ask={askAbout(row)} about={about} />
        {action && <AddPaperAction id={action.id} title={action.title} />}
      </div>
    </div>
  );
}

/**
 * The whole page: New for you, Research now, and the empty state.
 *
 * The empty state names the day it looked and the conditions it looked for,
 * so "nothing new" reads as a result and not as a page that failed to load.
 */
/**
 * One topic on the list, as the Research section prints it. Phase 35 section
 * C, `topic.html` section 05.
 */
export interface TopicRow {
  topic: string;
  label: string;
  relevance: string;
  outcomes: number;
  papers: number;
  found: number;
  lastRunAt: string | null;
}

export function ResearchSection({
  rows,
  conditions,
  lastRun,
  cooldownDays,
  topics = [],
  topicDays = 30,
  names: paperNames,
  actions,
}: PaperLookups & {
  rows: PaperWatch[];
  conditions: WatchCondition[];
  /** the newest `found_at` this person has, as `YYYY-MM-DD`, or null */
  lastRun: string | null;
  cooldownDays: number;
  /** phase 35: the topics this person watches, and the box that adds one */
  topics?: TopicRow[];
  topicDays?: number;
}) {
  const moving = rows.filter((r) => r.moves != null).length;
  const names = conditions.map((c) => c.name);

  return (
    <section id="research" className="space-y-6 scroll-mt-24">
      <div className="panel">
        <div className="panel-head">
          <h3>New for you</h3>
          <span className="r">
            {plural(rows.length, "paper")} · {moving} moves something
            {lastRun ? ` · from the ${dayLabel(lastRun, true)} run` : ""}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            <span className="k">Papers</span>
            <b className="t-title text-[length:var(--type-md)] font-normal">
              {lastRun
                ? `No new papers since ${dayLabel(lastRun, true)}`
                : "No papers read yet"}
            </b>
            <p>
              {names.length
                ? `Nothing has been published for ${names.join(", ")} that changes a rule you are scored on. The watch runs again when a condition goes ${cooldownDays} days without a read.`
                : "There is no condition in your ledger at possible or louder yet, so there is nothing to watch for."}
            </p>
            {names.length > 0 && (
              <Link href="#research-now">Research one now</Link>
            )}
          </div>
        ) : (
          <div className="rowlist">
            {rows.map((row) => (
              <PaperRow
                key={row.id}
                row={row}
                names={paperNames}
                actions={actions}
              />
            ))}
            <SeenOnOpen
              ids={rows.filter((r) => r.seenAt == null).map((r) => r.id)}
            />
          </div>
        )}

        <p className="cap">
          Every row came through Europe PMC and the same intake that grades
          anything else. A paper only lands here when it touches a condition
          your ledger already has at possible or louder, and nothing it says
          moves a number until a human accepts the rule.
        </p>
      </div>

      {/* the topics list and the box that adds one: a topic is the thing you
          go looking for, and a paper is the thing that arrives */}
      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <h3>Topics</h3>
            <span className="r">
              {topics.length} watched ·{" "}
              {topics.reduce((n, t) => n + t.outcomes, 0)} outcomes ·{" "}
              {topics.filter((t) => t.papers === 0).length} waiting to be read
            </span>
          </div>
          {topics.length === 0 ? (
            <p className="cap">
              No topic on the list yet. An active protocol item that names a
              supplement becomes one on its own; the box beside this is for the
              other case — you read something and you want to know.
            </p>
          ) : (
            <div className="rowlist">
              {topics.map((t) => (
                <Link
                  key={t.topic}
                  className="markerrow said"
                  href={`/plan/research/${encodeURIComponent(t.topic)}`}
                >
                  <div className="nm">
                    <b>{t.label}</b>
                    <span>{t.relevance}</span>
                  </div>
                  <div className="t-meta text-[11px]">
                    {t.papers
                      ? `${plural(t.papers, "paper")} read`
                      : `${plural(t.found, "paper")} found`}
                  </div>
                  <div />
                  <div className="wd">
                    {t.outcomes ? (
                      <StateWord tone="on">
                        {plural(t.outcomes, "outcome")}
                      </StateWord>
                    ) : (
                      <StateWord tone="none">found, not read yet</StateWord>
                    )}
                    {t.lastRunAt && (
                      <div className="t-meta text-[11px]">
                        {dayLabel(t.lastRunAt)}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
          <p className="cap mt-3">
            Each topic runs again after {topicDays} days, inside the same token
            budget as the condition watch.
          </p>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Watch a topic</h3>
            <span className="r">a supplement, a drug, a practice</span>
          </div>
          <WatchTopic />
        </div>
      </div>

      <div id="research-now" className="panel scroll-mt-24">
        <div className="panel-head">
          <h3>Research now</h3>
          <span className="r">
            {lastRun ? `last run ${dayLabel(lastRun, true)}` : "never run"} ·{" "}
            {cooldownDays}-day cooldown
          </span>
        </div>
        {conditions.length === 0 ? (
          <p className="cap">
            Nothing to research: the run only asks about conditions your ledger
            has at possible or louder, and it has none.
          </p>
        ) : (
          <ResearchNow
            conditions={conditions.map((c) => ({
              id: c.id,
              name: c.name,
              probability: c.probability,
            }))}
          />
        )}
      </div>
    </section>
  );
}

/**
 * The compact three-line panel, on Plan under "Do this first" and on Home.
 *
 * It only appears when at least one row moves something: a panel that always
 * says "nothing new" trains the eye to skip it. The empty state lives on the
 * Research tab, which is where somebody who wants it goes.
 *
 * Exported for Home, which wires it itself.
 */
export function ResearchCompact({
  rows,
  href = "/plan?tab=research",
}: {
  rows: PaperWatch[];
  href?: string;
}) {
  const moving = rows.filter((r) => r.moves != null);
  if (moving.length === 0) return null;

  const shown = moving.slice(0, 2);
  const quiet = rows.length - shown.length;

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>New for you</h3>
        <span className="r">
          {moving.length} of {plural(rows.length, "paper")} moved something
        </span>
      </div>
      <div className="rowlist">
        {shown.map((row) => (
          <div key={row.id} className="markerrow said">
            <div className="nm">
              <b>{row.title}</b>
              {/* the plain line when there is one: a journal and a date
                  tell nobody what the paper found */}
              <span>
                {summaryOf(row) ??
                  [
                    row.journal,
                    row.publishedAt ? dayLabel(row.publishedAt, true) : null,
                    row.grade ? `grade ${row.grade}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
              </span>
            </div>
            <div />
            <div className="wd">
              <StateWord tone={MOVE_TONE[row.moves!.direction] ?? "none"}>
                {row.moves!.name}
              </StateWord>
            </div>
          </div>
        ))}
        {quiet > 0 && (
          <div className="markerrow said">
            <div className="nm">
              <b>{plural(quiet, "more paper")} moved nothing</b>
              <span>
                read, graded, and they changed no rule you are scored on
              </span>
            </div>
            <div />
            <div className="wd">
              <StateWord tone="none">no change</StateWord>
            </div>
          </div>
        )}
      </div>
      <div className="rowh mt-3">
        <Link className="asklink" href={href}>
          See all research
        </Link>
      </div>
    </section>
  );
}
