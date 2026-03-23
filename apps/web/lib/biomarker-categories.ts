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

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  metabolic: { label: "Metabolic", icon: Dna },
  hematology: { label: "Hematology", icon: Droplets },
  hormone: { label: "Hormones", icon: Syringe },
  lipid: { label: "Lipid Panel", icon: Beaker },
  vital_sign: { label: "Vital Signs", icon: BarChart3 },
  vitamin: { label: "Vitamins", icon: Sun },
  thyroid: { label: "Thyroid", icon: Bug },
  inflammation: { label: "Inflammation", icon: Flame },
  iron_study: { label: "Iron Studies", icon: FlaskConical },
  renal: { label: "Renal", icon: Bean },
  cardiac: { label: "Cardiac", icon: HeartPulse },
  wearable: { label: "Wearable", icon: Watch },
  urinalysis: { label: "Urinalysis", icon: TestTubes },
  hepatic: { label: "Hepatic", icon: LoaderPinwheel },
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
