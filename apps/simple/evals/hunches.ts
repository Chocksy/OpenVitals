/**
 * The hunches eval (phase 39 S9):
 *
 *   pnpm --filter simple eval:hunches [personaId ...] [--judge]
 *
 * Five persona histories through `signalsOf` and the code that chooses the
 * test, offline: no database, no model, so it runs in CI. The owner's real
 * series must raise the five signals S2 names; a flat healthy series raises
 * nothing; an iron-loss series raises ferritin; a new-lab jump is labelled a
 * lab change and not raised; a coeliac cluster leads to tTG-IgA.
 *
 * `--judge` (needs OPENROUTER_API_KEY) also asks the model for each raised
 * hunch's explanations and has an independent judge score them 1 to 5.
 * Results land in `evals/results/hunches-<date>.json`; exits non-zero when a
 * persona fails.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText } from "ai";
import { model } from "@/lib/extract";
import type { SystemId } from "@/lib/graph";
import {
  chooseTest,
  closedList,
  explain,
  weightsOf,
  type TestRow,
} from "@/lib/hunches";
import { signalsOf, type Cause, type GoalIn, type Signal } from "@/lib/signals";

const HERE = path.dirname(fileURLToPath(import.meta.url));

type PointRow = [string, number, number | null, number | null, string | null];

interface Persona {
  id: string;
  note: string;
  today: string;
  markers: {
    code: string;
    name: string;
    unit: string | null;
    system: SystemId | null;
    derived?: boolean;
    points: PointRow[];
  }[];
  goals: GoalIn[];
  facts: Record<string, string>;
  expect: {
    raised: string[];
    labChange?: string[];
    test?: Record<string, string>;
  };
}

interface Cases {
  causes: Record<string, Cause[]>;
  tests: TestRow[];
  personas: Persona[];
}

export const inputOf = (p: Persona, causes: Record<string, Cause[]>) => ({
  markers: p.markers.map((m) => ({
    ...m,
    points: m.points.map(([date, value, refLow, refHigh, unit]) => ({
      date,
      value,
      refLow,
      refHigh,
      unit,
    })),
  })),
  goals: p.goals,
  facts: p.facts,
  causes,
  today: p.today,
});

const JUDGE = `You grade explanations a health app offers for a change in one person's blood tests. Score 1 to 5: 5 means every explanation is plausible for this change, stated plainly, with no diagnosis and no invented number; 1 means misleading or unsafe. Reply "score: N" then "omission: <the most important missing explanation, or none>".`;

async function main() {
  const args = process.argv.slice(2);
  const judge = args.includes("--judge");
  const ids = args.filter((a) => !a.startsWith("--"));
  const cases = JSON.parse(
    await readFile(path.join(HERE, "hunches", "cases.json"), "utf8"),
  ) as Cases;
  const personas = cases.personas.filter(
    (p) => !ids.length || ids.includes(p.id),
  );
  if (judge && !process.env.OPENROUTER_API_KEY) {
    console.error("--judge needs OPENROUTER_API_KEY");
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const p of personas) {
    const failed: string[] = [];
    const { raised, unraised } = signalsOf(inputOf(p, cases.causes));
    const got = raised.map((s) => s.key).sort();
    const want = [...p.expect.raised].sort();
    if (got.join() !== want.join())
      failed.push(
        `raised ${got.join(", ") || "nothing"}, wanted ${want.join(", ") || "nothing"}`,
      );
    for (const key of p.expect.labChange ?? []) {
      const s = unraised.find((x) => x.key === key);
      if (!s?.numbers.labChange)
        failed.push(`${key} not labelled a lab change`);
    }
    const names = Object.fromEntries(p.markers.map((m) => [m.code, m.name]));
    const draws = [
      ...new Set(p.markers.flatMap((m) => m.points.map((x) => x[0]))),
    ].sort();
    const last3 = new Set(draws.slice(-3));
    const known = new Set(
      p.markers
        .filter((m) => m.points.some((x) => last3.has(x[0])))
        .map((m) => m.code),
    );
    const tests: Record<string, string | null> = {};
    const judged: Record<string, unknown> = {};
    for (const s of raised) {
      const list = closedList(s, cases.causes);
      // Offline the rules fallback stands: the top three by grade.
      const expl = weightsOf(
        list.slice(0, 3).map((c) => ({
          id: c.id,
          text: c.name,
          grade: c.grade as "A",
          basis: c.basis,
          source: c.source,
          conditionId: c.conditionId,
          weight: 0,
          predicts: null,
          check: c.check,
        })),
        null,
      );
      tests[s.key] =
        chooseTest(expl, known, cases.tests, null, names)?.code ?? null;
      if (judge && list.length)
        judged[s.key] = await judgeOne(s, list, p, names);
    }
    for (const [key, code] of Object.entries(p.expect.test ?? {}))
      if (tests[key] !== code)
        failed.push(`${key} chose ${tests[key] ?? "no test"}, wanted ${code}`);

    console.log(
      `${failed.length ? "FAIL" : "pass"} ${p.id}: raised ${got.join(", ") || "nothing"}; ${unraised.length} unraised${failed.length ? `\n   ${failed.join("\n   ")}` : ""}`,
    );
    results.push({
      id: p.id,
      raised: got,
      unraised: unraised.map((s) => s.key),
      tests,
      judged,
      failed,
      pass: !failed.length,
    });
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} personas pass`);
  const out = path.join(HERE, "results");
  await mkdir(out, { recursive: true });
  const file = path.join(
    out,
    `hunches-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await writeFile(file, JSON.stringify(results, null, 2));
  console.log(`results: ${path.relative(process.cwd(), file)}`);
  if (passed < results.length) process.exitCode = 1;
}

async function judgeOne(
  s: Signal,
  list: Cause[],
  p: Persona,
  names: Record<string, string>,
) {
  const got = await explain(s, list, { facts: p.facts, names });
  const { text } = await generateText({
    // ponytail: fixed independent judge, as in evals/run.ts
    model: model(process.env.EVAL_JUDGE_MODEL ?? "openai/gpt-5.6-sol"),
    system: JUDGE,
    prompt: `THE CHANGE:\n${s.rule.join("\n")}\n\nTHE EXPLANATIONS:\n${got.explanations.map((e) => `- ${e.text} (grade ${e.grade})`).join("\n")}\n\nTHE QUESTION: ${got.question?.text ?? "none"}`,
  });
  return {
    by: got.by,
    explanations: got.explanations.map((e) => e.text),
    question: got.question?.text ?? null,
    score: Number(text.match(/score\D*([1-5])/i)?.[1] ?? 0) || null,
    omission: text.match(/omission\s*:\s*(.+)/i)?.[1]?.trim() ?? null,
  };
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])))
  void main();
