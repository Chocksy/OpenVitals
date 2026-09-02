/**
 * Which model answers a thread, and who keeps the thread inside the window.
 *
 * Phase 28c. We never summarise. OpenAI sells context management as a request
 * parameter that works with `store: false`, so the provider compacts and hands
 * its compaction item back inside `response.messages` as a `custom` content
 * part. We store those messages verbatim and replay them; that round trip is
 * the whole mechanism, and there is no summariser in this repo.
 *
 * With no OpenAI key the app still answers, through OpenRouter, with a fixed
 * window instead of compaction.
 */
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, streamText } from "ai";
import { model } from "./extract";

/**
 * When the provider starts compacting, in input tokens.
 *
 * The facts block is rebuilt every turn and runs about 6 k tokens. One stored
 * turn is the question, the paragraph and the `offer` call with its receipt,
 * which is about 2 k. So ten turns sit near 26 k and never trigger, twenty
 * turns cross it once, and a forty-turn thread crosses it repeatedly. The eval
 * forces it low to prove the round trip.
 */
export const COMPACT_THRESHOLD = Number(
  process.env.AI_THREAD_COMPACT_THRESHOLD ?? 40_000,
);

/** How many stored model messages the keyless path replays. */
export const FALLBACK_WINDOW = 40;

export interface ThreadModel {
  model: LanguageModel;
  providerOptions: NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;
  /** true when the provider keeps the thread inside the window for us */
  compacts: boolean;
}

export function threadModel(userId: string): ThreadModel {
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return {
      model: openai.responses(process.env.AI_THREAD_MODEL ?? "gpt-5.6-luna"),
      providerOptions: {
        openai: {
          store: false,
          contextManagement: [
            { type: "compaction", compactThreshold: COMPACT_THRESHOLD },
          ],
          /** the facts block is stable within one person, so cache on them */
          promptCacheKey: userId,
        },
      },
      compacts: true,
    };
  }
  // ponytail: no OpenAI key, no compaction. Keep the last 40 model messages;
  // switch to the OpenAI path when threads outgrow that.
  return {
    model: model(process.env.AI_THREAD_MODEL),
    providerOptions: {},
    compacts: false,
  };
}
