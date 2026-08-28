/**
 * Romanian lab list prices into `hkb_tests.cost_by_country`.
 *
 *   pnpm --filter simple hkb:import:prices
 *   pnpm --filter simple hkb:import:prices --offline
 *
 * Reads `data/hkb/prices-ro.csv`, which is maintained by hand and committed
 * (the only file under `data/hkb/` that is). Columns:
 *
 *   test_id, lab, price_ron, url, checked_at
 *
 * One row per (test, lab); the cheapest lab wins when several quote the same
 * test. RON is converted to euros with the ECB reference rate in
 * `lib/prices.ts`, and the euro figure is what goes in the column, so the
 * engine never has to know about currencies.
 *
 * Checked 2026-08-28: only Synevo publishes a per-test list price on an open
 * page (www.synevo.ro/shop/<slug>/). MedLife's public analysis glossary
 * carries no prices, and www.reginamaria.ro serves a 4.7 KB shell to anything
 * that is not a full browser session, so neither is scriptable. The `lab`
 * column is there for when that changes.
 */
import { eq } from "drizzle-orm";
import path from "node:path";
import { getDb, hkbTests } from "@/db";
import { CACHE, FIXTURES, columnOf, offline, readCsv, recordRun, took } from "@/lib/hkb-import";
import { CURRENCY, toEur } from "@/lib/prices";

const COUNTRY = "RO";

export async function importPrices() {
  const started = Date.now();
  const file = path.join(offline() ? FIXTURES : CACHE, "prices-ro.csv");
  const { header, rows } = await readCsv(file);
  const at = {
    test: columnOf(header, "test_id"),
    lab: columnOf(header, "lab"),
    price: columnOf(header, "price_ron"),
    url: columnOf(header, "url"),
    checked: columnOf(header, "checked_at"),
  };
  if (Object.values(at).some((i) => i === -1))
    throw new Error(`${file} needs test_id, lab, price_ron, url, checked_at`);

  /** The cheapest quote per test, in euros. */
  const cheapest = new Map<string, { eur: number; lab: string }>();
  for (const r of rows) {
    const id = (r[at.test] ?? "").trim();
    const ron = Number(r[at.price]);
    if (!id || !Number.isFinite(ron)) continue;
    const eur = toEur(ron, CURRENCY[COUNTRY] ?? "RON");
    const found = cheapest.get(id);
    if (!found || eur < found.eur)
      cheapest.set(id, { eur, lab: (r[at.lab] ?? "").trim() });
  }

  const db = getDb();
  const known = new Set(
    (await db.select({ id: hkbTests.id }).from(hkbTests)).map((t) => t.id),
  );

  let written = 0;
  const missing: string[] = [];
  for (const [id, { eur }] of cheapest) {
    if (!known.has(id)) {
      missing.push(id);
      continue;
    }
    const [row] = await db
      .select({ costByCountry: hkbTests.costByCountry })
      .from(hkbTests)
      .where(eqId(id));
    await db
      .update(hkbTests)
      .set({ costByCountry: { ...(row?.costByCountry ?? {}), [COUNTRY]: eur } })
      .where(eqId(id));
    written++;
  }

  const ms = Date.now() - started;
  await recordRun(
    "hkb-import-prices",
    { quotes: rows.length, tests: written, unknown: missing.length },
    `prices-ro.csv, ${took(ms)}` +
      (missing.length ? `, no such test: ${missing.join(", ")}` : ""),
  );
  return { quotes: rows.length, written, missing, ms };
}

/** One `where`, written once, so the two statements above cannot drift. */
function eqId(id: string) {
  return eq(hkbTests.id, id);
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  for (const f of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(f);
    } catch {}
  }
  const { pool } = await import("@/db");
  importPrices()
    .then((r) =>
      console.log(
        `[hkb:import:prices] ${r.written} tests priced from ${r.quotes} quotes in ${took(r.ms)}` +
          (r.missing.length ? ` — no such test: ${r.missing.join(", ")}` : ""),
      ),
    )
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
