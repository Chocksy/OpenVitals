/**
 * The engine's inputs in English, and the findings a fresh upload changed.
 *
 * Everything the pages print about evidence used to be the engine's own key:
 * `tgHdl 2.12`, `hypothesis:insulin_resistance 0.637`, `family_history no`,
 * `genome:tcf7l2 CT`. Those are variable names, not sentences. `explainInput`
 * turns one evidence line into the words the catalog already knows, and
 * `genomeFinding` / `documentFinding` pick the three sentences a new upload
 * earned a card for.
 *
 * Pure. No database, no clock, no LLM: the caller passes the day and the rows.
 * Phase 24c.
 */
import { NODES } from "./graph";
import { CATALOG } from "./hkb-catalog";
import {
  GENOME_CATALOG,
  type GenomeCall,
  type GenomeRow,
} from "./genome-catalog";
import { stateFor } from "./hypotheses";
import { VECTORS } from "./vectors";

const pretty = (code: string) => code.replace(/_/g, " ");
const round2 = (v: number) => Math.round(v * 100) / 100;

/** metric code → the name the knowledge graph gives it. */
const METRIC_NAME = new Map<string, string>();
/** profile fact key → the label the interview uses for it. */
const FACT_LABEL = new Map<string, string>();
/** profile fact key → the gene whose call writes it. */
const GENE_OF = new Map<string, string>();

for (const n of NODES) {
  const key = n.codes?.[0];
  if (!key) continue;
  if (n.kind === "metric") {
    if (!METRIC_NAME.has(key)) METRIC_NAME.set(key, n.name);
  } else if (n.kind === "gene") {
    GENE_OF.set(key, n.id.replace(/^fact:genome:/, ""));
  } else if (!FACT_LABEL.has(key)) {
    FACT_LABEL.set(key, n.name);
  }
}
for (const v of VECTORS)
  if (v.fact && !FACT_LABEL.has(v.fact)) FACT_LABEL.set(v.fact, v.name);
/** The three "facts" `syntheticFact` computes rather than stores. */
FACT_LABEL.set("waist_height_ratio", "Waist-to-height ratio");
FACT_LABEL.set("lh_fsh_ratio", "LH/FSH ratio");
FACT_LABEL.set("bp_systolic", "Systolic blood pressure");
for (const r of GENOME_CATALOG)
  if (!GENE_OF.has(r.factKey)) GENE_OF.set(r.factKey, r.gene);

/** The seven numbers the engine computes rather than measures. */
const DERIVED_NAME: Record<string, string> = {
  egfr: "eGFR",
  homaIr: "HOMA-IR",
  tgHdl: "triglyceride/HDL ratio",
  nonHdl: "non-HDL cholesterol",
  apobLdl: "apoB above what the LDL predicted",
  fib4: "FIB-4 liver score",
  phenoAge: "PhenoAge",
};

/** "64 %", the way a card prints a probability. */
const pct = (p: number) =>
  p >= 0.01 ? `${Math.round(p * 100)} %` : `${(p * 100).toPrecision(2)} %`;

/**
 * A genotype means nothing without what it does, so this one input kind keeps
 * its multiplier in the sentence: "TCF7L2 CT raises the prior ×1.4".
 */
function genomeSentence(gene: string, call: string, lr: number): string {
  const head = `${gene} ${call}`;
  if (!Number.isFinite(lr) || lr === 1) return head;
  return `${head} ${lr > 1 ? "raises" : "lowers"} the prior ×${round2(lr)}`;
}

/**
 * A marker the knowledge graph does not name is still not a variable name on
 * screen: `amh` and `shbg` are acronyms, so they are printed as acronyms.
 */
const acronym = (code: string) =>
  /^[a-z]{2,5}$/.test(code) ? code.toUpperCase() : pretty(code);

/** The label alone, for the lists that print an input with no value. */
export function explainKey(input: string): string {
  if (input.startsWith("hypothesis:")) return pretty(input.slice(11));
  if (input.startsWith("event:")) return pretty(input.slice(6));
  const gene = GENE_OF.get(input);
  if (gene) return gene;
  if (input.startsWith("genome:")) return pretty(input.slice(7)).toUpperCase();
  return (
    DERIVED_NAME[input] ??
    METRIC_NAME.get(input) ??
    FACT_LABEL.get(input) ??
    acronym(input)
  );
}

/**
 * What a card says about its own movement.
 *
 * "was likely → likely (+8 pts)" was a sentence about nothing: the state word
 * did not change, only the number under it did. When the word is the same, say
 * what actually moved.
 */
export function changedLine(changed: {
  from?: string;
  to: string;
  deltaP: number;
}): string {
  const pts = `${changed.deltaP > 0 ? "+" : ""}${Math.round(changed.deltaP * 100)}`;
  const from = changed.from?.replace("_", " ");
  const to = changed.to.replace("_", " ");
  return from === to
    ? `${pts} pts since yesterday`
    : `was ${from ?? "not scored"} → ${to} (${pts} pts)`;
}

/** The five shapes `resolve` can hand back, which is all `explainInput` reads. */
export interface EvidenceInput {
  /** the resolved label: a metric code, a derived key, a fact key,
   *  `hypothesis:<id>` or `event:<tag>` */
  input: string;
  value: string;
  lr: number;
}

/**
 * One line of evidence as a sentence.
 *
 * - metric: "HbA1c 5.6 %" (the value already carries the unit)
 * - derived: "triglyceride/HDL ratio 2.12"
 * - fact: "Family history: no", "Tired most days: Yes"
 * - genome fact: "TCF7L2 CT raises the prior ×1.4"
 * - chained hypothesis: "insulin resistance likely (64 %)"
 * - life event: "pregnancy in your timeline"
 *
 * `nameOf` gives the catalog's own name for a chained hypothesis; without it
 * the id reads as words, which is what the catalog names are anyway.
 */
export function explainInput(
  e: EvidenceInput,
  nameOf?: (id: string) => string | undefined,
): string {
  const { input, value } = e;

  if (input.startsWith("hypothesis:")) {
    const id = input.slice(11);
    const name = nameOf?.(id) ?? pretty(id);
    const p = Number(value);
    return Number.isFinite(p)
      ? `${name} ${stateFor(p, false).replace("_", " ")} (${pct(p)})`
      : `${name} ${value}`;
  }

  if (input.startsWith("event:"))
    return `${pretty(input.slice(6))} in your timeline`;

  const gene = GENE_OF.get(input);
  if (gene) return genomeSentence(gene, value, e.lr);
  if (input.startsWith("genome:"))
    return genomeSentence(pretty(input.slice(7)).toUpperCase(), value, e.lr);

  const derived = DERIVED_NAME[input];
  if (derived) return `${derived} ${value}`;

  const metric = METRIC_NAME.get(input);
  if (metric) return `${metric} ${value}`;

  const fact = FACT_LABEL.get(input);
  if (fact) return `${fact}: ${value}`;

  return `${pretty(input)} ${value}`;
}

/* ── what an upload changed ───────────────────────────────────────────── */

/** How long a fresh upload keeps its card on the ledger. */
export const FINDING_DAYS = 14;

export interface FindingLine {
  /** "TCF7L2 CT", or the item kind for a document */
  label: string;
  /** the catalog's own sentence about this person's call */
  text: string;
}

export interface Finding {
  /** the upload id, so the card links to the page that has all of it */
  id: string;
  kind: "genome" | "document";
  /** "What your genome changed", "What your discharge note changed" */
  title: string;
  /** the upload date */
  at: string;
  href: string;
  lines: FindingLine[];
  /** how many rows the page behind the link has */
  total: number;
}

/** The two ways a catalog rule reads a text fact, as `movesAnything` reads it. */
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
 * How much this person's own call moves the engine: the largest multiplier any
 * catalog rule applies because of it, in log space so a prior ×1.4 and a
 * likelihood ratio of 0.1 are on the same scale.
 *
 * 0 means the call is real and changes nothing, which is the honest answer for
 * an APOE ε3/ε3, and which is why those never take one of the three slots.
 */
export function genomeEffect(row: GenomeRow, call: GenomeCall): number {
  const facts: Record<string, string> = {
    [row.factKey]: call.call,
    ...(call.facts ?? {}),
  };
  let best = 0;
  const take = (x: number | undefined | null) => {
    if (x != null && x > 0) best = Math.max(best, Math.abs(Math.log(x)));
  };
  for (const h of CATALOG) {
    for (const m of h.priors.modifiers) {
      const v = m.when.fact ? facts[m.when.fact] : undefined;
      if (v != null && answers(m.when, v)) take(m.times);
    }
    for (const e of h.evidence) {
      const v = e.input.fact ? facts[e.input.fact] : undefined;
      if (v == null) continue;
      take(answers(e.when, v) ? e.lr : e.lrNeg);
    }
  }
  return best;
}

/** A genome upload's rows, exactly as `callGenome` returns them. */
export interface CalledRow {
  row: GenomeRow;
  result: GenomeCall | null;
}

const daysSince = (at: string, today: string) =>
  Math.floor((Date.parse(today) - Date.parse(at)) / 86400000);

/**
 * "What your genome changed": the three calls with the biggest effect on this
 * person, for a fortnight after the file landed.
 *
 * Ties keep catalog order, so the same file always gives the same three.
 */
export function genomeFinding(
  upload: { id: string; at: string },
  results: CalledRow[],
  today: string,
): Finding | null {
  const days = daysSince(upload.at, today);
  if (days < 0 || days > FINDING_DAYS) return null;

  const called = results.filter(
    (r): r is { row: GenomeRow; result: GenomeCall } => r.result != null,
  );
  if (!called.length) return null;

  const top = called
    .map((r, i) => ({ ...r, i, effect: genomeEffect(r.row, r.result) }))
    .sort((a, b) => b.effect - a.effect || a.i - b.i)
    .slice(0, 3);

  return {
    id: upload.id,
    kind: "genome",
    title: "What your genome changed",
    at: upload.at,
    href: `/blood/uploads/${upload.id}`,
    lines: top.map((r) => ({
      // the short gene the graph uses, so the chip stays a chip: the catalog's
      // own `gene` for the HLA row is a whole sentence.
      label: `${explainKey(r.row.factKey)} ${r.result.call}`,
      text: r.result.meaning,
    })),
    total: called.length,
  };
}

/** The document kinds, in the order a card should read them out. */
const ITEM_RANK: Record<string, number> = {
  diagnosis: 0,
  finding: 1,
  measurement: 2,
  medication: 3,
  event: 4,
  recommendation: 5,
};

/** "discharge" → "discharge note", the way the card title says it. */
const DOC_NAME: Record<string, string> = {
  imaging: "scan",
  discharge: "discharge note",
  specialist_note: "specialist note",
  dexa: "DEXA scan",
  ecg: "ECG",
  sleep_study: "sleep study",
  stool_test: "stool test",
  pathology: "pathology report",
  prescription: "prescription",
  other: "document",
};

/** One accepted item off a document, with the condition it moved when it did. */
export interface AcceptedItem {
  kind: string;
  text: string;
  /** the condition this item moved, when it landed on one */
  moved?: string;
}

/** The same card for a document: what was accepted and what it moved. */
export function documentFinding(
  upload: { id: string; at: string; docType?: string | null },
  items: AcceptedItem[],
  today: string,
): Finding | null {
  const days = daysSince(upload.at, today);
  if (days < 0 || days > FINDING_DAYS) return null;
  if (!items.length) return null;

  const top = [...items]
    .map((item, i) => ({ item, i }))
    .sort(
      (a, b) =>
        (ITEM_RANK[a.item.kind] ?? 9) - (ITEM_RANK[b.item.kind] ?? 9) ||
        a.i - b.i,
    )
    .slice(0, 3);

  return {
    id: upload.id,
    kind: "document",
    title: `What your ${DOC_NAME[upload.docType ?? "other"] ?? "document"} changed`,
    at: upload.at,
    href: `/blood/uploads/${upload.id}`,
    lines: top.map(({ item }) => ({
      label: item.moved ?? item.kind,
      text: item.text,
    })),
    total: items.length,
  };
}
