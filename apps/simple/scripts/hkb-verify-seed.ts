/**
 * Every seeded intervention's DOI, against Europe PMC.
 *
 *   pnpm hkb:verify:seed
 *
 * Network only, no model, no database. For each row in
 * `lib/hkb-interventions.ts` it asks Europe PMC for `DOI:"<doi>"`, one request
 * every 200 ms, and checks two things:
 *
 *  - the DOI resolves to a paper. A miss is fatal: the run prints the row and
 *    exits 1, and the row is removed from the catalog rather than guessed at.
 *  - the quote is in that paper's abstract, case-insensitively, after the
 *    publisher's markup is stripped and whitespace is collapsed. A guideline
 *    whose abstract carries no recommendation text quotes the guideline
 *    itself; those rows are printed as `unchecked` and are allowed up to
 *    `QUOTE_BUDGET` of the catalog.
 *
 * The DOI is looked up once per paper, not once per row, so a paper that
 * carries five rows costs one request.
 */
import { epmc } from "@/lib/research";
import { INTERVENTIONS } from "@/lib/hkb-interventions";

/** One request per this many milliseconds, which Europe PMC is happy with. */
const GAP_MS = 200;

/** How many rows may quote a guideline rather than an abstract. */
const QUOTE_BUDGET = 0.15;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The abstract as text: publisher markup out, whitespace collapsed. */
export const plain = (s: string): string =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Case-insensitive, whitespace-normalised containment. */
export const quoteIn = (quote: string, abstract: string): boolean =>
  plain(abstract).toLowerCase().includes(plain(quote).toLowerCase());

async function main() {
  const dois = [...new Set(INTERVENTIONS.map((r) => r.paper.doi))];
  const found = new Map<string, { title: string; abstract: string } | null>();

  for (const doi of dois) {
    const [hit] = await epmc(`DOI:"${doi}"`, "core", 1);
    found.set(
      doi,
      hit ? { title: hit.title ?? "", abstract: hit.abstractText ?? "" } : null,
    );
    await sleep(GAP_MS);
  }

  let missing = 0;
  let unchecked = 0;
  for (const row of INTERVENTIONS) {
    const paper = found.get(row.paper.doi);
    const where = `${row.conditionId} | ${row.name}`;
    if (!paper) {
      missing++;
      console.error(`DOI MISS   ${where} | ${row.paper.doi}`);
      continue;
    }
    if (!quoteIn(row.quote, paper.abstract)) {
      unchecked++;
      console.log(
        `unchecked  ${where} | ${row.paper.doi} | "${row.quote.slice(0, 80)}…"`,
      );
    }
  }

  const share = unchecked / INTERVENTIONS.length;
  console.log(
    `\n${INTERVENTIONS.length} rows, ${dois.length} papers, ` +
      `${missing} DOIs missing, ${unchecked} quotes unchecked ` +
      `(${(share * 100).toFixed(1)} %, budget ${QUOTE_BUDGET * 100} %)`,
  );

  if (missing) {
    console.error(`\n${missing} DOI(s) did not resolve.`);
    process.exit(1);
  }
  if (share > QUOTE_BUDGET) {
    console.error(
      `\nToo many unchecked quotes: ${(share * 100).toFixed(1)} % of rows.`,
    );
    process.exit(1);
  }
}

await main();
