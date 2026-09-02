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
  BASIS_WORD,
  evidenceTip,
  showsGrade,
  splitLabels,
} from "@/lib/evidence";
import { cn } from "@/lib/utils";

const BASIS_CLASS: Record<string, string> = {
  science: "glyph sci",
  opinion: "glyph op",
  anecdotal: "glyph anec",
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
  /* UX note 8: never a bare glyph. The letter when there is one, the word it
     rests on when there is not, and the sentence in the tooltip either way. */
  const said = showsGrade(basis, grade)
    ? grade
    : (BASIS_WORD[basis] ?? BASIS_WORD.science);
  return (
    <span
      className={cn(BASIS_CLASS[basis] ?? BASIS_CLASS.science, className)}
      title={tip}
      aria-label={tip}
    >
      <span aria-hidden="true">
        {BASIS_GLYPH[basis] ?? BASIS_GLYPH.science}
      </span>{" "}
      <span aria-hidden="true">{said}</span>
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
