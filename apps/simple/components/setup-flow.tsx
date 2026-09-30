"use client";

/**
 * Phase 43B: the web setup flow. One screen at a time, drawn from the JSON
 * `/api/setup` returns (`SetupBody` in lib/setup-server.ts); the server
 * decides the order, this only draws it and posts each answer. iOS draws the
 * same JSON in `SetupView`. Spec: docs/plans/2026-09-29-phase43-setup-spec.md.
 *
 * Every number on a screen is engine output: the picture bars, the "moves"
 * line under an option and the reveal. Nothing here computes a percent
 * beyond rounding and the difference between two responses.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  PictureRow,
  SetupBody,
  SetupPost,
  SetupScreen,
  Treatment,
} from "@/lib/setup-server";
import { countryName } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { OurRead } from "./hunch-board";
import { Button } from "./ui-kit";

/** Whole percent, the way a bar prints it: 0.314 is "31%". */
export const barLabel = (p: number): string => `${Math.round(p * 100)}%`;

/** "+19", or "−7" with a real minus sign. */
export const deltaText = (n: number): string =>
  n > 0 ? `+${n}` : `−${Math.abs(n)}`;

/**
 * How far each row on the new picture moved since the last response, in
 * whole percent. A row that was not there has no delta: the first picture
 * after basics would print "+47" for a population prior nobody moved. Only
 * moves of two points or more are kept, so rounding noise never prints as news.
 */
export function deltaOf(
  prev: PictureRow[],
  next: PictureRow[],
): Map<string, number> {
  const was = new Map(prev.map((r) => [r.id, r.p]));
  const out = new Map<string, number>();
  for (const r of next) {
    const from = was.get(r.id);
    if (from == null) continue;
    const d = Math.round(r.p * 100) - Math.round(from * 100);
    if (Math.abs(d) >= 2) out.set(r.id, d);
  }
  return out;
}

type Reveal = Extract<SetupScreen, { kind: "reveal" }>;

/** Screens a person may pass without an answer (spec 43B item 2). */
const SKIPPABLE = new Set(["upload", "body", "question", "treatments", "data"]);
/** Screens that sit under the picture; earlier ones have none yet. */
const WITH_PICTURE = new Set(["body", "question", "treatments", "data"]);

const WHAT = [
  "Iron",
  "Vitamin D",
  "B12",
  "Thyroid hormone",
  "Statin",
  "Metformin",
  "Other",
];
const ROUTES: { id: Treatment["route"]; label: string }[] = [
  { id: "oral", label: "Oral" },
  { id: "iv", label: "IV" },
  { id: "injection", label: "Injection" },
];

/** What one upload came back with: the error to show, or null when read. */
async function sendFile(file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (res.ok) return null;
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return j?.error ?? "The report could not be read.";
  } catch {
    return "The report did not upload. Check the connection.";
  }
}

export function SetupFlow({
  initial,
}: {
  /** `uploadError` is for the render test; in the app it is client state */
  initial: SetupBody & { uploadError?: string };
}) {
  const router = useRouter();
  const [body, setBody] = useState<SetupBody>(initial);
  const [prev, setPrev] = useState<PictureRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState(initial.uploadError ?? "");
  const [reading, setReading] = useState(false);
  /** uploads started on the upload or data screen; the reveal waits for them */
  const pending = useRef<Promise<string | null>[]>([]);

  const show = (next: SetupBody) => {
    setPrev(body.picture);
    setBody(next);
  };

  const post = async (payload: SetupPost): Promise<SetupBody | null> => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => null)) as
        | (SetupBody & { error?: string })
        | null;
      if (!res.ok || !j || j.error) {
        setError(j?.error ? `Not saved: ${j.error}.` : "Not saved. Try again.");
        return null;
      }
      return j;
    } catch {
      setError("Not saved. Check the connection.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const go = async (payload: SetupPost) => {
    const next = await post(payload);
    if (next) show(next);
  };

  const upload = (file: File | undefined) => {
    if (file) pending.current.push(sendFile(file));
  };

  /* 43B item 5: the reveal waits for the report, then draws again. */
  const kind = body.screen.kind;
  useEffect(() => {
    if (kind !== "reveal" || pending.current.length === 0) return;
    const waiting = pending.current;
    pending.current = [];
    setReading(true);
    void (async () => {
      const errors = (await Promise.all(waiting)).filter(
        (e): e is string => e != null,
      );
      if (errors.length) setUploadError(errors[0]!);
      try {
        const res = await fetch("/api/setup");
        if (res.ok) show((await res.json()) as SetupBody);
      } finally {
        setReading(false);
      }
    })();
    // `show` reads the current body; running once per reveal is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const finish = async () => {
    const next = await post({ screen: "reveal" });
    if (next) router.push("/");
  };

  const s = body.screen;
  const skip = () =>
    s.kind === "question"
      ? go({ screen: "question", key: s.key, skip: true })
      : go({ screen: s.kind, skip: true } as SetupPost);

  return (
    <div className="setup">
      <header className="setup-top">
        <div
          className="setup-progress"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuenow={body.progress.at}
          aria-valuemin={0}
          aria-valuemax={body.progress.of}
        >
          <i
            style={{
              width: `${(100 * body.progress.at) / Math.max(1, body.progress.of)}%`,
            }}
          />
        </div>
        {body.screen.kind !== "reveal" && (
          <Link className="setup-later" href="/?home=1">
            Finish later
          </Link>
        )}
      </header>

      <section className="setup-screen" aria-live="polite">
        {s.kind === "intro" && <Intro s={s} busy={busy} go={go} />}
        {s.kind === "upload" && (
          <UploadScreen
            busy={busy}
            onFile={(f) => {
              upload(f);
              void go({ screen: "upload", skip: true });
            }}
          />
        )}
        {s.kind === "basics" && <Basics s={s} busy={busy} go={go} />}
        {s.kind === "body" && <BodyScreen s={s} busy={busy} go={go} />}
        {s.kind === "question" && (
          <>
            <h1>{s.question}</h1>
            <div className="setup-options">
              {s.options.map((o) => (
                <div key={o.label}>
                  <Button
                    job="quiet"
                    className="setup-option"
                    disabled={busy}
                    onClick={() =>
                      void go({
                        screen: "question",
                        key: s.key,
                        value: o.label,
                      })
                    }
                  >
                    {o.label}
                  </Button>
                  {o.moves && (
                    <p className="setup-moves">
                      {o.label} moves {o.moves.name} {o.moves.from} →{" "}
                      {o.moves.to}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {s.kind === "treatments" && <Treatments s={s} busy={busy} go={go} />}
        {s.kind === "data" && (
          <DataScreen s={s} busy={busy} go={go} onFile={upload} />
        )}
        {s.kind === "reveal" && (
          <RevealScreen
            s={s}
            busy={busy}
            reading={reading}
            uploadError={uploadError}
            onDone={() => void finish()}
          />
        )}

        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}

        {SKIPPABLE.has(s.kind) && (
          <Button
            job="text"
            className="setup-skip"
            disabled={busy}
            onClick={() => void skip()}
          >
            Skip
          </Button>
        )}
      </section>

      {WITH_PICTURE.has(s.kind) && <Picture rows={body.picture} prev={prev} />}
    </div>
  );
}

/* ── the picture ─────────────────────────────────────────────────────── */

/**
 * One bar. It first draws at the width the last response had, then moves to
 * the new one, so the CSS transition shows the answer landing.
 */
function Bar({ p, from }: { p: number; from: number }) {
  const [w, setW] = useState(from);
  useEffect(() => {
    const r = requestAnimationFrame(() => setW(p));
    return () => cancelAnimationFrame(r);
  }, [p]);
  return (
    <div className="setup-trk">
      <i style={{ width: barLabel(w), transition: "width 600ms ease" }} />
    </div>
  );
}

function Picture({
  rows,
  prev,
}: {
  rows: PictureRow[];
  /** the picture before the last answer; null on the first screen shown */
  prev: PictureRow[] | null;
}) {
  const moved = prev ? deltaOf(prev, rows) : new Map<string, number>();
  const was = new Map((prev ?? []).map((r) => [r.id, r.p]));
  return (
    <section className="setup-picture" aria-label="Your picture so far">
      <h2>Your picture so far</h2>
      {rows.length > 0 && (
        <p>These start as the odds for your sex and age. Each answer moves them.</p>
      )}
      {rows.length === 0 ? (
        <p>Nothing stands out yet.</p>
      ) : (
        <ol>
          {rows.map((r) => {
            const d = moved.get(r.id);
            return (
              <li key={r.id}>
                <div className="rh">
                  <b>{r.name}</b>
                  <span className="p">
                    {barLabel(r.p)}
                    {d != null && (
                      <em className={d > 0 ? "up" : "down"}> {deltaText(d)}</em>
                    )}
                  </span>
                </div>
                <Bar p={r.p} from={prev ? (was.get(r.id) ?? 0) : r.p} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ── the screens ─────────────────────────────────────────────────────── */

type Go = (payload: SetupPost) => Promise<void>;

function Intro({
  s,
  busy,
  go,
}: {
  s: Extract<SetupScreen, { kind: "intro" }>;
  busy: boolean;
  go: Go;
}) {
  const [goal, setGoal] = useState("");
  return (
    <>
      <h1>What brings you here?</h1>
      <div className="setup-options">
        {s.goals.map((g) => (
          <Button
            key={g}
            job={goal === g ? "ink" : "quiet"}
            className="setup-option"
            aria-pressed={goal === g}
            onClick={() => setGoal(g)}
          >
            {g}
          </Button>
        ))}
      </div>
      <h2 className="setup-sub">Do you have a lab report with you?</h2>
      <p className="setup-hint">A PDF or a photo of one.</p>
      <div className="setup-row">
        {[
          { label: "Yes", has: true },
          { label: "No", has: false },
        ].map((o) => (
          <Button
            key={o.label}
            job="quiet"
            className="setup-option"
            disabled={busy || !goal}
            onClick={() => void go({ screen: "intro", goal, hasReport: o.has })}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </>
  );
}

function FilePick({
  label,
  accept,
  disabled,
  onFile,
}: {
  label: string;
  accept: string;
  disabled?: boolean;
  onFile: (f: File | undefined) => void;
}) {
  return (
    <label className={cn("b b-quiet setup-option setup-file")}>
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </label>
  );
}

const LAB_FILES = "application/pdf,image/*";

function UploadScreen({
  busy,
  onFile,
}: {
  busy: boolean;
  onFile: (f: File | undefined) => void;
}) {
  return (
    <>
      <h1>Add your lab report</h1>
      <p className="setup-hint">
        A PDF or a photo. It reads in the background while you go on.
      </p>
      <FilePick
        label="Choose a file"
        accept={LAB_FILES}
        disabled={busy}
        onFile={onFile}
      />
    </>
  );
}

function Basics({
  s,
  busy,
  go,
}: {
  s: Extract<SetupScreen, { kind: "basics" }>;
  busy: boolean;
  go: Go;
}) {
  const [sex, setSex] = useState(s.sex ?? "");
  const [year, setYear] = useState(s.birthYear ?? "");
  const [country, setCountry] = useState(
    s.country && /^[A-Z]{2}$/.test(s.country)
      ? countryName(s.country)
      : (s.country ?? ""),
  );
  const ready = sex && year.trim() && country.trim();
  return (
    <>
      <h1>A few basics</h1>
      <p className="setup-hint">Lab ranges depend on these.</p>
      <h2 className="setup-sub">What is your biological sex?</h2>
      <div className="setup-row">
        {["Female", "Male"].map((x) => (
          <Button
            key={x}
            job={sex === x ? "ink" : "quiet"}
            className="setup-option"
            aria-pressed={sex === x}
            onClick={() => setSex(x)}
          >
            {x}
          </Button>
        ))}
      </div>
      <label className="setup-field">
        <span>Which year were you born?</span>
        <input
          inputMode="numeric"
          autoComplete="bday-year"
          maxLength={4}
          placeholder="1990"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </label>
      <label className="setup-field">
        <span>Which country do you live in?</span>
        <input
          autoComplete="country-name"
          placeholder="Romania"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </label>
      <Button
        className="setup-next"
        disabled={busy || !ready}
        onClick={() =>
          void go({
            screen: "basics",
            sex,
            birthYear: year.trim(),
            country: country.trim(),
          })
        }
      >
        Continue
      </Button>
    </>
  );
}

function NumberField({
  label,
  value,
  set,
  placeholder,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="setup-field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </label>
  );
}

function BodyScreen({
  s,
  busy,
  go,
}: {
  s: Extract<SetupScreen, { kind: "body" }>;
  busy: boolean;
  go: Go;
}) {
  const [height, setHeight] = useState(s.heightCm ?? "");
  const [weight, setWeight] = useState(s.weightKg ?? "");
  const [waist, setWaist] = useState(s.waistCm ?? "");
  /* A value already on file is not written again. */
  const changed = (v: string, was: string | null) =>
    v.trim() && v.trim() !== (was ?? "") ? v.trim() : undefined;
  return (
    <>
      <h1>Your body</h1>
      <p className="setup-hint">Weight and waist are optional.</p>
      <NumberField
        label="Height, in centimetres"
        value={height}
        set={setHeight}
        placeholder="170"
      />
      <NumberField
        label="Weight, in kilograms"
        value={weight}
        set={setWeight}
        placeholder="65"
      />
      <NumberField
        label="Waist at the navel, in centimetres"
        value={waist}
        set={setWaist}
        placeholder="80"
      />
      <Button
        className="setup-next"
        disabled={busy}
        onClick={() =>
          void go({
            screen: "body",
            heightCm: changed(height, s.heightCm),
            weightKg: changed(weight, s.weightKg),
            waistCm: changed(waist, s.waistCm),
          })
        }
      >
        Continue
      </Button>
    </>
  );
}

interface Row {
  what: string;
  other: string;
  route: Treatment["route"];
  started: string;
  still: boolean;
  stopped: string;
}
const emptyRow = (): Row => ({
  what: "",
  other: "",
  route: "oral",
  started: "",
  still: true,
  stopped: "",
});

function Treatments({
  s,
  busy,
  go,
}: {
  s: Extract<SetupScreen, { kind: "treatments" }>;
  busy: boolean;
  go: Go;
}) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [note, setNote] = useState("");
  const edit = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const save = () => {
    const filled = rows.filter((r) => r.what);
    const out: Treatment[] = [];
    for (const r of filled) {
      const what = r.what === "Other" ? r.other.trim() : r.what;
      if (!what) return setNote("Write what the other treatment is.");
      if (!r.started) return setNote("Add the month you started.");
      if (!r.still && r.stopped && r.stopped < r.started)
        return setNote("The stop month comes after the start month.");
      out.push({
        what,
        route: r.route,
        started: r.started,
        ...(!r.still && r.stopped ? { stopped: r.stopped } : {}),
      });
    }
    setNote("");
    void go({ screen: "treatments", treatments: out });
  };

  return (
    <>
      <h1>What do you take, or took before?</h1>
      <p className="setup-hint">
        A treatment changes what a result means. Add the ones that matter.
      </p>
      {s.current.length > 0 && (
        <ul className="setup-current">
          {s.current.map((t) => (
            <li key={`${t.what}:${t.started}`}>
              {t.what}, {t.route === "iv" ? "IV" : t.route}, from {t.started}
              {t.stopped ? ` to ${t.stopped}` : ""}
            </li>
          ))}
        </ul>
      )}
      {rows.map((r, i) => (
        <fieldset key={i} className="setup-treat">
          <legend className="sr-only">Treatment {i + 1}</legend>
          <div className="setup-chips">
            {WHAT.map((w) => (
              <button
                key={w}
                type="button"
                className={cn("setup-chip", r.what === w && "on")}
                aria-pressed={r.what === w}
                onClick={() => edit(i, { what: r.what === w ? "" : w })}
              >
                {w}
              </button>
            ))}
          </div>
          {r.what === "Other" && (
            <label className="setup-field">
              <span>What is it?</span>
              <input
                value={r.other}
                onChange={(e) => edit(i, { other: e.target.value })}
              />
            </label>
          )}
          <div className="setup-chips">
            {ROUTES.map((x) => (
              <button
                key={x.id}
                type="button"
                className={cn("setup-chip", r.route === x.id && "on")}
                aria-pressed={r.route === x.id}
                onClick={() => edit(i, { route: x.id })}
              >
                {x.label}
              </button>
            ))}
          </div>
          <label className="setup-field">
            <span>Started</span>
            <input
              type="month"
              value={r.started}
              onChange={(e) => edit(i, { started: e.target.value })}
            />
          </label>
          <label className="setup-check">
            <input
              type="checkbox"
              checked={r.still}
              onChange={(e) => edit(i, { still: e.target.checked })}
            />
            Still taking
          </label>
          {!r.still && (
            <label className="setup-field">
              <span>Stopped</span>
              <input
                type="month"
                value={r.stopped}
                onChange={(e) => edit(i, { stopped: e.target.value })}
              />
            </label>
          )}
        </fieldset>
      ))}
      <Button
        job="quiet"
        className="setup-option"
        onClick={() => setRows((rs) => [...rs, emptyRow()])}
      >
        Add another
      </Button>
      {note && (
        <p className="setup-error" role="alert">
          {note}
        </p>
      )}
      <Button className="setup-next" disabled={busy} onClick={save}>
        Continue
      </Button>
    </>
  );
}

function DataScreen({
  s,
  busy,
  go,
  onFile,
}: {
  s: Extract<SetupScreen, { kind: "data" }>;
  busy: boolean;
  go: Go;
  onFile: (f: File | undefined) => void;
}) {
  const [added, setAdded] = useState<string[]>([]);
  const pick = (what: string) => (f: File | undefined) => {
    if (!f) return;
    onFile(f);
    setAdded((a) => [...a, what]);
  };
  return (
    <>
      <h1>More data sharpens the picture</h1>
      <ul className="setup-data">
        {s.needsUpload && (
          <li>
            <b>A lab report</b>
            <span>A PDF or a photo of one.</span>
            {added.includes("lab") ? (
              <span className="state on">added</span>
            ) : (
              <FilePick
                label="Add a report"
                accept={LAB_FILES}
                disabled={busy}
                onFile={pick("lab")}
              />
            )}
          </li>
        )}
        <li>
          <b>A genome file</b>
          <span>The raw data file from 23andMe, AncestryDNA or similar.</span>
          {added.includes("genome") ? (
            <span className="state on">added</span>
          ) : (
            <FilePick
              label="Add a genome file"
              accept=".txt,.csv,.zip,.gz,.vcf"
              disabled={busy}
              onFile={pick("genome")}
            />
          )}
        </li>
        <li>
          <b>Apple Health</b>
          <span>Connect it from the iPhone app.</span>
        </li>
      </ul>
      <Button
        className="setup-next"
        disabled={busy}
        onClick={() => void go({ screen: "data" })}
      >
        Continue
      </Button>
    </>
  );
}

function RevealScreen({
  s,
  busy,
  reading,
  uploadError,
  onDone,
}: {
  s: Reveal;
  busy: boolean;
  reading: boolean;
  uploadError: string;
  onDone: () => void;
}) {
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const adopt = async (id: string) => {
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/plan/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || j.error) setAddError(j.error ?? "Not added. Try again.");
      else setAdded(true);
    } catch {
      setAddError("Not added. Check the connection.");
    } finally {
      setAdding(false);
    }
  };

  if (reading)
    return (
      <>
        <h1>Your first picture</h1>
        <p className="setup-hint">Reading your report…</p>
      </>
    );

  return (
    <>
      <h1>Your first picture</h1>
      {uploadError && (
        <p className="setup-error" role="alert">
          {uploadError} Add it later from +.
        </p>
      )}
      {s.fromAnswersOnly && (
        <p className="setup-hint">From your answers alone.</p>
      )}

      {s.case ? (
        <div className="case">
          <OurRead c={s.case} />
        </div>
      ) : s.picture.length ? (
        <section className="setup-picture" aria-label="Your picture">
          <ol>
            {s.picture.map((r) => (
              <li key={r.id}>
                <div className="rh">
                  <b>{r.name}</b>
                  <span className="p">{barLabel(r.p)}</span>
                </div>
                <div className="setup-trk">
                  <i style={{ width: barLabel(r.p) }} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="setup-hint">Nothing stands out yet.</p>
      )}

      {s.test && (
        <section className="setup-card">
          <h2>The test to take next</h2>
          <div className="setup-line">
            <b>{s.test.label}</b>
            {s.test.price && <span>{s.test.price}</span>}
          </div>
          <p className="setup-hint">
            Why this test:{" "}
            {s.case
              ? "it splits the options above."
              : "it tells the most about your picture for its price."}
          </p>
        </section>
      )}

      {s.action && (
        <section className="setup-card">
          <h2>One thing to start</h2>
          <div className="setup-line">
            <span>
              <b>{s.action.title}</b>
              {s.action.dose && <small> {s.action.dose}</small>}
            </span>
            {added ? (
              <span className="state on">added</span>
            ) : (
              <Button
                job="quiet"
                disabled={adding || busy}
                onClick={() => void adopt(s.action!.id)}
              >
                Add
              </Button>
            )}
          </div>
          {addError && (
            <p className="setup-error" role="alert">
              {addError}
            </p>
          )}
        </section>
      )}

      <Button className="setup-next" disabled={busy} onClick={onDone}>
        Open my home
      </Button>
    </>
  );
}
