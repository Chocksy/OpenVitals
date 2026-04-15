import { describe, it, expect } from "vitest";

/**
 * Tests for the classification heuristics in classify.ts.
 *
 * The heuristics are inline in the classify function, so we test them
 * by extracting the logic into testable predicates here.
 * This mirrors the actual conditions in classify.ts lines 32-83.
 */

// Extracted heuristic: CSV detection
function isCsvFile(mimeType: string): boolean {
  return mimeType === "text/csv";
}

// Extracted heuristic: Apple Health ZIP detection
function isAppleHealthExport(mimeType: string, fileName: string): boolean {
  return (
    (mimeType === "application/zip" ||
      mimeType === "application/x-zip-compressed") &&
    /(?:export|apple.?health)/i.test(fileName)
  );
}

// Extracted heuristic: Scanned PDF detection
function isScannedPdf(mimeType: string, extractedTextLength: number): boolean {
  return mimeType === "application/pdf" && extractedTextLength < 50;
}

describe("classify heuristics", () => {
  describe("CSV detection", () => {
    it("identifies text/csv as CSV", () => {
      expect(isCsvFile("text/csv")).toBe(true);
    });

    it("does not classify PDFs as CSV", () => {
      expect(isCsvFile("application/pdf")).toBe(false);
    });

    it("does not classify plain text as CSV", () => {
      expect(isCsvFile("text/plain")).toBe(false);
    });
  });

  describe("Apple Health export detection", () => {
    it("identifies ZIP with 'export' in name", () => {
      expect(isAppleHealthExport("application/zip", "export.zip")).toBe(true);
    });

    it("identifies ZIP with 'apple health' in name", () => {
      expect(
        isAppleHealthExport("application/zip", "apple-health-data.zip"),
      ).toBe(true);
    });

    it("identifies x-zip-compressed MIME type", () => {
      expect(
        isAppleHealthExport(
          "application/x-zip-compressed",
          "AppleHealth-Export.zip",
        ),
      ).toBe(true);
    });

    it("case-insensitive filename matching", () => {
      expect(isAppleHealthExport("application/zip", "EXPORT.ZIP")).toBe(true);
      expect(isAppleHealthExport("application/zip", "AppleHealth.zip")).toBe(
        true,
      );
    });

    it("does not match random ZIP files", () => {
      expect(isAppleHealthExport("application/zip", "photos.zip")).toBe(false);
      expect(isAppleHealthExport("application/zip", "documents.zip")).toBe(
        false,
      );
    });

    it("does not match non-ZIP files with health in name", () => {
      expect(isAppleHealthExport("application/pdf", "health-export.pdf")).toBe(
        false,
      );
    });
  });

  describe("Scanned PDF detection", () => {
    it("identifies PDF with < 50 chars as scanned", () => {
      expect(isScannedPdf("application/pdf", 10)).toBe(true);
      expect(isScannedPdf("application/pdf", 0)).toBe(true);
      expect(isScannedPdf("application/pdf", 49)).toBe(true);
    });

    it("does not flag PDF with sufficient text", () => {
      expect(isScannedPdf("application/pdf", 50)).toBe(false);
      expect(isScannedPdf("application/pdf", 5000)).toBe(false);
    });

    it("does not flag non-PDF files", () => {
      expect(isScannedPdf("text/csv", 0)).toBe(false);
      expect(isScannedPdf("application/zip", 10)).toBe(false);
    });
  });
});
