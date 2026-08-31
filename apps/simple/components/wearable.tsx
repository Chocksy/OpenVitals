/**
 * What the phone sent for one day, on /today.
 *
 * Phase 23c: 862 wearable days and 65 nutrition days were being stored and
 * rendered nowhere. This is the window on them — no new chart library, the
 * tracker's own visual language (mono labels, tabular numbers, the card), and
 * every number labelled with where it came from.
 *
 * Server components: nothing here is interactive.
 */
import type { DailyNutrition, DailyWearable } from "@/db";

const LABEL =
  "font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400";

/** 7.2 stays 7.2; 7120 stays 7120; nothing grows a trailing zero. */
const num = (v: number) =>
  Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);

/** 420 minutes reads as 7h 0m, because nobody thinks in minutes of sleep. */
const hm = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;

/** `strengthTraining` → `strength training`. */
const readable = (name: string) =>
  name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

const STAGE_ORDER = ["deep", "core", "rem", "awake"];

function Cell({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <span className={`block ${LABEL}`}>{label}</span>
      <span className="font-mono text-[16px] font-semibold tabular-nums text-neutral-900">
        {value}
        {unit && (
          <span className="ml-1 text-[10px] font-normal text-neutral-400">
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * The day's wearable numbers, its workouts and its sleep stages.
 *
 * Steps, exercise minutes and sleep live in `daily_logs` columns because a
 * person may type them too, so a column only appears here when
 * `wearable.wrote` says the sync is the one that filled it. A card headed
 * "from your phone" that shows a number somebody typed would be a small lie,
 * and the whole card is absent for anybody who has never synced.
 */
export function WearableStrip({
  wearable,
  steps,
  exerciseMin,
  sleepHours,
}: {
  wearable: DailyWearable | null;
  steps?: number | null;
  exerciseMin?: number | null;
  sleepHours?: number | null;
}) {
  const w = wearable;
  if (!w) return null;
  const owns = new Set(w.wrote ?? []);
  const workouts = w.workouts ?? [];
  const stages = Object.entries(w.sleepStages ?? {}).filter(([, m]) => m > 0);
  const cells = [
    owns.has("steps") && steps != null && { label: "Steps", value: num(steps) },
    owns.has("exerciseMin") &&
      exerciseMin != null && {
        label: "Exercise",
        value: num(exerciseMin),
        unit: "min",
      },
    w?.activeEnergyKcal != null && {
      label: "Active",
      value: num(w.activeEnergyKcal),
      unit: "kcal",
    },
    w?.distanceKm != null && {
      label: "Distance",
      value: num(w.distanceKm),
      unit: "km",
    },
    w?.flights != null && { label: "Flights", value: num(w.flights) },
    owns.has("sleepHours") &&
      sleepHours != null && { label: "Sleep", value: hm(sleepHours * 60) },
    w?.standHours != null && {
      label: "Stand",
      value: num(w.standHours),
      unit: "h",
    },
    w?.mindfulMin != null && {
      label: "Mindful",
      value: num(w.mindfulMin),
      unit: "min",
    },
  ].filter((c): c is { label: string; value: string; unit?: string } => !!c);

  if (!cells.length && !workouts.length) return null;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={LABEL}>From your phone</h2>
        {w?.syncedAt && (
          <span className="font-mono text-[10px] text-neutral-400">
            {w.source ?? "healthkit"} · synced {w.syncedAt.slice(11, 16)}
          </span>
        )}
      </div>

      {cells.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {cells.map((c) => (
            <Cell key={c.label} {...c} />
          ))}
        </div>
      )}

      {stages.length > 0 && (
        <p className="font-mono text-[11px] tabular-nums text-neutral-500">
          {stages
            .sort(
              (a, b) =>
                STAGE_ORDER.indexOf(a[0]) - STAGE_ORDER.indexOf(b[0]) ||
                a[0].localeCompare(b[0]),
            )
            .map(([name, m]) => `${name} ${hm(m)}`)
            .join(" · ")}
        </p>
      )}

      {workouts.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {workouts.map((k, i) => (
            <li
              key={`${k.type}-${i}`}
              className="border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-[11px] tabular-nums text-neutral-700"
            >
              <span className="font-body text-neutral-900">
                {readable(k.type)}
              </span>{" "}
              {num(k.min)} min
              {k.kcal != null ? ` · ${num(k.kcal)} kcal` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The day's food, in one line.
 *
 * Every number a photo produced is a guess and says so: `estimated` on the
 * blob is the whole reason the word "estimate" is printed here rather than
 * left to the reader to assume.
 */
export function NutritionLine({
  nutrition,
}: {
  nutrition: DailyNutrition | null;
}) {
  if (!nutrition || nutrition.kcal == null) return null;
  const macros = (
    [
      ["protein", nutrition.proteinG],
      ["carbs", nutrition.carbsG],
      ["fat", nutrition.fatG],
    ] as const
  )
    .filter(([, v]) => v != null)
    .map(([name, v]) => `${name} ${num(v!)} g`);

  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={LABEL}>Food</h2>
        {nutrition.estimated && (
          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
            estimate
          </span>
        )}
      </div>
      <p className="font-mono text-[13px] tabular-nums text-neutral-700">
        <span className="font-mono text-[16px] font-semibold text-neutral-900">
          {num(nutrition.kcal)}
        </span>{" "}
        kcal{macros.length ? ` · ${macros.join(" · ")}` : ""}
      </p>
      {nutrition.entries.length > 0 && (
        <p className="font-body text-[12px] text-neutral-500">
          {nutrition.entries
            .map((e) => `${e.at ? `${e.at} ` : ""}${e.label}`)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
