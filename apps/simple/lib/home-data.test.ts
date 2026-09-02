import { describe, expect, it } from "vitest";
import { railCards, systemTiles } from "./home-data";
import type { Ledger } from "./ledger";
import type { Today } from "./home-data";

/**
 * The lock on the rail's order (phase 28c).
 *
 * Status, Body, Blood, Plan, then one card per system that has a reading —
 * red first, then amber, then green, ties broken by score, worst first. The
 * order is the page's whole information hierarchy, so it is checked, not
 * remembered.
 */
const ledger = {
  bioAge: { pheno: 41.2, chrono: 43, inputs: ["alp", "crp"] },
  bioAgeMissing: [],
  counters: {
    optimal: 12,
    normal: 7,
    off: 3,
    questions: 4,
    nextDrawWeeks: 12,
    nextDrawCodes: ["apo_b"],
  },
  systems: [
    {
      id: "heart",
      name: "Heart",
      score: 0.1,
      worst: { code: "ldl_cholesterol", value: 141, unit: "mg/dL", status: "green" },
    },
    {
      id: "liver",
      name: "Liver",
      score: 0.4,
      worst: { code: "alp", value: 128, unit: "U/L", status: "red" },
    },
    { id: "thyroid", name: "Thyroid", score: 0, worst: undefined },
    {
      id: "kidney",
      name: "Kidney",
      score: 0.9,
      worst: { code: "egfr", value: 88, unit: "mL/min/1.73m²", status: "red" },
    },
    {
      id: "sugar",
      name: "Blood sugar",
      score: 0.5,
      worst: { code: "hba1c", value: 5.9, unit: "%", status: "amber" },
    },
  ],
  spear: { id: "ir", title: "Insulin resistance", action: { title: "Walk after dinner" } },
  conclusions: [],
  asks: [],
  quiet: { unlikely: 0, ruledOut: 0, ids: [], rows: [], ruledOutRows: [] },
  improved: [],
  since: { at: "2026-08-31", resolved: 0, new: 2, stronger: 1, weaker: 0 },
} as unknown as Ledger;

const today: Today = {
  due: [
    {
      key: "sym_cold",
      question: "Do you still feel cold when others do not?",
      original: "yes",
      options: ["yes", "no"],
      current: "yes",
    } as never,
  ],
  post: null,
};

describe("railCards", () => {
  const cards = railCards(ledger, today, { todo: 4, actions: 2, drawDate: "2026-08-11" });

  it("prints Status, Body, Blood, Plan, then the systems", () => {
    expect(cards.map((c) => c.kind)).toEqual([
      "status",
      "body",
      "blood",
      "plan",
      "system",
      "system",
      "system",
      "system",
    ]);
  });

  it("sorts the systems red, then amber, then green, worst score first", () => {
    expect(cards.filter((c) => c.kind === "system").map((c) => c.label)).toEqual(
      ["Kidney", "Liver", "Blood sugar", "Heart"],
    );
  });

  it("leaves a system with no reading to the chips", () => {
    expect(cards.some((c) => c.label === "Thyroid")).toBe(false);
  });

  it("takes every number off the ledger", () => {
    expect(cards[0]!.counts).toEqual([
      { n: 3, word: "off", tone: "bad" },
      { n: 7, word: "borderline", tone: "warn" },
      { n: 12, word: "optimal", tone: "ok" },
    ]);
    expect(cards[0]!.line).toBe("2 new, 1 stronger since Aug 31");
    expect(cards[1]!.headline).toBe("41.2");
    expect(cards[1]!.sub).toBe("at 43");
    expect(cards[2]!.headline).toBe("3");
    expect(cards[2]!.sub).toBe("/ 22 markers");
    expect(cards[3]!.headline).toBe("Walk after dinner");
    expect(cards[3]!.line).toBe("4 to do");
  });

  it("says the band the whole page is coloured by", () => {
    expect(cards[0]!.tone).toBe("bad");
  });

  it("drops the Plan card when there is no spear and no action", () => {
    const bare = railCards(
      { ...ledger, spear: undefined } as Ledger,
      { due: [], post: null },
      {},
    );
    expect(bare.map((c) => c.kind)).not.toContain("plan");
    expect(bare[1]!.line).toBe("Nothing due today");
  });
});


/**
 * The lock on phase 30d, UX note 10.
 *
 * The twelve systems used to be drawn twice above 768 px — as rail cards and
 * again as chips — while Status spanned an empty second row. The rail keeps
 * its system cards for the phone; the tiles are the desktop section, and they
 * print every system, measured or not, worst first and never measured last.
 */
describe("systemTiles", () => {
  const tiles = systemTiles(ledger.systems);

  it("prints every system, measured or not", () => {
    expect(tiles).toHaveLength(ledger.systems.length);
    expect(tiles.map((t) => t.name)).toContain("Thyroid");
  });

  it("puts off first, then borderline, then good, never measured last", () => {
    expect(tiles.map((t) => t.name)).toEqual([
      "Kidney",
      "Liver",
      "Blood sugar",
      "Heart",
      "Thyroid",
    ]);
  });

  it("says what a system with no reading is, and links somewhere real", () => {
    const none = tiles.at(-1)!;
    expect(none.word).toBe("never measured");
    expect(none.tone).toBe("none");
    expect(none.value).toBeUndefined();
    expect(none.href).toBe("/graph");
  });

  it("names the marker in words, never its engine code", () => {
    const liver = tiles.find((t) => t.name === "Liver")!;
    expect(liver.value).toBe("128");
    expect(liver.unit).toBe("U/L");
    expect(liver.markerName).not.toBe("alp");
    expect(liver.href).toBe("/blood/m/alp");
  });

  it("takes the tile's word off the ledger's own status", () => {
    expect(tiles.find((t) => t.name === "Kidney")!.word).toBe("off");
    expect(tiles.find((t) => t.name === "Blood sugar")!.word).toBe(
      "borderline",
    );
    expect(tiles.find((t) => t.name === "Heart")!.word).toBe("good");
  });
});
