"use client";

/**
 * "What to do" on a conclusion card.
 *
 * Phase 26 gave the card the top three actions for its condition, from the
 * person's own plan first and the graded intervention rows after. Phase 30d
 * rewrote what one row prints, from the owner's own reading of Home:
 *
 * - the title on its own line, and the dose under it once — never glued on
 *   the end of a title that already says it (UX note 5, `doseLine`);
 * - the target as a sentence: "aim: TPO antibodies under 100 IU/mL · retest
 *   in 24 weeks", never "tpo antibodies down → <100 IU/mL" (UX note 6);
 * - a row with neither a dose nor a sentence of its own does not render here
 *   at all; it belongs on Plan's horizon shelf (UX note 7, `saysSomething`);
 * - every glyph carries its grade letter and its tooltip (UX note 8);
 * - one quiet Add per row and one ink "Add all n" under them, and nothing
 *   else: the doctor's note and "Something's off?" moved into the card's why
 *   disclosure, so a card ends with three controls and not seven (UX note 9).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import type { PlanLine } from "@/lib/actions";
import { doseLine, saysSomething } from "@/lib/plan-line";
import { toast } from "./motion";
import { Button } from "./ui-kit";
import { EvidenceChip } from "./evidence-chip";

/** What one adopt call answers with, so an undo knows what to remove. */
interface Added {
  ok?: boolean;
  id?: string;
  error?: string;
}

const post = async (url: string, body: unknown): Promise<Added> => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as Added;
};

/** The body that adopts one line, whichever source it came from. */
const bodyFor = (line: PlanLine, reportId: string | null) =>
  line.source === "plan" && reportId != null
    ? { reportId, actionIndex: line.index }
    : { interventionId: line.interventionId };

export function WhatToDo({
  conditionId,
  conditionName,
  lines,
  reportId,
}: {
  conditionId: string;
  conditionName: string;
  lines: PlanLine[];
  /** the report the plan lines are indexes into */
  reportId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState("");

  const undo = async (ids: string[]) => {
    await post("/api/plan/adopt", { removeIds: ids });
    setDone([]);
    start(() => router.refresh());
  };

  const add = async (chosen: PlanLine[], key: string) => {
    setBusy(key);
    setError("");
    const ids: string[] = [];
    for (const line of chosen) {
      const res = await post("/api/plan/adopt", bodyFor(line, reportId));
      if (res.error) {
        setBusy("");
        setError(res.error);
        return;
      }
      if (res.id) ids.push(res.id);
    }
    setBusy("");
    setDone((was) => [...was, ...chosen.map((l) => l.title)]);
    toast(
      `Added ${ids.length} ${ids.length === 1 ? "action" : "actions"} to your protocol`,
      { label: "undo", run: () => undo(ids) },
    );
    start(() => router.refresh());
  };

  const getActions = async () => {
    setBusy("get");
    setError("");
    const res = await post("/api/plan", { conditionId });
    setBusy("");
    if (res.error) {
      setError(res.error);
      return;
    }
    toast(`Wrote actions for ${conditionName}`);
    start(() => router.refresh());
  };

  const working = !!busy || pending;
  /* UX note 7: a supplement name, a glyph and a direction is not an action. */
  const shown = lines.filter(saysSomething);
  const left = shown.filter((l) => !done.includes(l.title));

  return (
    <div className="mt-3 border-t border-[var(--hair)] pt-3">
      <div className="sub" style={{ marginTop: 0 }}>
        <h3>What to do</h3>
        <span>each with the number it should move</span>
      </div>

      {shown.length === 0 ? (
        <div className="mt-2 space-y-2">
          <p className="t-body text-[length:var(--type-sm)] text-[var(--ink-3)]">
            Nothing has been written for this one yet.
          </p>
          <Button
            size="sm"
            job="quiet"
            disabled={working}
            onClick={() => void getActions()}
          >
            {busy === "get" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {busy === "get" ? "Writing them…" : "Get actions"}
          </Button>
        </div>
      ) : (
        <>
          <ul className="mt-2 space-y-3">
            {shown.map((line) => {
              const added = done.includes(line.title);
              const dose = doseLine(line);
              return (
                <li
                  key={`${line.source}:${line.title}`}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="t-body block text-[length:var(--type-sm)] text-[var(--ink)]">
                      {line.title}{" "}
                      <EvidenceChip basis={line.basis} grade={line.grade} />
                    </span>
                    {dose && (
                      <span className="t-meta block text-[length:var(--type-xs)]">
                        {dose}
                      </span>
                    )}
                    {line.aim && (
                      <span className="t-meta block text-[length:var(--type-xs)]">
                        {line.aim}
                      </span>
                    )}
                  </span>
                  {added ? (
                    <span className="state on shrink-0">added</span>
                  ) : (
                    <Button
                      size="sm"
                      job="quiet"
                      className="shrink-0"
                      disabled={working}
                      onClick={() => void add([line], line.title)}
                    >
                      Add
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {left.length > 1 && (
            <div className="mt-3">
              <Button
                size="sm"
                job="ink"
                disabled={working}
                onClick={() => void add(left, "all")}
              >
                {busy === "all" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Add all {left.length}
              </Button>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="t-meta mt-1.5 text-[length:var(--type-xs)] text-[var(--bad)]">
          {error}
        </p>
      )}
    </div>
  );
}
