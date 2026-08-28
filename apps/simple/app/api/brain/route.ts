import { isAdmin } from "@/lib/auth";
import { brainContext, runBrain } from "@/lib/brain";
import { graphFacts, generateFromContext } from "@/lib/report";
import { EMPTY_OVERLAY, personaCase, type Overlay, type Scenario } from "@/lib/sample";
import type { Lens } from "@/lib/hypotheses";
import { runAssertions } from "@/evals/assert";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

interface Body {
  mode?: "run" | "generate";
  scenario: Scenario;
  overlay?: Overlay;
  lens?: Lens;
  /** cost the tree is allowed to spend; moves above it are dropped */
  budget?: number;
}

/** One engine run for one scenario, or one plan for it. Admin only. */
export async function POST(request: Request) {
  if (!(await isAdmin()))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as Body;
  const overlay = body.overlay ?? EMPTY_OVERLAY;

  try {
    if (body.mode !== "generate")
      return Response.json(
        await runBrain(body.scenario, overlay, body.lens, body.budget),
      );

    const { context, rules, patterns, graph, input } = await brainContext(
      body.scenario,
      overlay,
    );
    const plan = await generateFromContext(
      context,
      rules,
      undefined,
      graphFacts(patterns, graph, input),
    );
    const scenarioCase =
      body.scenario.kind === "persona" ? personaCase(body.scenario.id) : undefined;
    return Response.json({
      plan,
      assertions: scenarioCase
        ? runAssertions(
            plan,
            scenarioCase.must,
            scenarioCase.mustNot,
            scenarioCase.should,
          )
        : null,
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[brain] failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
