/**
 * One condition, answered.
 *
 * `docs/mockups/v4/genome.html` section 01: the answer in the heading, the
 * reason in one line under it, the multiplier and the grade on the side. The
 * classes are the design system's own — `.verdict`, `.vq`, `.vsay`, `.vside`,
 * `.vx` in `app/globals.css` section 15 — so this file adds no CSS.
 *
 * A server component with no state. Everything it prints comes off one
 * `ConditionVerdict`; nothing is computed here, because the page computes the
 * verdicts once and the table reads the same ones.
 */
import { factorText, type ConditionVerdict } from "@/lib/genome";
import { cn } from "@/lib/utils";
import { EvidenceChip } from "./evidence-chip";

/**
 * `.on` is an answer that closes something, `.border` an answer that raises a
 * starting point, `.none` an answer that changes nothing. A down move that did
 * not come from an absence still closes the question a little, so it reads
 * `.on` too.
 */
const TONE: Record<ConditionVerdict["direction"], string> = {
  down: "on",
  up: "border",
  none: "none",
};

/** The answer as a sentence fragment, in the heading. */
export function verdictHead(v: ConditionVerdict): string {
  if (v.direction === "up" && v.factor != null)
    return `the starting odds ×${factorText(v.factor)}`;
  if (v.direction === "down")
    return v.absent
      ? "essentially excluded"
      : `argued against, LR ${v.factor != null ? factorText(v.factor) : "—"}`;
  return "the genome adds nothing";
}

/** The number on the side, or the words when there is no number. */
export function verdictMark(v: ConditionVerdict): string {
  if (v.direction === "up" && v.factor != null)
    return `×${factorText(v.factor)}`;
  if (v.direction === "down")
    return v.absent
      ? "excluded"
      : `LR ${v.factor != null ? factorText(v.factor) : "—"}`;
  return "no change";
}

export function VerdictCard({ v }: { v: ConditionVerdict }) {
  return (
    <div className={cn("verdict", TONE[v.direction])}>
      <div className="vq">
        {v.name}: <em>{verdictHead(v)}</em>
        {/* Only an absence licenses "no test needed": it is what a negative
            likelihood ratio on a missing haplotype means. A condition the
            genome simply did not move says nothing about testing. */}
        {v.absent && " · no test needed"}
      </div>
      <p className="vsay">{v.reason}</p>
      <div className="vside">
        <span className={cn("vx", v.direction === "none" && "flat")}>
          {verdictMark(v)}
        </span>
        <EvidenceChip basis="science" grade={v.grade} />
      </div>
    </div>
  );
}
