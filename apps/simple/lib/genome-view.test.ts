import { describe, expect, it } from "vitest";
import { verdictMark } from "@/components/verdict-card";
import { genomeVerdicts, type ConditionVerdict } from "./genome";
import { GENOME_CATALOG } from "./genome-catalog";
import {
  genomeCounts,
  genomeNotes,
  movedVerdicts,
  orderVerdicts,
  verdictWord,
} from "./genome-view";
import { genomeFinding } from "./explain";

/**
 * Phase 32a item 3, `docs/mockups/v4/genome.html` sections 01, 02 and 03.
 *
 * Every verdict here comes off the real catalogue rows with a real genotype;
 * no multiplier in this file is written by hand.
 */
const row = (id: string) => GENOME_CATALOG.find((r) => r.id === id)!;

const called = (id: string, g: Record<string, string>) => {
  const r = row(id);
  return { row: r, result: r.call(g), absent: [] as string[] };
};

/** The owner's own six condition rows, as they sit in the database today. */
const OWNER = [
  called("apoe", { rs429358: "TT", rs7412: "CT" }),
  called("lpa", { rs10455872: "AA", rs3798220: "TT" }),
  called("hfe", { rs1800562: "GG", rs1799945: "CC" }),
  called("hla_dq", { rs2187668: "CC", rs7454108: "TT", rs660895: "AA" }),
  called("tcf7l2", { rs7903146: "CT" }),
  called("fto", { rs9939609: "AA" }),
];

const verdicts = () =>
  genomeVerdicts(
    OWNER.map((r) => r.row),
    OWNER,
  );

describe("the order the verdict cards are drawn in", () => {
  it("puts what closed a question first, then what moved up, then no change", () => {
    const rank = { down: 0, up: 1, none: 2 };
    const order = orderVerdicts(verdicts()).map((v) => rank[v.direction]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBe(0);
    expect(order[order.length - 1]).toBe(2);
  });

  it("leads with coeliac disease and never with an unchanged condition", () => {
    const ordered = orderVerdicts(verdicts());
    expect(ordered[0]!.conditionId).toBe("coeliac_disease");
    expect(ordered.map((v) => v.conditionId)).toContain("type2_diabetes");
  });

  it("keeps catalogue order inside a group, so one file draws one page", () => {
    const up = orderVerdicts(verdicts())
      .filter((v) => v.direction === "up")
      .map((v) => v.conditionId);
    expect(up).toEqual(["type2_diabetes", "insulin_resistance"]);
  });

  it("changes nothing about the verdicts themselves", () => {
    const before = verdicts();
    expect(orderVerdicts(before)).toHaveLength(before.length);
    expect(new Set(orderVerdicts(before))).toEqual(new Set(before));
  });
});

describe("the state word Home and the card share", () => {
  it("says what the card's side says, for every verdict this file has", () => {
    for (const v of verdicts())
      expect(verdictWord(v).word, v.conditionId).toBe(verdictMark(v));
  });

  it("tones an exclusion as on, a raised prior as border, nothing as none", () => {
    const by = (id: string) => verdicts().find((v) => v.conditionId === id)!;
    expect(verdictWord(by("coeliac_disease"))).toEqual({
      word: "excluded",
      tone: "on",
    });
    expect(verdictWord(by("type2_diabetes")).tone).toBe("border");
    expect(verdictWord(by("ascvd_risk"))).toEqual({
      word: "no change",
      tone: "none",
    });
  });
});

describe("the Home card is three rows, not eleven", () => {
  const upload = { id: "u1", at: "2026-08-28" };
  const card = () => genomeFinding(upload, OWNER, "2026-09-01")!;

  it("keeps only the answers that moved something", () => {
    const moved = movedVerdicts(verdicts());
    expect(moved.map((v) => v.conditionId)).toEqual([
      "coeliac_disease",
      "type2_diabetes",
      "insulin_resistance",
    ]);
    expect(card().lines).toHaveLength(3);
    expect(card().lines.map((l) => l.label)).not.toContain(
      "Atherosclerotic risk",
    );
  });

  it("never lists more than three, however many moved", () => {
    expect(card().lines.length).toBeLessThanOrEqual(3);
  });

  it("names the condition, the gene with its call, and the factor", () => {
    const line = card().lines.find((l) => l.label === "Type 2 diabetes")!;
    expect(line.text).toBe("TCF7L2, CT");
    expect(line.mark).toBe("×1.4");
    expect(line.tone).toBe("border");
  });

  it("links to the genome page, not to the upload", () => {
    expect(card().href).toBe("/blood/genome");
  });

  it("says nothing at all when nothing moved", () => {
    const quiet = [called("apoe", { rs429358: "TT", rs7412: "CT" })];
    expect(genomeFinding(upload, quiet, "2026-09-01")).toBeNull();
  });
});

describe("the rows that are read but never a risk", () => {
  it("are the catalogue rows that point at no condition", () => {
    const notes = genomeNotes();
    expect(notes.map((n) => n.id)).toEqual(
      GENOME_CATALOG.filter((r) => !r.conditions.length).map((r) => r.id),
    );
    expect(notes.length).toBeGreaterThan(0);
  });

  it("say what they do in the catalogue's own words", () => {
    for (const n of genomeNotes()) {
      const source = row(n.id).effect;
      expect(source.startsWith(n.says)).toBe(true);
      expect(n.says).not.toMatch(/risk of|likelihood ratio|×\d/);
    }
  });
});

describe("the counts the empty state prints", () => {
  it("counts the catalogue rather than remembering a number", () => {
    const c = genomeCounts();
    expect(c.genes).toBe(GENOME_CATALOG.length);
    expect(c.rsids).toBe(new Set(GENOME_CATALOG.flatMap((r) => r.rsids)).size);
    expect(c.conditions + genomeNotes().length).toBe(c.genes);
  });
});

/** A verdict list the ordering has to survive, whatever it is handed. */
describe("orderVerdicts on an empty list", () => {
  it("returns an empty list", () => {
    expect(orderVerdicts([] as ConditionVerdict[])).toEqual([]);
  });
});
