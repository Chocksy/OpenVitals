"use client";

/**
 * The three interactive bits of /plan: the Simple/Deep switch that owns the
 * page root, the Generate button, and the two buttons on every action card.
 * Everything else on the page is server-rendered.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PillTabs } from "./pill-tabs";
import { Check, MessageSquare, RefreshCw, Stethoscope } from "lucide-react";
import { toast } from "./motion";
import { Button } from "./ui-kit";

const STORAGE_KEY = "planView";

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
 * The page root for every page with two audiences. `data-view` drives one CSS
 * rule in globals.css, so every deep detail is just a `.deep` class on the
 * server-rendered markup. /plan, /graph and /patterns/[id] share the switch
 * and the localStorage key, so the choice follows the reader around.
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
  const [view, setView] = useState<"simple" | "deep">("simple");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "deep") setView("deep");
  }, []);

  const pick = (next: "simple" | "deep") => {
    setView(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <div data-view={view} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 font-body text-[13px] text-neutral-500">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <PillTabs
            label="Detail"
            active={view}
            tabs={[
              { id: "simple", label: "simple" },
              { id: "deep", label: "deep" },
            ]}
            onSelect={(v) => pick(v as "simple" | "deep")}
          />
        </div>
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
        <span className="text-[12px] text-[var(--color-health-critical)]">
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
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--color-health-normal)]">
        <Check className="size-3" /> Adopted
      </span>
    );

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="outline-subtle"
        disabled={busy}
        onClick={async () => {
          if (await run("/api/plan/adopt", { interventionId })) setState(true);
        }}
      >
        {busy ? "Adopting…" : "Adopt and measure"}
      </Button>
      {error && (
        <span className="text-[12px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}

const MAX_MESSAGE = 1000;

/** `--panel-close-dur`: how long the exit is given before the row is gone. */
const EXIT_MS = 350;

const rowAction =
  "font-mono text-[11px] uppercase tracking-[0.04em] hover:underline disabled:opacity-40 disabled:no-underline";

/**
 * Three buttons and no more. A test or a doctor action cannot be ticked off
 * every day, so it links to the retest plan instead of joining the protocol.
 *
 * Phase 25a. Discuss keeps its reply on screen: the answer used to be written
 * onto the report and the box closed, so on Home — which never renders the
 * report's notes — the person watched "Asking…" and then nothing. "Not for me"
 * says what it did, in the toast, with one tap to take it back.
 */
export function ActionButtons({
  reportId,
  actionIndex,
  kind,
}: {
  reportId: string;
  actionIndex: number;
  kind: string;
}) {
  const { run, busy, error } = useAction();
  const [state, setState] = useState<"open" | "adopted" | "dismissed">("open");
  /** the exit of `07-panel-reveal.md`, played before the row is gone */
  const [leaving, setLeaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<{ q: string; a: string } | null>(null);

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

  const send = async () => {
    const text = message.slice(0, MAX_MESSAGE);
    const res = await run("/api/plan/discuss", {
      reportId,
      actionIndex,
      message: text,
    });
    if (!res) return;
    setReply({ q: text, a: String(res.reply ?? "") });
    setMessage("");
    setAsking(false);
  };

  if (state === "adopted")
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--color-health-normal)]">
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
        {isTest ? (
          <Link
            href="/insights"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-neutral-200 bg-neutral-0 px-3 font-display text-[12px] tracking-[0.04em] text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50"
          >
            <Stethoscope className="size-3.5" /> Plan retest
          </Link>
        ) : (
          <Button
            size="sm"
            variant="outline-subtle"
            disabled={busy}
            onClick={async () => {
              if (await run("/api/plan/adopt", { reportId, actionIndex }))
                setState("adopted");
            }}
          >
            Add to protocol
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={dismiss}>
          Not for me
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setAsking((v) => !v)}
        >
          <MessageSquare className="size-3.5" /> Discuss
        </Button>
        {error && (
          <span className="text-[12px] text-[var(--color-health-critical)]">
            {error}
          </span>
        )}
      </div>

      {asking && (
        <div className="space-y-2">
          <textarea
            value={message}
            maxLength={MAX_MESSAGE}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add context, question this, or ask for more"
            className="w-full resize-y rounded-sm border border-neutral-200 bg-neutral-0 px-3 py-2 font-body text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none"
          />
          <Button
            size="sm"
            variant="outline-subtle"
            disabled={busy || !message.trim()}
            onClick={send}
          >
            {busy ? "Asking…" : "Send"}
          </Button>
        </div>
      )}

      {reply && (
        <div className="space-y-1 border-l-2 border-accent-500 bg-accent-50 px-3 py-2">
          <p className="font-body text-[12px] text-neutral-500">{reply.q}</p>
          <p className="font-body text-[13px] leading-relaxed text-neutral-800">
            {reply.a}
          </p>
          <button
            className={`${rowAction} text-neutral-500 hover:text-neutral-900`}
            onClick={() => setReply(null)}
          >
            close
          </button>
        </div>
      )}
    </div>
  );
}
