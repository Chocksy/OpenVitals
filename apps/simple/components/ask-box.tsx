"use client";

/**
 * "Ask about anything — a disease, a symptom, a word."
 *
 * Trigger 5 of the five in `lib/wake.ts`, and the only one the user pulls.
 * The reply is rendered in place from what `/api/ask` computed; everything
 * numeric on it came out of the engine.
 *
 * Phase 25b moved the reader's copy of this to the composer, where telling and
 * asking are the same box. What is left here is the engine window `/brain` and
 * `/graph` render, and it draws the same `<AskAnswer>` the composer does.
 *
 * Phase 30e puts it on the system's own `.ask` pill (`system.html` section 05,
 * drawn by `graph.html` section 01): one field, an icon, and the lime Ask.
 * Behaviour and the `/api/ask` call are untouched.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { AskAnswer, type Answer } from "./ask-answer";
import { Button } from "./ui-kit";

export function AskBox({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Answer & {
      answer?: Answer;
    };
    setBusy(false);
    return data;
  };

  const ask = async (text = q) => {
    if (text.trim().length < 2) return;
    setAnswer(await post({ action: "ask", q: text }));
  };

  const consider = async () => {
    if (!answer?.term) return;
    const data = await post({
      action: "consider",
      q,
      mondoId: answer.term.id,
    });
    if (data.answer) setAnswer(data.answer);
    router.refresh();
  };

  return (
    <section className={compact ? "" : "card p-4"}>
      <div className="ask">
        <Search className="ic" aria-hidden="true" />
        <input
          className="q"
          aria-label="Ask about anything"
          placeholder="Ask about anything — a disease, a symptom, a question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
        />
        <button
          type="button"
          className="askbtn"
          disabled={busy}
          onClick={() => void ask()}
        >
          {busy ? <Loader2 className="ic spin" aria-hidden="true" /> : null}
          Ask
        </button>
      </div>

      {answer && (
        <AskAnswer
          answer={answer}
          onPick={(name) => {
            setQ(name);
            void ask(name);
          }}
        >
          {answer.canConsider && answer.term?.ontology === "MONDO" && (
            <Button
              size="sm"
              job="quiet"
              disabled={busy}
              onClick={() => void consider()}
            >
              {busy ? <Loader2 className="ic spin" /> : null}
              Consider this for me
            </Button>
          )}
        </AskAnswer>
      )}
    </section>
  );
}
