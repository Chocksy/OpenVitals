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
      <div className="flex items-center gap-2">
        <Search className="size-4 shrink-0 text-neutral-400" />
        <input
          className="t-body min-w-0 flex-1 border-b border-neutral-200 bg-transparent py-1.5 text-[14px] outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          placeholder="Ask about anything — a disease, a symptom, a question"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void ask()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Ask"}
        </Button>
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
              variant="outline-subtle"
              disabled={busy}
              onClick={() => void consider()}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Consider this for me
            </Button>
          )}
        </AskAnswer>
      )}
    </section>
  );
}
