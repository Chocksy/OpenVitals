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
import { ChevronDown, FileText, Sparkles } from "lucide-react";
import { ActOnIt, type Acts } from "./act-on-it";
import { EvidenceChip, LabelledProse } from "./evidence-chip";

/**
 * How a question takes its answer.
 *
 * Phase 31a follow-up. The ask-back card under a thread answer printed "Which
 * supplements do you take, and at what dose? Separate with commas." with Yes /
 * No / Not sure beside it, because an empty option list fell through to a
 * hardcoded yes-or-no. A question that carries options is answered by picking
 * one; a question that carries none is answered in words, and the only honest
 * control for that is a text box. `free: true` in `PROFILE_QUESTIONS` is the
 * same thing said the other way round, so both arrive here as "no options".
 *
 * Pure, so `components/ask-answer.test.tsx` is the whole contract.
 */
export const answerShape = (
  options?: string[] | null,
): "options" | "text" =>
  options && options.length > 0 ? "options" : "text";

/** One paper or guideline the answer cited, with the row's own quote. */
export interface AskSource {
  id: string;
  name: string;
  year: number | null;
  grade: string;
  quote: string | null;
}

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
  /** where the named condition stands for this person, right now */
  now?: {
    id: string;
    name: string;
    state: string;
    probability: number;
  } | null;
  route?: "term" | "question";
  /** phase 27: what the answer named, as things the buttons can do */
  acts?: Acts;
  /** phase 28a: which question was asked, decided in code */
  kind?: string;
  /** phase 28a: the papers the answer cited, after the guard */
  sources?: AskSource[];
  /** phase 28c: this answer can become a thread */
  threadable?: boolean;
  error?: string;
}

/**
 * The papers under a research or prognosis answer.
 *
 * Phase 28a. "What does the research say?" used to be answered out of the
 * model's memory, with no way to check it. The rows come from the prompt's own
 * candidate list and survive `pickActs`, so every name printed here is a row on
 * file; the hover is the sentence the intake kept, when the row has one.
 */
export function Sources({ sources }: { sources?: AskSource[] }) {
  if (!sources?.length) return null;
  return (
    <div className="sources">
      <span className="k">Sources</span>
      {sources.map((s) => {
        const letter = /^[A-E]$/i.test(s.grade);
        const glyph = (
          <EvidenceChip
            basis={letter ? "science" : s.grade}
            grade={letter ? s.grade.toUpperCase() : null}
          />
        );
        return (
          <span key={s.id}>
            {glyph}{" "}
            {s.quote ? (
              <span className="ov-term">
                <button type="button" className="ov-term-trigger hit-40">
                  {s.name}
                </button>
                <span role="tooltip" className="ov-term-tip">
                  <span className="ov-term-tip-title">{s.name}</span>
                  <span className="ov-term-tip-line">
                    &ldquo;{s.quote}&rdquo;
                  </span>
                  <span className="ov-term-tip-meta">
                    {s.year ? `${s.year}. ` : ""}Grade {s.grade}.
                  </span>
                </span>
              </span>
            ) : (
              s.name
            )}
            {s.year ? ` · ${s.year}` : ""}
          </span>
        );
      })}
    </div>
  );
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
  onLeave,
  children,
}: {
  answer: Answer;
  /** re-ask with another name from the "also matched" list */
  onPick?: (name: string) => void;
  /** close the box when a chip in the "Act on it" row navigates away */
  onLeave?: () => void;
  /** "Consider this for me", when the caller offers it */
  children?: React.ReactNode;
}) {
  const lead = leadSentence(answer);

  if (answer.error)
    return (
      <p className="t-body mt-2 text-[var(--bad)]">{answer.error}</p>
    );

  /**
   * A question gets the answer and nothing else.
   *
   * Every question used to open with the ontology lookup's own header —
   * "Hashimoto thyroiditis: nothing in your data has been scored against it
   * yet" — on a person whose Hashimoto's is confirmed one card below, because
   * the question route still ran the term search and this component still
   * printed its lead line. The header belongs to the term route. Here the only
   * thing above the answer is where the named condition actually stands.
   */
  if (answer.route === "question")
    return (
      <div className="mt-3 space-y-2 border-t border-[var(--hair)] pt-3">
        {answer.now && (
          <div className="stateline">
            <FileText className="ic" aria-hidden="true" />
            <span>
              Right now: {answer.now.name} —{" "}
              {STATE_WORD[answer.now.state] ?? answer.now.state},{" "}
              <b className="t-num">{pct(answer.now.probability)}</b>
            </span>
          </div>
        )}
        {answer.reply ? (
          <p className="answer whitespace-pre-line">
            <LabelledProse text={answer.reply} />
          </p>
        ) : (
          <p className="t-meta">No answer came back. Try asking it again.</p>
        )}
        <Sources sources={answer.sources} />
        <ActOnIt acts={answer.acts} onLeave={onLeave} />
        {children}
      </div>
    );

  if (!answer.term && !answer.reply)
    return (
      <p className="t-meta mt-3">
        I don&rsquo;t know that word. Ask it as a question, or try the disease
        name.
      </p>
    );

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--hair)] pt-3">
      {lead && <p className="answer m-0">{lead}</p>}

      {answer.finding && (
        <p className="t-body">
          {answer.finding.present == null
            ? "You have not answered anything that would say whether you have it."
            : answer.finding.present
              ? `You have it: ${answer.finding.because}.`
              : `You do not have it: ${answer.finding.because}.`}
        </p>
      )}

      {answer.reply && (
        <p className="answer whitespace-pre-line">
          <LabelledProse text={answer.reply} />
        </p>
      )}

      <ActOnIt acts={answer.acts} onLeave={onLeave} />

      {answer.sentence && (
        <p className="t-body flex items-start gap-1.5 italic">
          <Sparkles className="ic mt-[3px] text-[var(--ink-3)]" aria-hidden="true" />
          {answer.sentence}
        </p>
      )}

      {answer.moves.length > 0 && (
        <div>
          <p className="t-meta">What would settle it</p>
          <ul className="mt-1 space-y-1">
            {answer.moves.slice(0, 3).map((m) => (
              <li key={`${m.kind}:${m.label}`} className="t-body">
                {m.label}
                {isFree(m) && <span className="t-meta"> · free</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}

      <details className="disclose">
        <summary>
          Where this comes from
          <ChevronDown className="ic" aria-hidden="true" />
        </summary>
        <div className="inner space-y-1">
          <p className="t-meta">{standing(answer)}</p>
          {answer.condition?.priorSource && (
            <p className="t-meta">Base rate: {answer.condition.priorSource}</p>
          )}
          {answer.term && (
            <p className="t-meta">
              Matched <span className="t-num">{answer.term.id}</span>
              {answer.term.via ? ` on “${answer.term.via}”` : ""}
            </p>
          )}
          {answer.matches.length > 1 && (
            <p className="t-meta">
              Also matched:{" "}
              {answer.matches.slice(1, 5).map((m, i) => (
                <span key={m.id}>
                  {i > 0 && " · "}
                  {onPick ? (
                    <button
                      className="cursor-pointer underline decoration-dotted hover:text-[var(--ink)]"
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
