"use client";

/**
 * "3 notes read since your last visit", on the Today card.
 *
 * Phase 34a. A note written while the reader was down is saved with its words
 * whole and read by the next pass, which can be hours later. This is the only
 * place the person is told that it happened, so it says it once and then marks
 * the notes seen — the same seen/unseen pair `paper_watch` uses for a paper,
 * applied to a check-in.
 *
 * The line is server-rendered text; the only thing the client does is clear
 * the count it has just printed.
 */
import { useEffect, useRef } from "react";

export function NotesRead({ line }: { line: string | null }) {
  const told = useRef(false);
  useEffect(() => {
    if (!line || told.current) return;
    told.current = true;
    void fetch("/api/compose/reread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seen: true }),
    }).catch(() => {});
  }, [line]);

  if (!line) return null;
  return <p className="t-meta text-[length:var(--type-sm)]">{line}</p>;
}
