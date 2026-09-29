import {
  defaultSettingsMiddleware,
  generateObject,
  generateText,
  tool,
  wrapLanguageModel,
  type ModelMessage,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { z } from "zod";
import { extractTextFromPdf } from "./pdf";

const OCR_MODEL = process.env.AI_OCR_MODEL ?? "google/gemini-2.5-flash";
/** Lab text into readings: Gemini by the owner's choice (tested 2026-09-28). */
const EXTRACT_MODEL = process.env.AI_EXTRACT_MODEL ?? "google/gemini-3.7-flash";
const MIN_TEXT_LENGTH = 50; // Below this, assume scanned/image PDF

/** Every non-OCR call when nothing names a model. Provisional (41F-M). */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

export function model(id = process.env.AI_DEFAULT_MODEL ?? DEFAULT_MODEL) {
  // ponytail: OpenRouter only. The old worker's AI-gateway fallback is dropped.
  // Without a cap the provider asks for Gemini's full 65 536 output tokens and
  // OpenRouter refuses when the key's monthly headroom is below that (402 on
  // 2026-09-03). Lab extraction is the one call that writes more, and it
  // raises its own cap (`EXTRACT_MAX_TOKENS`).
  return wrapLanguageModel({
    model: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(id),
    middleware: defaultSettingsMiddleware({
      settings: {
        maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 8192),
      },
    }),
  });
}

type ObjectArgs<S extends z.ZodType> = {
  /** an OpenRouter id; `AI_DEFAULT_MODEL` when missing */
  model?: string;
  schema: S;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  providerOptions?: Parameters<typeof generateText>[0]["providerOptions"];
} & (
  | { prompt: string; messages?: never }
  | { messages: ModelMessage[]; prompt?: never }
);

export interface ObjectResult<T> {
  object: T;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  providerMetadata?: Record<string, unknown>;
}

/**
 * The providers whose structured output cannot take this app's schemas.
 * Anthropic refuses a large `generateObject` schema ("Schema is too complex")
 * and a forced tool choice. OpenAI (served by Azure) and Meta run strict mode
 * and refuse any schema with an optional field ("'required' is required ...
 * Missing 'clockTime'", eval:photos 2026-09-28). All three answer a
 * non-strict tool call.
 */
const TOOL_PATH = /^(anthropic|openai|meta)\//;

/**
 * The one structured call. On a `TOOL_PATH` model the answer comes back
 * through a `submit` tool with `toolChoice: "auto"` and zod checks it here;
 * a reply without a valid call is asked once more, unless it was cut off.
 * Every other model keeps `generateObject`.
 */
export async function generateObjectSafe<S extends z.ZodType>(
  args: ObjectArgs<S>,
): Promise<ObjectResult<z.infer<S>>> {
  const { model: id, schema, ...rest } = args;
  const modelId = id ?? process.env.AI_DEFAULT_MODEL ?? DEFAULT_MODEL;
  if (!TOOL_PATH.test(modelId))
    return generateObject({
      model: model(modelId),
      schema,
      ...rest,
    } as Parameters<typeof generateObject>[0]) as never;

  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let cost = 0;
  let why = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateText({
      model: model(modelId),
      ...rest,
      system:
        `${rest.system ?? ""}\n\nAnswer only by calling the submit tool, once.`.trim(),
      tools: {
        submit: tool({ description: "Submit the answer.", inputSchema: schema }),
      },
      toolChoice: "auto",
    } as Parameters<typeof generateText>[0]);
    usage.inputTokens += res.usage?.inputTokens ?? 0;
    usage.outputTokens += res.usage?.outputTokens ?? 0;
    usage.totalTokens += res.usage?.totalTokens ?? 0;
    const or = res.providerMetadata?.openrouter as
      | { usage?: { cost?: number } }
      | undefined;
    cost += or?.usage?.cost ?? 0;
    const submit = res.toolCalls?.find((c) => c.toolName === "submit");
    const parsed = submit ? schema.safeParse(submit.input) : null;
    if (parsed?.success)
      return {
        object: parsed.data,
        usage,
        // both attempts' cost, where the caller's `costOf` looks for it
        providerMetadata: {
          ...res.providerMetadata,
          openrouter: { ...or, usage: { ...or?.usage, cost } },
        },
      };
    why = `${
      parsed
        ? `an invalid submit (${parsed.error.message.slice(0, 300)})`
        : "no submit call"
    }, finish ${res.finishReason}, ${res.usage?.outputTokens ?? "?"} tokens out`;
    // a cut-off answer comes back cut off again; raise the call's cap instead
    if (res.finishReason === "length") break;
  }
  throw new Error(`${modelId} answered with ${why}`);
}

/**
 * Copied from packages/ai/src/prompts/extract-labs.ts, then amended in phase
 * 41: rule 8 used to throw the ANTECEDENT column away, and rules 9 to 11 are
 * new (pending lines, report number, "this is not a lab sheet").
 */
export const extractLabsPrompt = `You are a medical lab report parser. Extract ALL test results from the given lab report text as structured JSON.

CRITICAL RULES:
1. Extract EVERY SINGLE test result — do NOT skip any. Count them. If the document has 40 results, output 40 results.
2. Output analyte names in STANDARD ENGLISH regardless of document language.
3. For non-English documents: translate the analyte name. Examples:
   - "Glucoză" → "Glucose", "Insulină" → "Insulin", "Trigliceride" → "Triglycerides"
   - "Colesterol total" → "Total Cholesterol", "HDL colesterol" → "HDL Cholesterol"
   - "TSH (hormon hipofizar...)" → "TSH", "FT4 (tiroxina liberă)" → "Free T4"
   - "Hematii" → "RBC", "Leucocite" → "WBC", "Trombocite" → "Platelets"
   - "Fier seric" → "Iron", "Zinc seric" → "Zinc", "Cortizol seric" → "Cortisol"
   - "Proteina C reactivă" → "CRP", "Homocisteină" → "Homocysteine"
   - "Hemoglobină glicozilată / HbA1c" → "HbA1c"
   - "Ac. anti tireoperoxidază (TPO)" → "TPO Antibodies"
4. Include CBC components: Hemoglobin, Hematocrit, RBC, WBC, Platelets, MCV, MCH, MCHC, RDW, and ALL differential counts (Neutrophils, Lymphocytes, Monocytes, Eosinophils, Basophils — both absolute and percentage).
5. Include hormones: TSH, Free T4, Free T3, Total T3, Total T4, Insulin, Cortisol, Testosterone, DHEA-S, Estradiol, etc.
6. Include vitamins/minerals: Vitamin D, Vitamin B12, Iron, Ferritin, Zinc, Magnesium, Calcium, Folate, etc.
7. When duplicate units exist for the same analyte (e.g., mg/dL AND mmol/L), extract ONLY the first/primary unit row.
8. For observedAt: use the RECOLTAT/collection date from the header. When the sheet prints a previous result for the same test with its date (an ANTECEDENT / previous value column, often with the date on the test's title line or the section's title line), also set \`antecedent\` on that result: { "value": number, "unit": same unit as the result, "date": "YYYY-MM-DD" }. Otherwise leave \`antecedent\` null. Never output an antecedent as its own result.
9. A test the sheet lists as not yet done ("Analize în curs de execuție", "in progress", "pending", "to follow") has no result: put its standard English name in the top-level \`pending\` array and leave it out of \`results\`.
10. \`reportNo\`: the lab's report / bulletin number as printed (e.g. "Buletin de analize 26818E0252" → "26818E0252"), or null.
11. If the document is not a lab results sheet at all (a letter, an imaging report, a prescription), set \`notLabReport\` to true and return an empty results array.

For each result extract:
- analyte: Standard English name
- value: Numeric value (null if non-numeric)
- valueText: Value as written
- unit: Unit of measurement
- referenceRangeLow: Lower bound (numeric, null if not applicable)
- referenceRangeHigh: Upper bound (numeric, null if not applicable)
- referenceRangeText: Range as written
- isAbnormal: true if outside range
- observedAt: Collection date (ISO YYYY-MM-DD)
- antecedent: { value, unit, date } or null (rule 8)

Output JSON:
{
  "patientName": "...",
  "collectionDate": "YYYY-MM-DD",
  "reportDate": "YYYY-MM-DD",
  "reportNo": "...",
  "labName": "...",
  "notLabReport": false,
  "pending": [],
  "results": [...]
}

BEFORE RESPONDING: Scan the entire document and count how many distinct test results exist. Your results array must contain ALL of them. Missing results is a failure.`;

export interface MetricRef {
  code: string;
  name: string;
  unit: string | null;
  aliases: string[] | null;
}

/**
 * Mapping + unit-conversion instructions appended to the extraction prompt.
 * Replaces the old normalizer + unit_conversions + flagged_extractions tables.
 */
export function metricCatalogPrompt(metrics: MetricRef[]): string {
  const list = metrics
    .map(
      (m) =>
        `${m.code} | ${m.name} | ${m.unit ?? ""} | ${(m.aliases ?? []).join(", ")}`,
    )
    .join("\n");
  return `\n\nKNOWN METRICS (code | name | unit | aliases):\n${list}\n\nFor each result set \`code\` to the best matching metric code from the list, or null. Convert \`value\` (and the antecedent's value) to that metric's unit when the lab used a different unit; report the converted \`unit\`.`;
}

/** Strip markdown code fences from an AI response. */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}

/** The JSON object in a reply that may wrap it in prose ("Ionized calcium is
 *  ... {"matches":[]}"): first `{` to last `}`. */
export function jsonObjectIn(text: string): string {
  const t = stripCodeFences(text);
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50) || "unknown"
  );
}

export interface ExtractedReading {
  analyte: string;
  code: string | null;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  observedAt: string;
  /** `< 8,0` is stored as 8 with this set, so a reader knows it is a bound. */
  censored?: "<" | ">";
  /** The previous result the sheet printed beside this one, with its date. */
  antecedent?: { value: number; unit: string | null; date: string };
}

export interface ExtractResult {
  readings: ExtractedReading[];
  collectionDate?: string;
  labName?: string;
  /** The lab's own report number, how a re-upload of the same report is known. */
  reportNo?: string;
  /** Tests the sheet lists as still running ("Analize în curs de execuție"). */
  pending?: string[];
  /** The model says this is not a lab sheet: the only door to the document path. */
  notLab?: boolean;
  error?: string;
  /** What the model actually read: the PDF text layer, or the OCR answer. */
  text?: string;
  pages?: number;
  /** The model's finish reason per page group, for the logs. */
  finish?: string[];
}

/** The error an encrypted PDF gives, so the routes can ask for the password. */
export const NEEDS_PASSWORD = "needs_password";

/** pdfjs throws a `PasswordException` for both "needs one" and "wrong one". */
export const isPasswordError = (e: unknown) =>
  (e as { name?: string } | null)?.name === "PasswordException";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A number, or one the model wrote as a string with a decimal comma. */
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Pure: raw AI JSON text → readings. No DB, no network. `fallbackDay` is the
 * collection date another chunk of the same report found, for a chunk whose
 * page carries no header.
 */
export function transformAiResponse(
  text: string,
  fallbackDay?: string,
): ExtractResult {
  let parsed: {
    results?: unknown[];
    collectionDate?: string;
    labName?: string;
    reportNo?: unknown;
    pending?: unknown;
    notLabReport?: unknown;
  };
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch {
    return { readings: [], error: "parse_failed" };
  }

  const fallbackDate =
    parsed.collectionDate ??
    fallbackDay ??
    new Date().toISOString().split("T")[0]!;

  const readings = ((parsed.results ?? []) as Record<string, any>[]).map(
    (r) => {
      let value = typeof r.value === "number" ? r.value : null;
      const valueText =
        r.valueText ?? (r.value != null ? String(r.value) : null);
      const cmp = valueText
        ? String(valueText)
            .trim()
            .match(/^([<>≤≥])\s*([\d.,]+)$/)
        : null;
      if (value === null && cmp) value = parseFloat(cmp[2]!.replace(",", "."));
      const observedAt = r.observedAt ?? fallbackDate;
      const a = r.antecedent as Record<string, unknown> | null | undefined;
      const aValue = num(a?.value);
      const aDate = typeof a?.date === "string" ? a.date : null;
      return {
        analyte: r.analyte ?? "",
        code: typeof r.code === "string" && r.code ? r.code : null,
        value,
        valueText,
        unit: r.unit ?? null,
        refLow:
          typeof r.referenceRangeLow === "number" ? r.referenceRangeLow : null,
        refHigh:
          typeof r.referenceRangeHigh === "number"
            ? r.referenceRangeHigh
            : null,
        observedAt,
        ...(cmp && value !== null
          ? {
              censored: "<≤".includes(cmp[1]!)
                ? ("<" as const)
                : (">" as const),
            }
          : {}),
        ...(aValue !== null &&
        aDate &&
        ISO_DAY.test(aDate) &&
        aDate !== observedAt
          ? {
              antecedent: {
                value: aValue,
                unit: typeof a?.unit === "string" ? a.unit : (r.unit ?? null),
                date: aDate,
              },
            }
          : {}),
      };
    },
  );

  return {
    readings,
    collectionDate: parsed.collectionDate,
    labName: parsed.labName,
    reportNo:
      typeof parsed.reportNo === "string" && parsed.reportNo.trim()
        ? parsed.reportNo.trim()
        : undefined,
    pending: Array.isArray(parsed.pending)
      ? parsed.pending.filter((p): p is string => typeof p === "string")
      : [],
    notLab: parsed.notLabReport === true,
  };
}

/** Above this many characters a report is read in page groups. */
export const CHUNK_AT = 12_000;
/** Target size of one page group. */
export const CHUNK_SIZE = 8_000;
/** Lines of the previous group repeated at the top of the next one. */
const OVERLAP_LINES = 12;
/** Lines of the first page repeated on every group: patient, dates, lab. */
const HEADER_LINES = 6;
/**
 * Lab extraction writes about 9k tokens for a 10-page report; reasoning on top
 * of that ran past the old 8 192 cap and returned nothing (2026-09-28).
 */
export const EXTRACT_MAX_TOKENS = 32_000;
// ponytail: a cost guard, not a correctness one. 60k characters is ~30 pages.
const MAX_TEXT = 60_000;

/**
 * Pure: a long report into page groups under `size`, split at a blank line
 * (a page break in `extractTextFromPdf`) when there is one. Each group after
 * the first carries the report header and the tail of the group before, so a
 * test whose title ends one page and whose value starts the next is still
 * whole somewhere; the overlap is removed again by `mergeResults`.
 */
export function chunkText(text: string, size = CHUNK_SIZE): string[] {
  if (text.length <= CHUNK_AT) return [text];
  // A line longer than a group (a text layer with no line breaks) is cut.
  const lines = text
    .split("\n")
    .flatMap((l) =>
      l.length > size
        ? Array.from({ length: Math.ceil(l.length / size) }, (_, i) =>
            l.slice(i * size, (i + 1) * size),
          )
        : [l],
    );
  const header = lines.slice(0, HEADER_LINES).join("\n").slice(0, 800);
  const groups: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const line of lines) {
    const pageBreak = !line.trim() && len > size * 0.6;
    if ((pageBreak || len + line.length > size) && cur.length) {
      groups.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(line);
    len += line.length + 1;
  }
  if (cur.some((l) => l.trim())) groups.push(cur);
  return groups.map((g, i) =>
    i === 0
      ? g.join("\n")
      : [
          header,
          groups[i - 1]!.slice(-OVERLAP_LINES).join("\n").slice(-1500),
          ...g,
        ].join("\n"),
  );
}

/** Same analyte, same day, same number: one row. */
export const readingKey = (r: ExtractedReading) =>
  `${r.code ?? slugify(r.analyte)}|${r.observedAt}|${r.value ?? r.valueText}`;

/** Pure: the page groups' answers into one result, overlap removed. */
export function mergeResults(parts: ExtractResult[]): ExtractResult {
  const failed = parts.find((p) => p.error);
  if (failed) return { readings: [], error: failed.error };
  const seen = new Set<string>();
  const readings: ExtractedReading[] = [];
  for (const r of parts.flatMap((p) => p.readings)) {
    const key = readingKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    readings.push(r);
  }
  return {
    readings,
    collectionDate: parts.find((p) => p.collectionDate)?.collectionDate,
    labName: parts.find((p) => p.labName)?.labName,
    reportNo: parts.find((p) => p.reportNo)?.reportNo,
    pending: [...new Set(parts.flatMap((p) => p.pending ?? []))],
    notLab: parts.every((p) => p.notLab),
  };
}

/**
 * Text → readings. The half of `extractFromPdf` that a re-analyze can call on
 * its own when only the stored `raw_text` is left. A long report is read in
 * page groups, in parallel. Any group cut off by the output cap fails the
 * whole read: a silent half of a report is worse than none.
 */
export async function extractFromText(
  textContent: string,
  metrics: MetricRef[],
): Promise<ExtractResult> {
  const system = extractLabsPrompt + metricCatalogPrompt(metrics);
  const answers = await Promise.all(
    chunkText(textContent.slice(0, MAX_TEXT)).map((prompt) =>
      generateText({
        model: model(EXTRACT_MODEL),
        system,
        prompt,
        maxOutputTokens: EXTRACT_MAX_TOKENS,
        // Gemini 3 will not switch reasoning off; `minimal` spends none on
        // this task and is 40 % faster (measured 2026-09-28, same rows).
        providerOptions: { openrouter: { reasoning: { effort: "minimal" } } },
      }),
    ),
  );
  const day = answers
    .map((a) => transformAiResponse(a.text).collectionDate)
    .find(Boolean);
  const merged = mergeResults(
    answers.map((a) =>
      a.finishReason === "length"
        ? { readings: [], error: "truncated" }
        : transformAiResponse(a.text, day),
    ),
  );
  return {
    ...merged,
    text: textContent,
    finish: answers.map((a) => a.finishReason),
  };
}

/** PDF buffer → readings. Falls back to OCR for scanned documents. */
export async function extractFromPdf(
  buffer: Buffer,
  metrics: MetricRef[],
  password?: string,
): Promise<ExtractResult> {
  const system = extractLabsPrompt + metricCatalogPrompt(metrics);
  let textContent = "";
  let pages = 0;
  try {
    ({ text: textContent, pages } = await extractTextFromPdf(buffer, password));
  } catch (e) {
    // Encrypted bytes are noise to OCR too, so ask for the password instead.
    if (isPasswordError(e)) return { readings: [], error: NEEDS_PASSWORD };
    console.error("[extract] pdf text layer failed:", e);
  }

  if (textContent.trim().length >= MIN_TEXT_LENGTH)
    return { ...(await extractFromText(textContent, metrics)), pages };

  console.log(
    `[extract] text too short (${textContent.trim().length} chars), OCR via ${OCR_MODEL}`,
  );
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${buffer.toString("base64")}`,
              },
            },
            {
              type: "text",
              text:
                "Extract all lab test results from this scanned lab report. " +
                system,
            },
          ],
        },
      ],
      temperature: 0,
    }),
  });
  const data = await res.json();
  if (data.error) {
    console.error("[extract] OCR API error:", data.error);
    return { readings: [], error: "ocr_failed", pages };
  }
  if (data.choices[0].finish_reason === "length")
    return { readings: [], error: "truncated", pages };
  const ocr = data.choices[0].message.content as string;
  return { ...transformAiResponse(ocr), text: ocr, pages };
}
