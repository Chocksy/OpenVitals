"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, RefreshCw, Search, Upload } from "lucide-react";
import { signIn, signUp } from "@/lib/auth-client";
import { statusColor, type Status } from "@/lib/status";
import type { BiomarkerRow } from "@/lib/data";
import { cn, fmtCategory } from "@/lib/utils";
import { Button, MiniSparkline } from "./ui-kit";

const INPUT =
  "w-full border border-neutral-200 bg-neutral-0 px-3 py-2 text-sm rounded-sm";

const sparkStroke: Record<Status, string> = {
  red: "var(--color-health-critical)",
  amber: "var(--color-health-warning)",
  green: "var(--color-health-normal)",
  gray: "var(--color-neutral-300)",
};

export function LoginForm({ google }: { google: boolean }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    const res =
      mode === "in"
        ? await signIn.email({ email, password })
        : await signUp.email({
            email,
            password,
            name: String(f.get("name") ?? email),
          });
    setBusy(false);
    if (res.error) setError(res.error.message ?? "Something went wrong");
    // Full navigation, so the app layout re-runs and the nav shows up.
    else window.location.href = "/";
  }

  return (
    <div className="mx-auto mt-16 max-w-sm space-y-4">
      <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
        {mode === "in" ? "Sign in" : "Create an account"}
      </h1>
      <form onSubmit={submit} className="space-y-3">
        {mode === "up" && (
          <input name="name" placeholder="Name" className={INPUT} />
        )}
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          className={INPUT}
        />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="Password"
          className={INPUT}
        />
        <Button className="w-full" disabled={busy}>
          {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
        </Button>
      </form>
      {google && (
        <Button
          variant="outline-subtle"
          className="w-full"
          onClick={() =>
            signIn.social({ provider: "google", callbackURL: "/" })
          }
        >
          Continue with Google
        </Button>
      )}
      {error && (
        <p className="text-sm text-[var(--color-health-critical)]">{error}</p>
      )}
      <button
        className="font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-500 hover:text-neutral-900"
        onClick={() => setMode(mode === "in" ? "up" : "in")}
      >
        {mode === "in"
          ? "Need an account? Sign up"
          : "Have an account? Sign in"}
      </button>
    </div>
  );
}

export function UploadButton() {
  const router = useRouter();
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setState(`Reading ${file.name}…`);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body });
    const json = await res.json();
    setBusy(false);
    setState(
      res.ok ? `Imported ${json.count} results` : `Failed: ${json.error}`,
    );
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <label className="card inline-flex cursor-pointer items-center gap-2 px-4 py-2.5 font-display text-[13px] font-medium transition-all hover:border-accent-200">
        <Upload className="size-4 text-neutral-500" />
        {busy ? "Working…" : "Upload Blood Work"}
        <input
          type="file"
          accept="application/pdf"
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {state && (
        <span className="font-mono text-[11px] text-neutral-500">{state}</span>
      )}
    </div>
  );
}

/** POSTs to an endpoint, then refreshes the server components. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (url: string, body: unknown, method = "POST") => {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok)
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
    else start(() => router.refresh());
  };
  return { run, busy: busy || pending, error };
}

export function GenerateButton({
  kind,
  label,
  variant = "default",
}: {
  kind: string;
  label: string;
  variant?: "default" | "ghost";
}) {
  const { run, busy, error } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant={variant}
        size={variant === "ghost" ? "sm" : "default"}
        disabled={busy}
        onClick={() => run("/api/insights", { kind })}
      >
        <RefreshCw className={busy ? "animate-spin" : ""} />
        {busy ? "Analysing your data…" : label}
      </Button>
      {error && (
        <span className="text-[12px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}

export function CheckinButtons({
  insightId,
  itemIndex,
  current,
}: {
  insightId: string;
  itemIndex: number;
  current?: string | null;
}) {
  const { run, busy } = useAction();
  return (
    <div className="mt-3 flex gap-2">
      {(["did", "didnt", "skip"] as const).map((a) => (
        <Button
          key={a}
          size="sm"
          variant={current === a ? "default" : "outline-subtle"}
          disabled={busy}
          onClick={() =>
            run("/api/checkins", { insightId, itemIndex, answer: a })
          }
        >
          {a === "did" ? "Did it" : a === "didnt" ? "Didn't" : "Skip"}
        </Button>
      ))}
    </div>
  );
}

const rowAction =
  "font-mono text-[11px] uppercase tracking-[0.04em] hover:underline disabled:opacity-40 disabled:no-underline";

export function DeleteUpload({ id, name }: { id: string; name?: string }) {
  const { run, busy } = useAction();
  return (
    <button
      className={`${rowAction} text-[var(--color-health-critical)]`}
      disabled={busy}
      onClick={() => {
        if (window.confirm(`Delete ${name ?? "this upload"} and its readings?`))
          void run(`/api/uploads/${id}`, null, "DELETE");
      }}
    >
      Delete
    </button>
  );
}

/** Re-runs extraction from the stored PDF, or from the text we kept. */
export function ReanalyzeUpload({
  id,
  disabled,
  title,
}: {
  id: string;
  disabled?: boolean;
  title?: string;
}) {
  const { run, busy, error } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={`${rowAction} text-neutral-600 hover:text-neutral-900`}
        disabled={busy || disabled}
        title={title}
        onClick={() => run(`/api/uploads/${id}/reanalyze`, {})}
      >
        {busy ? "Re-analyzing…" : "Re-analyze"}
      </button>
      {error && (
        <span className="font-mono text-[10px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}

export function BiomarkerList({ rows }: { rows: BiomarkerRow[] }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, BiomarkerRow[]>();
    for (const r of rows) {
      if (q && !r.name.toLowerCase().includes(q) && !r.code.includes(q))
        continue;
      map.set(r.category, [...(map.get(r.category) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows, query]);

  return (
    <div className="space-y-6">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search biomarkers"
          className={`${INPUT} pl-9`}
        />
      </div>

      {groups.length === 0 && (
        <p className="font-body text-[13px] text-neutral-500">
          Nothing matches “{query}”.
        </p>
      )}

      {groups.map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            {fmtCategory(category)}
          </h2>
          <div className="card divide-y divide-neutral-100">
            {items.map((m) => (
              <Link
                key={m.code}
                href={`/m/${m.code}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50"
              >
                <span
                  className={`size-[6px] shrink-0 rounded-full ${statusColor[m.status]}`}
                />
                <span className="flex-1 truncate font-body text-[13px]">
                  {m.name}
                  {m.derived && (
                    <span className="ml-1.5 font-mono text-[9px] uppercase text-neutral-400">
                      derived
                    </span>
                  )}
                </span>
                <MiniSparkline
                  data={m.spark}
                  color={sparkStroke[m.status]}
                  width={64}
                  height={20}
                />
                <span className="w-28 text-right font-mono text-[13px] font-semibold tabular-nums">
                  {m.value}
                  <span className="ml-1 text-[10px] font-normal text-neutral-400">
                    {m.unit ?? ""}
                  </span>
                </span>
                <span className="w-24 text-right font-mono text-[10px] tabular-nums text-neutral-400">
                  {m.observedAt}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * One curator question. The option that needs a number ("Multiply by …") opens
 * a small input; a question with no options at all is a free-text fact, so it
 * gets a text box and a Save button; everything else posts straight away.
 */
export function ReviewItem({
  id,
  question,
  options,
  detail,
  metrics = [],
}: {
  id: string;
  question: string;
  options: string[];
  detail?: string;
  /** Targets for "Move to metric…"; the note carries the code. */
  metrics?: { code: string; name: string }[];
}) {
  const { run, busy, error } = useAction();
  const [note, setNote] = useState("");
  const needsNote = (o: string) =>
    o.startsWith("Multiply") || o.startsWith("Move") || o.startsWith("Note");

  if (options.length === 0)
    return (
      <div className="card p-4">
        <p className="font-body text-[13px] text-neutral-800">{question}</p>
        {detail && (
          <p className="mt-1 font-mono text-[10px] text-neutral-400">
            {detail}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Your answer"
            className={`${INPUT} max-w-sm`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && note.trim())
                void run(`/api/review/${id}`, { answer: "text", note });
            }}
          />
          <Button
            size="sm"
            variant="outline-subtle"
            disabled={busy || !note.trim()}
            onClick={() => run(`/api/review/${id}`, { answer: "text", note })}
          >
            Save
          </Button>
          {error && (
            <span className="text-[12px] text-[var(--color-health-critical)]">
              {error}
            </span>
          )}
        </div>
      </div>
    );

  return (
    <div className="card p-4">
      <p className="font-body text-[13px] text-neutral-800">{question}</p>
      {detail && (
        <p className="mt-1 font-mono text-[10px] text-neutral-400">{detail}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {options.map((o) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            {needsNote(o) &&
              (o.startsWith("Move") ? (
                <>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="metric code"
                    list={`metrics-${id}`}
                    className="w-44 border border-neutral-200 bg-neutral-0 px-2 py-1 font-mono text-[12px]"
                  />
                  <datalist id={`metrics-${id}`}>
                    {metrics.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </datalist>
                </>
              ) : (
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={o.startsWith("Note") ? "your answer" : "factor"}
                  inputMode={o.startsWith("Note") ? "text" : "decimal"}
                  className={cn(
                    "border border-neutral-200 bg-neutral-0 px-2 py-1 font-mono text-[12px]",
                    o.startsWith("Note") ? "w-56" : "w-20",
                  )}
                />
              ))}
            <Button
              size="sm"
              variant="outline-subtle"
              disabled={busy || (needsNote(o) && !note.trim())}
              onClick={() => run(`/api/review/${id}`, { answer: o, note })}
            >
              {o}
            </Button>
          </span>
        ))}
        {error && (
          <span className="text-[12px] text-[var(--color-health-critical)]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

export function RunCurator() {
  const { run, busy, error } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        disabled={busy}
        onClick={() => run("/api/admin/curate", {})}
      >
        <Play className={busy ? "animate-pulse" : ""} />
        {busy ? "Curating…" : "Run curator now"}
      </Button>
      {error && (
        <span className="text-[12px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}
