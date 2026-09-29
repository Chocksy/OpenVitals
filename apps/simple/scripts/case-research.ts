/**
 * One case research run, printed. Phase 41C.
 *
 *   pnpm --filter simple exec tsx --env-file=.env scripts/case-research.ts <userId> [asOf] [--write]
 *
 * A dry run unless `--write`: prints the summary, the queries (and the ones
 * code rejected), the papers, every proposal with its decision and reason,
 * the cost, and p before and after the overlay for a few conditions.
 */
import { readFileSync } from "node:fs";
import { pool } from "@/db";
import { buildModelInput } from "@/lib/coverage";
import { researchCase, withOverlay } from "@/lib/cases";
import { catalogFor } from "@/lib/hkb";
import { scoreHypotheses } from "@/lib/hypotheses";
import { nextMoves } from "@/lib/infogain";

const WATCH = [
  "atrophic_gastritis",
  "coeliac_disease",
  "iron_deficiency_cause_gi",
  "b12_deficiency",
];

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [userId, asOf] = args;
  if (!userId)
    throw new Error("usage: case-research.ts <userId> [asOf] [--write]");
  const dryRun = !process.argv.includes("--write");
  // a replayed day takes the replay's seed (treatments dated by the owner)
  const cases = JSON.parse(
    readFileSync(new URL("../evals/replay/cases.json", import.meta.url), "utf8"),
  ) as { users: Record<string, { seed?: Record<string, unknown> }> };
  const seed = asOf ? cases.users[userId]?.seed : undefined;

  const r = await researchCase(userId, { asOf, dryRun, seed });
  if (r.failed) console.log(`\n!! research failed: ${r.failed}; nothing judged or saved`);
  console.log(`\n== case summary (as of ${r.summary.asOf}) ==`);
  for (const i of r.summary.items) console.log(`  ${i.key} | ${i.text}`);
  console.log("\n== queries ==");
  for (const q of r.queries) console.log(`  ok  ${q}`);
  for (const q of r.rejectedQueries)
    console.log(`  REJ ${q.query}  (${q.why})`);
  console.log("\n== papers ==");
  for (const p of r.papers)
    console.log(`  ${p.year} ${p.doi} ${p.title.slice(0, 100)}`);
  console.log(
    `  latest paper year: ${Math.max(0, ...r.papers.map((p) => p.year))}`,
  );
  console.log("\n== cause track ==");
  for (const q of r.causeQueries) console.log(`  q   ${q}`);
  for (const p of r.causePapers)
    console.log(`  ${p.year} ${p.doi} ${p.title.slice(0, 100)}`);
  console.log(
    `  candidates: ${r.candidates.map((c) => `${c.id}${c.ring2 ? " (ring 2)" : ""} [${(c.tests ?? []).join(", ")}]`).join("; ") || "none"}`,
  );
  console.log("\n== proposals ==");
  for (const p of r.proposals)
    console.log(
      `  [${p.decision}] ${p.kind} ${p.conditionId ?? p.conditionName ?? "?"} ← ${p.featureId ?? "-"} ${JSON.stringify(p.conditionOn)} ${p.kind === "evidence" ? "LR+" : "×"}${p.lrPos ?? "-"} grade ${p.grade ?? "-"} doi:${p.doi} :: ${p.reason}\n      "${p.quote.slice(0, 160)}"`,
    );
  console.log(
    `\n== accepted ${r.accepted} of ${r.proposals.length}; cost $${r.costUsd}${r.stopped ? " (budget stop)" : ""} ==`,
  );

  if (r.catalogOverlay) {
    const [m, catalog] = await Promise.all([
      buildModelInput(userId, asOf, seed),
      catalogFor(userId),
    ]);
    const merged = withOverlay(catalog, r.catalogOverlay);
    const before = scoreHypotheses(m, { catalog });
    const after = scoreHypotheses(m, { catalog: merged });
    console.log(
      `\n== p before → after (promoted: ${r.catalogOverlay.promote.join(", ") || "none"}) ==`,
    );
    for (const id of WATCH) {
      const b = before.find((x) => x.id === id);
      const a = after.find((x) => x.id === id);
      console.log(
        `  ${id}: ${b?.score.toFixed(3) ?? "-"} (${b?.state ?? "-"}) → ${a?.score.toFixed(3) ?? "-"} (${a?.state ?? "-"})`,
      );
    }
    console.log("\n== top 5 moves after the overlay ==");
    for (const mv of nextMoves(m, merged, { max: 5 }))
      console.log(`  ${mv.label} (${mv.featureId})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
