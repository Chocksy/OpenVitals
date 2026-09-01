/**
 * The curator's second pass: settle it before asking.
 *
 * `lib/raw-verify.ts` checks every suspect reading against the lab's own text
 * and queues a `confirm_value` question when it cannot find the value. Most of
 * those misses are not wrong numbers, they are reading problems: a decimal
 * comma, a thousands dot, a unit token no conversion table knows
 * (`mil./µL`), a censored result (`< 0,50 mg/L`), an analyte printed under a
 * Romanian name the first pass never learned, or a value printed two lines
 * below its own heading.
 *
 * So, in order, and never the other way round:
 *
 *  1. a deterministic re-match (pure, tested): normalise both sides and look
 *     for the stored number within ±3 lines of any name this metric goes by.
 *     A hit settles the row and the line is the evidence.
 *  2. one model call over the ±10-line text window with a closed schema. An
 *     answer that agrees settles it; a different value auto-applies only when
 *     the gap is a decimal shift AND the corrected value lands inside the
 *     metric's `BOUNDS`; "not on the sheet" twice marks the reading
 *     `unverified` and the engine stops reading it.
 *  3. what is left is a genuine tie, and only that reaches the person.
 *
 * The pure half takes a question and a page of text and returns an outcome, so
 * everything except the model call is testable without a database.
 */
import { pathToFileURL } from "node:url";
import { generateObject } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  getDb,
  pool,
  metrics as metricsTable,
  readings as readingsTable,
  reviewItems,
  uploads as uploadsTable,
  type ReadingFlag,
} from "@/db";
import { users } from "@/db/auth-schema";
import { model } from "./extract";
import {
  agrees,
  aliasesFor,
  lineHasAlias,
  parseSheetNumber,
  stripDates,
  stripProse,
  thousandsStyle,
  unitBetween,
} from "./raw-verify";
import { conversionFactor, round } from "./units";
import { BOUNDS } from "./vectors";

/* ------------------------------------------------------------------ *
 * 1. the deterministic re-match
 * ------------------------------------------------------------------ */

/** How far from the analyte's name its own result can be printed. */
export const WINDOW = 3;

/** How much text the model is shown around the name. */
export const MODEL_WINDOW = 10;

/**
 * Names the first pass does not carry. Kept here rather than in
 * `ROMANIAN_ALIASES` on purpose: `planRawVerify` may REWRITE a value from a
 * line it matched, so its aliases have to be exact. Nothing here can rewrite
 * anything — a match only ever confirms a number that is already stored — so
 * a loose name like "Colesterol" is safe in this list and dangerous in that
 * one.
 */
export const SECOND_PASS_ALIASES: Record<string, string[]> = {
  atypical_lymphocytes_abs: ["Limfocite atipice"],
  atypical_lymphocytes_pct: ["Limfocite atipice"],
  direct_bilirubin: ["Bilirubina directa", "Bilirubina conjugata"],
  indirect_bilirubin: ["Bilirubina indirecta", "Bilirubina neconjugata"],
  total_cholesterol: [
    "Colesterol seric total",
    "Colesterol total",
    "Colesterol",
  ],
  hdl_cholesterol: ["HDL colesterol", "Colesterol HDL"],
  ldl_cholesterol: ["LDL colesterol", "Colesterol LDL"],
  total_t3: ["TT3", "Triiodotironina"],
  total_t4: ["TT4", "Tiroxina"],
  free_t3: ["FT3"],
  free_t4: ["FT4"],
  apolipoprotein_a1: ["Apolipoproteina A1"],
  apolipoprotein_b: ["Apolipoproteina B"],
  rbc: ["Numar eritrocite", "Numar total de eritrocite"],
  wbc: ["Numar leucocite", "Numar total de leucocite"],
};

/** Every name to look for: the catalog's, the first pass's, and this list's. */
export function namesFor(
  metric: { code: string; name: string; unit: string | null },
  catalog: string[] = [],
): string[] {
  return aliasesFor(metric, [
    ...catalog,
    ...(SECOND_PASS_ALIASES[metric.code] ?? []),
  ]);
}

/**
 * The page as lines a matcher can read: tabs and non-breaking spaces collapsed
 * to one space, and a word broken across a line break (`Trigliceri-` /
 * `de 120`) put back together.
 */
export function pageLines(rawText: string): string[] {
  const out: string[] = [];
  for (const raw of rawText.replace(/ /g, " ").split(/\r?\n/)) {
    const line = raw.replace(/[\t ]+/g, " ").trim();
    const prev = out[out.length - 1];
    if (prev != null && /\p{L}-$/u.test(prev))
      out[out.length - 1] = prev.slice(0, -1) + line;
    else out.push(line);
  }
  return out;
}

const NUMBER = /\d[\d.,]*/g;

/**
 * Every number printed on one line, with the unit token that follows it.
 *
 * Unlike `parseSheetLine`, which picks the one number most likely to be THE
 * result, this keeps all of them: the second pass is not deciding what the row
 * is, it is asking whether the number already stored is printed anywhere near
 * the analyte's name. A censored result (`< 0,50 mg/L`) is a number here,
 * which is exactly the case the first pass reads as a bare reference bound.
 */
export function candidatesOn(
  line: string,
): { value: number; unit: string | null }[] {
  const s = stripDates(stripProse(line));
  const thousands = thousandsStyle(s);
  NUMBER.lastIndex = 0;
  const hits = [...s.matchAll(NUMBER)];
  return hits.flatMap((m, i) => {
    const value = parseSheetNumber(m[0]!, thousands);
    if (value == null) return [];
    const unit = unitBetween(
      s,
      m.index! + m[0]!.length,
      hits[i + 1]?.index ?? s.length,
    );
    return [{ value, unit }];
  });
}

export interface SheetQuestion {
  readingId: string;
  metricCode: string;
  metricName: string;
  /** every name this analyte can be printed under */
  aliases: string[];
  stored: number | null;
  unit: string | null;
  observedAt: string;
  /** `uploads.raw_text` of the sheet the reading came off */
  rawText: string;
}

export interface SheetHit {
  /** the printed line, quoted back to the person */
  line: string;
  /** the number as printed */
  value: number;
  unit: string | null;
}

/**
 * The stored value, found on the sheet within `span` lines of the analyte's
 * name, or null.
 *
 * A candidate counts when the sheet's unit converts into the reading's and the
 * converted number agrees, or when the unit is one no table knows and the bare
 * number agrees exactly — `5.82 mil./µL` is the same result as `5.82 M/uL`
 * however the lab spelled it. The best hit wins: the reading's own unit beats a
 * converted one and a converted one beats an unknown one, the analyte's own
 * line beats a neighbour, and an exact number beats one inside the 2 %
 * tolerance. That order is what picks the `0,64 mg/L` row over the
 * `0,064 mg/dL` row printed two lines above it.
 */
export function rematch(q: SheetQuestion, span = WINDOW): SheetHit | null {
  if (q.stored == null) return null;
  const lines = pageLines(q.rawText);
  let best: (SheetHit & { score: number }) | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (!lineHasAlias(lines[i]!, q.aliases)) continue;
    const from = Math.max(0, i - span);
    const to = Math.min(lines.length - 1, i + span);
    for (let j = from; j <= to; j++) {
      for (const c of candidatesOn(lines[j]!)) {
        const factor = c.unit
          ? conversionFactor(c.unit, q.unit, q.metricCode)
          : 1;
        const value = factor == null ? c.value : round(c.value * factor);
        if (!agrees(value, q.stored)) continue;
        const score =
          (c.unit && factor === 1 ? 3 : factor == null ? 0 : 2) +
          (j === i ? 1 : 0) +
          (value === q.stored ? 1 : 0);
        if (!best || score > best.score)
          best = { line: lines[j]!, value: c.value, unit: c.unit, score };
      }
    }
  }

  return best && { line: best.line, value: best.value, unit: best.unit };
}

/** The stretch of sheet the model is shown: ±`span` lines around every name. */
export function windowText(
  rawText: string,
  aliases: string[],
  span = MODEL_WINDOW,
): string {
  const lines = pageLines(rawText);
  const keep = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (!lineHasAlias(lines[i]!, aliases)) continue;
    for (
      let j = Math.max(0, i - span);
      j <= Math.min(lines.length - 1, i + span);
      j++
    )
      keep.add(j);
  }
  // No name matched at all: show the head of the sheet rather than nothing, so
  // the model can still answer "this analyte is not on this page".
  if (!keep.size)
    for (let j = 0; j < Math.min(lines.length, span * 4); j++) keep.add(j);
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => lines[i]!)
    .filter((l) => l.length)
    .join("\n");
}

/* ------------------------------------------------------------------ *
 * 2. the model re-read
 * ------------------------------------------------------------------ */

export const sheetAnswerSchema = z.object({
  found: z
    .boolean()
    .describe(
      "true only when this analyte's own result is printed in the text",
    ),
  value: z
    .number()
    .nullable()
    .describe(
      "the number as printed, with a decimal point; null when not found",
    ),
  unit: z
    .string()
    .nullable()
    .describe("the unit printed next to that number, copied as written"),
  line: z
    .string()
    .describe(
      "the whole line the result is printed on, copied from the text character for character; empty string when not found",
    ),
});

export type SheetAnswer = z.infer<typeof sheetAnswerSchema>;

export const sheetPrompt = `You are checking one stored laboratory result against the sheet it was extracted from.

RULES:
1. Answer only from the text you are given. Never calculate a value, never read one off a reference range, never take another analyte's number.
2. Set \`found\` to true only when the text prints THIS analyte's own result. A reference range, a previous result printed in an "ANTECEDENT" column, and another analyte's number are not results.
3. \`line\` is copied from the text verbatim, character for character, in the original language. Leave it empty when \`found\` is false.
4. \`value\` is the number exactly as printed, written with a decimal point, and \`unit\` is the unit printed beside it. Never convert.
5. Romanian sheets write decimals with a comma and group thousands with a dot: "1,26" is 1.26, "5.230.000" is 5230000, and "< 0,50" is a result of 0.50 that the assay could not resolve any lower.
6. The result is often printed on the line BELOW the analyte's name.`;

/** The one model call. Everything else in this file is pure. */
export async function askSheet(q: SheetQuestion): Promise<SheetAnswer> {
  const { object } = await generateObject({
    model: model(),
    schema: sheetAnswerSchema,
    system: sheetPrompt,
    prompt: [
      `Analyte: ${q.metricName}`,
      `Also printed as: ${q.aliases.join(", ")}`,
      `Stored result: ${q.stored ?? "?"} ${q.unit ?? ""} on ${q.observedAt}`,
      "",
      "SHEET:",
      windowText(q.rawText, q.aliases),
    ].join("\n"),
  });
  return object;
}

/* ------------------------------------------------------------------ *
 * 3. the outcome
 * ------------------------------------------------------------------ */

/** The decimal shifts an OCR or a unit mix-up actually produces. */
export const ARTEFACT_FACTORS = [10, 100, 1000];

/**
 * The corrected value, when the gap between what is stored and what the sheet
 * prints is an obvious decimal shift AND the sheet's number is something a
 * living person can have. No `BOUNDS` entry means no automatic correction:
 * without a band to check against, a x10 is a guess, and a guess goes to the
 * person.
 */
export function artefactCorrection(
  stored: number,
  sheet: number,
  metricCode: string,
): number | null {
  const bounds = BOUNDS[metricCode];
  if (!bounds || stored === 0 || sheet === 0) return null;
  const [low, high] = bounds;
  if (sheet < low || sheet > high) return null;
  const shifted = ARTEFACT_FACTORS.some(
    (f) => agrees(stored, round(sheet * f)) || agrees(round(stored * f), sheet),
  );
  return shifted ? sheet : null;
}

export type Settled =
  /** the sheet says the same thing, found by the matcher */
  | "rematch"
  /** the sheet says the same thing, found by the model */
  | "model"
  /** the sheet says something else, and the difference is an artefact */
  | "corrected"
  /** the sheet does not print it, twice: hidden from the engine */
  | "unverified"
  /** a genuine tie, and the only thing the person is asked */
  | "person";

export interface SecondPassOutcome {
  readingId: string;
  itemId?: string;
  metricCode: string;
  outcome: Settled;
  /** the sheet line the outcome rests on */
  line: string | null;
  /** what the sheet says, in the reading's own unit, when it differs */
  sheetValue?: number | null;
  /** what was written back, when the outcome is `corrected` */
  value?: number;
  /** one sentence, and the answer the closed question carries */
  note: string;
}

const quote = (line: string | null) => (line ? ` — “${line.trim()}”` : "");

/**
 * What the model's answer means. `strikes` is how many earlier runs already
 * failed to find this reading on its sheet: the second "not found" is the one
 * that marks the reading unverified, because one model call saying no is not
 * enough to hide a number the person's lab printed.
 */
export function judge(
  q: SheetQuestion,
  answer: SheetAnswer,
  strikes = 0,
): SecondPassOutcome {
  const base = { readingId: q.readingId, metricCode: q.metricCode };

  if (!answer.found || answer.value == null)
    return strikes >= 1
      ? {
          ...base,
          outcome: "unverified",
          line: null,
          note: "not on the sheet in two runs, hidden from the engine",
        }
      : {
          ...base,
          outcome: "person",
          line: null,
          note: "not on the sheet this run; one more run decides",
        };

  const factor = answer.unit
    ? conversionFactor(answer.unit, q.unit, q.metricCode)
    : 1;
  const sheet = factor == null ? answer.value : round(answer.value * factor);
  const line = answer.line?.trim() || null;

  if (agrees(sheet, q.stored))
    return {
      ...base,
      outcome: "model",
      line,
      note: `${answer.value}${answer.unit ? ` ${answer.unit}` : ""}${quote(line)}`,
    };

  const corrected =
    q.stored != null && factor != null
      ? artefactCorrection(q.stored, sheet, q.metricCode)
      : null;

  if (corrected != null)
    return {
      ...base,
      outcome: "corrected",
      line,
      sheetValue: sheet,
      value: corrected,
      note: `${q.stored} → ${corrected} ${q.unit ?? ""}`.trim() + quote(line),
    };

  return {
    ...base,
    outcome: "person",
    line,
    sheetValue: sheet,
    note: `the sheet says ${sheet}, we stored ${q.stored}${quote(line)}`,
  };
}

/* ------------------------------------------------------------------ *
 * The run: open questions in, settled rows out.
 * ------------------------------------------------------------------ */

export interface SecondPassRow extends SheetQuestion {
  itemId: string;
  /** earlier runs that could not find this reading on its sheet */
  strikes: number;
}

const hasFlag = (flags: ReadingFlag[] | null, tag: string) =>
  (flags ?? []).some(
    (f) => f === tag || (typeof f === "object" && f !== null && tag in f),
  );

/** Every open `confirm_value` question, with its reading and its sheet. */
export async function openConfirmValue(
  userId: string,
  uploadId?: string,
): Promise<SecondPassRow[]> {
  const db = getDb();
  const items = await db
    .select()
    .from(reviewItems)
    .where(
      and(
        eq(reviewItems.userId, userId),
        eq(reviewItems.kind, "confirm_value"),
        eq(reviewItems.status, "open"),
      ),
    );
  const ids = [
    ...new Set(items.map((i) => i.subject?.readingId).filter((id) => !!id)),
  ] as string[];
  if (!ids.length) return [];

  const rows = await db
    .select()
    .from(readingsTable)
    .where(inArray(readingsTable.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const uploadIds = [
    ...new Set(rows.map((r) => r.uploadId).filter((id) => !!id)),
  ] as string[];
  const sheets = uploadIds.length
    ? await db
        .select({ id: uploadsTable.id, rawText: uploadsTable.rawText })
        .from(uploadsTable)
        .where(inArray(uploadsTable.id, uploadIds))
    : [];
  const raw = new Map(sheets.map((u) => [u.id, u.rawText ?? ""]));
  const metrics = await db.select().from(metricsTable);
  const byCode = new Map(metrics.map((m) => [m.code, m]));

  const out: SecondPassRow[] = [];
  for (const item of items) {
    const r = byId.get(item.subject?.readingId ?? "");
    if (!r) continue;
    if (uploadId && r.uploadId !== uploadId) continue;
    const m = byCode.get(r.metricCode);
    const text = r.uploadId ? raw.get(r.uploadId) : null;
    if (!m || !text) continue;
    out.push({
      itemId: item.id,
      readingId: r.id,
      metricCode: r.metricCode,
      metricName: m.name,
      aliases: namesFor(m, m.aliases ?? []),
      stored: r.value,
      unit: r.unit ?? m.unit,
      observedAt: r.observedAt,
      rawText: text,
      strikes: hasFlag(r.flags, "sheet_missing") ? 1 : 0,
    });
  }
  return out;
}

/** The model runs in the curator and in the eval, never in a unit test. */
const modelAvailable = () =>
  !!process.env.OPENROUTER_API_KEY && !process.env.VITEST;

/**
 * One second pass for one user. Deterministic first, model second, person
 * last. Settled rows close their own question; a genuine tie stays open and
 * gets the sheet's line and the sheet's number written into its payload, so
 * the page can print "the sheet says X, we stored Y".
 */
export async function runSecondPass(
  userId: string,
  opts: { uploadId?: string; useModel?: boolean } = {},
): Promise<SecondPassOutcome[]> {
  const db = getDb();
  const rows = await openConfirmValue(userId, opts.uploadId);
  const useModel = opts.useModel ?? modelAvailable();
  const out: SecondPassOutcome[] = [];

  for (const q of rows) {
    const hit = rematch(q);
    let outcome: SecondPassOutcome;

    if (hit) {
      outcome = {
        readingId: q.readingId,
        metricCode: q.metricCode,
        outcome: "rematch",
        line: hit.line,
        note: `${hit.value}${hit.unit ? ` ${hit.unit}` : ""}${quote(hit.line)}`,
      };
    } else if (useModel) {
      try {
        outcome = judge(q, await askSheet(q), q.strikes);
      } catch (e) {
        console.error("[second-pass] model call failed:", e);
        continue;
      }
    } else {
      continue;
    }

    outcome.itemId = q.itemId;
    out.push(outcome);
    await apply(userId, q, outcome);
  }

  return out;
}

/** The one write path. Nothing here deletes a reading. */
async function apply(
  userId: string,
  q: SecondPassRow,
  o: SecondPassOutcome,
): Promise<void> {
  const db = getDb();
  const [r] = await db
    .select()
    .from(readingsTable)
    .where(eq(readingsTable.id, q.readingId));
  if (!r) return;
  const flags = (r.flags ?? []) as ReadingFlag[];

  const close = async (answer: string) => {
    await db
      .update(reviewItems)
      .set({ answer, status: "applied", resolvedAt: new Date() })
      .where(eq(reviewItems.id, q.itemId));
  };

  if (o.outcome === "rematch" || o.outcome === "model") {
    await db
      .update(readingsTable)
      .set({ flags: [...flags, "raw_confirmed"] })
      .where(eq(readingsTable.id, r.id));
    await close(
      `second pass: settled by the ${o.outcome === "rematch" ? "sheet" : "model"} — ${o.note}`,
    );
    return;
  }

  if (o.outcome === "corrected") {
    await db
      .update(readingsTable)
      .set({
        value: o.value!,
        flags: [
          ...flags,
          {
            raw_verified: {
              orig: { value: r.value, refLow: r.refLow, refHigh: r.refHigh },
              sheet: o.line ?? "read again by the second pass",
            },
          },
        ],
      })
      .where(eq(readingsTable.id, r.id));
    await close(`second pass: corrected ${o.note}`);
    return;
  }

  if (o.outcome === "unverified") {
    await db
      .update(readingsTable)
      .set({ flags: [...flags, "unverified"] })
      .where(eq(readingsTable.id, r.id));
    await close("second pass: not on the sheet twice, hidden from the engine");
    return;
  }

  // A tie, or a first "not found". The question stays open, and carries what
  // the second pass learned so the page can quote the sheet.
  if (o.line == null && !hasFlag(flags, "sheet_missing"))
    await db
      .update(readingsTable)
      .set({ flags: [...flags, "sheet_missing"] })
      .where(eq(readingsTable.id, r.id));

  const [item] = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.id, q.itemId), eq(reviewItems.userId, userId)));
  if (!item) return;

  const unit = q.unit ?? "";
  const question =
    o.sheetValue != null
      ? `The sheet says ${o.sheetValue} ${unit}, we stored ${q.stored} ${unit} for ${q.metricName} on ${q.observedAt} — which is right?`
      : item.question;
  const options =
    o.sheetValue != null
      ? ["Use the sheet value", "Keep", "Discard reading", "Note…"]
      : item.options;

  await db
    .update(reviewItems)
    .set({
      question,
      options,
      subject: {
        ...item.subject,
        settledBy: o.sheetValue != null ? "model" : "nobody",
        evidenceLine: o.line,
        sheetValue: o.sheetValue ?? null,
        sheet: o.line ?? item.subject.sheet ?? null,
        detail: `${q.stored ?? "?"} ${unit} · sheet: ${o.line ?? "not found"}`,
      },
    })
    .where(eq(reviewItems.id, item.id));
}

/* ------------------------------------------------------------------ *
 * CLI: `pnpm --filter simple exec tsx --env-file=.env lib/second-pass.ts <email>`
 * ------------------------------------------------------------------ */
// The eval is called `evals/second-pass.ts`, so "does the file name match"
// is not enough here: the whole path has to be this file.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const email = process.argv[2];
  const db = getDb();
  const people = await db.select().from(users);
  const person = email
    ? people.find((u) => u.email === email)
    : people.find((u) => u.email === process.env.ADMIN_EMAIL);
  if (!person) {
    console.error(`no user for ${email ?? process.env.ADMIN_EMAIL}`);
    process.exit(1);
  }
  const outcomes = await runSecondPass(person.id);
  for (const o of outcomes)
    console.log(`${o.outcome.padEnd(10)} ${o.metricCode.padEnd(26)} ${o.note}`);
  const by = new Map<string, number>();
  for (const o of outcomes) by.set(o.outcome, (by.get(o.outcome) ?? 0) + 1);
  console.log(
    `\n${outcomes.length} rows: ` +
      [...by].map(([k, n]) => `${k} ${n}`).join(", "),
  );
  await pool().end();
  process.exit(0);
}
