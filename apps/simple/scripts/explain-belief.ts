/**
 * One belief, taken apart. Read-only.
 *
 *   pnpm --filter simple exec tsx --env-file=.env scripts/explain-belief.ts <userId> <conditionId>
 *
 * Prints the base rate, every prior modifier with whether it fired, the
 * modified prior, and every evidence row the engine read (for, against,
 * superseded, correlated, missing) with its LR. The same `buildModelInput`,
 * `catalogFor` and `scoreHypotheses` the pages use, so what it prints is what
 * the person's card says.
 */
import { buildModelInput } from "@/lib/coverage";
import { catalogFor } from "@/lib/hkb";
import { modifierApplies, priorFor, scoreHypotheses } from "@/lib/hypotheses";

async function main() {
  const [userId, conditionId] = process.argv.slice(2);
  if (!userId || !conditionId) {
    console.error("usage: explain-belief.ts <userId> <conditionId>");
    process.exitCode = 1;
    return;
  }
  const [m, catalog] = await Promise.all([
    buildModelInput(userId),
    catalogFor(userId),
  ]);
  const h = catalog.find((x) => x.id === conditionId);
  if (!h) {
    console.error(`${conditionId} is not in this person's catalog`);
    process.exitCode = 1;
    return;
  }
  const rows = scoreHypotheses(m, { catalog });
  const r = rows.find((x) => x.id === conditionId);
  // The scores in the order the engine wrote them, up to this condition, so a
  // `hypothesis:` modifier reads exactly what it read inside the run.
  const order = catalog.map((x) => x.id);
  const upTo = order.indexOf(conditionId);
  const scores = new Map(
    rows
      .filter((x) => order.indexOf(x.id) < upTo)
      .map((x) => [x.id, x.score] as const),
  );

  const base = priorFor(h, m);
  console.log(`${h.name} (${h.id}) for ${userId}, as of ${m.today}`);
  console.log(`order: #${upTo + 1} of ${order.length}`);
  console.log(`base rate ${base.prevalence}  (${base.source ?? "no source"})`);
  let product = 1;
  const counted = new Map<string, number>();
  for (const mod of h.priors.modifiers) {
    if (mod.share != null) {
      console.log(
        `  SHARE  ${mod.share} of ${JSON.stringify(mod.when)} (${mod.grade ?? "C"})${mod.population ? ` study: ${mod.population}` : ""}  ${mod.why}`,
      );
      continue;
    }
    const on = modifierApplies(mod, m, scores);
    // modifiers sharing a why count once, the strongest either way (engine rule)
    const was = counted.get(mod.why) ?? 1;
    if (on && Math.abs(Math.log(mod.times)) > Math.abs(Math.log(was)))
      counted.set(mod.why, mod.times);
    console.log(
      `  ${on ? "FIRES" : "  -  "} x${mod.times}  ${JSON.stringify(mod.when)}  ${mod.why}`,
    );
  }
  for (const t of counted.values()) product *= t;
  console.log(
    `modifiers x${+product.toFixed(3)} → prior ${r?.prior ?? "not scored"}`,
  );
  if (!r) {
    console.log("not scored: its gate or its `requires` is closed.");
    return;
  }
  if (r.mixture)
    console.log(
      `mixture: P(C|${r.mixture.given}) ${r.mixture.pGiven} (share ${r.mixture.share}, counted ${r.mixture.counted}) x p(X) ${scores.get(r.mixture.given.replace(/^hypothesis:/, "")) ?? "?"} + P(C|not) ${r.mixture.pNot} → prior ${r.prior}`,
    );
  for (const k of r.mixtureSkipped ?? [])
    console.log(`mixture: share on ${k.given} not applied: ${k.why}`);
  const line = (
    tag: string,
    e: {
      rule: string;
      input: string;
      value?: string;
      lr: number;
      grade?: string;
      discounted?: number;
    },
  ) =>
    console.log(
      `  ${tag.padEnd(8)} ${e.rule.padEnd(28)} ${e.input.padEnd(26)} ${String(e.value ?? "").padEnd(16)} LR ${e.lr}${e.discounted != null ? ` counted ${e.discounted}` : ""}${e.grade ? ` (${e.grade})` : ""}`,
    );
  console.log("evidence:");
  for (const e of r.for) line("for", e);
  for (const e of r.against) line("against", e);
  for (const e of r.superseded)
    line("supersd", { ...e, input: `${e.input} by ${e.by}` });
  for (const e of r.correlated)
    line("corr", {
      rule: e.rule,
      input: `${e.input} with ${e.with}`,
      lr: e.lr,
      discounted: e.counted,
    });
  for (const e of r.confounded) console.log(`  confound ${e.input} ${e.tag}`);
  console.log(
    `  missing: ${r.missing.map((x) => x.input).join(", ") || "none"}`,
  );
  console.log(`p = ${r.score}  state ${r.state}`);
  console.log(
    `next tests: ${
      r.nextTests
        .slice(0, 4)
        .map((t) => `${t.test} (shift ${t.expectedShift})`)
        .join("; ") || "none"
    }`,
  );
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  const { pool } = await import("@/db");
  main()
    .then(() => pool().end())
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
