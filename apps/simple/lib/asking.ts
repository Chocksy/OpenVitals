/**
 * One asking surface.
 *
 * The waist question used to render seven times: twice on Home, three times in
 * the graph panel, once on `/plan` and once on `/review`. Every one of them was
 * a live input, so the same answer could be given seven ways and the person
 * could not tell which one the engine was waiting on.
 *
 * The rule, written as a function: the Today card on Home takes the answer,
 * every other surface prints the same question as one line with what it would
 * move and links back. The pages render from `askSurfaces`, so the test that
 * counts inputs is counting the thing the pages actually draw.
 *
 * Pure. No database, no clock, no model.
 */
import type { Move } from "./infogain";

/** The id of the one input, and the href everything else points at. */
export const ASK_ID = "today-question";
export const ASK_HREF = `/#${ASK_ID}`;

/**
 * The link a surface that is not Today prints.
 *
 * It carries the key, because `/#today-question` alone was a dead end: the
 * Today card shows the question it ranked first, so "Answer" under "Do you
 * smoke?" landed on a card asking about waist size. With the key, Home renders
 * the question that was clicked first and then goes on with its own list.
 */
export const askHref = (key?: string): string =>
  key ? `/?ask=${encodeURIComponent(key)}#${ASK_ID}` : ASK_HREF;

/** One condition an answer would move, in the units the cards print. */
export interface AskMove {
  id: string;
  name: string;
  from: number;
  to: number;
}

export interface Ask {
  /** the profile fact key: the identity this question has on every surface */
  key: string;
  question: string;
  /** every condition this answer would move, as `nextMoves` listed them */
  moves: AskMove[];
}

const pct = (p: number) => Math.round(p * 100);

/** How small a move has to be before it is not worth printing. */
const NOISE = 0.005;

/** "Insulin resistance 64 → 81, High blood pressure 35 → 49, MASLD 40 → 20" */
export const effectLine = (moves: AskMove[], top = 3): string =>
  moves
    .slice(0, top)
    .map((m) => `${m.name} ${pct(m.from)} → ${pct(m.to)}`)
    .join(", ");

/**
 * The information-gain questions as one entry per fact key, with the deltas of
 * every condition each would move summed into it.
 *
 * `nextMoves` emits a move per question and each move carries its own per-
 * condition deltas, so the graph panel printed the waist question once per
 * condition. Here the key is the identity and the deltas are its payload.
 */
export function asksFromMoves(
  moves: Move[],
  nameOf: (id: string) => string,
): Ask[] {
  const by = new Map<string, Ask>();
  for (const mv of moves) {
    if (mv.kind !== "question") continue;
    const key = mv.featureId.replace(/^fact:/, "");
    const ask: Ask = by.get(key) ?? { key, question: mv.label, moves: [] };
    for (const hit of mv.moves) {
      const size = Math.abs(hit.to - hit.from);
      if (size < NOISE) continue;
      const seen = ask.moves.find((m) => m.id === hit.id);
      if (!seen) {
        ask.moves.push({
          id: hit.id,
          name: nameOf(hit.id),
          from: hit.from,
          to: hit.to,
        });
      } else if (size > Math.abs(seen.to - seen.from)) {
        seen.from = hit.from;
        seen.to = hit.to;
      }
    }
    by.set(key, ask);
  }
  // No re-sort: `Move.moves` already arrives biggest-first, and the line reads
  // in the order the engine listed the conditions.
  return [...by.values()].filter((a) => a.moves.length > 0);
}

/** One open question, as a page has it before the rule is applied. */
export interface OpenQuestion {
  id: string;
  question: string;
  options: string[];
  /** the profile fact key, when the row carries one */
  factKey?: string;
}

/** One question a page answers where it is asked. */
export interface InlineAsk extends OpenQuestion {
  /** "Answering moves Hashimoto's 62 → 88", when the engine knows */
  detail?: string;
}

/**
 * Phase 26 item 7. `/plan` printed its open questions as links to the Today
 * card on Home: you clicked "Answer", landed on Home, answered there, and were
 * left on Home with nothing said about where you had come from.
 *
 * The one-input rule was always per page — one place on a page takes an answer
 * for one question key — so `/plan` takes its own. This is that page's list:
 * one row per fact key, the first one wins, and each carries the line that
 * says what answering it moves.
 */
export function inlineAsks(open: OpenQuestion[], asks: Ask[]): InlineAsk[] {
  const by = new Map(asks.map((a) => [a.key, a]));
  const seen = new Set<string>();
  const out: InlineAsk[] = [];
  for (const q of open) {
    const key = q.factKey;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const moves = key ? by.get(key)?.moves : undefined;
    out.push({
      ...q,
      ...(moves?.length
        ? { detail: `Answering moves ${effectLine(moves)}` }
        : {}),
    });
  }
  return out;
}

/** Every question a page wants to ask, before the rule is applied. */
export interface PageAsks {
  /** keys the Today card already takes an answer for: the due re-asks */
  due: string[];
  /** the information-gain questions, best first */
  gain: Ask[];
  /** what every other surface on the page would have asked */
  others: { where: string; keys: string[] }[];
}

export interface AskPlan {
  /** the one question the Today card renders an input for */
  ask?: Ask;
  /** every key an input on this page takes an answer for */
  inputs: string[];
  /** every key some other surface prints as a line with a link */
  links: string[];
}

/**
 * The rule: at most one input per question key, and only ever on Today.
 *
 * The due re-asks are inputs because the Today card is where they live. The
 * best gain question joins them unless it is already one of them. Everything
 * any other surface wanted becomes a link, whether or not Today is asking it.
 *
 * `want` is the key a link asked for (`/?ask=smoking`). It wins the input,
 * because the person just told us which question they came to answer.
 */
export function askSurfaces(page: PageAsks, want?: string): AskPlan {
  const inputs = [...new Set(page.due)];
  // A key that is already a due re-ask has its input on Today; asking for it
  // again would put the same question on the card twice.
  const wanted =
    want && !inputs.includes(want)
      ? page.gain.find((a) => a.key === want)
      : undefined;
  const ask = wanted ?? page.gain.find((a) => !inputs.includes(a.key));
  if (ask && !inputs.includes(ask.key)) inputs.push(ask.key);
  return {
    ...(ask ? { ask } : {}),
    inputs,
    links: [...new Set(page.others.flatMap((s) => s.keys))],
  };
}
