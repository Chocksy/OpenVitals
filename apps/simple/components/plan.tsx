"use client";

/**
 * The three interactive bits of /plan: the Simple/Deep switch that owns the
 * page root, the Generate button, and the two buttons on every action card.
 * Everything else on the page is server-rendered.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, MessageSquare, RefreshCw, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
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
          <div className="flex items-center gap-0.5 rounded border bg-neutral-100 p-0.5">
            {(["simple", "deep"] as const).map((v) => (
              <button
                key={v}
                onClick={() => pick(v)}
                className={cn(
                  "h-[30px] px-3 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
                  view === v
                    ? "bg-accent-50 text-accent-500"
                    : "text-neutral-500 hover:text-neutral-900",
                )}
              >
                {v}
              </button>
            ))}
          </div>
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

const MAX_MESSAGE = 1000;

/**
 * Three buttons and no more. A test or a doctor action cannot be ticked off
 * every day, so it links to the retest plan instead of joining the protocol.
 * Discuss opens one box; the reply is written onto the report, so the page
 * refresh below renders it as part of the card's thread.
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
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");

  if (state === "adopted")
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.04em] text-[var(--color-health-normal)]">
        <Check className="size-3" /> Adopted
      </span>
    );
  if (state === "dismissed")
    return (
      <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
        Not for me
      </span>
    );

  const isTest = kind === "test" || kind === "doctor";

  return (
    <div className="space-y-2">
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
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            if (await run("/api/plan/dismiss", { reportId, actionIndex }))
              setState("dismissed");
          }}
        >
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
            onClick={async () => {
              const res = await run("/api/plan/discuss", {
                reportId,
                actionIndex,
                message: message.slice(0, MAX_MESSAGE),
              });
              if (res) {
                setMessage("");
                setAsking(false);
              }
            }}
          >
            {busy ? "Asking…" : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
}
