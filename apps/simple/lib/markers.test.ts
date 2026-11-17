/**
 * The marker registry guard: every code the knowledge reads is a code in
 * `MARKERS`, and none of them is an old spelling that `MERGES` folds away.
 *
 * Without it a rule can read a code no upload ever produces (`testosterone`
 * while every real reading is `testosterone_total`) and simply never fire,
 * with nothing red anywhere. Pure: no database.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FASTING } from "./coverage";
import { CATALOG } from "./hkb-catalog";
import { INTERVENTIONS } from "./hkb-interventions";
import { CONFOUNDERS, HYPOTHESES } from "./hypotheses";
import { MARKER, MARKERS } from "./markers";
import { MERGES } from "./merge-metrics";
import { BETTER_HIGH, BETTER_LOW } from "./projection";
import { RO } from "./ro-sheet";
import { CLAIM_MARKERS } from "./trends";
import { BOUNDS, DEFAULT_REF_HIGH, SEX_RANGES, VECTORS } from "./vectors";

/** code → where it is read, e.g. "rule pcos/pcos_testosterone". */
const refs = new Map<string, string[]>();
const read = (code: string | undefined, where: string) => {
  if (code && !NOT_MARKERS.has(code))
    refs.set(code, [...(refs.get(code) ?? []), where]);
};
/**
 * Keys that share a code list but are not reading codes: a derived value, a
 * daily-log column, and `urea`, which a unit rule converts although every
 * urea on file is stored as `bun` (open question, so it is not seeded).
 */
const NOT_MARKERS = new Set(["homaIr", "weight_kg", "urea"]);

/** Lab codes a rule compares against a number, so the number needs a unit. */
const numeric = new Set<string>();

for (const h of [...CATALOG, ...HYPOTHESES]) {
  for (const e of h.evidence) {
    read(e.input.metric, `rule ${h.id}/${e.id}`);
    for (const c of e.confoundedBy ?? [])
      read(c, `confoundedBy ${h.id}/${e.id}`);
    if (e.input.metric && (e.when.above != null || e.when.below != null))
      numeric.add(e.input.metric);
  }
  for (const m of h.priors.modifiers) {
    read(m.when.metric, `prior ${h.id}`);
    if (m.when.metric && (m.when.above != null || m.when.below != null))
      numeric.add(m.when.metric);
  }
  for (const d of h.discriminators)
    for (const c of d.codes) read(c, `test ${h.id}/${d.test}`);
}
for (const c of CONFOUNDERS)
  for (const m of c.markers) read(m, `confounder ${c.tag}`);
for (const v of VECTORS)
  for (const c of v.codes ?? []) read(c, `vector ${v.id}`);
for (const k of Object.keys(SEX_RANGES)) read(k, "SEX_RANGES");
for (const k of Object.keys(BOUNDS)) read(k, "BOUNDS");
for (const k of Object.keys(DEFAULT_REF_HIGH)) read(k, "DEFAULT_REF_HIGH");
for (const k of FASTING) read(k, "FASTING");
for (const k of Object.keys(RO)) read(k, "RO");
for (const i of INTERVENTIONS)
  if (i.outcomeFeatureId?.startsWith("metric:"))
    read(i.outcomeFeatureId.slice("metric:".length), `intervention ${i.name}`);

for (const c of [...BETTER_HIGH, ...BETTER_LOW]) read(c, "BETTER_HIGH/LOW");
for (const c of CLAIM_MARKERS) read(c.code, "CLAIM_MARKERS");
// Codes that sit inside closures and an unexported table, read off the source.
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
for (const f of ["./vectors.ts", "./patterns.ts"])
  for (const [, c] of src(f).matchAll(/\bval\(m, "([a-z0-9_]+)"/g))
    read(c, `val() ${f}`);
for (const [, list] of src("./units.ts").matchAll(/metrics: \[([^\]]*)\]/g))
  for (const [, c] of list!.matchAll(/"([a-z0-9_]+)"/g)) read(c, "units RULES");

const show = (code: string) => `${code} (${refs.get(code)!.join(", ")})`;

describe("every code the knowledge reads is a marker", () => {
  it("is in MARKER", () => {
    const unknown = [...refs.keys()].filter((c) => !MARKER.has(c)).map(show);
    expect(unknown).toEqual([]);
  });

  it("is never an alias MERGES folds onto another code", () => {
    const aliased = [...refs.keys()]
      .filter((c) => MERGES[c])
      .map((c) => `${show(c)} -> ${MERGES[c]}`);
    expect(aliased).toEqual([]);
  });

  it("scans every source", () => {
    expect(refs.size).toBeGreaterThan(120);
    const kinds = new Set(
      [...refs.values()].flat().map((w) => w.split(" ")[0]),
    );
    for (const k of [
      "rule",
      "prior",
      "test",
      "confounder",
      "vector",
      "SEX_RANGES",
      "BOUNDS",
      "DEFAULT_REF_HIGH",
      "FASTING",
      "RO",
      "intervention",
    ])
      expect(kinds, k).toContain(k);
  });
});

describe("the registry itself", () => {
  it("has unique codes", () => {
    expect(MARKER.size).toBe(MARKERS.length);
  });

  it("never lists a code MERGES would fold away", () => {
    expect(MARKERS.filter((m) => MERGES[m.code]).map((m) => m.code)).toEqual(
      [],
    );
  });

  it("has no alias that is another marker's code", () => {
    const bad = MARKERS.flatMap((m) =>
      (m.aliases ?? [])
        .filter((a) => a !== m.code && MARKER.has(a))
        .map((a) => `${m.code} alias ${a}`),
    );
    expect(bad).toEqual([]);
  });

  it("gives every lab marker a numeric rule reads a unit", () => {
    // A categorical result (1 positive / 0 negative, cut-off 0.5 in
    // `DEFAULT_REF_HIGH`) has no unit by nature.
    const bad = [...numeric].filter((c) => {
      const m = MARKER.get(c);
      return m?.kind === "lab" && m.unit == null && DEFAULT_REF_HIGH[c] !== 0.5;
    });
    expect(bad).toEqual([]);
    expect(numeric.size).toBeGreaterThan(50);
  });

  it("gives every lab marker a real category for its seeded metrics row", () => {
    // `other` is what `saveReadings` mints for an unknown analyte, and the
    // curator's identity step tries to merge those away.
    const bad = MARKERS.filter(
      (m) => m.kind === "lab" && (!m.category || m.category === "other"),
    ).map((m) => m.code);
    expect(bad).toEqual([]);
  });
});
