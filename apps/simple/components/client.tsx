"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Mail, Play, RefreshCw, Search, Upload } from "lucide-react";
import { signIn, signUp } from "@/lib/auth-client";
import { statusColor, type Status } from "@/lib/status";
import { cn, fmtCategory } from "@/lib/utils";
import { Button, MiniSparkline, SuccessCheck } from "./ui-kit";
import { FactEditButtons, type FactEdit } from "./fact-edit";

/** The system's own text field (`docs/mockups/v4/system.css` section 05). */
const INPUT = "inp w-full";

const sparkStroke: Record<Status, string> = {
  red: "var(--bad)",
  amber: "var(--warn)",
  green: "var(--ok)",
  gray: "var(--none)",
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
      <label className="b b-quiet b-sm cursor-pointer">
        <Upload className="ic" aria-hidden="true" />
        {busy ? "Working…" : "Add a file"}
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

const rowAction =
  "t-meta text-[length:var(--type-xs)] hover:underline disabled:opacity-40 disabled:no-underline";

export function DeleteUpload({ id, name }: { id: string; name?: string }) {
  const { run, busy } = useAction();
  return (
    <button
      className="b b-text b-sm text-[var(--bad)]"
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
        className="b b-quiet b-sm"
        disabled={busy || disabled}
        title={title}
        onClick={() => run(`/api/uploads/${id}/reanalyze`, {})}
      >
        <RefreshCw className={busy ? "ic animate-spin" : "ic"} />
        {busy ? "Reanalyzing…" : "Reanalyze"}
      </button>
      {error && (
        <span className="t-meta text-[12px] text-[var(--bad)]">
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
        id="kind"
        value={want}
        onChange={(e) => setWant(e.target.value)}
        className="sel"
      >
        {["lab", "genome", "document"].map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <button
        className="b b-quiet b-sm"
        disabled={busy || want === kind}
        onClick={() => run(`/api/uploads/${id}/reanalyze`, { kind: want })}
      >
        {busy ? "Re-reading…" : "Re-read as this"}
      </button>
      {error && (
        <span className="t-meta text-[12px] text-[var(--bad)]">
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
/**
 * One question from the review queue, on the design system's own inputs.
 *
 * Phase 30d: the queue folded into Plan's "Answer these", so the row is no
 * longer a card of its own — it sits in a `.rowlist` inside the panel, the
 * options are `.optchip`s and the free-text answer is the `.inp`.
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

  const head = (
    <>
      <b className="t-body text-[length:var(--type-md)] font-normal">
        {question}
      </b>
      {detail && (
        <div className="t-meta text-[length:var(--type-sm)]">{detail}</div>
      )}
    </>
  );

  if (options.length === 0)
    return (
      <div className="grid gap-2">
        {head}
        <div className="rowh" style={{ gap: "var(--s8)" }}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Your answer"
            className="inp mini max-w-sm"
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
            <span className="t-meta text-[length:var(--type-sm)] text-[var(--bad)]">
              {error}
            </span>
          )}
        </div>
      </div>
    );

  return (
    <div className="grid gap-2">
      {head}
      <div className="rowh" style={{ gap: "var(--s8)" }}>
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
                    className="inp mini t-num w-44"
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
                    "inp mini",
                    o.startsWith("Note") ? "w-56" : "t-num w-20",
                  )}
                />
              ))}
            <button
              type="button"
              className="optchip"
              data-busy={busy ? "true" : undefined}
              disabled={busy || (needsNote(o) && !note.trim())}
              onClick={() => run(`/api/review/${id}`, { answer: o, note })}
            >
              {o}
            </button>
          </span>
        ))}
        {error && (
          <span className="t-meta text-[length:var(--type-sm)] text-[var(--bad)]">
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
        <span className="text-[12px] text-[var(--bad)]">
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
          <span className="text-[12px] text-[var(--bad)]">
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
    <div className="flex flex-col gap-1.5 border-l-2 border-[var(--hair)] pl-3">
      <p className="t-body text-[var(--ink)]" title={original}>
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
            <span className="t-meta text-[12px] text-[var(--bad)]">
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
              className="inp mini"
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
                className="inp mini w-28"
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
            className={`${rowAction} text-[var(--ink-3)] hover:text-[var(--ink)]`}
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
/**
 * The doctor's note, as one button.
 *
 * Phase 30d, UX note 9. A conclusion card ended with seven controls; the
 * catalog's management text is the one a person actually takes out of the
 * app, so it moved inside the why disclosure and became a copy.
 */
export function CopyNote({
  text,
  label = "Copy for your doctor",
}: {
  text: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      job="quiet"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 2000);
      }}
    >
      <Copy className="size-3.5" />
      {done ? "Copied" : label}
    </Button>
  );
}

export function WrongValue({ readingId }: { readingId: string }) {
  const { run, busy, error } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={`${rowAction} text-[var(--ink-3)] hover:text-[var(--ink)]`}
        disabled={busy}
        onClick={() => run("/api/not-right", { readingId })}
      >
        {busy ? "Asking…" : "Wrong value"}
      </button>
      {error && (
        <span className="t-meta text-[12px] text-[var(--bad)]">
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
        <span className="font-body text-[12px] text-[var(--ink-2)]">{label}</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="inp mini w-44"
        />
        <button
          className={`${rowAction} text-[var(--ink-3)] hover:text-[var(--ink)]`}
          disabled={busy || !text.trim() || text === value}
          onClick={() =>
            run("/api/facts", { key: factKey, value: text, ...(edit ?? {}) })
          }
        >
          Save
        </button>
        {error && (
          <span className="t-meta text-[12px] text-[var(--bad)]">
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
