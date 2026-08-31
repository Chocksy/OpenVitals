import { describe, it, expect } from "vitest";
import { catalogRows, testId } from "./hkb-seed";
import { loadCatalog, rowsToCatalog } from "./hkb";
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
