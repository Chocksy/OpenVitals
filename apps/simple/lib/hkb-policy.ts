/**
 * What happens to a proposed likelihood ratio, decided in code.
 *
 * Principle 1 of the roadmap: admin pages are windows, not queues. Nothing
 * waits for a click. `decide` is the whole gate, and it only ever says one of
 * three things:
 *
 *  - `rejected`: the row cannot be true or cannot be read (retracted paper,
 *    a feature nothing can be minted from, a unit that will not convert, a
 *    quote with no number in it, a condition that is not in the catalog).
 *  - `review`: it scores, and a human should still look. Two verified rows on
 *    the same claim that disagree by more than 3×, or a likelihood ratio past
 *    100 or under 0.01 with nothing but a small study behind it.
 *  - `accepted`: everything else.
 *
 * Pure. No database, no network, no clock.
 */
import { CATALOG } from "./hkb-catalog";
import type { Grade } from "./hypotheses";
import { conversionFactor } from "./units";
import { BOUNDS, SEX_RANGES } from "./vectors";

export type Decision = "accepted" | "review" | "held" | "rejected";

export interface PolicyInput {
  conditionId: string;
  /** null when the extractor could not map the feature to the catalog. */
  featureId: string | null;
  /** The name the paper used, for minting when `featureId` is null. */
  featureName?: string | null;
  /** The unit the paper used. */
  featureUnit?: string | null;
  /** The unit the catalog feature already carries, when there is one. */
  targetUnit?: string | null;
  conditionOn: Record<string, unknown> | null;
  lrPos: number;
  lrNeg: number | null;
  grade: Grade;
  quote: string;
  /**
   * The numbers the finding claims (LRs, sensitivity, specificity, cut-off),
   * so the quote can be checked against them. Empty when the caller only has
   * the stored row and cannot know which of them the paper printed; then only
   * "the quote carries no number at all" is checked.
   */
  numbers?: (number | null | undefined)[];
  /** Europe PMC's `retracted` flag, or a Crossref retraction update. */
  retracted?: boolean;
  conditionInCatalog: boolean;
  /**
   * The condition is a ring-2 row (phase 41C). Its rules are judged like any
   * other instead of being rejected for being out of the catalog; whether the
   * condition itself is promoted is `promoted`'s call over the whole run.
   */
  ring2?: boolean;
  /**
   * A prior modifier rather than a likelihood ratio (phase 41C). `lrPos` then
   * carries its `times`. Like a `hypothesis:` feature, it is only allowed when
   * the quote holds one of the claimed numbers.
   */
  modifier?: boolean;
  /** The likelihood ratios already verified on the same key. */
  peers?: number[];
}

/**
 * A feature the extractor could not map is only usable if it can be minted,
 * and a name is all that takes. A paper that reports a marker without printing
 * its unit still reports the marker; the unit lands with the first reading.
 */
export const mintable = (p: PolicyInput): boolean => !!p.featureName?.trim();

/** `metric:hba1c` → `hba1c`, so the unit rules that need the analyte find it. */
const codeOf = (featureId: string | null) =>
  featureId?.includes(":")
    ? featureId.split(":").slice(1).join(":")
    : undefined;

/**
 * Every number in a span of prose, including the percentages a paper writes as
 * "93%" and the ratios it writes as "0.93".
 */
export const numbersIn = (text: string): number[] =>
  (text.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((n) => Number(n.replace(",", ".")))
    .filter((n) => Number.isFinite(n));

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * Is this number in the quote? A sensitivity of 0.93 is printed as "93%" about
 * as often as "0.93", so both readings count.
 */
export const quoted = (value: number, quote: string): boolean => {
  const found = numbersIn(quote);
  return found.some(
    (n) => near(n, value) || near(n, value * 100) || near(n, value / 100),
  );
};

/** The unit the paper used has to reach the unit the catalog feature stores. */
export const unitFits = (p: PolicyInput): boolean => {
  const from = p.featureUnit?.trim();
  const to = p.targetUnit?.trim();
  if (!from || !to) return true;
  return conversionFactor(from, to, codeOf(p.featureId)) != null;
};

/**
 * The numbers a threshold on this marker can plausibly be, in the marker's own
 * unit: the curator's physiological bounds first, then the sex-adjusted
 * optimal band, then whatever the catalog's own rules already cut on. The last
 * two are widened to a tenth and ten times, because a cut-off is allowed to
 * sit well outside the normal range (ferritin 1000, calcium 11.5) while a
 * wrong unit lands an order of magnitude away or more. A tenth rather than a
 * twentieth on purpose: the catalog's lowest glucose cut-off is 100 mg/dL, and
 * a twentieth of it would still admit the 6.3 mmol/L that started all this.
 */
export function plausibleBand(code: string): [number, number] | null {
  const bound = BOUNDS[code];
  if (bound) return bound;
  const wide = (values: number[]): [number, number] | null =>
    values.length ? [Math.min(...values) * 0.1, Math.max(...values) * 10] : null;

  const sex = SEX_RANGES[code];
  if (sex) {
    const band = wide(
      Object.values(sex)
        .flat()
        .filter((v): v is number => v != null && v > 0),
    );
    if (band) return band;
  }

  const cuts: number[] = [];
  for (const h of CATALOG) {
    for (const e of h.evidence) {
      if (e.input.metric !== code) continue;
      for (const key of ["above", "below"] as const) {
        const v = e.when[key];
        if (typeof v === "number" && v > 0) cuts.push(v);
      }
    }
    for (const d of h.discriminators)
      if (d.codes.includes(code))
        for (const v of [d.typicalPos, d.typicalNeg])
          if (typeof v === "number" && v > 0) cuts.push(v);
  }
  return wide(cuts);
}

/** A cut-off the marker could never take is a unit error, not a finding. */
export const thresholdPlausible = (p: PolicyInput): boolean => {
  const code = codeOf(p.featureId);
  if (!code || !p.conditionOn) return true;
  const band = plausibleBand(code);
  if (!band) return true;
  for (const key of ["above", "below"] as const) {
    const v = p.conditionOn[key];
    if (typeof v !== "number" || v <= 0) continue;
    if (v < band[0] || v > band[1]) return false;
  }
  return true;
};

/** More than 3× apart, in either direction. */
export const disagree = (values: number[]): boolean => {
  const usable = values.filter((v) => Number.isFinite(v) && v > 0);
  if (usable.length < 2) return false;
  return Math.max(...usable) / Math.min(...usable) > 3;
};

/** Past 100 or under 0.01: believable out of a meta-analysis, not out of a series. */
const extreme = (lr: number | null) =>
  lr != null && Number.isFinite(lr) && (lr > 100 || lr < 0.01);

export function decide(p: PolicyInput): Decision {
  return judge(p).decision;
}

/** `decide`, with the one line that says which check settled it. */
export function judge(p: PolicyInput): { decision: Decision; reason: string } {
  const say = (decision: Decision, reason: string) => ({ decision, reason });
  if (p.retracted) return say("rejected", "retracted paper");
  if (!p.conditionInCatalog && !p.ring2)
    return say("rejected", "condition not in the catalog");
  if (!p.featureId && !mintable(p))
    return say("rejected", "feature neither mapped nor mintable");
  if (!unitFits(p)) return say("held", "unit will not convert");
  if (!thresholdPlausible(p))
    return say("held", "threshold outside what the marker can take");

  const claimed = (p.numbers ?? []).filter(
    (n): n is number => n != null && Number.isFinite(n),
  );
  if (!numbersIn(p.quote).length) return say("rejected", "quote has no number");
  if (claimed.length && !claimed.some((n) => quoted(n, p.quote)))
    return say("rejected", "claimed numbers are not in the quote");
  // A chained rule or a prior modifier is only as good as the number the
  // paper printed for it: without a claimed number there is nothing to check.
  const chained = p.featureId?.startsWith("hypothesis:") || p.modifier;
  if (chained && !claimed.some((n) => quoted(n, p.quote)))
    return say(
      "rejected",
      `${p.modifier ? "modifier" : "hypothesis: rule"} without its number in the quote`,
    );

  if (disagree([p.lrPos, ...(p.peers ?? [])]))
    return say("review", "disagrees with a verified row by more than 3x");
  if (p.grade !== "A" && (extreme(p.lrPos) || extreme(p.lrNeg)))
    return say("review", "extreme LR outside a grade A source");

  return say("accepted", "passed every check");
}

/**
 * The ring-2 conditions a run promotes (phase 41C): those with at least one
 * grade A or B rule accepted in the same run. A condition with only C rules
 * stays dormant, and its rules with it.
 */
export function promoted(
  judged: { conditionId: string; ring2?: boolean; grade: Grade; decision: Decision }[],
): Set<string> {
  return new Set(
    judged
      .filter(
        (j) =>
          j.ring2 &&
          j.decision === "accepted" &&
          (j.grade === "A" || j.grade === "B"),
      )
      .map((j) => j.conditionId),
  );
}

/** The row status a decision writes, and whether the admin gets a chip. */
export const statusOf = (
  d: Decision,
): { status: string; needsLook: boolean } =>
  d === "rejected"
    ? { status: "rejected", needsLook: false }
    : d === "held"
      ? { status: "review", needsLook: true }
      : { status: "accepted", needsLook: d === "review" };
