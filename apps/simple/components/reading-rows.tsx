"use client";

import { useState } from "react";
import { useAction } from "./client";
import { Button, StateWord } from "./ui-kit";

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

/** The system's own input, at row size, with tabular digits. */
const CELL = "inp num min-h-[34px] px-[var(--s8)] py-[var(--s3)]";

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
    <div className="rowh">
      <div className="min-w-0 flex-1">
        <p className="t-body truncate">{r.metricName}</p>
        <input
          value={f.metricCode}
          list="known-metrics"
          onChange={(e) => set("metricCode", e.target.value)}
          className={`${CELL} mt-[var(--s3)] w-48`}
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
      {r.flags.length > 0 && (
        <StateWord tone="border" dot>
          {r.flags.join(" ")}
        </StateWord>
      )}
      <Button
        size="sm"
        job="quiet"
        disabled={busy || !dirty}
        onClick={() => run(`/api/readings/${r.id}`, f, "PATCH")}
      >
        Save
      </Button>
      <Button
        size="sm"
        job="text"
        className="text-[var(--bad)]"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(`Discard ${r.metricName}? The reading is deleted.`)
          )
            void run(`/api/readings/${r.id}`, null, "DELETE");
        }}
      >
        Discard
      </Button>
      {error && <span className="t-meta text-[var(--bad)]">{error}</span>}
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
    return <p className="never">No readings for this file.</p>;

  return (
    <div className="rowlist">
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
