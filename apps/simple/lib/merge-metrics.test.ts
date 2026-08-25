import { describe, it, expect } from "vitest";
import { canonicalCode, normalizeName } from "./merge-metrics";

/** [code, name, expected canonical code] */
const PAIRS: [string, string, string][] = [
  ["alt", "Alanine Aminotransferase", "alt"],
  ["alt_tgp", "Alanine Aminotransferase (ALT)", "alt"],
  ["ast_tgo", "Aspartate Aminotransferase (AST)", "ast"],
  ["gamma_gt", "Gamma-Glutamyl Transferase (GGT)", "ggt"],
  ["platelet_count", "Platelet Count", "platelets"],
  ["red_blood_cell_count", "Red Blood Cell Count", "rbc"],
  ["white_blood_cell_count", "White Blood Cell Count", "wbc"],
  ["mean_corpuscular_volume", "Mean Corpuscular Volume", "mcv"],
  ["mean_corpuscular_hemoglobin", "Mean Corpuscular Hemoglobin", "mch"],
  [
    "mean_corpuscular_hemoglobin_concentration",
    "Mean Corpuscular Hemoglobin Concentration",
    "mchc",
  ],
  ["mean_platelet_volume", "Mean Platelet Volume", "mpv"],
  ["platelet_distribution_width", "Platelet Distribution Width", "pdw"],
  ["plateletcrit", "Plateletcrit", "pct"],
  ["red_cell_distribution_width", "Red Cell Distribution Width", "rdw"],
  ["ionic_calcium", "Ionized Calcium", "ionized_calcium"],
  ["magnesium_serum", "Magnesium, Serum", "magnesium"],
  ["creatinine_serum", "Creatinine, Serum", "creatinine"],
  ["folic_acid_vitamin_b9", "Folic Acid (Vitamin B9)", "folic_acid"],
  ["anti_hcv", "Antibody to Hepatitis C Virus", "hcv_antibodies"],
  ["hbsag_qualitative", "Hepatitis B Surface Antigen (HBsAg) Qualitative", "hbs_antigen"],
  [
    "helicobacter_pylori_antigen_stool",
    "Helicobacter pylori Antigen, Stool",
    "h_pylori_stool_antigen",
  ],
  ["vitamin_d_25_hydroxyvitamin_d", "25-Hydroxyvitamin D", "vitamin_d"],
  ["lymphocyte_absolute", "Lymphocyte Absolute Count", "lymphocytes_abs"],
  ["absolute_lymphocytes", "Absolute Lymphocyte Count", "lymphocytes_abs"],
  ["lymphocytes_absolute", "Absolute Lymphocyte Count", "lymphocytes_abs"],
  ["absolute_basophils", "Absolute Basophil Count", "basophils_abs"],
  ["basophils_absolute", "Absolute Basophil Count", "basophils_abs"],
  ["neutrophils", "Neutrophils Percent", "neutrophils_pct"],
  ["neutrophils_percent", "Neutrophils Percent", "neutrophils_pct"],
  ["neutrophils_anc", "Absolute Neutrophil Count", "neutrophils_abs"],
  ["absolute_neutrophils", "Absolute Neutrophil Count", "neutrophils_abs"],
  ["monocyte_percentage", "Monocyte Percentage", "monocytes_pct"],
  ["eosinophils", "Eosinophils Percent", "eosinophils_pct"],
  ["basophils", "Basophils Percent", "basophils_pct"],
  ["c_reactive_protein", "C-Reactive Protein", "crp"],
  ["hemoglobin_a1c", "Hemoglobin A1c", "hba1c"],
  ["alkaline_phosphatase", "Alkaline Phosphatase", "alp"],
  ["serum_phosphorus", "Phosphorus", "phosphorus"],
];

describe("canonicalCode", () => {
  it.each(PAIRS)("%s -> %s", (code, name, expected) => {
    expect(canonicalCode(code, name)).toBe(expected);
  });

  it("leaves an unknown metric alone", () => {
    expect(canonicalCode("klotho", "Klotho Protein")).toBe("klotho");
  });

  it("is idempotent", () => {
    for (const [code, name, expected] of PAIRS) {
      expect(canonicalCode(canonicalCode(code, name), name)).toBe(expected);
    }
  });
});

describe("normalizeName", () => {
  it("folds absolute/abs and percent/% wording", () => {
    expect(normalizeName("Absolute Basophil Count")).toBe(
      normalizeName("Basophils Absolute"),
    );
    expect(normalizeName("Basophils %")).toBe(normalizeName("Basophils Percent"));
  });

  it("keeps absolute and percent apart", () => {
    expect(normalizeName("Basophils Absolute")).not.toBe(
      normalizeName("Basophils Percent"),
    );
  });

  it("drops parenthesised qualifiers", () => {
    expect(normalizeName("Gamma-Glutamyl Transferase (GGT)")).toBe(
      normalizeName("Gamma-Glutamyl Transferase"),
    );
  });
});
