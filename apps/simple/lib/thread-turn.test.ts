import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { keepable, systemForTurn, textOf, titleOf } from "./thread-turn";

/**
 * Phase 31a item 1. Two threads the owner opened on 2026-09-02 stored a first
 * answer and then an empty assistant row for the follow-up, and the screen
 * said "An error occurred." Three things are locked here: what a turn is
 * allowed to leave behind, that the route keeps every step rather than the
 * last one, and that the failure reaches both the log and the screen.
 */
describe("keepable", () => {
  it("never stores reasoning, whatever it carries", () => {
    /* Gemini's thought signature is only valid inside the round trip it came
       from; replayed, the next turn dies on "Corrupted thought signature". */
    const thought: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "**Lowering Your LDL** I'm focusing on…",
            providerOptions: {
              openrouter: {
                reasoning_details: [{ signature: "AY89a1/6YArOMKZX" }],
              },
            },
          },
          { type: "text", text: "Your LDL is 131 mg/dL." },
        ],
      } as unknown as ModelMessage,
    ];
    const kept = keepable(thought);
    expect(JSON.stringify(kept)).not.toContain("signature");
    expect(JSON.stringify(kept)).not.toContain("reasoning");
    expect(kept[0]!.content).toEqual([
      { type: "text", text: "Your LDL is 131 mg/dL." },
    ]);
  });

  it("drops an assistant message whose only part is empty reasoning", () => {
    const stub: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "",
            providerOptions: { openrouter: { reasoning_details: [] } },
          },
        ],
      } as unknown as ModelMessage,
    ];
    expect(keepable(stub)).toEqual([]);
  });

  it("keeps the words and drops the scratchpad beside them", () => {
    const turn: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: "" },
          { type: "text", text: "Your LDL is 131 mg/dL." },
        ],
      } as unknown as ModelMessage,
    ];
    const kept = keepable(turn);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.content).toEqual([
      { type: "text", text: "Your LDL is 131 mg/dL." },
    ]);
  });

  it("never stores the tool loop either", () => {
    /* A function call replayed without the thought signature that came with
       it is refused the same way. It does not need replaying: the tools have
       written, and `briefFor` puts the ids back on offer every turn. */
    const loop: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Take selenium 200 µg daily." },
          { type: "tool-call", toolCallId: "c1", toolName: "offer", input: {} },
        ],
      } as unknown as ModelMessage,
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "offer",
            output: { type: "json", value: {} },
          },
        ],
      } as unknown as ModelMessage,
    ];
    const kept = keepable(loop);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.content).toEqual([
      { type: "text", text: "Take selenium 200 µg daily." },
    ]);
  });

  it("leaves no orphan tool result behind", () => {
    const orphan: ModelMessage[] = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "offer",
            output: { type: "json", value: {} },
          },
        ],
      } as unknown as ModelMessage,
    ];
    expect(keepable(orphan)).toEqual([]);
  });

  it("keeps a user message whose content is a plain string", () => {
    const asked: ModelMessage[] = [
      { role: "user", content: "how can i improve it?" },
    ];
    expect(keepable(asked)).toEqual(asked);
  });

  it("drops a message with nothing in it at all", () => {
    expect(
      keepable([{ role: "assistant", content: [] } as ModelMessage]),
    ).toEqual([]);
  });
});

describe("one turn's plumbing", () => {
  it("cuts a long question down to a title", () => {
    expect(titleOf("  What is my LDL and how can i improve it?  ")).toBe(
      "What is my LDL and how can i improve it?",
    );
  });

  it("reads the words out of a message", () => {
    expect(
      textOf({
        id: "x",
        role: "user",
        parts: [{ type: "text", text: " how can i improve it? " }],
      }),
    ).toBe("how can i improve it?");
  });

  it("swaps the shape on a follow-up", () => {
    const brief = { system: "COLD SHAPE" } as Parameters<
      typeof systemForTurn
    >[0];
    expect(systemForTurn(brief, false)).toBe("COLD SHAPE");
    expect(systemForTurn(brief, true)).not.toBe("COLD SHAPE");
  });
});

const route = readFileSync(
  fileURLToPath(new URL("../app/api/chat/route.ts", import.meta.url)),
  "utf8",
);

describe("the route", () => {
  it("saves every step, not the last one", () => {
    expect(route).toContain("steps.flatMap((s) => s.response.messages)");
    expect(route).not.toMatch(/produced = response\.messages/);
  });

  it("sends the failure to the screen as well as the log", () => {
    expect(route).toContain("onError: (error) => failureLine(error)");
    expect(route).toContain("[thread ${turn.thread.id}] failed:");
  });
});

const turnSource = readFileSync(
  fileURLToPath(new URL("./thread-turn.ts", import.meta.url)),
  "utf8",
);

describe("save", () => {
  it("writes nothing at all when the turn produced nothing", () => {
    expect(turnSource).toContain("if (!kept.length)");
    expect(turnSource).toContain("answered nothing, so nothing saved");
  });
});
