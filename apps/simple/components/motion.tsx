"use client";

/**
 * The four moving parts of the ledger, done the React way.
 *
 * Phase 24d animated the ledger by writing to the DOM: `replaceChildren` for
 * the digit pop-in, `textContent` for the chip swap, and a hand-rolled node
 * reorder for the FLIP. React owns those nodes, so the next commit found a
 * tree it had not built and "Add to protocol" died with
 * `NotFoundError: Failed to execute 'removeChild' on 'Node'`.
 *
 * So: state and keys, never nodes. A number that changes remounts its group
 * under a new key, which replays `02-number-pop-in.md`. A chip that changes
 * runs the three phases of `04-text-states-swap.md` as three renders. The
 * FLIP measures, lets React reorder by key, and only then writes a transform
 * back — the one thing the standard React FLIP does touch, and the only
 * imperative line left in `components/**`.
 *
 * `components/no-dom-mutation.test.ts` is the lock.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "@/lib/utils";

/** True when the reader asked their OS for less motion. */
const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One of the motion tokens from `app/globals.css`, in ms. */
const cssMs = (name: string, fallback: number) => {
  if (typeof document === "undefined") return fallback;
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
  return Number.isFinite(v) ? v : fallback;
};

/**
 * A number the ledger can replay in place (`02-number-pop-in.md`): one span
 * per character, the last two staggered.
 *
 * Server-rendered at rest, so the first paint carries no animation class. When
 * a new value arrives — from a server re-render or from the client — the
 * generation changes, React remounts the group, and the keyframes run once.
 */
export function Digits({
  text,
  className,
  ...rest
}: { text: string } & React.HTMLAttributes<HTMLSpanElement>) {
  const [seen, setSeen] = useState(text);
  const [generation, setGeneration] = useState(0);
  if (seen !== text) {
    setSeen(text);
    setGeneration((g) => g + 1);
  }

  const chars = [...text];
  return (
    <span
      key={generation}
      className={cn(
        "t-digit-group tabular-nums",
        generation > 0 && "is-animating",
        className,
      )}
      {...rest}
    >
      {chars.map((ch, i) => (
        <span
          key={`${i}-${ch}`}
          className="t-digit"
          data-stagger={
            i === chars.length - 2
              ? "1"
              : i === chars.length - 1
                ? "2"
                : undefined
          }
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

/**
 * The three-phase swap from `04-text-states-swap.md`, as three renders: exit
 * up with blur, mount the new text below with no transition, then let it rise.
 */
export function SwapText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [shown, setShown] = useState(text);
  const [phase, setPhase] = useState<"" | "is-exit" | "is-enter-start">("");

  useEffect(() => {
    if (text === shown) return;
    if (still()) {
      setShown(text);
      return;
    }
    setPhase("is-exit");
    const t = window.setTimeout(
      () => {
        setShown(text);
        setPhase("is-enter-start");
      },
      cssMs("--text-swap-dur", 150),
    );
    return () => window.clearTimeout(t);
  }, [text, shown]);

  useEffect(() => {
    if (phase !== "is-enter-start") return;
    // Two frames: the browser has to paint the start state before the
    // transition back to rest has anything to interpolate from.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setPhase(""));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [phase]);

  return <span className={cn("t-text-swap", phase, className)}>{shown}</span>;
}

/**
 * The ledger list, with a FLIP over the cards React reordered.
 *
 * Measure every `[data-card]` against the container after each commit, compare
 * with the last measurement, and give anything that moved its old position
 * back as a transform for one frame. `.t-flip` owns the transition, so the
 * move is interruptible and reduced motion turns it off in CSS as well as
 * here.
 */
export function LedgerList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const host = useRef<HTMLElement>(null);
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const cards = [...el.querySelectorAll<HTMLElement>(":scope > [data-card]")];
    const origin = el.getBoundingClientRect().top;
    const next = new Map<string, number>();
    const quiet = still();
    const moved: HTMLElement[] = [];

    for (const card of cards) {
      const id = card.dataset.card ?? "";
      const top = card.getBoundingClientRect().top - origin;
      next.set(id, top);
      const was = tops.current.get(id);
      if (quiet || was == null || was === top) continue;
      card.style.transition = "none";
      card.style.transform = `translateY(${was - top}px)`;
      moved.push(card);
    }
    tops.current = next;
    if (!moved.length) return;

    const raf = requestAnimationFrame(() => {
      for (const card of moved) {
        card.style.transition = "";
        card.style.transform = "";
      }
    });
    return () => cancelAnimationFrame(raf);
  });

  return (
    <section ref={host} data-ledger className={className}>
      {children}
    </section>
  );
}

/* ── the toast every surface shares ──────────────────────────────────── */

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

interface ToastState {
  /** bumped per call so the same line twice still re-opens the toast */
  n: number;
  line: string;
  action?: ToastAction;
}

let toastState: ToastState | null = null;
const listeners = new Set<() => void>();
let hideAt = 0;

const publish = (next: ToastState | null) => {
  toastState = next;
  for (const l of listeners) l();
};

/** A toast you can act on waits; one that only reports does not. */
const OPEN_MS = 4000;
const ACTION_MS = 10_000;

/** Say what just happened, with an optional one-tap undo. */
export function toast(line: string, action?: ToastAction) {
  publish({ n: (toastState?.n ?? 0) + 1, line, ...(action ? { action } : {}) });
  const mine = ++hideAt;
  if (typeof window === "undefined") return;
  window.setTimeout(
    () => {
      if (mine === hideAt) publish(null);
    },
    action ? ACTION_MS : OPEN_MS,
  );
}

export const TOAST_ID = "ov-toast";

/** Mounted once by Home; the store above is what every caller talks to. */
export function Toast() {
  const state = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => toastState,
    () => null,
  );

  return (
    <div
      id={TOAST_ID}
      role="status"
      aria-live="polite"
      className={cn(
        "t-toast fixed inset-x-4 bottom-24 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-lg bg-neutral-900 px-4 py-2.5 font-mono text-[12px] tabular-nums text-neutral-0 shadow-lg md:bottom-6",
        state ? "is-open pointer-events-auto" : "pointer-events-none",
      )}
    >
      <span data-toast-text>{state?.line ?? ""}</span>
      {state?.action && (
        <button
          className="shrink-0 cursor-pointer font-mono text-[12px] uppercase tracking-[0.06em] text-accent-200 underline hover:text-neutral-0"
          onClick={() => {
            const run = state.action?.run;
            publish(null);
            void run?.();
          }}
        >
          {state.action.label}
        </button>
      )}
    </div>
  );
}
