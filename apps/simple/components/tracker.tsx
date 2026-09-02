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
        className="inp w-full"
      />
      <input
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Why does it matter?"
        className="inp w-full"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value)}
          className="sel"
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
          className="inp"
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
            className="chip"
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
          <span className="text-[12px] text-[var(--bad)]">
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
      className="b b-text b-sm shrink-0"
    >
      {active ? "Archive" : "Restore"}
    </button>
  );
}

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
