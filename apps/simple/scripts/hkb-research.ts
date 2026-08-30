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
import { recordRun, took } from "@/lib/hkb-import";
import {
  featuresFor,
  researchCondition,
  researchInterventions,
  saveInterventions,
  saveProposals,
  thinnestConditions,
  TOKEN_BUDGET,
  type ConditionRef,
  type RunCounts,
} from "@/lib/research";

export interface ResearchRunRow extends RunCounts {
  conditionId: string;
  name: string;
  written: number;
}

/** The conditions asked for, or the ten with the least evidence behind them. */
async function conditionsOf(ids: string[]): Promise<ConditionRef[]> {
  if (!ids.length) return thinnestConditions(10);
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
}: {
  conditionIds?: string[];
  maxPapers?: number;
  modelId?: string;
  /** The two "what might help" searches. Off for a diagnostics-only run. */
  interventions?: boolean;
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
    const { rows: proposals, mints, counts } = await researchCondition(
      condition,
      features,
      {
        maxPapers,
        modelId,
        spent,
        onEstimate: (tokens, papers) =>
          console.log(
            `[hkb:research] ${condition.id}: ${papers} verified papers, ~${tokens} tokens ` +
              `(${spent + tokens} of ${TOKEN_BUDGET} used after this)`,
          ),
      },
    );
    spent += counts.tokens;
    const { written, minted } = await saveProposals(
      condition.id,
      proposals,
      mints,
    );

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

    rows.push({
      ...counts,
      conditionId: condition.id,
      name: condition.name,
      written,
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
        written,
        tokens: counts.tokens,
      },
      `${condition.id}: ${counts.verified} verified papers of ${counts.hits} hits, ` +
        `${counts.proposed} proposals (${written} new, ${counts.rejected} rejected by policy, ` +
        `${counts.needsLook} flagged, ${minted} features minted, ${counts.unmapped} unmapped, ` +
        `${counts.skipped} without usable numbers), ${helped} interventions, ` +
        `${took(Date.now() - at)}`,
    );

    if (spent >= TOKEN_BUDGET) {
      console.log(
        `[hkb:research] stopping: ${spent} tokens spent, budget ${TOKEN_BUDGET}`,
      );
      break;
    }
  }

  return { rows, tokens: spent, ms: Date.now() - started };
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

  const { pool } = await import("@/db");
  researchRun({ conditionIds, maxPapers, interventions })
    .then(({ rows, tokens, ms }) => {
      console.log(
        "\ncondition            hits  verified  extracted  proposed  new  rej  look  mint  interv  tokens",
      );
      for (const r of rows)
        console.log(
          `${r.conditionId.padEnd(20)} ${String(r.hits).padStart(4)} ` +
            `${String(r.verified).padStart(9)} ${String(r.extracted).padStart(10)} ` +
            `${String(r.proposed).padStart(9)} ${String(r.written).padStart(4)} ` +
            `${String(r.rejected).padStart(4)} ${String(r.needsLook).padStart(5)} ` +
            `${String(r.minted).padStart(5)} ${String(r.interventions).padStart(7)} ` +
            `${String(r.tokens).padStart(7)}`,
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
