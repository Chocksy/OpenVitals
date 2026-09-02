"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "./ui-kit";
import { Strip } from "./heatmap";

/** The system's own input; the numbers are tabular so the columns stack. */
const INPUT = "inp num";

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
      <Button job="quiet" onClick={() => setOpen(true)}>
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
        <Button size="sm" job="quiet" onClick={addCode}>
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
        <Button job="text" onClick={() => setOpen(false)}>
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
      job="quiet"
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
        <Button size="sm" job="quiet" onClick={() => setOpen(true)}>
          {exists ? "Edit goal" : "Set goal"}
        </Button>
        {exists && (
          <Button
            size="sm"
            job="text"
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
    <label className="field">
      <span className="src block">{label}</span>
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
    <div className="panel">
      <div className="fields">
        {field("targetLow", "Target low")}
        {field("targetHigh", "Target high")}
        {field("due", "By", "date")}
        {field("note", "Note", "text")}
      </div>
      <div className="rowh mt-[var(--s13)]">
        <Button
          disabled={busy}
          onClick={async () => {
            const ok = await save("/api/goals", { metricCode, ...form });
            if (ok) setOpen(false);
          }}
        >
          Save goal
        </Button>
        <Button job="text" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {error && <span className="t-meta text-[var(--bad)]">{error}</span>}
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
      <span className="t-num text-[length:var(--type-xs)] text-[var(--ink-2)]">
        {pct}%
      </span>
    </div>
  );
}

/**
 * The optimal band on a metric page. It shows where the band came from, and
 * lets the person replace it with their own; "Reset" hands the metric back to
 * whatever the app would have chosen.
 */
export function OptimalForm({
  metricCode,
  low,
  high,
  unit,
  mine,
}: {
  metricCode: string;
  low: number | null;
  high: number | null;
  unit: string | null;
  /** True when this user already saved their own band for this metric. */
  mine: boolean;
}) {
  const { save, busy, error } = useSave();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ low: low ?? "", high: high ?? "" });

  if (!open)
    return (
      <Button size="sm" job="text" onClick={() => setOpen(true)}>
        Edit
      </Button>
    );

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {(["low", "high"] as const).map((key) => (
        <input
          key={key}
          type="number"
          step="any"
          value={form[key]}
          placeholder={key}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="inp num w-24 min-h-[34px] px-[var(--s8)] py-[var(--s3)]"
        />
      ))}
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          const ok = await save("/api/optimal", { metricCode, ...form, unit });
          if (ok) setOpen(false);
        }}
      >
        <Check /> Save
      </Button>
      {mine && (
        <Button
          size="sm"
          job="text"
          disabled={busy}
          onClick={async () => {
            const ok = await save(
              `/api/optimal?code=${metricCode}`,
              null,
              "DELETE",
            );
            if (ok) setOpen(false);
          }}
        >
          Reset
        </Button>
      )}
      <Button size="sm" job="text" onClick={() => setOpen(false)}>
        <X />
      </Button>
      {error && <span className="t-meta text-[var(--bad)]">{error}</span>}
    </span>
  );
}
