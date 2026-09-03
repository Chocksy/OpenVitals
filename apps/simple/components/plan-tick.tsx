"use client";

/**
 * The two writes on Plan's Today column, and nothing else.
 *
 * Phase 32a section 2, per `docs/mockups/v4/plan-month.html` section 02. The
 * column itself is a server component (`components/plan-day.tsx`); only the
 * tick and the one Add a suggestion carries need a client, so they are the
 * whole of this file.
 *
 * The tick posts the same `{ itemId, day, done }` to `POST /api/habits` that
 * `HabitChecklist` in `components/checkin.tsx` has always posted — one tick
 * per item per day, the same row the 30-cell strip reads. There is no second
 * store, and no per-slot tick: a three-dose day is one tick.
 *
 * `DayRow` owns the row rather than the box because `.dayrow.done` is what
 * paints a ticked row, so the optimistic flip has to sit on the row. The
 * words inside it — the time, the title, the why, the tag — are rendered on
 * the server and handed down as children.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui-kit";

/** POST, then re-render the server components. Same shape as `checkin.tsx`. */
function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const save = async (url: string, body: unknown) => {
    setBusy(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) return false;
    start(() => router.refresh());
    return true;
  };
  return { save, busy: busy || pending };
}

export function DayRow({
  itemId,
  day,
  done,
  at,
  children,
}: {
  /** null for a row nothing was adopted for: a suggestion has no tick */
  itemId: string | null;
  day: string;
  done: boolean;
  /** the clock time when the line carried one, or the slot's own word */
  at: string;
  children: React.ReactNode;
}) {
  const { save } = useSave();
  const [local, setLocal] = useState<boolean | null>(null);
  const on = local ?? done;

  const toggle = async () => {
    if (!itemId) return;
    const next = !on;
    setLocal(next);
    const ok = await save("/api/habits", { itemId, day, done: next });
    if (!ok) setLocal(!next);
  };

  return (
    <div className={cn("dayrow", on && "done")}>
      <span className="at">{at}</span>
      {itemId ? (
        <button
          type="button"
          className="box"
          role="checkbox"
          aria-checked={on}
          aria-label={on ? "Done today" : "Not done today"}
          onClick={() => void toggle()}
        >
          <Check className="ic" aria-hidden="true" />
        </button>
      ) : (
        <span className="box" aria-hidden="true" />
      )}
      {children}
    </div>
  );
}

/**
 * Adopt one thing the report proposed, from the Today column.
 *
 * The same `POST /api/plan/adopt` the action card posts, with the same report
 * id and index: a suggestion adopted here is the identical protocol item, and
 * it stops being a suggestion the moment it exists.
 */
export function AdoptSuggested({
  reportId,
  actionIndex,
}: {
  reportId: string;
  actionIndex: number;
}) {
  const { save, busy } = useSave();
  const [adopted, setAdopted] = useState(false);

  if (adopted)
    return (
      <span className="state on">
        <Check className="size-3" /> Adopted
      </span>
    );

  return (
    <Button
      size="sm"
      job="quiet"
      disabled={busy}
      onClick={async () => {
        if (await save("/api/plan/adopt", { reportId, actionIndex }))
          setAdopted(true);
      }}
    >
      <Plus /> Add
    </Button>
  );
}
