"use client";

/**
 * The one input on Home, and the only place an answer is typed.
 *
 * Phase 24a made this the single asking surface. Phase 24d made it live: the
 * answer posts, the button wears its success check (10), the ledger re-reads
 * itself and animates the difference, a toast says what moved (22), and the
 * card slides the next question in (`07-panel-reveal.md`). The page never
 * reloads, so the person sees cause and effect instead of a flash.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASK_ID, effectLine, type Ask } from "@/lib/asking";
import { AnswerQuestion } from "./client";
import { refreshLedger, toast, type LedgerPayload } from "./ledger-motion";

type LiveAsk = Ask & { options: string[] };

const PANEL =
  "t-panel-slide border-l-2 border-[var(--ink)] bg-[var(--surface-hi)] px-3 py-2";

export function TodayAsk({
  ask: first,
  options,
  onEmpty = "Nothing else worth asking today.",
}: {
  ask: Ask;
  options: string[];
  onEmpty?: string;
}) {
  const router = useRouter();
  const [ask, setAsk] = useState<LiveAsk | null>({ ...first, options });
  const [open, setOpen] = useState(true);

  const advance = (next: LedgerPayload["ask"]) => {
    setOpen(false);
    window.setTimeout(() => {
      setAsk(next);
      if (next) setOpen(true);
    }, 360);
  };

  /**
   * The answer is already written. Re-read the ledger for the toast line and
   * the next question, then ask the server for the page again: the new numbers
   * arrive as props, and `components/motion.tsx` animates them.
   */
  const saved = async () => {
    const { ask: next, diff } = await refreshLedger();
    toast(diff?.line ? `Saved · ${diff.line}` : "Saved");
    router.refresh();
    advance(next);
  };

  if (!ask)
    return (
      <p id={ASK_ID} className="t-body text-[var(--ink-3)]">
        {onEmpty}
      </p>
    );

  return (
    <div id={ASK_ID} className="scroll-mt-24">
      <div
        className={PANEL}
        data-open={open}
        // The snippet's 100 px travel is a full panel; this one is two lines
        // tall, so it moves about half its own height.
        style={{ "--panel-translate-y": "28px" } as React.CSSProperties}
      >
        <p className="t-body text-[var(--ink)]">
          {ask.question}
        </p>
        {ask.moves.length > 0 && (
          <p className="t-meta mt-0.5 text-[12px]">
            Answering moves {effectLine(ask.moves)}
          </p>
        )}
        <div className="mt-2">
          <AnswerQuestion
            key={ask.key}
            factKey={ask.key}
            options={ask.options}
            onSaved={saved}
          />
        </div>
      </div>
    </div>
  );
}
