export interface PanelDef {
  id: string;
  label: string;
  metrics: string[];
}

export const PANELS: PanelDef[] = [
  {
    id: "metabolic",
    label: "Metabolic",
    metrics: ["glucose", "hba1c", "insulin", "homa_ir"],
  },
  {
    id: "lipid",
    label: "Lipid Panel",
    metrics: [
      "ldl_cholesterol",
      "cholesterol_total",
      "hdl_cholesterol",
      "triglycerides",
      "apolipoprotein_b",
      "cholesterol_hdl_ratio",
      "triglyceride_hdl_ratio",
    ],
  },
  {
    id: "inflammation",
    label: "Inflammation",
    metrics: ["hs_crp", "crp", "homocysteine"],
  },
  {
    id: "thyroid",
    label: "Thyroid",
    metrics: ["tsh", "free_t3", "free_t4", "tpo_antibodies"],
  },
  {
    id: "vitamins",
    label: "Vitamins & Minerals",
    metrics: [
      "vitamin_d",
      "vitamin_b12",
      "ferritin",
      "iron",
      "magnesium",
      "zinc",
    ],
  },
];
