import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { extractTextFromPdf } from "./pdf";

const OCR_MODEL = process.env.AI_OCR_MODEL ?? "google/gemini-2.5-flash";
const MIN_TEXT_LENGTH = 50; // Below this, assume scanned/image PDF

export function model(
  id = process.env.AI_DEFAULT_MODEL ?? "google/gemini-2.5-flash",
) {
  // ponytail: OpenRouter only. The old worker's AI-gateway fallback is dropped.
  return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(id);
}

/** Copied verbatim from packages/ai/src/prompts/extract-labs.ts. */
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
8. For date: use the RECOLTAT/collection date from the header, not antecedent dates.

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

Output JSON:
{
  "patientName": "...",
  "collectionDate": "YYYY-MM-DD",
  "reportDate": "YYYY-MM-DD",
  "labName": "...",
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
  return `\n\nKNOWN METRICS (code | name | unit | aliases):\n${list}\n\nFor each result set \`code\` to the best matching metric code from the list, or null. Convert \`value\` to that metric's unit when the lab used a different unit; report the converted \`unit\`.`;
}

/** Strip markdown code fences from an AI response. */
export function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
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
}

export interface ExtractResult {
  readings: ExtractedReading[];
  collectionDate?: string;
  labName?: string;
  error?: string;
}

/** Pure: raw AI JSON text → readings. No DB, no network. */
export function transformAiResponse(text: string): ExtractResult {
  let parsed: {
    results?: unknown[];
    collectionDate?: string;
    labName?: string;
  };
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch {
    return { readings: [], error: "parse_failed" };
  }

  const fallbackDate =
    parsed.collectionDate ?? new Date().toISOString().split("T")[0]!;

  const readings = ((parsed.results ?? []) as Record<string, any>[]).map(
    (r) => {
      let value = typeof r.value === "number" ? r.value : null;
      const valueText =
        r.valueText ?? (r.value != null ? String(r.value) : null);
      if (value === null && valueText) {
        const cmp = String(valueText).match(/^[<>≤≥]\s*([\d.,]+)$/);
        if (cmp) value = parseFloat(cmp[1]!.replace(",", "."));
      }
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
        observedAt: r.observedAt ?? fallbackDate,
      };
    },
  );

  return {
    readings,
    collectionDate: parsed.collectionDate,
    labName: parsed.labName,
  };
}

/** PDF buffer → readings. Falls back to OCR for scanned documents. */
export async function extractFromPdf(
  buffer: Buffer,
  metrics: MetricRef[],
): Promise<ExtractResult> {
  const system = extractLabsPrompt + metricCatalogPrompt(metrics);
  let textContent = "";
  try {
    textContent = await extractTextFromPdf(buffer);
  } catch (e) {
    console.error("[extract] pdf text layer failed:", e);
  }

  if (textContent.trim().length >= MIN_TEXT_LENGTH) {
    const { text } = await generateText({
      model: model(),
      system,
      prompt: textContent.slice(0, 30000),
    });
    return transformAiResponse(text);
  }

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
    return { readings: [], error: "ocr_failed" };
  }
  return transformAiResponse(data.choices[0].message.content);
}
