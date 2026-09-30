import { describe, it, expect } from "vitest";
import type { ExtractedReading } from "./extract";
import {
  failedError,
  failedStatus,
  localPath,
  MIN_RAW_TEXT,
  pickSource,
  planInsert,
  planSupersede,
  sameReport,
  sha256,
  toRows,
  uploadDate,
  uploadPath,
  uploadState,
  UPLOAD_WORD,
  type NewRow,
  type StoredRow,
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

  it("calls a locked PDF failed, with the reason beside it", () => {
    expect(uploadState("needs_password")).toBe("failed");
    expect(failedStatus("needs_password")).toBe("needs_password");
    expect(failedStatus("truncated")).toBe("failed");
    expect(failedError("needs_password")).toContain("password");
    expect(failedError("parse_failed")).toBe("parse_failed");
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
    expect(uploadDate({ firstDay: "2026-04-23" }, (d) => `day ${d}`)).toBe(
      "day 2026-04-23",
    );
  });

  it("falls back to the day it was read, and only then", () => {
    expect(uploadDate({ firstDay: null, createdAt: "2026-08-02" })).toBe(
      "2026-08-02",
    );
    expect(uploadDate({})).toBe(null);
  });
});

/* ── phase 41: what a lab sheet writes ─────────────────────────────────── */

const extracted = (
  patch: Partial<ExtractedReading> = {},
): ExtractedReading => ({
  analyte: "Ferritin",
  code: "ferritin",
  value: 8.2,
  valueText: "8,2",
  unit: "ng/mL",
  refLow: 10,
  refHigh: 291,
  observedAt: "2026-08-18",
  ...patch,
});

const row = (patch: Partial<NewRow> = {}): NewRow => ({
  metricCode: "ferritin",
  value: 8.2,
  valueText: "8,2",
  unit: "ng/mL",
  refLow: 10,
  refHigh: 291,
  observedAt: "2026-08-18",
  flags: null,
  ...patch,
});

const stored = (id: string, patch: Partial<StoredRow> = {}): StoredRow => ({
  id,
  uploadId: "old",
  metricCode: "ferritin",
  observedAt: "2026-08-18",
  value: 8.2,
  flags: null,
  ...patch,
});

describe("toRows", () => {
  it("turns an antecedent into a row on its own day, flagged", () => {
    const { row: r, antecedent } = toRows(
      extracted({
        antecedent: { value: 10.7, unit: "ng/mL", date: "2026-07-29" },
      }),
      "ferritin",
    );
    expect(r.observedAt).toBe("2026-08-18");
    expect(antecedent).toMatchObject({
      metricCode: "ferritin",
      value: 10.7,
      observedAt: "2026-07-29",
      refLow: 10,
      refHigh: 291,
    });
    expect(antecedent!.flags).toContain("antecedent");
    // raw-verify would read today's value off the sheet line and "fix" it
    expect(antecedent!.flags).toContain("raw_confirmed");
  });

  it("converts an antecedent written in another unit, drops one it cannot", () => {
    expect(
      toRows(
        extracted({
          code: "ferritin",
          unit: "ng/mL",
          antecedent: { value: 10.7, unit: "ug/L", date: "2026-07-29" },
        }),
        "ferritin",
      ).antecedent!.value,
    ).toBe(10.7);
    expect(
      toRows(
        extracted({
          antecedent: { value: 23.5, unit: "pmol/L", date: "2026-07-29" },
        }),
        "ferritin",
      ).antecedent,
    ).toBeNull();
  });

  it("keeps a censored value's bound in its flags", () => {
    const { row: r } = toRows(
      extracted({ analyte: "GGT", value: 7, valueText: "< 7", censored: "<" }),
      "ggt",
    );
    expect(r.value).toBe(7);
    expect(r.flags).toEqual([{ censored: "<" }]);
  });
});

describe("planInsert", () => {
  // Phase 43H: a TC/HDL ratio printed on the total cholesterol line.
  it("drops a lipid value that looks like a ratio, with the reason", () => {
    const ratio = row({
      metricCode: "total_cholesterol",
      value: 2.56,
      valueText: "2.56",
      unit: null,
      refLow: null,
      refHigh: null,
    });
    const plan = planInsert([ratio, row()], [], []);
    expect(plan.insert.map((r) => r.metricCode)).toEqual(["ferritin"]);
    expect(plan.dropped).toEqual([
      { row: ratio, reason: "looks like a ratio or a different unit" },
    ]);
  });

  it("skips a row identical on metric, day and value", () => {
    const plan = planInsert([row()], [], [stored("a")]);
    expect(plan.insert).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  it("keeps a row that differs in value: the sheet says what it says", () => {
    const plan = planInsert([row({ value: 8.3 })], [], [stored("a")]);
    expect(plan.insert).toHaveLength(1);
  });

  it("lands an antecedent only on a day nothing holds, never over a real row", () => {
    const ante = row({
      value: 10.7,
      observedAt: "2026-07-29",
      flags: ["antecedent"],
    });
    expect(planInsert([], [ante], []).insert).toEqual([ante]);
    const held = planInsert(
      [],
      [ante],
      [stored("real", { observedAt: "2026-07-29", value: 10.5 })],
    );
    expect(held.insert).toHaveLength(0);
    expect(held.replace).toHaveLength(0);
  });

  it("lets the sheet's own row replace an antecedent row of that test and day", () => {
    const plan = planInsert(
      [row({ observedAt: "2026-07-29", value: 10.7 })],
      [],
      [
        stored("ante", {
          observedAt: "2026-07-29",
          value: 10.7,
          flags: ["antecedent"],
        }),
      ],
    );
    expect(plan.replace).toEqual(["ante"]);
    expect(plan.insert).toHaveLength(1);
  });

  it("skips an antecedent whose value already sits within three days", () => {
    const ante = row({
      metricCode: "zinc",
      value: 77,
      observedAt: "2025-12-10",
      flags: ["antecedent"],
    });
    const real = stored("real", {
      metricCode: "zinc",
      value: 77,
      observedAt: "2025-12-09",
    });
    expect(planInsert([], [ante], [real]).insert).toHaveLength(0);
    // the twin can arrive in the same upload, too
    expect(
      planInsert([row({ ...real, flags: null })], [ante], []).insert,
    ).toHaveLength(1);
    // four days away, or another value, is another draw
    expect(
      planInsert([], [ante], [{ ...real, observedAt: "2025-12-06" }]).insert,
    ).toEqual([ante]);
    expect(planInsert([], [ante], [{ ...real, value: 78 }]).insert).toEqual([
      ante,
    ]);
  });

  it("does not let two sheets' antecedents for one day both land", () => {
    const a = row({
      value: 10.7,
      observedAt: "2026-07-29",
      flags: ["antecedent"],
    });
    expect(planInsert([], [a, { ...a }], []).insert).toHaveLength(1);
  });

  it("dedupes inside one batch, keeping the row with a range (42E)", () => {
    const bare = row({ refLow: null, refHigh: null });
    const plan = planInsert([bare, row({ value: 8.200001 })], [], []);
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0]).toMatchObject({ refLow: 10, refHigh: 291 });
    expect(plan.skipped).toBe(1);
  });

  it("reads a value within 1e-4 as the same number (42E)", () => {
    // 8.2 stored through a `real` column comes back as 8.199999809265137
    const plan = planInsert(
      [row()],
      [],
      [stored("a", { value: 8.199999809265137 })],
    );
    expect(plan.insert).toHaveLength(0);
    expect(
      planInsert([row({ value: 8.21 })], [], [stored("a")]).insert,
    ).toHaveLength(1);
  });

  it("gives a range-less stored twin the fresh row's range (42E)", () => {
    const plan = planInsert(
      [row()],
      [],
      [stored("a", { refLow: null, refHigh: null })],
    );
    expect(plan.insert).toHaveLength(0);
    expect(plan.ranges).toEqual([{ id: "a", refLow: 10, refHigh: 291 }]);
    // a twin that already has one is left alone
    expect(
      planInsert([row()], [], [stored("a", { refLow: 13, refHigh: 150 })])
        .ranges,
    ).toEqual([]);
  });
});

describe("sameReport", () => {
  const fresh = [
    row(),
    row({ metricCode: "iron", value: 74 }),
    row({ metricCode: "tsh", value: 1.995 }),
    row({ metricCode: "lh", value: 2.89 }),
    row({ metricCode: "estrone", value: 16.3 }),
  ];

  it("knows the partial report by its number in the old upload's text", () => {
    expect(
      sameReport(
        {
          rawText: "Buletin de analize 26818E0252 din 18.08.2026",
          rows: [stored("a", { value: 99 })],
        },
        { reportNo: "26818E0252", day: "2026-08-18", rows: fresh },
      ),
    ).toBe(true);
  });

  it("ignores a report number too short to be one", () => {
    expect(
      sameReport(
        { rawText: "page 1", rows: [stored("a", { value: 99 })] },
        { reportNo: "1", day: "2026-08-18", rows: fresh },
      ),
    ).toBe(false);
  });

  it("knows it by 80 % identical rows on the same collection day", () => {
    const old = fresh.slice(0, 4).map((r, i) => stored(`o${i}`, r));
    expect(sameReport({ rows: old }, { day: "2026-08-18", rows: fresh })).toBe(
      true,
    );
    const half = [
      ...old.slice(0, 2),
      stored("x", { metricCode: "zinc", value: 1 }),
      stored("y", { metricCode: "b12", value: 2 }),
    ];
    expect(sameReport({ rows: half }, { day: "2026-08-18", rows: fresh })).toBe(
      false,
    );
  });

  it("never matches on another day or on antecedent rows", () => {
    const old = fresh.map((r, i) =>
      stored(`o${i}`, { ...r, flags: ["antecedent"] }),
    );
    expect(sameReport({ rows: old }, { day: "2026-08-18", rows: fresh })).toBe(
      false,
    );
    expect(
      sameReport(
        { rows: fresh.map((r, i) => stored(`o${i}`, r)) },
        { day: "2026-04-23", rows: fresh },
      ),
    ).toBe(false);
  });
});

describe("planSupersede", () => {
  it("drops what the newer upload repeats and hands over what only the older had", () => {
    const plan = planSupersede(
      [
        stored("ferritin"),
        stored("selenium", { metricCode: "selenium", value: 101 }),
      ],
      [row(), row({ metricCode: "estrone", value: 16.3 })],
    );
    expect(plan).toEqual({
      drop: ["ferritin"],
      move: ["selenium"],
      ranges: [],
    });
  });

  it("keeps the older row's range when the newer one has none (42E)", () => {
    const plan = planSupersede(
      [stored("ferritin", { refLow: 10, refHigh: 291 })],
      [row({ refLow: null, refHigh: null })],
    );
    expect(plan.ranges).toEqual([{ index: 0, refLow: 10, refHigh: 291 }]);
    expect(planSupersede([stored("ferritin")], [row()]).ranges).toEqual([]);
  });
});
