"use client";

/**
 * The ledger, alive.
 *
 * Answering the Today question posts the fact, re-fetches `GET /api/ledger`,
 * and asks the server for the page again. The difference is what the eye
 * sees: percentages pop their digits in (02), the state chips swap their text
 * (04), the cards FLIP to their new rank (01), and a toast says what moved
 * (22). No reload, so the person watches their own answer change the picture.
 *
 * Phase 25a moved every one of those from the DOM into React. This file now
 * only reads: it fetches the ledger, diffs it against the last one it saw, and
 * hands the caller the next question and the sentence for the toast. The
 * animation happens because the server render that follows carries new props,
 * and `components/motion.tsx` animates on a prop change.
 */
import { useEffect } from "react";
import {
  ledgerDiff,
  type LedgerDiff,
  type LedgerSnapshot,
} from "@/lib/ledger-diff";
import type { Ask } from "@/lib/asking";

export { toast, TOAST_ID } from "./motion";

export interface LedgerPayload {
  day: string;
  snapshot: LedgerSnapshot;
  ask: (Ask & { options: string[] }) | null;
}

/** The picture as it is on screen right now. Replaced after every render. */
let current: LedgerSnapshot | null = null;

/**
 * Re-read the ledger and say what the answer did.
 *
 * Returns the next question so the Today card can reveal it, and the diff so
 * the caller can decide whether anything is worth saying.
 */
export async function refreshLedger(): Promise<{
  ask: LedgerPayload["ask"];
  diff: LedgerDiff | null;
}> {
  const res = await fetch("/api/ledger", { cache: "no-store" });
  if (!res.ok) return { ask: null, diff: null };
  const next = (await res.json()) as LedgerPayload;
  const before = current;
  current = next.snapshot;
  return {
    ask: next.ask,
    diff: before ? ledgerDiff(before, next.snapshot) : null,
  };
}

/**
 * Mounted once by Home: it seeds the snapshot the next refresh diffs against.
 * The toast it used to own lives in the layout, because adopting and
 * dismissing say what they did on every page.
 */
export function LedgerMotion({ snapshot }: { snapshot: LedgerSnapshot }) {
  useEffect(() => {
    current = snapshot;
  }, [snapshot]);

  return null;
}
