"use client";

/**
 * Phase 44C: the web check-in. One screen at a time, drawn from the JSON
 * `/api/checkin` returns (`CheckinBody` in lib/checkin-server.ts); the server
 * picks the questions and their order, this draws them and posts each answer.
 * It reuses setup's question block and picture. iOS draws the same JSON.
 * Spec: docs/plans/2026-09-30-phase44-checkin-spec.md, B4 and B6.
 *
 * Every number here is engine output: the bars, the "moves" line, and the
 * from/to on the since screen. The header counts questions, not percent, so
 * there is no progress bar.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CheckinBody,
  CheckinPost,
  CheckinScreen,
} from "@/lib/checkin-server";
import type { PictureRow } from "@/lib/setup-server";
import { Picture, QuestionOptions } from "./setup-flow";
import { Button } from "./ui-kit";

type Since = Extract<CheckinScreen, { kind: "since" }>;

/** "Iron deficiency 43% → 61%, from your tiredness answer" */
const movedLine = (m: Since["moved"][number]): string =>
  `${m.name} ${m.from}% → ${m.to}%${m.by ? `, from ${m.by}` : ""}`;

/** "Low iron stores got stronger, 30% → 45%" */
const hunchLine = (h: Since["hunches"][number]): string =>
  `${h.title} got ${h.to > h.from ? "stronger" : "weaker"}, ${h.from}% → ${h.to}%`;

export function CheckinFlow({ initial }: { initial: CheckinBody }) {
  const router = useRouter();
  const [body, setBody] = useState<CheckinBody>(initial);
  const [prev, setPrev] = useState<PictureRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /** The next body, or null when the save failed (the screen stays). */
  const post = async (payload: CheckinPost): Promise<CheckinBody | null> => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json().catch(() => null)) as
        | (CheckinBody & { error?: string })
        | null;
      if (!res.ok || !j || j.error) throw new Error(j?.error ?? "not saved");
      return j;
    } catch {
      setError("Not saved. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const answer = async (payload: CheckinPost) => {
    const next = await post(payload);
    if (!next) return;
    // A round closed elsewhere (another device) comes back not due.
    if (!next.screen) return router.push("/");
    setPrev(body.picture);
    setBody(next);
  };

  /** Ask later, Skip this round and Open my home leave the flow once saved. */
  const leave = async (payload: CheckinPost, to: string) => {
    if (await post(payload)) router.push(to);
  };

  const s = body.screen;
  if (!s) return null;

  return (
    <div className="setup">
      <header className="setup-top">
        {s.kind === "question" && (
          <>
            <span className="setup-count">
              {`${body.progress.at + 1} of ${body.progress.of}`}
            </span>
            <Button
              job="text"
              className="setup-later"
              disabled={busy}
              onClick={() =>
                void leave(
                  { later: true, offsetMin: -new Date().getTimezoneOffset() },
                  "/?home=1",
                )
              }
            >
              Ask later
            </Button>
            <Button
              job="text"
              className="setup-later"
              disabled={busy}
              onClick={() => void leave({ skip: true }, "/")}
            >
              Skip this round
            </Button>
          </>
        )}
      </header>

      <section className="setup-screen" aria-live="polite">
        {s.kind === "question" && (
          <>
            <h1>{s.question}</h1>
            <p className="setup-hint">{s.why}</p>
            <QuestionOptions
              options={s.options}
              busy={busy}
              onPick={(value) =>
                void answer({ screen: "question", key: s.key, value })
              }
            />
          </>
        )}
        {s.kind === "since" && (
          <SinceScreen
            s={s}
            busy={busy}
            onDone={() => void leave({ done: true }, "/")}
          />
        )}

        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}

        {s.kind === "question" && (
          <Button
            job="text"
            className="setup-skip"
            disabled={busy}
            onClick={() =>
              void answer({ screen: "question", key: s.key, skip: true })
            }
          >
            Skip
          </Button>
        )}
      </section>

      {s.kind === "question" && (
        <Picture
          rows={body.picture}
          prev={prev}
          hint="Each answer moves them."
        />
      )}
    </div>
  );
}

function SinceScreen({
  s,
  busy,
  onDone,
}: {
  s: Since;
  busy: boolean;
  onDone: () => void;
}) {
  return (
    <>
      <h1>Since this check-in started</h1>
      {s.moved.length === 0 && s.hunches.length === 0 ? (
        <p className="setup-hint">Nothing moved much this round.</p>
      ) : (
        <ul className="setup-current">
          {s.moved.map((m) => (
            <li key={m.id}>{movedLine(m)}</li>
          ))}
          {s.hunches.map((h) => (
            <li key={h.id}>{hunchLine(h)}</li>
          ))}
        </ul>
      )}

      {s.test && (
        <section className="setup-card">
          <h2>The test to take next</h2>
          <div className="setup-line">
            <b>{s.test.label}</b>
            {s.test.price && <span>{s.test.price}</span>}
          </div>
          <p className="setup-hint">
            Why this test: it tells the most about your picture for its price.
          </p>
        </section>
      )}

      <Button className="setup-next" disabled={busy} onClick={onDone}>
        Open my home
      </Button>
    </>
  );
}
