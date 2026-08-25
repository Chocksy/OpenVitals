/**
 * A GitHub-style year grid and the 30-cell strip that /protocol reuses.
 * ponytail: plain SVG. recharts has no calendar heatmap and one <rect> per day
 * is 12 lines of code.
 */
import { cn } from "@/lib/utils";

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

/** Neutral for nothing, then the accent ramp. */
export const BUCKET_FILL = [
  "var(--color-neutral-100)",
  "var(--color-accent-100)",
  "var(--color-accent-300)",
  "var(--color-accent-500)",
  "var(--color-accent-700)",
];

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
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            {label}
          </span>
          <span className="flex items-center gap-1 font-mono text-[10px] text-neutral-400">
            less
            {BUCKET_FILL.map((fill) => (
              <span
                key={fill}
                className="inline-block size-[9px] rounded-[2px]"
                style={{ backgroundColor: fill }}
              />
            ))}
            more
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <svg width={width} height={top + 7 * STEP} className="block">
          {monthTicks.map((t) => (
            <text
              key={`${t.text}-${t.x}`}
              x={t.x}
              y={9}
              fontSize={9}
              fontFamily="var(--font-mono)"
              fill="var(--color-neutral-400)"
            >
              {t.text}
            </text>
          ))}
          {days.map((d, i) => (
            <rect
              key={d.day}
              x={Math.floor((i + offset) / 7) * STEP}
              y={top + ((i + offset) % 7) * STEP}
              width={CELL}
              height={CELL}
              rx={2}
              fill={BUCKET_FILL[d.bucket] ?? BUCKET_FILL[0]}
            >
              <title>{`${d.day}`}</title>
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
    <div className={cn("flex gap-[2px]", className)}>
      {values.map((v, i) => (
        <span
          key={i}
          className="h-3 w-[5px] rounded-[1px]"
          style={{
            backgroundColor: v
              ? "var(--color-health-normal)"
              : "var(--color-neutral-150)",
          }}
        />
      ))}
    </div>
  );
}
