import { describe, it, expect } from "vitest";
import { catalogRows, testId } from "./hkb-seed";
import {
  dependencyCycles,
  dependencyNeeds,
  loadCatalog,
  modifierOf,
  rowsToCatalog,
} from "./hkb";
import { CATALOG } from "./hkb-catalog";
import { shrunk } from "./hkb-pool";
import {
  correlationGroupOf,
  HYPOTHESES,
  type EvidenceRule,
  type Hypothesis,
} from "./hypotheses";

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Rows carry no order, so both sides are sorted before they are compared.
 * `rule` folds the grade shrink into the in-code rule and the pooled papers
 * out of the rebuilt one, because the database catalog carries its shrink in
 * the number and the in-code one carries it in `effectiveLr`.
 */
const normalise = (
  catalog: Hypothesis[],
  rule: (e: EvidenceRule) => EvidenceRule,
) =>
  [...catalog]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((h) => ({
      ...h,
      evidence: [...h.evidence]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(rule),
      discriminators: [...h.discriminators].sort((a, b) =>
        a.test.localeCompare(b.test),
      ),
      priors: {
        ...h.priors,
        modifiers: [...h.priors.modifiers].sort((a, b) =>
          a.why.localeCompare(b.why),
        ),
      },
    }));

/**
 * The in-code rule as the database would serve it: shrunk, no papers, and
 * carrying the correlation group the seed derives from its input.
 */
const asPooled = (e: EvidenceRule): EvidenceRule => ({
  ...e,
  lr: round2(shrunk(e.lr, e.grade)),
  lrNeg: e.lrNeg == null ? undefined : round2(shrunk(e.lrNeg, e.grade)),
  correlationGroup: e.correlationGroup ?? correlationGroupOf(e.input),
});

const withoutSources = ({ sources: _s, ...e }: EvidenceRule): EvidenceRule => e;

describe("catalogRows", () => {
  const rows = catalogRows();

  it("writes one row per condition, prior and evidence rule", () => {
    expect(rows.conditions).toHaveLength(HYPOTHESES.length);
    expect(rows.priors).toHaveLength(HYPOTHESES.length);
    expect(rows.evidence).toHaveLength(
      HYPOTHESES.flatMap((h) => h.evidence).length,
    );
    expect(rows.links).toHaveLength(
      HYPOTHESES.flatMap((h) => h.discriminators).length,
    );
  });

  it("gives every rule and modifier a feature that exists", () => {
    const ids = new Set(rows.features.map((f) => f.id));
    for (const e of rows.evidence) expect(ids.has(e.featureId)).toBe(true);
    for (const m of rows.modifiers) expect(ids.has(m.featureId)).toBe(true);
    for (const t of rows.tests)
      for (const code of t.featureIds)
        expect(ids.has(`metric:${code}`)).toBe(true);
  });

  it("reads the sex modifier as an answer about sex", () => {
    const hashi = rows.modifiers.find(
      (m) => m.conditionId === "hashimoto" && m.featureId === "fact:sex",
    )!;
    expect(hashi.conditionOn).toEqual({ sex: "female" });
    expect(hashi.times).toBe(5);
    expect(hashi.grade).toBe("A");
  });

  it("keys a test on its name", () => {
    expect(testId("OGTT with insulin")).toBe("ogtt_with_insulin");
    expect(rows.tests.find((t) => t.id === "ferritin")?.typicalPos).toEqual({
      ferritin: 12,
    });
  });
});

describe("rowsToCatalog", () => {
  it("round-trips the whole in-code catalog", () => {
    expect(normalise(rowsToCatalog(catalogRows()), withoutSources)).toEqual(
      normalise(HYPOTHESES, asPooled),
    );
  });

  it("keeps every paper behind a pooled rule", () => {
    const rebuilt = rowsToCatalog(catalogRows());
    for (const h of rebuilt)
      for (const e of h.evidence) {
        expect(e.sources).toHaveLength(1);
        expect(e.sources![0]!.id).toBe(e.id);
      }
  });

  it("scores a rebuilt catalog exactly like the in-code one", async () => {
    const { scoreHypotheses } = await import("./hypotheses");
    const m = {
      today: "2026-08-27",
      profile: { waist_cm: "104", height_cm: "180" },
      sex: "male" as const,
      age: 45,
      latest: {},
      derived: { homaIr: 4.9, tgHdl: 3.1 },
    };
    const fromRows = scoreHypotheses(m, {
      catalog: rowsToCatalog(catalogRows()),
    });
    expect(fromRows.map((h) => [h.id, h.score])).toEqual(
      scoreHypotheses(m).map((h) => [h.id, h.score]),
    );
  });

  it("scores a condition that reads another one after it", () => {
    const order = rowsToCatalog(catalogRows()).map((h) => h.id);
    expect(order.indexOf("iron_deficiency")).toBeLessThan(
      order.indexOf("iron_deficiency_cause_gi"),
    );
    expect(order.indexOf("insulin_resistance")).toBeLessThan(
      order.indexOf("nafld"),
    );
  });
});

describe("dependency order (phase 41B)", () => {
  it("has no cycle through requires, evidence or modifiers", () => {
    const rows = catalogRows(CATALOG);
    expect(
      dependencyCycles(
        dependencyNeeds(rows.conditions, rows.evidence, rows.modifiers),
      ),
    ).toEqual([]);
  });

  it("names a cycle when there is one", () => {
    const needs = new Map([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])],
    ]);
    expect(dependencyCycles(needs)).toHaveLength(1);
  });

  it("fires a hypothesis modifier on an alphabetically earlier condition", async () => {
    const { scoreHypotheses } = await import("./hypotheses");
    const catalog = rowsToCatalog(catalogRows(CATALOG));
    const order = catalog.map((h) => h.id);
    expect(order.indexOf("hashimoto")).toBeLessThan(
      order.indexOf("atrophic_gastritis"),
    );
    // No printed range on the antibody, so only `hypothesis: hashimoto` can fire.
    const at = (tpo: number) => ({
      today: "2026-08-27",
      profile: {},
      sex: "female" as const,
      age: 45,
      latest: {
        tpo_antibodies: {
          value: tpo,
          unit: null,
          date: "2026-08-01",
          status: "red" as const,
          optimalLow: null,
          optimalHigh: null,
          refLow: null,
          refHigh: null,
        },
      },
      derived: {},
    });
    const prior = (tpo: number) =>
      scoreHypotheses(at(tpo), { catalog }).find(
        (h) => h.id === "atrophic_gastritis",
      )?.prior;
    const hashimoto = scoreHypotheses(at(400), { catalog }).find(
      (h) => h.id === "hashimoto",
    )!.score;
    expect(hashimoto).toBeGreaterThan(0.4);
    expect(prior(400)).toBeCloseTo(prior(5)! * 3, 5);
  });
});

describe("loadCatalog", () => {
  it("falls back to the in-code catalog with no database", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(await loadCatalog()).toBe(HYPOTHESES);
    } finally {
      if (saved != null) process.env.DATABASE_URL = saved;
    }
  });
});

describe("modifierOf", () => {
  const row = {
    featureId: "hypothesis:iron_deficiency",
    times: 6,
    why: "hypothesis:iron_deficiency (C; cause of iron_deficiency)",
    grade: "C",
    source: "Annibale 2001; doi:10.1/x",
  };
  it("leaves a row without a share as a plain multiplier", () => {
    const m = modifierOf({ ...row, conditionOn: { above: 0.5 } });
    expect(m).toEqual({
      when: { hypothesis: "iron_deficiency", above: 0.5 },
      times: 6,
      why: row.why,
    });
  });
  it("reads the share, population and exclusion out of condition_on", () => {
    const m = modifierOf({
      ...row,
      conditionOn: {
        above: 0.5,
        share: 0.268,
        population: "patients without gastrointestinal symptoms",
        unless: [{ fact: "sym_bowel", includes: "yes" }],
      },
    });
    expect(m.when).toEqual({ hypothesis: "iron_deficiency", above: 0.5 });
    expect(m).toMatchObject({
      share: 0.268,
      grade: "C",
      source: row.source,
      population: "patients without gastrointestinal symptoms",
      unless: [{ fact: "sym_bowel", includes: "yes" }],
    });
  });
});
