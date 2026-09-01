import { and, desc, eq } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { getDb, metrics as metricsTable, reviewItems } from "@/db";
import { ReviewItem } from "@/components/client";
import { AskLink } from "@/components/ask-link";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  profile_question: "Questions the engine is waiting on",
  unit_unknown: "Units I could not convert",
  merge_metric: "Possible duplicate biomarkers",
  range_impact: "Optimal ranges that change a result",
  confirm_value: "Values the lab sheet did not settle",
  implausible: "Values that look wrong",
  foreign_reading: "Readings that may not belong here",
};

export default async function ReviewPage() {
  const userId = await requireUserId();
  const db = getDb();
  const [rows, allMetrics] = await Promise.all([
    db
      .select()
      .from(reviewItems)
      .where(
        and(eq(reviewItems.userId, userId), eq(reviewItems.status, "open")),
      )
      .orderBy(desc(reviewItems.createdAt)),
    db
      .select({ code: metricsTable.code, name: metricsTable.name })
      .from(metricsTable)
      .orderBy(metricsTable.name),
  ]);

  const byKind = new Map<string, typeof rows>();
  for (const r of rows) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
  const groups = [...byKind.entries()];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
          Data questions
        </h1>
        <p className="mt-1 font-body text-[13px] text-neutral-500">
          The curator fixes what it can on its own. These are the calls it will
          not make without you.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card border-dashed p-10 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-8 text-[var(--color-health-normal)]" />
          <p className="font-display text-[15px] font-medium">All clear</p>
          <p className="mt-1 font-body text-[13px] text-neutral-500">
            Nothing needs your attention right now.
          </p>
        </div>
      ) : (
        groups.map(([kind, items]) => (
          <section key={kind}>
            <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
              {KIND_LABELS[kind] ?? kind} · {items.length}
            </h2>
            <div className="space-y-2">
              {items.map((item) =>
                /* Phase 24a: the engine's own questions are answered in the
                   Today card on Home. Here they are a line and a link; the
                   curator's data calls below still take their answer here. */
                kind === "profile_question" ? (
                  <AskLink
                    key={item.id}
                    ask={{
                      key: item.subject?.factKey ?? item.id,
                      question: item.question,
                      moves: [],
                    }}
                  />
                ) : (
                  <ReviewItem
                    key={item.id}
                    id={item.id}
                    question={item.question}
                    options={item.options}
                    detail={item.subject?.detail}
                    metrics={allMetrics}
                  />
                ),
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
