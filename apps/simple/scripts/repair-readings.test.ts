import { describe, expect, it } from "vitest";
import {
  implausible,
  lymphocyteCount,
  resolveLegacy,
  type MetricRow,
} from "./repair-readings";

const catalog: MetricRow[] = [
  {
    code: "lymphocytes_abs",
    name: "Lymphocytes (Absolute)",
    unit: "K/uL",
    aliases: ["Absolute Lymphocytes", "Lymphocytes absolute"],
  },
  {
    code: "lymphocytes_pct",
    name: "Lymphocytes %",
    unit: "%",
    aliases: ["Lymphocytes (%)"],
  },
  {
    code: "anti_thyroglobulin",
    name: "Anti-Thyroglobulin Antibodies",
    unit: "IU/mL",
    aliases: ["TgAb"],
  },
  {
    code: "esr",
    name: "ESR",
    unit: "mm/hr",
    aliases: ["erythrocyte sedimentation rate"],
  },
  { code: "free_t4", name: "Free T4", unit: "ng/dL", aliases: ["FT4"] },
  { code: "albumin", name: "Albumin", unit: "g/dL", aliases: null },
  { code: "ferritin", name: "Ferritin", unit: "ng/mL", aliases: null },
];

describe("resolveLegacy", () => {
  it("reads a count unit as the absolute metric, converting /mm³", () => {
    expect(resolveLegacy("Lymphocytes", "/mm³", catalog)).toEqual({
      code: "lymphocytes_abs",
      factor: 1e-3,
    });
    expect(resolveLegacy("Absolute Lymphocytes", "10^3/ul", catalog)).toEqual({
      code: "lymphocytes_abs",
      factor: 1,
    });
  });

  it("folds unit spellings: UI/mL is IU/mL, mm/h is mm/hr", () => {
    expect(
      resolveLegacy("Anti Thyroglobulin Antibodies", "UI/mL", catalog),
    ).toEqual({ code: "anti_thyroglobulin", factor: 1 });
    expect(resolveLegacy("ESR", "mm/h", catalog)).toEqual({
      code: "esr",
      factor: 1,
    });
  });

  it("lists what does not resolve, with the reason", () => {
    expect(resolveLegacy("Albumin", "%", catalog)).toEqual({
      reason: "unit % does not convert to albumin (g/dL)",
    });
    expect(resolveLegacy("Ferritin", "pmol/L", catalog)).toHaveProperty(
      "reason",
    );
    expect(resolveLegacy("Alpha 2 Globulin", "%", catalog)).toEqual({
      reason: 'no metric for "Alpha 2 Globulin"',
    });
  });
});

describe("implausible", () => {
  it("catches a unit mix-up against the person's own history", () => {
    // FT4 0.97 labelled ng/mL becomes 97 ng/dL; her history sits near 1.2
    expect(implausible(97, [1.13, 1.18, 1.32])).toBe(true);
    expect(implausible(1.1, [1.13, 1.18, 1.32])).toBe(false);
    expect(implausible(5, [])).toBe(false);
  });
});

describe("lymphocyteCount", () => {
  it("takes the plain lymphocyte range as a lymphocyte count", () => {
    expect(lymphocyteCount(1.92, "10^3/uL")).toBe(1.92);
    expect(lymphocyteCount(1790, "/mm³")).toBe(1.79);
  });

  it("leaves a real atypical count alone", () => {
    expect(lymphocyteCount(0.02, "10^3/uL")).toBeNull();
    expect(lymphocyteCount(30, "/mm³")).toBeNull();
    expect(lymphocyteCount(null, "10^3/uL")).toBeNull();
  });
});
