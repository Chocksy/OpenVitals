/**
 * The read receipt: what one file moved, stored on the file.
 *
 * Phase 32a section 4, per `docs/mockups/v4/blood.html` section 05. An upload
 * detail page used to say what came out of the file and nothing about what it
 * did — sixteen variants read, eleven with a known effect, and no answer to
 * "so is there anything for me to do?". The parse path now snapshots the
 * ledger before it starts and again after the curator has settled, and stores
 * the difference on `uploads.moved`.
 *
 * It is stored rather than recomputed for one reason: the ledger before the
 * file existed cannot be reconstructed later. Everything else on the page is
 * a view.
 */
import { eq } from "drizzle-orm";
import { getDb, uploads, type UploadMoved } from "@/db";
import { buildLedger } from "@/lib/ledger";
import {
  ledgerDiff,
  snapshotLedger,
  type LedgerSnapshot,
} from "@/lib/ledger-diff";

/** "Insulin resistance: likely" → "Insulin resistance". */
const nameOf = (title: string) => title.split(":")[0]!.trim();

/**
 * The diff between two snapshots as the four counters the receipt prints.
 *
 * Pure, and the same four words the Status card and `ledger.since` already
 * use, so a receipt and a "since" line can never disagree about what a file
 * did: a card that entered is `new`, one that left is `resolved`, and a number
 * that went up or down is `stronger` or `weaker`.
 */
export function movedOf(
  before: LedgerSnapshot,
  after: LedgerSnapshot,
): UploadMoved {
  const d = ledgerDiff(before, after);
  const lines = d.numbers.map((n) => ({
    id: n.id,
    name: nameOf(n.title),
    from: n.from,
    to: n.to,
  }));
  return {
    resolved: d.left.length,
    new: d.entered.length,
    stronger: d.numbers.filter((n) => n.to > (n.from ?? 0)).length,
    weaker: d.numbers.filter((n) => n.to < (n.from ?? 0)).length,
    lines,
  };
}

/** True when the file changed nothing the ledger prints. */
export const movedNothing = (m: UploadMoved | null | undefined): boolean =>
  !m || (m.resolved === 0 && m.new === 0 && m.stronger === 0 && m.weaker === 0);

/**
 * The one line the receipt leads with.
 *
 * "Nothing for you to do" is the answer most of the time and is printed as
 * plainly as the others. When something did move, the line names the biggest
 * move rather than summing four counters into a number nobody can picture.
 */
export function receiptLine(m: UploadMoved | null | undefined): string {
  if (movedNothing(m)) return "Nothing for you to do";
  const biggest = [...m!.lines].sort(
    (a, b) =>
      Math.abs((b.to ?? 0) - (b.from ?? 0)) -
      Math.abs((a.to ?? 0) - (a.from ?? 0)),
  )[0];
  if (biggest)
    return `${biggest.name} ${biggest.from ?? "—"} → ${biggest.to ?? "—"} %`;
  if (m!.new) return `${m!.new} new on the ledger`;
  return `${m!.resolved} settled`;
}

/** The ledger as it stands right now, for the "before" side of a receipt. */
export async function ledgerNow(userId: string): Promise<LedgerSnapshot> {
  return snapshotLedger(await buildLedger(userId));
}

/**
 * Score the ledger again and store the difference on the upload.
 *
 * Never fatal: a receipt is a nicety and an upload that parsed must not fail
 * because the scorer did.
 */
export async function recordUploadMove(
  userId: string,
  uploadId: string,
  before: LedgerSnapshot,
): Promise<UploadMoved | null> {
  try {
    const after = await ledgerNow(userId);
    const moved = movedOf(before, after);
    await getDb()
      .update(uploads)
      .set({ moved })
      .where(eq(uploads.id, uploadId));
    return moved;
  } catch (e) {
    console.error("[receipt] could not record what the upload moved:", e);
    return null;
  }
}

export interface DrawAnswer {
  code: string;
  name: string;
  from: number | null;
  to: number;
  unit: string | null;
  /** the reason it was put on the sheet, when it was planned */
  why: string | null;
}

/**
 * What a lab file answered: each marker in it against its own last value,
 * the planned ones first with the reason they were planned. A goal note
 * reads "planned draw · 18 Nov 2026 · Outside the lab range, ...".
 *
 * Pure, so `lib/read-receipt.test.ts` runs it.
 */
export function drawAnswers(
  rows: {
    metricCode: string;
    metricName: string;
    value: number | null;
    unit: string | null;
    observedAt: string;
  }[],
  earlier: { metricCode: string; value: number | null; observedAt: string }[],
  notes: { metricCode: string; note: string | null }[],
): DrawAnswer[] {
  const out: DrawAnswer[] = [];
  for (const r of rows) {
    if (r.value == null) continue;
    const prev = earlier
      .filter(
        (e) =>
          e.metricCode === r.metricCode &&
          e.value != null &&
          e.observedAt < r.observedAt,
      )
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
      .pop();
    const note = notes.find((n) => n.metricCode === r.metricCode)?.note ?? "";
    const why = note.startsWith("planned draw")
      ? note.split(" · ").slice(2).join(" · ") || "planned"
      : null;
    if (!prev && !why) continue;
    out.push({
      code: r.metricCode,
      name: r.metricName,
      from: prev?.value ?? null,
      to: r.value,
      unit: r.unit,
      why,
    });
  }
  return out.sort((a, b) => Number(!!b.why) - Number(!!a.why));
}
