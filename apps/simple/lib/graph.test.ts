import { describe, it, expect } from "vitest";
import { EDGES, NODES } from "./graph";
import { VECTORS } from "./vectors";

/** `DERIVED` in lib/data.ts: computed at read time, never stored. */
const DERIVED_CODES = ["homa_ir", "non_hdl_cholesterol"];

/**
 * Codes the metrics table carries that no vector claims. They are nodes
 * because edges need them (free T4 for the thyroid story, cortisol and blood
 * pressure for the lifestyle ones), not because they are worth screening on
 * their own.
 */
const EXTRA_CODES = [
  "total_cholesterol",
  "free_t4",
  "free_t3",
  "anti_thyroglobulin",
  "cortisol",
  "sleep_duration",
  "bp_systolic",
  "bp_diastolic",
  "bmi",
];

const ids = new Set(NODES.map((n) => n.id));
const vectorCodes = new Set(VECTORS.flatMap((v) => v.codes ?? []));
const known = new Set([...vectorCodes, ...DERIVED_CODES, ...EXTRA_CODES]);

describe("nodes", () => {
  it("gives every metric code that has a vector its own node", () => {
    const missing = [...vectorCodes].filter((c) => !ids.has(`metric:${c}`));
    expect(missing).toEqual([]);
  });

  it("has no metric node for a code nobody measures", () => {
    const unknown = NODES.filter((n) => n.kind === "metric").flatMap((n) =>
      (n.codes ?? []).filter((c) => !known.has(c)),
    );
    expect(unknown).toEqual([]);
  });

  it("has no duplicate node ids", () => {
    expect(ids.size).toBe(NODES.length);
  });
});

describe("edges", () => {
  it("only references node ids that exist", () => {
    const dangling = EDGES.filter(
      (e) => !ids.has(e.from) || !ids.has(e.to),
    ).map((e) => e.id);
    expect(dangling).toEqual([]);
  });

  it("has no duplicate edge ids", () => {
    const seen = new Set<string>();
    const dupes = EDGES.filter((e) =>
      seen.has(e.id) ? true : (seen.add(e.id), false),
    ).map((e) => e.id);
    expect(dupes).toEqual([]);
  });

  it("carries a mechanism and at least one evidence item everywhere", () => {
    const thin = EDGES.filter(
      (e) => !e.mechanism.trim() || e.evidence.length < 1,
    ).map((e) => e.id);
    expect(thin).toEqual([]);
  });

  it("never prints an evidence item without a title", () => {
    const untitled = EDGES.flatMap((e) =>
      e.evidence.filter((v) => !v.title?.trim()).map(() => e.id),
    );
    expect(untitled).toEqual([]);
  });

  it("gates every pattern-sourced edge on that pattern", () => {
    const ungated = EDGES.filter(
      (e) => e.source === "pattern" && !e.when?.pattern,
    ).map((e) => e.id);
    expect(ungated).toEqual([]);
  });
});
