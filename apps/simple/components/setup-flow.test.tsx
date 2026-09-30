import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
import { barLabel, deltaOf, deltaText, SetupFlow } from "./setup-flow";
import { EmptyHome } from "./home";

/**
 * Phase 43B: the web `/setup` draws the JSON `/api/setup` returns. These pin
 * the progress bar, where Skip shows, the "moves" line under each option,
 * the delta beside a bar (only at two points or more), and the reveal.
 * Synthetic values only.
 */
const body = (screen: object, picture: object[] = []) =>
  ({ due: true, screen, progress: { at: 3, of: 14 }, picture });

const html = (initial: unknown) =>
  renderToStaticMarkup(createElement(SetupFlow, { initial: initial as never }));

describe("deltaOf", () => {
  it("keeps moves of two points or more", () => {
    const d = deltaOf(
      [
        { id: "a", name: "A", p: 0.12 },
        { id: "b", name: "B", p: 0.4 },
      ],
      [
        { id: "a", name: "A", p: 0.31 },
        { id: "b", name: "B", p: 0.41 },
      ],
    );
    expect([...d]).toEqual([["a", 19]]);
  });
  it("gives a row that just arrived no delta", () => {
    expect(deltaOf([], [{ id: "a", name: "A", p: 0.3 }]).size).toBe(0);
  });
  it("keeps a fall, as a negative number", () => {
    const d = deltaOf(
      [{ id: "a", name: "A", p: 0.4 }],
      [{ id: "a", name: "A", p: 0.33 }],
    );
    expect(d.get("a")).toBe(-7);
  });
});

describe("barLabel and deltaText", () => {
  it("prints whole percent", () => {
    expect(barLabel(0.314)).toBe("31%");
  });
  it("signs a delta with a plus or a minus sign", () => {
    expect(deltaText(19)).toBe("+19");
    expect(deltaText(-7)).toBe("−7");
  });
});

describe("SetupFlow", () => {
  it("prints the question, each option and what it moves", () => {
    const out = html(
      body({
        kind: "question",
        key: "sym_energy",
        question: "Have you been tired most days for over a month?",
        options: [
          { label: "No", moves: null },
          {
            label: "Yes",
            moves: {
              id: "iron_deficiency",
              name: "Iron deficiency",
              from: 12,
              to: 31,
            },
          },
        ],
      }),
    );
    expect(out).toContain("Have you been tired most days");
    expect(out).toContain("Yes moves Iron deficiency 12 → 31");
    expect(out).not.toContain("No moves");
    expect(out).toContain(">Skip<");
  });

  it("has no skip on intro and basics", () => {
    expect(
      html(
        body({
          kind: "intro",
          goals: ["Feel better", "Prevention"],
        }),
      ),
    ).not.toContain(">Skip<");
    expect(
      html(body({ kind: "basics", sex: null, birthYear: null, country: null })),
    ).not.toContain(">Skip<");
  });

  it("has skip on upload, body, treatments and data", () => {
    for (const screen of [
      { kind: "upload" },
      { kind: "body", heightCm: null, weightKg: null, waistCm: null },
      { kind: "treatments", current: [] },
      { kind: "data", needsUpload: true },
    ])
      expect(html(body(screen))).toContain(">Skip<");
  });

  it("offers Finish later on every screen", () => {
    const out = html(body({ kind: "intro", goals: ["Prevention"] }));
    expect(out).toContain("Finish later");
    expect(out).toContain('href="/?home=1"');
  });

  it("says nothing stands out when the picture is empty", () => {
    expect(
      html(
        body({ kind: "body", heightCm: null, weightKg: null, waistCm: null }),
      ),
    ).toContain("Nothing stands out yet.");
  });

  it("draws the picture as bars with a percent", () => {
    const out = html(
      body({ kind: "data", needsUpload: false }, [
        { id: "iron_deficiency", name: "Iron deficiency", p: 0.31 },
      ]),
    );
    expect(out).toContain("Iron deficiency");
    expect(out).toContain("31%");
    expect(out).toContain("width:31%");
  });

  it("uses a decimal keypad for body numbers (62.5 kg)", () => {
    const out = html(
      body({ kind: "body", heightCm: "170", weightKg: null, waistCm: null }),
    );
    expect(out).toContain('inputMode="decimal"');
    expect(out).toContain('value="170"');
  });

  it("offers the treatment chips and months", () => {
    const out = html(body({ kind: "treatments", current: [] }));
    for (const chip of ["Iron", "Vitamin D", "B12", "Statin", "Other"])
      expect(out).toContain(`>${chip}<`);
    expect(out).toContain('type="month"');
    expect(out).toContain("Still taking");
    expect(out).toContain("Add another");
  });

  it("says a reveal from answers alone", () => {
    const out = html(
      body({
        kind: "reveal",
        fromAnswersOnly: true,
        hunchId: null,
        case: null,
        picture: [{ id: "a", name: "Iron deficiency", p: 0.4 }],
        test: { label: "Ferritin", price: "€9" },
        action: { id: "int:x1", title: "Iron bisglycinate 25 mg" },
      }),
    );
    expect(out).toContain("From your answers alone.");
    expect(out).toContain("Iron deficiency");
    expect(out).toContain("Ferritin");
    expect(out).toContain("€9");
    expect(out).toContain("Why this test");
    expect(out).toContain("Iron bisglycinate 25 mg");
    expect(out).toContain(">Add<");
    expect(out).toContain("Open my home");
    expect(out).not.toContain(">Skip<");
    expect(out).not.toContain("Finish later");
  });

  it("draws the case differential on the reveal when a case is set", () => {
    const out = html(
      body({
        kind: "reveal",
        fromAnswersOnly: false,
        hunchId: "h1",
        case: {
          differential: {
            options: [
              {
                id: "iron_deficiency",
                name: "Iron deficiency",
                pct: 48,
                reason: "Ferritin sits low.",
                sources: [],
                confirmTest: null,
              },
            ],
            otherPct: 12,
            splitTest: "Transferrin saturation",
          },
          bestRead: null,
          research: null,
        },
        picture: [],
        test: { label: "Transferrin saturation", price: null },
        action: null,
      }),
    );
    expect(out).toContain("Our read");
    expect(out).toContain("48%");
    expect(out).toContain("Other or unexplained");
    expect(out).not.toContain("From your answers alone.");
  });

  it("shows an upload error on the reveal", () => {
    const out = html({
      ...body({
        kind: "reveal",
        fromAnswersOnly: true,
        hunchId: null,
        case: null,
        picture: [],
        test: null,
        action: null,
      }),
      uploadError: "This PDF needs a password.",
    });
    expect(out).toContain("This PDF needs a password.");
    expect(out).toContain("Add it later from +");
  });

  it("prints the progress", () => {
    const out = html(body({ kind: "upload" }));
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-valuenow="3"');
    expect(out).toContain('aria-valuemax="14"');
  });
});

describe("the Day One card", () => {
  it("keeps its text and link and adds the setup link", () => {
    const out = renderToStaticMarkup(
      createElement(EmptyHome, { setup: "continue" }),
    );
    expect(out).toContain("Nothing measured yet");
    expect(out).toContain("Add your first result");
    expect(out).toContain('href="/setup"');
    expect(out).toContain("Continue setup");
  });
  it("says Start setup before anything was answered", () => {
    expect(
      renderToStaticMarkup(createElement(EmptyHome, { setup: "start" })),
    ).toContain("Start setup");
  });
  it("has no setup link once setup is closed", () => {
    expect(renderToStaticMarkup(createElement(EmptyHome))).not.toContain(
      'href="/setup"',
    );
  });
});
