/**
 * HealthKit, all we can take: the mapping table, the units and the daily
 * arithmetic. Pure — no database, no clock, no network — because principle 3
 * applies to phones too. The watch sends raw samples; this file decides what
 * each type is worth, in which unit, and what one day of it comes to.
 *
 * Three destinations, and the table below is the whole contract:
 *  - `reading`: a `readings` row per day, in the catalog's own unit, carrying
 *    `source: "healthkit"` so it can never collide with a lab draw.
 *  - `daily`: a `daily_logs` column or a key in its `wearable` jsonb.
 *  - `fact`: a `profile_facts` key through the normal fact path.
 *
 * Anything HealthKit sends that is not in the table comes back from
 * `seenNotUsed` so the Sync tab can list it: take all, use what we can, hide
 * nothing.
 */
import { convert } from "./units";

/** One HealthKit sample, exactly as the phone reads it out of the store. */
export interface Sample {
  /** `HKQuantityTypeIdentifierStepCount`, or the short name without the prefix. */
  type: string;
  /** The HealthKit unit string: `count`, `kg`, `mg/dL`, `%`, `ms`, `min`. */
  unit?: string | null;
  value: number;
  /** ISO instants. `end` defaults to `start` for a point sample. */
  start: string;
  end?: string | null;
  /** `com.apple.health`, `com.dexcom.g7`, ... kept for the audit trail. */
  sourceBundle?: string | null;
}

/** How one day of a type is squashed into one number. */
export type How = "sum" | "median" | "last" | "max" | "durationMin";

export interface HkMapping {
  /** The HealthKit identifier, without the `HKQuantityTypeIdentifier` prefix. */
  type: string;
  lands: "reading" | "daily" | "fact";
  /** readings: the metric code. daily: the field. fact: the fact key. */
  key: string;
  /** The unit the value is stored in, which is the catalog's unit. */
  unit?: string;
  how: How;
  /** Outside this, in the stored unit, the sample is a device artefact. */
  plausible?: [number, number];
  /** HealthKit sends 0..1 for these; a percent is 0..100. */
  fraction?: boolean;
  /** What this is, for the Sync tab and the tests. */
  name: string;
}

/**
 * The table. Order is documentation order: activity, heart, sleep, fitness,
 * body, vitals, glucose, temperature, cycle, mindfulness, food.
 */
export const HK_TYPES: HkMapping[] = [
  // ── activity: the daily aggregates ────────────────────────────────────
  {
    type: "StepCount",
    lands: "daily",
    key: "steps",
    how: "sum",
    plausible: [0, 120000],
    name: "Steps",
  },
  {
    type: "ActiveEnergyBurned",
    lands: "daily",
    key: "activeEnergyKcal",
    unit: "kcal",
    how: "sum",
    plausible: [0, 10000],
    name: "Active energy",
  },
  {
    type: "AppleExerciseTime",
    lands: "daily",
    key: "exerciseMin",
    unit: "min",
    how: "sum",
    plausible: [0, 1440],
    name: "Exercise minutes",
  },
  {
    type: "AppleStandHour",
    lands: "daily",
    key: "standHours",
    how: "sum",
    plausible: [0, 24],
    name: "Stand hours",
  },

  // ── heart: one representative value a day ─────────────────────────────
  {
    type: "RestingHeartRate",
    lands: "reading",
    key: "resting_heart_rate",
    unit: "bpm",
    how: "median",
    plausible: [25, 140],
    name: "Resting heart rate",
  },
  {
    type: "HeartRateVariabilitySDNN",
    lands: "reading",
    key: "hrv_sdnn",
    unit: "ms",
    how: "median",
    plausible: [1, 400],
    name: "HRV (SDNN)",
  },
  {
    type: "RespiratoryRate",
    lands: "reading",
    key: "respiratory_rate",
    unit: "breaths/min",
    how: "median",
    plausible: [4, 60],
    name: "Respiratory rate",
  },
  {
    type: "OxygenSaturation",
    lands: "reading",
    key: "spo2",
    unit: "%",
    how: "median",
    fraction: true,
    plausible: [50, 100],
    name: "Blood oxygen",
  },
  {
    type: "WalkingHeartRateAverage",
    lands: "reading",
    key: "walking_hr_avg",
    unit: "bpm",
    how: "median",
    plausible: [40, 200],
    name: "Walking heart rate average",
  },
  {
    type: "HeartRateRecoveryOneMinute",
    lands: "reading",
    key: "hr_recovery_1min",
    unit: "bpm",
    how: "max",
    plausible: [1, 120],
    name: "Heart rate recovery, one minute",
  },

  // ── sleep: the one type that is scored from start/end, not from value ──
  {
    type: "SleepAnalysis",
    lands: "reading",
    key: "sleep_duration",
    unit: "min",
    how: "durationMin",
    plausible: [30, 1080],
    name: "Sleep",
  },

  // ── fitness and body ──────────────────────────────────────────────────
  {
    type: "VO2Max",
    lands: "reading",
    key: "vo2max_est",
    unit: "mL/kg/min",
    how: "last",
    plausible: [10, 90],
    name: "VO2max",
  },
  {
    type: "BodyMass",
    lands: "reading",
    key: "weight",
    unit: "lbs",
    how: "last",
    plausible: [44, 880],
    name: "Weight",
  },
  {
    type: "BodyFatPercentage",
    lands: "reading",
    key: "body_fat_pct",
    unit: "%",
    how: "last",
    fraction: true,
    plausible: [2, 70],
    name: "Body fat",
  },
  {
    type: "WaistCircumference",
    lands: "reading",
    key: "waist_cm",
    unit: "cm",
    how: "last",
    plausible: [40, 200],
    name: "Waist",
  },

  // ── vitals ────────────────────────────────────────────────────────────
  {
    type: "BloodPressureSystolic",
    lands: "reading",
    key: "bp_systolic",
    unit: "mmHg",
    how: "median",
    plausible: [60, 260],
    name: "Blood pressure, systolic",
  },
  {
    type: "BloodPressureDiastolic",
    lands: "reading",
    key: "bp_diastolic",
    unit: "mmHg",
    how: "median",
    plausible: [30, 160],
    name: "Blood pressure, diastolic",
  },
  {
    // A meter sends one a day, a CGM sends 288. The median is the day's
    // number; every sample is still in the batch the phone kept.
    type: "BloodGlucose",
    lands: "reading",
    key: "glucose",
    unit: "mg/dL",
    how: "median",
    plausible: [20, 700],
    name: "Glucose",
  },
  {
    type: "AppleSleepingWristTemperature",
    lands: "reading",
    key: "wrist_temp",
    unit: "C",
    how: "median",
    plausible: [28, 42],
    name: "Sleeping wrist temperature",
  },

  // ── cycle ─────────────────────────────────────────────────────────────
  {
    // The flow level itself says nothing the engine reads; the days it falls
    // on say everything, and `cycleFacts` below does that arithmetic.
    type: "MenstrualFlow",
    lands: "fact",
    key: "cycle_length_days",
    how: "last",
    name: "Menstrual flow",
  },

  // ── mindfulness and food ──────────────────────────────────────────────
  {
    type: "MindfulSession",
    lands: "daily",
    key: "mindfulMin",
    unit: "min",
    how: "durationMin",
    plausible: [1, 1440],
    name: "Mindful minutes",
  },
  {
    type: "DietaryEnergyConsumed",
    lands: "daily",
    key: "kcal",
    unit: "kcal",
    how: "sum",
    plausible: [0, 20000],
    name: "Dietary energy",
  },
  {
    type: "DietaryProtein",
    lands: "daily",
    key: "proteinG",
    unit: "g",
    how: "sum",
    plausible: [0, 1000],
    name: "Dietary protein",
  },
  {
    type: "DietaryCarbohydrates",
    lands: "daily",
    key: "carbsG",
    unit: "g",
    how: "sum",
    plausible: [0, 2000],
    name: "Dietary carbohydrates",
  },
  {
    type: "DietaryFatTotal",
    lands: "daily",
    key: "fatG",
    unit: "g",
    how: "sum",
    plausible: [0, 1000],
    name: "Dietary fat",
  },
];

/** The four nutrition keys, so the daily merge can tell food from the rest. */
export const NUTRITION_KEYS = ["kcal", "proteinG", "carbsG", "fatG"] as const;
export type NutritionKey = (typeof NUTRITION_KEYS)[number];

/**
 * Metrics HealthKit needs that no lab sheet ever prints, defined the way the
 * catalog defines a self-measured metric. `ensureMetrics` in the route inserts
 * them with `on conflict do nothing`, which is how `saveReadings` mints a
 * metric it has never seen.
 */
export const HK_METRICS: {
  code: string;
  name: string;
  category: string;
  unit: string;
}[] = [
  { code: "hrv_sdnn", name: "HRV (SDNN)", category: "wearable", unit: "ms" },
  {
    code: "walking_hr_avg",
    name: "Walking Heart Rate Average",
    category: "wearable",
    unit: "bpm",
  },
  {
    code: "hr_recovery_1min",
    name: "Heart Rate Recovery, 1 min",
    category: "wearable",
    unit: "bpm",
  },
  {
    code: "vo2max_est",
    name: "VO2max (estimated)",
    category: "wearable",
    unit: "mL/kg/min",
  },
  {
    code: "body_fat_pct",
    name: "Body Fat",
    category: "vital_sign",
    unit: "%",
  },
  { code: "waist_cm", name: "Waist", category: "vital_sign", unit: "cm" },
  {
    code: "wrist_temp",
    name: "Sleeping Wrist Temperature",
    category: "wearable",
    unit: "C",
  },
];

const PREFIXES = [
  "HKQuantityTypeIdentifier",
  "HKCategoryTypeIdentifier",
  "HKDataTypeIdentifier",
];

/** `HKQuantityTypeIdentifierStepCount` and `stepCount` both give `StepCount`. */
export function shortType(type: string): string {
  let t = String(type ?? "").trim();
  for (const p of PREFIXES) if (t.startsWith(p)) t = t.slice(p.length);
  return t ? t[0]!.toUpperCase() + t.slice(1) : "";
}

const BY_TYPE = new Map(HK_TYPES.map((m) => [m.type.toLowerCase(), m]));

export const mappingFor = (type: string): HkMapping | null =>
  BY_TYPE.get(shortType(type).toLowerCase()) ?? null;

/** The types in this batch the table has never heard of, deduped and sorted. */
export function seenNotUsed(samples: Sample[]): string[] {
  const out = new Set<string>();
  for (const s of samples)
    if (!mappingFor(s.type)) out.add(shortType(s.type) || String(s.type));
  return [...out].sort();
}

/* ── units ────────────────────────────────────────────────────────────── */

/** Everything HealthKit spells differently from `lib/units.ts`. */
const HK_UNITS: Record<string, string> = {
  count: "",
  "count/min": "bpm",
  "count/s": "bpm",
  bpm: "bpm",
  ms: "ms",
  s: "s",
  secs: "s",
  min: "min",
  mins: "min",
  hr: "h",
  kcal: "kcal",
  cal: "cal",
  g: "g",
  kg: "kg",
  lb: "lbs",
  m: "m",
  cm: "cm",
  in: "in",
  degc: "C",
  degf: "F",
  "ml/kg·min": "mL/kg/min",
  "ml/kg*min": "mL/kg/min",
  "ml/(kg*min)": "mL/kg/min",
  "mmol<180.156>/l": "mmol/L",
};

const cleanUnit = (u: string | null | undefined): string => {
  const raw = String(u ?? "")
    .trim()
    .toLowerCase();
  return HK_UNITS[raw] ?? raw;
};

/**
 * One sample's value in the unit we store, or null when nothing plausible
 * comes out. `lib/units.ts` owns every factor it knows; the handful it cannot
 * know (a percent sent as a fraction, Fahrenheit's offset, seconds of
 * mindfulness) are handled here and nowhere else.
 */
export function toStored(
  value: number,
  hkUnit: string | null | undefined,
  m: HkMapping,
): number | null {
  if (!Number.isFinite(value)) return null;
  const from = cleanUnit(hkUnit);
  const to = m.unit ?? "";
  let out = value;

  if (m.fraction && (from === "%" || from === "") && Math.abs(value) <= 1.5)
    out = value * 100;
  else if (to === "C" && from === "F") out = ((value - 32) * 5) / 9;
  else if (to === "min" && from === "s") out = value / 60;
  else if (to === "kcal" && from === "cal") out = value / 1000;
  else if (to && from && from !== to) {
    const converted = convert(value, from, to, m.key);
    if (converted == null) return null;
    out = converted;
  }

  out = Number(out.toPrecision(6));
  if (m.plausible && (out < m.plausible[0] || out > m.plausible[1]))
    return null;
  return out;
}

/* ── days ─────────────────────────────────────────────────────────────── */

/**
 * The local day a sample belongs to: the date the phone wrote, as written.
 *
 * The phone sends instants in its own wall clock with the offset attached
 * (`2026-08-30T23:10:00+03:00`), so the date in the string is already the day
 * the person was living in and the server's timezone never enters into it. A
 * client that sends UTC (`...Z`) gets UTC days, which is the honest answer to
 * a client that threw its timezone away.
 */
export function dayOf(instant: string): string | null {
  return String(instant ?? "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

/** `2026-08-30T21:40:00+03:00` → 21.666…, the hour the composer's facts use. */
export function hourOf(instant: string): number | null {
  const m = String(instant ?? "").match(/[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

/** A sleep window in minutes, from its own start and end. */
export const minutesBetween = (start: string, end: string): number =>
  Math.max(0, (Date.parse(end) - Date.parse(start)) / 60000);

/**
 * The night a sleep sample belongs to.
 *
 * A night that starts at 23:30 and ends at 07:10 is one night, and the day it
 * counts for is the morning it ended on: that is the row "slept 7h" belongs
 * next to. Anything ending before 20:00 counts for the day it ended.
 */
export function sleepDay(sample: Sample): string | null {
  const end = sample.end ?? sample.start;
  return dayOf(end);
}

/** Asleep stages. `InBed` and `Awake` are time in bed, not time asleep. */
const ASLEEP = /asleep/i;

export const STAGE_NAMES: Record<string, string> = {
  asleepdeep: "deep",
  asleepcore: "core",
  asleeprem: "rem",
  asleepunspecified: "asleep",
  awake: "awake",
  inbed: "inBed",
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

const reduceHow = (how: How, xs: number[]): number => {
  if (how === "sum" || how === "durationMin")
    return xs.reduce((a, b) => a + b, 0);
  if (how === "max") return Math.max(...xs);
  if (how === "last") return xs[xs.length - 1]!;
  return median(xs);
};

/* ── the aggregate ────────────────────────────────────────────────────── */

export interface DayReading {
  day: string;
  code: string;
  value: number;
  unit: string;
  /** How many samples went into it, for the audit line. */
  samples: number;
}

export interface DayDaily {
  day: string;
  /** `steps`, `exerciseMin`, `activeEnergyKcal`, `kcal`, `proteinG`, ... */
  field: string;
  value: number;
}

export interface DayStages {
  day: string;
  /** Minutes per stage: deep, core, rem, awake, inBed. */
  stages: Record<string, number>;
}

export interface Aggregate {
  readings: DayReading[];
  daily: DayDaily[];
  stages: DayStages[];
  /** Fact key → value, from the whole batch rather than from one day. */
  facts: Record<string, string>;
  /** The days this batch touched at all, sorted. */
  days: string[];
  /** Types with no mapping, for the Sync tab's "seen, not used" list. */
  unmapped: string[];
  /** Samples the table knew but whose value was not plausible. */
  dropped: number;
}

/**
 * A batch of raw samples into everything the server is about to write.
 *
 * Pure, and the only place the arithmetic lives: the phone may send the same
 * night twice, in any order, in any unit HealthKit offers, and this comes out
 * the same. `sleepDay` puts a night on the morning it ended, sleep is summed
 * over the asleep stages only, and every other type is reduced by its own
 * `how`.
 */
export function aggregate(samples: Sample[]): Aggregate {
  const byKey = new Map<string, { m: HkMapping; day: string; xs: number[] }>();
  const stages = new Map<string, Record<string, number>>();
  const days = new Set<string>();
  const flowDays = new Set<string>();
  let dropped = 0;

  // `last` means the newest sample of the day, so the batch is read in time
  // order whatever order it arrived in.
  const ordered = [...samples].sort((a, b) =>
    String(a.start).localeCompare(String(b.start)),
  );

  for (const s of ordered) {
    const m = mappingFor(s.type);
    if (!m) continue;
    const isSleep = m.type === "SleepAnalysis";
    const day = isSleep ? sleepDay(s) : dayOf(s.start);
    if (!day) continue;
    days.add(day);

    if (m.type === "MenstrualFlow") {
      flowDays.add(day);
      continue;
    }

    if (isSleep || m.how === "durationMin") {
      const minutes = s.end
        ? minutesBetween(s.start, s.end)
        : (toStored(s.value, s.unit, m) ?? 0);
      if (!(minutes > 0)) continue;
      if (isSleep) {
        const stage = STAGE_NAMES[String(s.unit ?? "").toLowerCase()] ?? "";
        const bucket = stages.get(day) ?? {};
        // The stage is carried in `unit` because a category sample has no unit
        // of its own; an app that sends none is counted as plain asleep time.
        const name = stage || "asleep";
        bucket[name] = Math.round((bucket[name] ?? 0) + minutes);
        stages.set(day, bucket);
        if (name === "awake" || name === "inBed") continue;
      }
      const key = `${m.type}|${day}`;
      const slot = byKey.get(key) ?? { m, day, xs: [] };
      slot.xs.push(minutes);
      byKey.set(key, slot);
      continue;
    }

    const value = toStored(s.value, s.unit, m);
    if (value == null) {
      dropped++;
      continue;
    }
    const key = `${m.type}|${day}`;
    const slot = byKey.get(key) ?? { m, day, xs: [] };
    slot.xs.push(value);
    byKey.set(key, slot);
  }

  const readings: DayReading[] = [];
  const daily: DayDaily[] = [];
  for (const { m, day, xs } of byKey.values()) {
    if (!xs.length) continue;
    let value = Number(reduceHow(m.how, xs).toPrecision(6));
    if (m.plausible && (value < m.plausible[0] || value > m.plausible[1])) {
      dropped += xs.length;
      continue;
    }
    // Steps and stand hours are counts: a count with a decimal point is noise.
    if (!m.unit) value = Math.round(value);
    if (m.lands === "reading")
      readings.push({
        day,
        code: m.key,
        value,
        unit: m.unit ?? "",
        samples: xs.length,
      });
    else if (m.lands === "daily")
      daily.push({ day, field: m.key, value: Math.round(value * 100) / 100 });
  }

  const facts = cycleFacts([...flowDays]);

  return {
    readings: readings.sort(
      (a, b) => a.day.localeCompare(b.day) || a.code.localeCompare(b.code),
    ),
    daily: daily.sort(
      (a, b) => a.day.localeCompare(b.day) || a.field.localeCompare(b.field),
    ),
    stages: [...stages.entries()]
      .map(([day, s]) => ({ day, stages: s }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    facts,
    days: [...days].sort(),
    unmapped: seenNotUsed(samples),
    dropped,
  };
}

/**
 * Readings that are also the answer to a question the interview asks.
 *
 * `waist_cm`, `resting_hr` and `grip_kg`/`vo2max_est` are tier-0 *facts* in
 * `lib/vectors.ts`, not metric codes, so a watch that measures them has to
 * write both: the reading for the trend line and the fact so the vector stops
 * saying "never measured" and the rules that read `missing(m, ...)` can fire.
 */
export const FACT_FROM_READING: Record<string, string> = {
  waist_cm: "waist_cm",
  resting_heart_rate: "resting_hr",
  vo2max_est: "vo2max_est",
};

/** The newest reading per code that also answers a fact, as `key → value`. */
export function factsFromReadings(
  readings: DayReading[],
): { key: string; value: string; day: string }[] {
  const out = new Map<string, { key: string; value: string; day: string }>();
  for (const r of [...readings].sort((a, b) => a.day.localeCompare(b.day))) {
    const key = FACT_FROM_READING[r.code];
    if (key) out.set(key, { key, value: String(r.value), day: r.day });
  }
  return [...out.values()];
}

/** A gap this long between bleeding days is a new cycle, not the same one. */
const NEW_CYCLE_GAP = 5;

const DAY_MS = 86_400_000;
const between = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS,
  );

/**
 * The cycle-length answer, out of the days flow was logged on.
 *
 * A period start is a bleeding day with at least five clear days before it;
 * the length is the distance between two starts. The answer is one of the
 * options `cycle_length_days` already offers, so the fact path writes it
 * exactly as if the person had tapped it. Fewer than two starts says nothing,
 * and saying nothing is the right answer then.
 */
export function cycleFacts(flowDays: string[]): Record<string, string> {
  const days = [...new Set(flowDays)].sort();
  if (days.length < 2) return {};
  const starts = days.filter(
    (d, i) => i === 0 || between(days[i - 1]!, d) >= NEW_CYCLE_GAP,
  );
  if (starts.length < 2) return {};
  const lengths = starts
    .slice(1)
    .map((d, i) => between(starts[i]!, d))
    .filter((n) => n >= 10 && n <= 90);
  if (!lengths.length) return {};
  const spread = Math.max(...lengths) - Math.min(...lengths);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  // Nine days apart is what "it varies a lot" means to anyone tracking; the
  // bands are the ones the question itself offers.
  if (lengths.length > 1 && spread > 9)
    return { cycle_length_days: "It varies a lot" };
  if (mean < 21) return { cycle_length_days: "Under 21" };
  if (mean > 35) return { cycle_length_days: "Over 35" };
  return { cycle_length_days: "21 to 35" };
}

/* ── the daily row ────────────────────────────────────────────────────── */

/** The `daily_logs` columns a sync may fill, and the field name it uses. */
export const DAILY_COLUMNS: Record<
  string,
  "steps" | "exerciseMin" | "sleepHours" | "weightKg"
> = {
  steps: "steps",
  exerciseMin: "exerciseMin",
  sleepHours: "sleepHours",
  weightKg: "weightKg",
};

export interface DailyRow {
  steps?: number | null;
  exerciseMin?: number | null;
  sleepHours?: number | null;
  weightKg?: number | null;
}

export interface WearableBlob {
  source: string;
  wrote?: string[];
  activeEnergyKcal?: number;
  standHours?: number;
  mindfulMin?: number;
  sleepStages?: Record<string, number>;
  syncedAt?: string;
}

/**
 * What one day's sync changes on an existing `daily_logs` row.
 *
 * A number the person typed on /today is theirs: the sync fills a column only
 * when it is empty or when the last sync is the one that filled it, which
 * `wearable.wrote` remembers. So a re-sync refreshes its own numbers for ever
 * and never overwrites a hand-typed one.
 */
export function mergeDaily(
  existing: { row: DailyRow; wearable: WearableBlob | null } | null,
  incoming: {
    columns: DailyRow;
    wearable: Omit<WearableBlob, "source" | "wrote">;
  },
): { row: DailyRow; wearable: WearableBlob } {
  const owned = new Set(existing?.wearable?.wrote ?? []);
  const row: DailyRow = {};
  const wrote: string[] = [...owned];
  for (const [field, value] of Object.entries(incoming.columns)) {
    if (value == null) continue;
    const current = (existing?.row ?? {})[field as keyof DailyRow];
    if (current != null && !owned.has(field)) continue;
    row[field as keyof DailyRow] = value as number;
    if (!wrote.includes(field)) wrote.push(field);
  }
  return {
    row,
    wearable: {
      ...(existing?.wearable ?? {}),
      ...incoming.wearable,
      source: "healthkit",
      wrote: wrote.sort(),
    },
  };
}

/* ── nutrition ────────────────────────────────────────────────────────── */

export interface NutritionEntryLike {
  at?: string;
  label: string;
  kcal?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  source: string;
  estimated: boolean;
}

export interface NutritionBlob {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  estimated: boolean;
  entries: NutritionEntryLike[];
}

const sumOf = (entries: NutritionEntryLike[], key: NutritionKey) => {
  const xs = entries
    .map((e) => e[key])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10 : null;
};

/**
 * One more entry on a day's food, with the totals recomputed here.
 *
 * The server owns the sum, so a photo the model read as "620 kcal" is a
 * labelled estimate and the day's total is arithmetic over labelled estimates.
 * A second sync of the same source replaces its own entry rather than adding
 * one, which is what makes re-syncing a day idempotent.
 */
export function mergeNutrition(
  existing: NutritionBlob | null,
  entry: NutritionEntryLike,
  { replaceSource = false } = {},
): NutritionBlob {
  const kept = (existing?.entries ?? []).filter(
    (e) => !(replaceSource && e.source === entry.source),
  );
  const entries = [...kept, entry].sort((a, b) =>
    (a.at ?? "").localeCompare(b.at ?? ""),
  );
  return {
    kcal: sumOf(entries, "kcal"),
    proteinG: sumOf(entries, "proteinG"),
    carbsG: sumOf(entries, "carbsG"),
    fatG: sumOf(entries, "fatG"),
    estimated: entries.some((e) => e.estimated),
    entries,
  };
}
