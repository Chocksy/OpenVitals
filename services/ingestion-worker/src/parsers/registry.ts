import type { DocumentType } from "@openvitals/common";

export interface ParserInfo {
  id: string;
  version: string;
  supportedTypes: string[];
}

export const parserRegistry: ParserInfo[] = [
  {
    id: "lab-pdf",
    version: "0.1.0",
    supportedTypes: ["lab_report"],
  },
  {
    id: "csv-importer",
    version: "0.1.0",
    supportedTypes: ["csv_export", "wearable_export"],
  },
  {
    id: "encounter-note",
    version: "0.1.0",
    supportedTypes: ["encounter_note"],
  },
  {
    id: "apple-health-xml",
    version: "0.1.0",
    supportedTypes: ["apple_health_export"],
  },
];

export function getParserForType(documentType: string): ParserInfo | undefined {
  return parserRegistry.find((p) => p.supportedTypes.includes(documentType));
}
