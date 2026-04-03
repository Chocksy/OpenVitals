/** Maximum allowed file size for uploads (50 MB). */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** MIME types accepted for document uploads. */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/csv",
  "image/jpeg",
  "image/png",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
] as const;

/** Confidence scores below this threshold are flagged for manual review. */
export const CONFIDENCE_THRESHOLD = 0.7;

/** Default number of items per page. */
export const DEFAULT_PAGE_SIZE = 50;

/** Maximum number of items per page. */
export const MAX_PAGE_SIZE = 200;

/** Rate limit for AI extraction calls. */
export const AI_RATE_LIMIT = { limit: 20, window: "1h" as const };

/** Interval in milliseconds for polling import status. */
export const POLLING_INTERVAL_MS = 3000;

/** Timeout in milliseconds before an import is considered stuck. */
export const IMPORT_TIMEOUT_MS = 60000;
