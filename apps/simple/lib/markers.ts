/**
 * Every marker code the knowledge reads, spelled once.
 *
 * Rules, vectors, ranges, bounds, cut-offs, interventions and the draw sheet
 * all name a marker by a plain string. This is the list those strings have to
 * come from: `lib/markers.test.ts` fails the build when one of them is not
 * here, or when one is a key of `MERGES` (an old spelling a rule must never
 * read).
 *
 * `seedHkb` inserts a `metrics` row for every `lab` marker that has none yet,
 * so the extraction prompt lists the code and the first upload of a test maps
 * onto the code the rule reads instead of a slug of the analyte.
 *
 * Names and units of codes that already have a production `metrics` row are
 * that row's (2026-11-17). The rest use the unit the rule thresholds are
 * written in. Plain data: no logic beyond the lookup map.
 */

export interface Marker {
  /** the only canonical spelling */
  code: string;
  /** English display name */
  name: string;
  /** canonical unit every threshold is written in; null for scores, procedures, qualitative results */
  unit: string | null;
  /** `vital` is a device or home measurement: it never comes off a lab sheet */
  kind: "lab" | "score" | "procedure" | "genetic" | "vital";
  /** `metrics.category` for the row `seedHkb` inserts; lab markers only, never "other" */
  category?: string;
  /** other names a lab sheet prints, incl. Romanian ones, fed to the extraction prompt */
  aliases?: string[];
  /** the Romanian line for the draw sheet */
  ro?: string;
  /** must be drawn fasting */
  fasting?: true;
}

export const MARKERS: Marker[] = [
  // ── Lipids ─────────────────────────────────────────────────────────────
  {
    code: "ldl_cholesterol",
    name: "LDL Cholesterol",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
    ro: "Profil lipidic (colesterol total, HDL, LDL, trigliceride)",
  },
  {
    code: "hdl_cholesterol",
    name: "HDL Cholesterol",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
  },
  {
    code: "total_cholesterol",
    name: "Cholesterol, Total",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
  },
  {
    code: "triglycerides",
    name: "Triglycerides",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
  },
  {
    code: "apolipoprotein_b",
    name: "Apolipoprotein B",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
    ro: "Apolipoproteina B (ApoB)",
  },
  {
    code: "non_hdl_cholesterol",
    name: "Non-HDL Cholesterol",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
  },
  {
    code: "vldl_cholesterol",
    name: "VLDL Cholesterol",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
  },
  {
    code: "apolipoprotein_a1",
    name: "Apolipoprotein A1",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
  },
  {
    code: "prolactin",
    name: "Prolactin",
    unit: "ng/mL",
    kind: "lab",
    category: "hormone",
  },
  {
    code: "chloride",
    name: "Chloride",
    unit: "mEq/L",
    kind: "lab",
    category: "metabolic",
  },
  {
    code: "direct_bilirubin",
    name: "Direct Bilirubin",
    unit: "mg/dL",
    kind: "lab",
    category: "hepatic",
  },
  { code: "weight", name: "Weight", unit: "lbs", kind: "vital" },
  {
    code: "lp_a",
    name: "Lipoprotein(a)",
    unit: "mg/dL",
    kind: "lab",
    category: "lipid",
    ro: "Lipoproteina (a)",
  },

  // ── Glucose and insulin ────────────────────────────────────────────────
  {
    code: "glucose",
    name: "Glucose",
    unit: "mg/dL",
    kind: "lab",
    category: "metabolic",
    ro: "Glicemie à jeun",
    fasting: true,
  },
  {
    code: "insulin",
    name: "Insulin",
    unit: "uIU/mL",
    kind: "lab",
    category: "metabolic",
    ro: "Insulină à jeun",
    fasting: true,
  },
  {
    code: "hba1c",
    name: "Hemoglobin A1c",
    unit: "%",
    kind: "lab",
    category: "metabolic",
    ro: "Hemoglobină glicată (HbA1c)",
  },
  { code: "homa_ir", name: "HOMA-IR", unit: null, kind: "score" },
  {
    code: "ogtt_2h_glucose",
    name: "OGTT Glucose, 2 h",
    unit: "mg/dL",
    kind: "lab",
    category: "metabolic",
    aliases: [
      "2-hour glucose",
      "glucose 120 min",
      "oral glucose tolerance test 2h",
      "Glicemie la 120 minute",
      "TTGO 120 min",
    ],
  },
  {
    code: "ogtt_insulin_120",
    name: "OGTT Insulin, 2 h",
    unit: "uIU/mL",
    kind: "lab",
    category: "metabolic",
    aliases: ["2-hour insulin", "insulin 120 min", "Insulinemie la 120 minute"],
  },
  {
    code: "alpha_gal_a",
    name: "Alpha-Galactosidase A Activity",
    unit: "% of mean",
    kind: "lab",
    category: "metabolic",
    aliases: [
      "alpha-galactosidase A",
      "alpha-Gal A",
      "GLA enzyme activity",
      "Alfa-galactozidaza A",
    ],
  },

  // ── Liver ──────────────────────────────────────────────────────────────
  {
    code: "alt",
    name: "ALT",
    unit: "U/L",
    kind: "lab",
    category: "metabolic",
    ro: "TGP (ALT), TGO (AST)",
  },
  { code: "ast", name: "AST", unit: "U/L", kind: "lab", category: "metabolic" },
  {
    code: "ggt",
    name: "GGT",
    unit: "U/L",
    kind: "lab",
    category: "hepatic",
    ro: "GGT",
  },
  {
    code: "alp",
    name: "Alkaline Phosphatase",
    unit: "U/L",
    kind: "lab",
    category: "metabolic",
    ro: "Fosfatază alcalină",
  },
  {
    code: "albumin",
    name: "Albumin",
    unit: "g/dL",
    kind: "lab",
    category: "metabolic",
    ro: "Albumină",
  },
  {
    code: "total_bilirubin",
    name: "Bilirubin, Total",
    unit: "mg/dL",
    kind: "lab",
    category: "metabolic",
  },
  {
    code: "indirect_bilirubin",
    name: "Bilirubin, Indirect",
    unit: "mg/dL",
    kind: "lab",
    category: "metabolic",
    aliases: [
      "indirect bilirubin",
      "unconjugated bilirubin",
      "Bilirubină indirectă",
    ],
  },
  {
    code: "aat_level",
    name: "Alpha-1 Antitrypsin",
    unit: "mg/dL",
    kind: "lab",
    category: "hepatic",
    aliases: ["alpha-1 antitrypsin", "AAT", "A1AT", "Alfa-1 antitripsină"],
  },
  {
    code: "aat_phenotype",
    name: "Alpha-1 Antitrypsin Phenotype",
    unit: null,
    kind: "lab",
    category: "hepatic",
    aliases: [
      "Pi phenotype",
      "Pi typing",
      "AAT phenotype",
      "Fenotip alfa-1 antitripsină",
    ],
  },
  {
    code: "ceruloplasmin",
    name: "Ceruloplasmin",
    unit: "mg/dL",
    kind: "lab",
    category: "hepatic",
    aliases: ["serum ceruloplasmin", "Ceruloplasmină"],
  },
  {
    code: "urine_copper_24h",
    name: "Copper, 24-Hour Urine",
    unit: "mcg/24h",
    kind: "lab",
    category: "urine",
    aliases: [
      "24-hour urine copper",
      "urinary copper",
      "Cupru urinar 24 ore",
      "Cuprurie",
    ],
  },
  { code: "fibroscan_kpa", name: "FibroScan", unit: "kPa", kind: "procedure" },
  {
    code: "liver_ultrasound",
    name: "Liver ultrasound",
    unit: null,
    kind: "procedure",
  },

  // ── Kidney and electrolytes ────────────────────────────────────────────
  {
    code: "creatinine",
    name: "Creatinine",
    unit: "mg/dL",
    kind: "lab",
    category: "metabolic",
    ro: "Creatinină (cu eGFR)",
  },
  {
    code: "cystatin_c",
    name: "Cystatin C",
    unit: "mg/L",
    kind: "lab",
    category: "renal",
    ro: "Cistatina C",
  },
  {
    code: "uric_acid",
    name: "Uric Acid",
    unit: "mg/dL",
    kind: "lab",
    category: "renal",
    ro: "Acid uric",
  },
  {
    code: "bun",
    name: "BUN",
    unit: "mg/dL",
    kind: "lab",
    category: "metabolic",
  },
  {
    code: "ck",
    name: "Creatine Kinase",
    unit: "U/L",
    kind: "lab",
    category: "cardiac",
  },
  {
    code: "sodium",
    name: "Sodium",
    unit: "mEq/L",
    kind: "lab",
    category: "metabolic",
  },
  {
    code: "potassium",
    name: "Potassium",
    unit: "mEq/L",
    kind: "lab",
    category: "metabolic",
  },
  {
    code: "urine_albumin_creatinine_ratio",
    name: "Urine Albumin/Creatinine Ratio",
    unit: "mg/g",
    kind: "lab",
    category: "urine",
    aliases: [
      "ACR",
      "UACR",
      "albumin/creatinine ratio",
      "microalbumin/creatinine ratio",
      "Raport albumină/creatinină urinară",
      "Microalbuminurie",
    ],
  },

  // ── Thyroid ────────────────────────────────────────────────────────────
  {
    code: "tsh",
    name: "TSH",
    unit: "mIU/L",
    kind: "lab",
    category: "thyroid",
    ro: "TSH",
  },
  {
    code: "free_t4",
    name: "Free T4",
    unit: "ng/dL",
    kind: "lab",
    category: "thyroid",
    ro: "FT4",
  },
  {
    code: "free_t3",
    name: "Free T3",
    unit: "pg/mL",
    kind: "lab",
    category: "thyroid",
    ro: "FT3",
  },
  {
    code: "tpo_antibodies",
    name: "TPO Antibodies",
    unit: "IU/mL",
    kind: "lab",
    category: "thyroid",
    ro: "Anticorpi anti-TPO",
  },
  {
    code: "anti_thyroglobulin",
    name: "Anti-Thyroglobulin Antibodies",
    unit: "IU/mL",
    kind: "lab",
    category: "thyroid",
  },
  {
    code: "trab",
    name: "TSH Receptor Antibodies",
    unit: "IU/L",
    kind: "lab",
    category: "thyroid",
    aliases: [
      "TRAb",
      "TSH receptor antibodies",
      "anti-TSH receptor antibodies",
      "Anticorpi anti-receptor TSH",
    ],
  },
  {
    code: "thyroid_ultrasound",
    name: "Thyroid ultrasound",
    unit: null,
    kind: "procedure",
  },

  // ── Sex hormones and adrenal ───────────────────────────────────────────
  {
    code: "testosterone_total",
    name: "Testosterone, Total",
    unit: "ng/dL",
    kind: "lab",
    category: "hormone",
    ro: "Testosteron total, SHBG",
  },
  {
    code: "free_testosterone",
    name: "Free Testosterone",
    unit: "pg/mL",
    kind: "lab",
    category: "hormone",
  },
  {
    code: "shbg",
    name: "SHBG",
    unit: "nmol/L",
    kind: "lab",
    category: "hormone",
  },
  {
    code: "estradiol",
    name: "Estradiol",
    unit: "pg/mL",
    kind: "lab",
    category: "hormone",
    ro: "Estradiol, FSH, LH",
  },
  {
    code: "fsh",
    name: "FSH",
    unit: "mIU/mL",
    kind: "lab",
    category: "hormone",
  },
  { code: "lh", name: "LH", unit: "mIU/mL", kind: "lab", category: "hormone" },
  {
    code: "progesterone",
    name: "Progesterone",
    unit: "ng/mL",
    kind: "lab",
    category: "hormone",
  },
  { code: "amh", name: "AMH", unit: "ng/mL", kind: "lab", category: "hormone" },
  {
    code: "psa_total",
    name: "PSA (Total)",
    unit: "ng/mL",
    kind: "lab",
    category: "hormone",
    ro: "PSA total",
  },
  {
    code: "cortisol",
    name: "Cortisol",
    unit: "mcg/dL",
    kind: "lab",
    category: "hormone",
  },
  {
    code: "acth_stim_cortisol",
    name: "Cortisol 60 min after ACTH Stimulation",
    unit: "mcg/dL",
    kind: "lab",
    category: "hormone",
    // The 60-minute value only: the 0 and 30 minute values on the same sheet
    // share its date, and two rows on one day leave `latest` to chance.
    // ponytail: a 30-minute peak above 18 is missed; take the same-day max if
    // that ever matters.
    aliases: ["cortisol 60 min post-ACTH", "Cortizol la 60 min după Synacthen"],
  },
  {
    code: "ovarian_ultrasound",
    name: "Ovarian ultrasound",
    unit: null,
    kind: "procedure",
  },

  // ── Inflammation ───────────────────────────────────────────────────────
  {
    code: "hs_crp",
    name: "hs-CRP",
    unit: "mg/L",
    kind: "lab",
    category: "inflammation",
    ro: "Proteina C reactivă înalt sensibilă (hs-CRP)",
  },
  {
    code: "crp",
    name: "CRP",
    unit: "mg/L",
    kind: "lab",
    category: "inflammation",
    ro: "Proteina C reactivă înalt sensibilă (hs-CRP)",
  },
  {
    code: "esr",
    name: "ESR",
    unit: "mm/hr",
    kind: "lab",
    category: "inflammation",
  },
  {
    code: "homocysteine",
    name: "Homocysteine",
    unit: "umol/L",
    kind: "lab",
    category: "inflammation",
    ro: "Homocisteină",
  },
  {
    code: "tryptase",
    name: "Tryptase",
    unit: "ng/mL",
    kind: "lab",
    category: "immunology",
    aliases: ["serum tryptase", "baseline tryptase", "Triptază serică"],
  },

  // ── Blood count ────────────────────────────────────────────────────────
  {
    code: "hemoglobin",
    name: "Hemoglobin",
    unit: "g/dL",
    kind: "lab",
    category: "hematology",
    ro: "Hemoleucogramă completă",
  },
  {
    code: "hematocrit",
    name: "Hematocrit",
    unit: "%",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "rbc",
    name: "Red Blood Cell Count",
    unit: "M/uL",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "wbc",
    name: "White Blood Cell Count",
    unit: "K/uL",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "platelets",
    name: "Platelet Count",
    unit: "K/uL",
    kind: "lab",
    category: "hematology",
  },
  { code: "mcv", name: "MCV", unit: "fL", kind: "lab", category: "hematology" },
  { code: "rdw", name: "RDW", unit: "%", kind: "lab", category: "hematology" },
  {
    code: "lymphocytes_pct",
    name: "Lymphocytes %",
    unit: "%",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "neutrophils_abs",
    name: "Neutrophils (Absolute)",
    unit: "K/uL",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "lymphocytes_abs",
    name: "Lymphocytes (Absolute)",
    unit: "K/uL",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "monocytes_abs",
    name: "Monocytes (Absolute)",
    unit: "K/uL",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "eosinophils_abs",
    name: "Eosinophils (Absolute)",
    unit: "K/uL",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "basophils_abs",
    name: "Basophils (Absolute)",
    unit: "K/uL",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "reticulocytes",
    name: "Reticulocyte Count, Absolute",
    unit: "10^6/uL",
    kind: "lab",
    category: "hematology",
  },
  {
    code: "reticulocyte_hemoglobin",
    name: "Reticulocyte Hemoglobin",
    unit: "pg",
    kind: "lab",
    category: "hematology",
    aliases: [
      "CHr",
      "Ret-He",
      "reticulocyte hemoglobin content",
      "Hemoglobină reticulocitară",
    ],
  },
  {
    code: "hba2",
    name: "Hemoglobin A2",
    unit: "%",
    kind: "lab",
    category: "hematology",
  },

  // ── Iron ───────────────────────────────────────────────────────────────
  {
    code: "ferritin",
    name: "Ferritin",
    unit: "ng/mL",
    kind: "lab",
    category: "iron_study",
    ro: "Feritină",
  },
  {
    code: "transferrin_saturation",
    name: "Transferrin Saturation",
    unit: "%",
    kind: "lab",
    category: "iron_study",
    ro: "Sideremie, capacitate totală de legare a fierului (TIBC), saturația transferinei",
  },
  {
    code: "iron",
    name: "Iron",
    unit: "mcg/dL",
    kind: "lab",
    category: "iron_study",
  },

  // ── Vitamins ───────────────────────────────────────────────────────────
  {
    code: "vitamin_d",
    name: "Vitamin D",
    unit: "ng/mL",
    kind: "lab",
    category: "vitamin",
    ro: "Vitamina D (25-OH)",
  },
  {
    code: "vitamin_b12",
    name: "Vitamin B12",
    unit: "pg/mL",
    kind: "lab",
    category: "vitamin",
    ro: "Vitamina B12",
  },
  {
    code: "folic_acid",
    name: "Folic Acid (Vitamin B9)",
    unit: "ng/mL",
    kind: "lab",
    category: "vitamin",
    ro: "Acid folic seric",
  },
  {
    code: "methylmalonic_acid",
    name: "Methylmalonic Acid",
    unit: "nmol/L",
    kind: "lab",
    category: "vitamin",
  },
  {
    code: "holotranscobalamin",
    name: "Holotranscobalamin",
    unit: "pmol/L",
    kind: "lab",
    category: "vitamin",
    aliases: [
      "active B12",
      "holoTC",
      "Holotranscobalamină",
      "Vitamina B12 activă",
    ],
  },
  {
    code: "red_cell_folate",
    name: "Red Cell Folate",
    unit: "ng/mL",
    kind: "lab",
    category: "vitamin",
    aliases: ["RBC folate", "erythrocyte folate", "Folat eritrocitar"],
  },

  // ── Serology ───────────────────────────────────────────────────────────
  {
    code: "hbs_antigen",
    name: "HBs Antigen",
    unit: null,
    kind: "lab",
    category: "immunology",
    ro: "AgHBs și anticorpi anti-HCV",
  },
  {
    code: "hcv_antibodies",
    name: "Anti-HCV",
    unit: null,
    kind: "lab",
    category: "immunology",
  },
  {
    code: "hcv_rna",
    name: "HCV RNA",
    unit: null,
    kind: "lab",
    category: "immunology",
    aliases: [
      "HCV viral load",
      "hepatitis C RNA",
      "HCV RNA PCR",
      "ARN VHC",
      "Viremie VHC",
    ],
  },
  {
    code: "h_pylori_stool_antigen",
    name: "Helicobacter pylori Stool Antigen",
    unit: null,
    kind: "lab",
    category: "immunology",
  },
  {
    code: "ttg_iga",
    name: "Tissue Transglutaminase IgA Antibody",
    unit: "RU/mL",
    kind: "lab",
    category: "immunology",
  },
  {
    code: "ema_iga",
    name: "Endomysial Antibodies IgA",
    unit: null,
    kind: "lab",
    category: "immunology",
    aliases: [
      "EMA IgA",
      "anti-endomysial antibodies IgA",
      "Anticorpi anti-endomisium IgA",
    ],
  },
  {
    code: "dgp_iga",
    name: "Deamidated Gliadin Peptide IgA",
    unit: "U/mL",
    kind: "lab",
    category: "immunology",
    aliases: [
      "DGP IgA",
      "anti-deamidated gliadin IgA",
      "Anticorpi anti-gliadină deamidată IgA",
    ],
  },
  {
    code: "dgp_igg",
    name: "Deamidated Gliadin Peptide IgG",
    unit: "U/mL",
    kind: "lab",
    category: "immunology",
    aliases: [
      "DGP IgG",
      "anti-deamidated gliadin IgG",
      "Anticorpi anti-gliadină deamidată IgG",
    ],
  },
  {
    code: "parietal_cell_antibodies",
    name: "Parietal Cell Antibodies",
    unit: null,
    kind: "lab",
    category: "immunology",
    aliases: [
      "APCA",
      "anti-parietal cell antibodies",
      "Anticorpi anti-celulă parietală",
    ],
  },
  {
    code: "intrinsic_factor_antibodies",
    name: "Intrinsic Factor Antibodies",
    unit: null,
    kind: "lab",
    category: "immunology",
    aliases: [
      "anti-intrinsic factor antibodies",
      "Anticorpi anti-factor intrinsec",
    ],
  },
  {
    code: "synovial_urate_crystals",
    name: "Urate Crystals, Joint Fluid",
    unit: null,
    kind: "lab",
    category: "immunology",
    aliases: [
      "monosodium urate crystals",
      "synovial fluid crystals",
      "Cristale de urat în lichidul sinovial",
    ],
  },

  // ── Digestive ──────────────────────────────────────────────────────────
  {
    code: "gastrin",
    name: "Gastrin",
    unit: "pg/mL",
    kind: "lab",
    category: "digestive",
    aliases: ["serum gastrin", "Gastrinemie", "Gastrină"],
  },
  {
    code: "pepsinogen_i",
    name: "Pepsinogen I",
    unit: "mcg/L",
    kind: "lab",
    category: "digestive",
    aliases: ["PG I", "PGI", "Pepsinogen I seric"],
  },
  {
    code: "calprotectin",
    name: "Calprotectin, Faecal",
    unit: "mcg/g",
    kind: "lab",
    category: "digestive",
    aliases: [
      "faecal calprotectin",
      "fecal calprotectin",
      "Calprotectină fecală",
    ],
  },
  {
    code: "fobt",
    name: "Faecal Immunochemical Test",
    unit: null,
    kind: "lab",
    category: "digestive",
    aliases: [
      "FIT",
      "FOBT",
      "faecal occult blood",
      "fecal occult blood",
      "Hemoragii oculte în materiile fecale",
    ],
  },
  {
    code: "breath_h2_peak",
    name: "Breath Hydrogen Peak Rise over Baseline",
    unit: "ppm",
    kind: "lab",
    category: "digestive",
    // The rise, not a single timed sample of the panel.
    aliases: [
      "hydrogen rise over baseline",
      "peak H2 rise",
      "Creștere maximă H2 față de bazal",
    ],
  },
  {
    code: "dysbiosis_index",
    name: "Dysbiosis Index",
    unit: "index",
    kind: "lab",
    category: "digestive",
    aliases: ["GA-map dysbiosis index", "Indice de disbioză"],
  },
  { code: "gastroscopy", name: "Gastroscopy", unit: null, kind: "procedure" },
  {
    code: "colonoscopy_done",
    name: "Colonoscopy",
    unit: null,
    kind: "procedure",
  },

  // ── Genetic ────────────────────────────────────────────────────────────
  {
    code: "hfe_genotype",
    name: "HFE genotype (C282Y, H63D)",
    unit: null,
    kind: "genetic",
  },
  {
    code: "hla_dq2_dq8",
    name: "HLA-DQ2/DQ8 typing",
    unit: null,
    kind: "genetic",
  },
  {
    code: "fh_genetic_panel",
    name: "FH genetic panel (LDLR, APOB, PCSK9)",
    unit: null,
    kind: "genetic",
  },

  // ── Scores and screening procedures ────────────────────────────────────
  { code: "audit_score", name: "AUDIT score", unit: null, kind: "score" },
  { code: "phq9_score", name: "PHQ-9 score", unit: null, kind: "score" },
  { code: "stop_bang", name: "STOP-Bang score", unit: null, kind: "score" },
  {
    code: "cac_score",
    name: "Coronary calcium score",
    unit: null,
    kind: "score",
  },
  { code: "dexa_t_score", name: "DEXA T-score", unit: null, kind: "score" },
  {
    code: "home_sleep_study",
    name: "Home sleep study (AHI)",
    unit: "events/h",
    kind: "procedure",
  },
  {
    code: "mammography_done",
    name: "Mammography",
    unit: null,
    kind: "procedure",
  },
  {
    code: "ldct_done",
    name: "Low-dose CT for lung cancer",
    unit: null,
    kind: "procedure",
  },

  // ── Body and devices ───────────────────────────────────────────────────
  { code: "bmi", name: "BMI", unit: "kg/m2", kind: "vital" },
  {
    code: "bp_systolic",
    name: "Blood Pressure, Systolic",
    unit: "mmHg",
    kind: "vital",
  },
  { code: "body_fat_pct", name: "Body Fat", unit: "%", kind: "vital" },
  { code: "waist_cm", name: "Waist", unit: "cm", kind: "vital" },
  { code: "grip_kg", name: "Grip strength", unit: "kg", kind: "vital" },
  {
    code: "resting_heart_rate",
    name: "Resting Heart Rate",
    unit: "bpm",
    kind: "vital",
  },
  { code: "hrv_sdnn", name: "HRV (SDNN)", unit: "ms", kind: "vital" },
  {
    code: "walking_hr_avg",
    name: "Walking Heart Rate Average",
    unit: "bpm",
    kind: "vital",
  },
  {
    code: "hr_recovery_1min",
    name: "Heart Rate Recovery, 1 min",
    unit: "bpm",
    kind: "vital",
  },
  {
    code: "respiratory_rate",
    name: "Respiratory Rate",
    unit: "breaths/min",
    kind: "vital",
  },
  { code: "spo2", name: "SpO2", unit: "%", kind: "vital" },
  {
    code: "sleep_duration",
    name: "Sleep Duration",
    unit: "min",
    kind: "vital",
  },
  {
    code: "vo2max_est",
    name: "VO2max (estimated)",
    unit: "mL/kg/min",
    kind: "vital",
  },
  {
    code: "wrist_temp",
    name: "Sleeping Wrist Temperature",
    unit: "C",
    kind: "vital",
  },
  {
    code: "cgm_mean_glucose",
    name: "CGM mean glucose",
    unit: "mg/dL",
    kind: "vital",
  },
];

export const MARKER = new Map(MARKERS.map((m) => [m.code, m]));
