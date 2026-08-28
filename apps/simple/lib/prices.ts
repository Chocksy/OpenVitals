/**
 * What a test costs, in euros, where we know.
 *
 * `hkb_tests.cost` stays what it always was: a 1–4 band for "cheap blood,
 * special blood, imaging, invasive". `hkb_tests.cost_by_country` is the real
 * list price in euros, keyed by ISO-3166 alpha-2, written by
 * `scripts/hkb-import-prices.ts` from `data/hkb/prices-ro.csv`. When the person
 * has told us their country and we have a price for it, the path ranks by
 * information gain per euro; otherwise it ranks by gain per cost band exactly
 * as before.
 *
 * Pure. No database, no network.
 */
import type { Discriminator } from "./hypotheses";

/**
 * European Central Bank euro reference rates, 27 August 2026.
 * https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 */
export const PER_EUR: Record<string, number> = { RON: 5.2584 };

/** Which currency a country's list prices are quoted in. */
export const CURRENCY: Record<string, string> = { RO: "RON" };

export const toEur = (amount: number, currency: string): number =>
  Math.round((amount / (PER_EUR[currency] ?? 1)) * 100) / 100;

/** The euro list price of this test for this person, or null. */
export const priceOf = (
  d: Pick<Discriminator, "costByCountry">,
  country: string | null,
): number | null => (country ? (d.costByCountry?.[country] ?? null) : null);

/**
 * ponytail: the floor under a priced test. Without it a €3 uric acid would
 * out-rank everything on arithmetic rather than on usefulness, the same way
 * the 0.5 floor stops a free question dominating the unpriced ranking.
 */
export const MIN_EUR = 5;

/** Gain per euro when the test has a price, gain per cost band when it does not. */
export const ratioOf = (gain: number, cost: number, priced: boolean): number =>
  gain / Math.max(cost, priced ? MIN_EUR : 0.5);

/** "€57" — how a price prints. Bands print as "cost 2". */
export const money = (eur: number): string =>
  `€${eur >= 100 ? Math.round(eur) : eur.toFixed(eur % 1 === 0 ? 0 : 2)}`;
