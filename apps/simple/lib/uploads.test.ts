import { describe, it, expect } from "vitest";
import {
  localPath,
  MIN_RAW_TEXT,
  pickSource,
  sha256,
  uploadPath,
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
