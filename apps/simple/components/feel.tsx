"use client";

/**
 * "How you feel": every interview question on one screen, per
 * `docs/mockups/v4/body.html` section 03.
 *
 * No wizard and no progress bar. Each answer saves on click, on its own, so a
 * half-finished questionnaire is still worth something. A question the engine
 * would act on today says so and names the conditions it would move; a quiet
 * one still records a dated fact and the row says that rather than pretending.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Symptom } from "@/lib/symptoms";
import { formatDate } from "@/lib/utils";
import { StateWord } from "./ui-kit";
import { FactEditButtons, type FactEdit } from "./fact-edit";

/** What the engine says an answer to this question would move. */
export interface FeelAsk {
  /** the conditions, biggest move first, already named */
  names: string[];
  /** the size of the biggest move, in points */
  points: number;
}

export function Feel({
  items,
  answers,
  answeredAt = {},
  asks = {},
  history = {},
  today,
}: {
  items: { item: number; questions: Symptom[] }[];
  answers: Record<string, string>;
  /** the day each answer was recorded */
  answeredAt?: Record<string, string>;
  /** the questions worth answering today, by fact key */
  asks?: Record<string, FeelAsk>;
  /** "since 2026-03: no; before: yes", per question key. */
  history?: Record<string, string>;
  today: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(answers);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<string, FactEdit | null>>({});

  const answer = async (key: string, value: string) => {
    setBusy(key);
    setError("");
    const edit = edits[key];
    const res = await fetch("/api/facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value, ...(edit ?? {}) }),
    });
    setBusy("");
    if (!res.ok) {
      setError("That did not save. Try again.");
      return;
    }
    setSaved((s) => ({ ...s, [key]: value }));
    setEdits((e) => ({ ...e, [key]: null }));
    router.refresh();
  };

  const questions = items.flatMap((g) => g.questions);
  const answeredCount = questions.filter((q) => saved[q.key]).length;
  const worth = questions.filter((q) => asks[q.key]).length;

  /** The meta line under a question: what it would move, or when it landed. */
  const line = (q: Symptom): string => {
    const ask = asks[q.key];
    if (ask)
      return ask.names.length === 1
        ? `would move ${ask.names[0]} by ${ask.points} points`
        : `moves ${ask.names.join(", ")}`;
    if (answeredAt[q.key]) return `answered ${formatDate(answeredAt[q.key]!)}`;
    return "would move nothing today";
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{questions.length} questions</h3>
        <span className="r">
          {worth} worth answering · {answeredCount} answered ·{" "}
          {questions.length - answeredCount} open
        </span>
      </div>
      {error && <p className="err">{error}</p>}
      <div className="rowlist">
        {questions.map((q) => (
          <div className="qrow" key={q.key}>
            <div>
              <b>{q.question}</b>
              <div className="t-meta">{line(q)}</div>
            </div>
            <div>
              {asks[q.key] && (
                <StateWord tone="border">worth answering</StateWord>
              )}
            </div>
            <div className="rowh opts">
              {q.options.map((option) => (
                <button
                  key={option}
                  className="optchip"
                  aria-pressed={saved[q.key] === option}
                  data-busy={busy === q.key ? "true" : undefined}
                  onClick={() => void answer(q.key, option)}
                >
                  {option}
                </button>
              ))}
              {saved[q.key] && (
                <FactEditButtons
                  edit={edits[q.key] ?? null}
                  today={today}
                  onChange={(edit) =>
                    setEdits((e) => ({ ...e, [q.key]: edit }))
                  }
                />
              )}
            </div>
            {history[q.key] && (
              <div className="t-meta opts">{history[q.key]}</div>
            )}
          </div>
        ))}
      </div>
      <p className="cap">
        The marked rows are the only ones the engine would act on today.
        Answering a quiet one still records a dated fact; it just does not move
        a likelihood, and the page says so rather than pretending.
      </p>
    </div>
  );
}
