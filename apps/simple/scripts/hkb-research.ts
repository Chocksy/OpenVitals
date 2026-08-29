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
    .select({ id: hkbConditions.id, name: hkbConditions.name })
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
}: {
  conditionIds?: string[];
  maxPapers?: number;
  modelId?: string;
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
    const { rows: proposals, counts } = await researchCondition(
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
    const written = await saveProposals(condition.id, proposals);
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
        written,
        tokens: counts.tokens,
      },
      `${condition.id}: ${counts.verified} verified papers of ${counts.hits} hits, ` +
        `${counts.proposed} proposals (${written} new, ${counts.unmapped} unmapped features, ` +
        `${counts.skipped} without usable numbers), ${took(Date.now() - at)}`,
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

  const { pool } = await import("@/db");
  researchRun({ conditionIds, maxPapers })
    .then(({ rows, tokens, ms }) => {
      console.log(
        "\ncondition            hits  papers  verified  extracted  proposed  new  tokens",
      );
      for (const r of rows)
        console.log(
          `${r.conditionId.padEnd(20)} ${String(r.hits).padStart(4)} ${String(r.papers).padStart(7)} ` +
            `${String(r.verified).padStart(9)} ${String(r.extracted).padStart(10)} ` +
            `${String(r.proposed).padStart(9)} ${String(r.written).padStart(4)} ${String(r.tokens).padStart(7)}`,
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
