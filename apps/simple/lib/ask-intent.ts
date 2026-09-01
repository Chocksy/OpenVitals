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
