/**
 * The blind replay (phase 41D), the eval that counts:
 *
 *   pnpm --filter simple eval:replay [--no-research] [--no-hindsight] [userId ...]
 *
 * Real histories, run through the engine as they stood on a past day. Nothing
 * after that day is visible: readings, facts and treatments are cut at
 * `asOf`, and the run asserts it. Nothing is written: hunches run dry, beliefs
 * are scored in memory, and the engine tables are counted before and after.
 *
 * Two parts per user:
 *  - hindsight recall: for each draw date D, the engine as of the day before
 *    D. What it would have asked for (top 5 test moves, hunch tests, coverage
 *    gaps) against what was measured for the first time on D or later.
 *  - checkpoints out of `evals/replay/cases.json`: top beliefs, top moves,
 *    raised hunches, and pass or fail per expectation, as it came.
 *
 * `--no-research` runs 41A+41B only. The default also runs 41C's case
 * research (`lib/cases.ts`) at each checkpoint when it exists. Results go to
 * `evals/results/replay-<date>.json`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, pool, readings } from "@/db";
import { buildModelInput, coverage, type ModelInput } from "@/lib/coverage";
import { allHistory, dayBefore, isTimeless } from "@/lib/facts";
import { currentRevision, loadCatalog } from "@/lib/hkb";
import {
  differentialLine,
  refreshHunches,
  type Differential,
  type DraftHunch,
  type HunchOverlay,
} from "@/lib/hunches";
import {
  noResponse,
  scoreHypotheses,
  type Catalog,
  type HState,
  type HypothesisResult,
} from "@/lib/hypotheses";
import { eurOf, nextMoves, type Move } from "@/lib/infogain";
import { SERVED } from "@/lib/research";

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface Expect {
  /** condition id to the quietest state it has to reach */
  beliefs?: Record<string, HState>;
  /** hunch keys that have to be raised */
  hunches?: string[];
  /**
   * At least one of these codes among the moves the engine says to pursue,
   * or as the test the named hunch chose. (`nextMoves` ranks free questions
   * above paid tests, so a top-N cut never reaches a blood test.)
   */
  moves?: { pursueOrHunchTest: string; anyOf: string[] };
  /** synthetic facts that have to hold, value contained in the answer */
  facts?: Record<string, string>;
  /**
   * Phase 41F: the differential of an open cause. It checks that the system
   * raises the right question, not a diagnosis: the list is at least
   * `minOptions` long, every option has a DOI or a catalog source, the shares
   * and the remainder sum to 1, each belief agrees with its share (the same
   * order, within `agreeWithin` times), and, when `named` is set, one option
   * whose name matches it carries a test out of `testAnyOf`.
   */
  differential?: {
    of: string;
    minOptions: number;
    agreeWithin?: number;
    named?: { pattern: string; testAnyOf: string[] };
  };
}

interface Checkpoint {
  asOf: string;
  note?: string;
  expect: Expect;
}

interface CaseFile {
  users: Record<
    string,
    {
      name: string;
      seed?: Record<string, unknown>;
      checkpoints: Checkpoint[];
    }
  >;
}

/** What 41C exports, when it has landed. */
type ResearchCase = (
  userId: string,
  opts: {
    asOf?: string;
    dryRun?: boolean;
    budgetUsd?: number;
    seed?: Record<string, unknown>;
  },
) => Promise<{
  proposals: unknown[];
  papers?: { doi: string }[];
  causeQueries?: string[];
  causePapers?: { doi: string; title: string; year: number }[];
  candidates?: { id: string; ring2?: boolean }[];
  accepted: number;
  costUsd: number;
  catalogOverlay?: unknown;
  /** set when the paper search could not run: "Europe PMC unavailable" */
  failed?: string | null;
}>;

/** The fields of a 41C proposal the replay prints. */
interface Accepted {
  decision: string;
  kind: string;
  conditionId: string | null;
  featureId: string | null;
  conditionOn: unknown;
  lrPos: number | null;
  grade: string | null;
  doi: string;
  quote: string;
  reason: string;
}

const STATES: HState[] = [
  "ruled_out",
  "unlikely",
  "possible",
  "likely",
  "confirmed",
];

const DAY = 86_400_000;
const days = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/** The codes a move would draw or the fact it would ask. */
const codesOf = (m: Move): string[] => {
  const apply = m.outcomes[0]?.apply;
  const codes = apply?.readings.map((r) => r.code) ?? [];
  if (codes.length) return [...new Set(codes)];
  return [m.featureId.replace(/^(metric|fact):/, "")];
};

/* ── blind: nothing after asOf, asserted ───────────────────────────────── */

/**
 * Throws when anything the engine read is dated after `asOf`, and returns the
 * latest date it did see. A fact counts as dated by its history row; a
 * timeless one (sex, birth year, genome) is allowed and listed.
 */
function assertBlind(
  asOf: string,
  input: ModelInput,
  history: { key: string; validFrom: string; changeKind: string }[],
  seed: Record<string, unknown>,
  drafts: { asOf: string | null; raised: { firedAt: string[] }[] },
) {
  const seen: string[] = [];
  const bad: string[] = [];
  const see = (what: string, d: string | null | undefined) => {
    if (!d) return;
    seen.push(d);
    if (d > asOf) bad.push(`${what} ${d}`);
  };
  for (const [code, v] of Object.entries(input.latest)) {
    see(`reading ${code}`, v.date);
    for (const d of v.history?.draws ?? []) see(`draw ${code}`, d.date);
  }
  for (const t of input.treatments ?? []) {
    see(`treatment ${t.what} started`, t.started);
    see(`treatment ${t.what} stopped`, t.stopped);
  }
  for (const t of Array.isArray(input.profile.treatments)
    ? input.profile.treatments
    : [])
    see(`treatments fact ${t?.what}`, String(t?.started ?? ""));
  const timeless: string[] = [];
  for (const key of Object.keys(input.profile)) {
    if (key in seed) continue;
    const rows = history.filter(
      (r) => r.key === key && r.changeKind !== "corrected",
    );
    if (isTimeless(key, (rows[0] as { source?: string } | undefined)?.source)) {
      timeless.push(key);
      continue;
    }
    const first = rows.map((r) => r.validFrom).sort()[0];
    see(`fact ${key}`, first);
  }
  see("hunch asOf", drafts.asOf);
  for (const s of drafts.raised) for (const d of s.firedAt) see("fired", d);
  if (bad.length)
    throw new Error(
      `the replay at ${asOf} saw the future: ${bad.slice(0, 8).join("; ")}`,
    );
  return { latest: seen.sort().pop() ?? null, timeless };
}

/* ── one day ───────────────────────────────────────────────────────────── */

interface Day {
  asOf: string;
  input: ModelInput;
  rows: HypothesisResult[];
  moves: Move[];
  drafts: DraftHunch[];
  raisedKeys: string[];
  gaps: string[];
  latestSeen: string | null;
  timeless: string[];
  /** the catalog the day was scored on, overlay included */
  catalog: Catalog;
}

async function runDay(
  userId: string,
  asOf: string,
  catalog: Catalog,
  seed: Record<string, unknown>,
  history: Awaited<ReturnType<typeof allHistory>>,
  overlay?: HunchOverlay | null,
): Promise<Day> {
  const input = await buildModelInput(userId, asOf, seed);
  const rows = scoreHypotheses(input, { catalog });
  const beliefs = Object.fromEntries(
    rows.map((h) => [
      h.id,
      {
        p: h.score,
        state: h.state,
        // P(C | X, data) where the prior came from a printed share
        ...(h.mixture
          ? { given: { [h.mixture.given]: h.mixture.posterior } }
          : {}),
      },
    ]),
  );
  const moves = nextMoves(input, catalog);
  const hunches = await refreshHunches(userId, asOf, {
    asOf,
    dryRun: true,
    beliefs,
    overlay,
    catalog,
  });
  const { latest, timeless } = assertBlind(asOf, input, history, seed, hunches);
  const gaps = coverage(input)
    .filter(
      (r) => r.vector.tier <= 1 && (r.state === "never" || r.state === "stale"),
    )
    .flatMap((r) => r.vector.codes ?? []);
  return {
    asOf,
    input,
    rows,
    moves,
    drafts: hunches.drafts ?? [],
    raisedKeys: hunches.raised.map((s) => s.key),
    gaps,
    latestSeen: latest,
    timeless,
    catalog,
  };
}

/* ── hindsight recall ──────────────────────────────────────────────────── */

type Source = "moves" | "hunch" | "coverage";

interface Hit {
  code: string;
  firstAt: string;
  askedAt: string;
  leadDays: number;
  by: Source[];
}

async function hindsight(
  userId: string,
  catalog: Catalog,
  seed: Record<string, unknown>,
  history: Awaited<ReturnType<typeof allHistory>>,
) {
  const first = await getDb()
    .select({
      code: readings.metricCode,
      at: sql<string>`min(${readings.observedAt})::text`,
    })
    .from(readings)
    .where(and(eq(readings.userId, userId), isNull(readings.source)))
    .groupBy(readings.metricCode);
  const firstAt = new Map(first.map((r) => [r.code, r.at]));
  const dates = (
    await getDb()
      .selectDistinct({ d: sql<string>`${readings.observedAt}::text` })
      .from(readings)
      .where(and(eq(readings.userId, userId), isNull(readings.source)))
  )
    .map((r) => r.d)
    .sort();

  // code -> the earliest day the engine asked for it, and by what
  const asked = new Map<string, { at: string; by: Set<Source> }>();
  const perDay: {
    draw: string;
    asOf: string;
    tests: string[];
    hunchTests: string[];
    gaps: number;
    latestSeen: string | null;
  }[] = [];
  for (const d of dates) {
    const asOf = dayBefore(d);
    const day = await runDay(userId, asOf, catalog, seed, history);
    const tests = day.moves.filter((m) => m.kind === "test").slice(0, 5);
    const bySource: [Source, string[]][] = [
      ["moves", tests.flatMap(codesOf)],
      ["hunch", day.drafts.flatMap((h) => (h.test?.code ? [h.test.code] : []))],
      ["coverage", day.gaps],
    ];
    for (const [src, codes] of bySource)
      for (const c of codes) {
        const was = asked.get(c);
        if (!was) asked.set(c, { at: asOf, by: new Set([src]) });
        else if (was.at === asOf) was.by.add(src);
      }
    perDay.push({
      draw: d,
      asOf,
      tests: tests.map((m) => m.label),
      hunchTests: [
        ...new Set(day.drafts.flatMap((h) => (h.test ? [h.test.name] : []))),
      ],
      gaps: day.gaps.length,
      latestSeen: day.latestSeen,
    });
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  const hits: Hit[] = [];
  const never: { code: string; firstAt: string }[] = [];
  for (const [code, at] of [...firstAt].sort((a, b) =>
    a[1].localeCompare(b[1]),
  )) {
    const a = asked.get(code);
    if (a && a.at < at)
      hits.push({
        code,
        firstAt: at,
        askedAt: a.at,
        leadDays: days(a.at, at),
        by: [...a.by],
      });
    else never.push({ code, firstAt: at });
  }
  const leads = hits.map((h) => h.leadDays).sort((a, b) => a - b);
  const count = (src: Source) => hits.filter((h) => h.by.includes(src)).length;
  // Coverage asks for the whole annual panel from day one, so its lead times
  // say little; the engine's own choices are the moves and the hunch tests.
  const chosen = hits
    .filter((h) => h.by.some((b) => b !== "coverage"))
    .map((h) => h.leadDays)
    .sort((a, b) => a - b);
  return {
    draws: dates.length,
    newCodes: firstAt.size,
    askedBefore: hits.length,
    byMoves: count("moves"),
    byHunch: count("hunch"),
    byCoverage: count("coverage"),
    medianLeadDays: leads.length ? leads[Math.floor(leads.length / 2)]! : null,
    chosenByEngine: chosen.length,
    chosenMedianLeadDays: chosen.length
      ? chosen[Math.floor(chosen.length / 2)]!
      : null,
    hits,
    never,
    perDay,
  };
}

/* ── checkpoints ───────────────────────────────────────────────────────── */

function judge(c: Checkpoint, day: Day) {
  const out: { what: string; pass: boolean; got: string }[] = [];
  const e = c.expect;
  for (const [id, want] of Object.entries(e.beliefs ?? {})) {
    const r = day.rows.find((x) => x.id === id);
    out.push({
      what: `${id} at ${want} or louder`,
      pass: !!r && STATES.indexOf(r.state) >= STATES.indexOf(want),
      got: r ? `${r.state} p ${r.score.toFixed(3)}` : "not scored",
    });
  }
  for (const key of e.hunches ?? [])
    out.push({
      what: `hunch ${key} raised`,
      pass: day.raisedKeys.includes(key),
      got: day.raisedKeys.join(", ") || "none raised",
    });
  if (e.moves) {
    const want = e.moves.anyOf;
    const pursued = day.moves
      .filter((m) => m.pursue)
      .filter((m) => codesOf(m).some((x) => want.includes(x)));
    const hunch = day.drafts.find((h) => h.key === e.moves!.pursueOrHunchTest);
    const chosen = hunch?.test?.code ?? null;
    const rank = day.moves.findIndex((m) =>
      codesOf(m).some((x) => want.includes(x)),
    );
    // 41F-E-4: a hunch test outside the list is named, with the condition
    // it reads that the listed tests also read. Never a pass.
    const near =
      chosen && !want.includes(chosen)
        ? catalogOf(day)
            .filter((h) =>
              h.discriminators.some((d) => d.codes.includes(chosen)),
            )
            .filter((h) =>
              h.discriminators.some((d) =>
                d.codes.some((c) => want.includes(c)),
              ) ||
              h.evidence.some((e) => want.includes(e.input.metric ?? "")),
            )
            .map((h) => h.id)
        : [];
    out.push({
      what: `one of ${want.join(", ")} pursued, or the test of ${e.moves.pursueOrHunchTest}`,
      pass: pursued.length > 0 || (!!chosen && want.includes(chosen)),
      got: `pursued ${pursued.map((m) => m.label).join(", ") || "none"}; ${e.moves.pursueOrHunchTest} test ${hunch ? (hunch.test?.name ?? "none") : "(not raised)"}${near.length ? ` (reads ${near.join(", ")} like the listed tests; not on the list, so no pass)` : ""}; first move at rank ${rank < 0 ? "-" : `${rank + 1} of ${day.moves.length}`}`,
    });
  }
  if (e.differential) out.push(...judgeDifferential(e.differential, day));
  for (const [key, want] of Object.entries(e.facts ?? {})) {
    const got = key.startsWith("no_response:")
      ? noResponse(day.input, key.slice("no_response:".length))
      : String(day.input.profile[key] ?? "");
    out.push({
      what: `${key} = ${want}`,
      pass: !!got && got.split(/,\s*/).includes(want),
      got: got ?? "null (no treatment judged)",
    });
  }
  return out;
}

const catalogOf = (day: Day): Catalog => day.catalog;

function judgeDifferential(
  want: NonNullable<Expect["differential"]>,
  day: Day,
): { what: string; pass: boolean; got: string }[] {
  const d: Differential | null | undefined = day.drafts.find(
    (h) => h.key === `cause:${want.of}`,
  )?.differential;
  const name = `differential of ${want.of}`;
  if (!d)
    return [{ what: `${name} exists`, pass: false, got: "no cause hunch or no differential" }];
  const out: { what: string; pass: boolean; got: string }[] = [];
  const list = d.options
    .map((o) => `${o.id} ${o.share} (belief ${o.belief}, ${o.basis})`)
    .join("; ");
  out.push({
    what: `${name} has at least ${want.minOptions} options`,
    pass: d.options.length >= want.minOptions,
    got: `${d.options.length}: ${list}`,
  });
  const ungrounded = d.options.filter(
    (o) => !/doi:10\.|^catalog: \S/.test(o.source),
  );
  out.push({
    what: `${name}: every option has a DOI or a catalog source`,
    pass: d.options.length > 0 && !ungrounded.length,
    got: ungrounded.length
      ? `ungrounded ${ungrounded.map((o) => o.id).join(", ")}`
      : d.options.map((o) => `${o.id}: ${o.source.slice(0, 60)}`).join(" | "),
  });
  const sum = d.options.reduce((s, o) => s + o.share, 0) + d.other;
  out.push({
    what: `${name}: shares and the remainder sum to 1`,
    pass: Math.abs(sum - 1) < 0.005 && d.other > 0,
    got: `sum ${sum.toFixed(3)}, other ${d.other}`,
  });
  const within = want.agreeWithin ?? 2;
  const byShare = [...d.options].sort((a, b) => b.share - a.share);
  const ordered = byShare.every(
    (o, i) => i === 0 || byShare[i - 1]!.belief >= o.belief,
  );
  const far = d.options.filter(
    (o) =>
      !(o.belief > 0 && o.p > 0) ||
      Math.abs(Math.log(o.belief / o.p)) > Math.log(within),
  );
  out.push({
    what: `${name}: each belief agrees with its share (same order, within ${within}x of P(C | ${want.of}))`,
    pass: d.options.length > 0 && ordered && !far.length,
    got: `${d.options.map((o) => `${o.id} belief ${o.belief} vs P(C|X) ${o.p}`).join("; ")}${ordered ? "" : "; order differs"}${far.length ? `; off: ${far.map((o) => o.id).join(", ")}` : ""}`,
  });
  if (want.named) {
    const re = new RegExp(want.named.pattern, "i");
    const hit = d.options.find(
      (o) =>
        re.test(`${o.id} ${o.name}`) &&
        !!o.test?.codes.some((c) => want.named!.testAnyOf.includes(c)),
    );
    out.push({
      what: `${name}: an option matching /${want.named.pattern}/ with a test out of ${want.named.testAnyOf.join(", ")}`,
      pass: !!hit,
      got: d.options
        .map((o) => `${o.id} test ${o.test?.name ?? "none"}`)
        .join("; "),
    });
  }
  return out;
}

/* ── main ──────────────────────────────────────────────────────────────── */

const ENGINE_TABLES = [
  "readings",
  "hunches",
  "belief_snapshots",
  "profile_facts",
  "profile_fact_history",
  "review_items",
  "goals",
  "user_conditions",
];

async function tableCounts() {
  const out: Record<string, number> = {};
  for (const t of ENGINE_TABLES) {
    const { rows } = await pool().query(`select count(*)::int n from ${t}`);
    out[t] = rows[0].n;
  }
  return out;
}

type WithOverlay = (catalog: Catalog, overlay: never) => Catalog;
let withOverlay: WithOverlay | null = null;

async function loadResearch(): Promise<ResearchCase | null> {
  try {
    const mod = (await import(/* @vite-ignore */ "@/lib/" + "cases")) as {
      researchCase?: ResearchCase;
      withOverlay?: WithOverlay;
    };
    withOverlay = mod.withOverlay ?? null;
    return typeof mod.researchCase === "function" ? mod.researchCase : null;
  } catch (e) {
    // missing is "not yet"; a module that is there and throws is a bug
    if ((e as { code?: string }).code === "ERR_MODULE_NOT_FOUND") return null;
    throw e;
  }
}

/** A catalog with 41C's dry-run proposals laid over it, when it hands one back. */
function overlaid(catalog: Catalog, overlay: unknown): Catalog {
  if (Array.isArray(overlay)) return overlay as Catalog;
  if (typeof overlay === "function")
    return (overlay as (c: Catalog) => Catalog)(catalog);
  // 41C hands back rows; its own `withOverlay` merges them
  if (overlay && withOverlay) return withOverlay(catalog, overlay as never);
  return catalog;
}

const pct = (p: number) =>
  p >= 0.1 ? `${(p * 100).toFixed(0)} %` : `${(p * 100).toFixed(2)} %`;

async function main() {
  const args = process.argv.slice(2);
  let research = !args.includes("--no-research");
  const withHindsight = !args.includes("--no-hindsight");
  const ids = args.filter((a) => !a.startsWith("--"));
  // Real users' cases stay out of git (health data); the example shows the shape.
  const casesFile = path.join(HERE, "replay", "cases.json");
  const cases = JSON.parse(
    await readFile(casesFile, "utf8").catch(() => {
      console.error(`no ${casesFile}; copy replay/cases.example.json and fill it`);
      process.exit(1);
    }),
  ) as CaseFile;
  const users = Object.entries(cases.users).filter(
    ([id]) => !ids.length || ids.includes(id),
  );

  const researchCase = research ? await loadResearch() : null;
  if (research && !researchCase) {
    console.log("case research not available yet; running as --no-research");
    research = false;
  }

  const before = await tableCounts();
  const catalog = await loadCatalog();
  const kbRevision = await currentRevision();
  let costUsd = 0;
  let failures = 0;
  let skipped = 0;
  const results = [];

  for (const [userId, u] of users) {
    const seed = u.seed ?? {};
    const history = await allHistory(userId);
    console.log(`\n══ ${u.name} (${userId}) ══`);

    let recall: Awaited<ReturnType<typeof hindsight>> | null = null;
    if (withHindsight) {
      process.stdout.write("hindsight ");
      recall = await hindsight(userId, catalog, seed, history);
      console.log(
        `draws ${recall.draws}, codes first measured ${recall.newCodes}, asked before done ${recall.askedBefore} (moves ${recall.byMoves}, hunch ${recall.byHunch}, coverage ${recall.byCoverage}), median lead ${recall.medianLeadDays ?? "-"} days; moves or hunch only ${recall.chosenByEngine}, median lead ${recall.chosenMedianLeadDays ?? "-"} days; never asked ${recall.never.length}`,
      );
      console.table(
        recall.hits.map((h) => ({
          code: h.code,
          firstDone: h.firstAt,
          askedOn: h.askedAt,
          leadDays: h.leadDays,
          by: h.by.join("+"),
        })),
      );
      console.log(
        `done, never asked first: ${recall.never.map((n) => `${n.code} (${n.firstAt})`).join(", ") || "none"}`,
      );
    }

    const checkpoints = [];
    for (const c of u.checkpoints) {
      let cat = catalog;
      let run: Awaited<ReturnType<ResearchCase>> | null = null;
      const served = { ...SERVED };
      if (research && researchCase) {
        run = await researchCase(userId, { asOf: c.asOf, dryRun: true, seed });
        costUsd += run.costUsd;
        cat = overlaid(catalog, run.catalogOverlay);
      }
      const day = await runDay(
        userId,
        c.asOf,
        cat,
        seed,
        history,
        (run?.catalogOverlay as HunchOverlay | undefined) ?? null,
      );
      // 41F-E-3: no papers because Europe PMC was down is no verdict on
      // the engine; the checkpoint is marked, its expectations not counted
      const researchFailed = run?.failed ?? null;
      const checks = judge(c, day);
      if (researchFailed) skipped++;
      else failures += checks.filter((x) => !x.pass).length;
      const top = [...day.rows].sort((a, b) => b.score - a.score).slice(0, 8);
      console.log(
        `\n── ${u.name} as of ${c.asOf}: latest date seen ${day.latestSeen} (blind ok; timeless facts: ${day.timeless.join(", ") || "none"})`,
      );
      if (c.note) console.log(`   ${c.note}`);
      if (run) {
        console.log(
          `   research: ${run.proposals.length} proposals, ${run.accepted} accepted, $${run.costUsd.toFixed(3)}; search hits served by Europe PMC ${SERVED.europepmc - served.europepmc}, PubMed ${SERVED.pubmed - served.pubmed}`,
        );
        const found = new Set(
          (run.papers ?? []).map((p) => p.doi.toLowerCase()),
        );
        for (const q of run.causeQueries ?? [])
          console.log(`     cause track query: ${q}`);
        for (const p of run.causePapers ?? [])
          console.log(
            `     cause track paper: ${p.year} ${p.doi} ${p.title.slice(0, 110)}`,
          );
        if (run.candidates?.length)
          console.log(
            `     candidates from the abstracts: ${run.candidates.map((c) => `${c.id}${c.ring2 ? " (ring 2)" : ""}`).join(", ")}`,
          );
        for (const p of run.proposals as Accepted[])
          if (p.decision === "accepted")
            console.log(
              `     accepted ${p.kind} ${p.conditionId} <- ${p.featureId} ${JSON.stringify(p.conditionOn)} x${p.lrPos} grade ${p.grade} doi:${p.doi} (${found.has(p.doi.toLowerCase()) ? "paper found in this run" : "NOT a paper of this run"}) "${p.quote}"`,
            );
          else
            console.log(
              `     ${p.decision} ${p.kind} ${p.conditionId} <- ${p.featureId}: ${p.reason}`,
            );
      }
      console.log("   top beliefs:");
      for (const r of top)
        console.log(
          `     ${r.id.padEnd(32)} ${pct(r.score).padStart(7)}  ${r.state}`,
        );
      console.log("   top moves:");
      for (const m of day.moves.slice(0, 5))
        console.log(
          `     ${m.kind.padEnd(8)} ${m.label.slice(0, 60).padEnd(60)} €${eurOf(m)}${m.pursue ? "  pursue" : ""}`,
        );
      console.log("   raised hunches:");
      for (const h of day.drafts)
        console.log(
          `     ${h.key.padEnd(30)} test ${h.test?.name ?? "-"}${h.explanations.length ? `; ${h.explanations.map((e) => `${e.id} ${e.weight}`).join(", ")}` : ""}`,
        );
      if (!day.drafts.length) console.log("     none");
      for (const h of day.drafts)
        if (h.differential)
          console.log(`   differential: ${differentialLine(h.differential)}`);
      for (const r of day.rows)
        if (r.mixture)
          console.log(
            `   mixture ${r.id}: P(C|${r.mixture.given}) ${r.mixture.pGiven} (share ${r.mixture.share}, counted ${r.mixture.counted}${r.mixture.population ? `, study: ${r.mixture.population}` : ""}), P(C|not) ${r.mixture.pNot}, prior ${r.prior}, p ${r.score}, P(C|X,data) ${r.mixture.posterior}`,
          );
        else if (r.mixtureSkipped)
          for (const k of r.mixtureSkipped)
            console.log(`   mixture ${r.id}: share on ${k.given} not applied: ${k.why}`);
      console.log(
        researchFailed
          ? `   expectations: research failed (${researchFailed}), not counted`
          : "   expectations:",
      );
      for (const x of checks)
        console.log(
          `     ${researchFailed ? "n/a " : x.pass ? "pass" : "FAIL"}  ${x.what}  (got ${x.got})`,
        );
      checkpoints.push({
        asOf: c.asOf,
        latestSeen: day.latestSeen,
        timeless: day.timeless,
        research: run
          ? {
              proposals: run.proposals.length,
              accepted: run.accepted,
              costUsd: run.costUsd,
            }
          : null,
        topBeliefs: top.map((r) => ({ id: r.id, p: r.score, state: r.state })),
        topMoves: day.moves.slice(0, 5).map((m) => ({
          kind: m.kind,
          label: m.label,
          codes: codesOf(m),
          eur: eurOf(m),
        })),
        researchFailed,
        mixtures: day.rows
          .filter((r) => r.mixture)
          .map((r) => ({ id: r.id, p: r.score, prior: r.prior, ...r.mixture })),
        hunches: day.drafts.map((h) => ({
          differential: h.differential ?? null,
          key: h.key,
          test: h.test?.code ?? null,
          explanations: h.explanations.map((e) => ({
            id: e.id,
            weight: e.weight,
          })),
        })),
        checks,
      });
    }
    results.push({ userId, name: u.name, recall, checkpoints });
  }

  const after = await tableCounts();
  const moved = ENGINE_TABLES.filter((t) => before[t] !== after[t]);
  console.log(
    `\nwrites: ${moved.length ? `CHANGED ${moved.map((t) => `${t} ${before[t]}→${after[t]}`).join(", ")}` : "none (engine tables counted before and after)"}`,
  );
  console.log(
    `mode: ${research ? "research" : "no-research"}, cost $${costUsd.toFixed(3)}, ${failures} expectation(s) failed${skipped ? `, ${skipped} checkpoint(s) research failed` : ""}`,
  );

  const file = path.join(
    HERE,
    "results",
    `replay-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        kbRevision,
        mode: research ? "research" : "no-research",
        costUsd,
        writes: moved,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
  if (failures || moved.length) process.exitCode = 1;
}

main()
  .then(() => pool().end())
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
