"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Play, RefreshCw, Search, Upload } from "lucide-react";
import { signIn, signUp } from "@/lib/auth-client";
import { statusColor, type Status } from "@/lib/status";
import { cn, fmtCategory } from "@/lib/utils";
import { Button, MiniSparkline, SuccessCheck } from "./ui-kit";
import { FactEditButtons, type FactEdit } from "./fact-edit";

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
    if (res.error)
      setError(
        res.error.message ??
          "That email and password do not match an account. Try again, or make one.",
      );
    // Full navigation, so the app layout re-runs and the nav shows up.
    else window.location.href = "/";
  }

  return (
    <main className="lit login-page">
      <div className="light-layer" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="logincard">
        <div className="loginhead">
          <span className="brand">OpenVitals</span>
          <p className="t-meta">
            {mode === "in"
              ? "Welcome back."
              : "Your labs, your phone, one ledger."}
          </p>
        </div>
        <div className="flex flex-col gap-[var(--s13)]">
          {google && (
            <Button
              job="quiet"
              type="button"
              className="w-full"
              onClick={() =>
                signIn.social({ provider: "google", callbackURL: "/" })
              }
            >
              <Mail className="ic" />
              Continue with Google
            </Button>
          )}
          {google && <p className="t-meta text-center">or</p>}
          <form onSubmit={submit} className="flex flex-col gap-[var(--s13)]">
            {mode === "up" && (
              <div className="field">
                <label htmlFor="login-name">Name</label>
                <input className="inp" id="login-name" name="name" />
              </div>
            )}
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                className="inp"
                id="login-email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">Password</label>
              <input
                className="inp"
                id="login-password"
                name="password"
                type="password"
                required
                minLength={8}
              />
            </div>
            {error && <p className="err">{error}</p>}
            <Button className="w-full" busy={busy} disabled={busy}>
              {busy
                ? "One moment…"
                : mode === "in"
                  ? "Sign in"
                  : "Create the account"}
            </Button>
          </form>
          <p className="t-meta text-center">
            {mode === "in" ? "No account yet? " : "Already have an account? "}
            <button
              type="button"
              className="text-[var(--ink)] underline underline-offset-[3px]"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
            >
              {mode === "in" ? "Make one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </main>
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
      res.ok
        ? `Imported as ${json.kind}: ${json.note ?? `${json.count} results`}`
        : `Failed: ${json.error}`,
    );
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <label className="card inline-flex cursor-pointer items-center gap-2 px-4 py-2.5 font-display text-[13px] font-medium transition-[border-color,scale] duration-150 ease-out hover:border-accent-200 active:scale-[0.96]">
        <Upload className="size-4 text-neutral-500" />
        {busy ? "Working…" : "Upload a file"}
        <input
          type="file"
          accept=".pdf,.txt,.csv,.tsv,.docx,.jpg,.jpeg,.png"
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {state && <span className="t-meta text-[12px]">{state}</span>}
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
  job = "ink",
}: {
  kind: string;
  label: string;
  job?: "ink" | "text";
}) {
  const { run, busy, error } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        job={job}
        size={job === "text" ? "sm" : "md"}
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
          job={current === a ? "ink" : "quiet"}
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

/** A row's small verbs. Sans: "Wrong value" is a phrase, not a code. */
const rowAction =
  "t-meta text-[12px] hover:underline disabled:opacity-40 disabled:no-underline";

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
        <span className="t-meta text-[12px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}

/** Re-read this file as another kind: a lab sheet, a genome file, a document. */
export function ChangeKind({ id, kind }: { id: string; kind: string }) {
  const { run, busy, error } = useAction();
  const [want, setWant] = useState(kind);
  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={want}
        onChange={(e) => setWant(e.target.value)}
        className="border border-neutral-200 bg-neutral-0 px-2 py-1 font-mono text-[11px]"
      >
        {["lab", "genome", "document"].map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <button
        className={`${rowAction} text-neutral-600 hover:text-neutral-900`}
        disabled={busy || want === kind}
        onClick={() => run(`/api/uploads/${id}/reanalyze`, { kind: want })}
      >
        {busy ? "Re-reading…" : "Re-read as this"}
      </button>
      {error && (
        <span className="t-meta text-[12px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
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
        <p className="t-body text-neutral-800">{question}</p>
        {detail && <p className="t-meta mt-1 text-[12px]">{detail}</p>}
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
            job="quiet"
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
      <p className="t-body text-neutral-800">{question}</p>
      {detail && <p className="t-meta mt-1 text-[12px]">{detail}</p>}
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
              job="quiet"
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

/* ── the three writers Home needs ─────────────────────────────────────── */

/**
 * The inline question on a ledger card. Options when we have them, else a box.
 * Once it carries an answer it also carries the two edits: This changed and
 * I was wrong.
 */
export function AnswerQuestion({
  factKey,
  options,
  current,
  today,
  onSaved,
}: {
  factKey: string;
  options: string[];
  /** The answer already on file, when there is one. */
  current?: string;
  today?: string;
  /**
   * Phase 24d. When Today hands this in, the answer does **not** reload the
   * page: the fact is posted, the button wears its success check, and the
   * caller re-reads the ledger and animates the difference. Without it the
   * old `router.refresh()` path stays, for any surface that wants a reload.
   */
  onSaved?: (value: string) => void | Promise<void>;
}) {
  const { run, busy, error } = useAction();
  const [text, setText] = useState("");
  const [edit, setEdit] = useState<FactEdit | null>(null);
  const [live, setLive] = useState<{
    busy: boolean;
    done: boolean;
    error: string;
  }>({ busy: false, done: false, error: "" });

  const save = async (value: string) => {
    if (!onSaved) {
      void run("/api/facts", { key: factKey, value, ...(edit ?? {}) });
      return;
    }
    setLive({ busy: true, done: false, error: "" });
    const res = await fetch("/api/facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: factKey, value, ...(edit ?? {}) }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setLive({ busy: false, done: false, error: body.error ?? "Failed" });
      return;
    }
    setLive({ busy: false, done: true, error: "" });
    await onSaved(value);
  };

  const working = busy || live.busy;
  const message = error || live.error;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {options.length > 0 ? (
          options.map((o) => (
            <Button
              key={o}
              size="sm"
              job="quiet"
              disabled={working}
              onClick={() => void save(o)}
            >
              {o}
              {live.done && <SuccessCheck shown />}
            </Button>
          ))
        ) : (
          <>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Your answer"
              className={`${INPUT} max-w-[200px]`}
            />
            <Button
              size="sm"
              job="quiet"
              disabled={working || !text.trim()}
              onClick={() => void save(text)}
            >
              Save
              {live.done && <SuccessCheck shown />}
            </Button>
          </>
        )}
        {message && (
          <span className="text-[12px] text-[var(--color-health-critical)]">
            {message}
          </span>
        )}
      </div>
      {current && (
        <FactEditButtons
          edit={edit}
          onChange={setEdit}
          today={today ?? new Date().toISOString().slice(0, 10)}
        />
      )}
    </div>
  );
}

/**
 * One "still true?" line: the question derived from the value, then three
 * chips.
 *
 * Phase 20, and the difference between the three is the whole point.
 * **Confirm** says the value did not change, so no history row is written and
 * only the next-ask date moves. **Changed** is a new value from a date, which
 * is `/api/facts` and a real row. **Not now** is a month of silence.
 */
export function StillTrue({
  factKey,
  question,
  original,
  options,
  current,
  today,
}: {
  factKey: string;
  question: string;
  original: string;
  options: string[];
  current: string;
  today: string;
}) {
  const { run, busy, error } = useAction();
  const [changing, setChanging] = useState(false);
  const [date, setDate] = useState(today);
  const [text, setText] = useState(current);
  const save = (value: string) =>
    run("/api/facts", { key: factKey, value, kind: "changed", date });

  /**
   * The answer on file, said out loud. A list answer is already inside the
   * question ("Still: Non-alcoholic fatty liver disease?"), so it is not
   * repeated; a key is never printed at all.
   */
  const held = question.includes(current) ? null : current;
  /**
   * Phase 25b: three words a person uses, and the same three every time.
   * "Still non-alcoholic fatty liver disease" was never a sentence, and a
   * label that changes shape per fact is a label you have to read twice.
   */

  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-neutral-200 pl-3">
      <p className="t-body text-neutral-800" title={original}>
        {question}
        {held && (
          <span className="t-meta ml-1.5 text-[12px]">· you said {held}</span>
        )}
      </p>
      {!changing ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            job="quiet"
            disabled={busy}
            onClick={() =>
              run("/api/facts/revisit", { key: factKey, action: "confirm" })
            }
          >
            Still yes
          </Button>
          <Button
            size="sm"
            job="text"
            disabled={busy}
            onClick={() => setChanging(true)}
          >
            It changed
          </Button>
          <Button
            size="sm"
            job="text"
            disabled={busy}
            onClick={() =>
              run("/api/facts/revisit", { key: factKey, action: "skip" })
            }
          >
            Skip
          </Button>
          {error && (
            <span className="t-meta text-[12px] text-[var(--color-health-critical)]">
              {error}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="t-meta flex items-center gap-1 text-[12px]">
            Since when?
            <input
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-neutral-300 bg-neutral-0 px-1 py-0.5 font-mono text-[11px]"
            />
          </label>
          {options.length > 0 ? (
            options.map((o) => (
              <Button
                key={o}
                size="sm"
                job="quiet"
                disabled={busy}
                onClick={() => save(o)}
              >
                {o}
              </Button>
            ))
          ) : (
            <>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-28 border border-neutral-300 bg-neutral-0 px-2 py-1 font-mono text-[11px]"
              />
              <Button
                size="sm"
                job="quiet"
                disabled={busy || !text.trim()}
                onClick={() => save(text)}
              >
                Save
              </Button>
            </>
          )}
          <button
            className={`${rowAction} text-neutral-500 hover:text-neutral-900`}
            onClick={() => setChanging(false)}
          >
            cancel
          </button>
        </div>
      )}
    </div>
  );
}

/** "Wrong value": queues the curator's own confirm_value question. */
export function WrongValue({ readingId }: { readingId: string }) {
  const { run, busy, error } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={`${rowAction} text-neutral-500 hover:text-neutral-900`}
        disabled={busy}
        onClick={() => run("/api/not-right", { readingId })}
      >
        {busy ? "Asking…" : "Wrong value"}
      </button>
      {error && (
        <span className="t-meta text-[12px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * One profile fact a card read, editable in place. Saving says which kind of
 * edit it is: a new value from a date, or a correction of one that never held.
 */
export function EditFact({
  factKey,
  label,
  value,
  today,
}: {
  factKey: string;
  label: string;
  value: string;
  today?: string;
}) {
  const { run, busy, error } = useAction();
  const [text, setText] = useState(value);
  const [edit, setEdit] = useState<FactEdit | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-body text-[12px] text-neutral-700">{label}</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-44 border border-neutral-200 bg-neutral-0 px-2 py-1 font-mono text-[11px]"
        />
        <button
          className={`${rowAction} text-neutral-500 hover:text-neutral-900`}
          disabled={busy || !text.trim() || text === value}
          onClick={() =>
            run("/api/facts", { key: factKey, value: text, ...(edit ?? {}) })
          }
        >
          Save
        </button>
        {error && (
          <span className="t-meta text-[12px] text-[var(--color-health-critical)]">
            {error}
          </span>
        )}
      </div>
      <FactEditButtons
        edit={edit}
        onChange={setEdit}
        today={today ?? new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
