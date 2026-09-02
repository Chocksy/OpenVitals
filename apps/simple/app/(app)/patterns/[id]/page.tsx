import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Stethoscope } from "lucide-react";
import { getDb, reviewItems } from "@/db";
import { requireUserId } from "@/lib/auth";
import { buildModelInput, type ModelInput } from "@/lib/coverage";
import { EDGES, NODES, type GraphEdge } from "@/lib/graph";
import { matchPatterns, PATTERNS } from "@/lib/patterns";
import { ReviewItem } from "@/components/client";
import { ViewShell } from "@/components/plan";
import { Card, StateWord, type StateTone } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

const NAMES = new Map(NODES.map((n) => [n.id, n.name]));

const CONFIDENCE_TONE: Record<string, StateTone> = {
  established: "on",
  probable: "none",
  speculative: "none",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="t-meta mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
      {children}
    </h2>
  );
}

/**
 * ponytail: an escalation counts as done when this person has any reading for
 * a code the suggestion names. No table recording when the pattern first
 * matched, so the check is "was it ever measured", not "since when".
 */
function escalationDone(suggest: string, input: ModelInput): boolean {
  const text = suggest.toLowerCase();
  return Object.entries(input.latest).some(
    ([code, row]) =>
      row.value != null &&
      (text.includes(code.replace(/_/g, " ")) || text.includes(code)),
  );
}

export default async function PatternPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pattern = PATTERNS.find((p) => p.id === id);
  if (!pattern) notFound();

  const userId = await requireUserId();
  const [input, open] = await Promise.all([
    buildModelInput(userId),
    getDb()
      .select()
      .from(reviewItems)
      .where(
        and(eq(reviewItems.userId, userId), eq(reviewItems.status, "open")),
      ),
  ]);

  const match = matchPatterns(input).find((m) => m.pattern.id === id);
  const matched = match?.matched ?? false;

  const overrides = new Map(
    (pattern.effects.edgeOverrides ?? []).map((o) => [o.edgeId, o]),
  );
  const edges: GraphEdge[] = EDGES.filter(
    (e) => e.when?.pattern === id || overrides.has(e.id),
  );

  const years = [...pattern.evidence, ...edges.flatMap((e) => e.evidence)]
    .map((e) => e.year)
    .filter((y): y is number => y != null);
  const lastReviewed = years.length ? Math.max(...years) : null;

  const asked = new Map(
    open
      .filter((i) => i.kind === "profile_question")
      .map((i) => [i.subject?.factKey ?? i.subject?.key ?? "", i]),
  );

  return (
    <ViewShell
      title={pattern.name}
      subtitle={
        matched
          ? `Matched for you${match?.stage ? ` · stage ${match.stage}` : ""}`
          : "Not matched for you"
      }
    >
      <div>
        <Link
          href="/graph"
          className="inline-flex items-center gap-1 t-meta text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-400 hover:text-neutral-600"
        >
          <ChevronLeft className="size-3" />
          Graph
        </Link>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {matched ? (
            <StateWord tone="border">{match?.stage ?? "matched"}</StateWord>
          ) : (
            <StateWord>not matched for you</StateWord>
          )}
          {lastReviewed && (
            <span className="t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
              last reviewed {lastReviewed}
            </span>
          )}
        </div>

        <p className="mt-3 font-body text-[15px] leading-relaxed text-neutral-800">
          {pattern.summary}
        </p>

        {matched ? (
          <p className="mt-3 font-body text-[13px] text-neutral-600">
            <span className="t-meta text-[10px] font-bold uppercase text-neutral-400">
              Why this matched ·{" "}
            </span>
            {match?.reasons.join("; ") || "the detector matched"}
          </p>
        ) : (
          <p className="mt-3 font-body text-[13px] text-neutral-600">
            <span className="t-meta text-[10px] font-bold uppercase text-neutral-400">
              What it looks for ·{" "}
            </span>
            {pattern.detects}
          </p>
        )}
      </Card>

      <section>
        <Label>Contested</Label>
        <Card className="p-4">
          <p className="font-body text-[13px] leading-relaxed text-neutral-700">
            {pattern.controversy}
          </p>
        </Card>
      </section>

      <section>
        <Label>Management</Label>
        <Card className="p-4">
          <p className="font-body text-[13px] leading-relaxed text-neutral-700">
            {pattern.management}
          </p>
        </Card>
      </section>

      <section>
        <Label>
          Tests that would confirm it · {pattern.effects.escalations.length}
        </Label>
        <div className="card divide-y divide-neutral-100">
          {pattern.effects.escalations.map((e) => {
            const done = escalationDone(e.suggest, input);
            return (
              <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                <div className="flex-1">
                  <p className="t-body text-neutral-800">
                    {e.suggest}
                    {done && <span className="t-meta text-[12px]"> · done</span>}
                  </p>
                  <p className="deep mt-1 font-body text-[12px] text-neutral-500">
                    {e.why} · tier {e.tier} · {e.ref}
                  </p>
                </div>
                <Link
                  href="/insights"
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-neutral-200 bg-neutral-0 px-3 font-display text-[12px] tracking-[0.04em] text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50"
                >
                  <Stethoscope className="size-3.5" /> Plan
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <Label>Edges this pattern owns · {edges.length}</Label>
        <div className="card divide-y divide-neutral-100">
          {edges.map((edge) => {
            const override = overrides.get(edge.id);
            const confidence = override?.confidence ?? edge.confidence;
            return (
              <div key={edge.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start gap-2">
                  <StateWord tone={CONFIDENCE_TONE[confidence]}>
                    {confidence}
                  </StateWord>
                  <p className="flex-1 font-body text-[13px] text-neutral-800">
                    {NAMES.get(edge.from) ?? edge.from} {edge.relation}{" "}
                    {NAMES.get(edge.to) ?? edge.to}
                  </p>
                  <span className="t-meta text-[10px] font-bold uppercase tracking-[0.04em] text-neutral-400">
                    strength {edge.strength}
                  </span>
                </div>
                <p className="mt-1 font-body text-[12px] text-neutral-600">
                  {edge.mechanism}
                  {override?.note ? ` (${override.note})` : ""}
                </p>
                <p className="t-meta deep mt-1 text-[12px]">
                  {edge.id} · evidence:{" "}
                  {edge.evidence
                    .map(
                      (v) =>
                        `${v.kind}: ${v.title}${v.year ? ` (${v.year})` : ""}${
                          v.source ? ` — ${v.source}` : ""
                        }`,
                    )
                    .join(" · ")}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <Label>Questions · {pattern.effects.questions.length}</Label>
        <div className="space-y-2">
          {pattern.effects.questions.map((q) => {
            const answered = input.profile[q.key] != null;
            const item = asked.get(q.key);
            if (!answered && item)
              return (
                <ReviewItem
                  key={q.key}
                  id={item.id}
                  question={item.question}
                  options={item.options}
                />
              );
            return (
              <Card key={q.key} className="flex flex-wrap gap-2 p-4">
                <p className="flex-1 font-body text-[13px] text-neutral-700">
                  {q.text}
                </p>
                <StateWord tone={answered ? "on" : "none"}>
                  {answered ? "answered" : "not asked yet"}
                </StateWord>
              </Card>
            );
          })}
        </div>
      </section>
    </ViewShell>
  );
}
