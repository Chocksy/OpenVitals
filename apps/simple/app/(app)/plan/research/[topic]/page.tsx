/**
 * One topic: `docs/mockups/v4/topic.html`.
 *
 * Top to bottom, exactly as the drawing has it: the title with the relevance
 * sentence and the run line; the verdict strip, one row per outcome, grouped
 * by direction and best grade first; the two columns, "What the trials found"
 * beside "What is only an association"; "For you"; and the actions.
 *
 * Two rules the page is built around and never bends:
 *
 *  1. Direction is good or bad by the outcome, not by up or down. An adverse
 *     outcome going up is `off`, however strong the trial behind it, and a
 *     marker gets the same `BETTER_LOW` / `BETTER_HIGH` answer every ruler in
 *     the app already gives.
 *  2. The association column is never hidden, never collapsed, and keeps its
 *     heading when it is empty. A page that shows only the helpful trials is
 *     an advertisement.
 *
 * When the reading key cannot run, no verdict strip is drawn — not even an
 * empty one — and the papers print at "found, not read yet" with the reason.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, FileText } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { previewLines } from "@/lib/projections";
import { listWatch } from "@/lib/research-watch";
import {
  designWords,
  directionWords,
  findingsFor,
  getTopic,
  isAssociation,
  relevanceOf,
  topicPerson,
  toneOf,
  topicSince,
  verdictsOf,
  associationLine,
  TOPIC_DAYS,
} from "@/lib/topic-watch";
import type { TopicFinding } from "@/db";
import { dayLabel, plural } from "@/lib/utils";
import { EvidenceChip } from "@/components/evidence-chip";
import { DiscussPaper } from "@/components/research-now";
import { TopicActions } from "@/components/topic-actions";
import { StateWord } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

/** The day the next run is due: the last run plus the cadence. */
const nextRunDay = (lastRun: Date | null): string | null =>
  lastRun
    ? new Date(lastRun.getTime() + TOPIC_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;

function FindingRow({ row, topic }: { row: TopicFinding; topic: string }) {
  const association = isAssociation(row.studyType);
  const paper = row.paper;
  return (
    <div className="paper">
      <span className="pg">
        <FileText className="ic" aria-hidden="true" />
      </span>
      <div className="ptitle">{paper?.title ?? row.name}</div>
      <div className="pcite">
        {paper?.journal && (
          <span>
            {paper.journal}
            {paper.year ? ` · ${paper.year}` : ""}
          </span>
        )}
        <EvidenceChip basis="science" grade={row.grade} />
        <span>{designWords(row.studyType, row.n)}</span>
        {(row.dose || row.duration) && (
          <span>{[row.dose, row.duration].filter(Boolean).join(" · ")}</span>
        )}
        {row.population && <span>{row.population}</span>}
      </div>
      <p className="pfound">
        <b>{row.outcomeText}</b>
        {row.effect ? `: ${row.effect}` : ""} ·{" "}
        {directionWords(
          row.direction,
          toneOf(row.direction, row.outcomeText, row.outcomeFeatureId),
        )}
      </p>
      <div className="pmoves">
        {association ? (
          <>
            <StateWord tone="border">association</StateWord>
            <span>{associationLine(topic, row.studyType)}</span>
          </>
        ) : (
          <>
            <span className="arrow">quote →</span>
            <span>“{row.quote}”</span>
          </>
        )}
      </div>
      <div className="pact">
        {paper?.url && (
          <a
            className="b b-quiet b-sm"
            href={paper.url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="ic" aria-hidden="true" /> Open
          </a>
        )}
        <DiscussPaper title={paper?.title ?? row.name} />
      </div>
    </div>
  );
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic: raw } = await params;
  const userId = await requireUserId();
  const wanted = decodeURIComponent(raw);

  const row = await getTopic(userId, wanted);
  if (!row) notFound();

  const [findings, papers, person] = await Promise.all([
    findingsFor(row.topic),
    listWatch(userId, { topic: row.topic, limit: 200 }),
    topicPerson(userId),
  ]);

  const relevance = relevanceOf(row, person, findings);
  const verdicts = verdictsOf(findings);
  const trials = findings.filter((f) => !isAssociation(f.studyType));
  const associations = findings.filter((f) => isAssociation(f.studyType));
  const read = papers.filter((p) => p.grade != null || p.finding != null);
  const unread = papers.filter((p) => p.grade == null && p.finding == null);

  const marked = [
    ...new Set(findings.filter((f) => f.outcomeFeatureId).map((f) => f.name)),
  ];
  const preview = marked.length ? await previewLines(marked.slice(0, 4)) : {};
  const forYou = Object.values(preview);

  const lastRun = row.lastRunAt ?? null;
  const runLine = findings.length
    ? `${plural(read.length, "paper")} read · last run ${
        lastRun ? dayLabel(lastRun.toISOString().slice(0, 10), true) : "never"
      }`
    : `${plural(papers.length, "paper")} found · none read · ${
        lastRun
          ? `searched ${dayLabel(lastRun.toISOString().slice(0, 10), true)}`
          : "not searched yet"
      }`;

  return (
    <div className="stackv gap-[var(--s21)]">
      <div>
        <Link className="asklink" href="/plan?tab=research">
          <ChevronLeft className="ic" aria-hidden="true" />
          Research
        </Link>
      </div>

      {/* 01 · the topic, and the verdict strip */}
      <section className="panel">
        <div className="topichead">
          <h2>{row.label}</h2>
          <span className="rel">{relevance}</span>
          <span className="run">{runLine}</span>
        </div>

        {verdicts.length > 0 ? (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Outcome</th>
                  <th>Direction</th>
                  <th>What is behind it</th>
                  <th>Dose or window</th>
                </tr>
              </thead>
              <tbody>
                {verdicts.map((v) => (
                  <tr key={`${v.outcomeText}-${v.direction}`}>
                    <td className="k">{v.outcomeText}</td>
                    <td>
                      <StateWord tone={v.tone}>
                        {directionWords(v.direction, v.tone)}
                      </StateWord>
                    </td>
                    <td>
                      {v.association && (
                        <>
                          <StateWord tone="border">association</StateWord>{" "}
                        </>
                      )}
                      {plural(
                        v.trials,
                        v.association ? "study" : "trial",
                        v.association ? "studies" : "trials",
                      )}{" "}
                      <EvidenceChip basis="science" grade={v.grade} />
                    </td>
                    <td className="n">{v.doseRange ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* 04 · found, not read yet. No strip is drawn on this state, not
             even an empty one: four dashes read as four findings at a glance. */
          <div className="grid2">
            <div className="empty">
              <span className="k">Outcomes</span>
              <b className="t-title text-[length:var(--type-md)] font-normal">
                {papers.length ? "Found, not read yet" : "Nothing found yet"}
              </b>
              <p>
                {papers.length
                  ? `${plural(papers.length, "paper")} came back from Europe PMC for ${row.label} and none has been read. The reader could not run: nothing was written, nothing was graded, and no outcome is claimed here.`
                  : `Nothing has been searched for ${row.label} yet. The first run happens on the nightly pass, or now with the button below.`}
              </p>
              <Link href="#topic-actions">Read them now</Link>
            </div>
            <div className="empty">
              <span className="k">What is on file</span>
              <b className="t-title text-[length:var(--type-md)] font-normal">
                The titles, dated
              </b>
              <p>
                The titles, their journals and their years are stored and shown
                below at <b>found, not read yet</b>. They carry no grade,
                because a grade comes from the reading and inventing one would
                be the whole failure of this page.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* 02 · what the trials found, and what is only an association */}
      {findings.length > 0 && (
        <div className="grid2">
          <div className="panel">
            <div className="panel-head">
              <h3>What the trials found</h3>
              <span className="r">
                {plural(trials.length, "finding")} ·{" "}
                {new Set(trials.map((t) => t.outcomeText)).size} outcomes
              </span>
            </div>
            {trials.length ? (
              <div className="rowlist">
                {trials.map((f) => (
                  <FindingRow key={f.id} row={f} topic={row.label} />
                ))}
              </div>
            ) : (
              <p className="cap">
                No trial on file for {row.label} yet. Everything read so far is
                in the column beside this one.
              </p>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>What is only an association</h3>
              <span className="r">
                {plural(associations.length, "paper")} · nothing here moves a
                number
              </span>
            </div>
            {associations.length ? (
              <div className="rowlist">
                {associations.map((f) => (
                  <FindingRow key={f.id} row={f} topic={row.label} />
                ))}
              </div>
            ) : (
              <p className="cap">
                Nothing on file is only an association. The column is not hidden
                when it is empty: a page that shows only the helpful trials is
                an advertisement, and this column is what stops this one
                becoming that.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 03 · for you, and what you can do about it */}
      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <h3>For you</h3>
            <span className="r">{relevance}</span>
          </div>
          {forYou.length ? (
            <ul className="space-y-2">
              {forYou.map((line) => (
                <li key={line} className="t-body">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body">
              No projection is drawn: that needs a marker outcome with an effect
              size in the marker&rsquo;s own unit, and there is none on file for{" "}
              {row.label} yet.
            </p>
          )}
          <p className="cap mt-3">
            A projection is only ever drawn when two readings and a rate carry
            it. Nothing here is an estimate dressed as a measurement.
          </p>
        </div>

        <div id="topic-actions" className="panel scroll-mt-24">
          <div className="panel-head">
            <h3>{row.lastRunAt ? "Already watching" : "Watch this"}</h3>
            <span className="r">every {TOPIC_DAYS} days</span>
          </div>
          <TopicActions
            topic={row.topic}
            label={row.label}
            watching
            nextRun={nextRunDay(lastRun)}
            days={TOPIC_DAYS}
          />
          <p className="cap mt-3">
            Stopping the watch keeps every paper already read: it stops the next
            run, it does not delete a finding. The window the next run asks for
            starts {dayLabel(topicSince(lastRun), true)}.
          </p>
        </div>
      </div>

      {/* the papers, read or not */}
      {unread.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h3>Found, not read yet</h3>
            <span className="r">{plural(unread.length, "paper")}</span>
          </div>
          <div className="rowlist">
            {unread.map((p) => (
              <div className="paper" key={p.id}>
                <span className="pg">
                  <FileText className="ic" aria-hidden="true" />
                </span>
                <div className="ptitle">{p.title}</div>
                <div className="pcite">
                  {p.journal && <span>{p.journal}</span>}
                  {p.foundAt && (
                    <span>
                      found{" "}
                      {dayLabel(p.foundAt.toISOString().slice(0, 10), true)}
                    </span>
                  )}
                </div>
                <div className="pmoves">
                  <StateWord tone="none">found, not read yet</StateWord>
                  <span>
                    the reader could not run; the title and the journal are all
                    that is stored
                  </span>
                </div>
                <div className="pact">
                  {p.url && (
                    <a
                      className="b b-quiet b-sm"
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="ic" aria-hidden="true" /> Open
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
