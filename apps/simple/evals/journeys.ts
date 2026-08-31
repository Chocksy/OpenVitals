/**
 * The journey runner as a command:
 *
 *   pnpm --filter simple eval:journeys [id ...]
 *
 * Prints one row per journey (steps, euros, where each true condition crossed
 * "likely", false alarms, stop reason, pass) and writes the whole thing to
 * `evals/results/journeys-<date>.json` so a change in the knowledge base shows
 * up as a change in the curve.
 *
 * Deterministic and offline apart from reading the catalog out of Postgres.
 * No model is called anywhere in here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentRevision, loadCatalog } from "@/lib/hkb";
import { JOURNEYS, runJourney, type JourneyResult } from "@/lib/journey";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const ids = process.argv.slice(2);
  const journeys = JOURNEYS.filter((j) => !ids.length || ids.includes(j.id));
  if (!journeys.length) {
    console.error("no journeys matched", ids.join(", "));
    process.exitCode = 1;
    return;
  }

  const catalog = await loadCatalog();
  const kbRevision = await currentRevision();
  const results: JourneyResult[] = [];
  for (const j of journeys) {
    process.stdout.write(`· ${j.id} … `);
    const result = await runJourney(j, catalog);
    results.push(result);
    console.log(
      `${result.steps.length} steps, €${result.totalEur}, ${result.stop}, ${
        result.pass ? "pass" : "FAIL"
      }`,
    );
  }

  console.log("");
  console.table(
    results.map((r) => ({
      journey: r.id,
      steps: r.steps.length,
      eur: r.totalEur,
      discovered:
        Object.entries(r.discoveredAt)
          .map(([id, at]) => `${id}@${at ?? "never"}`)
          .join(" ") || "-",
      falseLikely:
        r.falseLikely
          .map((f) => `${f.id} ${Math.round(f.p * 100)}%@${f.step}`)
          .join(" ") || "-",
      stop: r.stop,
      pass: r.pass ? "ok" : "FAIL",
    })),
  );
  for (const r of results)
    for (const f of r.failed) console.log(`  ${r.id}: ${f}`);

  const file = path.join(
    HERE,
    "results",
    `journeys-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      { ranAt: new Date().toISOString(), kbRevision, results },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);

  if (results.some((r) => !r.pass)) process.exitCode = 1;
}

await main();
