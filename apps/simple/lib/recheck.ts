/**
 * What is due for a recheck: the monitoring half of a blood draw.
 *
 * The information-gain engine (`lib/infogain.ts`) only buys tests that would
 * settle a suspected condition, so a marker already on file never comes back
 * however far it drifts. This is the other half, and it is strict about
 * price: a row needs a reason that could change what you do. That is a value
 * outside the lab range (now, or by today on its own trend), a drift or step
 * an open hunch saw, or a core marker never measured once. A normal value
 * that is merely a year old is not a reason.
 *
 * Pure, so `lib/recheck.test.ts` runs it without a database.
 */
import { coverage, daysBetweenDates, type ModelInput } from "./coverage";
import { dayLabel } from "./utils";

export interface Recheck {
  /** the vector id: "lipids", "ferritin" */
  id: string;
  name: string;
  codes: string[];
  lastDate: string | null;
  why: string;
}

/**
 * Hunch kinds that mean "this marker is moving", per `lib/hunches.ts`.
 * `cluster` and `gap` are left out on purpose: a cluster of normal values and
 * a genome nudge are reasons to look, not reasons to pay for a draw.
 */
const MOVING: Record<string, string> = {
  drift: "drifting over the last draws",
  step: "jumped since the draw before",
};

/** Nothing is worth a second needle inside three months. */
const FLAGGED_DAYS = 90;
/** `staleDays` above this is "once in a life" (Lp(a), TPO). */
const ONCE = 9999;

export function rechecksOf(
  m: ModelInput,
  hunches: { kind: string; codes: string[] }[],
): Recheck[] {
  const flagged = new Map<string, string>();
  for (const h of hunches)
    if (MOVING[h.kind]) for (const c of h.codes) flagged.set(c, h.kind);

  const due: Recheck[] = [];
  const byId = new Map(coverage(m).map((r) => [r.vector.id, r]));
  for (const r of byId.values()) {
    const v = r.vector;
    const codes = v.codes ?? [];
    if (!codes.length || v.tier === 0 || r.state === "n/a") continue;
    if (v.staleDays > ONCE) continue;
    const last = r.lastDate ?? null;
    const days = last ? daysBetweenDates(last, m.today) : Infinity;
    const when = last ? `last drawn ${dayLabel(last, true)}` : "";
    const row = (why: string) => ({
      id: v.id,
      name: v.name,
      codes,
      lastDate: last,
      why,
    });

    // Only a reason that could change what you do earns a needle. A normal,
    // steady value that is merely a year old does not, and neither does a
    // miss of an "optimal" band that sits inside the lab's own range.
    const kind = codes.map((c) => flagged.get(c)).find(Boolean);
    const out = codes.find((c) => outOfRange(m, c, days));
    if (r.state === "never") {
      // Tier 2 is conditional: never having had a PSA is not a reason here.
      if (v.tier === 1)
        due.push(row("Never measured: one baseline is worth having."));
    } else if (days < FLAGGED_DAYS) continue;
    else if (out)
      due.push(
        row(
          m.latest[out]!.status === "red"
            ? `Outside the lab range, ${when}.`
            : `On its trend it has left the lab range by now, ${when}.`,
        ),
      );
    else if (kind === "drift" || kind === "step")
      due.push(row(`${cap(MOVING[kind]!)}, ${when}.`));
  }

  // ApoB is the better single number for what a drifting lipid panel asks.
  if (due.some((d) => d.id === "lipids")) {
    const apob = byId.get("apob");
    if (apob && apob.state !== "n/a" && !due.some((d) => d.id === "apob"))
      due.push({
        id: "apob",
        name: apob.vector.name,
        codes: apob.vector.codes ?? [],
        lastDate: apob.lastDate ?? null,
        why: "Goes with the lipid panel: the particle count is the better risk number.",
      });
  }
  return due;
}

/**
 * Outside the lab's own range now, or projected outside it by today on the
 * line through the last draws. ponytail: a straight line, so a marker that
 * bounces gets a noisy projection; the slope needs three draws in five years.
 */
function outOfRange(m: ModelInput, code: string, days: number): boolean {
  const l = m.latest[code];
  if (!l || l.value == null) return false;
  if (l.status === "red" && l.refHigh != null && l.value > l.refHigh)
    return true;
  if (l.status === "red" && l.refLow != null && l.value < l.refLow) return true;
  const now =
    l.slope && l.slope.n >= 3
      ? l.value + (l.slope.perYear * days) / 365
      : l.value;
  // A floor of zero is no floor: a CRP falling toward it is good news.
  return (
    (l.refHigh != null && now > l.refHigh) ||
    (l.refLow != null && l.refLow > 0 && now < l.refLow)
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
