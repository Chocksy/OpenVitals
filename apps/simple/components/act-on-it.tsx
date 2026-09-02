"use client";

/**
 * "Act on it": the row of chips under an answer.
 *
 * Phase 27. The answers were right and then they stopped — six good sentences
 * naming selenium, iron and a ferritin retest, and nothing on the screen a
 * person could press. So the model now returns the ids it used and this row is
 * one chip per id: the same `/api/plan/adopt` the What-to-do block posts, the
 * same goal row the Next draw tile reads, and the same Today card `askHref`
 * points every other surface at. No new write path, and nothing here decides
 * anything — the engine handed it this list.
 *
 * ROADMAP principle 3, at the level of a button: the model chooses from the
 * candidates, the engine owns what the button does.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CircleQuestionMark,
  Loader2,
  Plus,
  Stethoscope,
} from "lucide-react";
import { askHref } from "@/lib/asking";
import { toast } from "./motion";
import { StateWord } from "./ui-kit";
import { EvidenceChip } from "./evidence-chip";

/** One action off the plan or off the papers, by the id it was offered under. */
export interface ActAction {
  id: string;
  title: string;
  dose: string | null;
  /** the bracket label the prose still carries; the chip prints the glyph */
  label: string;
  basis: string;
  grade?: string;
  target: string | null;
}

/** One marker the answer said to measure again, and when. */
export interface ActTest {
  code: string;
  name: string;
  weeks: number;
  /** false when it takes a doctor's order: then the chip copies the name */
  selfOrder: boolean;
}

export interface ActQuestion {
  key: string;
  question: string;
}

export interface Acts {
  actions: ActAction[];
  tests: ActTest[];
  questions: ActQuestion[];
  /** ids the model returned that were never on offer; the eval reads these */
  dropped?: string[];
}

/** Nothing to act on: the row renders nothing at all. */
const emptyActs = (a?: Acts | null): boolean =>
  !a || (!a.actions.length && !a.tests.length && !a.questions.length);

const DAY = 86_400_000;

/** The day a retest is planned for, from the weeks the answer named. */
const dueDate = (weeks: number, from = Date.now()): string =>
  new Date(from + weeks * 7 * DAY).toISOString().slice(0, 10);

interface Posted {
  ok?: boolean;
  id?: string;
  error?: string;
}

const post = async (url: string, body: unknown): Promise<Posted> => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as Posted;
};

export function ActOnIt({
  acts,
  onLeave,
}: {
  acts?: Acts | null;
  /** close the box before a chip navigates away from it */
  onLeave?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState("");

  if (emptyActs(acts)) return null;
  const { actions, tests, questions } = acts!;

  const undo = async (ids: string[]) => {
    await post("/api/plan/adopt", { removeIds: ids });
    setDone([]);
    router.refresh();
  };

  const add = async (chosen: ActAction[], key: string) => {
    setBusy(key);
    setError("");
    const ids: string[] = [];
    for (const a of chosen) {
      const res = await post("/api/plan/adopt", { id: a.id });
      if (res.error) {
        setBusy("");
        setError(res.error);
        return;
      }
      if (res.id) ids.push(res.id);
    }
    setBusy("");
    setDone((was) => [...was, ...chosen.map((a) => a.id)]);
    toast(
      `Added ${ids.length} ${ids.length === 1 ? "action" : "actions"} to your protocol`,
      { label: "undo", run: () => undo(ids) },
    );
    router.refresh();
  };

  /**
   * A retest is a goal with a date on it: `/api/goals` already writes one per
   * marker, and the Next draw tile reads the soonest one. No second table for
   * "we said we would measure this again".
   */
  const planRetest = async (t: ActTest) => {
    setBusy(t.code);
    setError("");
    const res = await post("/api/goals", {
      metricCode: t.code,
      due: dueDate(t.weeks),
      note: `retest ${t.name} after ${t.weeks} weeks`,
    });
    setBusy("");
    if (res.error) {
      setError(res.error);
      return;
    }
    setDone((was) => [...was, t.code]);
    toast(`${t.name} planned for ${dueDate(t.weeks)}`);
    router.refresh();
  };

  const copy = async (name: string) => {
    await navigator.clipboard?.writeText(name).catch(() => {});
    toast(`Copied “${name}”`);
  };

  const left = actions.filter((a) => !done.includes(a.id));
  const working = !!busy;

  return (
    <div className="mt-3 border-t border-[var(--hair)] pt-3">
      <p className="t-meta">Act on it</p>

      <div className="chips mt-2">
        {actions.map((a) =>
          done.includes(a.id) ? (
            <StateWord key={a.id} tone="on" data-act="added">
              added
            </StateWord>
          ) : (
            <button
              key={a.id}
              className="chip"
              data-act="add"
              disabled={working}
              onClick={() => void add([a], a.id)}
            >
              {busy === a.id ? (
                <Loader2 className="ic spin" aria-hidden="true" />
              ) : (
                <Plus className="ic" aria-hidden="true" />
              )}
              <span>
                Add: {a.title}
                {a.dose ? ` ${a.dose}` : ""}
              </span>
              <EvidenceChip basis={a.basis} grade={a.grade} />
            </button>
          ),
        )}

        {left.length > 1 && (
          <button
            className="chip quiet"
            data-act="add-all"
            disabled={working}
            onClick={() => void add(left, "all")}
          >
            {busy === "all" ? (
              <Loader2 className="ic spin" aria-hidden="true" />
            ) : (
              <Plus className="ic" aria-hidden="true" />
            )}
            Add all {left.length}
          </button>
        )}

        {tests.map((t) =>
          !t.selfOrder ? (
            <button
              key={t.code}
              className="chip"
              data-act="ask-doctor"
              onClick={() => void copy(t.name)}
            >
              <Stethoscope className="ic" aria-hidden="true" />
              <span>Ask your doctor for: {t.name}</span>
            </button>
          ) : done.includes(t.code) ? (
            <StateWord key={t.code} tone="on" data-act="planned">
              planned
            </StateWord>
          ) : (
            <button
              key={t.code}
              className="chip ink"
              data-act="retest"
              disabled={working}
              onClick={() => void planRetest(t)}
            >
              {busy === t.code ? (
                <Loader2 className="ic spin" aria-hidden="true" />
              ) : (
                <CalendarDays className="ic" aria-hidden="true" />
              )}
              <span>
                Plan retest: {t.name} in {t.weeks} weeks
              </span>
            </button>
          ),
        )}

        {questions.map((q) => (
          <a
            key={q.key}
            href={askHref(q.key)}
            className="chip quiet"
            data-act="answer"
            onClick={onLeave}
          >
            <CircleQuestionMark className="ic" aria-hidden="true" />
            <span>Answer: {q.question}</span>
          </a>
        ))}
      </div>

      {error && (
        <p className="t-meta mt-2 text-[var(--bad)]">{error}</p>
      )}
    </div>
  );
}
