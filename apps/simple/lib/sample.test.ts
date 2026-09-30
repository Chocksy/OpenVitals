import { describe, it, expect } from "vitest";
import type { ModelInput } from "./coverage";
import { applyOverlay, EMPTY_OVERLAY } from "./sample";

const someInput: ModelInput = {
  today: "2026-09-30",
  profile: { sym_cold: "No", sym_hair_skin: "No" },
  latest: {},
  derived: {},
};

describe("applyOverlay", () => {
  it("treats a simulated answer as new (44A)", () => {
    const m = { ...someInput, profileAt: { sym_cold: "2025-01-01" } };
    const out = applyOverlay(m, {
      ...EMPTY_OVERLAY,
      facts: { sym_cold: "Yes" },
    });
    expect(out.profileAt?.sym_cold).toBeUndefined();
  });
  it("keeps the dates of answers the overlay did not touch", () => {
    const m = {
      ...someInput,
      profileAt: { sym_cold: "2025-01-01", sym_hair_skin: "2025-02-01" },
    };
    const out = applyOverlay(m, {
      ...EMPTY_OVERLAY,
      facts: { sym_cold: "Yes" },
    });
    expect(out.profileAt?.sym_hair_skin).toBe("2025-02-01");
  });
});
