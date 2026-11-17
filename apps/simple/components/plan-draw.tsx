"use client";

/**
 * Plan a draw: `docs/mockups/v4/plan-draw.html`.
 *
 * What is worth ordering now (the information-gain engine's own ranking, with
 * the posterior pair each answer would produce), what is already planned, and
 * what can wait, next to the order sheet they build. The sheet's tabs pick
 * the day, and "Plan these draws" writes one dated goal per marker — the same
 * row the retest planner has always written and the row the draw line reads
 * back as a planned draw.
 *
 * "Due for a recheck" is the mockup's "due by cadence" panel: the yearly core
 * against its last draw and every marker an open hunch says is moving
 * (`lib/recheck.ts`). It comes first because it is most of a real draw.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Check, ClipboardCopy } from "lucide-react";
import { dayLabel, plural } from "@/lib/utils";
import { romanianSheet } from "@/lib/ro-sheet";
import { Button, StateWord } from "./ui-kit";

export interface DrawCandidate {
  code: string;
  name: string;
  /** "€57", "cost 2", or "free" — whatever the engine actually knows */
  cost: string;
  /** the sentence under the name: why this one is worth a needle */
  why: string;
  /** the posterior pair, when the engine produced one */
  post?: {
    name: string;
    from: number;
    up: number;
    upIf: string;
    dn: number;
    dnIf: string;
  } | null;
  /** last time this marker had a value */
  lastDrawn?: string | null;
  /** already on a dated goal */
  plannedFor?: string | null;
  group: "recheck" | "now" | "planned" | "wait";
}

/** 0 is "this week": a draw you are doing now, or just did. */
const WEEKS = [0, 4, 8, 12];

/** `2026-11-24`, N weeks from today, in the browser's own day. */
const dayIn = (weeks: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};

function Row({
  c,
  on,
  toggle,
}: {
  c: DrawCandidate;
  on: boolean;
  toggle: () => void;
}) {
  return (
    <button type="button" className="drow" onClick={toggle} aria-pressed={on}>
      <span className={on ? "ck" : "ck offc"} aria-hidden="true">
        <Check className="ic" />
      </span>
      <span>
        <span className="nm block">{c.name}</span>
        <span className="dsub block">
          {c.post ? (
            <>
              {c.post.name}{" "}
              <span className="post">
                {c.post.from} % → <span className="up">{c.post.up}</span> if{" "}
                {c.post.upIf}, <span className="dn">{c.post.dn}</span> if{" "}
                {c.post.dnIf}
              </span>
            </>
          ) : (
            c.why
          )}
        </span>
      </span>
      <span className="cost">{c.cost}</span>
    </button>
  );
}

export function PlanDraw({
  candidates,
  romanian = false,
}: {
  candidates: DrawCandidate[];
  /** the person lives in Romania: offer the sheet in the lab's language */
  romanian?: boolean;
}) {
  const router = useRouter();
  const [weeks, setWeeks] = useState(12);
  const [picked, setPicked] = useState<string[]>(() =>
    // Only what has a reason starts on the sheet. The engine's own picks are
    // there to read and tick, not to pay for by default.
    candidates
      .filter((c) => c.group === "recheck" || c.group === "planned")
      .map((c) => c.code),
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const due = dayIn(weeks);
  const byGroup = (g: DrawCandidate["group"]) =>
    candidates.filter((c) => c.group === g);
  const sheet = useMemo(
    () => candidates.filter((c) => picked.includes(c.code)),
    [candidates, picked],
  );

  const toggle = (code: string) =>
    setPicked((p) =>
      p.includes(code) ? p.filter((x) => x !== code) : [...p, code],
    );

  const plan = async () => {
    setBusy(true);
    setDone("");
    const failed: string[] = [];
    for (const c of sheet) {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metricCode: c.code,
          due,
          note: `planned draw · ${dayLabel(due, true)} · ${c.why}`.slice(0, 300),
        }),
      });
      if (!res.ok) failed.push(c.name);
    }
    setBusy(false);
    setDone(
      `${sheet.length - failed.length} planned for ${dayLabel(due, true)}.` +
        (failed.length ? ` Not saved: ${failed.join(", ")}.` : ""),
    );
    router.refresh();
  };

  const sheetText = [
    `Blood work · ${dayLabel(due, true)}`,
    ...sheet.map((c) => `- ${c.name}${c.lastDrawn ? ` (last drawn ${dayLabel(c.lastDrawn, true)})` : ""}`),
  ].join("\n");

  return (
    <div className="grid2">
      <div className="stackv">
        {byGroup("recheck").length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <h3>Due for a recheck</h3>
              <span className="r">moving, or due by date</span>
            </div>
            {byGroup("recheck").map((c) => (
              <Row
                key={c.code}
                c={c}
                on={picked.includes(c.code)}
                toggle={() => toggle(c.code)}
              />
            ))}
          </div>
        )}

        <div className="panel">
          <div className="panel-head">
            <h3>Worth it now</h3>
            <span className="r">the answer would change something</span>
          </div>
          {byGroup("now").length === 0 ? (
            <p className="never">
              The engine has nothing it would buy right now.
            </p>
          ) : (
            byGroup("now").map((c) => (
              <Row
                key={c.code}
                c={c}
                on={picked.includes(c.code)}
                toggle={() => toggle(c.code)}
              />
            ))
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Already planned</h3>
            <span className="r">
              {plural(byGroup("planned").length, "with a date on it", "with a date on them")}
            </span>
          </div>
          {byGroup("planned").length === 0 ? (
            <p className="never">Nothing has a date on it yet.</p>
          ) : (
            byGroup("planned").map((c) => (
              <Row
                key={c.code}
                c={c}
                on={picked.includes(c.code)}
                toggle={() => toggle(c.code)}
              />
            ))
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Can wait</h3>
            <span className="r">expensive, or would not move the plan</span>
          </div>
          {byGroup("wait").length === 0 ? (
            <p className="never">Nothing is parked.</p>
          ) : (
            byGroup("wait").map((c) => (
              <Row
                key={c.code}
                c={c}
                on={picked.includes(c.code)}
                toggle={() => toggle(c.code)}
              />
            ))
          )}
        </div>
      </div>

      <div className="panel hi">
        <div className="panel-head">
          <h3>Blood work · {dayLabel(due, true)}</h3>
          <span className="r">
            {plural(sheet.length, "marker")}
          </span>
        </div>
        <div className="filters">
          {WEEKS.map((w) => (
            <button
              key={w}
              type="button"
              className={w === weeks ? "f on" : "f"}
              onClick={() => setWeeks(w)}
            >
              {w ? `${w} wk` : "this week"} · {dayLabel(dayIn(w))}
            </button>
          ))}
        </div>
        <div className="rows mt-[var(--s13)]">
          {sheet.length === 0 && (
            <p className="never">Nothing picked. Tick a row on the left.</p>
          )}
          {sheet.map((c) => (
            <div className="mrow" key={c.code}>
              <div className="mn">
                {c.name}
                <small>
                  {c.lastDrawn
                    ? `last read on ${dayLabel(c.lastDrawn, true)}`
                    : "never measured"}
                </small>
              </div>
              <div className="mv" />
              <div className="mw">{c.cost}</div>
            </div>
          ))}
        </div>
        <p className="t-body mt-[var(--s13)]">
          A draw is one needle. Everything on this sheet is drawn on the same
          morning so the numbers compare with the last one.
        </p>
        <div className="rowh">
          <Button disabled={busy || sheet.length === 0} onClick={() => void plan()}>
            <Calendar className="ic" aria-hidden="true" />
            {busy ? "Planning…" : "Plan these draws"}
          </Button>
          <Button
            job="quiet"
            onClick={() => void navigator.clipboard?.writeText(sheetText)}
          >
            <ClipboardCopy className="ic" aria-hidden="true" />
            Copy for your doctor
          </Button>
          {romanian && (
            <Button
              job="quiet"
              onClick={() =>
                void navigator.clipboard?.writeText(romanianSheet(due, sheet))
              }
            >
              <ClipboardCopy className="ic" aria-hidden="true" />
              Copy in Romanian
            </Button>
          )}
          {done && <StateWord tone="on">{done}</StateWord>}
        </div>
      </div>
    </div>
  );
}
