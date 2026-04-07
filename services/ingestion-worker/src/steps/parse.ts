import { getDb } from "@openvitals/database/client";
import { importJobs } from "@openvitals/database";
import { eq } from "drizzle-orm";
import type { WorkflowContext } from "../workflow";
import type { ParseResult } from "@openvitals/ingestion";
import { parseLabPdf } from "../parsers/lab-pdf";
import { parseCsvImport } from "../parsers/csv-importer";
import { parseAppleHealthExport } from "../parsers/apple-health-xml";

const parserMap: Record<
  string,
  (ctx: WorkflowContext) => Promise<ParseResult>
> = {
  lab_report: parseLabPdf,
  csv_export: parseCsvImport,
  apple_health_export: parseAppleHealthExport,
};

export async function parse(
  ctx: WorkflowContext,
  documentType: string,
): Promise<ParseResult> {
  const db = getDb();

  await db
    .update(importJobs)
    .set({ status: "parsing" })
    .where(eq(importJobs.id, ctx.importJobId));

  console.log(
    `[parse] Parsing as ${documentType} for artifact=${ctx.artifactId}`,
  );

  const parser = parserMap[documentType];
  if (!parser) {
    console.warn(
      `[parse] No parser for type ${documentType}, returning empty result`,
    );
    return { extractions: [] };
  }

  const result = await parser(ctx);

  await db
    .update(importJobs)
    .set({
      parseCompletedAt: new Date(),
      parserId: documentType,
      parserVersion: "0.1.0",
    })
    .where(eq(importJobs.id, ctx.importJobId));

  return result;
}
