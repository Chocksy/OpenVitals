/**
 * The eval runner: build a persona in memory, feed it the real context pack,
 * ask the real model for a plan, then check the plan in code and, optionally,
 * with a judge model.
 *
 *   pnpm --filter simple eval [caseId ...] [--model x-ai/grok-4.20] [--no-judge]
 *
 * Exits non-zero only when a case failed a `must`. A model or network failure
 * is recorded per case and the run still finishes.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText } from "ai";
import type { ReportBody } from "@/db";
import { model } from "@/lib/extract";
import {
  buildContextFromInput,
  generateFromContext,
  graphFacts,
  SYSTEM_PROMPT,
} from "@/lib/report";
import { runAssertions, type AssertionReport } from "./assert";
import { personaToInput, personaTracker, type EvalCase } from "./persona";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const JUDGE_SYSTEM =
  "You are grading a health plan written for one person. Answer in exactly two lines: 'score: N' where N is 1 to 5, then 'omission: <one sentence>'.";

interface CaseResult {
  id: string;
  passed: number;
  total: number;
  failed: string[];
  failedMust: boolean;
  shouldPassed: number;
  shouldTotal: number;
  shouldMissed: string[];
  judgeScore?: number;
  omission?: string;
  latencyMs: number;
  error?: string;
  body?: ReportBody;
}

function parseArgs(argv: string[]) {
  const ids: string[] = [];
  let modelId = process.env.AI_DEFAULT_MODEL ?? "x-ai/grok-4.20";
  let judge = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--no-judge") judge = false;
    else if (arg === "--model") modelId = argv[++i] ?? modelId;
    else if (arg.startsWith("--model=")) modelId = arg.slice(8);
    else ids.push(arg);
  }
  return { ids, modelId, judge };
}

async function loadCases(ids: string[]): Promise<EvalCase[]> {
  const dir = path.join(HERE, "cases");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const cases: EvalCase[] = [];
  for (const file of files) {
    const parsed = JSON.parse(
      await readFile(path.join(dir, file), "utf8"),
    ) as EvalCase;
    if (!ids.length || ids.includes(parsed.id)) cases.push(parsed);
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

async function judgePlan(
  c: EvalCase,
  body: ReportBody,
  modelId: string,
): Promise<{ judgeScore?: number; omission?: string }> {
  const { text } = await generateText({
    model: model(modelId),
    system: JUDGE_SYSTEM,
    prompt: `${c.judge}\n\nTHE PLAN:\n${JSON.stringify(body, null, 2)}`,
  });
  const score = text.match(/score\D*([1-5])/i)?.[1];
  const omission = text.match(/omission\s*:\s*(.+)/i)?.[1]?.trim();
  return { judgeScore: score ? Number(score) : undefined, omission };
}

async function runCase(
  c: EvalCase,
  modelId: string,
  judge: boolean,
): Promise<CaseResult> {
  const started = Date.now();
  try {
    const input = personaToInput(c.persona);
    const { context, rules, patterns, graph } = buildContextFromInput(input, {
      tracker: personaTracker(c.persona),
    });
    const body = await generateFromContext(
      context,
      rules,
      modelId,
      graphFacts(patterns, graph),
    );
    const report: AssertionReport = runAssertions(
      body,
      c.must,
      c.mustNot,
      c.should,
    );
    const graded = judge && c.judge ? await judgePlan(c, body, modelId) : {};
    return {
      id: c.id,
      ...report,
      ...graded,
      latencyMs: Date.now() - started,
      body,
    };
  } catch (e) {
    return {
      id: c.id,
      passed: 0,
      total: (c.must?.length ?? 0) + (c.mustNot?.length ?? 0),
      failed: [],
      failedMust: false,
      shouldPassed: 0,
      shouldTotal: c.should?.length ?? 0,
      shouldMissed: [],
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const { ids, modelId, judge } = parseArgs(process.argv.slice(2));
  const cases = await loadCases(ids);
  if (!cases.length) {
    console.error("no cases matched", ids.join(", "));
    process.exitCode = 1;
    return;
  }

  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`· ${c.id} … `);
    const result = await runCase(c, modelId, judge);
    results.push(result);
    console.log(
      result.error
        ? `error: ${result.error.slice(0, 120)}`
        : `${result.passed}/${result.total}${result.shouldTotal ? ` should ${result.shouldPassed}/${result.shouldTotal}` : ""}${result.judgeScore ? ` judge ${result.judgeScore}` : ""} (${Math.round(result.latencyMs / 1000)}s)`,
    );
  }

  console.log("");
  console.table(
    results.map((r) => ({
      case: r.id,
      assertions: `${r.passed}/${r.total}`,
      must: r.failedMust ? "FAIL" : r.error ? "-" : "ok",
      should: r.shouldTotal ? `${r.shouldPassed}/${r.shouldTotal}` : "-",
      judge: r.judgeScore ?? "-",
      seconds: Math.round(r.latencyMs / 1000),
      error: r.error ? r.error.slice(0, 40) : "",
    })),
  );
  for (const r of results)
    for (const f of [...r.failed, ...r.shouldMissed])
      console.log(`  ${r.id}: ${f}`);

  const graded = results.filter((r) => r.judgeScore != null);
  const scored = results.filter((r) => !r.error);
  console.log(
    `\nmean assertions ${
      scored.length
        ? Math.round(
            (scored.reduce((s, r) => s + r.passed / Math.max(1, r.total), 0) /
              scored.length) *
              100,
          )
        : 0
    }%${graded.length ? `, mean judge ${(graded.reduce((s, r) => s + r.judgeScore!, 0) / graded.length).toFixed(1)}` : ""}`,
  );

  const hash = createHash("sha256")
    .update(SYSTEM_PROMPT)
    .digest("hex")
    .slice(0, 8);
  const slug = modelId.replace(/[^a-z0-9]+/gi, "-");
  const file = path.join(
    HERE,
    "results",
    `${new Date().toISOString().slice(0, 10)}-${slug}-${hash}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        model: modelId,
        promptSha8: hash,
        ranAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${path.relative(process.cwd(), file)}`);

  if (results.some((r) => r.failedMust)) process.exitCode = 1;
}

await main();
