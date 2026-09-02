"use client";

/**
 * The three interactive bits of /plan: the Simple/Deep switch that owns the
 * page root, the Generate button, and the two buttons on every action card.
 * Everything else on the page is server-rendered.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MessageSquare, RefreshCw, Stethoscope } from "lucide-react";
import { openComposer } from "./composer";
import { toast } from "./motion";
import { Button } from "./ui-kit";

/** POST, then re-render the server components. Same shape as client.tsx. */
function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (url: string, body: unknown) => {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    setBusy(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed");
      return false;
    }
    start(() => router.refresh());
    return data;
  };
  return { run, busy: busy || pending, error };
}

/**
 * The page root: a title, a subtitle and the page's own actions.
 *
 * The simple/deep switch it used to carry is gone. `plan.html`'s build note
 * deletes it and the `[data-view="simple"] .deep` rule with it, because a
 * reader who has to find a toggle before the page tells them why is a reader
 * the page failed; the long half of each block is a quiet disclosure now.
 */
export function ViewShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-title text-[length:var(--type-xl)] leading-none">
            {title}
          </h1>
          {subtitle && (
            <p className="t-meta mt-1 text-[length:var(--type-sm)]">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function PlanShell({
  date,
  children,
}: {
  date: string | null;
  children: React.ReactNode;
}) {
  return (
    <ViewShell
      title="Your plan"
      subtitle={date ? `Written ${date}` : "No plan yet. Generate one."}
      actions={<GeneratePlan />}
    >
      {children}
    </ViewShell>
  );
}

export function GeneratePlan() {
  const { run, busy, error } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Button disabled={busy} onClick={() => run("/api/plan", {})}>
        <RefreshCw className={busy ? "animate-spin" : ""} />
        {busy ? "Writing your plan…" : "Generate"}
      </Button>
      {error && (
        <span className="t-meta text-[length:var(--type-sm)] text-[var(--bad)]">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * Adopt one thing off the Horizon shelf.
 *
 * The same protocol item as anything else, and none of the promises: the row
 * behind it is grade E, so no projection borrows an effect size from it. What
 * it gets instead is the measurement plan printed next to it.
 */
export function AdoptHorizon({
  interventionId,
  adopted,
}: {
  interventionId: string;
  adopted: boolean;
}) {
  const { run, busy, error } = useAction();
  const [state, setState] = useState(adopted);

  if (state)
    return (
      <span className="state on">
        <Check className="size-3" /> Adopted
      </span>
    );

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        job="quiet"
        disabled={busy}
        onClick={async () => {
          if (await run("/api/plan/adopt", { interventionId })) setState(true);
        }}
      >
        {busy ? "Adopting…" : "Adopt and measure"}
      </Button>
      {error && (
        <span className="t-meta text-[length:var(--type-sm)] text-[var(--bad)]">
          {error}
        </span>
      )}
    </span>
  );
}

/** `--panel-close-dur`: how long the exit is given before the row is gone. */
const EXIT_MS = 350;

/**
 * Three buttons and no more. A test or a doctor action cannot be ticked off
 * every day, so it links to the retest plan instead of joining the protocol.
 *
 * Phase 25a gave Discuss its own box so the reply stayed on screen. Phase 25b
 * takes the box away again and hands the words to the composer instead: one
 * place to ask or tell, with the same memory behind it, wherever you started.
 * "Not for me" says what it did, in the toast, with one tap to take it back.
 */
export function ActionButtons({
  reportId,
  actionIndex,
  kind,
  topic,
  about,
  already,
  adopt = true,
}: {
  reportId: string;
  actionIndex: number;
  kind: string;
  /**
   * This action is already on the protocol, and the day it started, when the
   * person said one. Phase 27 addendum item 3: "Add to protocol" on something
   * they told us they already do was the app forgetting the conversation.
   */
  already?: { startedAt: string | null };
  /** what this card is about, printed above the box as "About <it>" */
  topic?: string;
  /**
   * False when the card already carries a "What to do" block: that block owns
   * adding, per line and all at once, so a second "Add to protocol" here would
   * be two buttons for one job.
   */
  adopt?: boolean;
  /**
   * The condition id, when the card is one. Phase 26: Discuss used to prefill
   * "About Autoimmune thyroiditis (Hashimoto's): " into the text box, and the
   * fact reader offered to write that as a phenotype the person had claimed.
   * The subject travels as an id now, never as words in the box.
   */
  about?: string;
}) {
  const { run, busy, error } = useAction();
  const [state, setState] = useState<"open" | "adopted" | "dismissed">("open");
  /** the exit of `07-panel-reveal.md`, played before the row is gone */
  const [leaving, setLeaving] = useState(false);

  const dismiss = async () => {
    const res = await run("/api/plan/dismiss", { reportId, actionIndex });
    if (!res) return;
    setLeaving(true);
    toast("Hidden from your plan", {
      label: "undo",
      run: async () => {
        setLeaving(false);
        setState("open");
        await run("/api/plan/dismiss", { reportId, actionIndex, undo: true });
      },
    });
    window.setTimeout(
      () => setState((s) => (s === "open" ? "dismissed" : s)),
      EXIT_MS,
    );
  };

  if (state === "adopted")
    return (
      <span className="state on">
        <Check className="size-3" /> Adopted
      </span>
    );
  if (state === "dismissed") return null;

  const isTest = kind === "test" || kind === "doctor";

  return (
    <div
      className="t-panel-slide space-y-2"
      data-open={!leaving}
      style={{ "--panel-translate-y": "12px" } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center gap-2">
        {already ? (
          <span className="state on">
            <Check className="size-3" /> You&rsquo;re already doing this
            {already.startedAt ? (
              <span className="t-num text-[10px]"> since {already.startedAt}</span>
            ) : null}
          </span>
        ) : !adopt ? null : isTest ? (
          <Link href="/blood?tab=draws" className="b b-quiet b-sm">
            <Stethoscope className="size-3.5" /> Plan retest
          </Link>
        ) : (
          <Button
            size="sm"
            job="quiet"
            disabled={busy}
            onClick={async () => {
              if (await run("/api/plan/adopt", { reportId, actionIndex }))
                setState("adopted");
            }}
          >
            Add to protocol
          </Button>
        )}
        <Button size="sm" job="text" disabled={busy} onClick={dismiss}>
          Not for me
        </Button>
        <Button
          size="sm"
          job="text"
          onClick={() =>
            openComposer("", {
              ...(about ? { id: about } : {}),
              label: topic ?? "your plan",
              /**
               * Phase 27 addendum: an action travels as the report row it is,
               * so "i already do this" can adopt it instead of being sent to
               * the ontology lookup.
               */
              ...(topic
                ? {
                    action: {
                      title: topic,
                      reportId,
                      index: actionIndex,
                      kind,
                    },
                  }
                : {}),
            })
          }
        >
          <MessageSquare className="size-3.5" /> Discuss
        </Button>
        {error && (
          <span className="t-meta text-[length:var(--type-sm)] text-[var(--bad)]">
            {error}
          </span>
        )}
      </div>

    </div>
  );
}
