import { describe, expect, it } from "vitest";
import { checkFact } from "./fact-input";

describe("checkFact", () => {
  it("accepts a known key with a listed option", () => {
    expect(checkFact("setup_goal", "Prevention")).toEqual({ ok: true });
  });
  it("accepts free text on a free question", () => {
    expect(checkFact("birth_year", "1990")).toEqual({ ok: true });
  });
  it("rejects unknown keys, blanks and unlisted options", () => {
    expect(checkFact("nope", "x")).toEqual({
      ok: false,
      error: "unknown question",
    });
    expect(checkFact(undefined, "x")).toEqual({
      ok: false,
      error: "unknown question",
    });
    expect(checkFact("sex", "  ")).toEqual({ ok: false, error: "no answer" });
    expect(checkFact("sex", 3)).toEqual({ ok: false, error: "no answer" });
    expect(checkFact("setup_goal", "Other")).toEqual({
      ok: false,
      error: "not one of the options",
    });
  });
});
