"use client";

/**
 * "Ask about anything — a disease, a symptom, a word."
 *
 * Trigger 5 of the five in `lib/wake.ts`, and the only one the user pulls.
 * The reply is rendered in place from what `/api/ask` computed: what it
 * matched, where that sits for this person, and the questions or tests that
 * would move it. Everything numeric on this card came out of the engine; the
 * one italic sentence at the top is the only thing a model wrote.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Sparkles } from "lucide-react";
import { Button } from "./ui-kit";

interface Move {
  kind: string;
  label: string;
  cost: number;
  why: string;
}

interface Term {
  id: string;
  ontology: string;
  name: string;
  score: number;
  via?: string;
}

interface Answer {
  matches: Term[];
  term: Term | null;
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
  moves: Move[];
  finding: { present: boolean | null; because: string | null } | null;
  canConsider: boolean;
  sentence?: string;
  /** the grounded answer, when the box was asked a question */
  reply?: string;
  route?: "term" | "question";
  error?: string;
}

const LABEL =
  "font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400";

const pct = (p: number) =>
  p >= 0.01 ? `${(p * 100).toFixed(1)} %` : `${(p * 100).toPrecision(2)} %`;

function ringLine(a: Answer): string {
  if (!a.condition)
    return a.term?.ontology === "HP"
      ? "A finding, not a disease. It is one of the things the engine reads."
      : "In the ontology, not yet in the engine as a condition.";
  if (a.condition.inCatalog)
    return "Ring 1: scored for everybody, every time, including you.";
  if (a.woken?.status === "awake")
    return `Ring 2, awake since something ${a.woken.trigger === "user" ? "you asked" : `in your data (${a.woken.trigger})`} pointed at it.`;
  if (a.woken?.status === "dismissed")
    return `Ring 2, asleep again. ${a.woken.note ?? ""}`;
  return "Ring 2: known by name and base rate, asleep. Nothing in your data points at it yet.";
}

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
          className="min-w-0 flex-1 border-b border-neutral-200 bg-transparent py-1.5 font-body text-[14px] outline-none placeholder:text-neutral-400 focus:border-neutral-400"
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

      {answer?.error && (
        <p className="mt-2 font-mono text-[11px] text-[var(--color-health-critical)]">
          {answer.error}
        </p>
      )}

      {answer?.reply && (
        <p className="mt-3 whitespace-pre-line font-body text-[13px] leading-relaxed text-neutral-800">
          {answer.reply}
        </p>
      )}

      {answer && !answer.error && !answer.term && !answer.reply && (
        <p className="mt-3 font-body text-[13px] text-neutral-500">
          I don&apos;t know that word. Ask it as a question, or try the disease
          name.
        </p>
      )}

      {answer?.term && (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-display text-[17px] tracking-[-0.02em]">
              {answer.term.name}
            </span>
            <span className="font-mono text-[10px] text-neutral-400">
              {answer.term.id}
              {answer.term.via ? ` · matched "${answer.term.via}"` : ""}
            </span>
          </div>

          {answer.sentence && (
            <p className="flex items-start gap-1.5 font-body text-[13px] italic text-neutral-600">
              <Sparkles className="mt-[3px] size-3 shrink-0 text-neutral-300" />
              {answer.sentence}
            </p>
          )}

          <p className="font-body text-[13px] text-neutral-600">
            {ringLine(answer)}
          </p>

          {answer.probability != null && (
            <p className="font-mono text-[12px] tabular-nums">
              now {pct(answer.probability)}
              <span className="text-neutral-400">
                {answer.state ? ` · ${answer.state.replace("_", " ")}` : ""}
                {answer.condition?.prior != null
                  ? ` · started at ${pct(answer.condition.prior)}`
                  : ""}
              </span>
            </p>
          )}

          {answer.finding && (
            <p className="font-body text-[13px] text-neutral-600">
              {answer.finding.present == null
                ? "You have not answered anything that would say whether you have it."
                : answer.finding.present
                  ? `You have it: ${answer.finding.because}.`
                  : `You do not have it: ${answer.finding.because}.`}
            </p>
          )}

          {answer.moves.length > 0 && (
            <div>
              <p className={LABEL}>What would move it</p>
              <ul className="mt-1 space-y-1">
                {answer.moves.map((m) => (
                  <li
                    key={`${m.kind}:${m.label}`}
                    className="font-body text-[13px]"
                  >
                    <span className="font-mono text-[10px] uppercase text-neutral-400">
                      {m.kind}
                      {m.cost > 0 ? ` · ${m.cost}` : " · free"}
                    </span>{" "}
                    {m.label}
                    <span className="block font-mono text-[11px] text-neutral-400">
                      {m.why}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {answer.condition?.priorSource && (
            <p className="font-mono text-[11px] text-neutral-400">
              base rate: {answer.condition.priorSource}
            </p>
          )}

          {answer.canConsider && answer.term.ontology === "MONDO" && (
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

          {answer.matches.length > 1 && (
            <p className="font-mono text-[11px] text-neutral-400">
              also matched:{" "}
              {answer.matches.slice(1, 5).map((m, i) => (
                <span key={m.id}>
                  {i > 0 && " · "}
                  <button
                    className="cursor-pointer underline decoration-dotted hover:text-neutral-700"
                    onClick={() => {
                      setQ(m.name);
                      void ask(m.name);
                    }}
                  >
                    {m.name}
                  </button>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
