/**
 * The day's score, as arithmetic. Phase 37 task A1.
 *
 * One pure function, `scoreOf`, and the server is the only place it decides
 * anything: `/api/today` carries its input and its result, `/api/score/days`
 * runs it once per day. The phone runs a Swift port of the same lines only to
 * preview a tick or a portion before the server answers, and both sides pass
 * `fixtures/score-vectors.json`.
 *
 * Three layers. Lifestyle is the mean of four rows (sleep, moves, kcal,
 * protein), each 0–100. Blood is the share of markers in their band, with a
 * borderline one counted half. Genes is `genesLayer`. A missing layer drops
 * out and the other weights renormalise, so a person with no genome file is
 * scored on what they have rather than punished for what they lack.
 */

export type Row = "sleep" | "moves" | "kcal" | "protein";

export interface ScoreInput {
  sleepHours: number | null;
  /** null when nothing is due */
  moves: { done: number; due: number } | null;
  /** eaten today */
  kcal: number | null;
  proteinG: number | null;
  targets: { kcal: number | null; proteinG: number | null };
  /** null: no draw */
  blood: { green: number; amber: number; rose: number } | null;
  /** 0–100, null: no genome */
  genes: number | null;
}

export interface ScoreResult {
  score: number | null;
  word: "Strong" | "On track" | "Watch" | "Act" | null;
  life: number | null;
  blood: number | null;
  genes: number | null;
  /** each 0–100 */
  rows: Record<Row, number | null>;
}

export const WEIGHTS = { life: 0.4, blood: 0.45, genes: 0.15 } as const;

/** The AASM adult band, in hours. */
const SLEEP_BAND = [7, 9] as const;

/**
 * How far under the kcal target still reads as on target.
 * ponytail: the prototype's band, fixed 300 below target; make it a setting if
 * the owner asks.
 */
const KCAL_BELOW = 300;

const floor0 = (n: number) => Math.max(0, n);

function sleepRow(hours: number | null): number | null {
  if (hours == null) return null;
  const [lo, hi] = SLEEP_BAND;
  const outside = hours < lo ? lo - hours : hours > hi ? hours - hi : 0;
  return floor0(100 - 25 * outside);
}

function movesRow(m: ScoreInput["moves"]): number | null {
  if (!m || !(m.due > 0)) return null;
  return (m.done / m.due) * 100;
}

function kcalRow(kcal: number | null, target: number | null): number | null {
  if (kcal == null || target == null) return null;
  const lo = target - KCAL_BELOW;
  const distance = kcal < lo ? lo - kcal : kcal > target ? kcal - target : 0;
  return floor0(100 - distance / 10);
}

function proteinRow(g: number | null, target: number | null): number | null {
  if (g == null || target == null || !(target > 0)) return null;
  return Math.min(100, (g / target) * 100);
}

const round = (n: number | null) => (n == null ? null : Math.round(n));

export function wordOf(score: number | null): ScoreResult["word"] {
  if (score == null) return null;
  if (score >= 80) return "Strong";
  if (score >= 65) return "On track";
  if (score >= 50) return "Watch";
  return "Act";
}

export function scoreOf(input: ScoreInput): ScoreResult {
  const rows: Record<Row, number | null> = {
    sleep: round(sleepRow(input.sleepHours)),
    moves: round(movesRow(input.moves)),
    kcal: round(kcalRow(input.kcal, input.targets.kcal)),
    protein: round(proteinRow(input.proteinG, input.targets.proteinG)),
  };

  const present = Object.values(rows).filter((v): v is number => v != null);
  const life = present.length
    ? Math.round(present.reduce((a, b) => a + b, 0) / present.length)
    : null;

  const b = input.blood;
  const drawn = b ? b.green + b.amber + b.rose : 0;
  const blood =
    b && drawn > 0
      ? Math.round(((b.green + 0.5 * b.amber) / drawn) * 100)
      : null;

  const genes = round(input.genes);

  const layers = [
    [WEIGHTS.life, life],
    [WEIGHTS.blood, blood],
    [WEIGHTS.genes, genes],
  ].filter((l): l is [number, number] => l[1] != null);
  const weight = layers.reduce((s, [w]) => s + w, 0);
  const score = layers.length
    ? Math.round(layers.reduce((s, [w, v]) => s + w * v, 0) / weight)
    : null;

  return { score, word: wordOf(score), life, blood, genes, rows };
}

/**
 * The genes bar: the share of counted conditions the genome does not raise.
 *
 * `counted` are verdicts the file could answer (`absent` false); `raised` are
 * those pointing up at grade A or B, the grades that count in full everywhere
 * else in the app. Null with no genome file, and null when the file answered
 * nothing, because 0 of 0 is not a score.
 *
 * ponytail: a naive share; replace with per-condition weights when the owner
 * wants the genes bar to mean more.
 */
export function genesLayer(
  verdicts: { direction: string; grade: string; absent: boolean }[] | null,
): number | null {
  if (!verdicts) return null;
  const counted = verdicts.filter((v) => !v.absent);
  if (!counted.length) return null;
  const raised = counted.filter(
    (v) => v.direction === "up" && (v.grade === "A" || v.grade === "B"),
  ).length;
  return Math.round(100 * (1 - raised / counted.length));
}
