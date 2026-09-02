"use client";

/**
 * A year grid and the 30-cell strip that /plan reuses.
 *
 * Phase 30b restyles both onto the system page's own classes: `.hm` with the
 * five `--ok` steps (`c0`–`c4`) instead of the accent ramp, and `.strip30`
 * with its `<s>` cells. The arithmetic is unchanged — one `<rect>` per day,
 * still plain SVG, still no chart library.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PillTabs } from "./pill-tabs";

const CELL = 11;
const GAP = 2;
const STEP = CELL + GAP;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The five steps of the grid, as class names the stylesheet owns. */
const BUCKET = ["c0", "c1", "c2", "c3", "c4"];

const weekday = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
};

export function Heatmap({
  days,
  label,
}: {
  days: { day: string; bucket: number }[];
  label?: string;
}) {
  if (days.length === 0) return null;

  const offset = weekday(days[0]!.day);
  const columns = Math.ceil((days.length + offset) / 7);
  const width = columns * STEP;
  const top = 14;

  // One label per column whose month differs from the column before it.
  const monthTicks: { x: number; text: string }[] = [];
  let lastMonth = days[0]!.day.slice(0, 7);
  for (let col = 1; col < columns; col++) {
    const day = days[col * 7 - offset];
    if (!day) continue;
    const month = day.day.slice(0, 7);
    if (month === lastMonth) continue;
    lastMonth = month;
    monthTicks.push({
      x: col * STEP,
      text: MONTHS[Number(month.slice(5, 7)) - 1]!,
    });
  }

  return (
    <div className="flex flex-col gap-[var(--s5)]">
      {label && (
        <div className="rowh justify-between">
          <span className="t-meta">{label}</span>
          <span className="hmkey">
            less
            {BUCKET.map((step) => (
              <i key={step} className={`hm-${step}`} />
            ))}
            more
          </span>
        </div>
      )}
      <div className="hm">
        <svg width={width} height={top + 7 * STEP}>
          {monthTicks.map((t) => (
            <text key={`${t.text}-${t.x}`} x={t.x} y={9}>
              {t.text}
            </text>
          ))}
          {days.map((d, i) => (
            <rect
              key={d.day}
              className={BUCKET[d.bucket] ?? BUCKET[0]}
              x={Math.floor((i + offset) / 7) * STEP}
              y={top + ((i + offset) % 7) * STEP}
              width={CELL}
              height={CELL}
              rx={2}
            >
              <title>{d.day}</title>
            </rect>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** 30 cells, one per day, oldest on the left. */
export function Strip({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  return (
    <div className={cn("strip30", className)}>
      {values.map((v, i) => (
        <s
          key={i}
          className={cn(v ? "on" : "", i === values.length - 1 && "today")}
        />
      ))}
    </div>
  );
}

/**
 * The year grid with its two readings of the same year.
 *
 * Phase 24b: the blue wall. The heatmap counted any `daily_logs` row, and a
 * phone writes one every day, so a year of solid colour said "you logged every
 * day" when the person had typed nothing. "You" counts habit ticks, numbers
 * typed, notes and posts; "phone" is the sync coverage, which is a real thing
 * to want to see and is labelled as itself.
 */
export function ConsistencyHeatmap({
  days,
}: {
  days: { day: string; bucket: number; phone: number }[];
}) {
  const [mode, setMode] = useState<"you" | "phone">("you");
  const shown =
    mode === "you" ? days : days.map((d) => ({ day: d.day, bucket: d.phone }));
  const count = shown.filter((d) => d.bucket > 0).length;

  return (
    <div className="panel">
      <div className="rowh mb-[var(--s8)] justify-between">
        <PillTabs
          label="Whose days"
          active={mode}
          tabs={[
            { id: "you", label: "You" },
            { id: "phone", label: "Phone" },
          ]}
          onSelect={(id) => setMode(id as "you" | "phone")}
        />
        <span className="t-meta">
          <span className="t-num">
            {count} of {days.length}
          </span>{" "}
          days · {mode === "you" ? "what you did" : "what the phone sent"}
        </span>
      </div>
      <Heatmap days={shown} />
      <p className="cap">
        Two readings of the same year. “You” counts habit ticks, numbers typed,
        notes and posts. “Phone” is sync coverage, which is a real thing to want
        to see and is labelled as itself.
      </p>
    </div>
  );
}
