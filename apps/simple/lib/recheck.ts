/**
 * What is due for a recheck: the monitoring half of a blood draw.
 *
 * The information-gain engine (`lib/infogain.ts`) only buys tests that would
 * settle a suspected condition, so a marker already on file never comes back
 * however far it drifts. This is the other half: the yearly core
 * (`VECTORS` tier 1 and 2, with their own `staleDays`) read against the date
 * of the last draw, plus every open hunch that says a marker is moving.
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

/** Hunch kinds that mean "this marker is moving", per `lib/hunches.ts`. */
const MOVING: Record<string, string> = {
  drift: "drifting over the last draws",
  step: "jumped since the draw before",
  cluster: "moved the worse way together with related markers",
  gap: "worth a check for your genome and missing from recent draws",
};

/** A flagged marker is worth a needle after three months. */
const FLAGGED_DAYS = 90;
/** An out-of-band marker, or the rest of the core on the same needle. */
const HALF_YEAR = 182;
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
  const sameNeedle: Recheck[] = [];
  for (const r of coverage(m)) {
    const v = r.vector;
    const codes = v.codes ?? [];
    if (!codes.length || v.tier === 0 || r.state === "n/a") continue;
    if (v.staleDays > ONCE) continue;
    const last = r.lastDate ?? null;
    const days = last ? daysBetweenDates(last, m.today) : Infinity;
    const when = last ? `last drawn ${dayLabel(last, true)}` : "";
    const kind = codes.map((c) => flagged.get(c)).find(Boolean);
    const off = codes.some((c) => {
      const s = m.latest[c]?.status;
      return s === "amber" || s === "red";
    });
    const row = (why: string) => ({
      id: v.id,
      name: v.name,
      codes,
      lastDate: last,
      why,
    });

    if (r.state === "never") {
      // Tier 2 is conditional: never having had a PSA is not a reason here.
      if (v.tier === 1)
        due.push(row("Never measured. Part of the yearly core."));
    } else if (r.state === "stale") due.push(row(`Due once a year, ${when}.`));
    else if (kind && days >= FLAGGED_DAYS)
      due.push(row(`${cap(MOVING[kind]!)}, ${when}.`));
    else if (off && days >= HALF_YEAR)
      due.push(row(`Last value outside the optimal band, ${when}.`));
    else if (v.tier === 1 && days >= HALF_YEAR)
      sameNeedle.push(row(`Same needle: ${when}.`));
  }
  // ponytail: the rest of the core only rides along when something is due;
  // a needle nobody needed is not worth adding markers to.
  return due.length ? [...due, ...sameNeedle] : [];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
