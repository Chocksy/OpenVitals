import { isAdmin } from "@/lib/auth";
import { brainContext, runBrain } from "@/lib/brain";
import { graphFacts, generateFromContext } from "@/lib/report";
import { EMPTY_OVERLAY, personaCase, type Overlay, type Scenario } from "@/lib/sample";
import type { Lens } from "@/lib/hypotheses";
import { runAssertions } from "@/evals/assert";
import { hunchRows, personOf, refreshHunches } from "@/lib/hunches";
import { signalsOf } from "@/lib/signals";

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

/** Phase 39 S8: one person's signals, read-only, or a hunch refresh. */
interface SignalsBody {
  mode: "signals" | "refresh";
  userId: string;
}

async function signalsView({ mode, userId }: SignalsBody) {
  const got =
    mode === "refresh"
      ? await refreshHunches(userId)
      : {
          ...signalsOf(
            (await personOf(userId, new Date().toISOString().slice(0, 10)))
              .input,
          ),
          explainedBy: {},
        };
  const hunches = (await hunchRows(userId)).map((h) => ({
    id: h.id,
    key: h.key,
    kind: h.kind,
    state: h.state,
    outcome: h.outcome,
    outcomeLine: h.outcomeLine,
    explanations: h.explanations?.length ?? null,
    question: h.question?.text ?? null,
    answer: h.answer,
    test: h.test ? `${h.test.name} · ${h.test.price} ${h.test.currency}${h.test.estimated ? " (est.)" : ""}` : null,
    openedAt: h.openedAt?.toISOString().slice(0, 10) ?? null,
  }));
  return { ...got, hunches };
}

/** One engine run for one scenario, or one plan for it. Admin only. */
export async function POST(request: Request) {
  if (!(await isAdmin()))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const raw = (await request.json()) as Body | SignalsBody;
  if (raw.mode === "signals" || raw.mode === "refresh") {
    if (typeof raw.userId !== "string" || !raw.userId)
      return Response.json({ error: "a userId" }, { status: 400 });
    return Response.json(await signalsView(raw));
  }
  const body = raw as Body;
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
