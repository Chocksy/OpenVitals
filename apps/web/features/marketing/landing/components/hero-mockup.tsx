import { Spark } from "./spark";
import { BrowserWindow } from "./browser-window";
export function HeroMockup() {
  const rows = [
    {
      metric: "LDL Cholesterol",
      val: "98",
      unit: "mg/dL",
      range: "0–100",
      st: "normal",
      trend: [142, 130, 125, 118, 112, 98],
    },
    {
      metric: "HDL Cholesterol",
      val: "58",
      unit: "mg/dL",
      range: "> 40",
      st: "normal",
      trend: [52, 54, 55, 56, 57, 58],
    },
    {
      metric: "Triglycerides",
      val: "162",
      unit: "mg/dL",
      range: "< 150",
      st: "warning",
      trend: [128, 135, 142, 148, 155, 162],
    },
    {
      metric: "HbA1c",
      val: "5.9",
      unit: "%",
      range: "< 5.7",
      st: "warning",
      trend: [5.2, 5.3, 5.4, 5.5, 5.6, 5.9],
    },
    {
      metric: "Ferritin",
      val: "14",
      unit: "ng/mL",
      range: "20–300",
      st: "critical",
      trend: [45, 38, 32, 25, 18, 14],
    },
  ];
  const sc: Record<string, string> = {
    normal: "#16A34A",
    warning: "#D97706",
    critical: "#DC2626",
  };
  const sl: Record<string, string> = {
    normal: "Normal",
    warning: "Borderline",
    critical: "Low",
  };
  const sb: Record<string, string> = {
    normal: "#F0FDF4",
    warning: "#FFFBEB",
    critical: "#FEF2F2",
  };
  const sbo: Record<string, string> = {
    normal: "#BBF7D0",
    warning: "#FDE68A",
    critical: "#FECACA",
  };
  return (
    <BrowserWindow url="OpenVitals">
      <div className="grid grid-cols-4 gap-2.5 px-4 pt-4 pb-3">
        {[
          {
            label: "LDL Cholesterol",
            val: "98",
            unit: "mg/dL",
            delta: "↓ 14",
            color: "#16A34A",
            d: [142, 130, 118, 98],
          },
          {
            label: "HbA1c",
            val: "5.9",
            unit: "%",
            delta: "↑ 0.3",
            color: "#D97706",
            d: [5.2, 5.4, 5.6, 5.9],
          },
          {
            label: "Ferritin",
            val: "14",
            unit: "ng/mL",
            delta: "↓ 8",
            color: "#DC2626",
            d: [45, 32, 18, 14],
          },
          {
            label: "Vitamin D",
            val: "22",
            unit: "ng/mL",
            delta: "↓ 6",
            color: "#DC2626",
            d: [42, 35, 28, 22],
          },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-neutral-200/80 p-2.5"
          >
            <div className="text-[9px] text-neutral-400 font-body">
              {c.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-[18px] font-medium tracking-tight font-display">
                {c.val}
              </span>
              <span className="text-[8px] text-neutral-400 font-mono">
                {c.unit}
              </span>
            </div>
            <div className="mt-1.5 flex items-end justify-between">
              <span
                className="text-[8px] font-medium font-mono"
                style={{ color: c.color }}
              >
                {c.delta}
              </span>
              <Spark data={c.d} color={c.color} w={44} h={14} />
            </div>
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="grid grid-cols-[1.6fr_0.9fr_1fr_0.7fr_0.8fr] gap-2 border-t border-b border-neutral-100 bg-neutral-50/80 px-4 py-1.5">
        {["Metric", "Value", "Reference", "Status", "Trend"].map((h) => (
          <div
            key={h}
            className="text-[8px] font-semibold uppercase tracking-[0.06em] text-neutral-400 font-mono"
          >
            {h}
          </div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.metric}
          className={`grid grid-cols-[1.6fr_0.9fr_1fr_0.7fr_0.8fr] items-center gap-2 px-4 py-2 ${i < rows.length - 1 ? "border-b border-neutral-100/80" : ""}`}
        >
          <div className="text-[10px] font-medium text-neutral-800 font-body">
            {r.metric}
          </div>
          <div className="flex items-baseline gap-0.5">
            <span
              className="text-[11px] font-semibold tabular-nums font-mono"
              style={{ color: r.st === "normal" ? "#141414" : sc[r.st] }}
            >
              {r.val}
            </span>
            <span className="text-[8px] text-neutral-400 font-mono">
              {r.unit}
            </span>
          </div>
          <div className="text-[9px] text-neutral-400 font-mono">{r.range}</div>
          <span
            className="inline-flex w-fit items-center gap-[3px] rounded-full px-1.5 py-[2px] text-[8px] font-medium"
            style={{
              backgroundColor: sb[r.st],
              color: sc[r.st],
              border: `1px solid ${sbo[r.st]}`,
            }}
          >
            <span
              className="size-[5px] rounded-full"
              style={{ backgroundColor: sc[r.st] }}
            />
            {sl[r.st]}
          </span>
          <div className="flex justify-end">
            <Spark data={r.trend} color={sc[r.st]!} w={52} h={16} />
          </div>
        </div>
      ))}
    </BrowserWindow>
  );
}
