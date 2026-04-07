import { getDb } from "@openvitals/database/client";
import { sourceArtifacts } from "@openvitals/database";
import { eq } from "drizzle-orm";
import { createBlobStorage } from "@openvitals/blob-storage";
import type { WorkflowContext } from "../workflow";
import type { ParseResult, RawExtraction } from "@openvitals/ingestion";
import AdmZip from "adm-zip";

/**
 * Map of Apple HealthKit quantity type identifiers to OpenVitals metric codes.
 * Only includes metrics that map to existing metric definitions or are broadly useful.
 */
const METRIC_MAP: Record<
  string,
  {
    metricCode: string;
    category: string;
    unit?: string;
    transform?: (v: number) => number;
  }
> = {
  // Vital signs
  HKQuantityTypeIdentifierRestingHeartRate: {
    metricCode: "resting_heart_rate",
    category: "vital_sign",
  },
  HKQuantityTypeIdentifierBloodPressureSystolic: {
    metricCode: "bp_systolic",
    category: "vital_sign",
  },
  HKQuantityTypeIdentifierBloodPressureDiastolic: {
    metricCode: "bp_diastolic",
    category: "vital_sign",
  },
  HKQuantityTypeIdentifierOxygenSaturation: {
    metricCode: "spo2",
    category: "vital_sign",
    unit: "%",
    transform: (v: number) => (v <= 1 ? v * 100 : v), // Apple stores as 0-1
  },
  HKQuantityTypeIdentifierBodyTemperature: {
    metricCode: "temperature",
    category: "vital_sign",
  },
  HKQuantityTypeIdentifierRespiratoryRate: {
    metricCode: "respiratory_rate",
    category: "vital_sign",
  },

  // Body measurements
  HKQuantityTypeIdentifierBodyMass: {
    metricCode: "weight",
    category: "vital_sign",
  },
  HKQuantityTypeIdentifierHeight: {
    metricCode: "height",
    category: "vital_sign",
  },
  HKQuantityTypeIdentifierBodyMassIndex: {
    metricCode: "bmi",
    category: "vital_sign",
  },
  HKQuantityTypeIdentifierBodyFatPercentage: {
    metricCode: "body_fat_pct",
    category: "vital_sign",
    unit: "%",
    transform: (v: number) => (v <= 1 ? v * 100 : v),
  },

  // Wearable / activity metrics
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: {
    metricCode: "hrv_rmssd",
    category: "wearable",
  },
  HKQuantityTypeIdentifierVO2Max: {
    metricCode: "vo2_max",
    category: "wearable",
  },

  // Lab results
  HKQuantityTypeIdentifierBloodGlucose: {
    metricCode: "glucose",
    category: "lab_result",
  },
};

/**
 * Metrics where multiple readings per day should be summed into a daily total.
 */
const DAILY_AGGREGATE_METRICS: Record<
  string,
  { metricCode: string; category: string; unit: string }
> = {
  HKQuantityTypeIdentifierStepCount: {
    metricCode: "step_count",
    category: "wearable",
    unit: "count",
  },
  HKQuantityTypeIdentifierActiveEnergyBurned: {
    metricCode: "active_energy",
    category: "wearable",
    unit: "kcal",
  },
  HKQuantityTypeIdentifierDistanceWalkingRunning: {
    metricCode: "distance_walking",
    category: "wearable",
    unit: "mi",
  },
  HKQuantityTypeIdentifierFlightsClimbed: {
    metricCode: "flights_climbed",
    category: "wearable",
    unit: "count",
  },
  HKQuantityTypeIdentifierAppleExerciseTime: {
    metricCode: "exercise_time",
    category: "wearable",
    unit: "min",
  },
};

/** Regex to extract self-closing <Record .../> elements */
const RECORD_REGEX = /<Record\s+([^>]*?)\/>/g;

/** Regex to extract individual attribute key="value" pairs */
const ATTR_REGEX = /(\w+)="([^"]*)"/g;

interface RecordAttrs {
  type?: string;
  value?: string;
  unit?: string;
  startDate?: string;
  endDate?: string;
  sourceName?: string;
  creationDate?: string;
}

function parseAttrs(attrString: string): RecordAttrs {
  const attrs: Record<string, string> = {};
  let match;
  ATTR_REGEX.lastIndex = 0;
  while ((match = ATTR_REGEX.exec(attrString)) !== null) {
    attrs[match[1]!] = match[2]!;
  }
  return attrs as RecordAttrs;
}

/**
 * Parse an Apple Health date string like "2024-01-15 08:30:00 -0500" into a Date.
 */
function parseHealthDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // Apple Health format: "2024-01-15 08:30:00 -0500"
  // Convert to ISO: "2024-01-15T08:30:00-05:00"
  const parts = dateStr.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/,
  );
  if (parts) {
    const iso = `${parts[1]}T${parts[2]}${parts[3]}:${parts[4]}`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback: try direct parse
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Extract the date portion (YYYY-MM-DD) for daily aggregation.
 */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Extract the export.xml content from a ZIP buffer.
 */
function extractXmlFromZip(zipBuffer: Buffer): string {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // Look for export.xml (Apple Health's main export file)
  const exportEntry = entries.find(
    (e) =>
      e.entryName === "export.xml" ||
      e.entryName === "apple_health_export/export.xml" ||
      e.entryName.endsWith("/export.xml"),
  );

  if (!exportEntry) {
    // Fall back to any XML file in the archive
    const xmlEntry = entries.find(
      (e) =>
        e.entryName.endsWith(".xml") && !e.entryName.endsWith("export_cda.xml"),
    );
    if (!xmlEntry) {
      throw new Error(
        "No export.xml found in the uploaded ZIP file. Please upload an Apple Health export.",
      );
    }
    return xmlEntry.getData().toString("utf-8");
  }

  return exportEntry.getData().toString("utf-8");
}

export async function parseAppleHealthExport(
  ctx: WorkflowContext,
): Promise<ParseResult> {
  const db = getDb();

  // Get artifact
  const [artifact] = await db
    .select()
    .from(sourceArtifacts)
    .where(eq(sourceArtifacts.id, ctx.artifactId))
    .limit(1);

  if (!artifact) throw new Error(`Artifact ${ctx.artifactId} not found`);

  // Download file from blob storage
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

  // Extract XML from ZIP (or use directly if already XML)
  let xmlContent: string;
  if (
    artifact.mimeType === "application/zip" ||
    artifact.mimeType === "application/x-zip-compressed"
  ) {
    xmlContent = extractXmlFromZip(buffer);
  } else {
    xmlContent = buffer.toString("utf-8");
  }

  console.log(
    `[apple-health] XML content length: ${xmlContent.length} characters`,
  );

  // Parse records from the XML
  const extractions: RawExtraction[] = [];
  const dailyAggregates = new Map<
    string,
    { sum: number; date: Date; unit: string }
  >();

  let recordCount = 0;
  let mappedCount = 0;

  let match;
  RECORD_REGEX.lastIndex = 0;
  while ((match = RECORD_REGEX.exec(xmlContent)) !== null) {
    recordCount++;
    const attrs = parseAttrs(match[1]!);

    if (!attrs.type || attrs.value === undefined) continue;

    const numValue = parseFloat(attrs.value);
    if (isNaN(numValue)) continue;

    const date = parseHealthDate(attrs.startDate ?? attrs.creationDate ?? "");
    if (!date) continue;

    // Check if this is a daily-aggregated metric
    const aggDef = DAILY_AGGREGATE_METRICS[attrs.type];
    if (aggDef) {
      const dayKey = `${aggDef.metricCode}:${toDateKey(date)}`;
      const existing = dailyAggregates.get(dayKey);
      if (existing) {
        existing.sum += numValue;
      } else {
        // Use noon of that day as the observation time
        const dayDate = new Date(toDateKey(date) + "T12:00:00Z");
        dailyAggregates.set(dayKey, {
          sum: numValue,
          date: dayDate,
          unit: attrs.unit ?? aggDef.unit,
        });
      }
      mappedCount++;
      continue;
    }

    // Check if this is a directly-mapped metric
    const metricDef = METRIC_MAP[attrs.type];
    if (!metricDef) continue;

    let value = numValue;
    if (metricDef.transform) {
      value = metricDef.transform(value);
    }

    mappedCount++;
    extractions.push({
      analyte: metricDef.metricCode,
      value,
      valueText: null,
      unit: metricDef.unit ?? attrs.unit ?? null,
      referenceRangeLow: null,
      referenceRangeHigh: null,
      referenceRangeText: null,
      isAbnormal: null,
      observedAt: date.toISOString(),
      category: metricDef.category as RawExtraction["category"],
      metadata: {
        source: "apple_health",
        sourceName: attrs.sourceName ?? null,
        hkType: attrs.type,
      },
    });
  }

  // Convert daily aggregates to extractions
  for (const [key, agg] of dailyAggregates) {
    const metricCode = key.split(":")[0]!;
    const aggDef = Object.values(DAILY_AGGREGATE_METRICS).find(
      (d) => d.metricCode === metricCode,
    )!;

    extractions.push({
      analyte: metricCode,
      value: Math.round(agg.sum * 100) / 100, // Round to 2 decimal places
      valueText: null,
      unit: agg.unit,
      referenceRangeLow: null,
      referenceRangeHigh: null,
      referenceRangeText: null,
      isAbnormal: null,
      observedAt: agg.date.toISOString(),
      category: aggDef.category as RawExtraction["category"],
      metadata: {
        source: "apple_health",
        hkType: "daily_aggregate",
        aggregationType: "sum",
      },
    });
  }

  console.log(
    `[apple-health] Processed ${recordCount} records, mapped ${mappedCount}, ` +
      `produced ${extractions.length} extractions (${dailyAggregates.size} daily aggregates)`,
  );

  // Save a summary as raw text for the artifact
  await db
    .update(sourceArtifacts)
    .set({
      rawTextExtracted: `Apple Health Export: ${recordCount} records, ${extractions.length} mapped observations`,
    })
    .where(eq(sourceArtifacts.id, ctx.artifactId));

  return {
    extractions,
    rawMetadata: {
      parser: "apple-health-xml",
      version: "0.1.0",
      totalRecords: recordCount,
      mappedRecords: mappedCount,
      dailyAggregates: dailyAggregates.size,
    },
  };
}
