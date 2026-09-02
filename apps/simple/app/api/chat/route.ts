/**
 * One turn in a thread, streamed.
 *
 * Phase 28c. The Vercel AI SDK we already run is the harness: `streamText`
 * with tools and `stopWhen` is the tool loop, `useChat` is the client, and the
 * provider does the context management. There is no summariser here and no
 * memory store; the facts block is rebuilt from the engine every turn, so a
 * fact a tool recorded last turn is in this turn's prompt.
 */
import { streamText, type ModelMessage } from "ai";
import { currentUserId } from "@/lib/auth";
import { prepareTurn, type TurnBody } from "@/lib/thread-turn";

export const maxDuration = 120;

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as TurnBody;
  const turn = await prepareTurn(userId, body);
  if ("error" in turn)
    return Response.json({ error: turn.error }, { status: turn.status });

  let produced: ModelMessage[] = [];
  const result = streamText({
    ...turn.args,
    onFinish: ({ response }) => {
      produced = response.messages;
    },
    onError: ({ error }) => console.error("[thread] failed:", error),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: [body.message],
    headers: { "x-thread-id": turn.thread.id },
    onFinish: async ({ responseMessage }) => {
      await turn.save(produced, responseMessage);
    },
  });
}
