/**
 * Scenarios: the patient state /brain runs the engine over. An empty person, a
 * real user, a real user with most of their data hidden, or one of the eval
 * personas. Plus an overlay, which is what the simulation adds on top when
 * somebody "gets" a test.
 *
 * Everything except the two database reads is pure and deterministic: the same
 * seed always hides the same markers.
 */
import { eq } from "drizzle-orm";
import { getDb, profileFacts } from "@/db";
import {
  buildModelInput,
  optimalFor,
  refHighFor,
  toAge,
  toSex,
  type LatestValue,
  type ModelInput,
} from "./coverage";
import { localDay } from "./daily";
import { getMetricRows } from "./data";
import { deriveAll } from "./derived";
import { applyPatternTargets } from "./patterns";
import { statusOf } from "./status";
import type { Sex } from "./vectors";
import type { EvalCase } from "@/evals/persona";
import { personaToInput, type Persona } from "@/evals/persona";
import ckd3 from "@/evals/cases/ckd3_male_70.json";
import hashimotoEarly from "@/evals/cases/hashimoto_early_female_36.json";
import healthy from "@/evals/cases/healthy_male_28.json";
import insulinResistant from "@/evals/cases/insulin_resistant_male_45.json";
import ironLow from "@/evals/cases/iron_low_female_30.json";
import lmhr from "@/evals/cases/lmhr_male_38.json";

export type Scenario =
  | { kind: "empty"; sex?: Sex; age?: number }
  | { kind: "user"; userId: string }
  | {
      kind: "sampled";
      userId: string;
      seed: number;
      mask: "last_draw" | "random_pct" | "panels" | "before_year";
      pct?: number;
      panels?: string[];
      year?: number;
    }
  | { kind: "persona"; id: string };

export interface Overlay {
  // what the simulation adds on top
  readings: { code: string; value: number; unit?: string; date: string }[];
  facts: Record<string, unknown>;
  confounders: Record<string, string[]>; // metric code → tags
}

export const EMPTY_OVERLAY: Overlay = {
  readings: [],
  facts: {},
  confounders: {},
};

/** The eval cases, statically imported so the bundler carries them. */
const PERSONAS: Record<string, { id: string; persona: Persona }> = Object.fromEntries(
  [ckd3, hashimotoEarly, healthy, insulinResistant, ironLow, lmhr].map((c) => [
    (c as { id: string }).id,
    c as unknown as { id: string; persona: Persona },
  ]),
);

export const PERSONA_IDS = Object.keys(PERSONAS).sort();

/** The whole eval case, so /brain can check a generated plan against it. */
export const personaCase = (id: string): EvalCase | undefined =>
  PERSONAS[id] as EvalCase | undefined;

/** mulberry32: 32 bits of state, good enough to hide the same markers twice. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "Lipids" and "lipid" are the same panel to a human, so they are here too. */
const samePanel = (a: string, b: string) => {
  const norm = (s: string) => s.trim().toLowerCase().replace(/s$/, "");
  return norm(a) === norm(b);
};

/** The codes a mask keeps. */
function keptCodes(
  s: Extract<Scenario, { kind: "sampled" }>,
  latest: Record<string, LatestValue>,
  categories: Map<string, string>,
): Set<string> {
  const codes = Object.keys(latest).sort();
  if (s.mask === "last_draw") {
    const newest = codes
      .map((c) => latest[c]!.date)
      .sort()
      .pop();
    return new Set(codes.filter((c) => latest[c]!.date === newest));
  }
  if (s.mask === "panels") {
    const want = s.panels ?? [];
    return new Set(
      codes.filter((c) =>
        want.some((p) => samePanel(p, categories.get(c) ?? "")),
      ),
    );
  }
  if (s.mask === "before_year") {
    const cut = String(s.year ?? new Date().getFullYear());
    return new Set(codes.filter((c) => latest[c]!.date.slice(0, 4) < cut));
  }
  // random_pct
  const next = rng(s.seed);
  const keep = (s.pct ?? 50) / 100;
  return new Set(codes.filter(() => next() < keep));
}

/** A person with nothing measured, so every hypothesis sits at its prior. */
function emptyInput(sex?: Sex, age?: number): ModelInput {
  const today = localDay();
  const profile: Record<string, unknown> = {};
  if (sex) profile.sex = sex;
  if (age != null) profile.birth_year = String(Number(today.slice(0, 4)) - age);
  return {
    today,
    profile,
    sex,
    age: age ?? undefined,
    latest: {},
    derived: {},
  };
}

/** The overlay's readings replace the latest value for their code. Exported
 *  because `lib/infogain.ts` simulates an outcome the same way. */
export function applyOverlay(input: ModelInput, overlay: Overlay): ModelInput {
  const profile = { ...input.profile, ...overlay.facts };
  const sex = toSex(profile.sex) ?? input.sex;
  const age = toAge(profile.birth_year, input.today) ?? input.age;

  const latest = { ...input.latest };
  for (const r of overlay.readings) {
    const old = latest[r.code];
    const [optimalLow, optimalHigh] = optimalFor(r.code, sex, [
      old?.optimalLow ?? null,
      old?.optimalHigh ?? null,
    ]);
    const row: LatestValue = {
      value: r.value,
      unit: r.unit ?? old?.unit ?? null,
      date: r.date,
      status: "gray",
      optimalLow,
      optimalHigh,
      refLow: old?.refLow ?? null,
      refHigh: refHighFor(r.code, old?.refHigh),
      prev: old?.value ?? null,
    };
    row.status = statusOf(row);
    latest[r.code] = row;
  }

  return applyPatternTargets({
    today: input.today,
    profile,
    sex,
    age,
    latest,
    derived: deriveAll(latest, sex, age),
  });
}

export async function buildScenarioInput(
  s: Scenario,
  overlay: Overlay = EMPTY_OVERLAY,
): Promise<ModelInput> {
  if (s.kind === "empty") return applyOverlay(emptyInput(s.sex, s.age), overlay);

  if (s.kind === "persona") {
    const found = PERSONAS[s.id];
    if (!found) throw new Error(`no persona "${s.id}"`);
    return applyOverlay(personaToInput(found.persona), overlay);
  }

  if (s.kind === "user")
    return applyOverlay(await buildModelInput(s.userId), overlay);

  const [full, rows] = await Promise.all([
    buildModelInput(s.userId),
    getMetricRows(s.userId),
  ]);
  const categories = new Map(rows.map((r) => [r.code, r.category]));
  const keep = keptCodes(s, full.latest, categories);

  const latest: Record<string, LatestValue> = {};
  for (const [code, row] of Object.entries(full.latest))
    if (keep.has(code)) latest[code] = row;

  // ponytail: the mask hides whole markers, not individual draws, so
  // `before_year` drops any marker whose newest reading is too recent rather
  // than rewinding it to the reading before. One filter, no second query.
  return applyOverlay(
    applyPatternTargets({
      today: full.today,
      profile: full.profile,
      sex: full.sex,
      age: full.age,
      latest,
      derived: deriveAll(latest, full.sex, full.age),
    }),
    overlay,
  );
}

/** The panels a user actually has, for the mask picker. */
export async function userPanels(userId: string): Promise<string[]> {
  const rows = await getMetricRows(userId);
  return [...new Set(rows.map((r) => r.category))].sort();
}

/** The facts on file, so the page can show what the run read. */
export async function userFacts(
  userId: string,
): Promise<Record<string, unknown>> {
  const rows = await getDb()
    .select()
    .from(profileFacts)
    .where(eq(profileFacts.userId, userId));
  return Object.fromEntries(rows.map((f) => [f.key, f.value]));
}
