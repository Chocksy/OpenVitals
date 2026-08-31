/**
 * Your own effect sizes: what the literature says, corrected by what your body
 * actually did.
 *
 * Phase 22. `intervention_outcomes` already stores predicted against observed
 * for every (intervention, marker) pair a projection closed. Two resolved
 * cycles of "cut added sugar → HbA1c" are not evidence about anybody else, but
 * they are the best evidence there is about you, so they are folded back into
 * your own projections and nowhere else.
 *
 * Empirical Bayes toward 1: with `n` outcomes averaging a ratio `r`, the
 * multiplier is `1 + (r − 1)·n/(n+2)`, so one surprising cycle moves the
 * projection a third of the way and five move it most of the way. Clamped to
 * [0.25, 4], because no adherence-weighted average of two draws justifies
 * claiming a tenfold personal response.
 *
 * Pure. It never touches a belief, a likelihood ratio or the shared knowledge
 * base: a personal multiplier is basis `n=1` and weighs nothing outside the
 * person's own card.
 */

export interface PersonalOutcome {
  /** the delta the projection wrote down before the draw */
  predicted: number;
  /** the delta the draw actually showed, apportioned to this pair */
  observed: number;
  /** 0..1 from `habit_logs`; missing counts as full */
  adherence?: number | null;
}

export interface PersonalMultiplier {
  times: number;
  n: number;
}

/** How many outcomes before a personal ratio is allowed to say anything. */
export const MIN_OUTCOMES = 2;

/** The shrinkage constant: n/(n+PRIOR_N) of the way from 1 toward the ratio. */
export const PRIOR_N = 2;

export const MULTIPLIER_CLAMP: [number, number] = [0.25, 4];

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The adherence-weighted, shrunk ratio of observed to predicted for one pair.
 *
 * A prediction of zero says nothing about a response, so those rows are
 * dropped rather than divided by. Null under `MIN_OUTCOMES` usable rows.
 */
export function personalMultiplier(
  outcomes: PersonalOutcome[],
): PersonalMultiplier | null {
  const usable = outcomes.filter(
    (o) =>
      Number.isFinite(o.predicted) &&
      o.predicted !== 0 &&
      Number.isFinite(o.observed),
  );
  if (usable.length < MIN_OUTCOMES) return null;

  let weighted = 0;
  let weight = 0;
  for (const o of usable) {
    const w = Math.min(1, Math.max(0, o.adherence ?? 1));
    // Nobody's zero-adherence cycle is evidence of anything, but a set of them
    // must not divide by zero either: they simply carry no weight.
    weighted += (o.observed / o.predicted) * w;
    weight += w;
  }
  if (weight === 0) return null;

  const n = usable.length;
  const ratio = weighted / weight;
  const shrunk = 1 + (ratio - 1) * (n / (n + PRIOR_N));
  const times = Math.min(
    MULTIPLIER_CLAMP[1],
    Math.max(MULTIPLIER_CLAMP[0], shrunk),
  );
  return { times: round2(times), n };
}

/** `cut added sugar -> hba1c`, the key `intervention_outcomes.pair` carries. */
export const pairKey = (intervention: string, code: string): string =>
  `${intervention} -> ${code}`;

/**
 * The line the card prints when a multiplier is applied.
 *
 * It says three things on purpose: how many of your own cycles it is built
 * from, which way they ran, and that it is basis `n=1` — it moves this
 * projection and nothing else.
 */
export const personalLine = (
  intervention: string,
  m: PersonalMultiplier,
): string =>
  `your own last ${m.n} response${m.n === 1 ? "" : "s"} to ${intervention} ran ` +
  `${m.times}× the literature, so it is scaled by that here ` +
  `(n=1 evidence, weighs nothing outside your projections)`;

/** Multipliers by pair key, from every outcome the person has closed. */
export function personalMultipliers(
  rows: (PersonalOutcome & { pair: string })[],
): Record<string, PersonalMultiplier> {
  const byPair = new Map<string, PersonalOutcome[]>();
  for (const r of rows) byPair.set(r.pair, [...(byPair.get(r.pair) ?? []), r]);
  const out: Record<string, PersonalMultiplier> = {};
  for (const [pair, outcomes] of byPair) {
    const m = personalMultiplier(outcomes);
    if (m) out[pair] = m;
  }
  return out;
}
