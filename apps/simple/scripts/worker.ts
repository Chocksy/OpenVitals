/**
 * The scheduled jobs, run once and then exit: the daily curator pass, the
 * 30-day plan refresh, the Monday weekly review, and the knowledge base
 * reading papers on its own. `pnpm worker`, once a day, from cron or a
 * Coolify scheduled task.
 *
 * It used to be a timer inside the web server, which then carried the import
 * scripts and the research pipeline in memory. The research and import
 * branches are guarded by `hkb_import_runs`, so a second run never re-reads
 * or re-imports anything that already ran this month or this year.
 */
export {};

for (const f of [".env", "../../.env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* optional: production passes the environment in */
  }
}

/** How often the knowledge base re-reads the literature, and re-imports. */
const RESEARCH_EVERY_DAYS = 30;
const IMPORT_EVERY_DAYS = 365;
/** Monarch is a live API, not a 100 MB download, so it can run monthly. */
const MONARCH_EVERY_DAYS = 30;

/** Papers per condition on a scheduled pass. The manual run asks for more. */
const MAX_PAPERS = 10;

/** The curator over everyone, stale plans, and Monday's weekly review. */
async function daily() {
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
}

/**
 * The monthly sweep over the whole catalog, then the queue somebody's
 * differential filled since the last run, then the policy over everything that
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
  const onDemand = await takeQueuedResearch();

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

try {
  await daily();
} catch (e) {
  console.error("[curator] daily pass failed:", e);
  process.exitCode = 1;
}

try {
  await knowledge();
} catch (e) {
  console.error("[hkb] scheduled pass failed:", e);
  process.exitCode = 1;
}

const { pool } = await import("@/db");
await pool().end();
process.exit();
