/**
 * The acceptance policy over the rows that are still waiting.
 *
 *   pnpm --filter simple hkb:policy            # dry run, prints one line per row
 *   pnpm --filter simple hkb:policy --apply    # writes the decisions
 *
 * Principle 1: admin pages are windows, not queues. Every `proposed` row that
 * this app ever wrote is judged in code here, once, and after that nothing
 * waits for a click. A row the policy calls `review` still scores; it just
 * carries `needs_look` so /hkb can put a chip on it.
 */
import { eq, inArray } from "drizzle-orm";
import { getDb, hkbConditions, hkbEvidence, hkbFeatures } from "@/db";
import { recordRevision } from "@/lib/hkb";
import { recordRun, took } from "@/lib/hkb-import";
import { decide, statusOf, type Decision } from "@/lib/hkb-policy";
import type { Grade } from "@/lib/hypotheses";

export interface PolicyRow {
  id: string;
  conditionId: string;
  featureId: string;
  decision: Decision;
}

export interface PolicyResult {
  rows: PolicyRow[];
  counts: Record<Decision, number>;
  applied: number;
}

/**
 * Every `proposed` row, decided. The stored row does not remember which
 * numbers its paper printed, so only the "a quote with no number in it cannot
 * carry a number" half of that rule can fire here; the full check runs at
 * insert time in `lib/research.ts`.
 */
export async function runPolicy({
  apply = false,
}: { apply?: boolean } = {}): Promise<PolicyResult> {
  const started = Date.now();
  const db = getDb();
  const [rows, conditions, features] = await Promise.all([
    db.select().from(hkbEvidence).where(eq(hkbEvidence.status, "proposed")),
    db
      .select({ id: hkbConditions.id, inCatalog: hkbConditions.inCatalog })
      .from(hkbConditions),
    db.select({ id: hkbFeatures.id, unit: hkbFeatures.unit }).from(hkbFeatures),
  ]);

  const inCatalog = new Map(conditions.map((c) => [c.id, c.inCatalog]));
  const known = new Map(features.map((f) => [f.id, f.unit]));

  // The rows already verified on the same claim, so the "disagree by more than
  // 3x" branch has something to compare against.
  const verified = await db
    .select({
      conditionId: hkbEvidence.conditionId,
      featureId: hkbEvidence.featureId,
      conditionOn: hkbEvidence.conditionOn,
      lrPos: hkbEvidence.lrPos,
      status: hkbEvidence.status,
    })
    .from(hkbEvidence)
    .where(inArray(hkbEvidence.status, ["seed", "accepted"]));
  const peers = new Map<string, number[]>();
  const keyOf = (c: string, f: string, on: unknown) =>
    `${c}|${f}|${JSON.stringify(on)}`;
  for (const v of verified) {
    const key = keyOf(v.conditionId, v.featureId, v.conditionOn);
    peers.set(key, [...(peers.get(key) ?? []), v.lrPos]);
  }

  const out: PolicyRow[] = [];
  const counts: Record<Decision, number> = {
    accepted: 0,
    review: 0,
    rejected: 0,
  };
  let applied = 0;

  for (const e of rows) {
    const decision = decide({
      conditionId: e.conditionId,
      featureId: known.has(e.featureId) ? e.featureId : null,
      conditionOn: e.conditionOn,
      lrPos: e.lrPos,
      lrNeg: e.lrNeg,
      grade: e.grade as Grade,
      quote: e.paper?.quote ?? e.source,
      conditionInCatalog: inCatalog.get(e.conditionId) ?? false,
      peers: peers.get(keyOf(e.conditionId, e.featureId, e.conditionOn)),
    });
    counts[decision]++;
    out.push({
      id: e.id,
      conditionId: e.conditionId,
      featureId: e.featureId,
      decision,
    });

    if (!apply) continue;
    const set = statusOf(decision);
    await db
      .update(hkbEvidence)
      .set({
        ...set,
        reviewedAt: new Date(),
        reviewNote: `hkb:policy said ${decision}`,
      })
      .where(eq(hkbEvidence.id, e.id));
    applied++;
  }

  if (apply && applied)
    await recordRevision(
      `policy applied to ${applied} evidence rows: ${counts.accepted} accepted, ` +
        `${counts.review} flagged, ${counts.rejected} rejected`,
    );

  if (apply)
    await recordRun(
      "hkb-policy",
      { ...counts, applied },
      `${applied} rows decided: ${counts.accepted} accepted, ${counts.review} flagged, ` +
        `${counts.rejected} rejected, ${took(Date.now() - started)}`,
    );

  return { rows: out, counts, applied };
}

// ponytail: `process.argv` read through `globalThis` so the Edge bundle of
// `instrumentation.ts` does not warn about a Node API this branch never runs.
const argv: string[] =
  (globalThis as { process?: { argv?: string[] } }).process?.argv ?? [];

if (argv[1] && import.meta.url.endsWith(argv[1].split("/").pop()!)) {
  const apply = argv.includes("--apply");
  const { pool } = await import("@/db");
  runPolicy({ apply })
    .then(({ rows, counts, applied }) => {
      for (const r of rows)
        console.log(
          `${r.decision.padEnd(9)} ${r.conditionId.padEnd(22)} ${r.featureId.padEnd(28)} ${r.id}`,
        );
      console.log(
        `\n${rows.length} proposed rows: ${counts.accepted} accepted, ` +
          `${counts.review} accepted with needs_look, ${counts.rejected} rejected` +
          (apply ? ` — ${applied} written` : " — dry run, nothing written"),
      );
    })
    .then(() => pool().end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
