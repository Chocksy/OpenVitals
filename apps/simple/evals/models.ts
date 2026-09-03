/**
 * The bake-off: one list of models, both evals, one table.
 *
 *   pnpm --filter simple eval:models [--models a,b,c] [--user email] [--dry]
 *
 * `pnpm eval:ask` scores one question and `pnpm eval:thread` scores a
 * conversation, and the model that wins one does not always win the other.
 * This runs the same list through both — by calling their runners in this
 * process, not by shelling out, so the prices are fetched once per eval and
 * the results are objects rather than scraped text — and prints the row a
 * decision is actually made from: how well it answers, how well it holds a
 * thread, what a million tokens cost and what this run cost.
 *
 * `--dry` prints the list with today's prices and the case counts and calls
 * no model at all, which is how the command is checked when the OpenRouter
 * key has no headroom left.
 *
 * Results land in `evals/results/models-<date>.json`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@/db";
import { askCases, named, runAsk, type ModelRun } from "./ask";
import { CASES, runThread, type ThreadModelRun } from "./thread";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * The candidates, cheapest frontier first. Written down rather than derived:
 * the models endpoint prices every model and rates none of them, so which
 * seven are worth a run is this project's judgement, and a reader who
 * disagrees passes `--models`.
 */
const DEFAULT_MODELS = [
  "x-ai/grok-4.6",
  "deepseek/deepseek-v4-pro-0813",
  "z-ai/glm-5.3",
  "google/gemini-3.8-flash",
  "qwen/qwen3.8-27b",
  "openai/gpt-5.6-luna",
  "deepseek/deepseek-v4-flash-0731",
];

interface Row {
  model: string;
  askScore: number | null;
  askClean: string;
  threadScore: number | null;
  threadInvented: number;
  inPerM: number | null;
  outPerM: number | null;
  /** what the run cost, from the only tokens the SDK hands back: the threads */
  cost: number | null;
}

const clean = (r: ModelRun): string =>
  `${r.cases.filter((c) => !c.failed.length).length}/${r.cases.length}`;

const invented = (r: ThreadModelRun): number =>
  r.results.reduce(
    (n, c) => n + c.turns.reduce((m, t) => m + t.dropped.length, 0),
    0,
  );

const money = (v: number | null, digits = 2): string =>
  v == null ? "-" : v.toFixed(digits);

/** The list with today's prices and the case counts, calling nothing. */
async function dry(models: string[]): Promise<void> {
  const priced = await named(models);
  const asks = await askCases();
  console.log(
    `dry run: ${models.length} model(s), ${asks.length} ask case(s), ${CASES.length} thread case(s) each\n`,
  );
  console.table(
    models.map((id) => {
      const meta = priced.get(id);
      const inPerM = meta?.pricing?.prompt
        ? Number(meta.pricing.prompt) * 1_000_000
        : null;
      const outPerM = meta?.pricing?.completion
        ? Number(meta.pricing.completion) * 1_000_000
        : null;
      return {
        model: id,
        live: meta ? "yes" : "no",
        "$/M in": money(inPerM),
        "$/M out": money(outPerM),
        ask: asks.length,
        thread: CASES.length,
      };
    }),
  );
  const missing = models.filter((id) => !priced.get(id));
  if (missing.length)
    console.log(
      `\nnot on the models endpoint today: ${missing.join(", ")}\n(a run would still try them and OpenRouter would decide)`,
    );
  console.log(`\nno model was called`);
}

async function main() {
  const argv = process.argv.slice(2);
  let models = DEFAULT_MODELS;
  let email: string | undefined;
  let isDry = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--models")
      models = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (arg.startsWith("--models="))
      models = arg.slice(9).split(",").filter(Boolean);
    else if (arg === "--user") email = argv[++i];
    else if (arg === "--dry") isDry = true;
  }
  if (!models.length) {
    console.error("no models named");
    process.exitCode = 1;
    return;
  }

  if (isDry) {
    await dry(models);
    return;
  }

  const opts = { models, ...(email ? { email } : {}) };
  console.log(`══ ask\n`);
  const ask = await runAsk(opts);
  console.log(`\n══ thread\n`);
  const thread = await runThread(opts);
  if (!ask || !thread) {
    process.exitCode = 1;
    return;
  }

  const rows: Row[] = models.map((id) => {
    const a = ask.runs.find((r) => r.modelId === id);
    const t = thread.runs.find((r) => r.modelId === id);
    return {
      model: id,
      askScore: a?.score ?? null,
      askClean: a ? clean(a) : "-",
      threadScore: t?.score ?? null,
      threadInvented: t ? invented(t) : 0,
      inPerM: a?.inPerM ?? t?.inPerM ?? null,
      outPerM: a?.outPerM ?? t?.outPerM ?? null,
      cost: t?.cost ?? null,
    };
  });
  rows.sort(
    (x, y) =>
      (y.askScore ?? 0) +
      (y.threadScore ?? 0) -
      ((x.askScore ?? 0) + (x.threadScore ?? 0)),
  );

  console.log(`\n══ both\n`);
  console.table(
    rows.map((r) => ({
      model: r.model,
      ask: r.askScore ?? "-",
      "ask clean": r.askClean,
      thread: r.threadScore ?? "-",
      invented: r.threadInvented,
      "$/M in": money(r.inPerM),
      "$/M out": money(r.outPerM),
      "run $": money(r.cost, 4),
    })),
  );

  console.log(`\nset AI_ASK_MODEL=${ask.winner.modelId}`);
  console.log(
    thread.winner
      ? `set AI_THREAD_MODEL=${thread.winner.modelId}`
      : `no model cleared the thread floor of ${thread.floor}`,
  );

  const file = path.join(
    HERE,
    "results",
    `models-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        email: ask.email,
        models,
        rows,
        askWinner: ask.winner.modelId,
        threadWinner: thread.winner?.modelId ?? null,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);
}

await main();
// The pool holds the event loop open, and a CLI that never exits is a CLI
// nobody puts in a script. A dry run never opens one, so it never closes one.
if (!process.argv.includes("--dry")) await pool().end();
