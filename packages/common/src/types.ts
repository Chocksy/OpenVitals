export type ObservationStatus =
  | "extracted"
  | "confirmed"
  | "corrected"
  | "manual"
  | "rejected";

export type ImportStatus =
  | "pending"
  | "classifying"
  | "parsing"
  | "normalizing"
  | "completed"
  | "failed"
  | "review_needed";

export type AccessLevel = "view" | "view_download" | "full";

export type DocumentType =
  | "lab_report"
  | "encounter_note"
  | "imaging_report"
  | "dental_record"
  | "immunization_record"
  | "csv_export"
  | "wearable_export"
  | "apple_health_export"
  | "unknown";

/** A number between 0 and 1 representing confidence in an AI extraction. */
export type ConfidenceLevel = number;

export interface DateRange {
  start?: Date;
  end?: Date;
}

export interface PaginationParams {
  limit: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  totalCount?: number;
}
