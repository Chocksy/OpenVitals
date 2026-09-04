import { describe, it, expect } from "vitest";
import { INTERVENTIONS, interventionRows } from "./hkb-interventions";
import { CATALOG } from "./hkb-catalog";
import { catalogRows } from "./hkb-seed";
import { pickActions, type InterventionLine } from "./actions";
import { MAX_CHANGE, durationWeeks, parseEffect } from "./projection";
import { overCeiling } from "./vectors";
import { baseGrade, type Finding } from "./research";

const CONDITIONS = new Set(CATALOG.map((h) => h.id));
const FEATURES = new Set(catalogRows(CATALOG).features.map((f) => f.id));

/** "metric:ldl_cholesterol" → "ldl_cholesterol". */
const codeOf = (id: string) => id.replace(/^(metric|derived):/, "");

describe("INTERVENTIONS", () => {
  it("covers every catalog condition with at least three rows", () => {
    const byCondition = new Map<string, number>();
    for (const r of INTERVENTIONS)
      byCondition.set(r.conditionId, (byCondition.get(r.conditionId) ?? 0) + 1);
    const short = [...CONDITIONS].filter(
      (id) => (byCondition.get(id) ?? 0) < 3,
    );
    expect(short).toEqual([]);
  });

  it("files every row under a condition the catalog has", () => {
    const strays = INTERVENTIONS.filter((r) => !CONDITIONS.has(r.conditionId));
    expect(strays.map((r) => r.conditionId)).toEqual([]);
  });

  it("names an outcome the catalog mints, or none at all", () => {
    const strays = INTERVENTIONS.filter(
      (r) => r.outcomeFeatureId != null && !FEATURES.has(r.outcomeFeatureId),
    );
    expect(strays.map((r) => `${r.name} → ${r.outcomeFeatureId}`)).toEqual([]);
  });

  it("gives every projectable marker an absolute effect a projection can read", () => {
    const bad: string[] = [];
    for (const r of INTERVENTIONS) {
      if (!r.outcomeFeatureId) continue;
      const cap = MAX_CHANGE[codeOf(r.outcomeFeatureId)];
      if (cap == null) continue;
      const value = parseEffect(r.effect, r.direction);
      if (value == null) {
        bad.push(`${r.name}: "${r.effect}" does not parse`);
        continue;
      }
      if (r.direction === "down" && value > 0)
        bad.push(`${r.name}: down but ${value}`);
      if (r.direction === "up" && value < 0)
        bad.push(`${r.name}: up but ${value}`);
      const weeks = durationWeeks(r.duration);
      if ((weeks == null || weeks <= 12) && Math.abs(value) > cap)
        bad.push(`${r.name}: |${value}| over the ${cap} cap in twelve weeks`);
    }
    expect(bad).toEqual([]);
  });

  it("keeps every dose under the ceilings", () => {
    const over = INTERVENTIONS.filter((r) =>
      overCeiling({
        title: r.name,
        dose: r.dose ? { amount: r.dose } : undefined,
      }),
    );
    expect(over.map((r) => `${r.name} · ${r.dose}`)).toEqual([]);
  });

  it("grades every row the way baseGrade would", () => {
    const wrong = INTERVENTIONS.filter(
      (r) =>
        !["A", "B"].includes(r.grade) ||
        r.grade !== baseGrade({ studyType: r.studyType } as Finding),
    );
    expect(wrong.map((r) => `${r.name}: ${r.studyType} → ${r.grade}`)).toEqual(
      [],
    );
  });

  it("cites a well-formed DOI on every row", () => {
    const bad = INTERVENTIONS.filter(
      (r) => !/^10\.\d{4,9}\/\S+$/.test(r.paper.doi),
    );
    expect(bad.map((r) => r.paper.doi)).toEqual([]);
  });

  it("writes a population and a quote on every row", () => {
    const bare = INTERVENTIONS.filter(
      (r) => !r.population.trim() || r.quote.trim().length < 20,
    );
    expect(bare.map((r) => r.name)).toEqual([]);
  });
});

describe("interventionRows", () => {
  const rows = interventionRows();

  it("mints one accepted, seeded row per entry", () => {
    expect(rows).toHaveLength(INTERVENTIONS.length);
    expect(rows.every((r) => r.status === "accepted")).toBe(true);
    expect(rows.every((r) => r.source === "seed")).toBe(true);
  });

  it("keeps ids unique, prefixed and inside the column", () => {
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.length > 120)).toEqual([]);
    expect(ids.filter((id) => !id.startsWith("seed_"))).toEqual([]);
  });

  it("carries the paper with a doi.org url and the quote", () => {
    const row = rows.find((r) => r.name === "Ezetimibe added to a statin")!;
    expect(row.paper.url).toBe("https://doi.org/10.1056/NEJMoa1410489");
    expect(row.paper.quote).toBe(row.quote);
    expect(row.caution).toBe("Prescription only.");
    expect(row.kind).toBe("drug");
  });

  it("is pure: two calls agree", () => {
    expect(interventionRows()).toEqual(rows);
  });
});

describe("pickActions with the seeded LDL ladder", () => {
  const lines: InterventionLine[] = interventionRows()
    .filter((r) => r.conditionId === "ascvd_risk")
    .map((r) => ({
      id: r.id,
      conditionId: r.conditionId,
      name: r.name,
      dose: r.dose,
      duration: r.duration,
      effect: r.effect,
      direction: r.direction,
      outcomeFeatureId: r.outcomeFeatureId,
      grade: r.grade,
      source: r.source,
    }));

  const picked = pickActions({
    codes: ["ldl_cholesterol"],
    actions: [],
    interventions: lines,
    limit: 20,
  });

  it("offers the statin and the ezetimibe lines from the papers", () => {
    const statin = picked.find((p) => p.title === "High-intensity statin");
    const ezetimibe = picked.find(
      (p) => p.title === "Ezetimibe added to a statin",
    );
    expect(statin?.source).toBe("papers");
    expect(ezetimibe?.source).toBe("papers");
    expect(statin?.dose).toBe(
      "atorvastatin 40-80 mg/day or rosuvastatin 20-40 mg/day",
    );
    expect(ezetimibe?.dose).toBe("10 mg/day");
  });

  it("puts the guideline-graded rows first and says so", () => {
    expect(picked[0]!.grade).toBe("A");
    expect(picked[0]!.label).toBe("[science, A, guideline]");
    const ezetimibe = picked.find(
      (p) => p.title === "Ezetimibe added to a statin",
    );
    expect(ezetimibe!.label).toBe("[science, B, trial]");
  });
});
