/**
 * The second-pass eval:
 *
 *   pnpm --filter simple eval:second-pass [caseId ...]
 *   pnpm --filter simple eval:second-pass --build [email]
 *
 * Every case is one row `/review` was asking the owner to Keep or Discard, with
 * the stretch of the lab sheet it came off copied in verbatim. The run says
 * which layer settled it: the deterministic re-match, the model, an automatic
 * decimal-shift correction, "not on the sheet" — or nobody, which is the only
 * outcome a person should ever see.
 *
 * `--build` regenerates `second-pass/cases.json` from the local database, so
 * the fixtures stay the owner's real rows rather than something invented here.
 *
 * Results land in `evals/results/second-pass-<date>.json`. Exits non-zero when
 * a case does not land on its expected outcome.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  askSheet,
  judge,
  openConfirmValue,
  rematch,
  windowText,
  type SecondPassOutcome,
  type SheetQuestion,
} from "@/lib/second-pass";
import { getDb, pool } from "@/db";
import { users } from "@/db/auth-schema";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, "second-pass", "cases.json");

interface Case {
  id: string;
  metricCode: string;
  metricName: string;
  aliases: string[];
  stored: number | null;
  unit: string | null;
  observedAt: string;
  /** the sheet, verbatim */
  sheet: string;
  /** earlier runs that already failed to find this row on its sheet */
  strikes?: number;
  expect: SecondPassOutcome["outcome"];
  note?: string;
}

const ask = (c: Case): SheetQuestion => ({
  readingId: c.id,
  metricCode: c.metricCode,
  metricName: c.metricName,
  aliases: c.aliases,
  stored: c.stored,
  unit: c.unit,
  observedAt: c.observedAt,
  rawText: c.sheet,
});

/** The owner's open questions, with the sheet around each analyte, as cases. */
async function build(email?: string) {
  const people = await getDb().select().from(users);
  const person = email
    ? people.find((u) => u.email === email)
    : people.find((u) => u.email === process.env.ADMIN_EMAIL);
  if (!person)
    throw new Error(`no user for ${email ?? process.env.ADMIN_EMAIL}`);

  const rows = await openConfirmValue(person.id);
  const cases: Case[] = rows.map((r) => ({
    id: `${r.metricCode}-${r.observedAt}`,
    metricCode: r.metricCode,
    metricName: r.metricName,
    aliases: r.aliases,
    stored: r.stored,
    unit: r.unit,
    observedAt: r.observedAt,
    sheet: windowText(r.rawText, r.aliases, 12),
    strikes: r.strikes,
    expect: rematch(r) ? "rematch" : "model",
  }));

  const existing = (
    JSON.parse(await readFile(FILE, "utf8").catch(() => "[]")) as Case[]
  ).filter((c) => c.note?.startsWith("synthetic"));
  await writeFile(
    FILE,
    JSON.stringify([...cases, ...existing], null, 2) + "\n",
  );
  console.log(
    `wrote ${cases.length} live cases + ${existing.length} synthetic`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--build") {
    await build(args[1]);
    await pool().end();
    return;
  }

  const cases = (JSON.parse(await readFile(FILE, "utf8")) as Case[]).filter(
    (c) => !args.length || args.includes(c.id),
  );
  if (!cases.length) {
    console.error("no cases matched", args.join(", "));
    process.exitCode = 1;
    return;
  }

  const results: (SecondPassOutcome & {
    id: string;
    expect: string;
    pass: boolean;
  })[] = [];

  for (const c of cases) {
    const q = ask(c);
    const hit = rematch(q);
    const out: SecondPassOutcome = hit
      ? {
          readingId: c.id,
          metricCode: c.metricCode,
          outcome: "rematch",
          line: hit.line,
          note: `${hit.value}${hit.unit ? ` ${hit.unit}` : ""}`,
        }
      : judge(q, await askSheet(q), c.strikes ?? 0);
    results.push({
      ...out,
      id: c.id,
      expect: c.expect,
      pass: out.outcome === c.expect,
    });
    console.log(`· ${c.id} … ${out.outcome}`);
  }

  console.log("");
  console.table(
    results.map((r) => ({
      case: r.id,
      settled: r.outcome,
      wanted: r.expect,
      evidence: (r.line ?? "—").slice(0, 64),
      pass: r.pass ? "ok" : "FAIL",
    })),
  );

  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  console.log(
    `\n${results.length} rows: re-match ${count("rematch")}, model ${count("model")}, ` +
      `corrected ${count("corrected")}, unverified ${count("unverified")}, ` +
      `left for the person ${count("person")}`,
  );

  const file = path.join(
    HERE,
    "results",
    `second-pass-${new Date().toISOString().slice(0, 10)}.json`,
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
  console.log(`wrote ${path.relative(process.cwd(), file)}`);

  if (results.some((r) => !r.pass)) process.exitCode = 1;
}

await main();
