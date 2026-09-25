/**
 * Food targets: what the kcal and protein rows of the score are measured
 * against. Phase 37 task A2.
 *
 * Derived, and the person can override. The estimate is Mifflin-St Jeor off
 * the facts the app already asks for (`sex`, `birth_year`, `height_cm`) and the
 * newest weight on `daily_logs`, which is where both a typed weight and a
 * phone's BodyMass land. A value the person set wins field by field, and
 * `estimated` says whether anything returned came from the formula. With no
 * inputs and no override there is no target, and the rows that need one drop
 * out of the score rather than being measured against a guess.
 */
import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { dailyLogs, getDb, profileFacts } from "@/db";
import { toSex } from "./coverage";
import { clearFact, writeFact } from "./facts";

export interface Targets {
  kcal: number | null;
  proteinG: number | null;
  estimated: boolean;
}

/** The two `profile_facts` keys a person's own targets live under. */
export const TARGET_FACTS = {
  kcal: "kcal_target",
  proteinG: "protein_target_g",
} as const;

/**
 * Mifflin-St Jeor 1990, the equation the Academy of Nutrition and Dietetics
 * found closest to measured resting expenditure.
 * ponytail: fixed light-activity factor; derive it from steps when the owner
 * asks.
 */
const ACTIVITY = 1.4;

/** ISSN 2017 position stand: 1.4–2.0 g/kg for active adults; 1.6 is its middle. */
const PROTEIN_PER_KG = 1.6;

export function estimateTargets(p: {
  weightKg: number | null;
  heightCm: number | null;
  birthYear: number | null;
  sex: string | null;
  year: number;
}): { kcal: number | null; proteinG: number | null } {
  const kg = p.weightKg;
  if (kg == null || !(kg > 0)) return { kcal: null, proteinG: null };
  const sex = toSex(p.sex);
  const age = p.birthYear != null ? p.year - p.birthYear : null;
  const kcal =
    p.heightCm != null && p.heightCm > 0 && age != null && age > 0 && sex
      ? Math.round(
          ((10 * kg +
            6.25 * p.heightCm -
            5 * age +
            (sex === "male" ? 5 : -161)) *
            ACTIVITY) /
            10,
        ) * 10
      : null;
  return { kcal, proteinG: Math.round(PROTEIN_PER_KG * kg) };
}

export function resolveTargets(
  set: { kcal?: number | null; proteinG?: number | null },
  est: ReturnType<typeof estimateTargets>,
): Targets {
  const kcal = set.kcal ?? est.kcal;
  const proteinG = set.proteinG ?? est.proteinG;
  return {
    kcal,
    proteinG,
    estimated:
      (set.kcal == null && est.kcal != null) ||
      (set.proteinG == null && est.proteinG != null),
  };
}

/** The first number in a fact's value: facts are typed answers, "180 cm" included. */
const numberOf = (v: unknown): number | null => {
  const n = Number(String(v ?? "").match(/\d+(\.\d+)?/)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function targetsFor(
  userId: string,
  day: string,
): Promise<Targets> {
  const db = getDb();
  const [facts, [weight]] = await Promise.all([
    db
      .select({ key: profileFacts.key, value: profileFacts.value })
      .from(profileFacts)
      .where(
        and(
          eq(profileFacts.userId, userId),
          inArray(profileFacts.key, [
            "sex",
            "birth_year",
            "height_cm",
            TARGET_FACTS.kcal,
            TARGET_FACTS.proteinG,
          ]),
        ),
      ),
    db
      .select({ kg: dailyLogs.weightKg })
      .from(dailyLogs)
      .where(
        and(
          eq(dailyLogs.userId, userId),
          lte(dailyLogs.day, day),
          isNotNull(dailyLogs.weightKg),
        ),
      )
      .orderBy(desc(dailyLogs.day))
      .limit(1),
  ]);
  const fact = (key: string) => facts.find((f) => f.key === key)?.value;
  const est = estimateTargets({
    weightKg: weight?.kg ?? null,
    heightCm: numberOf(fact("height_cm")),
    birthYear: numberOf(fact("birth_year")),
    sex: fact("sex") == null ? null : String(fact("sex")),
    year: Number(day.slice(0, 4)),
  });
  return resolveTargets(
    {
      kcal: numberOf(fact(TARGET_FACTS.kcal)),
      proteinG: numberOf(fact(TARGET_FACTS.proteinG)),
    },
    est,
  );
}

/** A number writes the fact, null clears it, a missing field is left alone. */
export async function setTargets(
  userId: string,
  body: { kcal?: number | null; proteinG?: number | null },
): Promise<void> {
  for (const field of ["kcal", "proteinG"] as const) {
    const v = body[field];
    if (v === undefined) continue;
    const key = TARGET_FACTS[field];
    if (v === null) await clearFact(userId, key);
    else
      await writeFact(userId, key, String(Math.round(v)), { source: "user" });
  }
}
