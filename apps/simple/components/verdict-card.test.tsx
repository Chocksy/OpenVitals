import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GENOME_CATALOG } from "@/lib/genome-catalog";
import { genomeVerdicts, type ConditionVerdict } from "@/lib/genome";
import { VerdictCard, verdictHead, verdictMark } from "./verdict-card";

/**
 * Phase 32a item 3, `docs/mockups/v4/genome.html` section 01. Every verdict on
 * this page comes off the real catalogue rows; nothing here is a hand-written
 * multiplier.
 */
const row = (id: string) => GENOME_CATALOG.find((r) => r.id === id)!;

const verdict = (id: string, g: Record<string, string>, conditionId: string) => {
  const r = row(id);
  return genomeVerdicts([r], [{ row: r, result: r.call(g), absent: [] }]).find(
    (v) => v.conditionId === conditionId,
  )!;
};

const t2d = verdict("tcf7l2", { rs7903146: "CT" }, "type2_diabetes");
const coeliac = verdict(
  "hla_dq",
  { rs2187668: "CC", rs7454108: "TT", rs660895: "AA" },
  "coeliac_disease",
);
const apoe = verdict("apoe", { rs429358: "TT", rs7412: "CT" }, "ascvd_risk");

const html = (v: ConditionVerdict) =>
  renderToStaticMarkup(createElement(VerdictCard, { v }));

describe("the answer in the heading", () => {
  it("says the multiplier for a raised starting point", () => {
    expect(verdictHead(t2d)).toBe("the starting odds ×1.4");
    expect(verdictMark(t2d)).toBe("×1.4");
  });

  it("says excluded only for an absence", () => {
    expect(verdictHead(coeliac)).toBe("essentially excluded");
    expect(verdictMark(coeliac)).toBe("excluded");
  });

  it("says the genome adds nothing when no rule fired", () => {
    expect(verdictHead(apoe)).toBe("the genome adds nothing");
    expect(verdictMark(apoe)).toBe("no change");
  });
});

describe("the verdict row binds to the design system's classes", () => {
  it("is border for a raised prior", () => {
    const out = html(t2d);
    expect(out).toContain('class="verdict border"');
    expect(out).toContain('class="vq"');
    expect(out).toContain('class="vsay"');
    expect(out).toContain('class="vside"');
    expect(out).toContain('class="vx"');
    expect(out).toContain("Type 2 diabetes");
  });

  it("is on for an exclusion, and says no test is needed", () => {
    const out = html(coeliac);
    expect(out).toContain('class="verdict on"');
    expect(out).toContain("no test needed");
  });

  it("is none for no change, with the flat mark", () => {
    const out = html(apoe);
    expect(out).toContain('class="verdict none"');
    expect(out).toContain('class="vx flat"');
    expect(out).not.toContain("no test needed");
  });

  it("carries the grade as one chip, not the word science", () => {
    const out = html(t2d);
    expect(out).toContain('class="glyph sci"');
    expect(out).toContain(">A<");
  });

  it("prints the catalogue's own reason and no invented number", () => {
    expect(html(t2d)).toContain(t2d.reason);
  });
});
