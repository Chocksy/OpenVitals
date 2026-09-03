/**
 * One turn in a thread, assembled but not run.
 *
 * Phase 28c. The route streams the turn and `evals/thread.ts` generates it in
 * one shot, and both have to be the same turn or the eval proves nothing. So
 * everything that decides what the model sees lives here, and the two callers
 * differ only in how they read the answer back.
 */
import {
  convertToModelMessages,
  stepCountIs,
  type LanguageModel,
  type ModelMessage,
  type StopCondition,
  type streamText,
  type ToolSet,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { getDb, threads, threadMessages } from "@/db";
import type { Thread } from "@/db/schema";
import { briefFor, type Brief } from "./brief";
import { QUESTION_SYSTEM } from "./lookup";
import { FALLBACK_WINDOW, threadModel } from "./thread-model";
import { FOLLOW_UP_SHAPE, THREAD_RULES, threadTools } from "./thread-tools";

/** The title a thread gets: the first question, cut. */
export const titleOf = (text: string): string =>
  (text.trim().slice(0, 80) || "Untitled").trim();

/** Everything the person typed in this turn, as one string. */
export const textOf = (m: UIMessage): string =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("")
    .trim();

/**
 * The rules and the shape one turn answers in. Pure, so a test can read it.
 *
 * The first turn in a thread is a question asked cold and takes the shape
 * `systemFor(kind)` picked for it. Every later turn keeps the same rules and
 * swaps the shape for the follow-up one.
 */
export const systemForTurn = (brief: Brief, isFollowUp: boolean): string =>
  isFollowUp ? `${QUESTION_SYSTEM}\n\n${FOLLOW_UP_SHAPE}` : brief.system;

/** One content part on a message, whatever kind it is. */
type Part = { type?: string; text?: string };

/**
 * The messages a turn is allowed to leave behind: the conversation, and only
 * the conversation.
 *
 * Phase 31a item 1, and the cause of the whole bug. What we store is replayed
 * verbatim on the next turn, so a stored message has to be something the
 * provider will accept back. Two kinds are not.
 *
 * Reasoning: Gemini hands its thinking back with a signature attached, and
 * that signature is only valid inside the round trip it came from. Replayed,
 * the next turn answers "Corrupted thought signature" and dies before a word
 * is written.
 *
 * The tool loop: a function call replayed without the thought signature that
 * came with it is refused the same way. And it does not need replaying. The
 * tools already wrote to the database, the receipts are in the `ui` column the
 * page rehydrates from, and `briefFor` rebuilds the closed sets from the
 * engine every single turn — so the ids are on offer again, freshly, rather
 * than remembered. What the next turn needs from this one is what was said.
 *
 * Then: drop any message left with no content. An assistant row with nothing
 * in it is a thread that looks answered when it was not.
 *
 * Pure, so `lib/thread-turn.test.ts` reads it without a model.
 */
const REPLAYABLE = new Set(["text"]);

export function keepable(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === "tool") continue;
    if (typeof m.content === "string") {
      if (m.content.trim()) out.push(m);
      continue;
    }
    const content = (m.content as Part[]).filter(
      (p) => REPLAYABLE.has(p.type ?? "") && (p.text ?? "").trim() !== "",
    );
    if (content.length) out.push({ ...m, content } as ModelMessage);
  }
  return out;
}

export interface TurnBody {
  threadId?: string;
  about?: string;
  message: UIMessage;
}

export interface Turn {
  thread: Thread;
  brief: Brief;
  /** exactly what `streamText` or `generateText` is called with */
  args: {
    model: LanguageModel;
    system: string;
    messages: ModelMessage[];
    tools: ToolSet;
    stopWhen: StopCondition<ToolSet>;
    providerOptions: Parameters<typeof streamText>[0]["providerOptions"];
  };
  /** whether the provider is carrying the context, not us */
  compacts: boolean;
  /**
   * The two rows this turn leaves behind, written when the answer is done.
   *
   * A turn that produced nothing writes nothing — not the empty assistant row
   * and not the question either, so a retry starts from a clean thread instead
   * of asking the same thing twice into a hole.
   */
  save: (produced: ModelMessage[], ui: UIMessage) => Promise<void>;
}

/** A refusal the caller turns into a status code. */
export interface TurnRefused {
  error: string;
  status: number;
}

export async function prepareTurn(
  userId: string,
  body: TurnBody,
): Promise<Turn | TurnRefused> {
  const message = body.message;
  if (!message) return { error: "no message", status: 400 };
  const text = textOf(message);

  const db = getDb();
  let thread: Thread | undefined;
  if (body.threadId) {
    [thread] = await db
      .select()
      .from(threads)
      .where(eq(threads.id, body.threadId));
    if (!thread || thread.userId !== userId)
      return { error: "not found", status: 404 };
  } else {
    [thread] = await db
      .insert(threads)
      .values({ userId, title: titleOf(text), about: body.about ?? null })
      .returning();
  }
  if (!thread) return { error: "no thread", status: 500 };
  const its = thread;

  const brief = await briefFor(userId, text, its.about ?? undefined);
  const stored = await db
    .select({ model: threadMessages.model })
    .from(threadMessages)
    .where(eq(threadMessages.threadId, its.id))
    .orderBy(threadMessages.createdAt);

  const { model, providerOptions, compacts } = threadModel(userId);
  const past = stored.flatMap((r) => r.model as ModelMessage[]);
  /**
   * The compaction item comes back inside `response.messages` as an assistant
   * `custom` part and goes back out with the next request, so on the OpenAI
   * path nothing is ever dropped. Without it, a fixed window is the honest
   * fallback.
   */
  const history = compacts ? past : past.slice(-FALLBACK_WINDOW);
  const turn = await convertToModelMessages([message]);

  return {
    thread: its,
    brief,
    compacts,
    args: {
      model,
      /**
       * The thread rules go last, after the data, so they win over the shape.
       */
      system: `${systemForTurn(brief, past.length > 0)}\n\n${brief.facts}\n${THREAD_RULES}`,
      messages: [...history, ...turn],
      tools: threadTools(userId, brief, its.id),
      stopWhen: stepCountIs(4),
      providerOptions,
    },
    save: async (produced, ui) => {
      const kept = keepable(produced);
      if (!kept.length) {
        console.warn(`[thread ${its.id}] answered nothing, so nothing saved`);
        return;
      }
      await db.insert(threadMessages).values([
        { threadId: its.id, role: "user", ui: message, model: turn },
        { threadId: its.id, role: "assistant", ui, model: kept },
      ]);
      await db
        .update(threads)
        .set({ lastTurnAt: new Date() })
        .where(eq(threads.id, its.id));
    },
  };
}
