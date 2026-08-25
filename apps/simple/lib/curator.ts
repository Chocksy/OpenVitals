import { formatRange } from "./status";
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
import { and, eq, sql } from "drizzle-orm";
import {
  getDb,
  pool,
  curatorRuns,
  metrics as metricsTable,
  readings as readingsTable,
  reviewItems,
  type CuratorStats,
  type Metric,
  type ReadingFlag,
  type ReviewSubject,
} from "@/db";
import { model, stripCodeFences } from "./extract";
import { conversionFactor, normalizeUnit, round } from "./units";

export type Trigger = "upload" | "daily" | "manual";

export type Check =
  | "unit_spelling"
  | "unit_convert"
  | "metric_identity"
  | "missing_range"
  | "missing_optimal"
  | "implausible_value";

/** The subset of a reading the planners need. */
export interface ReadingLike {
  id: string;
  uploadId: string | null;
  metricCode: string;
  value: number | null;
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
const brackets = (
  lo: number | null,
  hi: number | null,
  v: number,
): boolean =>
  (lo != null || hi != null) &&
  (lo == null || v >= lo) &&
  (hi == null || v <= hi);

const addFlags = (
  reading: ReadingLike,
  ...extra: ReadingFlag[]
): ReadingFlag[] => [...(reading.flags ?? []), ...extra];

/* ------------------------------------------------------------------ *
 * 1 + 2. unit_spelling and unit_convert
 * ------------------------------------------------------------------ */

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

/** 50x above the top of the range, or 50x below the bottom. */
export function planImplausible(
  targets: ReadingLike[],
  byCode: Map<string, MetricLike>,
): Action[] {
  const actions: Action[] = [];

  for (const r of targets) {
    if (r.value == null) continue;
    const tooHigh =
      r.refHigh != null && r.refHigh > 0 && r.value > r.refHigh * 50;
    const tooLow = r.refLow != null && r.refLow > 0 && r.value < r.refLow / 50;
    if (!tooHigh && !tooLow) continue;

    const m = byCode.get(r.metricCode);
    actions.push({
      type: "queue",
      check: "implausible_value",
      kind: "implausible",
      question: `"${m?.name ?? r.metricCode}" reads ${r.value} ${r.unit ?? ""} on ${r.observedAt}, far outside its range of ${formatRange(r.refLow, r.refHigh)}. Is that right?`,
      options: ["It's correct", "Delete this reading"],
      subject: {
        key: `${r.id}`,
        readingId: r.id,
        metricCode: r.metricCode,
        detail: `${r.value} ${r.unit ?? ""} vs ${formatRange(r.refLow, r.refHigh)}`,
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

/** 5. Metrics with readings but no optimal range. */
async function planMissingOptimal(candidates: Metric[]): Promise<Action[]> {
  if (!candidates.length || !hasKey()) return [];
  const batch = candidates.slice(0, LLM_BATCH);

  const answer = await askJson<{
    ranges?: {
      code: string;
      low: number | null;
      high: number | null;
      source: string | null;
    }[];
  }>(
    `You are a preventive-medicine reference. For each biomarker give the OPTIMAL range (not the lab reference range) for a healthy adult, in the unit given, plus the source it comes from (for example "Attia/Outlive", "Function Health", "AHA", "Endocrine Society").
Use null for low, high AND source when there is no published consensus on an optimal range for that marker. Never invent a source.
Return JSON only: {"ranges":[{"code":"...","low":<number|null>,"high":<number|null>,"source":"<name|null>"}]}`,
    `BIOMARKERS (code | name | unit):
${batch.map((m) => `${m.code} | ${m.name} | ${m.unit ?? ""}`).join("\n")}`,
  );
  if (!answer?.ranges) return [];

  const byCode = new Map(batch.map((m) => [m.code, m]));
  const actions: Action[] = [];

  for (const r of answer.ranges) {
    const m = byCode.get(r.code);
    if (!m) continue;

    // No consensus: stop asking about this one.
    if (r.low == null && r.high == null) {
      actions.push({ type: "mute", check: "missing_optimal", metricCode: m.code });
      continue;
    }

    actions.push({
      type: "queue",
      check: "missing_optimal",
      kind: "optimal_range",
      question: `Set the optimal range for "${m.name}" to ${formatRange(r.low, r.high, m.unit)}${r.source ? ` (source: ${r.source})` : ""}?`,
      options: ["Accept", "Reject"],
      subject: {
        key: m.code,
        metricCode: m.code,
        optimalLow: r.low,
        optimalHigh: r.high,
        source: r.source,
        detail: `${formatRange(r.low, r.high, m.unit)}`,
      },
    });
  }

  return actions;
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

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
          kind: reviewItems.kind,
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

    // Asked once, never asked again, whatever the answer was.
    const asked = new Set(
      existing.map((i) => `${i.kind}:${i.subject?.key ?? ""}`),
    );

    const byId = new Map(history.map((r) => [r.id, r]));
    const actions: Action[] = [];

    const unitActions = planUnits(targets, byCode, history);
    bump("unit_spelling").checked = targets.length;
    bump("unit_convert").checked = targets.length;
    for (const a of unitActions) {
      if (a.type === "fix") applyPatch(byId.get(a.readingId)!, a.patch);
      actions.push(a);
    }

    const rangeActions = planMissingRange(targets, history);
    bump("missing_range").checked = targets.filter(
      (r) => r.refLow == null && r.refHigh == null,
    ).length;
    for (const a of rangeActions) {
      if (a.type === "fix") applyPatch(byId.get(a.readingId)!, a.patch);
      actions.push(a);
    }

    const implausible = planImplausible(targets, byCode);
    bump("implausible_value").checked = targets.length;
    actions.push(...implausible);

    const withReadings = new Set(history.map((r) => r.metricCode));
    const minted = allMetrics.filter(
      (m) =>
        m.category === "other" && withReadings.has(m.code) && !m.needsReview,
    );
    const known = allMetrics.filter((m) => m.category !== "other");
    const identity = await planMetricIdentity(minted, known);
    bump("metric_identity").checked = minted.length;
    actions.push(...identity);

    const noOptimal = allMetrics.filter(
      (m) =>
        withReadings.has(m.code) &&
        m.optimalLow == null &&
        m.optimalHigh == null &&
        !m.needsReview,
    );
    const optimal = await planMissingOptimal(noOptimal);
    bump("missing_optimal").checked = noOptimal.length;
    actions.push(...optimal);

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

  if (item.kind === "optimal_range" && s.metricCode) {
    if (answer.startsWith("Accept")) {
      await db
        .update(metricsTable)
        .set({
          optimalLow: s.optimalLow ?? null,
          optimalHigh: s.optimalHigh ?? null,
          optimalSource: s.source ?? null,
        })
        .where(eq(metricsTable.code, s.metricCode));
      status = "applied";
    } else {
      await db
        .update(metricsTable)
        .set({ needsReview: true })
        .where(eq(metricsTable.code, s.metricCode));
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
      for (const r of runs) console.log(r.trigger, JSON.stringify(r.stats), r.error ?? "");
      await pool().end();
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
