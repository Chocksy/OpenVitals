/**
 * The legacy catalog carries the same biomarker under several codes
 * (`mch`/`mean_corpuscular_hemoglobin`, `neutrophils`/`neutrophils_percent`,
 * `alt`/`alt_tgp`, ...). `canonicalCode` folds every duplicate onto one code so
 * a metric has a single trend line.
 *
 * Two mechanisms, applied in this order:
 *  1. `MERGES`  — explicit code → code, for duplicates whose NAMES differ.
 *  2. `CANONICAL_BY_NAME` — normalised name → code, for duplicates that share a
 *     name. Also catches codes the extraction LLM invents for a known analyte.
 */

const SYNONYMS: Record<string, string> = {
  absolute: "abs",
  abs: "abs",
  percentage: "pct",
  percent: "pct",
  pct: "pct",
};

const NOISE = new Set(["count", "bodies", "body"]);

/** "Absolute Basophil Count" and "Basophils Absolute" both → "abs_basophil". */
export function normalizeName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/%/g, " pct ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => SYNONYMS[w] ?? w)
    .filter((w) => !NOISE.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
  return [...new Set(words)].sort().join("_");
}

/** Duplicates whose names differ too much for the normaliser to see. */
export const MERGES: Record<string, string> = {
  "25_hydroxyvitamin_d": "vitamin_d",
  vitamin_d_25_hydroxyvitamin_d: "vitamin_d",
  total_calcium: "calcium",
  creatinine_serum: "creatinine",
  magnesium_serum: "magnesium",
  uric_acid_serum: "uric_acid",
  iron_serum: "iron",
  zinc_serum: "zinc",
  total_protein_serum: "total_protein",
  total_serum_proteins: "total_protein",
  total_proteins: "total_protein",
  cholesterol_total: "total_cholesterol",
  bilirubin_total: "total_bilirubin",
  hemoglobin_a1c: "hba1c",
  alkaline_phosphatase: "alp",
  c_reactive_protein: "crp",
  creatine_kinase: "ck",
  apoa1: "apolipoprotein_a1",
  apob: "apolipoprotein_b",
  anti_thyroglobulin_antibodies: "anti_thyroglobulin",
  hbs_ag: "hbs_antigen",
  hbsag_qualitative: "hbs_antigen",
  anti_hcv: "hcv_antibodies",
  helicobacter_pylori_antigen_stool: "h_pylori_stool_antigen",
  folic_acid_vitamin_b9: "folic_acid",
  folate: "folic_acid",
  ionic_calcium: "ionized_calcium",
  amylase_total: "amylase",
  specific_gravity_urine: "urine_specific_gravity",
  urine_density: "urine_specific_gravity",
  ph_urine: "urine_ph",
  urobilinogen: "urine_urobilinogen",
  urobilinogen_urine: "urine_urobilinogen",
  ketone_bodies_urine: "urine_ketones",
  bilirubin_urine: "urine_bilirubin",
  nitrite_urine: "urine_nitrites",
  leukocytes_urine: "urine_leukocytes",
  // ponytail: dipstick and sediment leukocytes are one metric here.
  leukocytes_urine_sediment: "urine_leukocytes",
  urine_sediment_leukocytes: "urine_leukocytes",
  urine_leukocytes_sediment: "urine_leukocytes",
  epithelial_cells_urine_sediment: "urine_epithelial_cells",
  urine_squamous_epithelial_cells: "urine_epithelial_cells",
  urine_rbc: "urine_red_blood_cells",
  urine_red_blood_cells_sediment: "urine_red_blood_cells",
  urine_proteins: "urine_protein",
  total_protein_urine: "urine_protein",
  urine_ketone_bodies: "urine_ketones",
  staphylococcus_aureus_present: "staphylococcus_aureus",
  reticulocytes_absolute: "reticulocytes",
  neutrophils_anc: "neutrophils_abs",
  white_blood_cell_count: "wbc",
  red_blood_cell_count: "rbc",
  platelet_count: "platelets",
};

/** Generated from the legacy catalog: normalised name → canonical code. */
export const CANONICAL_BY_NAME: Record<string, string> = {
  "25_d_hydroxyvitamin": "vitamin_d",
  a1c_hemoglobin: "hba1c",
  abs_atypical_lymphocyte: "atypical_lymphocytes_abs",
  abs_basophil: "basophils_abs",
  abs_eosinophil: "eosinophils_abs",
  abs_lymphocyte: "lymphocytes_abs",
  abs_monocyte: "monocytes_abs",
  abs_neutrophil: "neutrophils_abs",
  acid_folic: "folic_acid",
  alanine_aminotransferase: "alt",
  alkaline_phosphatase: "alp",
  aminotransferase_aspartate: "ast",
  anti_antibodie_thyroglobulin: "anti_thyroglobulin",
  antigen_helicobacter_pylori_stool: "h_pylori_stool_antigen",
  apolipoprotein_b: "apolipoprotein_b",
  aureu_staphylococcu: "staphylococcus_aureus",
  basophil_pct: "basophils_pct",
  bilirubin_total: "total_bilirubin",
  bilirubin_urine: "urine_bilirubin",
  blood_cell_red: "rbc",
  blood_cell_red_urine: "urine_red_blood_cells",
  blood_cell_white: "wbc",
  c_protein_reactive: "crp",
  calcium_ionized: "ionized_calcium",
  cell_distribution_red_width: "rdw",
  cholesterol_total: "total_cholesterol",
  concentration_corpuscular_hemoglobin_mean: "mchc",
  corpuscular_hemoglobin_mean: "mch",
  corpuscular_mean_volume: "mcv",
  creatine_kinase: "ck",
  distribution_platelet_width: "pdw",
  eosinophil_pct: "eosinophils_pct",
  gamma_glutamyl_transferase: "ggt",
  gravity_specific_urine: "urine_specific_gravity",
  ketone_urine: "urine_ketones",
  leukocyte_sediment_urine: "urine_leukocytes",
  leukocyte_urine: "urine_leukocytes",
  lymphocyte_pct: "lymphocytes_pct",
  mean_platelet_volume: "mpv",
  monocyte_pct: "monocytes_pct",
  neutrophil_pct: "neutrophils_pct",
  nitrite_urine: "urine_nitrites",
  ph_urine: "urine_ph",
  phosphoru: "phosphorus",
  platelet: "platelets",
  plateletcrit: "pct",
  protein_serum_total: "total_protein",
  protein_total: "total_protein",
  protein_urine: "urine_protein",
  urine_urobilinogen: "urine_urobilinogen",
};

/** Fold a legacy or LLM-supplied code onto the code we actually store. */
export function canonicalCode(code: string, name = ""): string {
  const direct = MERGES[code];
  if (direct) return direct;
  const byName = name ? CANONICAL_BY_NAME[normalizeName(name)] : undefined;
  return byName ?? code;
}
