/**
 * The capture eval:
 *
 *   pnpm --filter simple eval:capture [caseId ...]
 *
 * Eight described photos — a dinner plate, a supplement bottle, a pill box, a
 * lab sheet, a letter, a misread portion, a bicycle — each carrying the
 * extraction a vision model would hand back. No model runs here: the whole
 * point of the split is that everything after the extraction is arithmetic,
 * so the split into chips, the totals, the plausibility floor and the routing
 * are all checkable without a network.
 *
 * What it asserts: every expected chip, with its kind and value; no chip that
 * must not be there; and the two rules that matter most — food never becomes a
 * reading, and a lab sheet produces no chips at all because it belongs to the
 * upload pipeline.
 *
 * Results land in `evals/results/capture-<date>.json`. Exits non-zero when a
 * case fails.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureSchema,
  mealTotals,
  routeOf,
  toChips,
  type CaptureExtract,
} from "@/lib/capture";
import type { Chip } from "@/lib/compose";

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface CaptureCase {
  id: string;
  /** What the photo is, in words. The fixture is the extraction below it. */
  photo: string;
  today: string;
  takenAt: string | null;
  extract: CaptureExtract;
  expect: {
    /** `lab`, `document`, or null when the chips are the answer. */
    route: "lab" | "document" | null;
    chips: { key: string; kind?: string; value?: string | number }[];
    notChips?: string[];
    notKinds?: string[];
    estimated?: boolean;
  };
}

const describeChip = (c: Chip) => `${c.key}=${String(c.value)}`;

function check(c: CaptureCase, chips: Chip[]): string[] {
  const failed: string[] = [];

  // The schema is closed: an extraction that does not parse never gets here.
  const parsed = captureSchema.safeParse(c.extract);
  if (!parsed.success) failed.push("the extraction does not fit the schema");

  const route = routeOf(c.extract.kind);
  if (route !== c.expect.route)
    failed.push(
      `routed to ${route ?? "chips"}, wanted ${c.expect.route ?? "chips"}`,
    );

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

  // Two invariants that hold for every photo there will ever be.
  if (route && chips.length)
    failed.push(`a ${route} photo produced ${chips.length} chips`);
  for (const chip of chips.filter((x) => x.kind === "nutrition"))
    if (!/estimate/.test(chip.label))
      failed.push(`${chip.key} is not labelled an estimate`);

  if (c.expect.estimated) {
    const totals = mealTotals(c.extract);
    if (!totals) failed.push("no totals for a meal");
  }
  return failed;
}

async function main() {
  const ids = process.argv.slice(2);
  const cases = (
    JSON.parse(
      await readFile(path.join(HERE, "capture", "cases.json"), "utf8"),
    ) as CaptureCase[]
  ).filter((c) => !ids.length || ids.includes(c.id));
  if (!cases.length) {
    console.error("no cases matched", ids.join(", "));
    process.exitCode = 1;
    return;
  }

  const results = cases.map((c) => {
    process.stdout.write(`· ${c.id} … `);
    const chips = toChips(c.extract, {
      today: c.today,
      takenAt: c.takenAt,
    });
    const failed = check(c, chips);
    console.log(
      `${c.extract.kind}, ${chips.length} chips, ${failed.length ? "FAIL" : "pass"}`,
    );
    return {
      id: c.id,
      kind: c.extract.kind,
      chips: chips.map(describeChip),
      failed,
      pass: !failed.length,
    };
  });

  console.log("");
  console.table(
    results.map((r) => ({
      case: r.id,
      kind: r.kind,
      chips: r.chips.join(" ") || "-",
      pass: r.pass ? "ok" : "FAIL",
    })),
  );
  for (const r of results)
    for (const f of r.failed) console.log(`  ${r.id}: ${f}`);

  const file = path.join(
    HERE,
    "results",
    `capture-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(
    `\n${results.filter((r) => r.pass).length}/${results.length} · wrote ${path.relative(process.cwd(), file)}`,
  );

  if (results.some((r) => !r.pass)) process.exitCode = 1;
}

await main();
