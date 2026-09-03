import { describe, it, expect } from "vitest";
import {
  localPath,
  MIN_RAW_TEXT,
  pickSource,
  sha256,
  uploadDate,
  uploadPath,
  uploadState,
  UPLOAD_WORD,
} from "./uploads";

describe("pickSource", () => {
  it("prefers the file whenever we still have it", () => {
    expect(pickSource(true, null)).toBe("file");
    expect(pickSource(true, "x".repeat(5000))).toBe("file");
  });

  it("falls back to the stored text when it is long enough", () => {
    expect(pickSource(false, "x".repeat(MIN_RAW_TEXT + 1))).toBe("text");
  });

  it("gives up on a scanned PDF whose text layer is a few characters", () => {
    // The four legacy scans hold 2 to 4 characters of text.
    expect(pickSource(false, "\n \n")).toBe(null);
    expect(pickSource(false, "x".repeat(MIN_RAW_TEXT))).toBe(null);
    expect(pickSource(false, null)).toBe(null);
  });
});

describe("localPath", () => {
  it("is null for a legacy blob that lives on another machine", () => {
    expect(
      localPath("file:///data/blobs/uploads/u/hash/Razvan - 2024.pdf"),
    ).toBe(null);
    expect(localPath(null)).toBe(null);
  });

  it("returns the path of a file that is really here", () => {
    expect(localPath("./package.json")).toBe("./package.json");
    expect(localPath("file://./package.json")).toBe("./package.json");
  });
});

describe("uploadPath", () => {
  it("puts one directory per user under UPLOAD_DIR", () => {
    process.env.UPLOAD_DIR = "/tmp/up";
    expect(uploadPath("user-1", "abc")).toBe("/tmp/up/user-1/abc.pdf");
    delete process.env.UPLOAD_DIR;
    expect(uploadPath("user-1", "abc")).toBe("data/uploads/user-1/abc.pdf");
  });
});

describe("sha256", () => {
  it("hashes the bytes, so the same PDF twice is one hash", () => {
    expect(sha256(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256(Buffer.from("abc"))).toBe(sha256(Buffer.from("abc")));
  });
});

/**
 * Phase 31a item 8. `needs_review` is written once by `lib/import-legacy.ts`
 * and nothing has ever read it or cleared it, so an upload with nothing wrong
 * with it printed "needs a check" beside a check nobody could do.
 */
describe("uploadState", () => {
  it("calls a legacy needs_review upload parsed, like any other", () => {
    expect(uploadState("needs_review")).toBe("parsed");
    expect(uploadState("done")).toBe("parsed");
  });

  it("keeps the two states that mean something", () => {
    expect(uploadState("failed")).toBe("failed");
    expect(uploadState("extracting")).toBe("reading");
    expect(uploadState("pending")).toBe("reading");
  });

  it("says deleted when the row is gone, whatever its status", () => {
    expect(uploadState("done", true)).toBe("deleted");
    expect(uploadState("deleted")).toBe("deleted");
  });

  it("never has a word for a check nobody can do", () => {
    expect(Object.values(UPLOAD_WORD)).not.toContain("needs a check");
  });
});

describe("uploadDate", () => {
  it("prints the draw date when the file carries one", () => {
    expect(
      uploadDate({
        firstDay: "2026-04-23",
        lastDay: "2026-04-23",
        createdAt: "2026-08-02",
      }),
    ).toBe("2026-04-23");
  });

  it("spans the draws when they are not all on one day", () => {
    expect(uploadDate({ firstDay: "2026-04-23", lastDay: "2026-04-25" })).toBe(
      "2026-04-23 – 2026-04-25",
    );
  });

  it("writes the days the way the surface asks for", () => {
    expect(
      uploadDate({ firstDay: "2026-04-23" }, (d) => `day ${d}`),
    ).toBe("day 2026-04-23");
  });

  it("falls back to the day it was read, and only then", () => {
    expect(uploadDate({ firstDay: null, createdAt: "2026-08-02" })).toBe(
      "2026-08-02",
    );
    expect(uploadDate({})).toBe(null);
  });
});
