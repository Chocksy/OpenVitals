import Link from "next/link";
import { ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getToday } from "@/lib/daily-data";
import { localDay, partialDay, shiftDay } from "@/lib/daily";
import { formatDate } from "@/lib/utils";
import { HabitChecklist, QuickNumbers } from "@/components/tracker";
import { DailySparks } from "@/components/daily-charts";
import { ConsistencyHeatmap } from "@/components/heatmap";
import { NutritionLine, WearableStrip } from "@/components/wearable";

export const dynamic = "force-dynamic";

const VALID = /^\d{4}-\d{2}-\d{2}$/;

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const userId = await requireUserId();
  const { d } = await searchParams;
  const today = localDay();
  const day = d && VALID.test(d) ? d : today;
  const view = await getToday(userId, day);

  const done = view.habits.filter((h) => h.doneToday).length;
  // Phase 24b: at 06:18 the day holds 49 steps, and showing that as the day is
  // a lie of omission. The strip says "so far", and yesterday — a day that is
  // actually over — goes above it.
  const partial = day === today && partialDay(new Date().getHours(), view.values.steps ?? null);
  const arrow =
    "card flex size-8 items-center justify-center text-neutral-500 hover:border-accent-200 hover:text-neutral-900";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/today?d=${shiftDay(day, -1)}`} className={arrow}>
            <ChevronLeft className="size-4" />
          </Link>
          <div>
            <h1 className="font-display text-[26px] font-medium tracking-[-0.03em]">
              {day === today ? "Today" : formatDate(day)}
            </h1>
            <p className="font-mono text-[11px] text-neutral-400">
              {day === today ? formatDate(day) : day}
              {view.habits.length > 0 &&
                ` · ${done}/${view.habits.length} habits`}
            </p>
          </div>
          {day < today ? (
            <Link href={`/today?d=${shiftDay(day, 1)}`} className={arrow}>
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className={`${arrow} pointer-events-none opacity-30`}>
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {day !== today && (
            <Link
              href="/today"
              className="font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-400 hover:text-neutral-900"
            >
              Back to today
            </Link>
          )}
          <span className="card flex items-center gap-1.5 px-3 py-2 font-mono text-[13px] font-semibold tabular-nums">
            <Flame className="size-4 text-[var(--color-health-warning)]" />
            {view.streak}
            <span className="text-[11px] font-normal text-neutral-400">
              day streak
            </span>
          </span>
        </div>
      </div>

      <p className="font-mono text-[11px] text-neutral-400">
        Numbers the phone sent are filled in for you; anything you type wins.{" "}
        <Link href="/feel" className="underline hover:text-neutral-900">
          How do you feel
        </Link>{" "}
        asks the twelve symptom questions the engine scores.
      </p>

      {partial && view.yesterday && (
        <WearableStrip
          title={`Yesterday · ${view.yesterday.day}`}
          wearable={view.yesterday.wearable}
          steps={view.yesterday.values.steps}
          exerciseMin={view.yesterday.values.exerciseMin}
          sleepHours={view.yesterday.values.sleepHours}
        />
      )}
      <WearableStrip
        wearable={view.wearable}
        steps={view.values.steps}
        exerciseMin={view.values.exerciseMin}
        sleepHours={view.values.sleepHours}
        partial={partial}
      />
      <NutritionLine nutrition={view.nutrition} />

      <HabitChecklist day={day} habits={view.habits} />
      <QuickNumbers key={day} day={day} values={view.values} />
      <DailySparks series={view.series} />

      <div className="card p-4">
        <ConsistencyHeatmap days={view.heat} />
      </div>
    </div>
  );
}
