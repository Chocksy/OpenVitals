/**
 * One turn in a thread, streamed.
 *
 * Phase 28c. The Vercel AI SDK we already run is the harness: `streamText`
 * with tools and `stopWhen` is the tool loop, `useChat` is the client, and the
 * provider does the context management. There is no summariser here and no
 * memory store; the facts block is rebuilt from the engine every turn, so a
 * fact a tool recorded last turn is in this turn's prompt.
 *
 * Phase 31a item 1. Two defects lived in the four lines below. `onFinish`
 * hands back the LAST step's messages, not the turn's, so the paragraph and
 * the `offer` call written in step one were dropped and the row that survived
 * was often the closing reasoning stub with no words in it — a thread with no
 * memory of its own answers. And when the stream failed, the client printed
 * the SDK's stock "An error occurred.", the server logged an object with no
 * provider body in it, and `save` still wrote the empty pair. Now the turn is
 * every step's messages, the error travels to the screen and to the log with
 * whatever the provider actually said, and a turn that produced nothing
 * writes nothing.
 */
import { streamText, type ModelMessage } from "ai";
import { currentUserId } from "@/lib/auth";
import { prepareTurn, type TurnBody } from "@/lib/thread-turn";

export const maxDuration = 120;

/** Whatever the provider said, flattened onto one line for the log. */
export function failureLine(error: unknown): string {
  const e = (error ?? {}) as Record<string, unknown>;
  const say = (v: unknown) =>
    typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
  return [
    e.name ?? (error instanceof Error ? error.name : ""),
    e.message ?? String(error),
    e.statusCode != null ? `status ${e.statusCode}` : "",
    e.url ? `url ${say(e.url)}` : "",
    e.responseBody ? `body ${say(e.responseBody)}` : "",
    e.data ? `data ${say(e.data)}` : "",
    e.cause
      ? `cause ${say((e.cause as { message?: string })?.message ?? e.cause)}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

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
    /**
     * Every step, not the last one: the paragraph, the `offer` call, its
     * result and the closing line are one assistant turn between them.
     */
    onFinish: ({ steps }) => {
      produced = steps.flatMap((s) => s.response.messages);
    },
    onError: ({ error }) =>
      console.error(`[thread ${turn.thread.id}] failed:`, failureLine(error)),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: [body.message],
    headers: { "x-thread-id": turn.thread.id },
    /** The screen says what went wrong, in the provider's own words. */
    onError: (error) => failureLine(error),
    onFinish: async ({ responseMessage }) => {
      await turn.save(produced, responseMessage);
    },
  });
}
