/**
 * Phase 43A: the setup flow's order, as a pure function. The server reads
 * the facts and the next `nextMoves` question, this decides the screen.
 * Spec: docs/plans/2026-09-29-phase43-setup-spec.md.
 *
 * No database, no clock, no engine.
 */
import { QUIET_BELIEF, type Move } from "./infogain";
import { PROFILE_QUESTIONS } from "./vectors";

export const SETUP_QUESTIONS = 8;

export type ScreenKind =
  | "intro"
  | "upload"
  | "basics"
  | "body"
  | "question"
  | "treatments"
  | "data"
  | "reveal";

export interface SetupState {
  started: string;
  /** adaptive question keys asked here, in order */
  asked: string[];
  /** question keys the person skipped; setup never asks them again */
  skipped: string[];
  /** screens finished with Continue or Skip: upload, body, treatments, data */
  passed: string[];
  hasReport: boolean | null;
  done?: string;
}

/** What is already true for the person, read from the DB by the caller. */
export interface SetupKnown {
  facts: Set<string>;
  uploads: number;
}

export const emptySetup = (now: string): SetupState => ({
  started: now,
  asked: [],
  skipped: [],
  passed: [],
  hasReport: null,
});

export const addOnce = (xs: string[], x: string): string[] =>
  xs.includes(x) ? xs : [...xs, x];

export function nextKind(
  s: SetupState,
  k: SetupKnown,
  nextQuestion: string | null,
): ScreenKind {
  if (!k.facts.has("setup_goal") || s.hasReport == null) return "intro";
  if (s.hasReport && k.uploads === 0 && !s.passed.includes("upload"))
    return "upload";
  if (!["sex", "birth_year", "country"].every((f) => k.facts.has(f)))
    return "basics";
  if (!k.facts.has("height_cm") && !s.passed.includes("body")) return "body";
  // Skipped questions count toward the cap: they were shown screens.
  if (nextQuestion && s.asked.length + s.skipped.length < SETUP_QUESTIONS)
    return "question";
  if (!s.passed.includes("treatments")) return "treatments";
  if (!s.passed.includes("data")) return "data";
  return "reveal";
}

export const excludedKeys = (s: SetupState, k: SetupKnown): string[] =>
  [...new Set([...k.facts, ...s.asked, ...s.skipped])].map((x) => `fact:${x}`);

/** Ten points is a move the eye catches on a bar. */
const VISIBLE_MOVE = 0.1;

/** The biggest swing an answer could give a bar already on the picture. */
const visibleSwing = (m: Move) =>
  Math.max(
    0,
    ...m.moves
      .filter((x) => x.from >= QUIET_BELIEF)
      .map((x) => Math.abs(x.to - x.from)),
  );

/**
 * The question a setup screen asks, from the `nextMoves` questions with tap
 * options. A free-text question (waist, home blood pressure) is simulated on
 * invented sample answers, and those must never print as buttons.
 *
 * A question that could move a bar the person is watching goes first; then
 * `nextMoves`' own order. The walk on 2026-09-30 answered eight questions and
 * the picture moved one point: the entropy gain ranks rule-outs of rare
 * conditions first, and scores "heavy periods?" below zero for a woman whose
 * top bar is heavy menstrual bleeding at 34 %. `eval:setup` stayed level
 * (45 % / 50 %, Hashimoto rank 3 to 1-2, iron with labs 2 to 4).
 * ponytail: free-text questions are left to Home; add a number input here if
 * the eval shows setup misses them.
 */
export function pickQuestion(moves: Move[]): Move | null {
  const ok = moves.filter(
    (m) =>
      m.kind === "question" &&
      m.featureId.startsWith("fact:") &&
      (PROFILE_QUESTIONS[m.featureId.slice(5)]?.options?.length ?? 0) > 0,
  );
  const seen = [...ok].sort((a, b) => visibleSwing(b) - visibleSwing(a))[0];
  if (seen && visibleSwing(seen) >= VISIBLE_MOVE) return seen;
  return ok[0] ?? null;
}

const ORDER: ScreenKind[] = [
  "intro",
  "upload",
  "basics",
  "body",
  "question",
  "treatments",
  "data",
  "reveal",
];

/**
 * `of` counts intro, basics, body, the 8 questions, treatments, data and
 * reveal, plus upload for a person with a report. `at` counts the screens
 * before `kind`.
 */
export function progressOf(
  s: SetupState,
  kind: ScreenKind,
): { at: number; of: number } {
  const count = (x: ScreenKind) =>
    x === "question" ? SETUP_QUESTIONS : x === "upload" && !s.hasReport ? 0 : 1;
  const of = ORDER.reduce((n, x) => n + count(x), 0);
  const i = ORDER.indexOf(kind);
  const before = ORDER.slice(0, i).reduce((n, x) => n + count(x), 0);
  const at =
    kind === "question" ? before + s.asked.length + s.skipped.length : before;
  return { at: Math.min(at, of - 1), of };
}
