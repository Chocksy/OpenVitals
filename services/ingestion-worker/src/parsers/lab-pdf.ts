import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { getDb } from '@openvitals/database/client';
import { sourceArtifacts } from '@openvitals/database';
import { eq } from 'drizzle-orm';
import { createBlobStorage } from '@openvitals/blob-storage';
import { extractLabsPrompt } from '@openvitals/ai';
import type { WorkflowContext } from '../workflow';
import type { ParseResult, RawExtraction } from '@openvitals/ingestion';

export async function parseLabPdf(ctx: WorkflowContext): Promise<ParseResult> {
  const db = getDb();

  // Get artifact with extracted text
  const [artifact] = await db.select()
    .from(sourceArtifacts)
    .where(eq(sourceArtifacts.id, ctx.artifactId))
    .limit(1);

  if (!artifact) throw new Error(`Artifact ${ctx.artifactId} not found`);

  let textContent = artifact.rawTextExtracted ?? '';

  // If no extracted text yet, download and extract
  if (!textContent) {
    const storage = createBlobStorage();
    const blob = await storage.download(artifact.blobPath);
    const chunks: Uint8Array[] = [];
    const reader = blob.data.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const buffer = Buffer.concat(chunks);

    if (artifact.mimeType === 'application/pdf') {
      const { extractTextFromPdf } = await import('../lib/pdf');
      textContent = await extractTextFromPdf(buffer);
    } else {
      textContent = buffer.toString('utf-8');
    }
  }

  console.log(`[lab-pdf] Extracted ${textContent.length} chars from artifact=${ctx.artifactId}`);

  // Send to AI for structured extraction
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const modelId = process.env.AI_DEFAULT_MODEL ?? 'anthropic/claude-sonnet-4';
  const { text } = await generateText({
    model: openrouter(modelId),
    system: extractLabsPrompt,
    prompt: textContent.slice(0, 30000),
  });

  let parsed: any;
  try {
    const jsonStr = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    parsed = JSON.parse(jsonStr);
    const analytes = (parsed.results ?? []).map((r: any) => r.analyte);
    console.log(`[lab-pdf] AI extracted ${analytes.length} results:`);
    for (const r of (parsed.results ?? [])) {
      console.log(`  - ${r.analyte}: ${r.value} ${r.unit} (range: ${r.referenceRangeLow}-${r.referenceRangeHigh})`);
    }
  } catch {
    console.error('[lab-pdf] Failed to parse AI response:', text.slice(0, 500));
    return { extractions: [], rawMetadata: { parser: 'lab-pdf', version: '0.1.0', error: 'parse_failed' } };
  }

  const fallbackDate = parsed.collectionDate ?? new Date().toISOString().split('T')[0];

  const extractions: RawExtraction[] = (parsed.results ?? []).map((r: any) => {
    // Handle "< X" or "> X" values - strip comparator and use the number
    let numValue = typeof r.value === 'number' ? r.value : null;
    const rawText = r.valueText ?? (r.value != null ? String(r.value) : null);
    if (numValue === null && rawText) {
      const ltMatch = rawText.match(/^[<>≤≥]\s*([\d.,]+)$/);
      if (ltMatch) {
        numValue = parseFloat(ltMatch[1]!.replace(',', '.'));
      }
    }
    return {
    analyte: r.analyte ?? '',
    value: numValue,
    valueText: rawText,
    unit: r.unit ?? null,
    referenceRangeLow: typeof r.referenceRangeLow === 'number' ? r.referenceRangeLow : null,
    referenceRangeHigh: typeof r.referenceRangeHigh === 'number' ? r.referenceRangeHigh : null,
    referenceRangeText: r.referenceRangeText ?? null,
    isAbnormal: typeof r.isAbnormal === 'boolean' ? r.isAbnormal : null,
    observedAt: r.observedAt ?? fallbackDate,
    category: 'lab_result' as const,
  };
  });

  return {
    extractions,
    patientName: parsed.patientName,
    collectionDate: parsed.collectionDate,
    reportDate: parsed.reportDate,
    labName: parsed.labName,
    rawMetadata: { parser: 'lab-pdf', version: '0.1.0' },
  };
}
