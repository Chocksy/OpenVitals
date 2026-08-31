/**
 * The trends inbox: a door for whatever is popular this month.
 *
 * Phase 22, and ROADMAP principle 2 taken literally. A claim does not have to
 * be true to enter; it has to be labelled and testable. Two mouths — the "Drop
 * a claim" box on /hkb and a `claim` chip in the composer — and one pipe, and
 * the pipe splits every claim in two:
 *
 *  1. **The science.** The mechanism the claim implies (sardines → the omega-3
 *     in them → triglycerides) goes through the ordinary intervention research,
 *     is graded, pooled and auto-accepted by grade. Nothing is invented: the
 *     claim only made the engine look.
 *  2. **The claim itself.** The specific popular form ("sardines, ~3 tins a
 *     week") lands as one `hkb_interventions` row, grade E, status `horizon`,
 *     the claim text as its quote and the source in `population`. Horizon rows
 *     never touch a probability and never carry an effect size into a
 *     projection — `GRADE_WEIGHT` is 0 for E and `adoptedActions` only reads
 *     `accepted` rows. The row exists so the suggestion can be shown, labelled,
 *     adopted and measured.
 *
 * Principle 3 holds: the model only maps a sentence onto marker codes that
 * already exist and copies a verbatim quote. The condition it files under, the
 * grade, the status, the retest interval and the direction that counts as
 * better are all decided here, in code.
 */
import { generateObject } from "ai";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  hkbConditions,
  hkbEvidence,
  hkbInterventions,
  type HkbIntervention,
} from "@/db";
import { model } from "./extract";
import type { Grade } from "./hypotheses";
import { BETTER_HIGH, BETTER_LOW, RETEST_WEEKS } from "./projection";
import {
  featuresFor,
  researchInterventions,
  saveInterventions,
  type ConditionRef,
} from "./research";

/* ── the shape ────────────────────────────────────────────────────────── */

export interface Claim {
  /** the person's own words, verbatim */
  text: string;
  /** "sardines, ~3 tins a week" */
  intervention: string;
  /** metric codes from `CLAIM_MARKERS`, never anything else */
  markers: string[];
  direction: "down" | "up";
  sourceKind: "podcast" | "social" | "article" | "friend" | "unknown";
}

export const SOURCE_KINDS = [
  "podcast",
  "social",
  "article",
  "friend",
  "unknown",
] as const;

/**
 * The closed list of markers a claim may name.
 *
 * Every code here is a metric the app already stores and can retest, which is
 * what makes a measurement plan possible. A claim about anything else is still
 * filed — with `markers: []`, no projection and a plan that says so.
 */
export const CLAIM_MARKERS: { code: string; name: string; words: RegExp }[] = [
  { code: "hba1c", name: "HbA1c", words: /\bhba1c|a1c|glycated h\w+/i },
  {
    code: "glucose",
    name: "glucose",
    words: /\b(?:blood )?(?:sugar|glucose)\b/i,
  },
  { code: "insulin", name: "insulin", words: /\binsulin\b/i },
  { code: "homaIr", name: "HOMA-IR", words: /\bhoma[- ]?ir\b/i },
  {
    code: "ldl_cholesterol",
    name: "LDL cholesterol",
    words: /\bldl(?:[- ]c)?\b/i,
  },
  { code: "hdl_cholesterol", name: "HDL cholesterol", words: /\bhdl\b/i },
  {
    code: "triglycerides",
    name: "triglycerides",
    words: /\btriglyceride?s?\b|\btrigs\b|\btg\b/i,
  },
  {
    code: "apolipoprotein_b",
    name: "apoB",
    words: /\bapo\s?b\b|\bapolipoprotein b\b/i,
  },
  {
    code: "total_cholesterol",
    name: "total cholesterol",
    words: /\btotal cholesterol\b/i,
  },
  { code: "lp_a", name: "Lp(a)", words: /\blp\s?\(?a\)?\b/i },
  {
    code: "hs_crp",
    name: "hs-CRP",
    words: /\b(?:hs[- ]?)?crp\b|\binflammation\b/i,
  },
  { code: "alt", name: "ALT", words: /\balt\b|\bliver enzymes?\b/i },
  { code: "ggt", name: "GGT", words: /\bggt\b/i },
  {
    code: "ferritin",
    name: "ferritin",
    words: /\bferritin\b|\biron stores?\b/i,
  },
  {
    code: "vitamin_d",
    name: "vitamin D",
    words: /\bvitamin d\b|\b25[- ]oh[- ]?d\b/i,
  },
  { code: "vitamin_b12", name: "vitamin B12", words: /\bb\s?12\b/i },
  { code: "tsh", name: "TSH", words: /\btsh\b/i },
  { code: "free_t4", name: "free T4", words: /\bft4\b|\bfree t4\b/i },
  { code: "uric_acid", name: "uric acid", words: /\buric acid\b|\burate\b/i },
  { code: "cortisol_am", name: "morning cortisol", words: /\bcortisol\b/i },
  { code: "testosterone", name: "testosterone", words: /\btestosterone\b/i },
  {
    code: "bp_systolic",
    name: "systolic blood pressure",
    words: /\bblood pressure\b|\bbp\b/i,
  },
  { code: "weight_kg", name: "weight", words: /\bweight\b|\bbody fat\b/i },
  { code: "vo2max_est", name: "VO2 max", words: /\bvo2\s?max\b/i },
  { code: "grip_kg", name: "grip strength", words: /\bgrip strength\b/i },
];

export const MARKER_CODES = CLAIM_MARKERS.map((m) => m.code);

const markerName = (code: string) =>
  CLAIM_MARKERS.find((m) => m.code === code)?.name ?? code.replace(/_/g, " ");

/* ── the rules layer: what the composer can see without a model ───────── */

/** The frames that say "this sentence is about the world, not about me". */
const HEARSAY: RegExp[] = [
  /\b(?:i|we)\s+(?:heard|read|saw|keep\s+(?:hearing|seeing))\b(?:\s+that)?/i,
  /\beveryone(?:'s|\s+is)\s+(?:doing|taking|eating|drinking|on)\b/i,
  /\b(?:people|they)\s+(?:say|are saying|eat|take)\b(?:\s+that)?/i,
  /\b(?:my\s+(?:friend|colleague|mum|mom|mother|father|dad|sister|brother|trainer|coach)|a\s+friend)\s+(?:said|says|told me)\b(?:\s+that)?/i,
  /\bapparently\b/i,
  /\b(?:is|are)\s+(?:everywhere|trending|all over|the new)\b/i,
  /\bsupposed(?:ly)?\s+to\b/i,
];

const SOURCE_WORDS: [Claim["sourceKind"], RegExp][] = [
  ["podcast", /\bpodcast|huberman|rogan|youtube\b/i],
  ["social", /\btiktok|instagram|reddit|twitter|facebook|threads|social\b/i],
  ["article", /\barticle|blog|newspaper|the times|news|paper|study\b/i],
  [
    "friend",
    /\bfriend|colleague|my (?:mum|mom|mother|father|dad|sister|brother)\b/i,
  ],
];

const DOWN_VERBS =
  /\b(?:lowers?|lowering|reduces?|reducing|cuts?|drops?|fixes?|fix|crashes?|clears?|melts?|burns?|kills?)\b/i;
const UP_VERBS =
  /\b(?:raises?|boosts?|boosting|increases?|improves?|spikes?|builds?|restores?)\b/i;

/**
 * The words a claim body opens with and that are not the thing itself: "on a
 * podcast that sardines…" is four of them before the sardines.
 */
const LEAD =
  /^(?:that|about|how|doing|taking|eating|drinking|on|in|from|the|a|an|podcast|tiktok|instagram|reddit|article|blog|youtube|news|paper|study|friend|colleague)\b[\s,]*/i;

/** Where the thing stops being the thing and starts being what it does to you. */
const STOP_WORDS =
  /\s(?:is|are|was|were|to|for|at|with|which|because|so|and|but|,|—|-)\s/i;

/** The first word after the name of the thing, or the end of it. */
function stopAt(body: string): number {
  const padded = ` ${body} `;
  const hits = [STOP_WORDS, DOWN_VERBS, UP_VERBS, /\bhelps?\b/i]
    .map((re) => re.exec(padded)?.index)
    .filter((i): i is number => i != null && i > 1);
  return hits.length ? Math.min(...hits) - 1 : body.length;
}

const stripLead = (s: string): string => {
  let out = s.trim();
  for (let i = 0; i < 6; i++) {
    const next = out.replace(LEAD, "").trim();
    if (next === out || !next) break;
    out = next;
  }
  return out;
};

const TRIM = /^[\s"'“”,.:;–—-]+|[\s"'“”,.:;–—-]+$/g;

const sentenceOf = (text: string, at: number): string => {
  const start = Math.max(
    0,
    ...[". ", "! ", "? ", "\n", "; "].map((s) => text.lastIndexOf(s, at) + 1),
  );
  const ends = [". ", "! ", "? ", "\n"]
    .map((s) => text.indexOf(s, at))
    .filter((i) => i > -1);
  return text
    .slice(start, ends.length ? Math.min(...ends) : text.length)
    .trim();
};

/** Every marker the sentence names, in catalog order, deduped. */
export const markersIn = (text: string): string[] =>
  CLAIM_MARKERS.filter((m) => m.words.test(text)).map((m) => m.code);

/**
 * A hearsay sentence into a claim, with no model.
 *
 * The rules only have to be good enough to raise the chip and name the thing;
 * `extractClaim` re-reads the same words with the closed marker list when a key
 * is available, and the pipe takes whichever it gets.
 */
export function claimFrom(text: string): Claim | null {
  const frame = HEARSAY.map((re) => re.exec(text))
    .filter((m): m is RegExpExecArray => !!m)
    .sort((a, b) => a.index - b.index)[0];
  if (!frame) return null;

  const sentence = sentenceOf(text, frame.index);
  const before = text
    .slice(0, frame.index)
    .split(/[.!?\n;]/)
    .pop()!
    .trim();
  const after = stripLead(
    text.slice(frame.index + frame[0].length).split(/[.!?\n;]/)[0]!,
  );

  // "sardines are everywhere right now" names the thing before the frame;
  // "I heard that sardines lower triglycerides" names it after.
  const body = before.length >= 3 ? before : after;
  const head = body.slice(0, stopAt(body)).replace(TRIM, "");
  const intervention = (head || body).replace(TRIM, "").slice(0, 60);
  if (intervention.length < 3) return null;

  const markers = markersIn(sentence);
  const first = markers[0];
  const direction: Claim["direction"] = DOWN_VERBS.test(sentence)
    ? "down"
    : UP_VERBS.test(sentence)
      ? "up"
      : first && BETTER_HIGH.has(first)
        ? "up"
        : "down";

  return {
    text: sentence,
    intervention,
    markers,
    direction,
    sourceKind:
      SOURCE_WORDS.find(([, re]) => re.test(text))?.[0] ??
      (/everyone|people|they say|tiktok/i.test(text) ? "social" : "unknown"),
  };
}

/** "CLAIM · sardines → triglycerides", the chip and the box both print it. */
export const claimLabel = (c: Claim): string =>
  `CLAIM · ${c.intervention}${
    c.markers.length ? ` → ${c.markers.map(markerName).join(", ")}` : ""
  }`;

/* ── the model layer: one closed-schema call ──────────────────────────── */

export const claimSchema = z.object({
  isClaim: z
    .boolean()
    .describe("true only when the note repeats a claim about the world"),
  intervention: z
    .string()
    .describe(
      "the popular thing itself, with its popular dose if one is given",
    ),
  markers: z
    .array(z.string())
    .describe("marker codes copied exactly from the MARKERS list, or empty"),
  direction: z.enum(["down", "up"]),
  sourceKind: z.enum(SOURCE_KINDS),
  quote: z
    .string()
    .describe("the verbatim sentence from the note the claim came from"),
});

export const CLAIM_PROMPT = `You are reading one short note about something a person heard, read or saw other people doing for their health.

Your only job is to name the thing and map it onto marker codes that already exist. You never invent a marker, a number or an effect.

RULES:
1. \`isClaim\` is true only when the note repeats something about the world — what a food, supplement, drug or practice does. A note about the person's own body, symptoms or readings is not a claim: return isClaim false.
2. \`intervention\` is the popular thing in the note's own words, with the amount when the note gives one ("sardines, ~3 tins a week"). Never a mechanism, never a marker.
3. \`markers\` are codes copied exactly from the MARKERS list below — only the ones the claim is actually about. An empty list is the right answer when the claim is about something we do not measure.
4. \`direction\` is what the claim says happens to those markers: "down" or "up".
5. \`sourceKind\` is where the person got it: podcast, social, article, friend, or unknown.
6. \`quote\` must be a verbatim substring of the note, copied character for character.
7. Say nothing about whether the claim is true. That is not your job.`;

const markerList = () =>
  `\n\nMARKERS (code | what it is):\n${CLAIM_MARKERS.map(
    (m) => `${m.code} | ${m.name}`,
  ).join("\n")}`;

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * One `generateObject` call, then the server checks it.
 *
 * Same contract as the composer's model layer: a marker that is not on the
 * closed list is dropped, and a quote that is not in the note verbatim throws
 * the whole thing away. Falls back to the rules when there is no key or the
 * call fails, so the box works with the model off.
 */
export async function extractClaim(text: string): Promise<Claim | null> {
  const rules = claimFrom(text);
  if (!process.env.OPENROUTER_API_KEY) return rules;

  try {
    const { object } = await generateObject({
      model: model(),
      schema: claimSchema,
      system: CLAIM_PROMPT + markerList(),
      prompt: `THE NOTE:\n${text.slice(0, 2000)}`,
    });
    if (!object.isClaim) return null;
    if (!object.intervention?.trim()) return rules;
    if (!normalise(text).includes(normalise(object.quote ?? ""))) return rules;
    return {
      text: object.quote.trim(),
      intervention: object.intervention.trim().slice(0, 120),
      markers: [...new Set(object.markers)].filter((m) =>
        MARKER_CODES.includes(m),
      ),
      direction: object.direction,
      sourceKind: object.sourceKind,
    };
  } catch (e) {
    console.error("[trends] the model layer failed, rules stand:", e);
    return rules;
  }
}

/* ── the pipe ─────────────────────────────────────────────────────────── */

/**
 * Where a claim with no marker we track hangs.
 *
 * ponytail: `hkb_interventions.condition_id` is not null, so a claim needs a
 * condition. Rather than a nullable column and a migration, claims that name
 * nothing we measure hang on one ring-2 row that is out of the catalog and can
 * therefore never be scored for anybody.
 */
export const POPULAR_CLAIMS = "popular_claims";

async function popularClaimsCondition(): Promise<string> {
  await getDb()
    .insert(hkbConditions)
    .values({
      id: POPULAR_CLAIMS,
      name: "Popular claims",
      summary:
        "Claims that are popular right now and name no marker this app measures. Labelled, unproven, and out of the catalog.",
      management: "Nothing. This is a shelf, not a condition.",
      inCatalog: false,
      ring: 2,
      lenses: {},
    })
    .onConflictDoNothing();
  return POPULAR_CLAIMS;
}

/**
 * The ring-1 condition a marker already belongs to.
 *
 * The knowledge base itself answers this: whichever conditions read the marker
 * in their evidence, alphabetically first so two filings of the same claim land
 * in the same place.
 */
export async function conditionForMarkers(
  markers: string[],
): Promise<ConditionRef> {
  const db = getDb();
  for (const code of markers) {
    const [row] = await db
      .select({ id: hkbConditions.id, name: hkbConditions.name })
      .from(hkbEvidence)
      .innerJoin(hkbConditions, eq(hkbConditions.id, hkbEvidence.conditionId))
      .where(
        and(
          eq(hkbEvidence.featureId, `metric:${code}`),
          eq(hkbConditions.inCatalog, true),
        ),
      )
      .orderBy(hkbConditions.id)
      .limit(1);
    if (row) return row;
  }
  await popularClaimsCondition();
  return { id: POPULAR_CLAIMS, name: "Popular claims" };
}

/**
 * How this claim gets judged: the marker's own retest window and the direction
 * that counts as better. Null when the claim names nothing we measure, which is
 * the honest answer and the one the shelf prints.
 */
export function measurementPlan(claim: Claim): string | null {
  const code = claim.markers[0];
  if (!code) return null;
  const weeks = RETEST_WEEKS[code] ?? 12;
  const better = BETTER_LOW.has(code)
    ? "lower is better"
    : BETTER_HIGH.has(code)
      ? "higher is better"
      : "the band decides";
  return `Measure ${markerName(code)} now, keep it up, retest in ${weeks} weeks (${better}).`;
}

/** `claim_sardines_triglycerides`: stable, so filing it twice writes one row. */
export const claimId = (claim: Claim): string =>
  `claim_${[claim.intervention, claim.markers[0] ?? "no_marker"]
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`.slice(0, 120);

/** The horizon row a claim is, before it is written. Pure. */
export function toHorizonRow(claim: Claim, conditionId: string) {
  return {
    id: claimId(claim),
    conditionId,
    name: claim.intervention,
    dose: null,
    duration: null,
    outcomeFeatureId: claim.markers[0] ? `metric:${claim.markers[0]}` : null,
    // No effect size on purpose: nobody measured this form of it. Without one
    // `project` cannot count it even if the grade ever changed.
    effect: null,
    direction: claim.direction,
    grade: "E" as Grade,
    paper: null,
    quote: claim.text.slice(0, 500),
    status: "horizon",
    population: claim.sourceKind,
  };
}

export interface ScienceNeighbour {
  id: string;
  name: string;
  grade: string;
  effect: string | null;
  direction: string;
  outcomeFeatureId: string | null;
  source: string | null;
}

export interface FiledClaim {
  claim: Claim;
  conditionId: string;
  conditionName: string;
  /** the horizon row, written or already there */
  horizonId: string;
  /** true when this filing is what created it */
  horizonNew: boolean;
  /** graded, accepted rows for the same marker: the science inside the claim */
  science: ScienceNeighbour[];
  /** rows the science search added to `hkb_interventions` on this filing */
  scienceWritten: number;
  plan: string | null;
}

/** The accepted A/B/C rows for this condition that move the claim's marker. */
export async function scienceNeighbours(
  conditionId: string,
  markers: string[],
): Promise<ScienceNeighbour[]> {
  if (!markers.length) return [];
  const rows = await getDb()
    .select({
      id: hkbInterventions.id,
      name: hkbInterventions.name,
      grade: hkbInterventions.grade,
      effect: hkbInterventions.effect,
      direction: hkbInterventions.direction,
      outcomeFeatureId: hkbInterventions.outcomeFeatureId,
      paper: hkbInterventions.paper,
    })
    .from(hkbInterventions)
    .where(
      and(
        eq(hkbInterventions.conditionId, conditionId),
        eq(hkbInterventions.status, "accepted"),
        inArray(hkbInterventions.grade, ["A", "B", "C"]),
        inArray(
          hkbInterventions.outcomeFeatureId,
          markers.map((m) => `metric:${m}`),
        ),
      ),
    )
    .orderBy(hkbInterventions.grade, hkbInterventions.name)
    .limit(5);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    grade: r.grade,
    effect: r.effect,
    direction: r.direction,
    outcomeFeatureId: r.outcomeFeatureId,
    source: r.paper?.title ?? null,
  }));
}

/**
 * File one claim: the science part, then the claim part.
 *
 * `science: false` files the claim alone, which is what the composer does — a
 * check-in must not block on Europe PMC. The research still happens, on the
 * next scheduled run, because the horizon row it just wrote puts the condition
 * on the ninety-day clock (`lib/freshness.ts`).
 */
export async function fileClaim(
  claim: Claim,
  options: { science?: boolean; maxPapers?: number } = {},
): Promise<FiledClaim> {
  const condition = await conditionForMarkers(claim.markers);

  let scienceWritten = 0;
  if (options.science !== false && claim.markers.length) {
    // The search subject is the claim's own marker, not the condition it files
    // under: "sardines → triglycerides" should make the engine read what moves
    // triglycerides (the EPA/DHA meta-analyses), not re-read fatty liver. The
    // rows still land against the condition, graded and pooled as usual.
    const subject: ConditionRef = {
      id: condition.id,
      name: markerName(claim.markers[0]!),
    };
    const features = await featuresFor(condition.id);
    const found = await researchInterventions(subject, features, {
      maxPapers: options.maxPapers ?? 3,
    });
    scienceWritten = await saveInterventions(found.rows);
  }

  const row = toHorizonRow(claim, condition.id);
  const written = await getDb()
    .insert(hkbInterventions)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: hkbInterventions.id });

  return {
    claim,
    conditionId: condition.id,
    conditionName: condition.name,
    horizonId: row.id,
    horizonNew: written.length > 0,
    science: await scienceNeighbours(condition.id, claim.markers),
    scienceWritten,
    plan: measurementPlan(claim),
  };
}

/* ── the shelf ────────────────────────────────────────────────────────── */

export interface HorizonItem {
  id: string;
  name: string;
  conditionId: string;
  outcomeFeatureId: string | null;
  direction: string;
  grade: string;
  sourceKind: string;
  quote: string | null;
  plan: string | null;
  science: ScienceNeighbour[];
  /** already on this person's protocol */
  adopted: boolean;
}

/** How many popular claims /plan shows at once. */
export const SHELF_LIMIT = 4;

/**
 * "Popular right now — labelled, unproven, measurable."
 *
 * Newest first, each with the graded neighbour that shares its marker, so the
 * shelf can say both things at once: the sardine-specific form is anecdotal,
 * and the omega-3 inside it is grade A for triglycerides.
 */
export async function horizonShelf(
  adoptedTexts: string[] = [],
): Promise<HorizonItem[]> {
  const rows = await getDb()
    .select()
    .from(hkbInterventions)
    .where(eq(hkbInterventions.status, "horizon"))
    .orderBy(desc(hkbInterventions.createdAt))
    .limit(SHELF_LIMIT);
  if (!rows.length) return [];

  const taken = new Set(adoptedTexts.map(normalise));
  const out: HorizonItem[] = [];
  for (const r of rows as HkbIntervention[]) {
    const code = r.outcomeFeatureId?.replace(/^metric:/, "") ?? null;
    out.push({
      id: r.id,
      name: r.name,
      conditionId: r.conditionId,
      outcomeFeatureId: r.outcomeFeatureId,
      direction: r.direction,
      grade: r.grade,
      sourceKind: r.population ?? "unknown",
      quote: r.quote,
      plan: code
        ? measurementPlan({
            text: "",
            intervention: r.name,
            markers: [code],
            direction: r.direction === "up" ? "up" : "down",
            sourceKind: "unknown",
          })
        : null,
      science: await scienceNeighbours(r.conditionId, code ? [code] : []),
      adopted: taken.has(normalise(r.name)),
    });
  }
  return out;
}

/** How many claims are on the shelf, for the /hkb header. */
export async function horizonCount(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(hkbInterventions)
    .where(eq(hkbInterventions.status, "horizon"));
  return row?.n ?? 0;
}
