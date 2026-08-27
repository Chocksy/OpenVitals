import { formatRange, healthStatus } from "./status";
/**
 * The data curator. It runs after every upload and once a day, fixes what is
 * safe to fix on its own, and turns everything else into a question for the
 * user in `review_items`.
 *
 * Two halves on purpose:
 *  - pure planners (`planUnits`, `planMissingRange`, `planImplausible`) that
 *    take plain rows and return actions, so they are testable without a DB;
 *  - `runCurator`, which loads rows, applies the actions and writes the run.
 *
 * The curator NEVER deletes a reading. The only delete in this file is inside
 * `applyAnswer`, behind the user answering "Delete this reading".
 */
import { generateText } from "ai";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  getDb,
  pool,
  curatorRuns,
  goals as goalsTable,
  metrics as metricsTable,
  optimalOverrides,
  profileFacts,
  readings as readingsTable,
  reviewItems,
  uploads as uploadsTable,
  type CuratorStats,
  type Metric,
  type ReadingFlag,
  type ReviewSubject,
} from "@/db";
import {
  optimalFor,
  queueProfileQuestions,
  saveFact,
  toAge,
  toSex,
} from "./coverage";
import { model, stripCodeFences } from "./extract";
import { inGoal, localDay } from "./daily";
import { planRawVerify, rawVerifyScope } from "./raw-verify";
import { SEX_RANGES } from "./vectors";
import { conversionFactor, normalizeUnit, round } from "./units";

export type Trigger = "upload" | "daily" | "manual";

export type Check =
  | "unit_spelling"
  | "unit_convert"
  | "ref_scale"
  | "raw_verify"
  | "urine_text"
  | "metric_identity"
  | "missing_range"
  | "missing_optimal"
  | "implausible_value"
  | "foreign_reading"
  | "goal_check";

/** The subset of a reading the planners need. */
export interface ReadingLike {
  id: string;
  uploadId: string | null;
  metricCode: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  observedAt: string;
  flags: ReadingFlag[] | null;
}

export interface MetricLike {
  code: string;
  name: string;
  unit: string | null;
}

export type Action =
  | {
      type: "fix";
      check: Check;
      readingId: string;
      patch: Partial<ReadingLike>;
    }
  /** "Stop asking about this metric." */
  | { type: "mute"; check: Check; metricCode: string }
  | {
      type: "queue";
      check: Check;
      kind: string;
      question: string;
      options: string[];
      subject: ReviewSubject;
    };

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/** How many times apart two positive numbers are. */
const ratio = (a: number, b: number) => Math.max(a / b, b / a);

/** Does this range contain the value? False when there is no range at all. */
const brackets = (lo: number | null, hi: number | null, v: number): boolean =>
  (lo != null || hi != null) &&
  (lo == null || v >= lo) &&
  (hi == null || v <= hi);

const addFlags = (
  reading: ReadingLike,
  ...extra: ReadingFlag[]
): ReadingFlag[] => [...(reading.flags ?? []), ...extra];

/** A tag, or the key of one of the object-shaped flags. */
const hasFlag = (reading: ReadingLike, tag: string) =>
  (reading.flags ?? []).some(
    (f) => f === tag || (typeof f === "object" && f !== null && tag in f),
  );

/* ------------------------------------------------------------------ *
 * 1 + 2. unit_spelling and unit_convert
 * ------------------------------------------------------------------ */

/**
 * Two measurements sharing one catalog entry. PDW-SD is a width in fL and
 * PDW-CV is the same width as a percentage; no factor turns one into the
 * other, so the fL readings get their own metric instead of a question.
 */
const MEASURAND_SPLIT: Record<string, { unit: string; to: string }[]> = {
  pdw: [{ unit: "fL", to: "pdw_sd" }],
};

/**
 * Same unit typed differently → adopt the canonical spelling. A unit we know
 * how to convert → convert value and both range bounds, keep the original.
 * Anything else → ask.
 *
 * `history` is every reading the user has, used to sanity-check a conversion
 * against the metric's own past values.
 */
export function planUnits(
  targets: ReadingLike[],
  byCode: Map<string, MetricLike>,
  history: ReadingLike[] = targets,
): Action[] {
  const actions: Action[] = [];

  for (const r of targets) {
    const m = byCode.get(r.metricCode);
    if (!m?.unit || !r.unit) continue;
    if (r.unit === m.unit) continue;

    if (normalizeUnit(r.unit) === normalizeUnit(m.unit)) {
      actions.push({
        type: "fix",
        check: "unit_spelling",
        readingId: r.id,
        patch: { unit: m.unit },
      });
      continue;
    }

    const factor = conversionFactor(r.unit, m.unit, r.metricCode);
    if (factor != null) {
      const scale = (v: number | null) =>
        v == null ? null : round(v * factor);
      const relabelled = valueIsAlreadyCanonical(r, m, factor, history);
      // A relabelled row may carry a range that is already canonical too.
      // Keep whichever version of the range actually contains the value.
      const keepRange =
        relabelled &&
        r.value != null &&
        brackets(r.refLow, r.refHigh, r.value) &&
        !brackets(scale(r.refLow), scale(r.refHigh), r.value);
      actions.push({
        type: "fix",
        check: "unit_convert",
        readingId: r.id,
        patch: {
          value: relabelled ? r.value : scale(r.value),
          refLow: keepRange ? r.refLow : scale(r.refLow),
          refHigh: keepRange ? r.refHigh : scale(r.refHigh),
          unit: m.unit,
          flags: addFlags(
            r,
            relabelled ? "unit_relabelled" : "unit_converted",
            { orig: { value: r.value, unit: r.unit } },
          ),
        },
      });
      continue;
    }

    const split = MEASURAND_SPLIT[r.metricCode]?.find(
      (s) => normalizeUnit(s.unit) === normalizeUnit(r.unit),
    );
    if (split) {
      actions.push({
        type: "fix",
        check: "unit_convert",
        readingId: r.id,
        patch: {
          metricCode: split.to,
          flags: addFlags(r, "split_measurand", {
            moved: {
              from: r.metricCode,
              refLow: r.refLow,
              refHigh: r.refHigh,
            },
          }),
        },
      });
      continue;
    }

    actions.push({
      type: "queue",
      check: "unit_convert",
      kind: "unit_unknown",
      question: `"${m.name}" was reported in "${r.unit || "(no unit)"}" on ${r.observedAt}; the canonical unit is "${m.unit}". What should I do?`,
      options: ["Treat as same unit", "Multiply by …", "Leave as is"],
      subject: {
        key: `${r.id}`,
        readingId: r.id,
        metricCode: r.metricCode,
        fromUnit: r.unit,
        toUnit: m.unit,
        detail: `${r.value ?? "?"} ${r.unit || "(no unit)"} on ${r.observedAt}`,
      },
    });
  }

  return actions;
}

/**
 * Some legacy rows carry a value that is ALREADY in the canonical unit while
 * only the label and the reference range are in the reported one (platelets
 * "224 /mm³" with a range of 150000-370000). Converting such a row moves the
 * value away from every other reading of that metric. When the metric's own
 * history says the raw value fits and the converted one does not, the value
 * stays put.
 */
function valueIsAlreadyCanonical(
  r: ReadingLike,
  m: MetricLike,
  factor: number,
  history: ReadingLike[],
): boolean {
  if (r.value == null || r.value <= 0) return false;
  const peers = history
    .filter(
      (h) =>
        h.metricCode === r.metricCode &&
        h.id !== r.id &&
        h.value != null &&
        h.value > 0 &&
        normalizeUnit(h.unit) === normalizeUnit(m.unit),
    )
    .map((h) => h.value!);
  if (peers.length < 2) return false;

  const typical = median(peers);
  if (typical <= 0) return false;

  // Which candidate sits closer to what this metric normally reads? The raw
  // value has to be a good fit AND a clearly better one than the converted.
  const raw = ratio(r.value, typical);
  const converted = ratio(r.value * factor, typical);
  return raw < 3 && converted > raw * 3;
}

/* ------------------------------------------------------------------ *
 * 3. ref_scale
 * ------------------------------------------------------------------ */

/** The decimal scales a printed lab range can be off by. */
const REF_FACTORS = [10, 100, 1000, 1e6, 0.1, 0.01, 0.001, 1e-6];

/** 5 % slack: a rescaled bound may land a hair inside the value. */
const bracketsLoosely = (lo: number | null, hi: number | null, v: number) =>
  (lo == null || v >= lo * 0.95) && (hi == null || v <= hi * 1.05);

/**
 * The value is in K/uL, M/uL or g/dL and the range next to it stayed in
 * cells/uL or g/L: platelets `224` against `150000 - 370000`, albumin `5.349`
 * against `35 - 53`. Exactly one power of ten turns the range back into the
 * value's own scale, so the range moves and the value never does.
 *
 * The metric's other readings decide what is safe. Only readings whose own
 * range holds their own value count, they say where this metric's ranges live,
 * and the row is rescaled only when its value sits where their values sit.
 * With no such reading anywhere, a single bracketing factor has to carry the
 * row alone. A genuinely high result (CRP 15.8 in 0 - 49.9) is inside its
 * range and is never touched.
 */
export function planRefScale(
  targets: ReadingLike[],
  history: ReadingLike[],
): Action[] {
  const actions: Action[] = [];

  for (const r of targets) {
    if (r.value == null || r.value <= 0) continue;
    if (r.refHigh == null || r.refHigh <= 0) continue;
    if (hasFlag(r, "ref_rescaled")) continue;
    if (brackets(r.refLow, r.refHigh, r.value)) continue;

    // The smallest factor on the table is ten, so a range in the wrong scale
    // misses the value by an order of magnitude. Urobilinogen 0.1 under a
    // 0.2 - 1 range is simply a low result and stays one.
    const offBy =
      r.value > r.refHigh
        ? r.value / r.refHigh
        : r.refLow != null && r.refLow > 0
          ? r.refLow / r.value
          : 0;
    if (offBy < 5) continue;

    const peers = history
      .filter(
        (h) =>
          h.metricCode === r.metricCode &&
          h.id !== r.id &&
          h.value != null &&
          h.refHigh != null &&
          h.refHigh > 0 &&
          normalizeUnit(h.unit) === normalizeUnit(r.unit) &&
          brackets(h.refLow, h.refHigh, h.value),
      )
      .map((h) => h.refHigh!);
    const usual = peers.length ? median(peers) : null;

    // With peers, the value has to sit where their values sit inside their
    // range, and the rescaled range has to land at their scale. Without
    // peers there is nothing to compare against and a single bracketing
    // factor has to carry the row on its own.
    if (usual != null) {
      const magnitude = r.value / usual;
      if (magnitude < 0.2 || magnitude > 1.5) continue;
    }

    const fits = REF_FACTORS.filter(
      (f) =>
        bracketsLoosely(
          r.refLow == null ? null : r.refLow * f,
          r.refHigh! * f,
          r.value!,
        ) && (usual == null || ratio(r.refHigh! * f, usual) <= 3),
    );
    if (fits.length !== 1) continue;

    const factor = fits[0]!;
    actions.push({
      type: "fix",
      check: "ref_scale",
      readingId: r.id,
      patch: {
        refLow: r.refLow == null ? null : round(r.refLow * factor),
        refHigh: round(r.refHigh * factor),
        flags: addFlags(r, {
          ref_rescaled: { factor, orig: [r.refLow, r.refHigh] },
        }),
      },
    });
  }

  return actions;
}

/* ------------------------------------------------------------------ *
 * 4. urine_text
 * ------------------------------------------------------------------ */

/**
 * A urine strip line the old extractor dropped onto the blood metric.
 *
 * ponytail: the target is spelled out instead of derived as `urine_<code>`,
 * because the catalog already carries the canonical urinalysis codes and
 * `urine_wbc` next to `urine_leukocytes` is exactly the duplicate that
 * `merge-metrics.ts` exists to prevent.
 */
const URINE_TARGETS: Record<string, string> = {
  glucose: "urine_glucose",
  wbc: "urine_leukocytes",
  rbc: "urine_red_blood_cells",
  protein: "urine_protein",
  total_protein: "urine_protein",
  ketones: "urine_ketones",
  bilirubin: "urine_bilirubin",
  total_bilirubin: "urine_bilirubin",
  urobilinogen: "urine_urobilinogen",
  nitrites: "urine_nitrites",
  hemoglobin: "urine_blood",
};

const STRIP_ANSWER =
  /^(negativ|negative|absent|pozitiv|positive|trace|urme|prezent|present)/i;

/**
 * "Negativ" on blood glucose is the urine strip, not a blood sugar. The row
 * moves to the urinalysis metric, loses the blood reference range it never
 * had a right to, and keeps where it came from. No question.
 */
export function planUrineText(
  targets: ReadingLike[],
  byCode: Map<string, MetricLike>,
): Action[] {
  const actions: Action[] = [];

  for (const r of targets) {
    if (r.value != null || !r.valueText) continue;
    const to = URINE_TARGETS[r.metricCode];
    // A blood concentration is what makes the strip answer impossible here.
    if (!to || !byCode.get(r.metricCode)?.unit) continue;
    if (!STRIP_ANSWER.test(r.valueText.trim())) continue;

    actions.push({
      type: "fix",
      check: "urine_text",
      readingId: r.id,
      patch: {
        metricCode: to,
        // A strip answer is a word, not a concentration: no unit, no range.
        unit: null,
        refLow: null,
        refHigh: null,
        flags: addFlags(r, "moved_urine", {
          moved: { from: r.metricCode, refLow: r.refLow, refHigh: r.refHigh },
        }),
      },
    });
  }

  return actions;
}

/* ------------------------------------------------------------------ *
 * 4. missing_range
 * ------------------------------------------------------------------ */

/**
 * A reading with no reference range borrows the range from the most recent
 * EARLIER reading of the same metric in the same unit. If there is none, it
 * gets a `no_range` flag so the admin page can count it.
 *
 * `history` is every reading the user has; `targets` is the scope being checked.
 */
export function planMissingRange(
  targets: ReadingLike[],
  history: ReadingLike[],
): Action[] {
  const actions: Action[] = [];

  for (const r of targets) {
    if (r.refLow != null || r.refHigh != null) continue;

    const donor = history
      .filter(
        (h) =>
          h.metricCode === r.metricCode &&
          h.id !== r.id &&
          h.observedAt < r.observedAt &&
          (h.refLow != null || h.refHigh != null) &&
          normalizeUnit(h.unit) === normalizeUnit(r.unit),
      )
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
      .pop();

    if (donor) {
      actions.push({
        type: "fix",
        check: "missing_range",
        readingId: r.id,
        patch: {
          refLow: donor.refLow,
          refHigh: donor.refHigh,
          flags: addFlags(r, "range_copied"),
        },
      });
    } else if (!(r.flags ?? []).includes("no_range")) {
      actions.push({
        type: "fix",
        check: "missing_range",
        readingId: r.id,
        patch: { flags: addFlags(r, "no_range") },
      });
    }
  }

  return actions;
}

/* ------------------------------------------------------------------ *
 * 6. implausible_value
 * ------------------------------------------------------------------ */

/**
 * What a living person can read, in the metric's own canonical unit. A CBC
 * count inside these bounds is never implausible however the lab printed its
 * range, and one outside them always is. Everything else falls back to 50x
 * outside the printed range.
 */
const BOUNDS: Record<string, [number, number]> = {
  wbc: [0.5, 100], // K/uL
  rbc: [1, 10], // M/uL
  platelets: [5, 2000], // K/uL
  neutrophils_abs: [0.01, 80], // K/uL
  lymphocytes_abs: [0.05, 60], // K/uL
  monocytes_abs: [0.01, 20], // K/uL
  eosinophils_abs: [0.001, 20], // K/uL
  basophils_abs: [0.001, 10], // K/uL
  hemoglobin: [2, 25], // g/dL
  hematocrit: [10, 70], // %
};

/** Outside the physiological bounds, or 50x outside the printed range. */
export function planImplausible(
  targets: ReadingLike[],
  byCode: Map<string, MetricLike>,
): Action[] {
  const actions: Action[] = [];

  for (const r of targets) {
    if (r.value == null) continue;
    const m = byCode.get(r.metricCode);
    const bound = BOUNDS[r.metricCode];
    const canonical =
      bound != null &&
      m?.unit != null &&
      normalizeUnit(r.unit) === normalizeUnit(m.unit);

    if (canonical) {
      if (r.value >= bound[0] && r.value <= bound[1]) continue;
    } else {
      const tooHigh =
        r.refHigh != null && r.refHigh > 0 && r.value > r.refHigh * 50;
      const tooLow =
        r.refLow != null && r.refLow > 0 && r.value < r.refLow / 50;
      if (!tooHigh && !tooLow) continue;
    }

    const why = canonical
      ? `outside anything a person can read (${formatRange(bound[0], bound[1], m?.unit)})`
      : `far outside its range of ${formatRange(r.refLow, r.refHigh)}`;
    actions.push({
      type: "queue",
      check: "implausible_value",
      kind: "implausible",
      question: `"${m?.name ?? r.metricCode}" reads ${r.value} ${r.unit ?? ""} on ${r.observedAt}, ${why}. Is that right?`,
      options: ["It's correct", "Delete this reading"],
      subject: {
        key: `${r.id}`,
        readingId: r.id,
        metricCode: r.metricCode,
        detail: canonical
          ? `${r.value} ${r.unit ?? ""} vs ${formatRange(bound[0], bound[1], m?.unit)}`
          : `${r.value} ${r.unit ?? ""} vs ${formatRange(r.refLow, r.refHigh)}`,
      },
    });
  }

  return actions;
}

/* ------------------------------------------------------------------ *
 * 8. foreign_reading
 * ------------------------------------------------------------------ */

/** Answers that belong to a qualitative test, not to a numeric analyte. */
const CATEGORICAL =
  /^(negativ|negative|norm|normal|absent|prezent|present|pozitiv|positive)$/i;

/** "norm mg/dl" is the same answer as "norm"; drop the trailing unit first. */
const isCategorical = (text: string | null, unit: string | null) => {
  if (!text) return false;
  let t = text.trim();
  const u = (unit ?? "").trim().toLowerCase();
  if (u && t.toLowerCase().endsWith(u)) t = t.slice(0, -u.length).trim();
  return CATEGORICAL.test(t);
};

const midpoint = (r: ReadingLike) =>
  r.refLow != null && r.refHigh != null ? (r.refLow + r.refHigh) / 2 : null;

/**
 * The legacy import merged rows from neighbouring table lines into a metric:
 * calcium landing in `glucose`, or the urine "Negativ" strip next to blood
 * glucose. Both wreck the trend chart.
 *
 * A reading is foreign when its own reference range sits more than 3x away
 * from what this metric normally reports, or when it carries no number at all
 * and only a yes/no word. Never fixed here, only asked about.
 */
export function planForeignReadings(
  targets: ReadingLike[],
  history: ReadingLike[],
  byCode: Map<string, MetricLike>,
): Action[] {
  const actions: Action[] = [];
  const groups = new Map<string, ReadingLike[]>();
  for (const h of history)
    groups.set(h.metricCode, [...(groups.get(h.metricCode) ?? []), h]);

  for (const r of targets) {
    if ((r.flags ?? []).includes("foreign_ok")) continue;

    const peers = groups.get(r.metricCode) ?? [];
    if (peers.filter((p) => p.value != null).length < 4) continue;

    const mids = peers.map(midpoint).filter((m): m is number => m != null);
    const typical = mids.length ? median(mids) : null;
    const mine = midpoint(r);

    const oddRange =
      typical != null &&
      typical > 0 &&
      mine != null &&
      (mine < typical / 3 || mine > typical * 3);
    const oddText = r.value == null && isCategorical(r.valueText, r.unit);
    if (!oddRange && !oddText) continue;

    const lows = peers
      .map((p) => p.refLow)
      .filter((v): v is number => v != null);
    const highs = peers
      .map((p) => p.refHigh)
      .filter((v): v is number => v != null);
    const usual = formatRange(
      lows.length ? median(lows) : null,
      highs.length ? median(highs) : null,
    );
    const name = byCode.get(r.metricCode)?.name ?? r.metricCode;
    const reads =
      r.value != null
        ? `${r.value} ${r.unit ?? ""}`.trim() +
          ` with range ${formatRange(r.refLow, r.refHigh)}`
        : `"${r.valueText ?? ""}"`;

    actions.push({
      type: "queue",
      check: "foreign_reading",
      kind: "foreign_reading",
      question: `"${name}" on ${r.observedAt} reads ${reads}, unlike its other readings (range ≈ ${usual}). Does it belong here?`,
      options: ["Delete this reading", "Move to metric…", "Keep"],
      subject: {
        key: `${r.id}`,
        readingId: r.id,
        metricCode: r.metricCode,
        value: r.value,
        valueText: r.valueText,
        unit: r.unit,
        refLow: r.refLow,
        refHigh: r.refHigh,
        observedAt: r.observedAt,
        detail: `${r.observedAt} · ${reads.replace(" with range ", " · range ")}`,
      },
    });
  }

  return actions;
}

/** Apply a fix action to an in-memory row, so later checks see the new value. */
export function applyPatch(r: ReadingLike, patch: Partial<ReadingLike>) {
  Object.assign(r, patch);
}

/* ------------------------------------------------------------------ *
 * LLM checks (3 + 5)
 * ------------------------------------------------------------------ */

const hasKey = () => Boolean(process.env.OPENROUTER_API_KEY);

// ponytail: one batched call each, and at most this many metrics per run. The
// daily run picks up the rest instead of writing a 500-line prompt.
const LLM_BATCH = 25;

async function askJson<T>(system: string, prompt: string): Promise<T | null> {
  try {
    const { text } = await generateText({ model: model(), system, prompt });
    return JSON.parse(stripCodeFences(text)) as T;
  } catch (e) {
    console.error("[curator] LLM step failed:", e);
    return null;
  }
}

/** 3. Minted metrics (`category = 'other'`) that may duplicate a known one. */
async function planMetricIdentity(
  minted: Metric[],
  known: Metric[],
): Promise<Action[]> {
  if (!minted.length || !hasKey()) return [];
  const batch = minted.slice(0, LLM_BATCH);

  const answer = await askJson<{ matches?: { name: string; code: string }[] }>(
    `You match lab analyte names to a catalog of known biomarkers.
For each name in the input, decide whether it is the SAME analyte as one of the catalog entries. Different specimens (serum vs urine) or different fractions (free vs total) are NOT the same analyte.
Return JSON only: {"matches":[{"name":"<input name>","code":"<catalog code or NONE>"}]}`,
    `CATALOG (code | name | unit):
${known.map((m) => `${m.code} | ${m.name} | ${m.unit ?? ""}`).join("\n")}

NAMES TO MATCH:
${batch.map((m) => m.name).join("\n")}`,
  );

  const byCode = new Map(known.map((m) => [m.code, m]));
  const actions: Action[] = [];

  for (const match of answer?.matches ?? []) {
    const target = byCode.get(match.code);
    const source = batch.find((m) => m.name === match.name);
    if (!target || !source || target.code === source.code) continue;

    actions.push({
      type: "queue",
      check: "metric_identity",
      kind: "merge_metric",
      question: `Is "${source.name}" the same biomarker as "${target.name}"?`,
      options: ["Yes, merge", "No, keep separate"],
      subject: {
        key: `${source.code}->${target.code}`,
        metricCode: source.code,
        targetCode: target.code,
        detail: `${source.code} (${source.unit ?? "no unit"}) → ${target.code} (${target.unit ?? "no unit"})`,
      },
    });
  }

  return actions;
}

/**
 * Guideline bodies and named authors. A band whose source is one of these is
 * labelled `science`; anything else is somebody's opinion until the model says
 * otherwise. Used for the proposals queued before this app decided ranges on
 * its own and had no `basis` field.
 */
export const TRUSTED_OPTIMAL_SOURCES = [
  "Attia/Outlive",
  "Function Health",
  "Endocrine Society",
  "AHA",
  "ESC",
  "ADA",
  "KDIGO",
  "ATA",
];

export interface OptimalBand {
  metricCode: string;
  low: number | null;
  high: number | null;
  unit: string | null;
  source: string;
  basis: "science" | "opinion";
  rationale: string;
}

export interface LabRange {
  refLow: number | null;
  refHigh: number | null;
}

/** What the model is asked to return for one biomarker. */
export interface OptimalProposal {
  low: number | null;
  high: number | null;
  unit?: string | null;
  source?: string | null;
  basis?: string | null;
  rationale?: string | null;
}

/**
 * A proposal into a band this app is willing to store, or null when it cannot
 * be used at all. Two rules live here and not in the prompt: the band has to
 * be in the metric's own unit (converted when the factor is known, dropped
 * when it is not), and a band wider than the lab's own range at BOTH ends is
 * the model restating the reference interval, so it is clamped back onto it.
 */
export function planOptimalBand(
  p: OptimalProposal,
  m: MetricLike,
  lab: LabRange | null,
): OptimalBand | null {
  if (p.low == null && p.high == null) return null;

  let low = p.low;
  let high = p.high;
  if (p.unit && normalizeUnit(p.unit) !== normalizeUnit(m.unit)) {
    const factor = conversionFactor(p.unit, m.unit, m.code);
    if (factor == null) return null;
    low = low == null ? null : round(low * factor);
    high = high == null ? null : round(high * factor);
  }

  let rationale = (p.rationale ?? "").trim();
  if (
    lab &&
    lab.refLow != null &&
    low != null &&
    low < lab.refLow &&
    lab.refHigh != null &&
    high != null &&
    high > lab.refHigh
  ) {
    low = lab.refLow;
    high = lab.refHigh;
    rationale = rationale
      ? `${rationale} \u00b7 clamped to lab range`
      : "clamped to lab range";
  }

  return {
    metricCode: m.code,
    low,
    high,
    unit: m.unit,
    source: (p.source ?? "").trim() || "unsourced",
    basis: p.basis === "science" ? "science" : "opinion",
    rationale,
  };
}

/**
 * Does a new band turn a result the lab is happy with into a red one? Amber
 * does not count: only a value sitting more than half a band outside it. That
 * is the one range question this app still asks, and it carries its reason.
 */
export function flipsToRed(
  latest: {
    value: number | null;
    refLow: number | null;
    refHigh: number | null;
    observedAt?: string;
  } | null,
  before: [number | null, number | null],
  after: [number | null, number | null],
): boolean {
  if (latest?.value == null) return false;
  const at = (band: [number | null, number | null]) =>
    healthStatus({
      value: latest.value,
      refLow: latest.refLow,
      refHigh: latest.refHigh,
      optimalLow: band[0],
      optimalHigh: band[1],
    });
  return at(before) === "normal" && at(after) === "critical";
}

/** The one range question left: a band that just turned a good result red. */
export function planRangeImpact(
  band: OptimalBand,
  m: MetricLike,
  latest: {
    value: number | null;
    refLow: number | null;
    refHigh: number | null;
    observedAt: string;
  } | null,
  before: [number | null, number | null],
  lab: LabRange | null,
): Action | null {
  if (!flipsToRed(latest, before, [band.low, band.high])) return null;
  const value = `${latest!.value} ${m.unit ?? ""}`.trim();
  return {
    type: "queue",
    check: "missing_optimal",
    kind: "range_impact",
    question: `Your ${m.name} of ${value} is now outside the optimal band ${formatRange(band.low, band.high, m.unit)} (${band.source}). Keep this band or use the lab's range?`,
    options: ["Keep optimal band", "Use lab range"],
    subject: {
      key: m.code,
      metricCode: m.code,
      optimalLow: band.low,
      optimalHigh: band.high,
      source: band.source,
      labLow: lab?.refLow ?? null,
      labHigh: lab?.refHigh ?? null,
      detail: `${value} on ${latest!.observedAt} \u00b7 lab range ${formatRange(lab?.refLow ?? null, lab?.refHigh ?? null, m.unit)}`,
    },
  };
}

/** The person the band is for, so the model is not guessing at a generic adult. */
export interface Person {
  sex?: string;
  age?: number;
}

/** 5. Metrics with readings but no optimal band for THIS user. */
async function planMissingOptimal(
  candidates: Metric[],
  person: Person,
  labRange: (code: string) => LabRange | null,
  lastValues: (code: string) => number[],
): Promise<{ bands: OptimalBand[]; mute: string[] }> {
  const nothing = { bands: [], mute: [] };
  if (!candidates.length || !hasKey()) return nothing;
  const batch = candidates.slice(0, LLM_BATCH);

  const answer = await askJson<{ ranges?: (OptimalProposal & { code: string })[] }>(
    `You are a preventive-medicine reference. For each biomarker give the OPTIMAL range for THIS person (not the lab reference range), in the unit given.
Return, for each: low, high, the unit you used, the source, the basis and a one-sentence rationale.
"source" must be a named guideline or a named author ("Endocrine Society 2011", "Attia/Outlive", "AHA 2019"), never "general consensus".
"basis" is "science" when you cite a guideline or a meta-analysis, otherwise "opinion".
Use null for low, high AND source when there is no published optimal range for that marker. Never invent a source.
Return JSON only: {"ranges":[{"code":"...","low":<number|null>,"high":<number|null>,"unit":"<unit|null>","source":"<name|null>","basis":"science|opinion","rationale":"..."}]}`,
    `PERSON: ${person.sex ?? "sex unknown"}, ${person.age != null ? `${person.age} years old` : "age unknown"}

BIOMARKERS (code | name | unit | this person's lab reference range | their last values, oldest first):
${batch
  .map((m) => {
    const lab = labRange(m.code);
    const values = lastValues(m.code);
    return `${m.code} | ${m.name} | ${m.unit ?? ""} | ${lab ? formatRange(lab.refLow, lab.refHigh, m.unit) : "no printed range"} | ${values.length ? values.join(", ") : "none"}`;
  })
  .join("\n")}`,
  );
  if (!answer?.ranges) return nothing;

  const byCode = new Map(batch.map((m) => [m.code, m]));
  const bands: OptimalBand[] = [];
  const mute: string[] = [];

  for (const r of answer.ranges) {
    const m = byCode.get(r.code);
    if (!m) continue;
    const band = planOptimalBand(r, m, labRange(m.code));
    if (band) {
      bands.push(band);
      continue;
    }
    if (r.low != null || r.high != null)
      console.warn(
        `[curator] dropped optimal band for ${m.code}: ${r.low}-${r.high} ${r.unit ?? ""} cannot be read in ${m.unit ?? "no unit"}`,
      );
    mute.push(m.code);
  }

  return { bands, mute };
}

/**
 * Units the legacy catalog got wrong. Lp(a) is convertible between mass and
 * molar only through an apo(a) isoform count nobody prints, and every lab
 * here reports mass, so mass is the canonical unit.
 */
const CATALOG_UNITS: Record<string, string> = { lp_a: "mg/dL" };

/** Metrics the curator mints the first time it moves a reading onto one. */
const NEW_METRICS: Record<
  string,
  { name: string; category: string; unit: string | null }
> = {
  pdw_sd: {
    name: "Platelet distribution width (SD)",
    category: "hematology",
    unit: "fL",
  },
};

/** Kinds the deterministic planners own end to end, so a run can close them. */
const AUTO_CLOSED_KINDS = [
  "unit_unknown",
  "implausible",
  "foreign_reading",
  "confirm_value",
];

const blank = () => ({ checked: 0, fixed: 0, queued: 0 });

export async function runCurator(
  userId: string,
  trigger: Trigger,
  scope?: { uploadId?: string },
) {
  const db = getDb();
  const [run] = await db.insert(curatorRuns).values({ trigger }).returning();
  const stats: CuratorStats = {};
  const bump = (c: Check) => (stats[c] ??= blank());

  try {
    for (const [code, unit] of Object.entries(CATALOG_UNITS))
      await db
        .update(metricsTable)
        .set({ unit })
        .where(eq(metricsTable.code, code));

    const [allMetrics, history, existing] = await Promise.all([
      db.select().from(metricsTable),
      db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.userId, userId))
        .then((rows) =>
          rows.map(
            (r): ReadingLike => ({
              id: r.id,
              uploadId: r.uploadId,
              metricCode: r.metricCode,
              value: r.value,
              valueText: r.valueText,
              unit: r.unit,
              refLow: r.refLow,
              refHigh: r.refHigh,
              observedAt: r.observedAt,
              flags: r.flags,
            }),
          ),
        ),
      db
        .select({
          id: reviewItems.id,
          kind: reviewItems.kind,
          status: reviewItems.status,
          subject: reviewItems.subject,
        })
        .from(reviewItems)
        .where(eq(reviewItems.userId, userId)),
    ]);

    const byCode = new Map<string, MetricLike>(
      allMetrics.map((m) => [m.code, m]),
    );
    const targets = scope?.uploadId
      ? history.filter((r) => r.uploadId === scope.uploadId)
      : history;

    // Who this is, and which bands they already have. Both feed the range step.
    const [facts, overrides] = await Promise.all([
      db.select().from(profileFacts).where(eq(profileFacts.userId, userId)),
      db
        .select()
        .from(optimalOverrides)
        .where(eq(optimalOverrides.userId, userId)),
    ]);
    const profile: Record<string, unknown> = {};
    for (const f of facts) profile[f.key] = f.value;
    const sex = toSex(profile.sex);
    const age = toAge(profile.birth_year, localDay());
    const ageBand = age == null ? null : `${Math.floor(age / 10) * 10}s`;
    const had = new Map<string, [number | null, number | null]>(
      overrides.map((o) => [o.metricCode, [o.low, o.high]]),
    );

    // Asked once, never asked again, whatever the answer was.
    const asked = new Set(
      existing.map((i) => `${i.kind}:${i.subject?.key ?? ""}`),
    );

    const byId = new Map(history.map((r) => [r.id, r]));
    const actions: Action[] = [];
    /** readingId -> what the curator did to it, for the answer it closes. */
    const autoAnswer = new Map<string, string>();

    /** Collect, and let the next check see the row as it now stands. */
    const take = (planned: Action[], answer?: string) => {
      for (const a of planned) {
        if (a.type === "fix") {
          applyPatch(byId.get(a.readingId)!, a.patch);
          if (answer) autoAnswer.set(a.readingId, answer);
        }
        actions.push(a);
      }
    };

    // 1 + 2 + the measurand split.
    bump("unit_spelling").checked = targets.length;
    bump("unit_convert").checked = targets.length;
    take(planUnits(targets, byCode, history), "auto: unit resolved");

    // 3. The range was printed in another decimal scale than the value.
    bump("ref_scale").checked = targets.length;
    take(planRefScale(targets, history), "auto: reference range rescaled");

    // 4. The lab sheet itself, for the rows that look wrong or were rewritten.
    const askedAbout = new Set(
      existing
        .filter(
          (i) =>
            i.status === "open" &&
            ["implausible", "foreign_reading", "confirm_value"].includes(i.kind),
        )
        .map((i) => i.subject?.readingId ?? "")
        .filter(Boolean),
    );
    const suspect = rawVerifyScope(targets, askedAbout);
    if (suspect.length) {
      const ids = [
        ...new Set(suspect.map((r) => r.uploadId).filter((id) => id != null)),
      ];
      const sheets = await db
        .select({ id: uploadsTable.id, rawText: uploadsTable.rawText })
        .from(uploadsTable)
        .where(inArray(uploadsTable.id, ids));
      const raw = new Map(
        sheets
          .filter((u) => u.rawText)
          .map((u) => [u.id, u.rawText!] as [string, string]),
      );
      const aliases = new Map(
        allMetrics.map((m) => [m.code, m.aliases ?? []] as [string, string[]]),
      );
      bump("raw_verify").checked = suspect.length;
      take(
        planRawVerify(suspect, byCode, raw, aliases),
        "auto: checked against the lab sheet",
      );
    }

    // 5. Urine strip answers sitting on a blood metric.
    bump("urine_text").checked = targets.length;
    take(planUrineText(targets, byCode), "auto: moved to urinalysis");

    // 5. missing_range
    bump("missing_range").checked = targets.filter(
      (r) => r.refLow == null && r.refHigh == null,
    ).length;
    take(planMissingRange(targets, history));

    const withReadings = new Set(history.map((r) => r.metricCode));
    const minted = allMetrics.filter(
      (m) =>
        m.category === "other" && withReadings.has(m.code) && !m.needsReview,
    );
    const known = allMetrics.filter((m) => m.category !== "other");
    const identity = await planMetricIdentity(minted, known);
    bump("metric_identity").checked = minted.length;
    actions.push(...identity);

    /** The newest range this user actually got printed for a metric. */
    const labRange = (code: string) => {
      const last = history
        .filter(
          (r) =>
            r.metricCode === code && (r.refLow != null || r.refHigh != null),
        )
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        .pop();
      return last ? { refLow: last.refLow, refHigh: last.refHigh } : null;
    };

    /** The last five values this person actually got, oldest first. */
    const lastValues = (code: string) =>
      history
        .filter((r) => r.metricCode === code && r.value != null)
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        .slice(-5)
        .map((r) => r.value!);

    const latestOf = (code: string) => {
      const rows = history
        .filter((r) => r.metricCode === code && r.value != null)
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
      return rows[rows.length - 1] ?? null;
    };

    /** The band in force before this run: the user's own, then sex, then catalog. */
    const bandBefore = (code: string): [number | null, number | null] => {
      const m = allMetrics.find((x) => x.code === code);
      return optimalFor(code, sex, [m?.optimalLow ?? null, m?.optimalHigh ?? null], had);
    };

    /** Write one band for THIS user. The shared catalog columns stay untouched. */
    const writeBand = async (band: OptimalBand) => {
      await saveOptimalOverride(userId, band.metricCode, {
        ...band,
        rationale: band.rationale || null,
        sex: sex ?? null,
        ageBand,
      });
      bump("missing_optimal").fixed++;
    };

    // The range questions asked before this app decided ranges on its own.
    // Each becomes a band with provenance, and the question goes away.
    for (const item of existing) {
      if (item.status !== "open" || item.kind !== "optimal_range") continue;
      const code = item.subject?.metricCode;
      const m = code ? byCode.get(code) : undefined;
      if (code && m) {
        const source = item.subject.source ?? null;
        const band = planOptimalBand(
          {
            low: item.subject.optimalLow ?? null,
            high: item.subject.optimalHigh ?? null,
            source,
            basis:
              source && TRUSTED_OPTIMAL_SOURCES.includes(source)
                ? "science"
                : "opinion",
            rationale: "proposed for review before the app settled ranges itself",
          },
          m,
          labRange(code),
        );
        if (band) {
          const impact = planRangeImpact(
            band,
            m,
            latestOf(code),
            bandBefore(code),
            labRange(code),
          );
          await writeBand(band);
          had.set(code, [band.low, band.high]);
          if (impact) actions.push(impact);
        }
      }
      await db
        .update(reviewItems)
        .set({
          answer: "auto: applied with provenance",
          status: "applied",
          resolvedAt: new Date(),
        })
        .where(eq(reviewItems.id, item.id));
    }

    const noOptimal = allMetrics.filter(
      (m) =>
        withReadings.has(m.code) &&
        !had.has(m.code) &&
        !(sex && SEX_RANGES[m.code]?.[sex]) &&
        m.optimalLow == null &&
        m.optimalHigh == null &&
        !m.needsReview,
    );
    const optimal = await planMissingOptimal(
      noOptimal,
      { sex, age },
      labRange,
      lastValues,
    );
    bump("missing_optimal").checked = noOptimal.length;

    for (const metricCode of optimal.mute)
      actions.push({ type: "mute", check: "missing_optimal", metricCode });

    for (const band of optimal.bands) {
      const m = byCode.get(band.metricCode)!;
      const impact = planRangeImpact(
        band,
        m,
        latestOf(m.code),
        bandBefore(m.code),
        labRange(m.code),
      );
      await writeBand(band);
      had.set(m.code, [band.low, band.high]);
      if (impact) actions.push(impact);
    }

    // 8 + 9, on rows the checks above have already straightened out.
    bump("implausible_value").checked = targets.length;
    actions.push(...planImplausible(targets, byCode));

    bump("foreign_reading").checked = targets.length;
    actions.push(...planForeignReadings(targets, history, byCode));

    // 7. goal_check: a reading inside the target band closes the goal.
    const openGoals = await db
      .select()
      .from(goalsTable)
      .where(and(eq(goalsTable.userId, userId), isNull(goalsTable.achievedAt)));
    bump("goal_check").checked = openGoals.length;
    for (const g of openGoals) {
      const latest = history
        .filter((r) => r.metricCode === g.metricCode && r.value != null)
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        .pop();
      if (!inGoal(latest?.value, g.targetLow, g.targetHigh)) continue;
      await db
        .update(goalsTable)
        .set({ achievedAt: new Date() })
        .where(eq(goalsTable.id, g.id));
      bump("goal_check").fixed++;
    }

    // A move needs somewhere to move to.
    for (const a of actions) {
      const to = a.type === "fix" ? a.patch.metricCode : undefined;
      if (!to || byCode.has(to)) continue;
      const minted = NEW_METRICS[to] ?? {
        name: to,
        category: "urinalysis",
        unit: null,
      };
      await db.insert(metricsTable).values({ code: to, ...minted });
      byCode.set(to, { code: to, ...minted });
    }

    for (const a of actions) {
      if (a.type === "mute") {
        await db
          .update(metricsTable)
          .set({ needsReview: true })
          .where(eq(metricsTable.code, a.metricCode));
        bump(a.check).fixed++;
        continue;
      }

      if (a.type === "fix") {
        await db
          .update(readingsTable)
          .set(a.patch)
          .where(eq(readingsTable.id, a.readingId));
        bump(a.check).fixed++;
        continue;
      }

      const key = `${a.kind}:${a.subject.key}`;
      if (asked.has(key)) continue;
      asked.add(key);
      await db.insert(reviewItems).values({
        userId,
        kind: a.kind,
        subject: a.subject,
        question: a.question,
        options: a.options,
      });
      bump(a.check).queued++;
    }

    // A question the checks above answered on their own is not a question any
    // more. Only a full run may close one; an upload run only sees its own
    // rows and cannot tell whether the rest still trigger.
    if (!scope?.uploadId) {
      const triggered = new Set(
        actions
          .filter((a) => a.type === "queue")
          .map((a) => `${a.kind}:${a.subject.key}`),
      );
      for (const item of existing) {
        if (item.status !== "open") continue;
        if (!AUTO_CLOSED_KINDS.includes(item.kind)) continue;
        if (triggered.has(`${item.kind}:${item.subject?.key ?? ""}`)) continue;
        await db
          .update(reviewItems)
          .set({
            answer:
              autoAnswer.get(item.subject?.readingId ?? "") ??
              "auto: no longer flagged by the curator",
            status: "applied",
            resolvedAt: new Date(),
          })
          .where(eq(reviewItems.id, item.id));
      }
    }

    await queueProfileQuestions(userId);

    await db
      .update(curatorRuns)
      .set({ finishedAt: new Date(), stats })
      .where(eq(curatorRuns.id, run!.id));
    return stats;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[curator] run failed:", e);
    await db
      .update(curatorRuns)
      .set({ finishedAt: new Date(), stats, error })
      .where(eq(curatorRuns.id, run!.id));
    return stats;
  }
}

/** Every user that has at least one reading. */
export async function runCuratorForAllUsers(trigger: Trigger) {
  const rows = await getDb()
    .selectDistinct({ userId: readingsTable.userId })
    .from(readingsTable);
  for (const { userId } of rows) await runCurator(userId, trigger);
  return rows.length;
}

/* ------------------------------------------------------------------ *
 * Answering
 * ------------------------------------------------------------------ */

/**
 * One optimal band for one user. The shared `metrics.optimal*` columns are the
 * catalog fallback and are never written from here, so two users cannot
 * overwrite each other.
 */
export async function saveOptimalOverride(
  userId: string,
  metricCode: string,
  band: {
    low: number | null;
    high: number | null;
    unit?: string | null;
    source: string;
    basis: "science" | "opinion";
    rationale?: string | null;
    sex?: string | null;
    ageBand?: string | null;
  },
) {
  const set = {
    low: band.low,
    high: band.high,
    unit: band.unit ?? null,
    source: band.source,
    basis: band.basis,
    rationale: band.rationale ?? null,
    sex: band.sex ?? null,
    ageBand: band.ageBand ?? null,
    updatedAt: new Date(),
  };
  const [row] = await getDb()
    .insert(optimalOverrides)
    .values({ userId, metricCode, ...set })
    .onConflictDoUpdate({
      target: [optimalOverrides.userId, optimalOverrides.metricCode],
      set,
    })
    .returning();
  return row ?? null;
}

/** The answer itself was unusable (a metric code that does not exist). */
export class BadAnswerError extends Error {}

export async function applyAnswer(
  itemId: string,
  userId: string,
  answer: string,
  note?: string | null,
) {
  const db = getDb();
  const [item] = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.id, itemId), eq(reviewItems.userId, userId)));
  if (!item || item.status !== "open") return null;

  const s = item.subject;
  let status: "applied" | "dismissed" = "dismissed";

  if (item.kind === "unit_unknown" && s.readingId) {
    const [r] = await db
      .select()
      .from(readingsTable)
      .where(eq(readingsTable.id, s.readingId));
    if (r) {
      if (answer.startsWith("Treat as same")) {
        await db
          .update(readingsTable)
          .set({ unit: s.toUnit, flags: addFlags(r, "unit_assumed") })
          .where(eq(readingsTable.id, r.id));
        status = "applied";
      } else if (answer.startsWith("Multiply")) {
        const factor = Number(String(note ?? "").replace(",", "."));
        if (Number.isFinite(factor) && factor !== 0) {
          const scale = (v: number | null) =>
            v == null ? null : round(v * factor);
          await db
            .update(readingsTable)
            .set({
              value: scale(r.value),
              refLow: scale(r.refLow),
              refHigh: scale(r.refHigh),
              unit: s.toUnit,
              flags: addFlags(r, "unit_converted", {
                orig: { value: r.value, unit: r.unit },
              }),
            })
            .where(eq(readingsTable.id, r.id));
          status = "applied";
        }
      }
    }
  }

  if (item.kind === "merge_metric" && s.metricCode && s.targetCode) {
    if (answer.startsWith("Yes")) {
      await db
        .update(readingsTable)
        .set({ metricCode: s.targetCode })
        .where(eq(readingsTable.metricCode, s.metricCode));
      await db.delete(metricsTable).where(eq(metricsTable.code, s.metricCode));
      status = "applied";
    } else {
      await db
        .update(metricsTable)
        .set({ needsReview: true })
        .where(eq(metricsTable.code, s.metricCode));
    }
  }

  /**
   * The only range question left. Keeping the band needs no write; the lab's
   * own range becomes this user's band, with the lab named as the source.
   */
  if (item.kind === "range_impact" && s.metricCode) {
    if (answer.startsWith("Use lab")) {
      await saveOptimalOverride(userId, s.metricCode, {
        low: s.labLow ?? null,
        high: s.labHigh ?? null,
        source: "lab range",
        basis: "science",
        rationale: "you chose the lab's own reference range over the band",
      });
    }
    status = "applied";
  }

  /**
   * The lab sheet did not settle a value. "Note…" carries the right number.
   */
  if (item.kind === "confirm_value" && s.readingId) {
    const [r] = await db
      .select()
      .from(readingsTable)
      .where(eq(readingsTable.id, s.readingId));
    if (answer.startsWith("Discard")) {
      await db.delete(readingsTable).where(eq(readingsTable.id, s.readingId));
      status = "applied";
    } else if (answer.startsWith("Note") && r) {
      const value = Number(String(note ?? "").replace(",", "."));
      if (Number.isFinite(value)) {
        await db
          .update(readingsTable)
          .set({
            value,
            flags: addFlags(r, {
              raw_verified: {
                orig: { value: r.value, refLow: r.refLow, refHigh: r.refHigh },
                sheet: s.sheet ?? "answered by the user",
              },
            }),
          })
          .where(eq(readingsTable.id, r.id));
        status = "applied";
      }
    } else if (r) {
      await db
        .update(readingsTable)
        .set({ flags: addFlags(r, "raw_confirmed") })
        .where(eq(readingsTable.id, r.id));
      status = "applied";
    }
  }

  if (item.kind === "implausible" && s.readingId) {
    if (answer.startsWith("Delete")) {
      // The only reading delete in the curator, and only because the user
      // asked for it here.
      await db.delete(readingsTable).where(eq(readingsTable.id, s.readingId));
      status = "applied";
    } else {
      const [r] = await db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.id, s.readingId));
      if (r)
        await db
          .update(readingsTable)
          .set({ flags: addFlags(r, "value_confirmed") })
          .where(eq(readingsTable.id, r.id));
    }
  }

  if (item.kind === "foreign_reading" && s.readingId) {
    if (answer.startsWith("Delete")) {
      await db.delete(readingsTable).where(eq(readingsTable.id, s.readingId));
      status = "applied";
    } else if (answer.startsWith("Move")) {
      const code = String(note ?? "").trim();
      const [target] = await db
        .select()
        .from(metricsTable)
        .where(eq(metricsTable.code, code));
      if (!target) throw new BadAnswerError(`no metric with code "${code}"`);
      await db
        .update(readingsTable)
        .set({ metricCode: target.code })
        .where(eq(readingsTable.id, s.readingId));
      status = "applied";
    } else {
      const [r] = await db
        .select()
        .from(readingsTable)
        .where(eq(readingsTable.id, s.readingId));
      if (r)
        await db
          .update(readingsTable)
          .set({ flags: addFlags(r, "foreign_ok") })
          .where(eq(readingsTable.id, r.id));
    }
  }

  /** The plan's own questions: the answer becomes a profile fact. */
  if (item.kind === "profile_question" && s.factKey) {
    const text = s.free ? String(note ?? "") : answer;
    if (text.trim()) {
      await saveFact(userId, s.factKey, text);
      status = "applied";
    }
  }

  /** A scheduled check-in. Nothing to apply; the answer itself is the point. */
  if (item.kind === "check_in") {
    // ponytail: review_items has no note column, so a free-text check-in
    // answer is folded into the answer string.
    if (note?.trim()) answer = `${answer} — ${note.trim()}`;
    status = "applied";
  }

  const [updated] = await db
    .update(reviewItems)
    .set({ answer, status, resolvedAt: new Date() })
    .where(eq(reviewItems.id, item.id))
    .returning();
  return updated ?? null;
}

export async function openReviewCount(userId: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), eq(reviewItems.status, "open")));
  return row?.n ?? 0;
}

/* ------------------------------------------------------------------ *
 * CLI: `pnpm --filter simple curate`
 * ------------------------------------------------------------------ */
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop()!)
) {
  for (const f of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(f);
    } catch {}
  }
  runCuratorForAllUsers("manual")
    .then(async (users) => {
      const runs = await getDb()
        .select()
        .from(curatorRuns)
        .orderBy(sql`started_at desc`)
        .limit(users);
      for (const r of runs)
        console.log(r.trigger, JSON.stringify(r.stats), r.error ?? "");
      await pool().end();
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
