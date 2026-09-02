import { describe, expect, it } from "vitest";
import {
  BUBBLE_LIMIT,
  buildBubbles,
  labelBoxes,
  labelText,
  labelWidth,
  layout,
  placeLabels,
  radiusOf,
  RULED_OUT,
  STAGE,
  viewBoxOf,
  type Body,
  type Bubble,
} from "./bubbles";
import type { LatestValue, ModelInput } from "./coverage";
import { computeGraphState } from "./graph-state";
import { HYPOTHESES, scoreHypotheses } from "./hypotheses";
import { nextMoves } from "./infogain";
import { CODE_GRAPH } from "./kg";

const value = (v: number, extra: Partial<LatestValue> = {}): LatestValue => ({
  value: v,
  unit: null,
  date: "2026-08-01",
  status: "green",
  optimalLow: null,
  optimalHigh: null,
  refLow: null,
  refHigh: null,
  ...extra,
});

const input = (over: Partial<ModelInput> = {}): ModelInput => ({
  today: "2026-08-27",
  profile: { sex: "female" },
  latest: {},
  derived: {},
  sex: "female",
  age: 34,
  ...over,
});

/**
 * The mockup's second persona in this person's own numbers: one €40 panel,
 * ferritin on the floor, TSH borderline, everything else fine.
 *
 * A factory, not a constant: `applyPatternTargets` rewrites `latest` in place
 * on the way through the engine, so a shared fixture would not be the same
 * person the second time it was scored.
 */
const panel = () =>
  input({
    latest: {
      ferritin: value(8, { status: "red", optimalLow: 40, refLow: 15 }),
      haemoglobin: value(13.1, { status: "green", refLow: 12 }),
      tsh: value(3.8, { status: "amber", optimalHigh: 2.5, refHigh: 4.5 }),
      hs_crp: value(0.6, { status: "green", optimalHigh: 1 }),
      triglycerides: value(0.9, { status: "green", optimalHigh: 1.1 }),
      glucose: value(4.8, { status: "green", optimalHigh: 5.4 }),
    },
    profile: { sex: "female", periods_heavy: "Yes", sym_tired: "Yes" },
  });

const build = (m: ModelInput, showRuledOut = false) =>
  buildBubbles({
    graph: CODE_GRAPH,
    state: computeGraphState(m, { graph: CODE_GRAPH }),
    m,
    beliefs: scoreHypotheses(m, { catalog: HYPOTHESES }),
    moves: nextMoves(m, HYPOTHESES),
    lens: "lifespan",
    matched: new Set(),
    showRuledOut,
  });

const bodies = (n: number): Body[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    imp: (i % 7) / 7,
    r: radiusOf((i % 7) / 7),
    x: 0,
    y: 0,
  }));

describe("layout", () => {
  it("puts the same input in the same place, every time", () => {
    const links = [
      { from: "n0", to: "n3", on: true },
      { from: "n1", to: "n3", on: false },
      { from: "n2", to: "n5", on: null },
    ];
    const a = bodies(14);
    const b = bodies(14);
    layout(a, links);
    layout(b, links);
    expect(a.map((n) => [n.x, n.y])).toEqual(b.map((n) => [n.x, n.y]));
    // and it is a picture, not a pile at the origin
    expect(new Set(a.map((n) => `${n.x},${n.y}`)).size).toBe(a.length);
  });

  it("leaves no two circles overlapping", () => {
    const all = bodies(24);
    layout(all, []);
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
      }
  });

  it("keeps the heaviest bubble nearest the middle", () => {
    const all = bodies(20);
    layout(all, []);
    const from = (b: Body) => Math.hypot(b.x - STAGE.w / 2, b.y - STAGE.h / 2);
    const heaviest = [...all].sort((a, b) => b.imp - a.imp)[0]!;
    const lightest = [...all].sort((a, b) => a.imp - b.imp)[0]!;
    expect(from(heaviest)).toBeLessThan(from(lightest));
  });

  it("does nothing to an empty stage", () => {
    expect(() => layout([], [])).not.toThrow();
    expect(viewBoxOf([])).toBe(`0 0 ${STAGE.w} ${STAGE.h}`);
  });
});

describe("the picture", () => {
  const drawn = build(panel());

  it("draws a bounded number of bubbles, and never a system", () => {
    expect(drawn.nodes.length).toBeGreaterThan(8);
    expect(drawn.nodes.length).toBeLessThanOrEqual(BUBBLE_LIMIT + 8);
    expect(drawn.nodes.some((n) => n.id.startsWith("system:"))).toBe(false);
  });

  it("colours the ferritin on the floor red and carries its reading", () => {
    const ferritin = drawn.nodes.find((n) => n.code === "ferritin")!;
    expect(ferritin.st).toBe("high");
    expect(ferritin.kind).toBe("marker");
    expect(ferritin.value).toBe("8");
  });

  it("gives the conditions the engine scores a bubble and a probability", () => {
    const conditions = drawn.nodes.filter((n) => n.belief);
    expect(conditions.length).toBeGreaterThan(0);
    expect(conditions.every((c) => c.kind === "cond")).toBe(true);
    const iron = drawn.beliefs.find((b) => b.id === "iron_deficiency")!;
    expect(iron.p).toBeGreaterThan(0.5);
    expect(iron.for.length).toBeGreaterThan(0);
    expect(drawn.nodes.some((n) => n.belief === "iron_deficiency")).toBe(true);
  });

  it("never draws a condition the engine ruled out unless asked", () => {
    expect(drawn.beliefs.every((b) => b.p >= RULED_OUT)).toBe(true);
    const shown = build(panel(), true);
    expect(shown.beliefs.length).toBeGreaterThanOrEqual(drawn.beliefs.length);
  });

  it("only draws an edge when both of its ends are on the stage", () => {
    const ids = new Set(drawn.nodes.map((n) => n.id));
    for (const link of drawn.links) {
      expect(ids.has(link.from)).toBe(true);
      expect(ids.has(link.to)).toBe(true);
    }
  });

  it("says how many bubbles are known and how many edges are yours", () => {
    expect(drawn.hint).toMatch(/of \d+ bubbles known/);
    expect(drawn.hint).toMatch(/edges active for you/);
  });

  it("draws the same picture twice for the same person", () => {
    const again = build(panel());
    expect(again.nodes.map((n) => [n.id, n.x, n.y, n.r])).toEqual(
      drawn.nodes.map((n) => [n.id, n.x, n.y, n.r]),
    );
    expect(viewBoxOf(again.nodes)).toBe(viewBoxOf(drawn.nodes));
  });

  it("still draws something for a person with no data at all", () => {
    const empty = build(input());
    expect(empty.nodes.length).toBeGreaterThan(8);
    expect(empty.nodes.every((n) => n.r >= 10)).toBe(true);
    expect(empty.links.every((l) => l.on !== undefined)).toBe(true);
  });
});

/**
 * Phase 26 item 10. Tapping the CAC score bubble opened a panel that said
 * "Nothing drawn here pushes it / follows from it" and stopped: the one thing
 * a person wants from an unmeasured test is what having it done would settle.
 */
describe("test bubbles", () => {
  const drawn = build(panel());
  const tests = drawn.nodes.filter((n) => n.kind === "test");

  it("draws no test that is neither worth doing nor tied to a condition", () => {
    expect(tests.length).toBeGreaterThan(0);
    for (const t of tests) {
      const linked = drawn.links.some((l) => l.from === t.id || l.to === t.id);
      expect(!!t.settles?.length || linked).toBe(true);
    }
  });

  it("says what a worth-doing test would settle, and for how much", () => {
    const settling = tests.filter((t) => t.settles?.length);
    expect(settling.length).toBeGreaterThan(0);
    for (const t of settling) {
      expect(typeof t.cost).toBe("number");
      for (const row of t.settles!) {
        expect(row.name).not.toBe("");
        expect(row.from).toBeGreaterThanOrEqual(0);
        expect(row.outcomes.length).toBeGreaterThan(0);
        for (const o of row.outcomes) {
          expect(o.label).not.toBe("");
          expect(o.to).toBeGreaterThanOrEqual(0);
          expect(o.to).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("names a real condition in every row it settles", () => {
    const ids = new Set(drawn.beliefs.map((b) => b.id));
    for (const t of tests)
      for (const row of t.settles ?? []) expect(ids.has(row.id)).toBe(true);
  });
});

/* ── labels ───────────────────────────────────────────────────────────── */

/**
 * The lock on phase 30e's second graph fix.
 *
 * The stage draws 29 bubbles on a layout that is fixed on purpose, and the
 * names ran into each other: "Coronary calcium score" across "Home sleep
 * study", "Insulin resistance" across "Fatty liver". `placeLabels` tries four
 * slots per bubble and drops the label when none is free. Two labels may
 * never overlap, and a label may never land on a bubble.
 */
describe("label placement", () => {
  const stage = build(panel()).nodes;

  it("draws a real stage to place labels on", () => {
    expect(stage.length).toBeGreaterThan(8);
  });

  it("never overlaps two labels", () => {
    const boxes = labelBoxes(stage);
    expect(boxes.length).toBeGreaterThan(0);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const hit =
          a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        expect(hit).toBe(false);
      }
  });

  it("never lands a label on a bubble", () => {
    for (const n of placeLabels(stage)) {
      if (!n.label) continue;
      const w = labelWidth(n.label);
      const box = {
        x0: n.anchor === "start" ? n.lx! : n.anchor === "end" ? n.lx! - w : n.lx! - w / 2,
        x1: 0,
        y0: n.ly! - 14,
        y1: n.ly! + 4,
      };
      box.x1 = box.x0 + w;
      for (const o of stage) {
        if (o.id === n.id) continue;
        const x = Math.min(Math.max(o.x, box.x0), box.x1);
        const y = Math.min(Math.max(o.y, box.y0), box.y1);
        expect(Math.hypot(o.x - x, o.y - y)).toBeGreaterThanOrEqual(o.r - 1);
      }
    }
  });

  it("leaves the geometry alone", () => {
    const placed = placeLabels(stage);
    expect(placed.map((n) => [n.id, n.x, n.y, n.r])).toEqual(
      stage.map((n) => [n.id, n.x, n.y, n.r]),
    );
  });

  it("places most of them, and says so when it cannot", () => {
    const placed = placeLabels(stage);
    const named = placed.filter((n) => n.label);
    expect(named.length / placed.length).toBeGreaterThan(0.5);
    for (const n of placed) {
      if (n.label) continue;
      // a bubble with no label still knows its own name for the panel
      expect(n.name).not.toBe("");
    }
  });

  it("cuts a name rather than letting one node own the stage", () => {
    expect(labelText("Cardiovascular risk")).toBe("Cardiovascular risk");
    expect(labelText("Coronary artery calcium score")).toBe(
      "Coronary artery calci…",
    );
    expect(labelWidth("abc")).toBeCloseTo(3 * (6.2 / 11) * 14, 5);
  });

  it("is the same picture twice", () => {
    const a = placeLabels(stage).map((n) => [n.id, n.label, n.lx, n.ly]);
    const b = placeLabels(stage).map((n) => [n.id, n.label, n.lx, n.ly]);
    expect(a).toEqual(b);
  });

  it("uses the slot order below, above, right, left", () => {
    const one: Bubble[] = [
      { ...stage[0]!, id: "solo", name: "Solo", x: 0, y: 0, r: 20 },
    ];
    const [placed] = placeLabels(one);
    expect(placed!.anchor).toBe("middle");
    expect(placed!.ly!).toBeGreaterThan(20);
  });
});
