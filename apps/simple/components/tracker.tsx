"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { NUMERIC_FIELDS, type HabitView, type LogValues } from "@/lib/daily";
import { cn } from "@/lib/utils";
import { Button } from "./ui-kit";
import { Strip } from "./heatmap";

const INPUT =
  "w-full border border-neutral-200 bg-white px-2 py-1.5 font-mono text-[13px] tabular-nums rounded-sm focus:border-accent-400 focus:outline-none";

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

/* ------------------------------------------------------------------ *
 * Today
 * ------------------------------------------------------------------ */

export function HabitChecklist({
  day,
  habits,
}: {
  day: string;
  habits: HabitView[];
}) {
  const { save } = useSave();
  // Optimistic: the tick flips before the round trip, the server confirms.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const doneOf = (h: HabitView) => local[h.id] ?? h.doneToday;

  const toggle = async (h: HabitView) => {
    const next = !doneOf(h);
    setLocal((s) => ({ ...s, [h.id]: next }));
    const ok = await save("/api/habits", { itemId: h.id, day, done: next });
    if (!ok) setLocal((s) => ({ ...s, [h.id]: !next }));
  };

  if (habits.length === 0)
    return (
      <p className="card border-dashed p-6 text-center font-body text-[13px] text-neutral-500">
        No protocol yet. Add items on Protocol, or adopt them from a lifestyle
        plan on Insights.
      </p>
    );

  return (
    <div className="card divide-y divide-neutral-100">
      {habits.map((h) => {
        const done = doneOf(h);
        return (
          <button
            key={h.id}
            onClick={() => void toggle(h)}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50"
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-sm border transition-colors",
                done
                  ? "border-[var(--color-health-normal)] bg-[var(--color-health-normal)] text-white"
                  : "border-neutral-300 bg-white",
              )}
            >
              {done && <Check className="size-4" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block font-body text-[14px] font-medium",
                  done ? "text-neutral-400 line-through" : "text-neutral-900",
                )}
              >
                {h.text}
              </span>
              {h.why && (
                <span className="block truncate font-body text-[11px] text-neutral-500">
                  {h.why}
                </span>
              )}
            </span>
            {h.cadence === "weekly" && (
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                this week {h.weekCount}/7
              </span>
            )}
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-neutral-400">
              {h.adherence30}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

const PICKERS = [
  { key: "energy", label: "Energy" },
  { key: "mood", label: "Mood" },
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
    <div className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
          Quick numbers
        </h2>
        <span
          className={cn(
            "flex items-center gap-1 font-mono text-[10px] transition-opacity",
            saved ? "text-[var(--color-health-normal)] opacity-100" : "opacity-0",
          )}
        >
          <Check className="size-3" /> Saved
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {NUMERIC_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-500">
              {f.label} {f.unit && <span className="text-neutral-300">{f.unit}</span>}
            </span>
            <input
              type="number"
              step={f.step}
              inputMode="decimal"
              defaultValue={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              onBlur={() => void flush()}
              className={INPUT}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-6">
        {PICKERS.map((p) => (
          <div key={p.key}>
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-500">
              {p.label}
            </span>
            <div className="pill-tabs">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setPicked((s) => ({ ...s, [p.key]: n }));
                    set(p.key, n);
                    void flush();
                  }}
                  className={cn(
                    "pill-tab font-mono tabular-nums",
                    picked[p.key] === n && "pill-tab-active",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-500">
          Notes
        </span>
        <textarea
          rows={2}
          defaultValue={values.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          onBlur={() => void flush()}
          placeholder="Anything worth remembering about today"
          className="w-full resize-none rounded-sm border border-neutral-200 bg-white px-2 py-1.5 font-body text-[13px] focus:border-accent-400 focus:outline-none"
        />
      </label>

      {error && (
        <p className="font-mono text-[11px] text-[var(--color-health-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Protocol
 * ------------------------------------------------------------------ */

export function AddProtocolItem({
  metricNames,
}: {
  metricNames: { code: string; name: string }[];
}) {
  const { save, busy, error } = useSave();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [why, setWhy] = useState("");
  const [cadence, setCadence] = useState("daily");
  const [codes, setCodes] = useState<string[]>([]);
  const [pick, setPick] = useState("");

  const addCode = () => {
    const hit = metricNames.find(
      (m) => m.name.toLowerCase() === pick.trim().toLowerCase() || m.code === pick.trim(),
    );
    if (hit && !codes.includes(hit.code)) setCodes([...codes, hit.code]);
    setPick("");
  };

  if (!open)
    return (
      <Button variant="outline-subtle" onClick={() => setOpen(true)}>
        <Plus /> Add item
      </Button>
    );

  return (
    <div className="card space-y-3 p-4">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What will you do? e.g. Walk 30 minutes after dinner"
        className="w-full rounded-sm border border-neutral-200 px-2 py-1.5 font-body text-[14px] focus:border-accent-400 focus:outline-none"
      />
      <input
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Why does it matter?"
        className="w-full rounded-sm border border-neutral-200 px-2 py-1.5 font-body text-[12px] focus:border-accent-400 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          className="rounded-sm border border-neutral-200 px-2 py-1.5 font-mono text-[12px]"
        >
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
        <input
          list="metric-names"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCode();
            }
          }}
          placeholder="Link a biomarker"
          className="rounded-sm border border-neutral-200 px-2 py-1.5 font-body text-[12px]"
        />
        <datalist id="metric-names">
          {metricNames.map((m) => (
            <option key={m.code} value={m.name} />
          ))}
        </datalist>
        <Button size="sm" variant="outline-subtle" onClick={addCode}>
          <Plus /> Link
        </Button>
        {codes.map((c) => (
          <button
            key={c}
            onClick={() => setCodes(codes.filter((x) => x !== c))}
            className="inline-flex items-center gap-1 border border-neutral-200 bg-neutral-50 px-2 py-1 font-body text-[11px] text-neutral-700"
          >
            {metricNames.find((m) => m.code === c)?.name ?? c}
            <X className="size-3" />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          disabled={busy || !text.trim()}
          onClick={async () => {
            const ok = await save("/api/protocol", {
              text,
              why,
              cadence,
              metricCodes: codes,
            });
            if (ok) {
              setText("");
              setWhy("");
              setCodes([]);
              setOpen(false);
            }
          }}
        >
          Add to protocol
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {error && (
          <span className="text-[12px] text-[var(--color-health-critical)]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

export function ArchiveButton({ id, active }: { id: string; active: boolean }) {
  const { save, busy } = useSave();
  return (
    <button
      disabled={busy}
      onClick={() => void save("/api/protocol", { id, active: !active }, "PATCH")}
      className="shrink-0 font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400 hover:text-neutral-900 disabled:opacity-50"
    >
      {active ? "Archive" : "Restore"}
    </button>
  );
}

/** "Add to protocol" on a lifestyle item or a weekly-review action. */
export function AdoptButton({
  text,
  why,
  metricCodes,
  sourceInsightId,
  adopted,
}: {
  text: string;
  why?: string;
  metricCodes?: string[];
  sourceInsightId?: string;
  adopted?: boolean;
}) {
  const { save, busy } = useSave();
  const [done, setDone] = useState(false);
  if (adopted || done)
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--color-health-normal)]">
        <Check className="size-3" /> In protocol
      </span>
    );
  return (
    <Button
      size="sm"
      variant="outline-subtle"
      disabled={busy}
      onClick={async () => {
        const ok = await save("/api/protocol", {
          text,
          why,
          metricCodes,
          sourceInsightId,
        });
        if (ok) setDone(true);
      }}
    >
      <Plus /> Add to protocol
    </Button>
  );
}

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

export function GoalForm({
  metricCode,
  targetLow,
  targetHigh,
  due,
  note,
  exists,
}: {
  metricCode: string;
  targetLow: number | null;
  targetHigh: number | null;
  due: string | null;
  note: string | null;
  exists: boolean;
}) {
  const { save, busy, error } = useSave();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    targetLow: targetLow ?? "",
    targetHigh: targetHigh ?? "",
    due: due ?? "",
    note: note ?? "",
  });

  if (!open)
    return (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline-subtle" onClick={() => setOpen(true)}>
          {exists ? "Edit goal" : "Set goal"}
        </Button>
        {exists && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void save(`/api/goals?code=${metricCode}`, null, "DELETE")
            }
          >
            <Trash2 /> Remove
          </Button>
        )}
      </div>
    );

  const field = (key: keyof typeof form, label: string, type = "number") => (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-500">
        {label}
      </span>
      <input
        type={type}
        step="any"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={INPUT}
      />
    </label>
  );

  return (
    <div className="card space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field("targetLow", "Target low")}
        {field("targetHigh", "Target high")}
        {field("due", "By", "date")}
        {field("note", "Note", "text")}
      </div>
      <div className="flex items-center gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            const ok = await save("/api/goals", { metricCode, ...form });
            if (ok) setOpen(false);
          }}
        >
          Save goal
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {error && (
          <span className="text-[12px] text-[var(--color-health-critical)]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/** The 30-day adherence strip with its percentage, used on /protocol. */
export function AdherenceStrip({
  pct,
  values,
}: {
  pct: number;
  values: number[];
}) {
  return (
    <div className="flex items-center gap-3">
      <Strip values={values} />
      <span className="font-mono text-[11px] font-semibold tabular-nums text-neutral-600">
        {pct}%
      </span>
    </div>
  );
}
