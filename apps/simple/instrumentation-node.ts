/**
 * The Node half of `instrumentation.ts`. Kept in its own file so the Edge
 * build never traces the import scripts and their `node:` modules; the
 * runtime check in `instrumentation.ts` is inlined at build time.
 */
/**
 * The daily curator pass, the 30-day plan refresh, the Monday weekly review,
 * and the knowledge base reading papers on its own.
 *
 * ponytail: in-process timer; move to an external cron if there is ever more
 * than one web replica. Every branch is guarded by `hkb_import_runs`, so a
 * restart never re-runs anything that already ran this month or this year.
 */
const DAY = 24 * 60 * 60 * 1000;
const FIRST_RUN = 5 * 60 * 1000;

/** How often the knowledge base re-reads the literature, and re-imports. */
const RESEARCH_EVERY_DAYS = 30;
const IMPORT_EVERY_DAYS = 365;
/** Monarch is a live API, not a 100 MB download, so it can run monthly. */
const MONARCH_EVERY_DAYS = 30;

/** Papers per condition on a scheduled pass. The manual run asks for more. */
const MAX_PAPERS = 10;

/**
 * The monthly sweep over the whole catalog, then the queue somebody's
 * differential filled during the month, then the policy over everything that
 * is still `proposed`, then the graph imports. Nothing here waits for a click.
 *
 * The mechanism search rides inside `researchRun`, after the evidence and
 * intervention searches for each condition, so one pass over the catalog does
 * all three.
 */
async function knowledge() {
  const { dueAgain } = await import("@/lib/hkb-import");
  const { takeQueuedResearch } = await import("@/lib/research");
  const { researchRun } = await import("@/scripts/hkb-research");
  const { runPolicy } = await import("@/scripts/hkb-policy");

  const monthly = await dueAgain("hkb-research", RESEARCH_EVERY_DAYS);
  const onDemand = takeQueuedResearch();

  if (monthly) {
    const { getDb, hkbConditions } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const rows = await getDb()
      .select({ id: hkbConditions.id })
      .from(hkbConditions)
      .where(eq(hkbConditions.inCatalog, true));
    const { rows: done, tokens } = await researchRun({
      conditionIds: rows.map((r) => r.id),
      maxPapers: MAX_PAPERS,
    });
    console.log(
      `[hkb:research] monthly pass over ${done.length} condition(s), ${tokens} tokens`,
    );
  } else if (onDemand.length) {
    const { rows: done } = await researchRun({
      conditionIds: onDemand,
      maxPapers: MAX_PAPERS,
    });
    console.log(
      `[hkb:research] on demand: ${onDemand.join(", ")} (${done.length} read)`,
    );
  }

  if (monthly || onDemand.length) {
    const { counts, applied } = await runPolicy({ apply: true });
    console.log(
      `[hkb:policy] ${applied} rows decided: ${counts.accepted} accepted, ` +
        `${counts.review} flagged, ${counts.rejected} rejected`,
    );
  }

  if (await dueAgain("kg-import-monarch", MONARCH_EVERY_DAYS)) {
    const { importMonarch } = await import("@/scripts/kg-import-monarch");
    const r = await importMonarch();
    console.log(
      `[kg:import:monarch] ${r.conditions} conditions, ${r.edges} new edges ` +
        `(${r.phenotype_edges} phenotype, ${r.gene_edges} gene)`,
    );
  }

  for (const [script, load] of [
    ["hkb-import-priors", () => import("@/scripts/hkb-import-priors")],
    ["hkb-import-prices", () => import("@/scripts/hkb-import-prices")],
  ] as const) {
    if (!(await dueAgain(script, IMPORT_EVERY_DAYS))) continue;
    const mod = await load();
    const run = "importPriors" in mod ? mod.importPriors : mod.importPrices;
    console.log(`[${script}] yearly run:`, await run());
  }
}

export function start() {

  const tick = async () => {
    try {
      const { runCuratorForAllUsers } = await import("@/lib/curator");
      const users = await runCuratorForAllUsers("daily");
      console.log(`[curator] daily pass over ${users} user(s)`);

      const { generateStaleReports } = await import("@/lib/report");
      const plans = await generateStaleReports();
      console.log(`[plan] generated ${plans} report(s)`);

      if (new Date().getDay() === 1) {
        const { generateWeeklyForAllUsers } = await import("@/lib/ai");
        const n = await generateWeeklyForAllUsers();
        console.log(`[weekly] generated ${n} review(s)`);
      }
    } catch (e) {
      console.error("[curator] daily pass failed:", e);
    }

    try {
      await knowledge();
    } catch (e) {
      console.error("[hkb] scheduled pass failed:", e);
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), DAY).unref?.();
  }, FIRST_RUN).unref?.();
}
