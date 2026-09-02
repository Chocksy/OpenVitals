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
import { WORST_WORD, type RailCard, type RailTone } from "@/lib/home-data";
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

function Card({ card, i }: { card: RailCard; i: number }) {
  const tone = `tone-${card.tone}`;
  return (
    <li>
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
      </Link>
    </li>
  );
}

export function HomeRail({ cards }: { cards: RailCard[] }) {
  return (
    <div className="rail-wrap">
      <ul
        className="rail"
        aria-label="Your status, body, blood, plan and systems"
      >
        {cards.map((c, i) => (
          <Card key={`${c.kind}-${c.label}`} card={c} i={i} />
        ))}
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

/** Every system, measured or not. The rail can hide a card; this cannot. */
export function SystemChips({ systems }: { systems: Ledger["systems"] }) {
  return (
    <ul className="chips">
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
