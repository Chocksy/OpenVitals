/**
 * A word with its meaning one hover — or one tap — away.
 *
 * Ported from the shadcn tooltip: the CSS lives in `app/globals.css` as
 * `.ov-term*`, mapped onto this project's own tokens. No library, and no
 * JavaScript at all: the trigger is a real `<button>`, so `:hover` covers the
 * mouse and `:focus` covers the finger, and the tooltip is a sibling the CSS
 * reveals. That also keeps `<Term>` a server component, so the whole glossary
 * stays out of the client bundle.
 *
 * Never place a `<Term>` inside an `<a>` or a `<button>`: a button inside a
 * button is invalid, and two hit areas would overlap.
 */
import { splitTerms, termFor, type GlossaryEntry } from "@/lib/glossary";
import { cn } from "@/lib/utils";

function Tip({ entry }: { entry: GlossaryEntry }) {
  return (
    <span role="tooltip" className="ov-term-tip">
      <span className="ov-term-tip-title">
        {entry.full && entry.full !== entry.label
          ? `${entry.label} · ${entry.full}`
          : entry.label}
      </span>
      <span className="ov-term-tip-line">{entry.what}</span>
      {entry.why && <span className="ov-term-tip-line">{entry.why}</span>}
      <span className="ov-term-tip-meta">
        {entry.unit ? `Measured in ${entry.unit}. ` : ""}
        {entry.where.charAt(0).toUpperCase()}
        {entry.where.slice(1)}.
      </span>
    </span>
  );
}

/**
 * One term, marked up. `code` is the glossary key (a metric code) when the
 * label on screen is not the glossary's own; otherwise the children are.
 */
export function Term({
  code,
  children,
  className,
}: {
  code?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const key = code ?? (typeof children === "string" ? children : "");
  const entry = termFor(key);
  const label = children ?? entry?.label ?? key;
  if (!entry) return <>{label}</>;
  return (
    <span className={cn("ov-term", className)}>
      <button type="button" className="ov-term-trigger hit-40">
        {label}
      </button>
      <Tip entry={entry} />
    </span>
  );
}

/**
 * A whole sentence, with every abbreviation in it marked up.
 *
 * The cards print sentences the engine wrote (`explainInput`, the catalog's
 * own summaries), so the only way "ApoB above what the LDL predicted" gets two
 * tooltips is to scan the string. `lib/glossary.ts` does the splitting.
 */
export function Terms({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const pieces = splitTerms(text);
  if (pieces.length === 1 && typeof pieces[0] === "string")
    return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {pieces.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <Term key={i} code={p.entry.id}>
            {p.text}
          </Term>
        ),
      )}
    </span>
  );
}
