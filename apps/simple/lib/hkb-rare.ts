/**
 * Seven conditions the common catalog cannot reach, each with a different
 * road in: an interview answer, a cheap chemistry number, an enzyme level, a
 * gene, a stool panel.
 *
 * They are ring 1 rather than ring 2 on purpose. Ring 2 wakes on a trigger and
 * then has to invent its rules from HPO frequencies; these seven have real
 * published likelihood ratios, so they are scored for everybody at a base rate
 * that keeps them where they belong (Fabry starts at one in forty thousand and
 * needs a great deal of evidence to be worth saying out loud).
 *
 * Every rule carries its source. Where a number is a judgement rather than a
 * published ratio it is graded C and the source says so.
 */
import type { Hypothesis } from "./hypotheses";

/* ── 1. Addison's disease: the interview and two electrolytes ─────────── */

const ADDISONS: Hypothesis = {
  id: "addisons",
  name: "Primary adrenal insufficiency (Addison's)",
  mondoId: "MONDO:0008199",
  why: "Rare, lethal untreated, and the diagnosis is routinely missed for years because the symptoms are the commonest symptoms there are (Bancos 2015 Lancet Diabetes Endocrinol).",
  summary:
    "The adrenal cortex stops making cortisol and aldosterone. Salt craving, standing dizziness, a low sodium and a high potassium are the pattern; a morning cortisol settles it.",
  priors: {
    base: 0.00014,
    source:
      "Løvås 2002 Clin Endocrinol (Norway) and Meyer 2016: prevalence 110-144 per million adults.",
    modifiers: [
      {
        when: {
          fact: "conditions",
          includes: "hashimoto|thyroid|type 1|vitiligo|coeliac",
        },
        times: 8,
        why: "Addison's clusters with the other organ-specific autoimmune diseases (autoimmune polyglandular syndrome type 2).",
        grade: "B",
        source:
          "Betterle 2002 Endocr Rev: half of autoimmune Addison's sits inside a polyglandular syndrome.",
      },
    ],
  },
  evidence: [
    {
      id: "addison_salt",
      input: { fact: "sym_salt_craving" },
      when: { equals: "Yes" },
      lr: 6,
      lrNeg: 0.7,
      grade: "C",
      source:
        "Bancos 2015 Lancet Diabetes Endocrinol: salt craving is reported by a fifth to a third of people with Addison's and is uncommon as a volunteered complaint otherwise. Grade C: no published diagnostic ratio, the number is the order of that contrast.",
    },
    {
      id: "addison_postural",
      input: { fact: "sym_dizzy_standing" },
      when: { equals: "Yes" },
      lr: 3,
      lrNeg: 0.6,
      grade: "C",
      source:
        "Bancos 2015 Lancet Diabetes Endocrinol: postural dizziness from mineralocorticoid loss is present in most cases at diagnosis. Grade C for the ratio, which is a judgement, not a measured one.",
    },
    {
      id: "addison_sodium",
      input: { metric: "sodium" },
      when: { below: 135 },
      lr: 6,
      grade: "B",
      source:
        "Bancos 2015 Lancet Diabetes Endocrinol: hyponatraemia at diagnosis in 70-80 % of primary adrenal insufficiency, against a few per cent of unselected outpatients.",
    },
    {
      id: "addison_potassium",
      input: { metric: "potassium" },
      when: { above: 5 },
      lr: 8,
      grade: "B",
      source:
        "Bancos 2015 Lancet Diabetes Endocrinol: hyperkalaemia in 30-40 % at diagnosis; it is rare in an adult with a normal creatinine.",
    },
    {
      id: "addison_cortisol_low",
      input: { metric: "cortisol_am" },
      when: { below: 5 },
      lr: 30,
      grade: "A",
      source:
        "Grossman 2010 JCEM and the Endocrine Society 2016 guideline: a morning serum cortisol under 5 µg/dL (140 nmol/L) is diagnostic of adrenal insufficiency in the absence of steroids.",
    },
    {
      id: "addison_cortisol_normal",
      input: { metric: "cortisol_am" },
      when: { above: 15 },
      lr: 0.05,
      grade: "A",
      source:
        "Grossman 2010 JCEM: a morning cortisol above 15 µg/dL (415 nmol/L) rules adrenal insufficiency out without a stimulation test.",
    },
    {
      id: "addison_acth_stim",
      input: { metric: "acth_stim_cortisol" },
      when: { below: 18 },
      lr: 40,
      lrNeg: 0.02,
      grade: "A",
      source:
        "Endocrine Society 2016 (Bornstein) guideline: a peak cortisol under 18 µg/dL 30-60 minutes after 250 µg cosyntropin confirms primary adrenal insufficiency.",
    },
  ],
  discriminators: [
    {
      test: "Sodium and potassium",
      codes: ["sodium"],
      cost: 1,
      lrPos: 6,
      lrNeg: 0.5,
      typicalPos: 131,
      typicalNeg: 140,
      unit: "mmol/L",
      howTo:
        "The cheapest test in the catalog and the one that puts adrenal failure on the list at all. Draw it with a potassium.",
    },
    {
      test: "Morning cortisol",
      codes: ["cortisol_am"],
      cost: 1,
      lrPos: 30,
      lrNeg: 0.05,
      typicalPos: 3,
      typicalNeg: 16,
      unit: "µg/dL",
      howTo:
        "Between 8 and 9 in the morning, off any steroid including inhaled and skin preparations. Under 5 is diagnostic, over 15 excludes it.",
    },
    {
      test: "ACTH stimulation test",
      codes: ["acth_stim_cortisol"],
      cost: 2,
      lrPos: 40,
      lrNeg: 0.02,
      typicalPos: 12,
      typicalNeg: 25,
      unit: "µg/dL",
      howTo:
        "250 µg synthetic ACTH, cortisol at 30 and 60 minutes. A peak under 18 µg/dL confirms it. Book it through an endocrinologist.",
    },
  ],
  lenses: { lifespan: { w: 3, grade: "A" }, energy: { w: 3, grade: "A" } },
  management:
    "This is an emergency diagnosis, not a slow one: untreated Addison's kills through adrenal crisis. A morning cortisol under 5 µg/dL, or a low-normal one with a low sodium and a high potassium, goes to an endocrinologist the same week. Treatment is hydrocortisone and fludrocortisone for life, with a doubling rule for illness and an emergency injection at home.",
};

/* ── 2. Wilson disease: a young liver ─────────────────────────────────── */

const WILSON: Hypothesis = {
  id: "wilson",
  name: "Wilson disease",
  mondoId: "MONDO:0010200",
  why: "A treatable cause of cirrhosis and of movement disorder in a young adult; missing it costs a liver (EASL 2012 guideline).",
  summary:
    "Copper cannot leave the liver, so it accumulates there and then in the brain. A raised ALT in someone under 40 with a low ceruloplasmin is the pattern.",
  appliesTo: { maxAge: 55 },
  priors: {
    base: 0.000033,
    source:
      "EASL 2012 clinical practice guideline: prevalence about 1 in 30 000, higher where consanguinity is common.",
    modifiers: [],
  },
  evidence: [
    {
      id: "wilson_ceruloplasmin_low",
      input: { metric: "ceruloplasmin" },
      when: { below: 20 },
      lr: 8,
      lrNeg: 0.2,
      grade: "A",
      source:
        "EASL 2012: a serum ceruloplasmin under 20 mg/dL is found in 85-90 % of Wilson patients; a normal one makes it unlikely in the absence of other findings.",
    },
    {
      id: "wilson_ceruloplasmin_very_low",
      input: { metric: "ceruloplasmin" },
      when: { below: 10 },
      lr: 30,
      grade: "A",
      source:
        "EASL 2012: under 10 mg/dL is strong evidence on its own and is one of the Leipzig score's two-point items.",
    },
    {
      id: "wilson_alt",
      input: { metric: "alt" },
      when: { above: 40 },
      lr: 2,
      grade: "B",
      source:
        "Ferenci 2007 Liver Int: unexplained transaminitis in a person under 40 is the commonest presentation of Wilson disease.",
    },
    {
      id: "wilson_tremor",
      input: { fact: "sym_tremor" },
      when: { equals: "Yes" },
      lr: 5,
      lrNeg: 0.8,
      grade: "C",
      source:
        "EASL 2012: about a third present neurologically, tremor first. Grade C: the ratio is the order of that against tremor in the general young adult population, not a measured one.",
    },
    {
      id: "wilson_atp7b",
      input: { fact: "genome:atp7b" },
      when: { includes: "pathogenic" },
      lr: 60,
      grade: "A",
      source:
        "EASL 2012: two pathogenic ATP7B variants are diagnostic; one is a Leipzig one-point item and is common enough in the population that it is not, on its own.",
    },
    {
      id: "wilson_urine_copper",
      input: { metric: "urine_copper_24h" },
      when: { above: 100 },
      lr: 25,
      lrNeg: 0.1,
      grade: "A",
      source:
        "EASL 2012: a 24-hour urinary copper above 100 µg (1.6 µmol) is a Leipzig two-point criterion; under 40 µg makes the diagnosis unlikely.",
    },
  ],
  discriminators: [
    {
      test: "Ceruloplasmin",
      codes: ["ceruloplasmin"],
      cost: 1,
      lrPos: 8,
      lrNeg: 0.2,
      typicalPos: 9,
      typicalNeg: 28,
      unit: "mg/dL",
      howTo:
        "One tube, no preparation. It is an acute-phase protein, so a normal value during an infection does not exclude anything.",
    },
    {
      test: "24-hour urine copper",
      codes: ["urine_copper_24h"],
      cost: 2,
      lrPos: 25,
      lrNeg: 0.1,
      typicalPos: 180,
      typicalNeg: 25,
      unit: "µg/24h",
      howTo:
        "A full day's urine in an acid-washed container. Slit-lamp for Kayser-Fleischer rings is booked at the same time.",
    },
  ],
  lenses: { lifespan: { w: 3, grade: "A" } },
  management:
    "A low ceruloplasmin with a raised ALT under 40 goes to a hepatologist for 24-hour urine copper and a slit-lamp examination. Treatment is chelation or zinc, for life, and it works: treated early, life expectancy is normal.",
};

/* ── 3. Gilbert syndrome: the reassurance path ────────────────────────── */

const GILBERT: Hypothesis = {
  id: "gilbert",
  name: "Gilbert syndrome",
  mondoId: "MONDO:0008738",
  why: "Five to ten per cent of people have it, it is entirely benign, and it is the commonest reason a healthy person is sent for a liver ultrasound they do not need (Bosma 1995 NEJM).",
  summary:
    "A slow conjugating enzyme leaves a little unconjugated bilirubin in the blood, more when fasting or unwell. Normal enzymes, normal blood count, nothing to treat.",
  priors: {
    base: 0.07,
    source:
      "Bosma 1995 NEJM and Radlović 2014: the UGT1A1 promoter variant is homozygous in 5-10 % of Europeans, and about half of those run a raised bilirubin.",
    modifiers: [
      {
        when: { sex: "male" },
        times: 2,
        why: "Men run higher bilirubin at the same genotype, so the phenotype is about twice as common.",
        grade: "B",
        source:
          "Bosma 1995 NEJM: sex difference in expressed hyperbilirubinaemia.",
      },
    ],
  },
  evidence: [
    {
      id: "gilbert_indirect_high",
      input: { metric: "indirect_bilirubin" },
      when: { above: 1.2 },
      lr: 12,
      lrNeg: 0.1,
      grade: "B",
      source:
        "Radlović 2014 Srp Arh Celok Lek: isolated unconjugated hyperbilirubinaemia with normal liver enzymes and no haemolysis is Gilbert syndrome in the great majority of adults. Grade B: the definition is a pattern, so the ratio is derived from how often that pattern has another cause.",
    },
    {
      id: "gilbert_enzymes_normal",
      input: { metric: "alt" },
      when: { above: 40 },
      lr: 0.25,
      grade: "B",
      source:
        "Fevery 2008 Liver Int: Gilbert syndrome does not raise the transaminases. A raised ALT means the bilirubin has another explanation.",
    },
    {
      id: "gilbert_no_haemolysis",
      input: { metric: "reticulocytes" },
      when: { above: 2.5 },
      lr: 0.15,
      grade: "A",
      source:
        "Fevery 2008 Liver Int: a raised reticulocyte count says the bilirubin is coming from red cells being destroyed, which is the differential Gilbert has to be separated from.",
    },
    {
      id: "gilbert_haemoglobin_normal",
      input: { metric: "hemoglobin" },
      when: { belowOptimal: true },
      lr: 0.4,
      grade: "B",
      source:
        "Fevery 2008 Liver Int: anaemia with a raised bilirubin points at haemolysis rather than at a conjugation defect.",
    },
  ],
  discriminators: [
    {
      test: "Bilirubin fractions with a blood count and reticulocytes",
      codes: ["indirect_bilirubin"],
      cost: 1,
      lrPos: 12,
      lrNeg: 0.1,
      typicalPos: 2.1,
      typicalNeg: 0.5,
      unit: "mg/dL",
      howTo:
        "One draw settles it: split the bilirubin, and check the enzymes, the haemoglobin and the reticulocytes on the same sample. If they are all normal, no imaging is needed.",
    },
  ],
  lenses: { lifespan: { w: 0, grade: "A" } },
  management:
    "Nothing to do. It is benign, it does not shorten life, and a raised bilirubin on a routine panel with normal enzymes and no anaemia needs no scan and no referral. Worth knowing about because it changes the dose of a few drugs (irinotecan, atazanavir) and because the jaundice when you fast or catch flu is otherwise frightening.",
};

/* ── 4. Alpha-1 antitrypsin deficiency: one level ─────────────────────── */

const A1AT: Hypothesis = {
  id: "a1at_deficiency",
  name: "Alpha-1 antitrypsin deficiency",
  mondoId: "MONDO:0013282",
  why: "One in two to five thousand Europeans, under-diagnosed by about nine tenths, and it changes what you do about the lungs and the liver (ATS/ERS 2003 statement).",
  summary:
    "A protease inhibitor that does not leave the liver: emphysema early in the lungs, sometimes cirrhosis in the liver. One blood level asks the question.",
  priors: {
    base: 0.0004,
    source:
      "Blanco 2017 Int J COPD (PiZZ prevalence in Europe, about 1 in 2500-5000) and de Serres 2012.",
    modifiers: [],
  },
  evidence: [
    {
      id: "a1at_level_low",
      input: { metric: "aat_level" },
      when: { below: 57 },
      lr: 30,
      lrNeg: 0.05,
      grade: "A",
      source:
        "ATS/ERS 2003 standards: a serum alpha-1 antitrypsin under 57 mg/dL (11 µM) is the protective threshold and is the trigger for phenotyping.",
    },
    {
      id: "a1at_breathless",
      input: { fact: "sym_breathless" },
      when: { equals: "Yes" },
      lr: 3,
      lrNeg: 0.7,
      grade: "C",
      source:
        "ATS/ERS 2003: early-onset breathlessness, particularly in a never-smoker, is the presentation that should trigger testing. Grade C: the ratio is a judgement about who volunteers that symptom.",
    },
    {
      id: "a1at_family",
      input: { fact: "family_history" },
      when: { includes: "emphysema|copd|alpha-1|alpha 1|cirrhosis|liver disease" },
      lr: 4,
      grade: "B",
      source:
        "ATS/ERS 2003 standards: testing is recommended for siblings and for anyone with a first-degree relative who has emphysema or unexplained liver disease, because the carrier rate in those families is an order of magnitude above the population's.",
    },
    {
      id: "a1at_alt",
      input: { metric: "alt" },
      when: { above: 40 },
      lr: 2,
      grade: "C",
      source:
        "Townsend 2018 Hepatol Commun: unexplained liver enzyme elevation in an adult is one of the two ways alpha-1 antitrypsin deficiency presents. Grade C for the size of the ratio.",
    },
    {
      id: "a1at_serpina1",
      input: { fact: "genome:serpina1" },
      when: { includes: "pathogenic" },
      lr: 60,
      grade: "A",
      source:
        "ATS/ERS 2003 standards: the Z and S alleles of SERPINA1 are what a sequencing report calls; ZZ is the classic deficiency phenotype.",
    },
    {
      id: "a1at_phenotype",
      input: { metric: "aat_phenotype" },
      when: { above: 0.5 },
      lr: 50,
      lrNeg: 0.02,
      grade: "A",
      source:
        "ATS/ERS 2003: phenotyping (isoelectric focusing) or genotyping for the S and Z alleles is the confirmatory test.",
    },
  ],
  discriminators: [
    {
      test: "Alpha-1 antitrypsin level",
      codes: ["aat_level"],
      cost: 1,
      lrPos: 30,
      lrNeg: 0.05,
      typicalPos: 45,
      typicalNeg: 130,
      unit: "mg/dL",
      howTo:
        "One tube. It is an acute-phase protein, so a borderline level during an infection is repeated when well.",
    },
    {
      test: "Alpha-1 antitrypsin phenotype (Pi typing)",
      codes: ["aat_phenotype"],
      cost: 2,
      lrPos: 50,
      lrNeg: 0.02,
      typicalPos: 1,
      typicalNeg: 0,
      howTo:
        "Isoelectric focusing or a genotype for S and Z. It is what turns a low level into a diagnosis and tells the family what to test for.",
    },
  ],
  lenses: { lifespan: { w: 3, grade: "A" } },
  management:
    "Never smoke, and never be in smoke: that single decision is most of the prognosis. A confirmed deficiency means annual spirometry, hepatitis A and B vaccination, liver ultrasound surveillance, and testing for siblings and children. Augmentation therapy is for established emphysema and is a specialist decision.",
};

/* ── 5. Fabry disease: the interview, then the gene ───────────────────── */

const FABRY: Hypothesis = {
  id: "fabry",
  name: "Fabry disease",
  mondoId: "MONDO:0010526",
  why: "An X-linked enzyme deficiency that takes the kidneys and the heart in the fourth decade, with a specific treatment and an average diagnostic delay of over ten years (Germain 2010 Orphanet J Rare Dis).",
  summary:
    "Alpha-galactosidase A is missing, so globotriaosylceramide accumulates in vessels and nerves. Burning hands and feet in the heat from childhood, no sweating, then protein in the urine.",
  priors: {
    base: 0.000025,
    source:
      "Germain 2010 Orphanet J Rare Dis: classic Fabry in about 1 in 40 000 males; newborn screening finds later-onset variants far more often.",
    modifiers: [
      {
        when: { sex: "male" },
        times: 2,
        why: "X-linked: males are affected earlier and more severely, though heterozygous women are not spared.",
        grade: "A",
        source: "Germain 2010 Orphanet J Rare Dis: X-linked inheritance.",
      },
    ],
  },
  evidence: [
    {
      id: "fabry_acroparesthesia",
      input: { fact: "sym_acroparesthesia" },
      when: { equals: "Yes" },
      lr: 15,
      lrNeg: 0.4,
      grade: "C",
      source:
        "Germain 2010 Orphanet J Rare Dis: burning pain in the hands and feet brought on by heat, fever or exercise is present in 60-80 % of classic Fabry from childhood and is a very unusual complaint otherwise. Grade C: no published diagnostic ratio; 15 is the order of that contrast.",
    },
    {
      id: "fabry_anhidrosis",
      input: { fact: "sym_anhidrosis" },
      when: { equals: "Yes" },
      lr: 8,
      lrNeg: 0.6,
      grade: "C",
      source:
        "Germain 2010 Orphanet J Rare Dis: reduced or absent sweating is reported by more than half of affected males. Grade C for the ratio.",
    },
    {
      id: "fabry_proteinuria",
      input: { metric: "urine_albumin_creatinine_ratio" },
      when: { above: 30 },
      lr: 3,
      grade: "B",
      source:
        "Ortiz 2018 Mol Genet Metab (Fabry Registry): albuminuria is the first renal sign and appears in the third decade in classic disease.",
    },
    {
      id: "fabry_gla",
      input: { fact: "genome:gla" },
      when: { includes: "pathogenic" },
      lr: 200,
      grade: "A",
      source:
        "Germain 2010 Orphanet J Rare Dis: in a male, a pathogenic GLA variant with a compatible phenotype is the diagnosis; ACMG-classified pathogenic variants are what a sequencing report calls out.",
    },
    {
      id: "fabry_enzyme",
      input: { metric: "alpha_gal_a" },
      when: { below: 1 },
      lr: 100,
      lrNeg: 0.05,
      grade: "A",
      source:
        "Germain 2010 Orphanet J Rare Dis: alpha-galactosidase A activity under 1 % of the mean in a male is diagnostic. In women the enzyme can be normal, which is why the gene is the test in females.",
    },
  ],
  discriminators: [
    {
      test: "Alpha-galactosidase A activity (dried blood spot)",
      codes: ["alpha_gal_a"],
      cost: 2,
      lrPos: 100,
      lrNeg: 0.05,
      typicalPos: 0.4,
      typicalNeg: 8,
      unit: "% of mean",
      howTo:
        "A dried blood spot posted to a metabolic laboratory. Diagnostic in males; in females it can be normal and the GLA gene is what answers the question.",
    },
  ],
  lenses: { lifespan: { w: 3, grade: "A" } },
  management:
    "A metabolic or genetics clinic, enzyme activity in males and GLA sequencing in both sexes, then family screening: one diagnosis usually finds five relatives. Enzyme replacement or chaperone therapy started before the kidneys scar is what changes the outcome, so this is one of the few rare diseases where the speed of the diagnosis is the treatment.",
};

/* ── 6. Mast cell activation: one tryptase ────────────────────────────── */

const MCAS: Hypothesis = {
  id: "mast_cell_activation",
  name: "Mast cell activation or systemic mastocytosis",
  mondoId: "MONDO:0016586",
  why: "Flushing, hives and unexplained anaphylaxis with a raised baseline tryptase is a diagnosis that changes both the treatment and what has to be carried in a pocket (Valent 2021 Blood).",
  summary:
    "Mast cells release their contents on too little provocation, or there are too many of them. Baseline tryptase is the one number that separates it from ordinary allergy.",
  priors: {
    base: 0.0001,
    source:
      "Cohen 2014 Br J Haematol (Danish registry): systemic mastocytosis prevalence about 13 per 100 000; symptomatic mast cell activation is commoner and less well counted.",
    modifiers: [],
  },
  evidence: [
    {
      id: "mcas_tryptase_high",
      input: { metric: "tryptase" },
      when: { above: 11.4 },
      lr: 10,
      lrNeg: 0.2,
      grade: "A",
      source:
        "Valent 2021 Blood (WHO/ECNM consensus): 11.4 ng/mL is the upper reference limit for baseline serum tryptase.",
    },
    {
      id: "mcas_tryptase_criterion",
      input: { metric: "tryptase" },
      when: { above: 20 },
      lr: 30,
      grade: "A",
      source:
        "Valent 2021 Blood: a persistently raised baseline tryptase above 20 ng/mL is a minor diagnostic criterion for systemic mastocytosis.",
    },
    {
      id: "mcas_flushing",
      input: { fact: "sym_flushing" },
      when: { equals: "Yes" },
      lr: 4,
      lrNeg: 0.6,
      grade: "C",
      source:
        "Valent 2012 J Allergy Clin Immunol: flushing is one of the defining episodic symptoms. Grade C: the ratio is a judgement against how often adults report flushing for other reasons.",
    },
    {
      id: "mcas_hypotension",
      input: { fact: "sym_dizzy_standing" },
      when: { equals: "Yes" },
      lr: 3,
      lrNeg: 0.7,
      grade: "C",
      source:
        "Valent 2012 J Allergy Clin Immunol and Valent 2021 Blood: presyncope and hypotension are among the defining episodic mediator symptoms, and the consensus criteria weight cardiovascular involvement heavily. Grade C: the ratio is a judgement against how often adults report standing dizziness.",
    },
    {
      id: "mcas_hives",
      input: { fact: "sym_hives" },
      when: { equals: "Yes" },
      lr: 3,
      lrNeg: 0.7,
      grade: "C",
      source:
        "Valent 2012 J Allergy Clin Immunol: urticaria, particularly urticaria pigmentosa, is the commonest skin finding. Grade C for the ratio.",
    },
  ],
  discriminators: [
    {
      test: "Baseline serum tryptase",
      codes: ["tryptase"],
      cost: 1,
      lrPos: 30,
      lrNeg: 0.2,
      typicalPos: 18,
      typicalNeg: 4,
      unit: "ng/mL",
      howTo:
        "Drawn at least 24 hours after any reaction, so it is a baseline and not a spike. A raised baseline is repeated once before it is believed.",
    },
  ],
  lenses: { lifespan: { w: 2, grade: "B" }, energy: { w: 2, grade: "C" } },
  management:
    "A raised baseline tryptase goes to haematology or allergy: hereditary alpha-tryptasaemia (a TPSAB1 copy-number variant) explains a good share of them and is benign, and the rest need a KIT D816V and sometimes a marrow. Meanwhile: an adrenaline pen, H1 and H2 blockers, and a written list of the triggers.",
};

/* ── 7. SIBO: the gut panel ───────────────────────────────────────────── */

const SIBO: Hypothesis = {
  id: "sibo",
  name: "Small intestinal bacterial overgrowth",
  why: "Bloating with alternating bowels is one of the commonest reasons anybody looks at their gut at all, and this is the version of it that has a test and an antibiotic (Pimentel 2020 Am J Gastroenterol).",
  summary:
    "Colonic bacteria growing where the small intestine should be nearly sterile: gas after meals, bloating, and B12 consumed while folate is manufactured.",
  priors: {
    base: 0.05,
    source:
      "Bushyhead 2022 Gastroenterol Clin North Am: 15-30 % of people meeting IBS criteria test positive; the unselected adult rate is a few per cent.",
    modifiers: [
      {
        when: {
          fact: "medications",
          includes: "omeprazole|esomeprazole|pantoprazole|lansoprazole|ppi",
        },
        times: 2,
        why: "Acid suppression removes the barrier that keeps the small bowel sterile.",
        grade: "B",
        source:
          "Lo 2013 Clin Gastroenterol Hepatol: meta-analysis of PPI use and SIBO.",
      },
    ],
  },
  evidence: [
    {
      id: "sibo_bloating",
      input: { fact: "sym_bloating" },
      when: { equals: "Yes" },
      lr: 3,
      lrNeg: 0.4,
      grade: "C",
      source:
        "Pimentel 2020 Am J Gastroenterol (ACG clinical guideline): bloating and distension are the symptoms the test is validated against. Grade C: the ratio is a judgement, since bloating is common.",
    },
    {
      id: "sibo_bowel",
      input: { fact: "sym_bowel" },
      when: { equals: "Diarrhoea and bloating" },
      lr: 2.5,
      grade: "C",
      source:
        "Pimentel 2020 Am J Gastroenterol: diarrhoea-predominant symptoms are the phenotype most often positive. Grade C for the ratio.",
    },
    {
      id: "sibo_b12_low",
      input: { metric: "vitamin_b12" },
      when: { below: 300 },
      lr: 2,
      grade: "C",
      source:
        "Rezaie 2017 Am J Gastroenterol (North American Consensus): bacteria consume B12 in the small bowel. Grade C: a supportive pattern, not a diagnostic ratio.",
    },
    {
      id: "sibo_folate_high",
      input: { metric: "folic_acid" },
      when: { above: 20 },
      lr: 3,
      grade: "C",
      source:
        "Rezaie 2017 Am J Gastroenterol: bacteria synthesise folate, so a high folate with a low B12 is the classic biochemical signature. Grade C: the pattern is described, the ratio is a judgement.",
    },
    {
      id: "sibo_breath",
      input: { metric: "breath_h2_peak" },
      when: { above: 20 },
      lr: 8,
      lrNeg: 0.3,
      grade: "B",
      source:
        "Rezaie 2017 Am J Gastroenterol (North American Consensus): a rise in breath hydrogen of 20 ppm or more above baseline within 90 minutes of glucose or lactulose is a positive test.",
    },
    {
      id: "sibo_dysbiosis",
      input: { metric: "dysbiosis_index" },
      when: { above: 3 },
      lr: 4,
      grade: "C",
      source:
        "Casén 2015 Aliment Pharmacol Ther: the GA-map dysbiosis index separates IBS and IBD patients from healthy controls at a cut-off of 3 on a 1-5 scale. Grade C for using it as evidence of overgrowth specifically.",
    },
    {
      id: "sibo_calprotectin",
      input: { metric: "calprotectin" },
      when: { above: 50 },
      lr: 0.5,
      grade: "B",
      source:
        "Menees 2015 Am J Gastroenterol: a faecal calprotectin above 50 µg/g moves the differential towards inflammatory bowel disease, which is the diagnosis that must not be missed here.",
    },
  ],
  discriminators: [
    {
      test: "Hydrogen and methane breath test",
      codes: ["breath_h2_peak"],
      cost: 2,
      lrPos: 8,
      lrNeg: 0.3,
      typicalPos: 35,
      typicalNeg: 8,
      unit: "ppm rise",
      howTo:
        "Glucose or lactulose after a preparation day, then breath samples every 15-20 minutes for two hours. A 20 ppm rise inside 90 minutes is positive.",
    },
    {
      test: "Microbiome stool panel",
      codes: ["dysbiosis_index"],
      cost: 3,
      lrPos: 4,
      lrNeg: 0.6,
      typicalPos: 4,
      typicalNeg: 1,
      unit: "index 1-5",
      howTo:
        "One stool sample: a dysbiosis index, faecal calprotectin for inflammation and pancreatic elastase for exocrine failure, so the three commonest explanations are separated in one go.",
    },
  ],
  lenses: { lifespan: { w: 1, grade: "C" }, energy: { w: 2, grade: "C" } },
  management:
    "Test before treating: a positive breath test earns rifaximin, a negative one sends the investigation elsewhere. Check the causes rather than repeating the course, because it comes back: acid suppression, opiates, adhesions, coeliac disease and diabetic gastroparesis are the usual ones. Faecal calprotectin first if there is any alarm feature at all.",
};

export const RARE: Hypothesis[] = [
  ADDISONS,
  WILSON,
  GILBERT,
  A1AT,
  FABRY,
  MCAS,
  SIBO,
];
