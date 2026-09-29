/**
 * The photo bake-off (phase 41F-M):
 *
 *   pnpm --filter simple eval:photos [--models a,b,c] [--only dishId,...] [--max-usd 3]
 *
 * `eval:capture` checks everything after the extraction and runs no model.
 * This checks the extraction itself, on real food photos with measured truth:
 * twenty overhead plates from Nutrition5k (Google, CC BY 4.0), each weighed
 * and priced in kcal, protein, carbohydrate and fat per ingredient. The
 * photos and their truth live in `evals/photos/`.
 *
 * Every model gets `classifyPhoto`'s own prompt, schema and message through
 * `photoCall`, and the app's own `mealTotals` adds the items up. Scored per
 * model: whether the answer parses, the share of the plate's main
 * ingredients it names, kcal error in percent, macro error in grams, cost
 * (tokens times the models endpoint's prices) and latency. One table, sorted
 * by cost. Results land in `evals/results/photos-<date>.json`.
 *
 * Nothing is switched: `AI_PHOTO_MODEL` stays where it is until the owner
 * picks.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mealTotals, photoCall, type CaptureExtract } from "@/lib/capture";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The current model first, as the baseline; then the candidates. */
const DEFAULT_MODELS = [
  "google/gemini-3.7-flash",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-opus-5.5",
  "x-ai/grok-4.6",
  "openai/gpt-5.6-sol",
  "openai/gpt-6-luna",
  "z-ai/glm-5.3-flash",
  "xiaomi/mimo-v2.6-pro",
  "meta/muse-spark-1.3",
];

interface Ingredient {
  name: string;
  grams: number;
  kcal: number;
}

interface PhotoCase {
  id: string;
  file: string;
  kcal: number;
  massG: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  ingredients: Ingredient[];
}

interface ORModel {
  id: string;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
}

/** Seasoning and dataset labels nobody can see on a plate. */
const UNSEEN = new Set([
  "salt",
  "pepper",
  "olive oil",
  "vinegar",
  "deprecated",
  "garlic",
  "thyme",
]);

/** Names the dataset and a model use for the same food. */
const SAME: Record<string, string[]> = {
  yam: ["sweet potato", "yam"],
  "sweet potato": ["sweet potato", "yam"],
  berries: ["berr", "strawberr", "blueberr", "raspberr", "blackberr"],
  "country rice": ["rice"],
  "garden salad": ["salad", "lettuce", "greens"],
  "mixed greens": ["greens", "salad", "lettuce", "spinach", "arugula"],
  "chicken apple sausage": ["sausage"],
  "chayote squash": ["chayote", "squash"],
  "corn on the cob": ["corn"],
  "hash browns": ["hash brown", "potato"],
  "roasted potatoes": ["potato"],
  "mandarin oranges": ["mandarin", "orange", "clementine", "tangerine"],
  "egg whites": ["egg"],
  "scrambled eggs": ["egg"],
  "cheese pizza": ["pizza"],
  "pepperoni pizza": ["pizza"],
  "chicken breast": ["chicken"],
  fish: ["fish", "salmon", "cod", "tilapia", "tuna", "halibut"],
};

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/(ies|es|s)$/, ""));

/** The ingredients a person could see: 10 % of the plate's weight or more. */
export const mainIngredients = (c: PhotoCase): string[] =>
  c.ingredients
    .filter((i) => !UNSEEN.has(i.name) && i.grams >= 0.1 * c.massG)
    .map((i) => i.name);

/** True when the model's words name the ingredient. */
export function names(ingredient: string, said: string): boolean {
  const text = said.toLowerCase();
  const forms = SAME[ingredient] ?? [ingredient];
  if (forms.some((f) => text.includes(f))) return true;
  const saidWords = new Set(words(said));
  // "cherry tomatoes" is named by "tomato"; the last word is the food
  const last = words(ingredient).at(-1);
  return !!last && saidWords.has(last);
}

interface Row {
  model: string;
  valid: string;
  meal: number;
  named: number | null;
  kcalErrPct: number | null;
  kcalMedianErrPct: number | null;
  proteinErrG: number | null;
  carbsErrG: number | null;
  fatErrG: number | null;
  costUsd: number;
  per100Usd: number | null;
  medianLatencyS: number;
}

interface Scored {
  id: string;
  ok: boolean;
  error?: string;
  kind?: string;
  named: number;
  main: string[];
  said?: string;
  kcal: number | null;
  kcalErrPct: number | null;
  proteinErrG: number | null;
  carbsErrG: number | null;
  fatErrG: number | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

function score(
  c: PhotoCase,
  doc: CaptureExtract,
): Omit<Scored, "inputTokens" | "outputTokens" | "latencyMs"> {
  const said = [doc.basis, ...(doc.items ?? []).map((i) => i.name)].join("; ");
  const main = mainIngredients(c);
  const hit = main.filter((m) => names(m, said)).length;
  const t = mealTotals(doc);
  const err = (got: number | null | undefined, want: number) =>
    got == null ? null : Math.abs(got - want);
  return {
    id: c.id,
    ok: true,
    kind: doc.kind,
    named: main.length ? hit / main.length : 1,
    main,
    said,
    kcal: t?.kcal ?? null,
    kcalErrPct:
      t?.kcal == null ? null : (Math.abs(t.kcal - c.kcal) / c.kcal) * 100,
    proteinErrG: err(t?.proteinG, c.proteinG),
    carbsErrG: err(t?.carbsG, c.carbsG),
    fatErrG: err(t?.fatG, c.fatG),
  };
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)]! : null;
};

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>) {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < xs.length) {
        const i = next++;
        out[i] = await f(xs[i]!);
      }
    }),
  );
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  let models = DEFAULT_MODELS;
  let only: string[] = [];
  let maxUsd = 3;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--models") models = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--only")
      only = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a === "--max-usd") maxUsd = Number(argv[++i]);
  }

  const cases = (
    JSON.parse(
      await readFile(path.join(HERE, "photos", "cases.json"), "utf8"),
    ) as PhotoCase[]
  ).filter((c) => !only.length || only.includes(c.id));
  const photos = new Map(
    await Promise.all(
      cases.map(
        async (c) =>
          [c.id, await readFile(path.join(HERE, "photos", c.file))] as const,
      ),
    ),
  );

  const live = (
    (await (await fetch("https://openrouter.ai/api/v1/models")).json()) as {
      data: ORModel[];
    }
  ).data;
  const byId = new Map(live.map((m) => [m.id, m]));

  const rows: Row[] = [];
  const runs: { model: string; cases: Scored[] }[] = [];
  let spent = 0;
  for (const id of models) {
    const meta = byId.get(id);
    if (!meta?.architecture?.input_modalities?.includes("image")) {
      console.log(
        `skip ${id}: ${meta ? "no image input" : "not on OpenRouter"}`,
      );
      continue;
    }
    if (spent >= maxUsd) {
      console.log(
        `skip ${id}: the run has spent $${spent.toFixed(2)} of $${maxUsd}`,
      );
      continue;
    }
    const inPerTok = Number(meta.pricing?.prompt ?? 0);
    const outPerTok = Number(meta.pricing?.completion ?? 0);
    console.log(`══ ${id}`);
    const scored = await pool(cases, 5, async (c): Promise<Scored> => {
      const started = Date.now();
      try {
        const res = await photoCall(photos.get(c.id)!, c.file, undefined, id);
        const s = score(c, res.object);
        const r = {
          ...s,
          inputTokens: res.usage?.inputTokens ?? 0,
          outputTokens: res.usage?.outputTokens ?? 0,
          latencyMs: Date.now() - started,
        };
        console.log(
          `· ${c.id} ${s.kind} named ${(s.named * 100).toFixed(0)}% kcal ${s.kcal ?? "-"}/${Math.round(c.kcal)} (${Math.round(r.latencyMs / 1000)}s)`,
        );
        return r;
      } catch (e) {
        console.log(`· ${c.id} FAIL ${String(e).slice(0, 160)}`);
        return {
          id: c.id,
          ok: false,
          error: String(e).slice(0, 500),
          named: 0,
          main: mainIngredients(c),
          kcal: null,
          kcalErrPct: null,
          proteinErrG: null,
          carbsErrG: null,
          fatErrG: null,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: Date.now() - started,
        };
      }
    });
    const cost = scored.reduce(
      (s, r) => s + r.inputTokens * inPerTok + r.outputTokens * outPerTok,
      0,
    );
    spent += cost;
    runs.push({ model: id, cases: scored });
    const good = scored.filter((r) => r.ok);
    rows.push({
      model: id,
      valid: `${good.length}/${scored.length}`,
      meal: good.filter((r) => r.kind === "meal").length,
      named: mean(good.map((r) => r.named)),
      kcalErrPct: mean(good.map((r) => r.kcalErrPct)),
      kcalMedianErrPct: median(
        good.map((r) => r.kcalErrPct).filter((x): x is number => x != null),
      ),
      proteinErrG: mean(good.map((r) => r.proteinErrG)),
      carbsErrG: mean(good.map((r) => r.carbsErrG)),
      fatErrG: mean(good.map((r) => r.fatErrG)),
      costUsd: cost,
      per100Usd: scored.length ? (cost / scored.length) * 100 : null,
      medianLatencyS: (median(scored.map((r) => r.latencyMs)) ?? 0) / 1000,
    });
  }

  // a second run the same day (`--models` for a few) replaces only its models
  const file = path.join(
    HERE,
    "results",
    `photos-${new Date().toISOString().slice(0, 10)}.json`,
  );
  const before = await readFile(file, "utf8")
    .then((t) => JSON.parse(t) as { rows: typeof rows; runs: typeof runs })
    .catch(() => null);
  if (before) {
    const ran = new Set(runs.map((r) => r.model));
    rows.push(...before.rows.filter((r) => !ran.has(r.model)));
    runs.push(...before.runs.filter((r) => !ran.has(r.model)));
  }
  rows.sort((a, b) => a.costUsd - b.costUsd);
  const f = (v: number | null, d = 0) => (v == null ? "-" : v.toFixed(d));
  console.log("");
  console.table(
    rows.map((r) => ({
      model: r.model,
      valid: r.valid,
      meal: r.meal,
      "named %": f(r.named == null ? null : r.named * 100),
      "kcal err %": f(r.kcalErrPct),
      "kcal med %": f(r.kcalMedianErrPct),
      "prot err g": f(r.proteinErrG, 1),
      "carb err g": f(r.carbsErrG, 1),
      "fat err g": f(r.fatErrG, 1),
      "$ / 100": f(r.per100Usd, 3),
      "median s": f(r.medianLatencyS, 1),
    })),
  );
  console.log(
    `\nspent about $${spent.toFixed(3)} (token counts times list prices)`,
  );

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        source: "Nutrition5k cafe1, realsense_overhead rgb",
        rows,
        runs,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])))
  void main();
