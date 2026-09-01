"use client";

/**
 * The two ways to edit a fact that already has a value, on every surface that
 * edits one.
 *
 * Principle 4: **This changed** means the old value was true for its period and
 * a new one starts on a date. **I was wrong** means the old value never held
 * and is replaced retroactively. They are different sentences about the past,
 * so they are different buttons, and neither one is the default.
 */
export interface FactEdit {
  kind: "changed" | "corrected";
  date?: string;
  note?: string;
}

// `hit-40` is the pseudo-element from the interface checklist: the label
// still reads at 10 px, the finger still gets 40.
const link =
  "hit-40 inline-flex cursor-pointer items-center font-mono text-[10px] text-neutral-500 underline decoration-dotted hover:text-neutral-900";

const field =
  "border border-neutral-300 bg-neutral-0 px-1 py-0.5 font-mono text-[11px]";

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
      <span className="flex items-center gap-4">
        <button
          className={link}
          onClick={() => onChange({ kind: "changed", date: today })}
        >
          This changed
        </button>
        <button
          className={link}
          onClick={() => onChange({ kind: "corrected", note: "" })}
        >
          I was wrong
        </button>
      </span>
    );

  return (
    <span className="flex flex-wrap items-center gap-2">
      {edit.kind === "changed" ? (
        <label className="flex items-center gap-1 font-mono text-[10px] text-neutral-500">
          changed on
          <input
            type="date"
            className={field}
            value={edit.date ?? today}
            onChange={(e) => onChange({ ...edit, date: e.target.value })}
          />
        </label>
      ) : (
        <label className="flex items-center gap-1 font-mono text-[10px] text-neutral-500">
          the old value never held
          <input
            className={`${field} w-44`}
            placeholder="why (optional)"
            value={edit.note ?? ""}
            onChange={(e) => onChange({ ...edit, note: e.target.value })}
          />
        </label>
      )}
      <span className="font-mono text-[10px] text-neutral-400">
        now pick the new answer
      </span>
      <button className={link} onClick={() => onChange(null)}>
        cancel
      </button>
    </span>
  );
}
