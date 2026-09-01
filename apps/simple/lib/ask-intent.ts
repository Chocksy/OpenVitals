/**
 * What the ask box was actually asked.
 *
 * "Ask about anything — a disease, a symptom, a word" invited a question, and
 * then answered "how can I make sure I do not get type 2 diabetes?" with
 * "Nothing in HPO or MONDO matches that", because everything typed into it was
 * run through a trigram search over ontology names. A sentence is not a name.
 *
 * So the box routes first: a term goes to the lookup, a question goes to the
 * grounded answer, and `termQuery` pulls the disease out of the sentence so
 * the lookup can still say where it stands for this person.
 *
 * Pure. No database, no model: `lib/ask-intent.test.ts` and
 * `evals/ask-intent.ts` state the whole contract.
 */

export type AskRoute = "term" | "question";

/** The words a question starts with, when it does not end in a mark. */
const OPENERS =
  /^(how|what|whats|why|should|shall|can|could|would|will|is|are|am|do|does|did|when|where|which|who|whom|whose|tell|explain|help)\b/i;

/**
 * A term or a question?
 *
 * A question mark settles it. Otherwise the opening word does: "how can I …"
 * is a question, "haemochromatosis" is a term, and a bare "diabetes?" is
 * still a term dressed as one — which is fine, because the grounded answer
 * looks the term up as well.
 */
export function askIntent(text: string): AskRoute {
  const q = text.trim();
  if (!q) return "term";
  if (q.includes("?")) return "question";
  return OPENERS.test(q) ? "question" : "term";
}

/** What the composer was opened with. */
export interface Opening {
  text: string;
  /** the condition id a card's "Discuss" is about, when one opened the box */
  about?: string;
}

/** What the composer does about it. */
export interface OpeningMode {
  /** the box is asking, not telling: the button says Ask */
  ask: boolean;
  /** submit on open, with no second click */
  auto: boolean;
  /** read the words for facts while they type */
  drafts: boolean;
}

/** How many characters make a post worth reading for facts. */
const DRAFT_FLOOR = 6;

/**
 * Phase 26, items 1 and 4.
 *
 * Typing a question into the top line and pressing Ask used to open the
 * composer with the words in it and the hint "That reads like a question.
 * Press Ask." — one thought, two clicks. And "Discuss" put the condition's
 * name into the same box, where the fact reader read "Autoimmune thyroiditis"
 * as a phenotype the person had just claimed about themselves.
 *
 * Both are the same decision, so it is made once, here, and it is pure:
 * a question submits itself, a Discuss is a question whatever it looks like,
 * and neither of them ever runs the fact reader.
 */
export function openingMode({ text, about }: Opening): OpeningMode {
  const q = text.trim();
  /**
   * Phase 27, from the owner: Discuss on "Resistance training 3x/week",
   * typed "i already do this", and got back "I don't know that word. Ask it as
   * a question, or try the disease name." A subject used to force the ask
   * route whatever was typed, so a statement went to `/api/ask` with no
   * condition id, fell through to the ontology lookup, and matched nothing.
   *
   * A subject is what the words are ABOUT, not what kind of words they are.
   * The words decide: a question is asked, a statement is told, and an empty
   * box with a subject is somebody who pressed Discuss and has not typed yet.
   */
  const ask = q ? askIntent(q) === "question" : !!about;
  return {
    ask,
    auto: ask && q.length >= 2,
    drafts: !ask && q.length >= DRAFT_FLOOR,
  };
}

/**
 * Does the composer still show the text box?
 *
 * Phase 27, item 1: while a question was in flight the question line AND the
 * textarea both showed, with the same words in both. Once a question has been
 * submitted the question line owns those words; the box comes back empty when
 * "Ask another" clears the question.
 */
export const showsBox = ({
  question,
  answered,
}: {
  /** the question on screen, "" before anything has been asked */
  question: string;
  /** an answer is up */
  answered: boolean;
}): boolean => !question && !answered;

/**
 * Which opening submits itself, given the last one that did.
 *
 * The composer is mounted once by the layout and every page re-render runs its
 * effects again, so "submit on open" without a memory would submit on every
 * render. Each `openComposer` call carries a token; this returns the token to
 * remember, or null for "do nothing", and the composer stores what it returns.
 */
export const autoAskToken = (
  mode: OpeningMode,
  token: number,
  last: number,
): number | null => (mode.auto && last !== token ? token : null);

/**
 * The scaffolding a question is built from. Dropping all of it leaves the
 * thing the question is about: "how can I make sure I do not get type 2
 * diabetes?" → "type 2 diabetes".
 */
const SCAFFOLD = new Set(
  `a about am an and any are as at avoid be because been being can chance
   chances could develop developing did do does doing dont down for from get
   getting give got had has have having help how i if in is it its know less
   like likely lower make me mean means meaning more my no not of off on or out
   prevent probability really reduce risk shall should so stop sure take tell
   than that the their them then there they this to told up us very was way
   ways we what whats when where which who whom whose why will with would you
   your`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * The part of a question a disease name could be hiding in.
 *
 * Everything in `SCAFFOLD` comes out; what is left, in order, is what the
 * ontology search is given. When nothing is left the original text is used,
 * because a short question is usually its own subject ("what is apoB?").
 */
export function termQuery(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+\-/ ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((w) => !SCAFFOLD.has(w));
  return kept.length ? kept.join(" ") : text.trim();
}
