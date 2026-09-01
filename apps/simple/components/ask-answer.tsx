"use client";

/**
 * The answer to a question, in the order a person reads it.
 *
 * The old shape led with "Ring 1: scored for everybody, every time, including
 * you", then a MONDO id, then a base rate, and the sentence about *this person*
 * was fourth. The owner's verdict on it was "a little bit too much". So: the
 * sentence about you first, what would settle it as three short rows, and every
 * word the engine uses about itself folded into one disclosure.
 *
 * Shared by the composer (phase 25b's one asking surface) and by the ask box
 * that `/brain` and the graph still render.
 */
import { Sparkles } from "lucide-react";

export interface AskMove {
  kind: string;
  label: string;
  cost: number;
  why: string;
}

export interface AskTerm {
  id: string;
  ontology: string;
  name: string;
  score: number;
  via?: string;
}

export interface Answer {
  matches: AskTerm[];
  term: AskTerm | null;
  condition: {
    id: string;
    name: string;
    ring: number;
    inCatalog: boolean;
    prior: number | null;
    priorSource: string | null;
  } | null;
  woken: { status: string; trigger: string; note: string | null } | null;
  probability: number | null;
  state: string | null;
  moves: AskMove[];
  finding: { present: boolean | null; because: string | null } | null;
  canConsider: boolean;
  sentence?: string;
  /** the grounded answer, when the box was asked a question */
  reply?: string;
  route?: "term" | "question";
  error?: string;
}

const pct = (p: number) =>
  p >= 0.01 ? `${Math.round(p * 100)} %` : `${(p * 100).toPrecision(2)} %`;

/** The engine's five states, in the words a person would use. */
const STATE_WORD: Record<string, string> = {
  confirmed: "confirmed",
  likely: "likely",
  possible: "possible",
  unlikely: "unlikely",
  ruled_out: "ruled out",
};

/**
 * "Type 2 diabetes is unlikely for you: 13 %, up from a 9 % base rate."
 *
 * The one line the answer leads with. Everything in it is the engine's own
 * arithmetic; no model writes any part of this.
 */
export function leadSentence(a: Answer): string | null {
  const name = a.condition?.name ?? a.term?.name;
  if (!name) return null;
  if (a.probability == null)
    return `${name}: nothing in your data has been scored against it yet.`;
  const state = a.state ? (STATE_WORD[a.state] ?? a.state) : null;
  const head = state
    ? `${name} is ${state} for you: ${pct(a.probability)}`
    : `${name}: ${pct(a.probability)}`;
  const prior = a.condition?.prior;
  if (prior == null) return `${head}.`;
  const way =
    a.probability > prior ? "up" : a.probability < prior ? "down" : "level";
  return way === "level"
    ? `${head}, the same as the ${pct(prior)} base rate.`
    : `${head}, ${way} from a ${pct(prior)} base rate.`;
}

/** Where the engine stands on this word, without the word "ring". */
function standing(a: Answer): string {
  if (!a.condition)
    return a.term?.ontology === "HP"
      ? "That is a symptom, not a disease. It is one of the things this app reads."
      : "A known medical word, but not something this app scores yet.";
  if (a.condition.inCatalog)
    return "This app scores this one for everybody, every time, including you.";
  if (a.woken?.status === "awake")
    return `This app started scoring it because ${
      a.woken.trigger === "user"
        ? "you asked about it"
        : `something in your data pointed at it (${a.woken.trigger})`
    }.`;
  if (a.woken?.status === "dismissed")
    return `This app looked at it and set it aside. ${a.woken.note ?? ""}`.trim();
  return "Known by name and by how common it is, but nothing in your data points at it, so it is not being scored.";
}

/**
 * `/api/ask` hands back the move's cost without the `priced` flag that says
 * whether the number is euros or a 1–4 band, so the only honest thing to
 * print is the one case that needs no unit: a question costs nothing.
 */
const isFree = (m: AskMove) => m.cost === 0;

export function AskAnswer({
  answer,
  onPick,
  children,
}: {
  answer: Answer;
  /** re-ask with another name from the "also matched" list */
  onPick?: (name: string) => void;
  /** "Consider this for me", when the caller offers it */
  children?: React.ReactNode;
}) {
  const lead = leadSentence(answer);

  if (answer.error)
    return (
      <p className="t-body mt-2 text-[var(--color-health-critical)]">
        {answer.error}
      </p>
    );

  if (!answer.term && !answer.reply)
    return (
      <p className="t-body mt-3 text-neutral-500">
        I don&rsquo;t know that word. Ask it as a question, or try the disease
        name.
      </p>
    );

  return (
    <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
      {lead && <p className="t-body text-[14px] text-neutral-900">{lead}</p>}

      {answer.finding && (
        <p className="t-body text-neutral-600">
          {answer.finding.present == null
            ? "You have not answered anything that would say whether you have it."
            : answer.finding.present
              ? `You have it: ${answer.finding.because}.`
              : `You do not have it: ${answer.finding.because}.`}
        </p>
      )}

      {answer.reply && (
        <p className="t-body whitespace-pre-line text-neutral-800">
          {answer.reply}
        </p>
      )}

      {answer.sentence && (
        <p className="t-body flex items-start gap-1.5 italic text-neutral-600">
          <Sparkles className="mt-[3px] size-3 shrink-0 text-neutral-300" />
          {answer.sentence}
        </p>
      )}

      {answer.moves.length > 0 && (
        <div>
          <p className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            What would settle it
          </p>
          <ul className="mt-1 space-y-1">
            {answer.moves.slice(0, 3).map((m) => (
              <li key={`${m.kind}:${m.label}`} className="t-body">
                {m.label}
                {isFree(m) && (
                  <span className="t-meta text-[12px]"> · free</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}

      <details>
        <summary className="hit-40 t-meta inline-flex cursor-pointer list-none items-center text-[12px] hover:text-neutral-900">
          Where this comes from
        </summary>
        <div className="mt-2 space-y-1 border-l-2 border-neutral-150 pl-3">
          <p className="t-meta text-[12px]">{standing(answer)}</p>
          {answer.condition?.priorSource && (
            <p className="t-meta text-[12px]">
              Base rate: {answer.condition.priorSource}
            </p>
          )}
          {answer.term && (
            <p className="t-meta text-[12px]">
              Matched{" "}
              <span className="t-num text-[11px]">{answer.term.id}</span>
              {answer.term.via ? ` on “${answer.term.via}”` : ""}
            </p>
          )}
          {answer.matches.length > 1 && (
            <p className="t-meta text-[12px]">
              Also matched:{" "}
              {answer.matches.slice(1, 5).map((m, i) => (
                <span key={m.id}>
                  {i > 0 && " · "}
                  {onPick ? (
                    <button
                      className="cursor-pointer underline decoration-dotted hover:text-neutral-900"
                      onClick={() => onPick(m.name)}
                    >
                      {m.name}
                    </button>
                  ) : (
                    m.name
                  )}
                </span>
              ))}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
