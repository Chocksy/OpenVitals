/**
 * The three rings, and the arithmetic that puts a disease in one of them.
 *
 *  - **Ring 1** is the catalog: scored for everyone, every time. `hkb_conditions`
 *    with `ring = 1`.
 *  - **Ring 2** is dormant: a row in `hkb_conditions` with `ring = 2` and
 *    `in_catalog = false`, a name, a MONDO id and a rarity-class prior, and
 *    nothing else until something in one person's data wakes it
 *    (`user_conditions`).
 *  - **Ring 3** is `hkb_terms`: every HPO and MONDO name there is. Searchable,
 *    linkable, never scored.
 *
 * Pure. No database, no clock, no network.
 */

export type Rarity = "common" | "rare" | "ultra_rare";

/**
 * The base rate a ring-2 disease wakes with, before sex, age and any evidence.
 * Three orders of magnitude apart on purpose: the point is not to be right
 * about one disease, it is to keep a one-in-a-million syndrome from out-scoring
 * a one-in-a-thousand one on the same two symptoms.
 */
export const RARITY_PRIOR: Record<Rarity, number> = {
  common: 1e-3,
  rare: 1e-5,
  ultra_rare: 1e-7,
};

export const RARITY_SOURCE: Record<Rarity, string> = {
  common:
    "Orphanet point-prevalence class at or above 1 in 10 000 (en_product9_prev.xml, CC-BY-4.0). Grade C: the class is a band, 1e-3 is its order of magnitude.",
  rare: "Orphanet point-prevalence class between 1 in 100 000 and 1 in 1 000 000, or an Orphanet listing with no published class — Orphanet only lists diseases under 1 in 2 000 (EU definition, Regulation (EC) No 141/2000). Grade C: 1e-5 is the order of magnitude of that band.",
  ultra_rare:
    "Orphanet point-prevalence class under 1 in 1 000 000, or no Orphanet listing at all: an OMIM phenotype known from single families. Grade C: 1e-7 is the order of magnitude, not a measured rate.",
};

/**
 * One Orphanet prevalence class as a number, at the middle of its band.
 * The strings are exactly as the file prints them, non-breaking spaces and all,
 * so the caller normalises whitespace before looking one up.
 */
export const ORPHANET_CLASS: Record<string, number> = {
  ">1 / 1000": 2e-3,
  "6-9 / 10 000": 7.5e-4,
  "1-5 / 10 000": 3e-4,
  "1-9 / 100 000": 5e-5,
  "1-9 / 1 000 000": 5e-6,
  "<1 / 1 000 000": 5e-7,
};

/** Collapse whitespace, so "1-9 /  100 000" and the non-breaking kind match. */
export const normaliseClass = (raw: string): string =>
  raw.replace(/[\s ]+/g, " ").trim();

/**
 * The rarity class a prevalence falls in: whichever of the three priors it is
 * nearest to in log space, which is the only scale a prevalence should ever be
 * compared on.
 */
export function rarityFor(prevalence: number): Rarity {
  let best: Rarity = "rare";
  let bestGap = Infinity;
  for (const [name, prior] of Object.entries(RARITY_PRIOR) as [
    Rarity,
    number,
  ][]) {
    const gap = Math.abs(Math.log(prevalence) - Math.log(prior));
    if (gap < bestGap) ((bestGap = gap), (best = name));
  }
  return best;
}

/**
 * The class for one ring-2 disease. An Orphanet class decides it when there is
 * one. Without one, an Orphanet listing still means rare by definition, and no
 * listing at all means an OMIM phenotype nobody has counted.
 */
export function rarityOf(
  orphanetClass: string | null | undefined,
  hasOrphanetXref: boolean,
): Rarity {
  const prevalence = orphanetClass
    ? ORPHANET_CLASS[normaliseClass(orphanetClass)]
    : undefined;
  if (prevalence != null) return rarityFor(prevalence);
  return hasOrphanetXref ? "rare" : "ultra_rare";
}

/** "MONDO:0007739" → "mondo_0007739", the `hkb_conditions.id` of a ring-2 row. */
export const ring2Id = (mondoId: string): string =>
  mondoId.toLowerCase().replace(/[^a-z0-9]+/g, "_");

/** The rarity class a stored ring-2 prior came from, for counting them back. */
export const rarityOfPrior = (prevalence: number): Rarity =>
  rarityFor(prevalence);
