import { describe, it, expect } from "vitest";
import { legacyUploadRow, type LegacyArtifact } from "./import-legacy";

const artifact = (over: Partial<LegacyArtifact> = {}): LegacyArtifact => ({
  id: "3f2b1c4d-0000-4000-8000-000000000001",
  user_id: "user-1",
  file_name: "Razvan - 20.11.2024.pdf",
  created_at: "2024-11-20T10:00:00.000Z",
  raw_text_extracted: "HEMOGRAMA ...",
  blob_path: "file:///data/blobs/uploads/user-1/abc/Razvan.pdf",
  content_hash: "abc123",
  job_status: "completed",
  ...over,
});

describe("legacyUploadRow", () => {
  it("reuses the legacy id so a second import updates in place", () => {
    expect(legacyUploadRow(artifact()).id).toBe(
      "3f2b1c4d-0000-4000-8000-000000000001",
    );
  });

  it("carries the file, the text, the blob path and the hash across", () => {
    expect(legacyUploadRow(artifact())).toMatchObject({
      userId: "user-1",
      fileName: "Razvan - 20.11.2024.pdf",
      createdAt: "2024-11-20T10:00:00.000Z",
      rawText: "HEMOGRAMA ...",
      blobPath: "file:///data/blobs/uploads/user-1/abc/Razvan.pdf",
      sha256: "abc123",
      source: "legacy",
    });
  });

  it("maps completed to done", () => {
    expect(legacyUploadRow(artifact({ job_status: "completed" })).status).toBe(
      "done",
    );
  });

  it("maps review_needed to needs_review", () => {
    expect(
      legacyUploadRow(artifact({ job_status: "review_needed" })).status,
    ).toBe("needs_review");
  });

  it("maps anything else, including no job at all, to failed", () => {
    expect(legacyUploadRow(artifact({ job_status: null })).status).toBe(
      "failed",
    );
    expect(legacyUploadRow(artifact({ job_status: "pending" })).status).toBe(
      "failed",
    );
  });

  it("keeps a missing text layer as null instead of inventing one", () => {
    expect(
      legacyUploadRow(artifact({ raw_text_extracted: null })).rawText,
    ).toBe(null);
  });
});
