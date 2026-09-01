"use client";

/**
 * The ledger, alive.
 *
 * Phase 24d. Answering the Today question posts the fact, re-fetches
 * `GET /api/ledger` and animates the difference in place: the percentages pop
 * their digits in (02), the state chips swap their text (04), the cards FLIP
 * to their new rank (01 + View Transitions when the browser has them), and a
 * toast says what moved (22). No reload, so the person watches their own
 * answer change the picture.
 *
 * The ledger itself is server-rendered, so this file talks to the DOM rather
 * than re-rendering React: the cards carry `data-card`, the percentages
 * `data-percent`, the chips `data-state-chip` and the counters `data-counter`.
 * That is the smallest thing that works — the alternative is turning every
 * card into a client component.
 *
 * Every transition is CSS from `app/globals.css`, so all of it is
 * interruptible and all of it stops under `prefers-reduced-motion`.
 */
import { useEffect } from "react";
import {
  ledgerDiff,
  moved,
  type LedgerDiff,
  type LedgerSnapshot,
} from "@/lib/ledger-diff";
import type { Ask } from "@/lib/asking";

export interface LedgerPayload {
  day: string;
  snapshot: LedgerSnapshot;
  ask: (Ask & { options: string[] }) | null;
}

/** The picture as it is on screen right now. Replaced after every refresh. */
let current: LedgerSnapshot | null = null;

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const cssMs = (name: string, fallback: number) => {
  if (typeof document === "undefined") return fallback;
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(v) ? v : fallback;
};

/* ── 02 number pop-in ─────────────────────────────────────────────────── */

/**
 * Rebuild a `.t-digit-group`'s digits and replay the animation, exactly as
 * `02-number-pop-in.md` orchestrates it: drop `.is-animating`, swap the
 * spans, force a reflow, add it back. The last two characters ride in behind
 * the leading ones on `--digit-stagger`.
 */
export function setDigits(group: HTMLElement, text: string) {
  group.classList.remove("is-animating");
  group.replaceChildren();
  const chars = text.split("");
  chars.forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "t-digit";
    span.textContent = ch;
    if (i === chars.length - 2) span.dataset.stagger = "1";
    else if (i === chars.length - 1) span.dataset.stagger = "2";
    group.appendChild(span);
  });
  void group.offsetHeight; // force reflow
  group.classList.add("is-animating");
}

/* ── 04 text states swap ──────────────────────────────────────────────── */

/**
 * The three-phase swap from `04-text-states-swap.md`: exit up with blur, put
 * the new text in below with no transition, reflow, let it rise.
 */
export function swapText(el: HTMLElement, next: string) {
  const dur = cssMs("--text-swap-dur", 150);
  el.classList.add("is-exit");
  setTimeout(() => {
    el.textContent = next;
    el.classList.remove("is-exit");
    el.classList.add("is-enter-start");
    void el.offsetHeight; // force reflow so the next change transitions
    el.classList.remove("is-enter-start");
  }, dur);
}

/* ── 01 card resize + FLIP reorder ────────────────────────────────────── */

const cardsIn = (root: ParentNode) => [
  ...root.querySelectorAll<HTMLElement>(":scope > [data-card]"),
];

/** Put the card nodes back in the order the new ledger ranks them. */
function reorder(container: HTMLElement, order: Map<string, number>) {
  // Only the cards the ledger ranks move. The collapsed "Lipids: 3 markers
  // off" card is not one of them, so it keeps the slot it is standing in.
  const known = cardsIn(container).filter((el) =>
    order.has(el.dataset.card ?? ""),
  );
  if (known.length < 2) return;
  const sorted = [...known].sort(
    (a, b) => order.get(a.dataset.card!)! - order.get(b.dataset.card!)!,
  );
  // Hold each card's slot with a comment so the other children of the section
  // (the findings card, "What improved") keep their places too.
  const slots = known.map((el) => {
    const slot = document.createComment("");
    el.replaceWith(slot);
    return slot;
  });
  slots.forEach((slot, i) => slot.replaceWith(sorted[i]!));
}

/**
 * FLIP: measure, reorder, invert, play. `.t-flip` owns the transition, so the
 * move is interruptible and reduced motion turns it off in CSS as well as in
 * the guard below.
 */
function flip(container: HTMLElement, order: Map<string, number>) {
  const first = new Map(
    cardsIn(container).map((el) => [el, el.getBoundingClientRect().top]),
  );
  reorder(container, order);
  if (still()) return;
  for (const [el, top] of first) {
    const dy = top - el.getBoundingClientRect().top;
    if (!dy) continue;
    el.style.transition = "none";
    el.style.transform = `translateY(${dy}px)`;
  }
  requestAnimationFrame(() => {
    for (const el of first.keys()) {
      el.style.transition = "";
      el.style.transform = "";
    }
  });
}

/** The same reorder through the View Transitions API when there is one. */
function moveCards(diff: LedgerDiff, snapshot: LedgerSnapshot) {
  const container = document.querySelector<HTMLElement>("[data-ledger]");
  if (!container || diff.moved.length === 0) return;
  const order = new Map(snapshot.cards.map((c, i) => [c.id, i]));

  const start = (
    document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    }
  ).startViewTransition;
  if (typeof start !== "function" || still()) {
    flip(container, order);
    return;
  }
  const movers = cardsIn(container).filter((el) =>
    diff.moved.some((m) => m.id === el.dataset.card),
  );
  movers.forEach((el) => {
    el.style.viewTransitionName = `card-${CSS.escape(el.dataset.card ?? "")}`;
  });
  start.call(document, () => reorder(container, order));
  setTimeout(
    () => movers.forEach((el) => (el.style.viewTransitionName = "")),
    cssMs("--resize-dur", 300) * 2,
  );
}

/* ── 22 toast ─────────────────────────────────────────────────────────── */

export const TOAST_ID = "ov-toast";

export function toast(line: string) {
  const el = document.getElementById(TOAST_ID);
  if (!el) return;
  const text = el.querySelector("[data-toast-text]");
  if (text) text.textContent = line;
  el.classList.add("is-open");
  window.setTimeout(() => el.classList.remove("is-open"), 3200);
}

/* ── the one thing the Today card calls ───────────────────────────────── */

/**
 * Re-read the ledger and show what the answer did.
 *
 * Returns the next question so the Today card can reveal it, and the toast
 * line so the caller can decide whether anything is worth saying.
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
  if (!before) return { ask: next.ask, diff: null };

  const diff = ledgerDiff(before, next.snapshot);
  if (!moved(diff)) return { ask: next.ask, diff };

  for (const n of diff.numbers) {
    const group = document.querySelector<HTMLElement>(
      `[data-percent="${CSS.escape(n.id)}"]`,
    );
    if (group) setDigits(group, `${n.to}%`);
  }
  for (const s of diff.states) {
    const chip = document.querySelector<HTMLElement>(
      `[data-state-chip="${CSS.escape(s.id)}"] .t-text-swap`,
    );
    if (chip) swapText(chip, s.to.replace("_", " "));
  }
  for (const c of diff.counters) {
    const group = document.querySelector<HTMLElement>(
      `[data-counter="${c.key}"]`,
    );
    if (group) setDigits(group, String(c.to));
  }
  // The rings are SVG, so there are no digit spans to replay; they just get
  // the new number and the new arc. ponytail: correct beats animated here.
  for (const s of diff.systems) {
    const arc = document.querySelector<SVGCircleElement>(
      `[data-system-arc="${CSS.escape(s.id)}"]`,
    );
    if (!arc) continue;
    const length = Number(arc.dataset.circumference ?? 0);
    arc.setAttribute("stroke-dasharray", `${(s.to / 100) * length} ${length}`);
    const label = arc
      .closest("svg")
      ?.querySelector<SVGTextElement>("[data-system-score]");
    if (label) label.textContent = String(s.to);
  }
  moveCards(diff, next.snapshot);
  return { ask: next.ask, diff };
}

/**
 * Mounted once by Home: it seeds the snapshot the next refresh diffs against
 * and owns the toast the whole page shares.
 */
export function LedgerMotion({ snapshot }: { snapshot: LedgerSnapshot }) {
  useEffect(() => {
    current = snapshot;
  }, [snapshot]);

  return (
    <div
      id={TOAST_ID}
      role="status"
      aria-live="polite"
      className="t-toast pointer-events-none fixed inset-x-4 bottom-24 z-50 mx-auto w-fit max-w-[92vw] rounded-lg bg-neutral-900 px-4 py-2.5 font-mono text-[12px] tabular-nums text-neutral-0 shadow-lg md:bottom-6"
    >
      <span data-toast-text />
    </div>
  );
}
