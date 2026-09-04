"use client";

/**
 * The three writes a topic has. Phase 35 section C, `topic.html` sections 03
 * and 05.
 *
 * Same bargain as `components/research-now.tsx`: one ink button, and it is
 * the one that spends tokens, so the run date sits beside it. A run inside
 * the cooldown comes back as a receipt with the day it last ran rather than
 * as a failure, and a run whose reading half was refused says so — the search
 * still happened, so the papers are real and the page prints "found, not read
 * yet" instead of an empty topic.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MessageSquare, Plus, Search } from "lucide-react";
import { dayLabel } from "@/lib/utils";
import { openComposer } from "./composer";
import { Button } from "./ui-kit";

/** "Watch a topic": the box on the Research section. */
export function WatchTopic() {
  const router = useRouter();
  const [, start] = useTransition();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");

  const add = async () => {
    setBusy(true);
    setSaid("");
    const res = await fetch("/api/research/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      label?: string;
    };
    setBusy(false);
    if (!res.ok) {
      setSaid(data.error ?? "That did not save.");
      return;
    }
    setSaid(`Watching ${data.label ?? label}. The first run happens tonight.`);
    setLabel("");
    start(() => router.refresh());
  };

  return (
    <div className="space-y-3">
      <div className="fields">
        <div className="field">
          <label htmlFor="watch-topic">Topic</label>
          <input
            className="inp"
            id="watch-topic"
            value={label}
            placeholder="cold exposure"
            onChange={(e) => setLabel(e.target.value)}
          />
          <span className="help">
            Anything you take or do. It is normalised to lower case and kept
            once per person.
          </span>
        </div>
      </div>
      <div className="rowh">
        <Button
          disabled={busy || label.trim().length < 3}
          onClick={() => void add()}
        >
          <Plus className="ic" aria-hidden="true" /> Watch it
        </Button>
        <span className="t-meta text-[length:var(--type-sm)]">
          the first run happens tonight · about 12 papers
        </span>
      </div>
      {said && <p className="cap">{said}</p>}
    </div>
  );
}

/**
 * Research now · Watch this / Stop watching · Discuss.
 *
 * "Watch this" and "Stop watching" are the same quiet button in the same
 * place; only the word and the icon change, so the row never moves under the
 * cursor.
 */
export function TopicActions({
  topic,
  label,
  watching,
  nextRun,
  days,
}: {
  topic: string;
  label: string;
  watching: boolean;
  /** the day the next run is due, as `YYYY-MM-DD`, or null */
  nextRun: string | null;
  days: number;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");

  const run = async () => {
    setBusy(true);
    setSaid("");
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      cooldown?: boolean;
      lastRun?: string | null;
      found?: number;
      outcomes?: number;
      read?: boolean;
      reason?: string;
    };
    setBusy(false);
    if (res.status === 429 && data.cooldown) {
      setSaid(
        data.lastRun
          ? `Run on ${dayLabel(data.lastRun, true)} already. Each topic runs again after ${days} days.`
          : "Inside the cooldown; nothing was read.",
      );
      return;
    }
    if (!res.ok) {
      setSaid(data.error ?? "The run failed.");
      return;
    }
    setSaid(
      data.read
        ? `${data.found ?? 0} found · ${data.outcomes ?? 0} outcomes read.`
        : `${data.found ?? 0} found, none read yet. The reader could not run${
            data.reason ? `: ${data.reason}` : ""
          }.`,
    );
    start(() => router.refresh());
  };

  const toggle = async () => {
    setBusy(true);
    setSaid("");
    const res = await fetch("/api/research/topics", {
      method: watching ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(watching ? { topic } : { label }),
    });
    setBusy(false);
    if (!res.ok) {
      setSaid("That did not save.");
      return;
    }
    setSaid(
      watching
        ? "Stopped. Every paper already read stays on file."
        : `Watching ${label}.`,
    );
    start(() => router.refresh());
  };

  return (
    <div className="space-y-3">
      <div className="rowh">
        <Button disabled={busy} onClick={() => void run()}>
          <Search className="ic" aria-hidden="true" />{" "}
          {busy ? "Reading…" : "Research now"}
        </Button>
        <Button job="quiet" disabled={busy} onClick={() => void toggle()}>
          {watching ? (
            <>
              <EyeOff className="ic" aria-hidden="true" /> Stop watching
            </>
          ) : (
            <>
              <Eye className="ic" aria-hidden="true" /> Watch this
            </>
          )}
        </Button>
        <Button
          job="text"
          onClick={() => openComposer("", { label: `the topic “${label}”` })}
        >
          <MessageSquare className="ic" aria-hidden="true" /> Discuss
        </Button>
      </div>
      <span className="t-meta text-[length:var(--type-sm)]">
        {watching && nextRun
          ? `next run ${dayLabel(nextRun, true)} · every ${days} days`
          : watching
            ? `next run tonight · every ${days} days`
            : "not watched · nothing runs on its own"}
      </span>
      {said && <p className="cap">{said}</p>}
    </div>
  );
}
