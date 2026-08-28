"use client";

/**
 * "How do you feel": the twelve interview items on one page.
 *
 * Each answer saves on click, on its own, so a half-finished questionnaire is
 * still worth something. No form, no submit button, no draft state.
 */
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { Symptom } from "@/lib/symptoms";
import { cn } from "@/lib/utils";

export function Feel({
  items,
  answers,
}: {
  items: { item: number; questions: Symptom[] }[];
  answers: Record<string, string>;
}) {
  const [saved, setSaved] = useState(answers);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const answer = async (key: string, value: string) => {
    setBusy(key);
    setError("");
    const res = await fetch("/api/facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setBusy("");
    if (!res.ok) {
      setError("That did not save. Try again.");
      return;
    }
    setSaved((s) => ({ ...s, [key]: value }));
  };

  const done = Object.keys(saved).length;

  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-400">
        {done} of {items.flatMap((g) => g.questions).length} answered
      </p>
      {error && (
        <p className="font-mono text-[12px] text-[var(--color-health-critical)]">
          {error}
        </p>
      )}
      {items.map((group, i) => (
        <section key={group.item} className="card p-4">
          <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            {i + 1} of {items.length}
          </p>
          {group.questions.map((q) => (
            <div key={q.key} className="mb-3 last:mb-0">
              <p className="mb-2 font-body text-[14px]">{q.question}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((option) => (
                  <button
                    key={option}
                    disabled={busy !== ""}
                    onClick={() => void answer(q.key, option)}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 border px-3 py-1.5 font-body text-[13px] transition-colors",
                      saved[q.key] === option
                        ? "border-accent-500 bg-accent-50 text-accent-500"
                        : "border-neutral-200 text-neutral-600 hover:border-accent-200 hover:text-neutral-900",
                    )}
                  >
                    {busy === q.key && saved[q.key] !== option ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : saved[q.key] === option ? (
                      <Check className="size-3.5" />
                    ) : null}
                    {option}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-neutral-400">
                {q.source}
              </p>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
