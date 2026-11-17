import { describe, expect, it, vi } from "vitest";
import { memo, withRequestMemo } from "./request-memo";

describe("request memo", () => {
  it("runs the loader once per key inside withRequestMemo", async () => {
    const load = vi.fn(async () => 42);
    const [a, b] = await withRequestMemo(() =>
      Promise.all([memo("k", load), memo("k", load)]),
    );
    expect([a, b]).toEqual([42, 42]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("runs the loader every time outside withRequestMemo", async () => {
    const load = vi.fn(async () => 42);
    await memo("k", load);
    await memo("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
