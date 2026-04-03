import type { HealthStatus } from "@/components/health/status-badge";

export const DOC_TYPE_LABELS: Record<string, string> = {
  lab_report: "Lab report",
  encounter_note: "Encounter note",
  imaging_report: "Imaging report",
  dental_record: "Dental record",
  immunization_record: "Immunization record",
  csv_export: "CSV export",
  wearable_export: "Wearable export",
  apple_health_export: "Apple Health export",
  unknown: "Unknown",
};

export const IMPORT_JOB_STATUS_MAP: Record<
  string,
  { label: string; badge: HealthStatus }
> = {
  completed: { label: "Completed", badge: "normal" },
  pending: { label: "Pending", badge: "info" },
  classifying: { label: "Classifying", badge: "info" },
  parsing: { label: "Parsing...", badge: "info" },
  normalizing: { label: "Normalizing", badge: "info" },
  review_needed: { label: "Needs review", badge: "warning" },
  failed: { label: "Failed", badge: "critical" },
};
