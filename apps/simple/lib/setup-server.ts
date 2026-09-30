/**
 * Phase 43A: `/api/setup` as functions. `lib/setup.ts` decides which screen
 * comes next; this reads the person, runs the engine for the picture and the
 * next question, and writes every answer through the paths the rest of the
 * app uses (`saveFact`, `writeFact`, a readings insert). Web and iOS draw the
 * same JSON. Spec: docs/plans/2026-09-29-phase43-setup-spec.md.
 */
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, profileFacts, readings, uploads } from "@/db";
import { users } from "@/db/auth-schema";
import { actionsForAll } from "./actions";
import { hunchBody, type HunchCase } from "./api-contract";
import { buildModelInput, saveFact } from "./coverage";
import { localDay } from "./daily";
import { checkFact } from "./fact-input";
import { factAt, writeFact } from "./facts";
import { catalogFor } from "./hkb";
import { hunchRows, refreshHunches } from "./hunches";
import { scoreHypotheses } from "./hypotheses";
import {
  beliefsOf,
  nextMoves,
  QUIET_BELIEF,
  type Belief,
  type Move,
} from "./infogain";
import { recordBeliefs } from "./ledger";
import {
  addOnce,
  emptySetup,
  excludedKeys,
  nextKind,
  pickQuestion,
  progressOf,
  type SetupKnown,
  type SetupState,
} from "./setup";
import { convert } from "./units";
import { PROFILE_QUESTIONS } from "./vectors";

/** One condition on the picture; `p` in 0..1. */
export interface PictureRow {
  id: string;
  name: string;
  p: number;
}

/** A tap option, and the condition it moves most; `from`/`to` whole percent. */
export interface QuestionOption {
  label: string;
  moves: { id: string; name: string; from: number; to: number } | null;
}

/** A row of the treatments screen. Months as `YYYY-MM`. */
export interface Treatment {
  what: string;
  route: "oral" | "iv" | "injection";
  started: string;
  stopped?: string;
}

export interface PlanLineLite {
  id: string;
  title: string;
  dose?: string;
}

export type SetupScreen =
  | { kind: "intro"; goals: string[] }
  | { kind: "upload" }
  | {
      kind: "basics";
      sex: string | null;
      birthYear: string | null;
      country: string | null;
    }
  | {
      kind: "body";
      heightCm: string | null;
      weightKg: string | null;
      waistCm: string | null;
    }
  | {
      kind: "question";
      key: string;
      question: string;
      options: QuestionOption[];
    }
  | { kind: "treatments"; current: Treatment[] }
  | { kind: "data"; needsUpload: boolean }
  | {
      kind: "reveal";
      fromAnswersOnly: boolean;
      hunchId: string | null;
      /** the case the hunch drawer and iOS `HunchCaseView` already decode */
      case: HunchCase | null;
      picture: PictureRow[];
      test: { label: string; price: string | null } | null;
      action: PlanLineLite | null;
    };

export interface SetupBody {
  due: boolean;
  screen: SetupScreen;
  progress: { at: number; of: number };
  picture: PictureRow[];
}

export type SetupPost =
  | { screen: "intro"; goal: string; hasReport: boolean }
  | { screen: "upload" | "body" | "treatments" | "data"; skip: true }
  | { screen: "basics"; sex: string; birthYear: string; country: string }
  | { screen: "body"; heightCm?: string; weightKg?: string; waistCm?: string }
  | { screen: "question"; key: string; value?: string; skip?: true }
  | { screen: "treatments"; treatments: Treatment[] }
  | { screen: "data" }
  | { screen: "reveal" };

/* ── pure helpers ─────────────────────────────────────────────────────── */

const pct = (p: number) => Math.round(p * 100);

/** The top three beliefs at or above the quiet floor, highest first. */
export function pictureOf(
  beliefs: Belief[],
  names: Map<string, string>,
): PictureRow[] {
  return beliefs
    .filter((b) => b.p >= QUIET_BELIEF)
    .sort((a, b) => b.p - a.p)
    .slice(0, 3)
    .map((b) => ({ id: b.id, name: names.get(b.id) ?? b.id, p: b.p }));
}

/**
 * Per answer, the condition it moves furthest from where it stands now: the
 * same outcome simulation the Home card prints as "Answering moves …". Null
 * when nothing moves by two whole points.
 */
export function optionsOf(
  move: Move,
  names: Map<string, string>,
  before: Belief[],
): QuestionOption[] {
  const was = new Map(before.map((b) => [b.id, b.p]));
  return move.outcomes.map((o) => {
    const ids = new Set([...was.keys(), ...o.beliefs.map((b) => b.id)]);
    const now = new Map(o.beliefs.map((b) => [b.id, b.p]));
    let best: { id: string; from: number; to: number } | null = null;
    for (const id of ids) {
      const from = pct(was.get(id) ?? 0);
      const to = pct(now.get(id) ?? 0);
      if (!best || Math.abs(to - from) > Math.abs(best.to - best.from))
        best = { id, from, to };
    }
    return {
      label: o.label,
      moves:
        best && Math.abs(best.to - best.from) >= 2
          ? { ...best, name: names.get(best.id) ?? best.id }
          : null,
    };
  });
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ROUTES = new Set(["oral", "iv", "injection"]);

export function checkTreatment(t: unknown): t is Treatment {
  const x = t as Partial<Treatment> | null;
  if (!x || typeof x !== "object") return false;
  if (typeof x.what !== "string" || !x.what.trim()) return false;
  if (typeof x.route !== "string" || !ROUTES.has(x.route)) return false;
  if (typeof x.started !== "string" || !MONTH.test(x.started)) return false;
  if (x.stopped == null) return true;
  return (
    typeof x.stopped === "string" &&
    MONTH.test(x.stopped) &&
    x.stopped >= x.started
  );
}

/**
 * A setup row as the `treatments` fact holds it. `treatmentsOf` in
 * `lib/coverage.ts` reads `YYYY-MM-DD`, so a month is its first day.
 */
export const toStored = (t: Treatment) => ({
  what: t.what.trim(),
  route: t.route,
  started: `${t.started}-01`,
  ...(t.stopped ? { stopped: `${t.stopped}-01` } : {}),
});

const WEIGHT_KG: [number, number] = [30, 300];

/**
 * Every answer in a POST checked before anything is written, so a bad field
 * leaves the person exactly where they were. Null means all good.
 */
export function checkPost(body: SetupPost): string | null {
  const b = body as Record<string, unknown> & { screen?: string };
  const fact = (key: string, value: unknown) => {
    const c = checkFact(key, value);
    return c.ok ? null : c.error;
  };
  const skip = b.skip === true;
  switch (b.screen) {
    case "intro":
      if (typeof b.hasReport !== "boolean")
        return "say whether you have a report";
      return fact("setup_goal", b.goal);
    case "basics":
      return (
        fact("sex", b.sex) ??
        fact("birth_year", b.birthYear) ??
        fact("country", b.country)
      );
    case "body": {
      if (skip) return null;
      if (b.heightCm != null) {
        const e = fact("height_cm", b.heightCm);
        if (e) return e;
      }
      if (b.waistCm != null) {
        const e = fact("waist_cm", b.waistCm);
        if (e) return e;
      }
      if (b.weightKg != null) {
        const kg = Number(String(b.weightKg).replace(",", "."));
        if (!String(b.weightKg).trim() || !Number.isFinite(kg))
          return "weight is not a number";
        if (kg < WEIGHT_KG[0] || kg > WEIGHT_KG[1])
          return "weight is out of range";
      }
      return null;
    }
    case "question":
      if (typeof b.key !== "string" || !PROFILE_QUESTIONS[b.key])
        return "unknown question";
      return skip ? null : fact(b.key, b.value);
    case "treatments":
      if (skip) return null;
      if (!Array.isArray(b.treatments)) return "no treatments";
      return b.treatments.every(checkTreatment) ? null : "bad treatment";
    case "upload":
      return skip ? null : "unknown screen";
    case "data":
    case "reveal":
      return null;
    default:
      return "unknown screen";
  }
}

/* ── the database side ────────────────────────────────────────────────── */

async function stateOf(userId: string): Promise<SetupState | null> {
  const [row] = await getDb()
    .select({ setup: users.setup })
    .from(users)
    .where(eq(users.id, userId));
  return row?.setup ?? null;
}

/** Every reading, and the lab draws among them (not a phone, not typed in). */
async function readingCounts(userId: string) {
  const [row] = await getDb()
    .select({
      all: count(),
      lab: sql<number>`count(*) filter (where ${readings.source} is null and not coalesce(${readings.flags}, '[]'::jsonb) @> '["self_reported"]'::jsonb)`,
    })
    .from(readings)
    .where(eq(readings.userId, userId));
  return { all: Number(row?.all ?? 0), lab: Number(row?.lab ?? 0) };
}

/**
 * True for a new person: no reading, no sex fact, setup not closed. Once the
 * person has posted to setup it stays due until the reveal is closed, even
 * though basics wrote a sex fact and the body screen a weight: a person who
 * quits at question three resumes at question four.
 */
export async function setupDue(userId: string): Promise<boolean> {
  const state = await stateOf(userId);
  if (state?.done) return false;
  if (state) return true;
  const [{ all }, sex] = await Promise.all([
    readingCounts(userId),
    factAt(userId, "sex", localDay()),
  ]);
  return all === 0 && sex == null;
}

/**
 * `/setup?again=1`: a fresh run for a person who finished or never needed it.
 * Their answers stay; known facts are skipped, so it asks only what is new.
 */
export async function restartSetup(userId: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ setup: emptySetup(new Date().toISOString()) })
    .where(eq(users.id, userId));
}

const str = (v: unknown): string | null =>
  v == null || String(v).trim() === "" ? null : String(v);

/** The stored sex ("female") as the option the screen offers ("Female"). */
const optionOf = (key: string, v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  return (
    PROFILE_QUESTIONS[key]?.options?.find(
      (o) => o.toLowerCase() === s.toLowerCase(),
    ) ?? s
  );
};

async function latestWeightKg(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ value: readings.value, unit: readings.unit })
    .from(readings)
    .where(and(eq(readings.userId, userId), eq(readings.metricCode, "weight")))
    .orderBy(desc(readings.observedAt))
    .limit(1);
  if (row?.value == null) return null;
  // `weight` is stored in lbs (the catalog unit HealthKit writes).
  const kg = convert(row.value, row.unit ?? "lbs", "kg", "weight");
  return kg == null ? null : String(Math.round(kg * 10) / 10);
}

const toMonth = (d: unknown) => {
  const s = String(d ?? "").slice(0, 7);
  return MONTH.test(s) ? s : null;
};

export function treatmentsNow(value: unknown): Treatment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t) => {
    const started = toMonth(t?.started);
    const what = str(t?.what);
    if (!what || !started) return [];
    const stopped = toMonth(t?.stopped);
    const route = ROUTES.has(t?.route)
      ? (t.route as Treatment["route"])
      : "oral";
    return [{ what, route, started, ...(stopped ? { stopped } : {}) }];
  });
}

export async function setupBody(userId: string): Promise<SetupBody> {
  const db = getDb();
  const [stored, factRows, [up], counts, due] = await Promise.all([
    stateOf(userId),
    db
      .select({ key: profileFacts.key, value: profileFacts.value })
      .from(profileFacts)
      .where(eq(profileFacts.userId, userId)),
    db
      .select({ n: count() })
      .from(uploads)
      .where(and(eq(uploads.userId, userId), isNull(uploads.deletedAt))),
    readingCounts(userId),
    setupDue(userId),
  ]);
  const state = stored ?? emptySetup(new Date().toISOString());
  const facts = new Map(
    factRows.filter((f) => str(f.value) != null).map((f) => [f.key, f.value]),
  );
  const known: SetupKnown = {
    facts: new Set(facts.keys()),
    uploads: Number(up?.n ?? 0),
  };

  const input = await buildModelInput(userId);
  let catalog = await catalogFor(userId);

  // `nextMoves` simulates every candidate, so it only runs once the flow has
  // reached the questions: it needs sex and age, and nothing earlier uses it.
  let question: Move | null = null;
  if (nextKind(state, known, "?") === "question")
    question = pickQuestion(
      nextMoves(input, catalog, { exclude: excludedKeys(state, known) }),
    );
  const kind = nextKind(
    state,
    known,
    question ? question.featureId.slice(5) : null,
  );

  // The reveal reads the hunches and the ledger as a Home load would, so the
  // first Home after setup says what the reveal said. Both are idempotent.
  // A wake can add conditions, so the catalog is read again after.
  // A failed refresh (a model call inside a wake) must not hide the reveal:
  // the picture below is the engine's own score either way.
  if (kind === "reveal") {
    try {
      await refreshHunches(userId);
      await recordBeliefs(userId);
    } catch (e) {
      console.error("setup reveal refresh", e);
    }
    catalog = await catalogFor(userId);
  }

  const before = beliefsOf(scoreHypotheses(input, { catalog }));
  const names = new Map(catalog.map((h) => [h.id, h.name]));
  // Before sex and age the scores are population priors for nobody in
  // particular, so the bars would move for reasons that are not the person.
  const early = kind === "intro" || kind === "upload" || kind === "basics";
  const picture = early ? [] : pictureOf(before, names);

  let screen: SetupScreen;
  switch (kind) {
    case "intro":
      screen = {
        kind,
        goals: PROFILE_QUESTIONS.setup_goal?.options ?? [],
      };
      break;
    case "upload":
      screen = { kind };
      break;
    case "basics":
      screen = {
        kind,
        sex: optionOf("sex", facts.get("sex")),
        birthYear: str(facts.get("birth_year")),
        country: str(facts.get("country")),
      };
      break;
    case "body":
      screen = {
        kind,
        heightCm: str(facts.get("height_cm")),
        weightKg: await latestWeightKg(userId),
        waistCm: str(facts.get("waist_cm")),
      };
      break;
    case "question": {
      const key = question!.featureId.slice(5);
      screen = {
        kind,
        key,
        question: PROFILE_QUESTIONS[key]?.question ?? question!.label,
        options: optionsOf(question!, names, before),
      };
      break;
    }
    case "treatments":
      screen = {
        kind,
        current: treatmentsNow(await factAt(userId, "treatments", localDay())),
      };
      break;
    case "data":
      screen = { kind, needsUpload: known.uploads === 0 };
      break;
    case "reveal":
      screen = await revealOf(userId, input, catalog, picture, counts.lab);
      break;
  }

  return { due, screen, progress: progressOf(state, kind), picture };
}

async function revealOf(
  userId: string,
  input: Awaited<ReturnType<typeof buildModelInput>>,
  catalog: Awaited<ReturnType<typeof catalogFor>>,
  picture: PictureRow[],
  labReadings: number,
): Promise<Extract<SetupScreen, { kind: "reveal" }>> {
  const cause = (await hunchRows(userId)).find(
    (h) => h.kind === "cause" && h.state !== "closed",
  );
  const found = cause ? await hunchBody(userId, cause.id) : null;

  let test: { label: string; price: string | null } | null = null;
  if (found?.test)
    test = {
      label: found.test.name,
      price: `${found.test.price} ${found.test.currency}`,
    };
  else if (found?.differential?.splitTest)
    test = { label: found.differential.splitTest, price: null };
  else if (!found) {
    const m = nextMoves(input, catalog).find((x) => x.kind === "test");
    if (m)
      test = {
        label: m.label,
        price: m.priced ? `€${Math.round(m.cost)}` : null,
      };
  }

  // One action, for the condition the reveal names first. From answers
  // alone it is never a drug: the walk on 2026-09-30 offered "start the pill"
  // for a heavy-periods bar no test had confirmed.
  const top = found?.differential?.options[0]?.id ?? picture[0]?.id;
  const line = top
    ? ((await actionsForAll(userId, [top], 3))[top] ?? []).find(
        (l) =>
          l.source !== "note" && !(labReadings === 0 && l.prescribed),
      )
    : undefined;

  return {
    kind: "reveal",
    fromAnswersOnly: labReadings === 0,
    hunchId: cause?.id ?? null,
    case: found,
    picture,
    test,
    action: line
      ? {
          id: line.id,
          title: line.title,
          ...(line.dose ? { dose: line.dose } : {}),
        }
      : null,
  };
}

/**
 * One screen's answers, written, then the next screen. Every answer is
 * checked first; a bad one returns `{ error }` and writes nothing.
 */
export async function setupPost(
  userId: string,
  body: SetupPost,
): Promise<SetupBody | { error: string }> {
  const error = checkPost(body);
  if (error) return { error };

  const now = new Date().toISOString();
  const state = (await stateOf(userId)) ?? emptySetup(now);
  let next: SetupState = { ...state };
  const pass = (screen: string) =>
    (next = { ...next, passed: addOnce(next.passed, screen) });

  switch (body.screen) {
    case "intro":
      await saveFact(userId, "setup_goal", body.goal);
      next = { ...next, hasReport: body.hasReport };
      break;
    case "upload":
      pass("upload");
      break;
    case "basics":
      await saveFact(userId, "sex", body.sex);
      await saveFact(userId, "birth_year", body.birthYear);
      await saveFact(userId, "country", body.country);
      break;
    case "body":
      if (!("skip" in body && body.skip)) {
        const b = body as Extract<SetupPost, { heightCm?: string }>;
        if (b.heightCm?.trim()) await saveFact(userId, "height_cm", b.heightCm);
        if (b.waistCm?.trim()) await saveFact(userId, "waist_cm", b.waistCm);
        if (b.weightKg?.trim()) await saveWeight(userId, b.weightKg);
      }
      pass("body");
      break;
    case "question":
      if (body.skip)
        next = { ...next, skipped: addOnce(next.skipped, body.key) };
      else {
        await saveFact(userId, body.key, body.value!);
        next = { ...next, asked: addOnce(next.asked, body.key) };
      }
      break;
    case "treatments":
      if (!("skip" in body && body.skip))
        await addTreatments(
          userId,
          (body as Extract<SetupPost, { treatments: Treatment[] }>).treatments,
        );
      pass("treatments");
      break;
    case "data":
      pass("data");
      break;
    case "reveal":
      next = { ...next, done: now };
      break;
  }

  await getDb().update(users).set({ setup: next }).where(eq(users.id, userId));
  return setupBody(userId);
}

/** Weight as the `weight` reading HealthKit writes: lbs, dated today. */
async function saveWeight(userId: string, raw: string) {
  const kg = Number(raw.replace(",", "."));
  const lbs = convert(kg, "kg", "lbs", "weight")!;
  await getDb()
    .insert(readings)
    .values({
      userId,
      metricCode: "weight",
      value: lbs,
      valueText: String(lbs),
      unit: "lbs",
      observedAt: localDay(),
      // The same breadcrumb the composer leaves on a typed-in reading.
      flags: ["self_reported"],
    });
}

/**
 * Setup rows join the `treatments` list the way `writeChips` in
 * `lib/compose.ts` appends one: read, spread, write. A row already on the
 * list (a double tap) is not added twice.
 */
async function addTreatments(userId: string, rows: Treatment[]) {
  if (!rows.length) return;
  const was = await factAt(userId, "treatments", localDay());
  const list = Array.isArray(was) ? [...was] : [];
  const seen = new Set(list.map((x) => JSON.stringify(x)));
  for (const t of rows.map(toStored))
    if (!seen.has(JSON.stringify(t))) {
      seen.add(JSON.stringify(t));
      list.push(t);
    }
  if (list.length === (Array.isArray(was) ? was.length : 0)) return;
  await writeFact(userId, "treatments", list, {
    kind: "changed",
    note: "setup",
  });
}
