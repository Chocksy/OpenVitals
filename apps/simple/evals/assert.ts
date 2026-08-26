/**
 * What a plan has to contain, and what it must never contain, checked in code
 * before any judge model sees it.
 *
 * An assertion is a set of clauses that all have to hold for the same action.
 * `must` passes when some action satisfies every clause; `mustNot` passes when
 * none does. `doseMaxUg` is the one clause that flips: in `must` it means "at
 * or under this dose", in `mustNot` it means "over this dose", which is how a
 * human reads "must not: iron over 100 mg".
 */
import type { ActionKind, Basis, ReportAction, ReportBody } from "@/db";
import { doseAmount, overCeiling } from "@/lib/vectors";

export interface Assertion {
  /** Only look at actions of this kind. */
  kind?: ActionKind;
  /** Case-insensitive regex over the action title. */
  title?: string;
  /** Case-insensitive regex over the action reasoning. */
  reasoning?: string;
  /** Case-insensitive regex over the plan's question texts. */
  question?: string;
  /** The dose, in micrograms. */
  doseMaxUg?: number;
  basis?: Basis;
  /** An id in `body.patterns`. */
  patternMatched?: string;
  /** Actions of this kind are exempt. */
  unlessKind?: ActionKind;
  /** Any action over a dose ceiling. */
  overCeiling?: boolean;
  /** The whole plan has at most this many actions. */
  maxActions?: number;
}

const rx = (pattern: string) => new RegExp(pattern, "i");

/** `dose.amount` in micrograms, or null when it is not a mass. */
export function doseMicrograms(action: ReportAction): number | null {
  const amount = action.dose?.amount;
  if (!amount) return null;
  const n = doseAmount(amount);
  if (n == null) return null;
  if (/µg|mcg|\bug\b/i.test(amount)) return n;
  if (/\bmg\b/i.test(amount)) return n * 1_000;
  if (/\bg\b/i.test(amount)) return n * 1_000_000;
  return null;
}

function matchesAction(
  action: ReportAction,
  a: Assertion,
  negated: boolean,
): boolean {
  if (a.unlessKind && action.kind === a.unlessKind) return false;
  if (a.kind && action.kind !== a.kind) return false;
  if (a.basis && action.basis !== a.basis) return false;
  if (a.title && !rx(a.title).test(action.title)) return false;
  if (a.reasoning && !rx(a.reasoning).test(action.reasoning ?? ""))
    return false;
  if (a.doseMaxUg != null) {
    const ug = doseMicrograms(action);
    if (ug == null) return false;
    if (negated ? ug <= a.doseMaxUg : ug > a.doseMaxUg) return false;
  }
  return true;
}

/** Does the plan satisfy this assertion? `negated` is set for `mustNot`. */
export function checkAssertion(
  body: ReportBody,
  a: Assertion,
  negated = false,
): boolean {
  if (a.maxActions != null) return body.actions.length <= a.maxActions;
  if (a.patternMatched)
    return (body.patterns ?? []).some((p) => p.id === a.patternMatched);
  if (a.overCeiling) return body.actions.some((x) => overCeiling(x) != null);
  if (a.question)
    return body.questions.some((q) => rx(a.question!).test(q.text));
  return body.actions.some((action) => matchesAction(action, a, negated));
}

export const describeAssertion = (a: Assertion): string =>
  Object.entries(a)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");

export interface AssertionReport {
  passed: number;
  total: number;
  failed: string[];
  failedMust: boolean;
  /** `should` is scored and reported, never a failure. */
  shouldPassed: number;
  shouldTotal: number;
  shouldMissed: string[];
}

export function runAssertions(
  body: ReportBody,
  must: Assertion[] = [],
  mustNot: Assertion[] = [],
  should: Assertion[] = [],
): AssertionReport {
  const failed: string[] = [];
  let failedMust = false;
  let passed = 0;

  for (const a of must) {
    if (checkAssertion(body, a)) passed++;
    else {
      failed.push(`must: ${describeAssertion(a)}`);
      failedMust = true;
    }
  }
  for (const a of mustNot) {
    if (!checkAssertion(body, a, true)) passed++;
    else failed.push(`mustNot: ${describeAssertion(a)}`);
  }

  const shouldMissed: string[] = [];
  let shouldPassed = 0;
  for (const a of should) {
    if (checkAssertion(body, a)) shouldPassed++;
    else shouldMissed.push(`should: ${describeAssertion(a)}`);
  }

  return {
    passed,
    total: must.length + mustNot.length,
    failed,
    failedMust,
    shouldPassed,
    shouldTotal: should.length,
    shouldMissed,
  };
}
