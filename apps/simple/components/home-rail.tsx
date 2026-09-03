/**
 * The top of Home: one sentence over August's light, then Kite's rail.
 *
 * On a phone the rail is a horizontal, snapping row you swipe; on a desktop
 * the same cards become the v4 grid. Pure CSS in `app/globals.css` does both,
 * so this stays a server component and nothing here touches the DOM.
 *
 * A rail hides content, which is why the twelve systems repeat below it as
 * chips: `SystemChips` prints every system, measured or not.
 */
import Link from "next/link";
import {
  WORST_WORD,
  type RailCard,
  type RailGoal,
  type RailTone,
  type SystemTile,
} from "@/lib/home-data";
import type { Ledger } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { Digits } from "./motion";

const TONE_VAR: Record<RailTone, string> = {
  bad: "var(--bad)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  none: "var(--ink-3)",
};

const TONE_OF = {
  red: "bad",
  amber: "warn",
  green: "ok",
  gray: "none",
} as const;

/** Kite's ▲: the one glyph that says "this is off", never a colour alone. */
const Off = () => (
  <span aria-hidden="true" className="mr-1 text-[0.5em] align-middle">
    ▲
  </span>
);

/**
 * The goals card: `system.html` section 08's goal row, at card size.
 *
 * Phase 34 section 1. It is the first thing on the phone rail and sits beside
 * Status on a desktop, which is grid placement in `globals.css` and no
 * second markup. Each row is its own link to its own marker, so the card is a
 * list of links rather than one link over a list, and nothing here computes:
 * every string was built on the server.
 */
function Goals({ card, i }: { card: RailCard; i: number }) {
  return (
    <li data-rail="goals">
      <div className="rail-card" style={{ "--i": i } as React.CSSProperties}>
        <span className="c-label">{card.label}</span>
        <div className="railgoals">
          {(card.goals ?? []).map((g: RailGoal) => (
            <Link key={g.code} href={`/blood/m/${g.code}`} className="goalrow">
              <div>
                <b>
                  {g.name} {g.said}
                </b>
                <div className="c-line">
                  <span className={`tone-${g.paceTone}`}>{g.pace}</span>
                </div>
              </div>
              <div className="tgt">{g.now}</div>
              <div className="progress">
                <i style={{ "--p": `${g.progress}%` } as React.CSSProperties} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </li>
  );
}

function Card({ card, i }: { card: RailCard; i: number }) {
  const tone = `tone-${card.tone}`;
  return (
    <li data-rail={card.kind}>
      <Link
        href={card.href}
        className={cn("rail-card", card.kind === "status" && "navy")}
        style={{ "--i": i } as React.CSSProperties}
      >
        {card.kind === "status" && (
          <span
            aria-hidden="true"
            className="c-bar"
            style={{ background: TONE_VAR[card.tone] }}
          />
        )}
        <span className="c-label">{card.label}</span>

        {card.counts ? (
          <span className="flex items-end gap-[var(--sp-4)]">
            {card.counts.map((c) => (
              <span key={c.word} className={cn("flex flex-col gap-[var(--sp-1)]", `tone-${c.tone}`)}>
                <Digits className="c-num" text={String(c.n)} />
                <span className="c-word">{c.word}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="flex items-baseline gap-[var(--sp-3)]">
            {card.big === "num" ? (
              <span className={cn("c-num", tone)}>
                {card.tone === "bad" && <Off />}
                <Digits text={card.headline} />
              </span>
            ) : (
              <span className="c-title">{card.headline}</span>
            )}
            {card.sub && <span className="c-sub">{card.sub}</span>}
          </span>
        )}

        {card.line && <span className="c-line">{card.line}</span>}
        {card.line2 && <span className="c-line">{card.line2}</span>}
      </Link>
    </li>
  );
}

export function HomeRail({ cards }: { cards: RailCard[] }) {
  return (
    <div className="rail-wrap">
      <ul
        className="rail"
        aria-label="Your goals, status, body, blood, plan and systems"
      >
        {cards.map((c, i) =>
          c.kind === "goals" ? (
            <Goals key="goals" card={c} i={i} />
          ) : (
            <Card key={`${c.kind}-${c.label}`} card={c} i={i} />
          ),
        )}
      </ul>
    </div>
  );
}

/**
 * August's light: three blurred blobs whose hue follows the worst band. Three
 * is the budget — the mockup's own cost note says a fourth layer is what makes
 * this expensive to paint.
 */
export function HomeLight({ tone }: { tone: RailTone }) {
  const hue: Record<RailTone, [string, string, string]> = {
    bad: ["var(--bad-fill)", "var(--warn)", "var(--canvas-deep)"],
    warn: ["var(--warn)", "var(--sky)", "var(--canvas-deep)"],
    ok: ["var(--sky)", "var(--ok)", "var(--canvas-deep)"],
    none: ["var(--canvas-deep)", "var(--ink-3)", "var(--canvas-deep)"],
  };
  const [a, b, c] = hue[tone];
  return (
    <div aria-hidden="true" className="home-light">
      <span className="blob b1" style={{ background: a }} />
      <span className="blob b2" style={{ background: b }} />
      <span className="blob b3" style={{ background: c }} />
    </div>
  );
}

/**
 * The twelve systems as state tiles: the section that owns them on desktop.
 *
 * Phase 30d, UX note 10. The systems used to be drawn twice above 768 px —
 * once as rail cards, once as chips — and the rail's extra cards pushed
 * Status into a two-row block with nothing under it. From 768 px up the rail
 * carries Status, Body, Blood and Plan only, and this is where the systems
 * live; below it the phone keeps the rail's cards and the chips repeat them,
 * because a rail hides what it scrolls past.
 */
export function SystemTiles({ tiles }: { tiles: SystemTile[] }) {
  return (
    <ul className="sysgrid" aria-label="Every system">
      {tiles.map((t) => (
        <li key={t.id} className="contents">
          <Link
            href={t.href}
            className={cn(
              "systile",
              t.tone === "bad" && "off",
              t.tone === "warn" && "border",
              t.tone === "ok" && "on",
              t.tone === "none" && "empty",
            )}
          >
            <span className="sname">{t.name}</span>
            <span className="sstate">
              {t.word}
              {t.tone === "bad" && (
                <span aria-hidden="true" className="tri">
                  {" "}
                  ▲
                </span>
              )}
            </span>
            <span className="sval">
              <span>
                <b>
                  {t.value ?? "—"}
                  {t.unit && <em>{t.unit}</em>}
                </b>
                <span className="smk">{t.markerName ?? "no marker yet"}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Every system, measured or not. The rail can hide a card; this cannot. */
export function SystemChips({ systems }: { systems: Ledger["systems"] }) {
  return (
    <ul className="chips systems">
      {systems.map((s) => {
        const status = s.worst?.status;
        const tone = status ? TONE_OF[status] : "none";
        return (
          <li key={s.id}>
            <Link
              href={s.worst ? `/blood/m/${s.worst.code}` : "/graph"}
              className={cn("chip", tone === "bad" && "tone-bad")}
            >
              <span
                aria-hidden="true"
                className={cn("chip-dot", `tone-${tone}`)}
              />
              {s.name}
              <span className="chip-word">
                {status ? WORST_WORD[status] : "never measured"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
