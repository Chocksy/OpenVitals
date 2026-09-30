/**
 * Phase 44C: six months of check-ins, replayed over every journey persona
 * with a known true condition.
 *
 *   pnpm --filter simple eval:checkin [id ...]
 *
 * Day 0 is the persona's `today`: its starting facts and readings, a planted
 * symptom answered "No", then the Phase 43 setup loop (the same loop
 * `eval:setup` runs). From there the calendar steps a week at a time to day
 * 182. With check-ins, a round runs whenever `nextDue` has come: the queue is
 * `pickRound` over `roundInputOf`, built the way `checkinBody` builds it, and
 * every answer re-dates its fact (the way `saveFact` does). Without
 * check-ins, the day-0 facts and their dates stay frozen, so they fade.
 *
 * Printed, not asserted: the first run is the baseline (spec part C). No
 * model and no writes; the catalog is read the way `eval:journeys` reads it.
 * Hunches need the database and a model, so there are none here: pool 2 is
 * always empty and nothing is being tried, so every cycle is 14 days.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  firstState,
  nextDueOf,
  pickRound,
  REPEAT_DAYS,
  type CheckinState,
} from "@/lib/checkin";
import { probeOf, roundInputOf, watchOf } from "@/lib/checkin-server";
import { currentRevision, loadCatalog } from "@/lib/hkb";
import {
  scoreHypotheses,
  type Catalog,
  type EvidenceRule,
} from "@/lib/hypotheses";
import { nextMoves, QUIET_BELIEF } from "@/lib/infogain";
import { JOURNEYS, type Journey } from "@/lib/journey";
import {
  addOnce,
  emptySetup,
  excludedKeys,
  pickQuestion,
  SETUP_QUESTIONS,
} from "@/lib/setup";
import { SYMPTOMS } from "@/lib/symptoms";
import { PROFILE_QUESTIONS } from "@/lib/vectors";
import { personaToInput } from "./persona";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DAY_MS = 86_400_000;
const DAYS = 182; // six months
const STEP = 7; // cycles are 7 or 14 days, so a weekly grid sees every round
const PLANT_DAY = 120; // month 4

const dayOf = (day0: string, d: number) =>
  new Date(Date.parse(day0) + d * DAY_MS).toISOString().slice(0, 10);

interface Planted {
  key: string;
  yes: string;
  condition: string;
}

interface Round {
  day: number;
  keys: string[];
  answered: string[];
  skipped: string[];
}

interface Result {
  id: string;
  conditions: string[];
  planted: Planted | null;
  setupKeys: string[];
  setupSkipped: string[];
  /** first day any true condition's score reached QUIET_BELIEF; null = never */
  reachWith: number | null;
  reachWithout: number | null;
  /** best true-condition score, day 0 and day 182 */
  p0: number;
  pEndWith: number;
  pEndWithout: number;
  answered: number;
  skipped: number;
  rounds: Round[];
  /** "direct", "sibling:<key>", or "no" for the first two cycles from day 120 */
  plantedReasked: string;
  /** the first round day at or after month 4 that asked the planted key */
  plantedAskedDay: number | null;
}

/**
 * The option a rule reads with lr > 1, when its `when` names one the
 * question offers (`equals`, or an `includes` alternative). Null otherwise.
 */
function optionOf(rule: EvidenceRule, key: string): string | null {
  const options = PROFILE_QUESTIONS[key]?.options ?? [];
  if (rule.lr <= 1) return null;
  const { equals, includes } = rule.when;
  if (equals != null)
    return (
      options.find((o) => o.toLowerCase() === equals.toLowerCase()) ?? null
    );
  if (includes != null) {
    const alts = includes.toLowerCase().split("|");
    return (
      options.find((o) => alts.some((a) => o.toLowerCase().includes(a))) ?? null
    );
  }
  return null;
}

const rulesFor = (catalog: Catalog, ids: string[], key: string) =>
  catalog
    .filter((h) => ids.includes(h.id))
    .flatMap((h) => h.evidence.filter((e) => e.input.fact === key));

/** The first SYMPTOMS key a true condition's rule reads, with its "yes". */
function plantedOf(j: Journey, catalog: Catalog): Planted | null {
  const sex = j.start.facts.sex;
  const age =
    Number(j.today.slice(0, 4)) - Number(j.start.facts.birth_year ?? 0);
  for (const condition of j.truth.conditions)
    for (const s of SYMPTOMS) {
      const g = s.appliesTo;
      if (
        g &&
        ((g.sex && sex !== g.sex) ||
          (g.minAge != null && age < g.minAge) ||
          (g.maxAge != null && age > g.maxAge))
      )
        continue;
      // "No" at setup has to be one of the question's own options.
      if (!s.options.includes("No")) continue;
      for (const rule of rulesFor(catalog, [condition], s.key)) {
        const yes = optionOf(rule, s.key);
        if (yes) return { key: s.key, yes, condition };
      }
    }
  return null;
}

/**
 * What the persona answers on `day`, or null to skip. The planted key is
 * "No" before month 4 and its "yes" from then on. Else the journey's truth
 * table; else the option a true condition's rule reads with lr > 1 (the side
 * the condition makes more likely); else a skip. `truth.defaultAnswer` is not
 * used: a check-in answer nobody wrote down is a skip, not a guess.
 */
function answerOf(
  j: Journey,
  catalog: Catalog,
  planted: Planted | null,
  key: string,
  day: number,
): string | null {
  const options = PROFILE_QUESTIONS[key]?.options ?? [];
  if (planted?.key === key) return day < PLANT_DAY ? "No" : planted.yes;
  const truth = j.truth.answers[key];
  if (truth != null) {
    const hit = options.find((o) => o.toLowerCase() === truth.toLowerCase());
    if (hit) return hit;
  }
  for (const rule of rulesFor(catalog, j.truth.conditions, key)) {
    const yes = optionOf(rule, key);
    if (yes) return yes;
  }
  return null;
}

function run(j: Journey, catalog: Catalog): Result {
  const day0 = j.today;
  const planted = plantedOf(j, catalog);
  const facts: Record<string, unknown> = { ...j.start.facts };
  if (planted) facts[planted.key] = "No";
  const at: Record<string, string> = Object.fromEntries(
    Object.keys(facts).map((k) => [k, day0]),
  );
  const inputAt = (
    today: string,
    f: Record<string, unknown>,
    a: Record<string, string>,
  ) =>
    personaToInput({
      today,
      facts: f,
      readings: j.start.readings,
      profileAt: a,
    });
  const best = (rows: ReturnType<typeof scoreHypotheses>) =>
    Math.max(
      0,
      ...rows
        .filter((r) => j.truth.conditions.includes(r.id))
        .map((r) => r.score),
    );

  // Setup on day 0, as `eval:setup` runs it (skips count toward the cap).
  let setup = emptySetup(`${day0}T00:00:00Z`);
  while (setup.asked.length + setup.skipped.length < SETUP_QUESTIONS) {
    const known = new Set(
      Object.entries(facts)
        .filter(([, v]) => v != null && String(v).trim() !== "")
        .map(([k]) => k),
    );
    const move = pickQuestion(
      nextMoves(inputAt(day0, facts, at), catalog, {
        exclude: excludedKeys(setup, { facts: known, uploads: 0 }),
      }),
    );
    if (!move) break;
    const key = move.featureId.slice(5);
    const value = answerOf(j, catalog, planted, key, 0);
    if (value == null) {
      setup = { ...setup, skipped: addOnce(setup.skipped, key) };
      continue;
    }
    setup = { ...setup, asked: addOnce(setup.asked, key) };
    facts[key] = value;
    at[key] = day0;
  }

  const frozen = { facts: { ...facts }, at: { ...at } };
  const p0 = best(scoreHypotheses(inputAt(day0, facts, at), { catalog }));
  let reachWith = p0 >= QUIET_BELIEF ? 0 : null;
  let reachWithout = reachWith;
  let pEndWith = p0;
  let pEndWithout = p0;

  let state: CheckinState = firstState(`${day0}T00:00:00Z`, `${day0}T00:00:00Z`);
  const skippedAt: Record<string, string> = {};
  const rounds: Round[] = [];

  for (let d = STEP; d <= DAYS; d += STEP) {
    const today = dayOf(day0, d);
    const now = `${today}T00:00:00Z`;

    if (Date.parse(now) >= Date.parse(state.nextDue)) {
      const input = inputAt(today, facts, at);
      const rows = scoreHypotheses(input, { catalog });
      const { faded } = watchOf(rows, []);
      // `recentKeysOf`: answered in the last REPEAT_DAYS, plus its skips.
      const since = dayOf(today, -REPEAT_DAYS);
      const recentKeys = new Set([
        ...Object.entries(at)
          .filter(([, day]) => day >= since)
          .map(([k]) => k),
        ...Object.entries(skippedAt)
          .filter(
            ([, iso]) =>
              Date.parse(now) - Date.parse(iso) < REPEAT_DAYS * DAY_MS,
          )
          .map(([k]) => k),
      ]);
      const queue = pickRound(
        roundInputOf({
          rows,
          hunches: [],
          moves: nextMoves(probeOf(input, faded.keys()), catalog),
          followups: [],
          recentKeys,
          lastRounds: state.recent,
          catalog,
          profile: input.profile,
          nowIso: now,
        }),
      );
      // The queue is picked once at round start, so answering it in one go
      // is what the server does across the round's screens.
      const round: Round = { day: d, keys: [], answered: [], skipped: [] };
      for (const item of queue) {
        round.keys.push(item.key);
        const value = answerOf(j, catalog, planted, item.key, d);
        if (value == null) {
          round.skipped.push(item.key);
          skippedAt[item.key] = now;
        } else {
          round.answered.push(item.key);
          facts[item.key] = value;
          at[item.key] = today;
        }
      }
      rounds.push(round);
      state = {
        ...state,
        lastDone: now,
        nextDue: nextDueOf(now, false),
        recent: queue.length
          ? [queue.map((i) => i.key), ...state.recent].slice(0, 2)
          : state.recent,
      };
    }

    pEndWith = best(scoreHypotheses(inputAt(today, facts, at), { catalog }));
    pEndWithout = best(
      scoreHypotheses(inputAt(today, frozen.facts, frozen.at), { catalog }),
    );
    if (reachWith == null && pEndWith >= QUIET_BELIEF) reachWith = d;
    if (reachWithout == null && pEndWithout >= QUIET_BELIEF) reachWithout = d;
  }

  // The first two cycles on or after month 4: did one ask the planted key,
  // or another key a rule of the same condition reads?
  let plantedReasked = "n/a";
  if (planted) {
    const two = rounds.filter((r) => r.day >= PLANT_DAY).slice(0, 2);
    const keys = two.flatMap((r) => r.keys);
    const sibling = keys.find(
      (k) =>
        k !== planted.key &&
        rulesFor(catalog, [planted.condition], k).length > 0,
    );
    plantedReasked = keys.includes(planted.key)
      ? "direct"
      : sibling
        ? `sibling:${sibling}`
        : "no";
  }

  return {
    id: j.id,
    conditions: j.truth.conditions,
    planted,
    setupKeys: setup.asked,
    setupSkipped: setup.skipped,
    reachWith,
    reachWithout,
    p0,
    pEndWith,
    pEndWithout,
    answered: rounds.reduce((s, r) => s + r.answered.length, 0),
    skipped: rounds.reduce((s, r) => s + r.skipped.length, 0),
    rounds,
    plantedReasked,
    plantedAskedDay:
      rounds.find(
        (r) => r.day >= PLANT_DAY && planted && r.keys.includes(planted.key),
      )?.day ?? null,
  };
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const dayCell = (d: number | null) => (d == null ? "never" : `d${d}`);

async function main() {
  const ids = process.argv.slice(2);
  const journeys = JOURNEYS.filter(
    (j) => j.truth.conditions.length && (!ids.length || ids.includes(j.id)),
  );
  if (!journeys.length) {
    console.error("no journeys matched", ids.join(", "));
    process.exitCode = 1;
    return;
  }
  const catalog = await loadCatalog();
  const kbRevision = await currentRevision();
  const results: Result[] = [];
  for (const j of journeys) {
    process.stdout.write(`· ${j.id} … `);
    const r = run(j, catalog);
    results.push(r);
    console.log(
      `${r.rounds.filter((x) => x.keys.length).length} rounds, ${r.answered + r.skipped} questions`,
    );
  }

  console.log("");
  console.table(
    results.map((r) => ({
      persona: r.id,
      truth: r.conditions.join(" "),
      p0: pct(r.p0),
      reachWith: dayCell(r.reachWith),
      reachWithout: dayCell(r.reachWithout),
      endWith: pct(r.pEndWith),
      endWithout: pct(r.pEndWithout),
      asked: r.answered + r.skipped,
      skipped: r.skipped,
      planted: r.planted?.key ?? "-",
      reasked: r.plantedReasked,
      askedOn: dayCell(r.plantedAskedDay),
    })),
  );
  const earlier = results.filter(
    (r) =>
      r.reachWith != null &&
      (r.reachWithout == null || r.reachWith < r.reachWithout),
  ).length;
  const reasked = results.filter(
    (r) => r.plantedReasked !== "no" && r.plantedReasked !== "n/a",
  ).length;
  console.log(
    `\nreached the picture earlier with check-ins: ${earlier}/${results.length}; planted symptom re-asked (direct or sibling) within two cycles of day ${PLANT_DAY}: ${reasked}/${results.filter((r) => r.planted).length}`,
  );

  const file = path.join(
    HERE,
    "results",
    `checkin-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      { ranAt: new Date().toISOString(), kbRevision, results },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);
  process.exit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
