/**
 * What a claim rests on, as one glyph instead of a printed word.
 *
 * Every action on every surface used to end with `[science, A]` or
 * `[opinion]`, which is the label doing its job and the page paying for it:
 * the owner read a plan and saw the same two words after every line. The label
 * itself is not the point, the basis is, so the basis becomes a mark — filled
 * circle for science, half circle for opinion, hollow circle for anecdote —
 * with the grade letter beside it and the sentence in the tooltip.
 *
 * Pure and client-safe on purpose: `components/evidence-chip.tsx` renders it
 * inside client components, and `lib/glossary.ts` (a server module, kept out
 * of the browser bundle) reads the same sentences for its own entries, so the
 * words exist once.
 */

/** The mark, by basis. Filled is settled, hollow is somebody's story. */
export const BASIS_GLYPH: Record<string, string> = {
  science: "●",
  opinion: "◐",
  anecdotal: "○",
};

/** What each basis means, in the words the glossary uses. */
export const BASIS_TIP: Record<string, string> = {
  science: "a study or a guideline says so",
  opinion: "a clinician's judgement, not a study",
  anecdotal: "somebody's experience, not a study",
};

/** What each grade was read off. A and B are settled; D and E are the horizon. */
export const GRADE_TIP: Record<string, string> = {
  A: "meta-analysis or guideline",
  B: "a randomised trial",
  C: "a cohort or a small trial",
  D: "a case series or a single report",
  E: "one report, with no study behind it",
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Science, grade A: meta-analysis or guideline." */
export function evidenceTip(basis: string, grade?: string | null): string {
  const g = (grade ?? "").toUpperCase();
  const head = g ? `${capitalise(basis)}, grade ${g}` : capitalise(basis);
  const body =
    GRADE_TIP[g] ?? BASIS_TIP[basis] ?? "where this claim comes from";
  return `${head}: ${body}.`;
}

/** The grade letter is only printed for science: D and E are anecdotal. */
export const showsGrade = (basis: string, grade?: string | null): boolean =>
  basis === "science" && !!grade;

/** One `[science, A]` the model printed inside its own prose. */
export interface LabelPiece {
  basis: string;
  grade?: string;
}

/**
 * The prose, split around its bracket labels.
 *
 * The model still writes `[science, A]` after an action, because the eval
 * reads those brackets to check the answer only claimed what it was given.
 * The renderer swaps them for the chip, so nothing prints a bracket.
 */
export function splitLabels(text: string): (string | LabelPiece)[] {
  const re = /\[(science|opinion|anecdotal)(?:\s*,\s*([A-Ea-e]))?\]/g;
  const out: (string | LabelPiece)[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push({
      basis: m[1]!.toLowerCase(),
      ...(m[2] ? { grade: m[2].toUpperCase() } : {}),
    });
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length ? out : [text];
}
