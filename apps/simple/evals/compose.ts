/**
 * The composer eval:
 *
 *   pnpm --filter simple eval:compose [caseId ...]
 *
 * Twelve free-text posts, each run twice: once with the rules alone, once with
 * the rules plus the ontology and the model. The rules pass has to produce
 * every expected chip and the expected follow-up on its own, because the box is
 * meant to work with the model off. The model pass is allowed to add chips and
 * is never allowed to contradict one the rules already wrote — that is the
 * whole contract between the two layers, and it is what this checks.
 *
 * Results land in `evals/results/compose-<date>.json`. Exits non-zero when a
 * case fails.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { personaToInput } from "@/evals/persona";
import {
  followUp,
  readActionStatement,
  understand,
  understandRules,
  type ActionSubject,
  type Chip,
} from "@/lib/compose";
import { loadCatalog } from "@/lib/hkb";
import { loadGraph } from "@/lib/kg";

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface ComposeCase {
  id: string;
  text: string;
  today: string;
  /**
   * Phase 27 addendum: the plan action a card's Discuss opened the box about.
   * The words are then read relative to it as well, and never sent to the
   * ontology lookup — which is what "i already do this" used to hit.
   */
  about?: ActionSubject;
  /** the account this post is written from */
  facts?: Record<string, unknown>;
  readings?: { code: string; value: number; unit?: string; date: string }[];
  expect: {
    /** every one of these has to be there, with this value */
    chips: { key: string; value?: string | number; kind?: string }[];
    /** chips that must never appear */
    notChips?: string[];
    /**
     * Kinds that must never appear. A hearsay post is the case this exists
     * for: it says something about the world, so it must write nothing at all
     * about the person.
     */
    notKinds?: string[];
    /** the key of the one question asked back, or null for none */
    followUp: string | null;
    /** what the words said about the action the box is about */
    action?: {
      stance: string;
      label?: string;
      exerciseDays?: string;
    } | null;
  };
}

interface Result {
  id: string;
  action?: string;
  rules: { chips: string[]; followUp: string | null; failed: string[] };
  model: { chips: string[]; followUp: string | null; failed: string[] };
  pass: boolean;
}

const describe = (c: Chip) =>
  c.kind === "claim" ? c.label : `${c.key}=${String(c.value)}`;

function check(
  c: ComposeCase,
  chips: Chip[],
  ask: string | null,
  { needFollowUp }: { needFollowUp: boolean },
): string[] {
  const failed: string[] = [];
  for (const want of c.expect.chips) {
    const got = chips.find((x) => x.key === want.key);
    if (!got) {
      failed.push(`missing chip ${want.key}`);
      continue;
    }
    if (want.value != null && String(got.value) !== String(want.value))
      failed.push(`${want.key} is ${String(got.value)}, wanted ${want.value}`);
    if (want.kind && got.kind !== want.kind)
      failed.push(`${want.key} is a ${got.kind}, wanted a ${want.kind}`);
  }
  for (const never of c.expect.notChips ?? [])
    if (chips.some((x) => x.key === never)) failed.push(`wrote ${never}`);
  for (const never of c.expect.notKinds ?? [])
    for (const chip of chips.filter((x) => x.kind === never))
      failed.push(`wrote a ${never}: ${chip.key}`);
  if (needFollowUp && ask !== c.expect.followUp)
    failed.push(`asked back "${ask}", wanted "${c.expect.followUp}"`);
  return failed;
}

async function main() {
  const ids = process.argv.slice(2);
  const cases = (
    JSON.parse(
      await readFile(path.join(HERE, "compose", "cases.json"), "utf8"),
    ) as ComposeCase[]
  ).filter((c) => !ids.length || ids.includes(c.id));
  if (!cases.length) {
    console.error("no cases matched", ids.join(", "));
    process.exitCode = 1;
    return;
  }

  const [catalog, graph] = await Promise.all([loadCatalog(), loadGraph()]);
  const results: Result[] = [];

  for (const c of cases) {
    process.stdout.write(`· ${c.id} … `);
    const m = personaToInput({
      today: c.today,
      facts: c.facts ?? {},
      readings: c.readings ?? [],
    });

    /**
     * The action layer is rules and nothing else, so it runs in the rules pass
     * and its result is checked there: a statement about an action never needs
     * a model and never needs the ontology.
     */
    const read = c.about
      ? readActionStatement(c.text, c.about, c.today)
      : null;
    const actionFailed: string[] = [];
    const want = c.expect.action;
    if (want === null && read)
      actionFailed.push(`read "${read.label}" and wanted nothing`);
    if (want) {
      if (!read) actionFailed.push(`read nothing, wanted ${want.stance}`);
      else {
        if (read.stance !== want.stance)
          actionFailed.push(`stance ${read.stance}, wanted ${want.stance}`);
        if (want.label && read.label !== want.label)
          actionFailed.push(`label "${read.label}", wanted "${want.label}"`);
        if (want.exerciseDays && read.exerciseDays !== want.exerciseDays)
          actionFailed.push(
            `exercise ${read.exerciseDays ?? "none"}, wanted ${want.exerciseDays}`,
          );
      }
    }

    const ruleChips = understandRules(c.text, m, c.today);
    const ruleAsk = followUp(ruleChips, m, catalog, graph);
    const rules = {
      chips: ruleChips.map(describe),
      followUp: ruleAsk?.key ?? null,
      failed: [
        ...actionFailed,
        ...check(c, ruleChips, ruleAsk?.key ?? null, { needFollowUp: true }),
      ],
    };

    const allChips = await understand(c.text, m).catch((e) => {
      console.error(e);
      return ruleChips;
    });
    const allAsk = followUp(allChips, m, catalog, graph);
    const failed = check(c, allChips, allAsk?.key ?? null, {
      needFollowUp: false,
    });
    // The one rule the model layer lives under: it may add, never contradict.
    for (const before of ruleChips) {
      const after = allChips.find((x) => x.key === before.key);
      if (!after) failed.push(`the model dropped ${before.key}`);
      else if (String(after.value) !== String(before.value))
        failed.push(
          `the model changed ${before.key} from ${String(before.value)} to ${String(after.value)}`,
        );
    }
    const model = {
      chips: allChips.map(describe),
      followUp: allAsk?.key ?? null,
      failed,
    };

    const pass = !rules.failed.length && !model.failed.length;
    results.push({
      id: c.id,
      ...(read ? { action: read.label } : {}),
      rules,
      model,
      pass,
    });
    console.log(
      `rules ${ruleChips.length} chips, +model ${allChips.length}, ${pass ? "pass" : "FAIL"}`,
    );
  }

  console.log("");
  console.table(
    results.map((r) => ({
      case: r.id,
      rules: r.rules.chips.join(" ") || r.action || "-",
      asked: r.rules.followUp ?? "-",
      added:
        r.model.chips.filter((c) => !r.rules.chips.includes(c)).join(" ") ||
        "-",
      pass: r.pass ? "ok" : "FAIL",
    })),
  );
  for (const r of results)
    for (const f of [...r.rules.failed, ...r.model.failed])
      console.log(`  ${r.id}: ${f}`);

  const file = path.join(
    HERE,
    "results",
    `compose-${new Date().toISOString().slice(0, 10)}.json`,
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
}

await main();
