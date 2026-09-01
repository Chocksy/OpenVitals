"use client";

/**
 * "What to do" on a conclusion card.
 *
 * Phase 26, items 5 and 6. The cards said what was wrong and printed the
 * catalog's shorthand for what a doctor would do about it ("Selenium trial
 * justified; keep ferritin >50 and vitamin D 40–60"), and the one button that
 * looked like it would act — "Add to protocol" — silently did nothing on a
 * condition card, because a condition card had no plan action behind it.
 *
 * So: the top three actions for this condition, from `lib/actions.ts` — the
 * person's own plan first, the graded intervention rows after — each with its
 * dose, its label in brackets, and what it should move by when. Every line has
 * an Add, the block has an Add all, every add says what it did in a toast and
 * offers to take it back. When there is nothing yet, the button says so and
 * asks the plan writer for actions for this condition.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { PlanLine } from "@/lib/actions";
import { toast } from "./motion";
import { Button } from "./ui-kit";

const LABEL =
  "t-meta text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400";

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
  management,
}: {
  conditionId: string;
  conditionName: string;
  lines: PlanLine[];
  /** the report the plan lines are indexes into */
  reportId: string | null;
  /** the catalog's own management text, kept as the quieter doctor's note */
  management?: string;
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
  const left = lines.filter((l) => !done.includes(l.title));

  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      <div className={LABEL}>What to do</div>

      {lines.length === 0 ? (
        <div className="mt-1.5 space-y-2">
          <p className="t-body text-[12px] text-neutral-500">
            Nothing has been written for this one yet.
          </p>
          <Button
            size="sm"
            variant="outline-subtle"
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
          <ul className="mt-1.5 space-y-1.5">
            {lines.map((line) => {
              const added = done.includes(line.title);
              return (
                <li
                  key={`${line.source}:${line.title}`}
                  className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1"
                >
                  <span className="t-body flex-1 text-[13px] text-neutral-800">
                    {line.title}
                    {line.dose && (
                      <span className="t-num ml-1.5 text-[11px] text-neutral-600">
                        {line.dose}
                      </span>
                    )}
                    <span className="t-meta ml-1.5 text-[11px]">
                      {line.label}
                    </span>
                    {line.target && (
                      <span className="t-meta ml-1.5 text-[11px]">
                        · {line.target}
                      </span>
                    )}
                  </span>
                  {added ? (
                    <span className="t-meta text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--color-health-normal)]">
                      added
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
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
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline-subtle"
                disabled={working}
                onClick={() => void add(left, "all")}
              >
                {busy === "all" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                Add {left.length} to your protocol
              </Button>
            </div>
          )}
        </>
      )}

      {management && (
        <details className="mt-2">
          <summary className="hit-40 t-meta inline-flex cursor-pointer list-none items-center text-[11px] hover:text-neutral-900">
            Doctor&rsquo;s note
          </summary>
          <p className="t-meta mt-1 border-l-2 border-neutral-150 pl-3 text-[11px]">
            {management}
          </p>
        </details>
      )}

      {error && (
        <p className="t-meta mt-1.5 text-[11px] text-[var(--color-health-critical)]">
          {error}
        </p>
      )}
    </div>
  );
}
