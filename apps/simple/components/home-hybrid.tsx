/**
 * The Hybrid Home, phase 40b (`docs/mockups/v4/ios-variations/53-web.html`):
 * the plum hero under the header, then the three columns. Server markup; the
 * goal toggle, the Watch rows, the rail and the case drawer are the client
 * pieces in `hunch-board.tsx`. Every string is built in `lib/home-hybrid.ts`.
 */
import Link from "next/link";
import type { HeadingRow, HunchRow, TodayBody } from "@/lib/api-contract";
import { headingSentence, type TodayLine } from "@/lib/home-hybrid";
import { cn, dayLabel } from "@/lib/utils";
import { EvidenceChip } from "./evidence-chip";
import { WatchList } from "./hunch-board";
import { DrawAgeRing, HEADING_ARROW, HeadingTile, Stamp } from "./ui-kit";

const WEEKDAY = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

/** 53 `.hd`: the sentence, the twelve tiles and the confidence line. */
export function HyHero({
  day,
  heading,
  confidence,
}: {
  day: string;
  heading: HeadingRow[];
  confidence: TodayBody["confidence"];
}) {
  const s = headingSentence(heading);
  const c = confidence;
  return (
    <header className="hy-hero">
      <div className="hg">
        <div>
          <small className="e">{WEEKDAY(day)}</small>
          <h1>
            {s.lead}
            <em>{s.away}</em>
            {s.rest}
          </h1>
          <p>{s.sub}</p>
        </div>
        <div className="strip">
          {heading.map((h, k) => (
            <HeadingTile
              key={h.id}
              name={h.name}
              word={h.word}
              why={h.why}
              style={{ "--k": k } as React.CSSProperties}
            />
          ))}
        </div>
      </div>
      <div className="conf">
        <DrawAgeRing days={c.days} />
        <span>
          {c.days == null ? (
            "No lab draw yet"
          ) : (
            <>
              Last draw <b>{c.days === 0 ? "today" : `${c.days} days ago`}</b>
            </>
          )}{" "}
          ·{" "}
          <b>
            {c.measured} of {c.total}
          </b>{" "}
          systems ·{" "}
          <b>
            {c.open} {c.open === 1 ? "hunch" : "hunches"}
          </b>{" "}
          open
        </span>
        <span className="sp" />
        <Link href="/blood/plan" className="due">
          {c.days != null && c.days >= 180
            ? "Retest due · plan a draw"
            : "Plan a draw"}
        </Link>
      </div>
    </header>
  );
}

/** 53's Today column: the day's score rows. */
export function TodayCol({ lines, day }: { lines: TodayLine[]; day: string }) {
  return (
    <div className="card">
      <div className="ttl">
        <h3>Today</h3>
        <small>{dayLabel(day)} · so far</small>
      </div>
      {lines.map((r) => (
        <div key={r.id} className="trow">
          <b>{r.name}</b>
          <small>{r.said}</small>
          <div
            className="trk"
            role="img"
            aria-label={`${r.name} ${Math.round(r.pct)} of 100`}
          >
            <i
              style={
                { width: `${r.pct}%`, "--c": r.tone } as React.CSSProperties
              }
            />
          </div>
        </div>
      ))}
      <p className="foot">
        Today&apos;s rows move by the hour. They do not move the blood.{" "}
        <Link href="/plan">Today&apos;s plan</Link>
      </p>
    </div>
  );
}

/** 53's Heading column: the goal row, then one row per system. */
export function HeadingCol({
  heading,
  lastDraw,
  goal,
}: {
  heading: HeadingRow[];
  lastDraw: string | null;
  goal: {
    code: string;
    name: string;
    word: "toward" | "away" | "holding";
    why: string;
  } | null;
}) {
  return (
    <div className="card">
      <div className="ttl">
        <h3>Heading</h3>
        <small>
          {lastDraw
            ? `from draws to ${dayLabel(lastDraw, true)}`
            : "no draws yet"}
        </small>
      </div>
      {goal && (
        <Link
          href={`/blood/m/${goal.code}`}
          className={cn("hrow goalrow", goal.word)}
        >
          <span className={cn("ar", goal.word)}>
            {HEADING_ARROW[goal.word]}
          </span>
          <span>
            <b>{goal.name} goal</b> · {goal.word}
          </span>
          <span className="why">{goal.why}</span>
        </Link>
      )}
      {heading.map((h) => (
        <div key={h.id} className={cn("hrow", h.word === "unmeasured" && "u")}>
          <span className={cn("ar", h.word)} aria-hidden="true">
            {HEADING_ARROW[h.word]}
          </span>
          <span>{h.name}</span>
          <span className={cn("word", h.word)}>
            {h.word === "unmeasured" ? "not measured" : h.word}
          </span>
          <span className="why" title={h.why}>
            {h.why}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 53's Watch column: the open hunches, then what the engine keeps in mind. */
export function WatchCol({
  rows,
  beliefs,
  genes,
}: {
  rows: HunchRow[];
  beliefs: { id: string; title: string }[];
  genes: {
    gene: string;
    call: string | null;
    verdict: string;
    grade: string;
  }[];
}) {
  const open = rows.filter((r) => r.kind !== "good_news");
  return (
    <div className="card">
      <div className="ttl">
        <h3>Watch</h3>
        <small>{open.length} open</small>
      </div>
      <WatchList rows={open} />
      {(beliefs.length > 0 || genes.length > 0) && (
        <div className="kept">
          <div className="lv">The engine keeps in mind</div>
          {beliefs.map((b) => (
            <span key={b.id}>
              <Stamp kind="belief" /> {b.title}
            </span>
          ))}
          {genes.map((g) => (
            <span key={g.gene}>
              <EvidenceChip basis="science" grade={g.grade} />{" "}
              <b>
                {g.gene}
                {g.call ? ` ${g.call}` : ""}
              </b>{" "}
              <small>· {g.verdict}</small>
            </span>
          ))}
          <Link href="/blood/genome" className="more">
            Your genome
          </Link>
        </div>
      )}
    </div>
  );
}
