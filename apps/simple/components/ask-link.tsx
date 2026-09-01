/**
 * A question, everywhere that is not the Today card.
 *
 * One line, what answering it would move, and a link to the one input. Never a
 * second input: `lib/asking.ts` has the rule and the test that counts it.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ASK_HREF, effectLine, type Ask } from "@/lib/asking";

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
    <div className="mt-3 border-l-2 border-accent-500 bg-accent-50 px-3 py-2">
      <p className="font-body text-[13px] text-neutral-800">{ask.question}</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] tabular-nums text-neutral-500">
          {moves.length
            ? `1 answer would move ${effectLine(moves)}`
            : "1 answer would move this"}
        </span>
        <Link
          href={ASK_HREF}
          className="inline-flex h-10 items-center gap-1 px-1 font-display text-[12px] tracking-[0.04em] text-accent-600 underline transition-colors duration-150 ease-out hover:text-neutral-900 active:scale-[0.96]"
        >
          Answer
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
