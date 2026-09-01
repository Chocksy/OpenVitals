/**
 * Raw-sheet verification. Every upload keeps the lab's own text in
 * `uploads.raw_text`, so a reading that looks wrong can be checked against the
 * line it came from instead of being guessed at or thrown away.
 *
 * Everything here is pure: lines in, actions out. `runCurator` supplies the
 * raw text and applies what comes back.
 *
 * The hard parts are Romanian lab sheets: `4.020.000` is four million,
 * `1,26` is one point twenty-six, analyte names are broken by the PDF text
 * layer (`Hemoglobin ă`), and the same analyte is often printed twice in two
 * units on two lines.
 */
import type { Action, MetricLike, ReadingLike } from "./curator";
import { conversionFactor, normalizeUnit, round } from "./units";

/**
 * Romanian analyte names. The English names and the catalog aliases already
 * travel with the metric; this is the list the extraction catalog never had.
 */
export const ROMANIAN_ALIASES: Record<string, string[]> = {
  rbc: ["Hematii", "Eritrocite"],
  wbc: ["Leucocite"],
  neutrophils_abs: ["Neutrofile"],
  neutrophils_pct: ["Neutrofile"],
  lymphocytes_abs: ["Limfocite"],
  lymphocytes_pct: ["Limfocite"],
  monocytes_abs: ["Monocite"],
  monocytes_pct: ["Monocite"],
  eosinophils_abs: ["Eozinofile"],
  eosinophils_pct: ["Eozinofile"],
  basophils_abs: ["Bazofile"],
  basophils_pct: ["Bazofile"],
  platelets: ["Trombocite"],
  hemoglobin: ["Hemoglobina"],
  crp: ["Proteina C reactiva", "PCR"],
  hs_crp: ["Proteina C reactiva", "PCR"],
  total_cholesterol: ["Colesterol total"],
  triglycerides: ["Trigliceride"],
  glucose: ["Glicemie"],
  creatinine: ["Creatinina"],
  urea: ["Uree"],
  uric_acid: ["Acid uric"],
  ferritin: ["Feritina"],
  vitamin_d: ["Vitamina D"],
  tsh: ["TSH"],
  free_t4: ["FT4"],
  tpo_antibodies: ["ATPO"],
  anti_thyroglobulin: ["ATG", "Anti-TG"],
  iron: ["Fier"],
  magnesium: ["Magneziu"],
  calcium: ["Calciu"],
  zinc: ["Zinc"],
  albumin: ["Albumina"],
  total_bilirubin: ["Bilirubina"],
  sodium: ["Sodiu"],
  potassium: ["Potasiu"],
  hematocrit: ["Hematocrit"],
  esr: ["VSH"],
  fibrinogen: ["Fibrinogen"],
  insulin: ["Insulina"],
  hba1c: ["Hemoglobina glicata", "HbA1c"],
};

/**
 * Every name this metric can appear under on a sheet, longest first. Catalog
 * aliases of one or two letters (`Ca`, `Fe`, `T3`) are dropped: they match
 * half a Romanian lab sheet and there is nothing to gain from them.
 */
export function aliasesFor(m: MetricLike, catalog: string[] = []): string[] {
  const all = [m.name, ...catalog, ...(ROMANIAN_ALIASES[m.code] ?? [])];
  return [...new Set(all.filter((a) => foldPlain(a ?? "").length >= 3))].sort(
    (a, b) => b.length - a.length,
  );
}

/**
 * Letters and digits only, with the source index every kept character had and
 * whether it opened a word. The PDF text layer breaks names apart
 * (`Hemoglobin ă`), so the spaces have to go; the word starts are what keeps
 * `ALP` from matching inside `Alpha 1`.
 */
function fold(line: string): { text: string; at: number[]; starts: boolean[] } {
  let text = "";
  const at: number[] = [];
  const starts: boolean[] = [];
  let boundary = true;
  for (let i = 0; i < line.length; i++) {
    const plain = line[i]!
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    let kept = false;
    for (const c of plain)
      if (/[a-z0-9]/.test(c)) {
        text += c;
        at.push(i);
        starts.push(boundary);
        boundary = false;
        kept = true;
      }
    if (!kept) boundary = true;
  }
  return { text, at, starts };
}

/** The alias as a whole word, not as a fragment of a longer one. Index, or -1. */
function findWord(text: string, starts: boolean[], alias: string): number {
  for (let i = text.indexOf(alias); i >= 0; i = text.indexOf(alias, i + 1)) {
    const end = i + alias.length;
    if (starts[i] && (end >= text.length || starts[end])) return end - 1;
  }
  return -1;
}

const foldPlain = (s: string) => fold(s).text;

/**
 * Does this line print one of these names? Accent-, case- and space-blind, and
 * whole-word only, so `ALP` never matches inside `Alpha 1`. The second pass
 * needs the question the matcher above answers on its way to a value.
 */
export function lineHasAlias(line: string, aliases: string[]): boolean {
  const { text, starts } = fold(line);
  return aliases.some((a) => {
    const folded = foldPlain(a ?? "");
    return folded.length >= 3 && findWord(text, starts, folded) >= 0;
  });
}

/**
 * `(ser, spectrofotometrie)` and `(Mindray BS 480)` are prose, and the `480`
 * inside them is not a result. Blanked out, length preserved so the character
 * positions of everything else survive. A parenthesis holding only numbers
 * (`(4.300.000 - 5.750.000)`) is the reference range and stays.
 */
export const stripProse = (s: string) =>
  s.replace(/\([^)]*\)/g, (m) =>
    /[a-zA-Z]/.test(m) ? " ".repeat(m.length) : m,
  );

/** Dates and clock times are not results. */
export const stripDates = (s: string) =>
  s
    .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, (m) => " ".repeat(m.length))
    .replace(/\b\d{1,2}:\d{2}\b/g, (m) => " ".repeat(m.length));

const NUMBER = /\d[\d.,]*/g;

/**
 * Romanian sheets group thousands with a dot and write decimals with a comma.
 * `5.230.000` is unambiguous. A single group (`224.000`, `5.180`) is only a
 * thousands separator when the line says so: a count per mm³, or a comma used
 * as the decimal mark somewhere on the same line.
 */
export const thousandsStyle = (line: string): boolean =>
  /\d{1,3}(\.\d{3}){2,}/.test(line) ||
  /(\/\s*mm|mm[³3]\b|mmc)/i.test(line) ||
  /\d,\d/.test(line);

/** One printed number into a JS number. `4.020.000` → 4020000, `1,26` → 1.26. */
export function parseSheetNumber(
  token: string,
  thousands = false,
): number | null {
  const t = token.replace(/[.,]+$/, "");
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(t))
    return t.split(".").length > 2 || thousands
      ? Number(t.replace(/\./g, ""))
      : Number(t);
  if (t.includes(","))
    return Number(t.replace(/\./g, "").replace(",", ".")) || 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface SheetReading {
  /** The printed line, quoted back to the user. */
  line: string;
  value: number | null;
  low: number | null;
  high: number | null;
  unit: string | null;
}

const RANGE = /(\d[\d.,]*)\s*[-–—]\s*(\d[\d.,]*)/;
const AT_MOST = /[<≤]\s*(\d[\d.,]*)/;
const AT_LEAST = /[>≥]\s*(\d[\d.,]*)/;

/** How to read one line: whose unit to prefer, and what is stored today. */
export interface ReadOptions {
  unit?: string | null;
  metricCode?: string;
  stored?: number | null;
}

/**
 * The numbers printed after the analyte's name. The range is the first
 * `a - b`, `< b` or `> a`; an upper bound alone means the range starts at
 * zero. Everything numeric before the range is a candidate value, because a
 * line often carries two of them (`2.450 /mm³  47,3 %`) and the header noise
 * of a scanned sheet adds more.
 *
 * The candidate that already agrees with the stored value wins, so a row the
 * sheet confirms is never rewritten out of a misread neighbour; then the one
 * printed in a unit we can read; then the first.
 */
export function parseSheetLine(
  segment: string,
  from = 0,
  opts: ReadOptions = {},
): SheetReading {
  const line = segment.trim();
  const s = stripDates(stripProse(segment)).slice(from);
  const thousands = thousandsStyle(s);

  const found = [
    { m: s.match(RANGE), kind: "span" as const },
    { m: s.match(AT_MOST), kind: "max" as const },
    { m: s.match(AT_LEAST), kind: "min" as const },
  ].filter((c) => c.m?.index != null);
  found.sort((a, b) => a.m!.index! - b.m!.index!);
  const range = found[0];
  const rangeAt = range ? range.m!.index! : s.length;
  const rangeEnd = range ? rangeAt + range.m![0]!.length : s.length;

  let low: number | null = null;
  let high: number | null = null;
  if (range?.kind === "span") {
    low = parseSheetNumber(range.m![1]!, thousands);
    high = parseSheetNumber(range.m![2]!, thousands);
  } else if (range?.kind === "max") {
    low = 0;
    high = parseSheetNumber(range.m![1]!, thousands);
  } else if (range?.kind === "min") {
    low = parseSheetNumber(range.m![1]!, thousands);
  }

  NUMBER.lastIndex = 0;
  const hits = [...s.matchAll(NUMBER)].filter((m) => m.index! < rangeAt);
  /** Many labs print the unit once, next to the range, not next to the value. */
  const tail = unitBetween(s, rangeEnd, s.length);
  const candidates = hits
    .map((m, i) => ({
      value: parseSheetNumber(m[0]!, thousands),
      unit:
        unitBetween(s, m.index! + m[0]!.length, hits[i + 1]?.index ?? rangeAt) ??
        tail,
    }))
    .filter((c): c is { value: number; unit: string | null } => c.value != null);

  const scale = (c: { value: number; unit: string | null }) => {
    const factor = c.unit
      ? conversionFactor(c.unit, opts.unit, opts.metricCode)
      : 1;
    return factor == null ? null : round(c.value * factor);
  };

  const best =
    (opts.stored != null
      ? candidates.find((c) => agrees(scale(c), opts.stored!))
      : undefined) ??
    (opts.unit ? candidates.find((c) => scale(c) != null) : undefined) ??
    candidates[0];

  return {
    line,
    value: best?.value ?? null,
    low,
    high,
    unit: best?.unit ?? null,
  };
}

const UNIT = /^[%/A-Za-z\u00b5\u03bc0-9][%/A-Za-z\u00b5\u03bc0-9^\u00b3\u2076.]*$/;

/**
 * The first unit-shaped token in a stretch of a line, or null. `10^3/ul` and
 * `/mm\u00b3` are units; a bare number is not, and a long word means the
 * stretch is prose and there is no unit to find in it.
 */
export function unitBetween(
  s: string,
  from: number,
  to: number,
): string | null {
  for (const token of s.slice(from, Math.max(from, to)).split(/\s+/)) {
    if (!token) continue;
    const word = /[A-Za-z\u00b5\u03bc]/.test(token);
    // Digits, dashes and brackets are column noise; step over them.
    if (!word && !token.includes("%")) continue;
    // A word this long with no slash is prose, and prose has no unit in it.
    if (!UNIT.test(token) || (!/[/%^]/.test(token) && token.length > 4))
      return null;
    return token;
  }
  return null;
}

/**
 * The best line on the sheet for one reading. Lines that carry a number beat
 * lines that do not, and a line printed in the reading's own unit (or a unit
 * we can convert from) beats one in the sheet's other unit — that is how the
 * `0,64 mg/L` row wins over the `0,064 mg/dL` row printed above it.
 */
export function findSheetLine(
  rawText: string,
  aliases: string[],
  unit: string | null,
  metricCode?: string,
  stored?: number | null,
): SheetReading | null {
  const lines = rawText.split(/\r?\n/);
  const folded = aliases.map(foldPlain).filter(Boolean);
  const opts: ReadOptions = { unit, metricCode, stored };
  let best: SheetReading | null = null;
  let bestScore = -1;

  for (let i = 0; i < lines.length; i++) {
    const { text, at, starts } = fold(lines[i]!);
    let after = -1;
    for (const alias of folded) {
      const hit = findWord(text, starts, alias);
      if (hit < 0) continue;
      after = at[hit]! + 1;
      break;
    }
    if (after < 0) continue;

    const segments: [string, number][] = [[lines[i]!, after]];
    if (parseSheetLine(lines[i]!, after, opts).value == null)
      for (const next of lines.slice(i + 1, i + 4))
        if (/\d/.test(next)) segments.push([next, 0]);

    for (const [segment, from] of segments) {
      const read = parseSheetLine(segment, from, opts);
      const factor = read.unit
        ? conversionFactor(read.unit, unit, metricCode)
        : 1;
      const score =
        read.value == null
          ? 0
          : stored != null &&
              factor != null &&
              agrees(round(read.value * factor), stored)
            ? 4
            : read.unit == null
              ? 1
              : normalizeUnit(read.unit) === normalizeUnit(unit)
                ? 3
                : factor != null
                  ? 2
                  : 1;
      if (score > bestScore) {
        bestScore = score;
        best = read;
      }
    }
  }

  return best;
}

/** Within 2 %, with "both missing" counting as agreement. */
export const agrees = (a: number | null, b: number | null): boolean =>
  a == null && b == null
    ? true
    : a == null || b == null
      ? false
      : Math.abs(a - b) <= 0.02 * Math.max(Math.abs(a), Math.abs(b), 1e-12);

const brackets = (lo: number | null, hi: number | null, v: number) =>
  (lo == null || v >= lo * 0.95) && (hi == null || v <= hi * 1.05);

const hasFlag = (r: ReadingLike, tag: string) =>
  (r.flags ?? []).some(
    (f) => f === tag || (typeof f === "object" && f !== null && tag in f),
  );

/** Flags that say the curator already moved this row's numbers around. */
const TOUCHED = [
  "unit_converted",
  "unit_relabelled",
  "ref_rescaled",
  "raw_verified",
  "raw_confirmed",
];

/**
 * Which readings are worth checking against the sheet: the ones the lab range
 * calls abnormal, the ones the curator rewrote, and the ones it asked about.
 * Rows it has already verified are left alone.
 */
export function rawVerifyScope(
  readings: ReadingLike[],
  askedAbout: Set<string>,
): ReadingLike[] {
  return readings.filter((r) => {
    if (hasFlag(r, "raw_verified") || hasFlag(r, "raw_confirmed")) return false;
    if (askedAbout.has(r.id)) return true;
    if (TOUCHED.some((f) => hasFlag(r, f))) return true;
    if (r.value == null) return false;
    return (
      (r.refLow != null && r.value < r.refLow) ||
      (r.refHigh != null && r.value > r.refHigh)
    );
  });
}

/** The lab sheet text of every upload that has one worth reading. */
export type RawTexts = Map<string, string>;

const MIN_RAW = 200;

export function planRawVerify(
  targets: ReadingLike[],
  byCode: Map<string, MetricLike>,
  raw: RawTexts,
  catalogAliases: Map<string, string[]> = new Map(),
): Action[] {
  const actions: Action[] = [];

  for (const r of targets) {
    const text = r.uploadId ? raw.get(r.uploadId) : undefined;
    if (!text || text.length <= MIN_RAW) continue;
    const m = byCode.get(r.metricCode);
    if (!m) continue;

    const unit = r.unit ?? m.unit;
    const sheet = findSheetLine(
      text,
      aliasesFor(m, catalogAliases.get(m.code) ?? []),
      unit,
      r.metricCode,
      r.value,
    );

    const factor =
      sheet?.unit == null
        ? 1
        : conversionFactor(sheet.unit, unit, r.metricCode);

    if (!sheet || sheet.value == null || factor == null) {
      actions.push(confirmValueAsk(r, m, sheet?.line ?? null));
      continue;
    }

    const scale = (v: number | null) => (v == null ? null : round(v * factor));
    const value = scale(sheet.value)!;
    const refLow = scale(sheet.low);
    const refHigh = scale(sheet.high);

    const valueMoved = !agrees(r.value, value);
    // A sheet that did not reprint the range says nothing about the stored one.
    const rangeMoved =
      (refLow != null || refHigh != null) &&
      (!agrees(r.refLow, refLow) || !agrees(r.refHigh, refHigh));

    if (!valueMoved && !rangeMoved) {
      actions.push({
        type: "fix",
        check: "raw_verify",
        readingId: r.id,
        patch: { flags: [...(r.flags ?? []), "raw_confirmed"] },
      });
      continue;
    }

    // Rewriting a value is the one dangerous move here, so it needs the sheet's
    // own range to hold the sheet's own value. A range-only fix never does.
    if (valueMoved && !brackets(refLow, refHigh, value)) {
      actions.push(confirmValueAsk(r, m, sheet.line));
      continue;
    }

    // ponytail: the spec's "clean unit factor" and "typo-level" branches end at
    // the same row — the sheet's numbers in the metric's unit — so there is one.
    actions.push({
      type: "fix",
      check: "raw_verify",
      readingId: r.id,
      patch: {
        ...(valueMoved && { value }),
        ...(rangeMoved && { refLow, refHigh }),
        flags: [
          ...(r.flags ?? []),
          {
            raw_verified: {
              orig: { value: r.value, refLow: r.refLow, refHigh: r.refHigh },
              sheet: sheet.line,
            },
          },
        ],
      },
    });
  }

  return actions;
}

/** "Keep it or discard it": the one question a lab sheet cannot settle. */
export function confirmValueAsk(
  r: ReadingLike,
  m: MetricLike,
  line: string | null,
): Action {
  return {
    type: "queue",
    check: "raw_verify",
    kind: "confirm_value",
    question: `The stored "${m.name}" is ${r.value ?? r.valueText ?? "?"} ${r.unit ?? ""} on ${r.observedAt}. The lab sheet line reads: "${line ?? "not found"}". Keep it, or discard the reading?`,
    options: ["Keep", "Discard reading", "Note…"],
    subject: {
      key: `${r.id}`,
      readingId: r.id,
      metricCode: r.metricCode,
      sheet: line,
      detail: `${r.value ?? r.valueText ?? "?"} ${r.unit ?? ""} · sheet: ${line ?? "not found"}`,
    },
  };
}
