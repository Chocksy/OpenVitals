import Link from "next/link";
import { Target, Trophy } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getGoals, type GoalView } from "@/lib/daily-data";
import { formatRange } from "@/lib/status";

export const dynamic = "force-dynamic";

function GoalCard({ g }: { g: GoalView }) {
  const target = formatRange(g.targetLow, g.targetHigh, g.unit);
  const overdue = g.due && !g.reached && g.due < new Date().toISOString().slice(0, 10);

  return (
    <Link href={`/m/${g.metricCode}`} className="card block p-4 hover:border-accent-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[14px] font-medium">
            {g.metricName}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-neutral-400">
            target {target}
            {g.due && (
              <span className={overdue ? "text-[var(--color-health-critical)]" : ""}>
                {" "}
                · by {g.due}
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-[20px] font-semibold tabular-nums">
            {g.current ?? "—"}
          </span>
          <span className="ml-1 font-mono text-[10px] text-neutral-400">
            {g.unit ?? ""}
          </span>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-150">
        <div
          className="h-full"
          style={{
            width: `${g.progress}%`,
            backgroundColor: g.reached
              ? "var(--color-health-normal)"
              : "var(--color-accent-500)",
          }}
        />
      </div>

      <p className="mt-2 font-mono text-[11px] text-neutral-500">
        {g.reached
          ? "In the target band"
          : g.current == null
            ? "No reading yet"
            : `${g.progress}% of the way · ${Math.round(g.gap * 100) / 100} ${g.unit ?? ""} to go`}
        {g.currentAt && ` · measured ${g.currentAt}`}
      </p>
      {g.note && (
        <p className="mt-1 font-body text-[12px] text-neutral-500">{g.note}</p>
      )}
    </Link>
  );
}

export default async function GoalsPage() {
  const userId = await requireUserId();
  const goals = await getGoals(userId);
  const done = goals.filter((g) => g.achievedAt || g.reached);
  const open = goals.filter((g) => !done.includes(g));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Goals
        </h1>
        <p className="mt-1 font-body text-[13px] text-neutral-500">
          One target band per biomarker. Set them from a biomarker page.
        </p>
      </div>

      {goals.length === 0 ? (
        <div className="card border-dashed p-10 text-center">
          <Target className="mx-auto mb-3 size-8 text-neutral-300" />
          <p className="font-display text-[15px] font-medium">No goals yet</p>
          <p className="mt-1 font-body text-[13px] text-neutral-500">
            Open a biomarker from{" "}
            <Link href="/biomarkers" className="underline">
              Biomarkers
            </Link>{" "}
            and press &ldquo;Set goal&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {open.map((g) => (
            <GoalCard key={g.id} g={g} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            <Trophy className="size-3 text-[var(--color-health-normal)]" />
            Done ({done.length})
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {done.map((g) => (
              <GoalCard key={g.id} g={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
