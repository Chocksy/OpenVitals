/**
 * `PUT /api/targets` `{ kcal, proteinG }`: the person's own food targets.
 * Phase 37 task A2.
 *
 * `/api/facts` cannot do this: it takes only the profile questions, and it has
 * no way to clear an answer. A number writes the fact, null clears it (the
 * estimate takes over again), and the reply is the targets as they now stand.
 */
import { currentUserId } from "@/lib/auth";
import { localDay } from "@/lib/daily";
import { setTargets, targetsFor } from "@/lib/targets";

/** Outside these a number is a typo, not a target. */
const BOUNDS = { kcal: [800, 6000], proteinG: [10, 400] } as const;

export async function PUT(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    kcal?: unknown;
    proteinG?: unknown;
  } | null;
  if (!body) return Response.json({ error: "bad body" }, { status: 400 });

  for (const field of ["kcal", "proteinG"] as const) {
    const v = body[field];
    if (v === undefined || v === null) continue;
    const [lo, hi] = BOUNDS[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi)
      return Response.json(
        { error: `${field} is a number from ${lo} to ${hi}, or null` },
        { status: 400 },
      );
  }

  await setTargets(
    userId,
    body as { kcal?: number | null; proteinG?: number | null },
  );
  return Response.json(await targetsFor(userId, localDay()));
}
