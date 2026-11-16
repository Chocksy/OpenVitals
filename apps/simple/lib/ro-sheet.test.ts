import { describe, expect, it } from "vitest";
import { romanianSheet } from "./ro-sheet";

describe("romanianSheet", () => {
  it("names the core in Romanian and keeps an unknown test in English", () => {
    const text = romanianSheet("2026-11-18", [
      { code: "ldl_cholesterol", name: "Lipid panel", lastDrawn: "2026-04-23" },
      { code: "breath_h2_peak", name: "Hydrogen and methane breath test" },
    ]);
    expect(text).toMatch(/^Analize de sânge · 18 nov\.? 2026/);
    expect(text).toContain("- Profil lipidic");
    expect(text).toContain("ultima recoltare 23 apr");
    expect(text).toContain("- Hydrogen and methane breath test");
  });
});
