"use client";

/**
 * The two ways to edit a fact that already has a value, on every surface that
 * edits one.
 *
 * Principle 4: **This changed** means the old value was true for its period and
 * a new one starts on a date. **I was wrong** means the old value never held
 * and is replaced retroactively. They are different sentences about the past,
 * so they are different buttons, and neither one is the default.
 *
 * Phase 30b puts them on the system's own elements: the two prompts are `.b
 * .b-text .b-sm`, the date and the note are `.inp`, so the since-date editor
 * reads as part of the row rather than as a second style.
 */
export interface FactEdit {
  kind: "changed" | "corrected";
  date?: string;
  note?: string;
}

export function FactEditButtons({
  edit,
  onChange,
  today,
}: {
  edit: FactEdit | null;
  onChange: (edit: FactEdit | null) => void;
  today: string;
}) {
  if (!edit)
    return (
      <span className="rowh gap-[var(--s5)]">
        <button
          type="button"
          className="b b-text b-sm"
          onClick={() => onChange({ kind: "changed", date: today })}
        >
          This changed
        </button>
        <button
          type="button"
          className="b b-text b-sm"
          onClick={() => onChange({ kind: "corrected", note: "" })}
        >
          I was wrong
        </button>
      </span>
    );

  return (
    <span className="rowh gap-[var(--s5)]">
      {edit.kind === "changed" ? (
        <label className="t-meta rowh gap-[var(--s5)]">
          Changed on
          <input
            type="date"
            className="inp mini"
            value={edit.date ?? today}
            onChange={(e) => onChange({ ...edit, date: e.target.value })}
          />
        </label>
      ) : (
        <label className="t-meta rowh gap-[var(--s5)]">
          the old value never held
          <input
            className="inp mini"
            placeholder="why (optional)"
            value={edit.note ?? ""}
            onChange={(e) => onChange({ ...edit, note: e.target.value })}
          />
        </label>
      )}
      <span className="t-meta">Now pick the new answer</span>
      <button
        type="button"
        className="b b-text b-sm"
        onClick={() => onChange(null)}
      >
        Cancel
      </button>
    </span>
  );
}
