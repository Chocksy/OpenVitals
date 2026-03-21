import type { LucideIcon } from "lucide-react";
import {
  Dna,
  Droplets,
  Beaker,
  Bug,
  FlaskConical,
  Sun,
  LoaderPinwheel,
  Bean,
  Syringe,
  Flame,
  HeartPulse,
  TestTubes,
  BarChart3,
  Watch,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MarketingBiomarker {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  description: string;
  referenceRangeText: string | null;
  aliases: string[];
}

export interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  description: string;
}

// ── Category configuration ───────────────────────────────────────────────────

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  metabolic: {
    label: "Metabolic",
    icon: Dna,
    description: "Comprehensive metabolic panel markers for organ function and electrolyte balance",
  },
  hormone: {
    label: "Hormones",
    icon: Syringe,
    description: "Reproductive, adrenal, and growth hormone levels",
  },
  vital_sign: {
    label: "Vital Signs",
    icon: BarChart3,
    description: "Core physiological measurements including blood pressure, heart rate, and body composition",
  },
  hematology: {
    label: "Hematology",
    icon: Droplets,
    description: "Complete blood count and red/white blood cell indices",
  },
  lipid: {
    label: "Lipid Panel",
    icon: Beaker,
    description: "Cholesterol, triglycerides, and cardiovascular risk markers",
  },
  thyroid: {
    label: "Thyroid",
    icon: Bug,
    description: "Thyroid stimulating hormone and thyroid hormone levels",
  },
  wearable: {
    label: "Wearable",
    icon: Watch,
    description: "Metrics from connected wearable devices like recovery, HRV, and sleep",
  },
  vitamin: {
    label: "Vitamins",
    icon: Sun,
    description: "Essential vitamin and mineral levels",
  },
  urinalysis: {
    label: "Urinalysis",
    icon: TestTubes,
    description: "Urine composition and kidney filtration markers",
  },
  iron_study: {
    label: "Iron Studies",
    icon: FlaskConical,
    description: "Iron levels, storage, and transport capacity",
  },
  inflammation: {
    label: "Inflammation",
    icon: Flame,
    description: "Inflammatory markers and cardiovascular risk indicators",
  },
  renal: {
    label: "Renal",
    icon: Bean,
    description: "Kidney function and filtration rate markers",
  },
  cardiac: {
    label: "Cardiac",
    icon: HeartPulse,
    description: "Heart-specific enzymes and biomarkers",
  },
  hepatic: {
    label: "Hepatic",
    icon: LoaderPinwheel,
    description: "Liver function and bile metabolism markers",
  },
};

export const CATEGORY_ORDER = [
  "metabolic",
  "hematology",
  "hormone",
  "lipid",
  "vital_sign",
  "vitamin",
  "thyroid",
  "inflammation",
  "iron_study",
  "renal",
  "cardiac",
  "wearable",
  "urinalysis",
  "hepatic",
] as const;

// ── Biomarker data ───────────────────────────────────────────────────────────

export const BIOMARKERS: MarketingBiomarker[] = [
  // ── Metabolic (18) ──
  { id: "glucose", name: "Glucose", category: "metabolic", unit: "mg/dL", description: "Fasting blood glucose level", referenceRangeText: "70-100 mg/dL (fasting)", aliases: ["blood sugar", "blood glucose", "fasting glucose", "FBG", "fasting blood sugar", "serum glucose", "plasma glucose", "GLU"] },
  { id: "bun", name: "BUN", category: "metabolic", unit: "mg/dL", description: "Blood urea nitrogen", referenceRangeText: "7-20 mg/dL", aliases: ["blood urea nitrogen", "urea nitrogen", "urea", "serum urea nitrogen"] },
  { id: "creatinine", name: "Creatinine", category: "metabolic", unit: "mg/dL", description: "Serum creatinine for kidney function", referenceRangeText: "0.6-1.2 mg/dL", aliases: ["creat", "serum creatinine", "SCr", "creatinine serum"] },
  { id: "sodium", name: "Sodium", category: "metabolic", unit: "mEq/L", description: "Serum sodium level", referenceRangeText: "136-145 mEq/L", aliases: ["Na", "Na+", "serum sodium", "sodium level"] },
  { id: "potassium", name: "Potassium", category: "metabolic", unit: "mEq/L", description: "Serum potassium level", referenceRangeText: "3.5-5.0 mEq/L", aliases: ["K", "K+", "serum potassium", "potassium level"] },
  { id: "chloride", name: "Chloride", category: "metabolic", unit: "mEq/L", description: "Serum chloride level", referenceRangeText: "98-106 mEq/L", aliases: ["Cl", "Cl-", "serum chloride"] },
  { id: "co2", name: "CO2", category: "metabolic", unit: "mEq/L", description: "Serum carbon dioxide / bicarbonate", referenceRangeText: "23-29 mEq/L", aliases: ["carbon dioxide", "bicarbonate", "HCO3", "total CO2", "TCO2"] },
  { id: "calcium", name: "Calcium", category: "metabolic", unit: "mg/dL", description: "Serum calcium level", referenceRangeText: "8.5-10.5 mg/dL", aliases: ["Ca", "serum calcium", "total calcium", "Ca2+", "calcium level"] },
  { id: "total_protein", name: "Total Protein", category: "metabolic", unit: "g/dL", description: "Total serum protein", referenceRangeText: "6.0-8.3 g/dL", aliases: ["TP", "serum total protein", "protein total"] },
  { id: "albumin", name: "Albumin", category: "metabolic", unit: "g/dL", description: "Serum albumin", referenceRangeText: "3.5-5.5 g/dL", aliases: ["ALB", "serum albumin"] },
  { id: "bilirubin_total", name: "Bilirubin, Total", category: "metabolic", unit: "mg/dL", description: "Total bilirubin", referenceRangeText: "0.1-1.2 mg/dL", aliases: ["total bilirubin", "TBIL", "bilirubin", "T. Bilirubin", "total bili"] },
  { id: "alp", name: "Alkaline Phosphatase", category: "metabolic", unit: "U/L", description: "Alkaline phosphatase enzyme", referenceRangeText: "44-147 U/L", aliases: ["ALP", "alk phos", "alkaline phos", "ALKP"] },
  { id: "alt", name: "ALT", category: "metabolic", unit: "U/L", description: "Alanine aminotransferase", referenceRangeText: "7-56 U/L", aliases: ["alanine aminotransferase", "SGPT", "alanine transaminase", "ALT/SGPT"] },
  { id: "ast", name: "AST", category: "metabolic", unit: "U/L", description: "Aspartate aminotransferase", referenceRangeText: "10-40 U/L", aliases: ["aspartate aminotransferase", "SGOT", "aspartate transaminase", "AST/SGOT"] },
  { id: "hemoglobin_a1c", name: "Hemoglobin A1c", category: "metabolic", unit: "%", description: "Average blood sugar over past 2-3 months", referenceRangeText: "< 5.7% (normal)", aliases: ["HbA1c", "A1C", "glycated hemoglobin", "glycosylated hemoglobin", "A1c", "Hgb A1c"] },
  { id: "insulin", name: "Insulin", category: "metabolic", unit: "uIU/mL", description: "Fasting insulin level", referenceRangeText: "2.6-24.9 uIU/mL (fasting)", aliases: ["fasting insulin", "serum insulin", "insulin fasting", "insulin level"] },
  { id: "c_peptide", name: "C-Peptide", category: "metabolic", unit: "ng/mL", description: "C-peptide level", referenceRangeText: "1.1-4.4 ng/mL", aliases: ["C peptide", "connecting peptide", "c-peptide level"] },
  { id: "magnesium", name: "Magnesium", category: "metabolic", unit: "mg/dL", description: "Serum magnesium level", referenceRangeText: "1.7-2.2 mg/dL", aliases: ["Mg", "serum magnesium", "magnesium level", "Mg2+"] },

  // ── Hormones (11) ──
  { id: "testosterone_total", name: "Testosterone, Total", category: "hormone", unit: "ng/dL", description: "Total testosterone", referenceRangeText: "300-1000 ng/dL (men), 15-70 ng/dL (women)", aliases: ["testosterone", "total testosterone", "serum testosterone", "testosterone level"] },
  { id: "estradiol", name: "Estradiol", category: "hormone", unit: "pg/mL", description: "Estradiol level", referenceRangeText: "10-40 pg/mL (men), 15-350 pg/mL (women)", aliases: ["E2", "estradiol level", "serum estradiol", "17-beta estradiol"] },
  { id: "progesterone", name: "Progesterone", category: "hormone", unit: "ng/mL", description: "Serum progesterone", referenceRangeText: "Varies by cycle phase", aliases: ["P4", "serum progesterone", "progesterone level"] },
  { id: "lh", name: "LH", category: "hormone", unit: "mIU/mL", description: "Luteinizing hormone", referenceRangeText: "1.5-9.3 mIU/mL (men)", aliases: ["luteinizing hormone", "LH level"] },
  { id: "fsh", name: "FSH", category: "hormone", unit: "mIU/mL", description: "Follicle stimulating hormone", referenceRangeText: "1.5-12.4 mIU/mL (men)", aliases: ["follicle stimulating hormone", "FSH level", "follicle-stimulating hormone"] },
  { id: "cortisol", name: "Cortisol", category: "hormone", unit: "mcg/dL", description: "Serum cortisol (morning)", referenceRangeText: "6.2-19.4 mcg/dL (AM)", aliases: ["serum cortisol", "cortisol level", "cortisol AM", "morning cortisol"] },
  { id: "dhea_s", name: "DHEA-S", category: "hormone", unit: "mcg/dL", description: "Dehydroepiandrosterone sulfate", referenceRangeText: "280-640 mcg/dL (men 18-39), 65-380 mcg/dL (women 18-39)", aliases: ["DHEA sulfate", "dehydroepiandrosterone sulfate", "DHEAS", "DHEA-SO4"] },
  { id: "igf_1", name: "IGF-1", category: "hormone", unit: "ng/mL", description: "Insulin-like growth factor 1", referenceRangeText: "101-307 ng/mL (adult)", aliases: ["insulin-like growth factor 1", "IGF1", "somatomedin C", "IGF-I"] },
  { id: "free_testosterone", name: "Free Testosterone", category: "hormone", unit: "pg/mL", description: "Free (unbound) testosterone", referenceRangeText: "4.5-25 pg/mL (men), 0.5-5.0 pg/mL (women)", aliases: ["free T", "free testo", "direct free testosterone", "bioavailable testosterone"] },
  { id: "shbg", name: "SHBG", category: "hormone", unit: "nmol/L", description: "Sex hormone binding globulin", referenceRangeText: "10-57 nmol/L (men), 18-144 nmol/L (women)", aliases: ["sex hormone binding globulin", "SHBG level"] },
  { id: "prolactin", name: "Prolactin", category: "hormone", unit: "ng/mL", description: "Serum prolactin", referenceRangeText: "2-18 ng/mL (men), 2-29 ng/mL (women)", aliases: ["PRL", "prolactin level", "serum prolactin"] },

  // ── Vital Signs (10) ──
  { id: "heart_rate", name: "Heart Rate", category: "vital_sign", unit: "bpm", description: "Heart rate", referenceRangeText: "60-100 bpm", aliases: ["HR", "pulse", "pulse rate", "heart rate resting"] },
  { id: "bp_systolic", name: "Blood Pressure, Systolic", category: "vital_sign", unit: "mmHg", description: "Systolic blood pressure", referenceRangeText: "< 120 mmHg (normal)", aliases: ["systolic BP", "systolic blood pressure", "BP sys", "SBP"] },
  { id: "bp_diastolic", name: "Blood Pressure, Diastolic", category: "vital_sign", unit: "mmHg", description: "Diastolic blood pressure", referenceRangeText: "< 80 mmHg (normal)", aliases: ["diastolic BP", "diastolic blood pressure", "BP dia", "DBP"] },
  { id: "temperature", name: "Temperature", category: "vital_sign", unit: "F", description: "Body temperature", referenceRangeText: "97.8-99.1 F", aliases: ["temp", "body temperature", "body temp"] },
  { id: "respiratory_rate", name: "Respiratory Rate", category: "vital_sign", unit: "breaths/min", description: "Respiratory rate", referenceRangeText: "12-20 breaths/min", aliases: ["RR", "resp rate", "breathing rate"] },
  { id: "spo2", name: "SpO2", category: "vital_sign", unit: "%", description: "Oxygen saturation", referenceRangeText: "95-100%", aliases: ["oxygen saturation", "O2 sat", "pulse ox", "pulse oximetry", "sat"] },
  { id: "weight", name: "Weight", category: "vital_sign", unit: "lbs", description: "Body weight", referenceRangeText: null, aliases: ["body weight", "wt"] },
  { id: "height", name: "Height", category: "vital_sign", unit: "in", description: "Body height", referenceRangeText: null, aliases: ["body height", "stature", "ht"] },
  { id: "bmi", name: "BMI", category: "vital_sign", unit: "kg/m2", description: "Body mass index", referenceRangeText: "18.5-24.9 kg/m2 (normal)", aliases: ["body mass index"] },
  { id: "resting_heart_rate", name: "Resting Heart Rate", category: "vital_sign", unit: "bpm", description: "Resting heart rate", referenceRangeText: "60-100 bpm", aliases: ["RHR", "resting HR", "resting pulse"] },

  // ── Hematology (10) ──
  { id: "wbc", name: "White Blood Cell Count", category: "hematology", unit: "K/uL", description: "White blood cell count", referenceRangeText: "4.5-11.0 K/uL", aliases: ["WBC", "white blood cells", "leukocytes", "white count", "WBC count"] },
  { id: "rbc", name: "Red Blood Cell Count", category: "hematology", unit: "M/uL", description: "Red blood cell count", referenceRangeText: "4.7-6.1 M/uL (men), 4.2-5.4 M/uL (women)", aliases: ["RBC", "red blood cells", "erythrocytes", "red count", "RBC count"] },
  { id: "hemoglobin", name: "Hemoglobin", category: "hematology", unit: "g/dL", description: "Hemoglobin concentration", referenceRangeText: "13.5-17.5 g/dL (men), 12.0-16.0 g/dL (women)", aliases: ["Hgb", "Hb", "hemoglobin level", "HGB"] },
  { id: "hematocrit", name: "Hematocrit", category: "hematology", unit: "%", description: "Percentage of blood volume occupied by red blood cells", referenceRangeText: "38.3-48.6% (men), 35.5-44.9% (women)", aliases: ["Hct", "HCT", "crit", "packed cell volume", "PCV"] },
  { id: "mcv", name: "MCV", category: "hematology", unit: "fL", description: "Mean corpuscular volume", referenceRangeText: "80-100 fL", aliases: ["mean corpuscular volume"] },
  { id: "mch", name: "MCH", category: "hematology", unit: "pg", description: "Mean corpuscular hemoglobin", referenceRangeText: "27-33 pg", aliases: ["mean corpuscular hemoglobin"] },
  { id: "mchc", name: "MCHC", category: "hematology", unit: "g/dL", description: "Mean corpuscular hemoglobin concentration", referenceRangeText: "32-36 g/dL", aliases: ["mean corpuscular hemoglobin concentration"] },
  { id: "rdw", name: "RDW", category: "hematology", unit: "%", description: "Red cell distribution width", referenceRangeText: "11.5-14.5%", aliases: ["red cell distribution width", "RDW-CV"] },
  { id: "platelets", name: "Platelet Count", category: "hematology", unit: "K/uL", description: "Platelet count", referenceRangeText: "150-400 K/uL", aliases: ["PLT", "thrombocytes", "platelet count", "plt count"] },
  { id: "mpv", name: "MPV", category: "hematology", unit: "fL", description: "Mean platelet volume", referenceRangeText: "7.5-11.5 fL", aliases: ["mean platelet volume"] },

  // ── Lipid Panel (7) ──
  { id: "cholesterol_total", name: "Total Cholesterol", category: "lipid", unit: "mg/dL", description: "Total blood cholesterol level", referenceRangeText: "< 200 mg/dL (desirable)", aliases: ["cholesterol", "total cholesterol", "TC", "chol"] },
  { id: "ldl_cholesterol", name: "LDL Cholesterol", category: "lipid", unit: "mg/dL", description: "Low-density lipoprotein cholesterol", referenceRangeText: "< 100 mg/dL (optimal)", aliases: ["LDL", "LDL-C", "bad cholesterol", "LDL cholesterol calc", "LDL Chol Calc (NIH)"] },
  { id: "hdl_cholesterol", name: "HDL Cholesterol", category: "lipid", unit: "mg/dL", description: "High-density lipoprotein cholesterol", referenceRangeText: "> 40 mg/dL (men), > 50 mg/dL (women)", aliases: ["HDL", "HDL-C", "good cholesterol"] },
  { id: "triglycerides", name: "Triglycerides", category: "lipid", unit: "mg/dL", description: "Blood triglyceride level", referenceRangeText: "< 150 mg/dL (normal)", aliases: ["TG", "trigs", "triglyceride"] },
  { id: "vldl_cholesterol", name: "VLDL Cholesterol", category: "lipid", unit: "mg/dL", description: "Very low-density lipoprotein cholesterol", referenceRangeText: "5-40 mg/dL", aliases: ["VLDL", "VLDL-C"] },
  { id: "apob", name: "Apolipoprotein B", category: "lipid", unit: "mg/dL", description: "Apolipoprotein B", referenceRangeText: "40-120 mg/dL", aliases: ["ApoB", "Apo B", "apolipoprotein B-100", "Apo B-100"] },
  { id: "lp_a", name: "Lipoprotein(a)", category: "lipid", unit: "nmol/L", description: "Lipoprotein(a) level", referenceRangeText: "< 75 nmol/L (desirable)", aliases: ["Lp(a)", "lipoprotein a", "Lp a", "lipoprotein little a"] },

  // ── Thyroid (5) ──
  { id: "tsh", name: "TSH", category: "thyroid", unit: "mIU/L", description: "Thyroid stimulating hormone", referenceRangeText: "0.4-4.0 mIU/L", aliases: ["thyroid stimulating hormone", "thyrotropin", "TSH 3rd generation"] },
  { id: "free_t4", name: "Free T4", category: "thyroid", unit: "ng/dL", description: "Free thyroxine level", referenceRangeText: "0.8-1.8 ng/dL", aliases: ["FT4", "free thyroxine", "thyroxine free", "T4 free"] },
  { id: "free_t3", name: "Free T3", category: "thyroid", unit: "pg/mL", description: "Free triiodothyronine level", referenceRangeText: "2.3-4.2 pg/mL", aliases: ["FT3", "free triiodothyronine", "triiodothyronine free", "T3 free"] },
  { id: "total_t3", name: "Total T3", category: "thyroid", unit: "ng/dL", description: "Total triiodothyronine", referenceRangeText: "80-200 ng/dL", aliases: ["T3", "triiodothyronine", "T3 total"] },
  { id: "total_t4", name: "Total T4", category: "thyroid", unit: "mcg/dL", description: "Total thyroxine", referenceRangeText: "4.5-12.0 mcg/dL", aliases: ["T4", "thyroxine", "T4 total"] },

  // ── Wearable (4) ──
  { id: "recovery_score", name: "Recovery Score", category: "wearable", unit: "%", description: "Wearable recovery score", referenceRangeText: "0-33% red, 34-66% yellow, 67-100% green", aliases: ["recovery", "whoop recovery"] },
  { id: "hrv_rmssd", name: "HRV (rMSSD)", category: "wearable", unit: "ms", description: "Heart rate variability (root mean square of successive differences)", referenceRangeText: "20-100 ms (typical)", aliases: ["HRV", "heart rate variability", "RMSSD"] },
  { id: "strain_score", name: "Strain Score", category: "wearable", unit: null, description: "Wearable cardiovascular strain score", referenceRangeText: "0-21 scale", aliases: ["strain", "whoop strain", "day strain"] },
  { id: "sleep_duration", name: "Sleep Duration", category: "wearable", unit: "min", description: "Total sleep duration", referenceRangeText: "7-9 hours (420-540 min)", aliases: ["sleep time", "total sleep", "time asleep"] },

  // ── Vitamins (4) ──
  { id: "vitamin_d", name: "Vitamin D", category: "vitamin", unit: "ng/mL", description: "25-hydroxyvitamin D level", referenceRangeText: "30-100 ng/mL (sufficient)", aliases: ["25-OH vitamin D", "calcidiol", "25-hydroxyvitamin D", "vit D", "Vit D, 25-Hydroxy", "25(OH)D"] },
  { id: "vitamin_b12", name: "Vitamin B12", category: "vitamin", unit: "pg/mL", description: "Vitamin B12 level", referenceRangeText: "200-900 pg/mL", aliases: ["B12", "cobalamin", "cyanocobalamin", "Vit B12", "Vitamin B-12"] },
  { id: "folate", name: "Folate", category: "vitamin", unit: "ng/mL", description: "Serum folate level", referenceRangeText: "2.7-17.0 ng/mL", aliases: ["folic acid", "serum folate", "vitamin B9", "folate level"] },
  { id: "zinc", name: "Zinc", category: "vitamin", unit: "mcg/dL", description: "Serum zinc level", referenceRangeText: "60-120 mcg/dL", aliases: ["Zn", "serum zinc", "zinc level", "plasma zinc"] },

  // ── Urinalysis (4) ──
  { id: "urine_ph", name: "Urine pH", category: "urinalysis", unit: null, description: "Urine pH", referenceRangeText: "4.5-8.0", aliases: ["pH urine", "urine acidity", "UA pH"] },
  { id: "specific_gravity", name: "Specific Gravity", category: "urinalysis", unit: null, description: "Urine specific gravity", referenceRangeText: "1.005-1.030", aliases: ["SG", "urine specific gravity", "sp. gravity", "spec grav"] },
  { id: "urine_protein", name: "Urine Protein", category: "urinalysis", unit: "mg/dL", description: "Urine protein", referenceRangeText: "Negative", aliases: ["protein urine", "UA protein", "urine protein level"] },
  { id: "urine_glucose", name: "Urine Glucose", category: "urinalysis", unit: "mg/dL", description: "Urine glucose", referenceRangeText: "Negative", aliases: ["glucose urine", "UA glucose", "urine sugar"] },

  // ── Iron Studies (4) ──
  { id: "iron", name: "Iron", category: "iron_study", unit: "mcg/dL", description: "Serum iron level", referenceRangeText: "65-175 mcg/dL (men), 50-170 mcg/dL (women)", aliases: ["serum iron", "Fe", "iron level", "iron serum"] },
  { id: "ferritin", name: "Ferritin", category: "iron_study", unit: "ng/mL", description: "Serum ferritin level (iron stores)", referenceRangeText: "12-300 ng/mL (men), 12-150 ng/mL (women)", aliases: ["serum ferritin", "ferritin level"] },
  { id: "tibc", name: "TIBC", category: "iron_study", unit: "mcg/dL", description: "Total iron binding capacity", referenceRangeText: "250-370 mcg/dL", aliases: ["total iron binding capacity", "iron binding capacity", "total iron-binding capacity"] },
  { id: "transferrin_saturation", name: "Transferrin Saturation", category: "iron_study", unit: "%", description: "Transferrin saturation percentage", referenceRangeText: "20-50%", aliases: ["TSAT", "iron saturation", "transferrin sat", "iron sat %"] },

  // ── Inflammation (4) ──
  { id: "crp", name: "CRP", category: "inflammation", unit: "mg/L", description: "C-reactive protein", referenceRangeText: "< 10 mg/L", aliases: ["C-reactive protein", "CRP level", "C reactive protein"] },
  { id: "esr", name: "ESR", category: "inflammation", unit: "mm/hr", description: "Erythrocyte sedimentation rate", referenceRangeText: "0-15 mm/hr (men), 0-20 mm/hr (women)", aliases: ["sed rate", "erythrocyte sedimentation rate", "sedimentation rate", "ESR Westergren"] },
  { id: "hs_crp", name: "hs-CRP", category: "inflammation", unit: "mg/L", description: "High-sensitivity C-reactive protein", referenceRangeText: "< 1.0 mg/L (low risk), 1.0-3.0 mg/L (avg risk), > 3.0 mg/L (high risk)", aliases: ["high-sensitivity CRP", "high sensitivity C-reactive protein", "cardiac CRP", "hsCRP"] },
  { id: "homocysteine", name: "Homocysteine", category: "inflammation", unit: "umol/L", description: "Homocysteine level", referenceRangeText: "4-15 umol/L", aliases: ["Hcy", "homocysteine level", "total homocysteine", "plasma homocysteine"] },

  // ── Renal (3) ──
  { id: "egfr", name: "eGFR", category: "renal", unit: "mL/min/1.73m2", description: "Estimated glomerular filtration rate", referenceRangeText: "> 60 mL/min/1.73m2", aliases: ["estimated GFR", "glomerular filtration rate", "eGFR CKD-EPI", "GFR estimated"] },
  { id: "uric_acid", name: "Uric Acid", category: "renal", unit: "mg/dL", description: "Serum uric acid", referenceRangeText: "3.5-7.2 mg/dL (men), 2.6-6.0 mg/dL (women)", aliases: ["urate", "serum uric acid", "UA"] },
  { id: "bun_creatinine_ratio", name: "BUN/Creatinine Ratio", category: "renal", unit: null, description: "BUN to creatinine ratio", referenceRangeText: "10-20", aliases: ["BUN/Creat", "BUN to creatinine ratio", "B/C ratio"] },

  // ── Cardiac (3) ──
  { id: "bnp", name: "BNP", category: "cardiac", unit: "pg/mL", description: "Brain natriuretic peptide", referenceRangeText: "< 100 pg/mL", aliases: ["brain natriuretic peptide", "B-type natriuretic peptide", "NT-proBNP", "pro-BNP"] },
  { id: "troponin_i", name: "Troponin I", category: "cardiac", unit: "ng/mL", description: "Cardiac troponin I", referenceRangeText: "< 0.04 ng/mL", aliases: ["troponin", "cardiac troponin I", "cTnI", "hs-troponin I", "trop I"] },
  { id: "ck_mb", name: "CK-MB", category: "cardiac", unit: "ng/mL", description: "Creatine kinase MB isoenzyme", referenceRangeText: "< 5 ng/mL", aliases: ["creatine kinase MB", "CK MB", "CK-MB mass"] },

  // ── Hepatic (2) ──
  { id: "direct_bilirubin", name: "Direct Bilirubin", category: "hepatic", unit: "mg/dL", description: "Direct (conjugated) bilirubin", referenceRangeText: "0.0-0.3 mg/dL", aliases: ["conjugated bilirubin", "bilirubin direct", "D. Bilirubin", "direct bili"] },
  { id: "ggt", name: "GGT", category: "hepatic", unit: "U/L", description: "Gamma-glutamyl transferase", referenceRangeText: "9-48 U/L", aliases: ["gamma-glutamyl transferase", "gamma GT", "gamma-glutamyltransferase", "GGTP"] },

  // ── WBC Differential (10) ──
  { id: "neutrophils_pct", name: "Neutrophils %", category: "hematology", unit: "%", description: "Neutrophil percentage of white blood cells", referenceRangeText: "40-70%", aliases: ["neutrophil %", "neut %", "segs %", "segmented neutrophils"] },
  { id: "neutrophils_abs", name: "Neutrophils (Absolute)", category: "hematology", unit: "K/uL", description: "Absolute neutrophil count", referenceRangeText: "1.8-7.7 K/uL", aliases: ["ANC", "absolute neutrophil count", "neut abs", "neutrophils absolute"] },
  { id: "lymphocytes_pct", name: "Lymphocytes %", category: "hematology", unit: "%", description: "Lymphocyte percentage of white blood cells", referenceRangeText: "20-40%", aliases: ["lymph %", "lymphocyte percentage", "lymphocyte %"] },
  { id: "lymphocytes_abs", name: "Lymphocytes (Absolute)", category: "hematology", unit: "K/uL", description: "Absolute lymphocyte count", referenceRangeText: "1.0-4.8 K/uL", aliases: ["ALC", "absolute lymphocyte count", "lymph abs", "lymphocytes absolute"] },
  { id: "monocytes_pct", name: "Monocytes %", category: "hematology", unit: "%", description: "Monocyte percentage of white blood cells", referenceRangeText: "2-8%", aliases: ["mono %", "monocyte percentage", "monocyte %"] },
  { id: "monocytes_abs", name: "Monocytes (Absolute)", category: "hematology", unit: "K/uL", description: "Absolute monocyte count", referenceRangeText: "0.2-0.8 K/uL", aliases: ["AMC", "absolute monocyte count", "mono abs", "monocytes absolute"] },
  { id: "eosinophils_pct", name: "Eosinophils %", category: "hematology", unit: "%", description: "Eosinophil percentage of white blood cells", referenceRangeText: "1-4%", aliases: ["eos %", "eosinophil percentage", "eosinophil %"] },
  { id: "eosinophils_abs", name: "Eosinophils (Absolute)", category: "hematology", unit: "K/uL", description: "Absolute eosinophil count", referenceRangeText: "0.0-0.5 K/uL", aliases: ["AEC", "absolute eosinophil count", "eos abs", "eosinophils absolute"] },
  { id: "basophils_pct", name: "Basophils %", category: "hematology", unit: "%", description: "Basophil percentage of white blood cells", referenceRangeText: "0-1%", aliases: ["baso %", "basophil percentage", "basophil %"] },
  { id: "basophils_abs", name: "Basophils (Absolute)", category: "hematology", unit: "K/uL", description: "Absolute basophil count", referenceRangeText: "0.0-0.2 K/uL", aliases: ["ABC", "absolute basophil count", "baso abs", "basophils absolute"] },

  // ── Metabolic Additions (3) ──
  { id: "globulin", name: "Globulin", category: "metabolic", unit: "g/dL", description: "Serum globulin (total protein minus albumin)", referenceRangeText: "2.0-3.5 g/dL", aliases: ["serum globulin", "total globulin", "globulin level"] },
  { id: "albumin_globulin_ratio", name: "Albumin/Globulin Ratio", category: "metabolic", unit: null, description: "Ratio of albumin to globulin", referenceRangeText: "1.1-2.5", aliases: ["A/G ratio", "A:G ratio", "albumin to globulin ratio", "AG ratio"] },
  { id: "lipase", name: "Lipase", category: "metabolic", unit: "U/L", description: "Pancreatic lipase enzyme", referenceRangeText: "10-73 U/L", aliases: ["serum lipase", "lipase level", "pancreatic lipase"] },

  // ── Lipid Additions (4) ──
  { id: "non_hdl_cholesterol", name: "Non-HDL Cholesterol", category: "lipid", unit: "mg/dL", description: "Total cholesterol minus HDL cholesterol", referenceRangeText: "< 130 mg/dL (desirable)", aliases: ["non-HDL", "non HDL cholesterol", "non-HDL-C"] },
  { id: "apoa1", name: "Apolipoprotein A1", category: "lipid", unit: "mg/dL", description: "Apolipoprotein A1", referenceRangeText: "120-180 mg/dL", aliases: ["ApoA1", "Apo A1", "apolipoprotein A-I", "Apo A-I"] },
  { id: "ldl_particle_number", name: "LDL Particle Number", category: "lipid", unit: "nmol/L", description: "LDL particle number via NMR", referenceRangeText: "< 1000 nmol/L (desirable)", aliases: ["LDL-P", "LDL particle count", "NMR LDL-P", "LDL particles"] },
  { id: "oxidized_ldl", name: "Oxidized LDL", category: "lipid", unit: "U/L", description: "Oxidized low-density lipoprotein", referenceRangeText: "< 60 U/L", aliases: ["OxLDL", "oxidized LDL cholesterol", "Ox-LDL"] },

  // ── Thyroid Additions (2) ──
  { id: "tpo_antibodies", name: "TPO Antibodies", category: "thyroid", unit: "IU/mL", description: "Thyroid peroxidase antibodies", referenceRangeText: "< 35 IU/mL", aliases: ["TPO Ab", "thyroid peroxidase antibodies", "anti-TPO", "TPO"] },
  { id: "reverse_t3", name: "Reverse T3", category: "thyroid", unit: "ng/dL", description: "Reverse triiodothyronine", referenceRangeText: "9.2-24.1 ng/dL", aliases: ["rT3", "reverse triiodothyronine", "RT3", "reverse T3 level"] },

  // ── Vitamin/Nutrient Additions (4) ──
  { id: "omega_3_index", name: "Omega-3 Index", category: "vitamin", unit: "%", description: "Omega-3 fatty acid index (EPA + DHA as % of total RBC fatty acids)", referenceRangeText: "> 8% (optimal)", aliases: ["omega-3 index", "omega 3 index", "EPA+DHA index", "O3 index"] },
  { id: "selenium", name: "Selenium", category: "vitamin", unit: "mcg/L", description: "Serum selenium level", referenceRangeText: "70-150 mcg/L", aliases: ["Se", "serum selenium", "selenium level", "plasma selenium"] },
  { id: "copper", name: "Copper", category: "vitamin", unit: "mcg/dL", description: "Serum copper level", referenceRangeText: "70-140 mcg/dL", aliases: ["Cu", "serum copper", "copper level", "plasma copper"] },
  { id: "methylmalonic_acid", name: "Methylmalonic Acid", category: "vitamin", unit: "nmol/L", description: "Methylmalonic acid (functional B12 marker)", referenceRangeText: "87-318 nmol/L", aliases: ["MMA", "methylmalonate", "methylmalonic acid level"] },

  // ── Renal Addition (1) ──
  { id: "cystatin_c", name: "Cystatin C", category: "renal", unit: "mg/L", description: "Cystatin C (kidney filtration marker)", referenceRangeText: "0.55-1.15 mg/L", aliases: ["CysC", "cystatin C level", "serum cystatin C"] },

  // ── Hormone Additions (3) ──
  { id: "psa_total", name: "PSA (Total)", category: "hormone", unit: "ng/mL", description: "Total prostate-specific antigen", referenceRangeText: "< 4.0 ng/mL", aliases: ["PSA", "prostate specific antigen", "total PSA", "prostate-specific antigen"] },
  { id: "amh", name: "AMH", category: "hormone", unit: "ng/mL", description: "Anti-Mullerian hormone (ovarian reserve marker)", referenceRangeText: "1.0-10.0 ng/mL (women, varies by age)", aliases: ["anti-Mullerian hormone", "anti-Müllerian hormone", "AMH level", "Mullerian inhibiting substance"] },
  { id: "leptin", name: "Leptin", category: "hormone", unit: "ng/mL", description: "Leptin (satiety hormone)", referenceRangeText: "2-5.6 ng/mL (men), 3.7-11.1 ng/mL (women)", aliases: ["leptin level", "serum leptin"] },

  // ── Inflammation Addition (1) ──
  { id: "fibrinogen", name: "Fibrinogen", category: "inflammation", unit: "mg/dL", description: "Fibrinogen (coagulation and inflammation marker)", referenceRangeText: "200-400 mg/dL", aliases: ["fibrinogen activity", "fibrinogen level", "factor I"] },

  // ── Cardiac Addition (1) ──
  { id: "creatine_kinase", name: "Creatine Kinase", category: "cardiac", unit: "U/L", description: "Total creatine kinase (muscle enzyme)", referenceRangeText: "22-198 U/L (men), 22-178 U/L (women)", aliases: ["CK", "CPK", "creatine phosphokinase", "creatine kinase total", "total CK"] },
];

export const TOTAL_COUNT = BIOMARKERS.length;
