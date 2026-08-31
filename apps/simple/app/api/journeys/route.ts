import { desc, eq } from "drizzle-orm";
import { getDb, journeyRuns } from "@/db";
import { isAdmin } from "@/lib/auth";
import { currentRevision, loadCatalog } from "@/lib/hkb";
import {
  JOURNEYS,
  journeyById,
  runJourney,
  type Journey,
  type JourneyResult,
} from "@/lib/journey";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface Body {
  /** one journey, or every journey when it is missing */
  id?: string;
  /** the slider: euros the run may spend, 0 for the journey's own budget */
  budget?: number;
  /** the "what if" flips: answers and labs written over the truth */
  answers?: Record<string, string>;
  labs?: Record<string, number>;
  /** don't keep this one in `journey_runs` (a what-if is not a baseline) */
  ephemeral?: boolean;
}

/** The journey with the page's overrides folded in. */
const patched = (j: Journey, body: Body): Journey => ({
  ...j,
  budget: body.budget ? body.budget : j.budget,
  truth: {
    ...j.truth,
    answers: { ...j.truth.answers, ...(body.answers ?? {}) },
    labs: { ...j.truth.labs, ...(body.labs ?? {}) },
  },
});

/** The journeys and their last stored run, for the select. */
export async function GET() {
  if (!(await isAdmin()))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const rows = await getDb()
    .select()
    .from(journeyRuns)
    .orderBy(desc(journeyRuns.ranAt))
    .limit(200);

  return Response.json({
    journeys: JOURNEYS.map((j) => ({
      id: j.id,
      title: j.title,
      budget: j.budget ?? null,
      maxSteps: j.maxSteps,
      expect: j.expect,
      truth: j.truth,
    })),
    runs: rows.map((r) => ({
      id: r.id,
      journeyId: r.journeyId,
      ranAt: r.ranAt,
      kbRevision: r.kbRevision,
      result: r.result as JourneyResult,
    })),
  });
}

/** Run one journey, or all ten. Admin only, and it writes nothing but the run. */
export async function POST(request: Request) {
  if (!(await isAdmin()))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as Body;
  const wanted = body.id ? [journeyById(body.id)] : JOURNEYS;
  if (wanted.some((j) => !j))
    return Response.json({ error: "no such journey" }, { status: 404 });

  try {
    const catalog = await loadCatalog();
    const kbRevision = await currentRevision();
    const results: JourneyResult[] = [];
    for (const j of wanted as Journey[])
      results.push(await runJourney(patched(j, body), catalog));

    if (!body.ephemeral)
      await getDb()
        .insert(journeyRuns)
        .values(
          results.map((result) => ({
            journeyId: result.id,
            kbRevision,
            result,
          })),
        );

    return Response.json({ kbRevision, results });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[journeys] failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
