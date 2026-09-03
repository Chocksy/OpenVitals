/**
 * The research feed, for the person signed in.
 *
 * Phase 32a section 1. `/api/hkb` is gated on `isAdmin()` and somebody
 * pressing "Research now" is not an admin, which is the fourth thing the
 * mockup's build-cost note says does not exist. This is that route: it runs
 * the same Europe PMC search and the same intake, for one condition, for one
 * person, under the same ninety-day cooldown, and it writes to `paper_watch`
 * only — nothing it finds can ever multiply a probability until a human
 * accepts it on `/hkb`.
 */
import { currentUserId } from "@/lib/auth";
import {
  lastWatch,
  listWatch,
  runWatch,
  toApiPaper,
  watchConditions,
  watchDue,
  watchSince,
  type WatchCondition,
} from "@/lib/research-watch";

export const maxDuration = 300;

/** The rows this person has, unseen first. `?unseen=1` drops the seen ones. */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rows = await listWatch(userId, {
    unseen: url.searchParams.get("unseen") === "1",
    ...(url.searchParams.get("condition")
      ? { conditionId: url.searchParams.get("condition")! }
      : {}),
  });
  return Response.json({ rows: rows.map(toApiPaper) });
}

/**
 * Research one condition now.
 *
 * One run per condition per day, which is the ninety-day cooldown seen from
 * the other side: a condition inside its window is not re-read, and the reply
 * says when it last was rather than pretending it ran.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    conditionId?: string;
    maxPapers?: number;
  } | null;
  const wanted = body?.conditionId;
  if (!wanted) return Response.json({ error: "no condition" }, { status: 400 });

  const mine = await watchConditions(userId);
  const condition: WatchCondition | undefined = mine.find(
    (c) => c.id === wanted,
  );
  // A condition that is not in this person's ledger is not theirs to research:
  // the whole point of the feed is that a row is by construction "for you".
  if (!condition) return Response.json({ error: "not yours" }, { status: 404 });

  const last = await lastWatch(userId, condition.id);
  const now = new Date();
  if (!watchDue(last, now))
    return Response.json(
      {
        ok: false,
        cooldown: true,
        lastRun: last?.toISOString().slice(0, 10) ?? null,
        since: watchSince(last, now),
      },
      { status: 429 },
    );

  const max = Number(body?.maxPapers);
  const result = await runWatch(userId, condition, {
    ...(Number.isFinite(max) && max > 0
      ? { maxPapers: Math.min(max, 40) }
      : {}),
    now,
  });
  return Response.json({ ok: true, ...result });
}
