/**
 * The trends inbox eval:
 *
 *   pnpm --filter simple eval:trends [caseId ...]
 *
 * Five claims through the extractor and the pipe's own arithmetic, and what
 * each case asserts is the split: which half of the claim lands as graded
 * science and which half lands as a grade E horizon row with a measurement
 * plan. One case is not a claim at all and has to come back null; one names a
 * marker we do not track and has to file with no markers, no plan and no
 * science.
 *
 * No claim is written. `extractClaim` is the one model call; the condition
 * lookup and the science neighbours are reads, and the horizon row is built
 * with the same pure function `fileClaim` writes. Results land in
 * `evals/results/trends-<date>.json`; exits non-zero when a case fails.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@/db";
import {
  conditionForMarkers,
  extractClaim,
  measurementPlan,
  scienceNeighbours,
  toHorizonRow,
  type Claim,
} from "@/lib/trends";

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface TrendCase {
  id: string;
  text: string;
  expect: {
    isClaim: boolean;
    /** a lowercase substring the named thing has to contain */
    intervention?: string;
    markers?: string[];
    direction?: "down" | "up";
    sourceKind?: string;
    horizonGrade?: string;
    /** whether a measurement plan is possible at all */
    plan?: boolean;
    /** "some": the marker already has graded rows; "none": it has none */
    science?: "some" | "none";
  };
}

interface Result {
  id: string;
  claim: Claim | null;
  conditionId: string | null;
  horizon: string | null;
  plan: string | null;
  science: string[];
  failed: string[];
  pass: boolean;
}

async function main() {
  const ids = process.argv.slice(2);
  const cases = (
    JSON.parse(
      await readFile(path.join(HERE, "trends", "cases.json"), "utf8"),
    ) as TrendCase[]
  ).filter((c) => !ids.length || ids.includes(c.id));
  if (!cases.length) {
    console.error("no cases matched", ids.join(", "));
    process.exitCode = 1;
    return;
  }

  const results: Result[] = [];

  for (const c of cases) {
    process.stdout.write(`· ${c.id} … `);
    const failed: string[] = [];
    const claim = await extractClaim(c.text).catch((e) => {
      failed.push(`extract threw: ${e}`);
      return null;
    });

    if (!c.expect.isClaim) {
      if (claim) failed.push(`filed "${claim.intervention}", wanted nothing`);
      results.push({
        id: c.id,
        claim,
        conditionId: null,
        horizon: null,
        plan: null,
        science: [],
        failed,
        pass: !failed.length,
      });
      console.log(failed.length ? "FAIL" : "not a claim, nothing filed");
      continue;
    }

    if (!claim) {
      failed.push("returned null, wanted a claim");
      results.push({
        id: c.id,
        claim: null,
        conditionId: null,
        horizon: null,
        plan: null,
        science: [],
        failed,
        pass: false,
      });
      console.log("FAIL");
      continue;
    }

    const e = c.expect;
    if (
      e.intervention &&
      !claim.intervention.toLowerCase().includes(e.intervention)
    )
      failed.push(`named "${claim.intervention}", wanted "${e.intervention}"`);
    for (const m of e.markers ?? [])
      if (!claim.markers.includes(m))
        failed.push(
          `missed marker ${m} (got ${claim.markers.join(", ") || "none"})`,
        );
    if (e.markers?.length === 0 && claim.markers.length)
      failed.push(`invented markers ${claim.markers.join(", ")}`);
    if (e.direction && claim.direction !== e.direction)
      failed.push(`direction ${claim.direction}, wanted ${e.direction}`);
    if (e.sourceKind && claim.sourceKind !== e.sourceKind)
      failed.push(`source ${claim.sourceKind}, wanted ${e.sourceKind}`);
    if (!c.text.toLowerCase().includes(claim.text.toLowerCase().slice(0, 30)))
      failed.push("the quote is not in the text");

    const condition = await conditionForMarkers(claim.markers);
    const row = toHorizonRow(claim, condition.id);
    const plan = measurementPlan(claim);
    const science = await scienceNeighbours(condition.id, claim.markers);

    if (e.horizonGrade && row.grade !== e.horizonGrade)
      failed.push(`horizon grade ${row.grade}, wanted ${e.horizonGrade}`);
    if (row.status !== "horizon") failed.push(`status ${row.status}`);
    if (e.plan === true && !plan) failed.push("no measurement plan");
    if (e.plan === false && plan) failed.push(`invented a plan: ${plan}`);
    if (e.science === "some" && !science.length)
      failed.push("no graded science for a marker that has some");
    if (e.science === "none" && science.length)
      failed.push(`found science where there should be none`);

    results.push({
      id: c.id,
      claim,
      conditionId: condition.id,
      horizon: `${row.grade} · ${row.status} · ${row.population} · ${row.conditionId}`,
      plan,
      science: science.map((s) => `${s.name} (${s.grade})`),
      failed,
      pass: !failed.length,
    });
    console.log(
      `${claim.intervention} → ${claim.markers.join(", ") || "no marker"} · ` +
        `science ${science.length} · horizon ${row.grade} · ${failed.length ? "FAIL" : "pass"}`,
    );
  }

  console.log("");
  console.table(
    results.map((r) => ({
      case: r.id,
      claim: r.claim ? r.claim.intervention : "— not a claim —",
      "as science": r.science.join(" · ") || "-",
      "as horizon": r.horizon ?? "-",
      plan: r.plan ? "yes" : "-",
      pass: r.pass ? "ok" : "FAIL",
    })),
  );
  for (const r of results)
    for (const f of r.failed) console.log(`  ${r.id}: ${f}`);

  const file = path.join(
    HERE,
    "results",
    `trends-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: process.env.AI_DEFAULT_MODEL,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);

  if (results.some((r) => !r.pass)) process.exitCode = 1;
  await pool().end();
}

await main();
