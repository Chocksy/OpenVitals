/**
 * Phase 43A: the setup flow's question loop, run over every journey persona.
 *
 *   pnpm --filter simple eval:setup [id ...]
 *
 * Each journey runs twice: with no readings (a new person with nothing
 * uploaded) and with the persona's starting readings (a new person whose
 * report was read first). The loop is the server's: `pickQuestion` over
 * `nextMoves`, excluding answered, asked and skipped keys, capped at
 * `SETUP_QUESTIONS`, each answer taken from `truth.answers`. Then the reveal
 * picture (`pictureOf`) and where each true condition ranks.
 *
 * Fails on a key asked twice, more than the cap, or a question whose
 * `appliesTo` excludes the persona. The hit rate is printed, not asserted:
 * the first run is the baseline. No model, no writes; the catalog is read
 * the way `eval:journeys` reads it.
 */
import { loadCatalog } from "@/lib/hkb";
import { scoreHypotheses, type Catalog } from "@/lib/hypotheses";
import { beliefsOf, nextMoves } from "@/lib/infogain";
import { JOURNEYS, type Journey } from "@/lib/journey";
import { applyOverlay, type Overlay } from "@/lib/sample";
import {
  addOnce,
  emptySetup,
  excludedKeys,
  pickQuestion,
  SETUP_QUESTIONS,
} from "@/lib/setup";
import { pictureOf } from "@/lib/setup-server";
import { SYMPTOMS } from "@/lib/symptoms";
import { PROFILE_QUESTIONS } from "@/lib/vectors";
import { personaToInput } from "./persona";

type Labs = "none" | "start";

interface Row {
  id: string;
  labs: Labs;
  questions: number;
  rank: string;
  top3: boolean | null;
  keys: string;
  problems: string[];
}

function answerOf(j: Journey, key: string): string {
  const options = PROFILE_QUESTIONS[key]?.options ?? [];
  const truth = j.truth.answers[key];
  if (truth != null && options.includes(truth)) return truth;
  return options.includes("Not sure") ? "Not sure" : options[0]!;
}

function run(j: Journey, labs: Labs, catalog: Catalog): Row {
  const base = personaToInput({
    today: j.today,
    facts: j.start.facts,
    readings: labs === "none" ? [] : j.start.readings,
  });
  const overlay: Overlay = { readings: [], facts: {}, confounders: {} };
  let input = applyOverlay(base, overlay);
  let state = { ...emptySetup(`${j.today}T00:00:00Z`), hasReport: false };
  const asked: string[] = [];
  const problems: string[] = [];

  while (asked.length < SETUP_QUESTIONS) {
    const facts = new Set(
      Object.entries(input.profile)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k]) => k),
    );
    const move = pickQuestion(
      nextMoves(input, catalog, {
        exclude: excludedKeys(state, { facts, uploads: 0 }),
      }),
    );
    if (!move) break;
    const key = move.featureId.slice(5);
    if (asked.includes(key)) problems.push(`${key} asked twice`);
    const gate = SYMPTOMS.find((s) => s.key === key)?.appliesTo;
    if (
      gate &&
      ((gate.sex && input.sex !== gate.sex) ||
        (gate.minAge != null && (input.age ?? 0) < gate.minAge) ||
        (gate.maxAge != null && (input.age ?? Infinity) > gate.maxAge))
    )
      problems.push(`${key} does not apply to ${input.sex} ${input.age}`);
    asked.push(key);
    state = { ...state, asked: addOnce(state.asked, key) };
    overlay.facts = { ...overlay.facts, [key]: answerOf(j, key) };
    input = applyOverlay(base, overlay);
  }
  if (asked.length > SETUP_QUESTIONS)
    problems.push(`${asked.length} questions, cap ${SETUP_QUESTIONS}`);

  const beliefs = beliefsOf(scoreHypotheses(input, { catalog })).sort(
    (a, b) => b.p - a.p,
  );
  const names = new Map(catalog.map((h) => [h.id, h.name]));
  const picture = new Set(pictureOf(beliefs, names).map((r) => r.id));
  const truth = j.truth.conditions;
  const rank = truth.map((id) => {
    const i = beliefs.findIndex((b) => b.id === id);
    return i < 0 ? `${id} -` : `${id} ${i + 1}`;
  });

  return {
    id: j.id,
    labs,
    questions: asked.length,
    rank: rank.join(", ") || "-",
    top3: truth.length ? truth.some((id) => picture.has(id)) : null,
    keys: asked.join(" "),
    problems,
  };
}

async function main() {
  const ids = process.argv.slice(2);
  const journeys = JOURNEYS.filter((j) => !ids.length || ids.includes(j.id));
  const catalog = await loadCatalog();
  const rows: Row[] = [];
  for (const j of journeys)
    for (const labs of ["none", "start"] as const) {
      const r = run(j, labs, catalog);
      rows.push(r);
      console.log(
        `${r.id.padEnd(32)} ${labs.padEnd(5)} q=${String(r.questions).padEnd(2)} rank: ${r.rank}  top3: ${r.top3 == null ? "n/a" : r.top3 ? "yes" : "no"}\n    ${r.keys}${r.problems.length ? `\n    PROBLEM: ${r.problems.join("; ")}` : ""}`,
      );
    }

  console.log("");
  for (const labs of ["none", "start"] as const) {
    const scored = rows.filter((r) => r.labs === labs && r.top3 != null);
    const hits = scored.filter((r) => r.top3).length;
    const qs = rows.filter((r) => r.labs === labs).map((r) => r.questions);
    console.log(
      `hit rate (true condition on the reveal picture), labs ${labs}: ${hits}/${scored.length} (${Math.round((hits / Math.max(scored.length, 1)) * 100)} %), mean questions ${(qs.reduce((s, x) => s + x, 0) / Math.max(qs.length, 1)).toFixed(1)}`,
    );
  }
  const bad = rows.filter((r) => r.problems.length);
  if (bad.length) {
    console.error(`\n${bad.length} run(s) broke a setup rule`);
    process.exitCode = 1;
  } else console.log("\nno key asked twice, none over the cap, none gated out");
  process.exit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
