/**
 * Europe PMC into proposed likelihood ratios, one condition at a time.
 *
 *   pnpm --filter simple hkb:research                        # the 10 thinnest
 *   pnpm --filter simple hkb:research hashimoto --max-papers 10
 *
 * Every row lands as `status = "proposed"` with the paper and a verbatim quote
 * attached, for a human to accept, edit or reject on /hkb. Nothing here can
 * change a score on its own.
 *
 * Cost: the estimate is printed before the first LLM call and the run stops as
 * soon as the running total would pass `TOKEN_BUDGET` (200 000).
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, hkbConditions } from "@/db";
import { recordRevision } from "@/lib/hkb";
import { lastRun, recordRun, took } from "@/lib/hkb-import";
import { freshnessLine } from "@/lib/freshness";
import {
  conditionFreshness,
  featuresFor,
  GUIDELINE_SCRIPT,
  researchCondition,
  researchGuidelines,
  researchInterventions,
  researchMechanisms,
  saveGuidelineReviews,
  saveInterventions,
  saveMechanisms,
  saveProposals,
  staleConditions,
  TOKEN_BUDGET,
  watchWindow,
  type ConditionRef,
  type RunCounts,
} from "@/lib/research";

export interface ResearchRunRow extends RunCounts {
  conditionId: string;
  name: string;
  written: number;
  /** Edges extracted, and edges that were new to `kg_edges`. */
  mechanisms: number;
  mechanismsNew: number;
}

/** A skipped diagnostic-accuracy pass still has to report zeroes. */
const EMPTY_COUNTS = (): RunCounts => ({
  hits: 0,
  papers: 0,
  verified: 0,
  extracted: 0,
  proposed: 0,
  rejected: 0,
  needsLook: 0,
  minted: 0,
  interventions: 0,
  skipped: 0,
  unmapped: 0,
  tokens: 0,
});

/**
 * The conditions asked for, or the ten stalest.
 *
 * Phase 22: the pick is by staleness class, not by row count, and it prints
 * why it picked each one so /hkb Activity and the console say the same thing.
 * Contested ids are always first, and a condition with fewer than three rows is
 * infinitely stale, so the old thin-first behaviour survives inside the new
 * ordering.
 */
async function conditionsOf(ids: string[]): Promise<ConditionRef[]> {
  if (!ids.length) {
    const picks = await staleConditions(10);
    console.log("[hkb:research] the pick, stalest first:");
    for (const p of picks) console.log(`  ${freshnessLine(p)}`);
    return picks;
  }
  const rows = await getDb()
    .select({
      id: hkbConditions.id,
      name: hkbConditions.name,
      inCatalog: hkbConditions.inCatalog,
    })
    .from(hkbConditions)
    .where(
      ids.length === 1
        ? eq(hkbConditions.id, ids[0]!)
        : inArray(hkbConditions.id, ids),
    );
  return rows;
}

export async function researchRun({
  conditionIds = [],
  maxPapers = 20,
  modelId,
  interventions = true,
  mechanisms = true,
  evidence = true,
}: {
  conditionIds?: string[];
  maxPapers?: number;
  modelId?: string;
  /** The two "what might help" searches. Off for a diagnostics-only run. */
  interventions?: boolean;
  /** The third search: what moves what, into `kg_edges`. */
  mechanisms?: boolean;
  /** The diagnostic-accuracy search. Off for a mechanisms-only run. */
  evidence?: boolean;
} = {}): Promise<{ rows: ResearchRunRow[]; tokens: number; ms: number }> {
  const started = Date.now();
  const conditions = await conditionsOf(conditionIds);
  const rows: ResearchRunRow[] = [];
  let spent = 0;

  for (const condition of conditions) {
    const at = Date.now();
    const features = await featuresFor(condition.id);
    if (!features.length) {
      console.log(`[hkb:research] ${condition.id}: no features, skipped`);
      continue;
    }
    const {
      rows: proposals,
      mints,
      counts,
    } = evidence
      ? await researchCondition(condition, features, {
          maxPapers,
          modelId,
          spent,
          onEstimate: (tokens, papers) =>
            console.log(
              `[hkb:research] ${condition.id}: ${papers} verified papers, ~${tokens} tokens ` +
                `(${spent + tokens} of ${TOKEN_BUDGET} used after this)`,
            ),
        })
      : { rows: [], mints: [], counts: EMPTY_COUNTS() };
    spent += counts.tokens;
    const { written, minted } = evidence
      ? await saveProposals(condition.id, proposals, mints)
      : { written: 0, minted: 0 };

    let helped = 0;
    if (interventions) {
      const help = await researchInterventions(condition, features, {
        maxPapers,
        modelId,
      });
      spent += help.tokens;
      counts.tokens += help.tokens;
      helped = await saveInterventions(help.rows);
    }
    counts.interventions = helped;
    counts.minted = minted;

    let edges = 0;
    let edgesNew = 0;
    if (mechanisms) {
      const found = await researchMechanisms(condition, features, {
        maxPapers,
        modelId,
      });
      spent += found.counts.tokens;
      counts.tokens += found.counts.tokens;
      edges = found.rows.length;
      edgesNew = await saveMechanisms(found.rows);
      console.log(
        `[hkb:research] ${condition.id}: ${found.counts.verified} mechanism papers, ` +
          `${found.counts.extracted} claims, ${edges} edges (${found.counts.parsed} with a ` +
          `parsed when, ${found.counts.unresolved} endpoints unresolved), ${edgesNew} new`,
      );
    }

    rows.push({
      ...counts,
      conditionId: condition.id,
      name: condition.name,
      written,
      mechanisms: edges,
      mechanismsNew: edgesNew,
    });

    await recordRun(
      "hkb-research",
      {
        hits: counts.hits,
        papers: counts.papers,
        verified: counts.verified,
        extracted: counts.extracted,
        proposed: counts.proposed,
        rejected: counts.rejected,
        needsLook: counts.needsLook,
        minted,
        interventions: helped,
        mechanisms: edges,
        mechanismsNew: edgesNew,
        written,
        tokens: counts.tokens,
      },
      `${condition.id}: ${counts.verified} verified papers of ${counts.hits} hits, ` +
        `${counts.proposed} proposals (${written} new, ${counts.rejected} rejected by policy, ` +
        `${counts.needsLook} flagged, ${minted} features minted, ${counts.unmapped} unmapped, ` +
        `${counts.skipped} without usable numbers), ${helped} interventions, ` +
        `${edges} mechanism edges (${edgesNew} new), ${took(Date.now() - at)}`,
    );

    if (spent >= TOKEN_BUDGET) {
      console.log(
        `[hkb:research] stopping: ${spent} tokens spent, budget ${TOKEN_BUDGET}`,
      );
      break;
    }
  }

  const changed = rows.reduce((sum, r) => sum + (r.written ?? 0), 0);
  if (changed)
    await recordRevision(
      `research run over ${rows.map((r) => r.conditionId).join(", ")}: ${changed} new evidence rows ` +
        `from ${rows.reduce((sum, r) => sum + (r.verified ?? 0), 0)} verified papers`,
    );

  return { rows, tokens: spent, ms: Date.now() - started };
}

/**
 * The quarterly guideline watch: search only, no LLM, no accepted row touched.
 *
 * Every ring-1 condition is searched for guidelines, practice guidelines and
 * consensus statements published since the last watch. A hit changes nothing by
 * itself — it lands as a `review` row with `needs_look`, which is how /hkb asks
 * a human to check the gates and thresholds that live in code.
 */
export async function guidelineWatch(
  conditionIds: string[] = [],
): Promise<{ conditions: number; hits: number; written: number; ms: number }> {
  const started = Date.now();
  const all = await conditionFreshness();
  const conditions = conditionIds.length
    ? all.filter((c) => conditionIds.includes(c.id))
    : all;
  const since = watchWindow(await lastRun(GUIDELINE_SCRIPT));
  console.log(
    `[hkb:guidelines] ${conditions.length} conditions, guidelines since ${since}`,
  );

  const hits = await researchGuidelines(conditions, { since });
  const written = await saveGuidelineReviews(hits);
  for (const h of hits)
    console.log(
      `  ${h.conditionId}: ${h.paper.title} (${h.paper.year ?? "?"}) ${h.paper.url}`,
    );

  const ms = Date.now() - started;
  await recordRun(
    GUIDELINE_SCRIPT,
    { conditions: conditions.length, hits: hits.length, written },
    `guideline watch since ${since}: ${hits.length} guidelines over ` +
      `${conditions.length} conditions, ${written} new review rows, ${took(ms)}`,
  );
  return { conditions: conditions.length, hits: hits.length, written, ms };
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
  const argv = process.argv.slice(2);
  const flag = argv.indexOf("--max-papers");
  const maxPapers = flag === -1 ? 20 : Number(argv[flag + 1]);
  const conditionIds = argv.filter(
    (a, i) => !a.startsWith("--") && i !== flag + 1,
  );
  const interventions = !argv.includes("--no-interventions");
  // `--mechanisms a b` is the mechanism pass on its own, over those conditions.
  const onlyMechanisms = argv.includes("--mechanisms");
  const mechanisms = onlyMechanisms || !argv.includes("--no-mechanisms");

  const { pool } = await import("@/db");

  // `--guidelines` is the quarterly watch on its own: search and filing, no LLM.
  if (argv.includes("--guidelines")) {
    const out = await guidelineWatch(conditionIds);
    console.log(
      `\n${out.hits} guidelines over ${out.conditions} conditions, ` +
        `${out.written} new review rows, ${took(out.ms)}`,
    );
    await pool().end();
    process.exit(0);
  }

  researchRun({
    conditionIds,
    maxPapers,
    interventions: onlyMechanisms ? false : interventions,
    mechanisms,
    evidence: !onlyMechanisms,
  })
    .then(({ rows, tokens, ms }) => {
      console.log(
        "\ncondition            hits  verified  extracted  proposed  new  rej  look  mint  interv  mech  tokens",
      );
      for (const r of rows)
        console.log(
          `${r.conditionId.padEnd(20)} ${String(r.hits).padStart(4)} ` +
            `${String(r.verified).padStart(9)} ${String(r.extracted).padStart(10)} ` +
            `${String(r.proposed).padStart(9)} ${String(r.written).padStart(4)} ` +
            `${String(r.rejected).padStart(4)} ${String(r.needsLook).padStart(5)} ` +
            `${String(r.minted).padStart(5)} ${String(r.interventions).padStart(7)} ` +
            `${String(r.mechanisms).padStart(5)} ${String(r.tokens).padStart(7)}`,
        );
      console.log(`\ntotal ${tokens} tokens in ${took(ms)}`);
    })
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
