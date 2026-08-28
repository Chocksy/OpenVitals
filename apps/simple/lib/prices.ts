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

/**
 * Nominal euros for an unpriced cost band, so priced and unpriced moves rank on
 * one scale. ponytail: rough Western European list prices; replaced row by row
 * as real prices arrive.
 */
export const BAND_EUR: Record<number, number> = { 0: 0, 1: 10, 2: 30, 3: 80, 4: 300 };

/** Gain per euro on one scale: a real price, else the band's nominal price. Questions sit on the MIN_EUR floor. */
export const ratioOf = (gain: number, cost: number, priced: boolean): number =>
  gain / Math.max(priced ? cost : (BAND_EUR[cost] ?? cost * 30), MIN_EUR);

/** "€57" — how a price prints. Bands print as "cost 2". */
export const money = (eur: number): string =>
  `€${eur >= 100 ? Math.round(eur) : eur.toFixed(eur % 1 === 0 ? 0 : 2)}`;
