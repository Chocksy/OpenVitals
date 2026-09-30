import { PROFILE_QUESTIONS } from "./vectors";

export type FactCheck = { ok: true } | { ok: false; error: string };

/**
 * Phase 43A: the one check an answered fact passes before `saveFact`, shared
 * by `/api/facts` and `/api/setup` so the two can never accept different
 * answers to the same question.
 */
export function checkFact(key: string | undefined, value: unknown): FactCheck {
  if (!key || !PROFILE_QUESTIONS[key])
    return { ok: false, error: "unknown question" };
  if (typeof value !== "string" || !value.trim())
    return { ok: false, error: "no answer" };
  const options = PROFILE_QUESTIONS[key].options;
  if (options && !options.includes(value))
    return { ok: false, error: "not one of the options" };
  return { ok: true };
}
