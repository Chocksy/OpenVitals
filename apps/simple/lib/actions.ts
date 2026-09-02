/**
 * What to do about one condition, from the two places the app already keeps
 * actions: the plan written for this person, and the graded intervention rows
 * the research runs filed under that condition.
 *
 * Phase 26. Before this, three surfaces each invented their own answer to
 * "what should I do?": the condition card printed the catalog's `management`
 * shorthand ("Selenium trial justified; keep ferritin >50"), the question
 * route told people to see a provider, and "Add to protocol" had nothing to
 * add. One helper serves all three, so the answer a person reads and the
 * action they can tap are the same row.
 *
 * `pickActions` is pure — no database, no clock, no model — and is the whole
 * contract: plan actions first, graded interventions after, best grade first,
 * the dose passed through exactly as its source wrote it. Nothing here ever
 * invents an action or a dose; when both sources are empty the list is empty
 * and every caller says so out loud.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  getDb,
  hkbInterventions,
  type ActionKind,
  type Basis,
  type ReportAction,
} from "@/db";
import { explainKey } from "./explain";
import { catalogFor } from "./hkb";
import { metricCodesOf } from "./ledger";
import { latestReport } from "./report";
import { aimLine, norm } from "./plan-line";

/** One thing to do, from whichever source had it, with its label. */
export interface PlanLine {
  /**
   * Phase 27. The name the model is allowed to say this row by, and the whole
   * adopt call folded into a string: `plan:<reportId>:<index>` is an action off
   * this person's own report, `int:<interventionId>` is a graded row off the
   * papers. `adoptBodyOf` turns it back into the body `/api/plan/adopt` takes,
   * so a chip in the answer and the Add on a card post the same thing.
   */
  id: string;
  title: string;
  /** `plan` is this person's own report; `papers` is `hkb_interventions`. */
  source: "plan" | "papers";
  /** index into `report.body.actions`, so "Add" can adopt it */
  index?: number;
  /** `hkb_interventions.id`, so "Add" can adopt the claim */
  interventionId?: string;
  kind?: ActionKind;
  /** exactly as the source wrote it; never rounded, never invented */
  dose: string | null;
  basis: Basis;
  grade?: string;
  /** "[science, A]", "[opinion]" — printed after the action, everywhere */
  label: string;
  why: string;
  /** "ferritin up → over 50 ng/mL, measure after 12 weeks" */
  target: string | null;
  /**
   * The same target as a sentence a person reads: "aim: TPO antibodies under
   * 100 IU/mL · retest in 24 weeks". `target` stays the engine's own grammar
   * because the prompts and the evals read it; `aim` is what a page prints.
   */
  aim: string | null;
}

/** A/B and C are science; D and E are the horizon, and say so. */
export const basisOfGrade = (grade: string): Basis =>
  grade === "D" || grade === "E" ? "anecdotal" : "science";

const GRADE_ORDER = ["A", "B", "C", "D", "E"];

/** "[science, A]" · "[opinion]" · "[anecdotal, E]" */
export const labelOf = (basis: Basis, grade?: string | null): string =>
  grade ? `[${basis}, ${grade}]` : `[${basis}]`;

const doseOf = (a: ReportAction): string | null =>
  a.dose
    ? [
        a.dose.amount,
        a.dose.form,
        a.dose.schedule,
        a.dose.duration ? `for ${a.dose.duration}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

const targetOf = (a: ReportAction): string | null => {
  const t = a.targets[0];
  return t
    ? `${t.code.replace(/_/g, " ")} ${t.direction} → ${t.expect}, measure after ${t.measureAfterWeeks} weeks`
    : null;
};

/* The words are in `lib/plan-line.ts`, which is client-safe; the marker's
   real name is looked up here, because `explainKey` reaches the database. */

/** "aim: TPO antibodies under 100 IU/mL · retest in 24 weeks". */
export const aimOf = (t: ReportAction["targets"][number]): string =>
  aimLine(explainKey(t.code), t.expect, t.measureAfterWeeks);

const aimOfAction = (a: ReportAction): string | null => {
  const t = a.targets[0];
  return t ? aimOf(t) : null;
};

/** One row of `hkb_interventions`, cut to what this file reads. */
export interface InterventionLine {
  id: string;
  conditionId: string;
  name: string;
  dose: string | null;
  duration: string | null;
  effect: string | null;
  direction: string;
  outcomeFeatureId: string | null;
  grade: string;
}

const short = (id: string) => id.replace(/^metric:/, "").replace(/_/g, " ");

const interventionTarget = (r: InterventionLine): string | null => {
  if (!r.outcomeFeatureId) return null;
  const move = r.direction === "none" ? "no change" : r.direction;
  return `${short(r.outcomeFeatureId)} ${move}${r.effect ? ` ${r.effect}` : ""}${
    r.duration ? `, remeasure after ${r.duration}` : ""
  }`;
};

/** A graded row aims at a direction, not at a value the paper promised. */
const MOVE: Record<string, string> = {
  up: "higher",
  down: "lower",
  none: "no change",
};

const interventionAim = (r: InterventionLine): string | null => {
  if (!r.outcomeFeatureId) return null;
  const name = explainKey(r.outcomeFeatureId.replace(/^metric:/, ""));
  const move = MOVE[r.direction] ?? r.direction;
  return `aim: ${name} ${move}${r.effect ? ` (${r.effect})` : ""}${
    r.duration ? ` · retest after ${r.duration}` : ""
  }`;
};

export interface PickOptions {
  /** the metric codes this condition is scored on */
  codes: string[];
  /** the latest plan's actions, in the order the report wrote them */
  actions: ReportAction[];
  /** `hkb_interventions` rows already filtered to this condition */
  interventions: InterventionLine[];
  /** the report the plan actions are indexes into, for their ids */
  reportId?: string | null;
  /** how many lines a caller wants; the cards print 3 */
  limit?: number;
  /** null: no condition was named, so every plan action is a candidate */
  anyAction?: boolean;
}

/**
 * The list, in the one order everything prints it.
 *
 * A plan action belongs to a condition when one of its targets names a marker
 * that condition is scored on — the same join `lib/ledger.ts` uses to put an
 * action on a card, so a card and its answer can never disagree. Tests come
 * last within the plan half: "measure it" is an action, but it is not the
 * thing a person asked what to do about.
 */
export function pickActions({
  codes,
  actions,
  interventions,
  reportId = null,
  limit = 3,
  anyAction = false,
}: PickOptions): PlanLine[] {
  const mine = actions
    .map((action, index) => ({ action, index }))
    .filter(
      ({ action }) =>
        anyAction || action.targets.some((t) => codes.includes(t.code)),
    )
    .sort(
      (a, b) =>
        Number(a.action.kind === "test") - Number(b.action.kind === "test") ||
        b.action.weight - a.action.weight ||
        a.index - b.index,
    )
    .map<PlanLine>(({ action, index }) => ({
      id: `plan:${reportId ?? ""}:${index}`,
      title: action.title,
      source: "plan",
      index,
      kind: action.kind,
      dose: doseOf(action),
      basis: action.basis,
      label: labelOf(action.basis),
      why: action.why,
      target: targetOf(action),
      aim: aimOfAction(action),
    }));

  const seen = new Set(mine.map((p) => norm(p.title)));
  const papers = [...interventions]
    .sort(
      (a, b) =>
        GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade) ||
        a.name.localeCompare(b.name),
    )
    .filter((r) => {
      const key = norm(r.name);
      if ([...seen].some((s) => s.includes(key) || key.includes(s)))
        return false;
      seen.add(key);
      return true;
    })
    .map<PlanLine>((r) => {
      const basis = basisOfGrade(r.grade);
      return {
        id: `int:${r.id}`,
        title: r.name,
        source: "papers",
        interventionId: r.id,
        dose: r.dose,
        basis,
        grade: r.grade,
        label: labelOf(basis, r.grade),
        why: `what the papers report for this condition, grade ${r.grade}`,
        target: interventionTarget(r),
        aim: interventionAim(r),
      };
    });

  return [...mine, ...papers].slice(0, limit);
}

/**
 * The body `/api/plan/adopt` takes for one line, read straight off its id.
 *
 * Pure, and the only place that knows the shape of an id: a chip in an answer
 * has nothing but the id, and this is how it adopts without a second lookup.
 * A plan id with no report behind it (the `/brain` preview writes those) has
 * nothing to adopt and says so.
 */
export const adoptBodyOf = (
  id: string,
): { reportId: string; actionIndex: number } | { interventionId: string } | null => {
  if (id.startsWith("int:")) {
    const interventionId = id.slice(4);
    return interventionId ? { interventionId } : null;
  }
  const m = /^plan:([^:]*):(\d+)$/.exec(id);
  if (!m || !m[1]) return null;
  return { reportId: m[1], actionIndex: Number(m[2]) };
};

/* What a card is allowed to print lives in `lib/plan-line.ts`, because
   `WhatToDo` is a client component and this file reaches the database. */
export { doseLine, doseParts, saysSomething } from "./plan-line";

/** One line for a prompt or a card: title · dose · label · what it should move. */
export const actionLine = (p: PlanLine): string =>
  [p.title, p.dose, p.label, p.target].filter(Boolean).join(" · ");

const toLine = (r: {
  id: string;
  conditionId: string;
  name: string;
  dose: string | null;
  duration: string | null;
  effect: string | null;
  direction: string;
  outcomeFeatureId: string | null;
  grade: string;
}): InterventionLine => ({
  id: r.id,
  conditionId: r.conditionId,
  name: r.name,
  dose: r.dose,
  duration: r.duration,
  effect: r.effect,
  direction: r.direction,
  outcomeFeatureId: r.outcomeFeatureId,
  grade: r.grade,
});

/**
 * The database half. `conditionId` null means the question named no condition,
 * and then every action on the plan is a candidate — which is what "what
 * should I eat?" needs.
 */
export async function actionsFor(
  userId: string,
  conditionId: string | null,
  limit = 3,
): Promise<PlanLine[]> {
  if (conditionId == null) {
    const report = await latestReport(userId);
    return pickActions({
      codes: [],
      actions: report?.body.actions ?? [],
      interventions: [],
      reportId: report?.id ?? null,
      limit,
      anyAction: true,
    });
  }
  const all = await actionsForAll(userId, [conditionId], limit);
  return all[conditionId] ?? [];
}

/**
 * The same answer for a whole page of cards, in three queries rather than
 * three per card: Home draws one block per likely or confirmed conclusion.
 */
export async function actionsForAll(
  userId: string,
  conditionIds: string[],
  limit = 3,
): Promise<Record<string, PlanLine[]>> {
  const out: Record<string, PlanLine[]> = {};
  if (!conditionIds.length) return out;

  const [report, catalog, rows] = await Promise.all([
    latestReport(userId),
    catalogFor(userId),
    getDb()
      .select()
      .from(hkbInterventions)
      .where(
        and(
          inArray(hkbInterventions.conditionId, conditionIds),
          eq(hkbInterventions.status, "accepted"),
        ),
      ),
  ]);
  const actions = report?.body.actions ?? [];
  const specs = new Map(catalog.map((h) => [h.id, h]));

  for (const id of conditionIds) {
    const spec = specs.get(id);
    out[id] = pickActions({
      codes: spec ? metricCodesOf(spec) : [],
      actions,
      interventions: rows.filter((r) => r.conditionId === id).map(toLine),
      reportId: report?.id ?? null,
      limit,
    });
  }
  return out;
}
