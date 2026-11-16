/**
 * The draw sheet in Romanian, for a person whose country is RO: what a lab
 * desk at Synevo or Regina Maria reads. Names are keyed by the code the plan
 * page puts on a row (a vector's first code, `lib/recheck.ts`).
 *
 * ponytail: only the yearly core and the common serology are translated; an
 * engine test outside it keeps its English name. Add a line here when one
 * shows up on a real sheet.
 */
const RO: Record<string, string> = {
  ldl_cholesterol: "Profil lipidic (colesterol total, HDL, LDL, trigliceride)",
  apolipoprotein_b: "Apolipoproteina B (ApoB)",
  lp_a: "Lipoproteina (a)",
  hba1c: "Hemoglobină glicată (HbA1c)",
  glucose: "Glicemie à jeun",
  insulin: "Insulină à jeun",
  creatinine: "Creatinină (cu eGFR)",
  alt: "TGP (ALT), TGO (AST)",
  ggt: "GGT",
  alp: "Fosfatază alcalină",
  albumin: "Albumină",
  hemoglobin: "Hemoleucogramă completă",
  hs_crp: "Proteina C reactivă înalt sensibilă (hs-CRP)",
  crp: "Proteina C reactivă înalt sensibilă (hs-CRP)",
  tsh: "TSH",
  vitamin_d: "Vitamina D (25-OH)",
  ferritin: "Feritină",
  transferrin_saturation:
    "Sideremie, capacitate totală de legare a fierului (TIBC), saturația transferinei",
  uric_acid: "Acid uric",
  vitamin_b12: "Vitamina B12",
  folic_acid: "Acid folic seric",
  homocysteine: "Homocisteină",
  psa_total: "PSA total",
  testosterone: "Testosteron total, SHBG",
  estradiol: "Estradiol, FSH, LH",
  tpo_antibodies: "Anticorpi anti-TPO",
  cystatin_c: "Cistatina C",
  hbs_antigen: "AgHBs și anticorpi anti-HCV",
  free_t4: "FT4",
  free_t3: "FT3",
};

const day = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function romanianSheet(
  due: string,
  items: { code: string; name: string; lastDrawn?: string | null }[],
): string {
  return [
    `Analize de sânge · ${day(due)}`,
    "Recoltare dimineața, înainte de ora 10, după 10–12 ore de post (doar apă).",
    "",
    ...items.map(
      (c) =>
        `- ${RO[c.code] ?? c.name}${c.lastDrawn ? ` (ultima recoltare ${day(c.lastDrawn)})` : ""}`,
    ),
  ].join("\n");
}
