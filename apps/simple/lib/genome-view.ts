/**
 * The order and the counts `/blood/genome` prints, as pure functions.
 *
 * `docs/mockups/v4/genome.html` sections 01, 02 and 03. The page itself is a
 * server component over a database, so everything in it that could be wrong is
 * here instead, where `lib/genome-view.test.ts` can hold it: which card comes
 * first, which three rows Home is allowed to keep, which catalogue rows are
 * notes rather than risks, and how many genes and variants the catalogue
 * actually holds.
 *
 * Nothing here computes a verdict. `genomeVerdicts` in `lib/genome.ts` does
 * that once, and these functions only arrange what it returned.
 */
import { factorText, type ConditionVerdict } from "./genome";
import {
  firstSentence,
  GENOME_CATALOG,
  type GenomeRow,
} from "./genome-catalog";

/**
 * Closed first, then what moved a starting point up, then what changed
 * nothing — the mockup's order, and the order of how much an answer settles.
 * A closed question needs no test; a raised starting point needs a decision;
 * "no change" is the tail nobody has to read.
 *
 * Catalogue order survives inside each group, so the same file always draws
 * the same page.
 */
const RANK: Record<ConditionVerdict["direction"], number> = {
  down: 0,
  up: 1,
  none: 2,
};

export const orderVerdicts = (
  verdicts: ConditionVerdict[],
): ConditionVerdict[] =>
  verdicts
    .map((v, i) => ({ v, i }))
    .sort((a, b) => RANK[a.v.direction] - RANK[b.v.direction] || a.i - b.i)
    .map(({ v }) => v);

/** The answers that changed something. Home is only ever allowed these. */
export const movedVerdicts = (
  verdicts: ConditionVerdict[],
): ConditionVerdict[] => verdicts.filter((v) => v.direction !== "none");

/**
 * The state word and its tone for one verdict: `×1.4`, `excluded`, `LR 0.1`,
 * `no change`.
 *
 * The same words `verdictMark` prints on the card's side, so Home and the page
 * say one thing. The card lives in `components/verdict-card.tsx` and this is
 * `lib`, so the two are held together by a test in `lib/genome-view.test.ts`
 * rather than by an import from a component into a library.
 */
export function verdictWord(v: ConditionVerdict): {
  word: string;
  tone: "on" | "border" | "none";
} {
  if (v.direction === "up" && v.factor != null)
    return { word: `×${factorText(v.factor)}`, tone: "border" };
  if (v.direction === "down")
    return {
      word: v.absent
        ? "excluded"
        : `LR ${v.factor != null ? factorText(v.factor) : "—"}`,
      tone: "on",
    };
  return { word: "no change", tone: "none" };
}

/** A catalogue row that points at no condition: read, but never a risk. */
export interface GenomeNote {
  id: string;
  gene: string;
  /** what it does instead, in the catalogue's own words */
  says: string;
}

/**
 * The rows with an empty `conditions` array. They are read, stored and
 * printed, and they can never move a likelihood, so the page says what they do
 * instead and nothing more than the catalogue already wrote.
 */
export const genomeNotes = (rows: GenomeRow[] = GENOME_CATALOG): GenomeNote[] =>
  rows
    .filter((r) => !r.conditions.length)
    .map((r) => ({ id: r.id, gene: r.gene, says: firstSentence(r.effect)[0] }));

/** What the catalogue holds, counted rather than remembered. */
export const genomeCounts = (rows: GenomeRow[] = GENOME_CATALOG) => ({
  genes: rows.length,
  rsids: new Set(rows.flatMap((r) => r.rsids)).size,
  /** how many rows point at a condition at all */
  conditions: rows.filter((r) => r.conditions.length).length,
});
