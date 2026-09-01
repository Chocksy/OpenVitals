/**
 * The label, as a mark.
 *
 * `[opinion]` and `[science, A]` printed after every action on Home, on the
 * plan and inside every answer, so a page of five actions printed the word
 * "science" five times. One chip carries the same fact: the glyph says what it
 * rests on, the letter says how good, the colour repeats it, and the tooltip
 * spells it out for anyone who has not learnt the glyphs yet.
 *
 * A plain `<span>` with `title`, deliberately: these sit inside buttons on the
 * Act-on-it row, and `<Term>`'s tooltip is a real button, which may not nest.
 */
import {
  BASIS_GLYPH,
  evidenceTip,
  showsGrade,
  splitLabels,
} from "@/lib/evidence";
import { cn } from "@/lib/utils";

const BASIS_CLASS: Record<string, string> = {
  science: "text-neutral-900",
  opinion: "text-accent-600",
  anecdotal: "text-neutral-400",
};

export function EvidenceChip({
  basis,
  grade,
  className,
}: {
  basis: string;
  grade?: string | null;
  className?: string;
}) {
  const tip = evidenceTip(basis, grade);
  return (
    <span
      className={cn(
        "t-meta inline-flex items-baseline gap-0.5 text-[10px] leading-none tracking-[0.04em]",
        BASIS_CLASS[basis] ?? BASIS_CLASS.science,
        className,
      )}
      title={tip}
      aria-label={tip}
    >
      <span aria-hidden="true">
        {BASIS_GLYPH[basis] ?? BASIS_GLYPH.science}
      </span>
      {showsGrade(basis, grade) && (
        <span aria-hidden="true" className="font-bold">
          {grade}
        </span>
      )}
    </span>
  );
}

/** The model's own paragraph, with every bracket label swapped for a chip. */
export function LabelledProse({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const pieces = splitLabels(text);
  return (
    <span className={className}>
      {pieces.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <EvidenceChip
            key={i}
            basis={p.basis}
            grade={p.grade}
            className="mx-0.5"
          />
        ),
      )}
    </span>
  );
}
