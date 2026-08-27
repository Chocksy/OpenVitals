"use client";

import { useState } from "react";
import { useAction } from "./client";

export interface EditableReading {
  id: string;
  metricCode: string;
  metricName: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  observedAt: string;
  flags: string[];
}

const CELL =
  "border border-neutral-200 bg-neutral-0 px-2 py-1 font-mono text-[12px] tabular-nums focus:border-neutral-900 focus:outline-none";

const str = (v: number | null) => (v == null ? "" : String(v));

/** Every field the lab got wrong, editable in place. */
function Row({ r }: { r: EditableReading }) {
  const initial = {
    metricCode: r.metricCode,
    value: str(r.value),
    unit: r.unit ?? "",
    refLow: str(r.refLow),
    refHigh: str(r.refHigh),
    observedAt: r.observedAt,
  };
  const [f, setF] = useState(initial);
  const { run, busy, error } = useAction();
  const keys = Object.keys(initial) as (keyof typeof initial)[];
  const dirty = keys.some((k) => f[k] !== initial[k]);
  const set = (k: keyof typeof initial, v: string) =>
    setF((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-body text-[13px]">{r.metricName}</p>
        <input
          value={f.metricCode}
          list="known-metrics"
          onChange={(e) => set("metricCode", e.target.value)}
          className={`${CELL} mt-0.5 w-48 text-neutral-500`}
        />
      </div>
      <input
        value={f.value}
        inputMode="decimal"
        placeholder={r.valueText ?? "value"}
        onChange={(e) => set("value", e.target.value)}
        className={`${CELL} w-20 text-right`}
      />
      <input
        value={f.unit}
        placeholder="unit"
        onChange={(e) => set("unit", e.target.value)}
        className={`${CELL} w-20`}
      />
      <input
        value={f.refLow}
        inputMode="decimal"
        placeholder="low"
        onChange={(e) => set("refLow", e.target.value)}
        className={`${CELL} w-16 text-right`}
      />
      <input
        value={f.refHigh}
        inputMode="decimal"
        placeholder="high"
        onChange={(e) => set("refHigh", e.target.value)}
        className={`${CELL} w-16 text-right`}
      />
      <input
        type="date"
        value={f.observedAt}
        onChange={(e) => set("observedAt", e.target.value)}
        className={`${CELL} w-32`}
      />
      <span className="w-24 truncate font-mono text-[10px] uppercase text-[var(--color-health-warning)]">
        {r.flags.join(" ")}
      </span>
      <button
        className="font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600 hover:underline disabled:opacity-30 disabled:no-underline"
        disabled={busy || !dirty}
        onClick={() => run(`/api/readings/${r.id}`, f, "PATCH")}
      >
        Save
      </button>
      <button
        className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--color-health-critical)] hover:underline disabled:opacity-30"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(`Discard ${r.metricName}? The reading is deleted.`)
          )
            void run(`/api/readings/${r.id}`, null, "DELETE");
        }}
      >
        Discard
      </button>
      {error && (
        <span className="font-mono text-[10px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </div>
  );
}

export function ReadingRows({
  rows,
  metrics,
}: {
  rows: EditableReading[];
  metrics: { code: string; name: string }[];
}) {
  if (rows.length === 0)
    return (
      <p className="card border-dashed p-8 text-center font-body text-[13px] text-neutral-500">
        No readings for this file.
      </p>
    );

  return (
    <div className="card divide-y divide-neutral-100">
      <datalist id="known-metrics">
        {metrics.map((m) => (
          <option key={m.code} value={m.code}>
            {m.name}
          </option>
        ))}
      </datalist>
      {rows.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </div>
  );
}
