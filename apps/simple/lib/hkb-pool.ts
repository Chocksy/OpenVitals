/**
 * Several papers on the same claim, pooled into one likelihood ratio.
 *
 * Two studies that both say "a TSH over 4.5 argues for hypothyroidism" are not
 * two facts, they are one fact measured twice. So the rows on a
 * (condition, feature, condition_on) key are averaged in log space, weighted
 * by how good each study is and how big it was:
 *
 *   ln LR = Σ wᵢ ln LRᵢ / Σ wᵢ,  wᵢ = gradeWeight × ln(nᵢ + 2)
 *
 * with gradeWeight A 3, B 2, C 1. A C row enters at `lr^0.5`, already pulled
 * toward 1 by `GRADE_SHRINK`, so a small series never outvotes a meta-analysis
 * twice over. D and E never get here: `loadCatalog` drops them first.
 *
 * Pure. No database, no clock.
 */
import { GRADE_SHRINK, type EvidenceRule, type Grade } from "./hypotheses";

/** One row out of `hkb_evidence`, reduced to what the pool reads. */
export interface PoolMember {
  id: string;
  lrPos: number;
  lrNeg: number | null;
  grade: Grade;
  source: string;
  /** The study size, when the paper printed one. */
  n?: number | null;
}

export interface Pooled {
  lrPos: number;
  lrNeg: number | null;
  /** The best grade among the papers behind it. */
  grade: Grade;
  sources: NonNullable<EvidenceRule["sources"]>;
}

/** How loudly a grade speaks in the average. */
export const GRADE_VOTE: Record<Grade, number> = {
  A: 3,
  B: 2,
  C: 1,
  D: 0,
  E: 0,
};

const RANK: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, E: 0 };

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The likelihood ratio a member enters the average with. */
export const shrunk = (lr: number, grade: Grade): number =>
  lr ** (GRADE_SHRINK[grade] ?? 1);

/** `ln(n + 2)`: a study of 5000 counts about twice a study of 20, never ten times. */
const sizeWeight = (n: number | null | undefined) =>
  Math.log(Math.max(n ?? 0, 0) + 2);

const weightedLog = (
  values: { lr: number; grade: Grade; n?: number | null }[],
): number | null => {
  let top = 0;
  let bottom = 0;
  for (const v of values) {
    if (!Number.isFinite(v.lr) || v.lr <= 0) continue;
    const w = GRADE_VOTE[v.grade] * sizeWeight(v.n);
    if (w <= 0) continue;
    top += w * Math.log(shrunk(v.lr, v.grade));
    bottom += w;
  }
  return bottom === 0 ? null : Math.exp(top / bottom);
};

/**
 * The rows on one key as a single rule. A single row still goes through here,
 * so the grade shrink is applied in exactly one place for everything the
 * database serves.
 */
export function poolMembers(members: PoolMember[]): Pooled | null {
  if (!members.length) return null;
  const lrPos = weightedLog(
    members.map((m) => ({ lr: m.lrPos, grade: m.grade, n: m.n })),
  );
  if (lrPos == null) return null;
  const negatives = members.filter((m) => m.lrNeg != null);
  const lrNeg = negatives.length
    ? weightedLog(
        negatives.map((m) => ({ lr: m.lrNeg!, grade: m.grade, n: m.n })),
      )
    : null;
  const grade = members.reduce(
    (best, m) => (RANK[m.grade] > RANK[best] ? m.grade : best),
    members[0]!.grade,
  );
  return {
    lrPos: round2(lrPos),
    lrNeg: lrNeg == null ? null : round2(lrNeg),
    grade,
    sources: members.map((m) => ({
      id: m.id,
      grade: m.grade,
      lrPos: m.lrPos,
      source: m.source,
    })),
  };
}

/**
 * The study size a row carries, dug out of its source line ("n = 1240"). The
 * research importer writes it there and nowhere else, so this is where the
 * pool reads it back.
 */
export function sizeOf(source: string | null | undefined): number | null {
  const hit = /\bn\s*=\s*([\d,]+)/i.exec(source ?? "");
  if (!hit) return null;
  const n = Number(hit[1]!.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}
