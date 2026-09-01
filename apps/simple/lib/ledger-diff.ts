/**
 * What one answer did, as a diff between two ledgers.
 *
 * Phase 24d. Answering the Today question used to reload the page: the
 * percentages changed with no continuity, the cards reordered silently, and
 * the one thing the interview promises — you told it something and the picture
 * moved — was invisible. The client now posts the answer, re-fetches
 * `GET /api/ledger`, and hands the two snapshots to `ledgerDiff`. The result
 * says which numbers to pop, which chips to swap, and which cards to move.
 *
 * Pure. No database, no clock, no DOM. `snapshotLedger` is the only thing that
 * knows the `Ledger` shape; everything below it works on plain numbers so the
 * tests can state the whole contract in one line each.
 */
import type { Ledger } from "./ledger";

/** One card, reduced to the four things that can visibly change. */
export interface CardSnapshot {
  id: string;
  /** 1-based position in the ledger, the order the cards are printed in */
  rank: number;
  /** the whole percent the card prints, or null when it prints none */
  percent: number | null;
  /** "likely", "possible", … or null for a marker card */
  state: string | null;
  title: string;
}

export interface LedgerSnapshot {
  cards: CardSnapshot[];
  counters: {
    optimal: number;
    normal: number;
    off: number;
    questions: number;
  };
  systems: { id: string; score: number }[];
}

export type CounterKey = keyof LedgerSnapshot["counters"];

export interface LedgerDiff {
  /** a printed percentage that changed: pop the digits in */
  numbers: { id: string; title: string; from: number | null; to: number }[];
  /** a state chip that flipped: swap the text */
  states: { id: string; title: string; from: string | null; to: string }[];
  /** a card that changed position: FLIP it to its new place */
  moved: { id: string; from: number; to: number }[];
  /** a cockpit counter that changed */
  counters: { key: CounterKey; from: number; to: number }[];
  /** a system ring whose score moved, in whole percent */
  systems: { id: string; from: number; to: number }[];
  /** cards the answer added, and cards it removed */
  entered: string[];
  left: string[];
  /** the sentence the toast prints; empty when nothing moved */
  line: string;
}

/** The whole percent a card prints, so the diff is what the eye sees. */
const pct = (p: number | undefined) => (p == null ? null : Math.round(p * 100));

/** The model Home renders, reduced to what can move. */
export function snapshotLedger(ledger: Ledger): LedgerSnapshot {
  return {
    cards: ledger.conclusions.map((c) => ({
      id: c.id,
      rank: c.rank,
      percent: pct(c.probability),
      state: c.state ?? null,
      title: c.title,
    })),
    counters: {
      optimal: ledger.counters.optimal,
      normal: ledger.counters.normal,
      off: ledger.counters.off,
      questions: ledger.counters.questions,
    },
    systems: ledger.systems.map((s) => ({
      id: s.id,
      score: Math.round(s.score * 100),
    })),
  };
}

const COUNTER_KEYS: CounterKey[] = ["optimal", "normal", "off", "questions"];

/** "Insulin resistance: likely" → "Insulin resistance". */
const nameOf = (title: string) => title.split(":")[0]!.trim();

/**
 * The sentence the toast prints.
 *
 * The biggest belief move leads, because that is the answer's whole point;
 * everything else is a count. Nothing moved is an empty string, and the caller
 * shows "Saved" on its own.
 */
function sentence(d: Omit<LedgerDiff, "line">): string {
  const parts: string[] = [];
  const biggest = [...d.numbers].sort(
    (a, b) => Math.abs(b.to - (b.from ?? 0)) - Math.abs(a.to - (a.from ?? 0)),
  )[0];
  if (biggest)
    parts.push(
      `${nameOf(biggest.title)} ${biggest.from ?? "—"} → ${biggest.to}`,
    );
  const rest = d.numbers.length - (biggest ? 1 : 0);
  if (rest > 0) parts.push(`${rest} more moved`);
  if (d.moved.length)
    parts.push(
      d.moved.length === 1
        ? "1 card reordered"
        : `${d.moved.length} cards reordered`,
    );
  if (d.entered.length) parts.push(`${d.entered.length} new`);
  return parts.join(" · ");
}

/** True when the diff has something worth animating. */
export const moved = (d: LedgerDiff): boolean =>
  d.numbers.length > 0 ||
  d.states.length > 0 ||
  d.moved.length > 0 ||
  d.counters.length > 0 ||
  d.systems.length > 0 ||
  d.entered.length > 0 ||
  d.left.length > 0;

/** Which cards moved, which numbers changed, in the order the page reads. */
export function ledgerDiff(
  before: LedgerSnapshot,
  after: LedgerSnapshot,
): LedgerDiff {
  const was = new Map(before.cards.map((c) => [c.id, c]));
  const now = new Map(after.cards.map((c) => [c.id, c]));

  const numbers: LedgerDiff["numbers"] = [];
  const states: LedgerDiff["states"] = [];
  const movedCards: LedgerDiff["moved"] = [];
  const entered: string[] = [];

  for (const card of after.cards) {
    const old = was.get(card.id);
    if (!old) {
      entered.push(card.id);
      continue;
    }
    if (card.percent != null && card.percent !== old.percent)
      numbers.push({
        id: card.id,
        title: card.title,
        from: old.percent,
        to: card.percent,
      });
    if (card.state && card.state !== old.state)
      states.push({
        id: card.id,
        title: card.title,
        from: old.state,
        to: card.state,
      });
    if (card.rank !== old.rank)
      movedCards.push({ id: card.id, from: old.rank, to: card.rank });
  }

  const left = before.cards.filter((c) => !now.has(c.id)).map((c) => c.id);

  const counters = COUNTER_KEYS.flatMap((key) =>
    before.counters[key] === after.counters[key]
      ? []
      : [{ key, from: before.counters[key], to: after.counters[key] }],
  );

  const wasSystem = new Map(before.systems.map((s) => [s.id, s.score]));
  const systems = after.systems.flatMap((s) => {
    const old = wasSystem.get(s.id);
    return old == null || old === s.score
      ? []
      : [{ id: s.id, from: old, to: s.score }];
  });

  const diff = {
    numbers,
    states,
    moved: movedCards,
    counters,
    systems,
    entered,
    left,
  };
  return { ...diff, line: sentence(diff) };
}
