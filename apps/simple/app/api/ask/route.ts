import { currentUserId } from "@/lib/auth";
import { askIntent } from "@/lib/ask-intent";
import {
  answerAsk,
  answerQuestion,
  considerTerm,
  plainSentence,
} from "@/lib/lookup";
import { recordBeliefs } from "@/lib/ledger";

export const maxDuration = 60;

interface Body {
  action?: "ask" | "consider";
  q?: string;
  /** the MONDO id the reply matched, for "Consider this for me" */
  mondoId?: string;
  /** skip the one optional LLM sentence */
  plain?: boolean;
}

/**
 * The ask box, trigger 5.
 *
 * Two routes, decided by `askIntent`: a word goes to the ontology lookup, a
 * question goes to the grounded answer. Everything numeric in either reply is
 * computed by the engine; the model only writes prose, and the box still works
 * with the model switched off.
 */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as Body;
  const q = (body.q ?? "").trim();

  try {
    if (body.action === "consider") {
      if (!body.mondoId?.startsWith("MONDO:"))
        return Response.json({ error: "not a disease" }, { status: 400 });
      const woken = await considerTerm(userId, body.mondoId, q);
      if (!woken)
        return Response.json({ error: "no such term" }, { status: 404 });
      // Score it straight away, so the reply that comes back is the real one.
      await recordBeliefs(userId);
      return Response.json({
        ok: true,
        ...woken,
        answer: await answerAsk(userId, q || woken.name),
      });
    }

    if (q.length < 2)
      return Response.json({ error: "type a word or two" }, { status: 400 });

    if (askIntent(q) === "question") {
      const answer = await answerQuestion(userId, q);
      return Response.json(answer);
    }

    const answer = await answerAsk(userId, q);
    answer.route = "term";
    if (!body.plain && answer.term)
      answer.sentence = await plainSentence(q, answer).catch(() => undefined);
    return Response.json(answer);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[ask] failed:", e);
    return Response.json({ error }, { status: 500 });
  }
}
