import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/** Each generateText call takes the next reply off this list. */
const ai = vi.hoisted(() => ({
  replies: [] as { toolCalls: { toolName: string; input: unknown }[] }[],
  calls: [] as any[],
  objectCalls: [] as any[],
}));
vi.mock("ai", () => ({
  generateText: async (opts: any) => {
    ai.calls.push(opts);
    const r = ai.replies.shift() ?? { toolCalls: [] };
    return {
      ...r,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
    };
  },
  generateObject: async (opts: any) => {
    ai.objectCalls.push(opts);
    return { object: { n: 1 } };
  },
  tool: (t: unknown) => t,
  wrapLanguageModel: ({ model }: { model: unknown }) => model,
  defaultSettingsMiddleware: () => ({}),
}));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => (id: string) => id,
}));

const { generateObjectSafe } = await import("./extract");
const schema = z.object({ n: z.number() });

beforeEach(() => {
  ai.replies = [];
  ai.calls = [];
  ai.objectCalls = [];
});

describe("generateObjectSafe", () => {
  it("reads an Anthropic answer off the submit tool, with auto tool choice", async () => {
    ai.replies = [{ toolCalls: [{ toolName: "submit", input: { n: 3 } }] }];
    const res = await generateObjectSafe({
      model: "anthropic/claude-sonnet-5.5",
      schema,
      system: "S",
      prompt: "P",
    });
    expect(res.object).toEqual({ n: 3 });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0].toolChoice).toBe("auto");
    expect(ai.calls[0].tools.submit).toBeTruthy();
    expect(ai.calls[0].system).toMatch(
      /^S\n\nAnswer only by calling the submit tool/,
    );
    expect(ai.objectCalls).toHaveLength(0);
  });

  it("asks once more when the first reply has no valid submit, and counts both costs", async () => {
    ai.replies = [
      { toolCalls: [] },
      { toolCalls: [{ toolName: "submit", input: { n: 4 } }] },
    ];
    const res = await generateObjectSafe({
      model: "anthropic/claude-opus-5.5",
      schema,
      prompt: "P",
    });
    expect(res.object).toEqual({ n: 4 });
    expect(ai.calls).toHaveLength(2);
    expect(res.usage?.totalTokens).toBe(30);
    expect(
      (res.providerMetadata?.openrouter as { usage: { cost: number } }).usage
        .cost,
    ).toBeCloseTo(0.02);
  });

  it("gives up after two replies without a valid submit", async () => {
    ai.replies = [
      { toolCalls: [{ toolName: "submit", input: { n: "x" } }] },
      { toolCalls: [] },
    ];
    await expect(
      generateObjectSafe({
        model: "anthropic/claude-sonnet-5.5",
        schema,
        prompt: "P",
      }),
    ).rejects.toThrow(/answered with no submit call/);
    expect(ai.calls).toHaveLength(2);
  });

  it("stops after a cut-off answer: asking again would be cut off again", async () => {
    ai.replies = [
      { toolCalls: [{ toolName: "submit", input: "{\"n\": " }], finishReason: "length" } as never,
    ];
    await expect(
      generateObjectSafe({ model: "openai/gpt-6-luna", schema, prompt: "P" }),
    ).rejects.toThrow(/finish length/);
    expect(ai.calls).toHaveLength(1);
  });

  it("keeps generateObject for every other model", async () => {
    const res = await generateObjectSafe({
      model: "google/gemini-3.7-flash",
      schema,
      prompt: "P",
    });
    expect(res.object).toEqual({ n: 1 });
    expect(ai.objectCalls[0].model).toBe("google/gemini-3.7-flash");
    expect(ai.objectCalls[0].schema).toBe(schema);
    expect(ai.calls).toHaveLength(0);
  });
});
