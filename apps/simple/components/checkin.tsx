"use client";

/**
 * The check-in, per `docs/mockups/v4/body.html` section 02.
 *
 * Habits on the left, the numbers you type and the note on the right. It is
 * one form, it saves as you go, and every row is dated by the day the page is
 * on. Phase 30b lifted `HabitChecklist` and `QuickNumbers` out of
 * `tracker.tsx` and put them on the system's own elements: `.checkrow` with
 * its box, `.field` / `.withunit` / `.inp.num`, the `.rate` row for the two
 * 1–5 pickers, `.ta` for the note.
 *
 * The saving is unchanged: a tick flips optimistically and the server
 * confirms, the numbers flush on blur.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { NUMERIC_FIELDS, type HabitView, type LogValues } from "@/lib/daily";
import { cn } from "@/lib/utils";
import { SuccessCheck } from "./ui-kit";

/** POST/PUT then re-render the server components. Same shape as client.tsx. */
function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (url: string, body: unknown, method = "POST") => {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
      return false;
    }
    start(() => router.refresh());
    return true;
  };
  return { save, busy: busy || pending, error };
}

/** "daily · 24 of the last 30 days", or what the cadence actually says. */
const cadenceLine = (h: HabitView) =>
  h.cadence === "weekly"
    ? `weekly · ${h.weekCount} of the last 7 days`
    : `daily · ${h.adherence30}% of the last 30 days`;

export function HabitChecklist({
  day,
  habits,
  streak,
}: {
  day: string;
  habits: HabitView[];
  streak: number;
}) {
  const { save } = useSave();
  // Optimistic: the tick flips before the round trip, the server confirms.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const doneOf = (h: HabitView) => local[h.id] ?? h.doneToday;
  const done = habits.filter(doneOf).length;

  const toggle = async (h: HabitView) => {
    const next = !doneOf(h);
    setLocal((s) => ({ ...s, [h.id]: next }));
    const ok = await save("/api/habits", { itemId: h.id, day, done: next });
    if (!ok) setLocal((s) => ({ ...s, [h.id]: !next }));
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Habits</h3>
        <span className="r">
          {done} of {habits.length} ticked · {streak}-day streak
        </span>
      </div>
      {habits.length === 0 ? (
        <p className="cap">
          Nothing to tick yet. Items adopted on Plan show up here the same day.
        </p>
      ) : (
        habits.map((h) => (
          <label key={h.id} className={cn("checkrow", doneOf(h) && "on")}>
            <input
              type="checkbox"
              className="sr-only"
              checked={doneOf(h)}
              onChange={() => void toggle(h)}
            />
            <span className="box">
              <Check className="ic" aria-hidden="true" />
            </span>
            <span>
              <span className="lb">{h.text}</span>
              <span className="cs">{cadenceLine(h)}</span>
            </span>
          </label>
        ))
      )}
    </div>
  );
}

const PICKERS = [
  { key: "energy", label: "Energy · 1 to 5" },
  { key: "mood", label: "Mood · 1 to 5" },
] as const;

export function QuickNumbers({
  day,
  values,
}: {
  day: string;
  values: LogValues;
}) {
  const { save, error } = useSave();
  const state = useRef<LogValues>({ ...values });
  const [saved, setSaved] = useState(false);
  const [picked, setPicked] = useState({
    energy: values.energy ?? null,
    mood: values.mood ?? null,
  });

  const flush = async () => {
    const ok = await save("/api/daily-logs", { day, ...state.current }, "PUT");
    if (!ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const set = (key: string, value: string | number | null) => {
    (state.current as Record<string, unknown>)[key] = value;
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Numbers and notes</h3>
        <span className="r">
          typed, not synced <SuccessCheck shown={saved} />
        </span>
      </div>

      <div className="fields">
        {NUMERIC_FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`q-${f.key}`}>{f.label}</label>
            <div className="withunit">
              <input
                id={`q-${f.key}`}
                className="inp num"
                type="number"
                step={f.step}
                inputMode="decimal"
                defaultValue={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                onBlur={() => void flush()}
              />
              {f.unit && <span className="u">{f.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="fields mt-[var(--s13)]">
        {PICKERS.map((p) => (
          <div className="field" key={p.key}>
            <label>{p.label}</label>
            <div className="rate">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={picked[p.key] === n}
                  onClick={() => {
                    setPicked((s) => ({ ...s, [p.key]: n }));
                    set(p.key, n);
                    void flush();
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="field mt-[var(--s13)]">
        <label htmlFor="q-notes">Anything else</label>
        <textarea
          id="q-notes"
          className="ta"
          defaultValue={values.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          onBlur={() => void flush()}
          placeholder="a symptom, a habit, a number — or a question"
        />
      </div>

      {error && <p className="err">{error}</p>}
    </div>
  );
}
