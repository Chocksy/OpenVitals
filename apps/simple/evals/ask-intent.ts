/**
 * The ask-box router eval:
 *
 *   pnpm --filter simple eval:ask-intent [caseId ...]
 *
 * Six inputs the owner's screenshots are made of: three words and three
 * questions. Each one asserts the route the box takes and, for a question,
 * the term `termQuery` hands the ontology lookup — because the regression was
 * exactly that "how can I make sure I do not get type 2 diabetes?" went to a
 * trigram search over disease names and came back with nothing.
 *
 * Deterministic: no database and no model, so it runs anywhere in a second.
 * Results land in `evals/results/ask-intent-<date>.json`. Exits non-zero when
 * a case fails.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { askIntent, termQuery, type AskRoute } from "@/lib/ask-intent";

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface IntentCase {
  id: string;
  text: string;
  route: AskRoute;
  /** what the lookup must be given, for a question that names a disease */
  term?: string;
}

const CASES: IntentCase[] = [
  { id: "term-disease", text: "haemochromatosis", route: "term" },
  { id: "term-two-words", text: "type 2 diabetes", route: "term" },
  { id: "term-symptom", text: "cold hands and feet", route: "term" },
  {
    id: "question-t2d",
    text: "how can I make sure I do not get type 2 diabetes?",
    route: "question",
    term: "type 2 diabetes",
  },
  {
    id: "question-marker",
    text: "what does my apoB mean",
    route: "question",
    term: "apob",
  },
  {
    id: "question-risk",
    text: "should I worry about fatty liver disease?",
    route: "question",
    term: "worry fatty liver disease",
  },
];

interface Result {
  id: string;
  route: AskRoute;
  term: string;
  failed: string[];
  pass: boolean;
}

async function main() {
  const ids = process.argv.slice(2);
  const cases = CASES.filter((c) => !ids.length || ids.includes(c.id));
  if (!cases.length) {
    console.error("no cases matched", ids.join(", "));
    process.exitCode = 1;
    return;
  }

  const results: Result[] = cases.map((c) => {
    const route = askIntent(c.text);
    const term = termQuery(c.text);
    const failed: string[] = [];
    if (route !== c.route) failed.push(`routed to ${route}, wanted ${c.route}`);
    if (c.term && term !== c.term)
      failed.push(`looked up "${term}", wanted "${c.term}"`);
    console.log(
      `· ${c.id} … ${route}, term "${term}", ${failed.length ? "FAIL" : "pass"}`,
    );
    return { id: c.id, route, term, failed, pass: failed.length === 0 };
  });

  console.log("");
  console.table(
    results.map((r) => ({
      case: r.id,
      route: r.route,
      term: r.term,
      pass: r.pass ? "ok" : "FAIL",
    })),
  );
  for (const r of results)
    for (const f of r.failed) console.log(`  ${r.id}: ${f}`);

  const file = path.join(
    HERE,
    "results",
    `ask-intent-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);

  const passed = results.filter((r) => r.pass).length;
  console.log(`${passed}/${results.length}`);
  if (passed !== results.length) process.exitCode = 1;
}

await main();
