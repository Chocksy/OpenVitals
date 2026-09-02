/**
 * A question, everywhere that is not the Today card.
 *
 * One line, what answering it would move, and a link to the one input. Never a
 * second input: `lib/asking.ts` has the rule and the test that counts it.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { askHref, effectLine, type Ask } from "@/lib/asking";

export function AskLink({
  ask,
  /** limit the effect line to the conditions this surface is about */
  only,
}: {
  ask: Ask;
  only?: string;
}) {
  const moves = only ? ask.moves.filter((m) => m.id === only) : ask.moves;
  return (
    <div className="mt-3 border-l-2 border-[var(--ink)] bg-[var(--surface-hi)] px-3 py-2">
      <p className="t-body text-[var(--ink)]">{ask.question}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="t-meta text-[12px]">
          {moves.length
            ? `Your answer moves ${effectLine(moves)}`
            : "Your answer moves this"}
        </span>
        <Link
          href={askHref(ask.key)}
          className="inline-flex h-10 items-center gap-1 px-1 font-display text-[12px] tracking-[0.04em] text-[var(--ink)] underline transition-colors duration-150 ease-out hover:text-[var(--ink)] active:scale-[0.96]"
        >
          Answer
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
