/**
 * The SNPs a consumer array carries that are worth reading, and nothing else.
 *
 * One row per gene (or per HLA tag pair), each with the rsids it needs, the
 * call it makes from those genotypes, what the call means in one sentence, the
 * evidence grade, and the named source. `lib/genome.ts` parses a raw file
 * against this list; `lib/hkb-catalog.ts` carries the matching prior modifiers
 * and evidence rows; the upload page prints it as a table.
 *
 * Pure data plus one small function per row. No database, no clock.
 */
import { CATALOG } from "./hkb-catalog";
import type { Grade } from "./hypotheses";

export interface GenomeCall {
  /** The alleles as the array reported them, sorted, e.g. `CT`. */
  genotype: string;
  /** What goes into the profile fact: `e3/e4`, `carrier`, `CT`. */
  call: string;
  /** One plain sentence about this person's own call. */
  meaning: string;
  /** Extra profile facts this row writes beyond `factKey`, keyed by fact. */
  facts?: Record<string, string>;
}

export interface GenomeRow {
  /** `apoe`; the profile fact is `factKey`, by default `genome:apoe`. */
  id: string;
  gene: string;
  rsids: string[];
  /** The profile fact this row writes. */
  factKey: string;
  /** What the call does downstream, in the words of the catalog. */
  effect: string;
  /** Why this SNP is in the list at all. */
  why: string;
  grade: Grade;
  source: string;
  /** The catalog conditions this row moves, for the table and for `nextMoves`. */
  conditions: string[];
  /** The call, or null when the array does not carry the rsids it needs. */
  call: (g: Record<string, string>) => GenomeCall | null;
  /** Two believable calls, so a missing genome can be simulated as a move. */
  sample?: [string, string];
}

/** Alleles sorted, so `TC` and `CT` are one genotype. `--` and `II` are noise. */
export const normalizeGenotype = (raw: string): string | null => {
  const clean = raw
    .trim()
    .toUpperCase()
    .replace(/[^ACGTDI]/g, "");
  if (!clean || /[DI]/.test(clean)) return null;
  return clean.split("").sort().join("");
};

/** How many copies of `allele` the genotype carries. */
const count = (genotype: string | undefined, allele: string) =>
  genotype ? genotype.split("").filter((a) => a === allele).length : 0;

/** Every rsid present, or null: a row is only called when its inputs are there. */
function need(g: Record<string, string>, rsids: string[]): string[] | null {
  const out = rsids.map((r) => g[r]);
  return out.every((v): v is string => !!v) ? out : null;
}

/** Any of the rsids present; the ones that are missing read as absent. */
const some = (g: Record<string, string>, rsids: string[]) =>
  rsids.some((r) => g[r]);

const shown = (g: Record<string, string>, rsids: string[]) =>
  rsids
    .filter((r) => g[r])
    .map((r) => `${r} ${g[r]}`)
    .join(", ");

/**
 * The ε haplotype pair from the two coding SNPs. rs429358 C is the ε4 allele,
 * rs7412 T is the ε2 allele; everything else follows from the pair.
 */
const APOE_PAIRS: Record<string, string> = {
  "TT|TT": "e2/e2",
  "TT|CT": "e2/e3",
  "TT|CC": "e3/e3",
  "CT|CT": "e2/e4",
  "CT|CC": "e3/e4",
  "CC|CC": "e4/e4",
  "CT|TT": "e1/e2",
  "CC|CT": "e1/e3",
  "CC|TT": "e1/e4",
};

export const GENOME_CATALOG: GenomeRow[] = [
  {
    id: "apoe",
    gene: "APOE",
    rsids: ["rs429358", "rs7412"],
    factKey: "genome:apoe",
    effect:
      "ascvd_risk prior ×1.3 for an ε4 carrier; the lipid target moves down and the dementia risk is a fact with no condition behind it yet.",
    why: "APOE is the largest common-variant effect on both LDL handling and late-onset dementia; one ε4 copy raises coronary risk by about a quarter and dementia risk about threefold.",
    grade: "A",
    source:
      "Bennet 2007 JAMA (APOE genotype and coronary risk, 82 studies); Farrer 1997 JAMA (APOE and Alzheimer meta-analysis); ClinVar rs429358 / rs7412.",
    conditions: ["ascvd_risk"],
    sample: ["e3/e4", "e3/e3"],
    call: (g) => {
      const pair = need(g, ["rs429358", "rs7412"]);
      if (!pair) return null;
      const call = APOE_PAIRS[`${pair[0]}|${pair[1]}`];
      if (!call) return null;
      const e4 = call.includes("e4");
      const e2 = call.includes("e2");
      return {
        genotype: shown(g, ["rs429358", "rs7412"]),
        call,
        meaning: e4
          ? `ε4 carrier (${call}): LDL runs higher for the same diet and the lifetime dementia risk is raised. It changes how hard the LDL target is chased, not what is done.`
          : e2
            ? `${call}: ε2 lowers LDL and lowers dementia risk, and in rare cases carries type III hyperlipoproteinaemia.`
            : `${call}: the common pair, no APOE-driven change to the lipid target.`,
      };
    },
  },
  {
    id: "lpa",
    gene: "LPA",
    rsids: ["rs10455872", "rs3798220"],
    factKey: "genome:lpa",
    effect: "lpa_elevated evidence, LR 4 for a carrier of either risk allele.",
    why: "These two variants tag the short kringle-IV repeat alleles that set lipoprotein(a) concentration for life; carrying one roughly doubles Lp(a) and raises coronary risk independently of LDL.",
    grade: "A",
    source:
      "Clarke 2009 N Engl J Med (PROCARDIS: rs10455872 and rs3798220 with Lp(a) and coronary disease); Kamstrup 2009 JAMA.",
    conditions: ["lpa_elevated"],
    sample: ["carrier", "non-carrier"],
    call: (g) => {
      if (!some(g, ["rs10455872", "rs3798220"])) return null;
      const copies = count(g.rs10455872, "G") + count(g.rs3798220, "C");
      return {
        genotype: shown(g, ["rs10455872", "rs3798220"]),
        call: copies > 0 ? "carrier" : "non-carrier",
        meaning:
          copies > 0
            ? "Carries a short-kringle Lp(a) allele: measure Lp(a) once. It is set at birth and never needs repeating."
            : "Neither risk allele. Lp(a) is still worth measuring once, because these two SNPs only explain part of it.",
      };
    },
  },
  {
    id: "hfe",
    gene: "HFE",
    rsids: ["rs1800562", "rs1799945"],
    factKey: "genome:hfe",
    effect:
      "haemochromatosis: C282Y homozygous LR 50, C282Y/H63D compound heterozygous LR 5.",
    why: "C282Y homozygosity is the cause of the great majority of hereditary haemochromatosis in Northern European ancestry; the compound heterozygote is a much weaker but real risk.",
    grade: "A",
    source:
      "Feder 1996 Nat Genet (HFE discovery); EASL 2022 clinical practice guidelines on haemochromatosis; ClinVar rs1800562 (C282Y), rs1799945 (H63D).",
    conditions: ["haemochromatosis"],
    sample: ["C282Y homozygous", "no C282Y or H63D"],
    call: (g) => {
      if (!some(g, ["rs1800562", "rs1799945"])) return null;
      const c282y = count(g.rs1800562, "A");
      const h63d = count(g.rs1799945, "G");
      const call =
        c282y === 2
          ? "C282Y homozygous"
          : c282y === 1 && h63d >= 1
            ? "C282Y/H63D compound heterozygous"
            : c282y === 1
              ? "C282Y heterozygous"
              : h63d === 2
                ? "H63D homozygous"
                : h63d === 1
                  ? "H63D heterozygous"
                  : "no C282Y or H63D";
      const meaning: Record<string, string> = {
        "C282Y homozygous":
          "The genotype behind most hereditary haemochromatosis. Ferritin and transferrin saturation decide whether it ever became iron overload.",
        "C282Y/H63D compound heterozygous":
          "A real but much smaller risk of iron loading; it usually needs a second reason (alcohol, fatty liver) to become a problem.",
        "C282Y heterozygous":
          "One copy. Carriers run slightly higher ferritin and transferrin saturation and essentially never load iron on this alone.",
        "H63D homozygous":
          "Two H63D copies, weak on their own; iron studies decide the question.",
        "H63D heterozygous":
          "One H63D copy. On its own it means almost nothing.",
        "no C282Y or H63D":
          "Neither common HFE variant, so the usual genetic cause of iron overload is off the table.",
      };
      return {
        genotype: shown(g, ["rs1800562", "rs1799945"]),
        call,
        meaning: meaning[call]!,
      };
    },
  },
  {
    id: "hla_dq",
    gene: "HLA DR3-DQ2.5 haplotype tag",
    rsids: ["rs2187668", "rs7454108", "rs660895"],
    factKey: "genome:hla_dq",
    effect:
      "coeliac_disease: a DQ2.5 or DQ8 carrier multiplies the prior by 3; carrying neither tag is an LR of 0.1 against. hashimoto prior ×1.5 and atrophic_gastritis prior ×1.5 from DR3/DR4.",
    why: "rs2187668 tags one haplotype that two stories read: it is the DQ2.5 tag coeliac disease needs and the DR3 tag the autoimmune thyroid and gastric stories read, so it is one row here rather than two.",
    grade: "A",
    source:
      "Monsuur 2008 PLoS ONE (the rs2187668 T allele tags DQ2.5-DR3, rs7454108 C tags DQ8); Karell 2003 Hum Immunol; NICE NG20 coeliac guidance on HLA testing as a rule-out; Zeitlin 2008 Clin Endocrinol and Jacobson 2008 Clin Immunol for DR3/DR4 and autoimmunity; rs660895 tags DRB1*04:01 (Raychaudhuri 2012 Nat Genet).",
    conditions: ["coeliac_disease", "hashimoto", "atrophic_gastritis"],
    sample: ["carries DQ2.5", "no DQ2.5 or DQ8 tag"],
    call: (g) => {
      if (!some(g, ["rs2187668", "rs7454108", "rs660895"])) return null;
      const dq2 = count(g.rs2187668, "T") > 0;
      const dq8 = count(g.rs7454108, "C") > 0;
      const dr4 = count(g.rs660895, "G") > 0;
      const call =
        dq2 && dq8
          ? "carries DQ2.5 and DQ8"
          : dq2
            ? "carries DQ2.5"
            : dq8
              ? "carries DQ8"
              : "no DQ2.5 or DQ8 tag";
      // The same rs2187668 T allele is the DR3 tag, and the DR story is a
      // separate fact because a separate set of catalog rules reads it.
      const dr =
        dq2 && dr4
          ? "carries DR3 and DR4"
          : dq2
            ? "carries DR3"
            : dr4
              ? "carries DR4"
              : "no DR3 or DR4 tag";
      return {
        genotype: shown(g, ["rs2187668", "rs7454108", "rs660895"]),
        call,
        facts: { "genome:hla_dr": dr },
        meaning:
          (call === "no DQ2.5 or DQ8 tag"
            ? "Coeliac disease is essentially excluded: over 99 % of people with it carry one of these two haplotypes."
            : "Carries the permissive coeliac haplotype. About a third of Europeans do and almost none of them get coeliac disease, so this only raises the question; serology answers it.") +
          (dr === "no DR3 or DR4 tag"
            ? " Neither shared autoimmune haplotype tag, which argues mildly against the thyroid and gastric autoimmune stories."
            : ` Also ${dr}, a shared autoimmune haplotype behind thyroid and gastric autoimmunity; it is common and most carriers never get an autoimmune disease.`),
      };
    },
  },
  {
    id: "tcf7l2",
    gene: "TCF7L2",
    rsids: ["rs7903146"],
    factKey: "genome:tcf7l2",
    effect: "type2_diabetes prior ×1.4 per T allele.",
    why: "rs7903146 is the largest common-variant effect on type 2 diabetes risk found so far, acting through impaired insulin secretion.",
    grade: "A",
    source:
      "Grant 2006 Nat Genet (deCODE, TCF7L2 and type 2 diabetes); Florez 2006 N Engl J Med (DPP: the risk is preventable by lifestyle).",
    conditions: ["type2_diabetes"],
    sample: ["CT", "CC"],
    call: (g) => {
      const gt = g.rs7903146;
      if (!gt) return null;
      const t = count(gt, "T");
      return {
        genotype: `rs7903146 ${gt}`,
        call: gt,
        meaning:
          t === 0
            ? "No risk allele at the strongest common type 2 diabetes locus."
            : `${t} risk allele${t > 1 ? "s" : ""}: about ${t === 1 ? "40 % above" : "twice"} the background risk, and the DPP trial showed lifestyle change erases most of it.`,
      };
    },
  },
  {
    id: "mthfr",
    gene: "MTHFR",
    rsids: ["rs1801133"],
    factKey: "genome:mthfr",
    effect: "folate_deficiency prior ×1.5 for the 677TT genotype. Weak.",
    why: "677TT lowers MTHFR enzyme activity and raises homocysteine when folate intake is low. Widely over-read: with adequate folate it does almost nothing.",
    grade: "C",
    source:
      "Frosst 1995 Nat Genet (C677T); Clarke 2012 PLoS Med (MTHFR, homocysteine and disease: the effect is small and folate-dependent); ACMG 2013 statement against routine MTHFR testing.",
    conditions: ["folate_deficiency"],
    sample: ["C677T homozygous", "no C677T"],
    call: (g) => {
      const gt = g.rs1801133;
      if (!gt) return null;
      const t = count(gt, "A"); // the plus-strand A is the 677T allele
      const call =
        t === 2
          ? "C677T homozygous"
          : t === 1
            ? "C677T heterozygous"
            : "no C677T";
      return {
        genotype: `rs1801133 ${gt}`,
        call,
        meaning:
          t === 2
            ? "Reduced MTHFR activity. Only matters if folate intake is low: check homocysteine and folate once, then stop thinking about it."
            : t === 1
              ? "One copy, essentially no effect on homocysteine at normal folate intake."
              : "The common genotype.",
      };
    },
  },
  {
    id: "cyp1a2",
    gene: "CYP1A2",
    rsids: ["rs762551"],
    factKey: "caffeine_slow_metaboliser",
    effect:
      "A profile fact, not a condition: a confounder for a morning cortisol draw and a note next to blood pressure.",
    why: "The C allele slows caffeine clearance, so the same coffee sits in the blood for hours longer and lifts cortisol and blood pressure at the time of a draw.",
    grade: "B",
    source:
      "Cornelis 2006 JAMA (CYP1A2 genotype, coffee and myocardial infarction); PharmGKB rs762551 caffeine annotation.",
    conditions: [],
    call: (g) => {
      const gt = g.rs762551;
      if (!gt) return null;
      const slow = count(gt, "C") > 0;
      return {
        genotype: `rs762551 ${gt}`,
        call: slow ? "slow metaboliser" : "fast metaboliser",
        meaning: slow
          ? "Caffeine clears slowly. Coffee before a morning cortisol or blood pressure reading is a confounder, not a finding."
          : "Caffeine clears quickly; a morning coffee moves a draw much less.",
      };
    },
  },
  {
    id: "lct",
    gene: "LCT / MCM6",
    rsids: ["rs4988235"],
    factKey: "lactase_nonpersistent",
    effect:
      "A profile fact: bowel symptoms after dairy get a much more ordinary explanation.",
    why: "The single European lactase-persistence variant. GG means lactase switches off after weaning, which is the world norm and a common reason for bloating and loose stool.",
    grade: "A",
    source:
      "Enattah 2002 Nat Genet (MCM6 rs4988235 and lactase persistence); Storhaug 2017 Lancet Gastroenterol Hepatol (global prevalence).",
    conditions: [],
    call: (g) => {
      const gt = g.rs4988235;
      if (!gt) return null;
      const persistent = count(gt, "A") > 0;
      return {
        genotype: `rs4988235 ${gt}`,
        call: persistent ? "lactase persistent" : "lactase non-persistent",
        meaning: persistent
          ? "Lactase stays switched on: dairy is not the explanation for bowel symptoms."
          : "Lactase switches off after weaning. Bloating, wind and loose stool after milk are expected and are not a disease.",
      };
    },
  },
  {
    id: "fto",
    gene: "FTO",
    rsids: ["rs9939609"],
    factKey: "genome:fto",
    effect: "insulin_resistance prior ×1.2 per A allele.",
    why: "The commonest BMI-associated variant; it works through appetite rather than metabolism, and the effect on weight is a couple of kilos per allele.",
    grade: "B",
    source:
      "Frayling 2007 Science (FTO and BMI); Kilpeläinen 2011 PLoS Med (physical activity attenuates the FTO effect by about 30 %).",
    conditions: ["insulin_resistance"],
    sample: ["AA", "TT"],
    call: (g) => {
      const gt = g.rs9939609;
      if (!gt) return null;
      const a = count(gt, "A");
      return {
        genotype: `rs9939609 ${gt}`,
        call: gt,
        meaning:
          a === 0
            ? "No risk allele; appetite regulation is not being pushed by FTO."
            : `${a} risk allele${a > 1 ? "s" : ""}: roughly ${a * 1.2} kg more body weight on average, through appetite. Activity blunts most of it.`,
      };
    },
  },
  {
    id: "g6pd",
    gene: "G6PD",
    rsids: ["rs1050828"],
    factKey: "genome:g6pd",
    effect:
      "A profile fact for the anaemia_other story: haemolysis risk from fava beans, sulfa drugs, primaquine and nitrofurantoin.",
    why: "The G6PD A− variant is the commonest enzymopathy in the world and turns a routine drug into a haemolytic crisis. X-linked, so one copy is enough in men.",
    grade: "A",
    source:
      "Luzzatto 2020 Blood (G6PD deficiency); ClinVar rs1050828 (Val68Met, the A− allele); WHO G6PD classification.",
    conditions: [],
    call: (g) => {
      const gt = g.rs1050828;
      if (!gt) return null;
      const t = count(gt, "T");
      return {
        genotype: `rs1050828 ${gt}`,
        call: t > 0 ? "G6PD A− variant present" : "no G6PD A− variant",
        meaning:
          t > 0
            ? "Carries the A− variant. In men one copy is deficiency: avoid fava beans, primaquine, nitrofurantoin and sulfa drugs, and read any unexplained anaemia as possible haemolysis."
            : "The common allele; the usual haemolysis triggers are safe on this account.",
      };
    },
  },
  {
    id: "slco1b1",
    gene: "SLCO1B1",
    rsids: ["rs4149056"],
    factKey: "statin_myopathy_risk",
    effect:
      "A profile fact for the doctor dossier: statin dose and choice, nothing else.",
    why: "The 521C allele slows hepatic uptake of simvastatin, so blood levels rise and muscle symptoms follow. It is the one pharmacogenetic result a lipid conversation actually uses.",
    grade: "A",
    source:
      "SEARCH Collaborative Group 2008 N Engl J Med (SLCO1B1 variants and statin-induced myopathy); CPIC 2022 guideline for statins and SLCO1B1.",
    conditions: [],
    call: (g) => {
      const gt = g.rs4149056;
      if (!gt) return null;
      const c = count(gt, "C");
      return {
        genotype: `rs4149056 ${gt}`,
        call: c === 2 ? "high" : c === 1 ? "intermediate" : "typical",
        meaning:
          c === 2
            ? "Two 521C copies: about 17× the myopathy risk on simvastatin 80 mg. Rosuvastatin or pravastatin at a modest dose instead."
            : c === 1
              ? "One 521C copy: about 4× the myopathy risk on high-dose simvastatin. Keep the dose low or use another statin."
              : "The usual transporter; no statin dose change on genetic grounds.",
      };
    },
  },
];

export const CATALOG_RSIDS = new Set(GENOME_CATALOG.flatMap((r) => r.rsids));

export const genomeRow = (id: string) =>
  GENOME_CATALOG.find((r) => r.id === id);

/* ── did this call actually move anything? ────────────────────────────── */

/** The two ways a catalog rule reads a text fact. Absent keys never match. */
const answers = (
  when: { equals?: string; includes?: string },
  value: string,
): boolean => {
  const v = value.toLowerCase();
  if (when.equals != null) return v === when.equals.toLowerCase();
  if (when.includes != null)
    return when.includes
      .toLowerCase()
      .split("|")
      .some((part) => v.includes(part));
  return false;
};

/**
 * Whether this person's call changes any prior or any likelihood ratio in the
 * catalog. False is the interesting answer: an APOE ε3/ε3 or an FTO TT is a
 * real call that moves nothing, and the page says so instead of printing an
 * effect that belongs to somebody else.
 *
 * A row whose facts no rule reads at all returns true: silence is not
 * evidence of no effect.
 */
/**
 * One gene row as the page reads it: the verdict first, the rsids behind it.
 *
 * Phase 31a item 9. The table printed "HLA · rs2187668 · rs7454108 · no DQ2.5
 * or DQ8 tag" and, under "what it moved", a likelihood-ratio sentence — four
 * pieces of laboratory bookkeeping and no answer. The catalogue already writes
 * the answer: `meaning` is one plain sentence about this person's own call.
 * The first sentence of it is the verdict, the rest is the detail, and the
 * rsids and the genotype go behind a disclosure.
 *
 * Pure. `lib/genome.test.ts` is the contract, and the 31b markup binds to it.
 */
export interface GenomeVerdict {
  id: string;
  gene: string;
  /** the one line that leads the row: what this gene settles for this person */
  verdict: string;
  /** the rest of what the catalogue wrote, and what the call moves */
  detail: string;
  rsids: string[];
  /** the alleles the array read, or null when it did not read them */
  genotype: string | null;
  /** the call in the words the profile fact stores it in */
  call: string | null;
  grade: Grade;
  source: string;
  /** true when the call actually moves a condition the engine scores */
  moved: boolean;
}

/** The first sentence of a plain paragraph, and everything after it. */
export function firstSentence(text: string): [string, string] {
  const trimmed = (text ?? "").trim();
  const cut = /(?<=[.!?])\s/.exec(trimmed);
  return cut
    ? [trimmed.slice(0, cut.index + 1).trim(), trimmed.slice(cut.index).trim()]
    : [trimmed, ""];
}

export function genomeVerdict(r: {
  row: GenomeRow;
  result: GenomeCall | null;
  absent: string[];
}): GenomeVerdict {
  const { row, result, absent } = r;
  const base = {
    id: row.id,
    gene: row.gene,
    rsids: row.rsids,
    grade: row.grade,
    source: row.source,
  };

  if (!result)
    return {
      ...base,
      verdict: "Not read: this array does not carry the markers it needs.",
      detail: absent.length ? `Missing ${absent.join(", ")}.` : "",
      genotype: null,
      call: null,
      moved: false,
    };

  const moved = movesAnything(row, result);
  const [verdict, rest] = firstSentence(result.meaning);
  return {
    ...base,
    verdict,
    detail: [rest, moved ? row.effect : "It moves nothing on its own."]
      .filter(Boolean)
      .join(" "),
    genotype: result.genotype,
    call: result.call,
    moved,
  };
}

export function movesAnything(row: GenomeRow, call: GenomeCall): boolean {
  const facts: Record<string, string> = {
    [row.factKey]: call.call,
    ...(call.facts ?? {}),
  };
  let read = false;
  for (const h of CATALOG) {
    for (const m of h.priors.modifiers) {
      const value = m.when.fact ? facts[m.when.fact] : undefined;
      if (value == null) continue;
      read = true;
      if (answers(m.when, value)) return true;
    }
    for (const e of h.evidence) {
      const value = e.input.fact ? facts[e.input.fact] : undefined;
      if (value == null) continue;
      read = true;
      // A rule with an lrNeg moves the score on the answer that does not hold
      // as well, so having the fact at all is enough.
      if (e.lrNeg != null || answers(e.when, value)) return true;
    }
  }
  return !read;
}
