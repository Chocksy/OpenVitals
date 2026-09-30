import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
import { CheckinFlow } from "./checkin-flow";

/**
 * Phase 44C: the web `/checkin` draws the JSON `/api/checkin` returns. These
 * pin the why line, the header (Ask later, Skip this round, "2 of 5", no
 * progress bar) and the since screen. Synthetic values only.
 */
const body = (
  screen: object,
  progress = { at: 0, of: 5 },
  picture: object[] = [],
) => ({
  due: true,
  dueAt: "2026-10-08T00:00:00.000Z",
  screen,
  progress,
  picture,
});

const render = (initial: unknown) =>
  renderToStaticMarkup(
    createElement(CheckinFlow, { initial: initial as never }),
  );

const q = {
  kind: "question",
  key: "sym_cold",
  question: "Do you feel cold?",
  why: "The app has a weak hunch about a thyroid condition. This answer tells it more.",
  options: [
    { label: "No", moves: null },
    {
      label: "Yes",
      moves: { id: "a", name: "Hypothyroidism", from: 20, to: 34 },
    },
  ],
};

const since = (over: object = {}) =>
  body(
    {
      kind: "since",
      moved: [
        {
          id: "a",
          name: "Iron deficiency",
          from: 43,
          to: 61,
          by: "your tiredness answer",
        },
      ],
      hunches: [],
      test: null,
      ...over,
    },
    { at: 5, of: 5 },
  );

describe("CheckinFlow", () => {
  it("shows the why under the question", () => {
    const html = render(
      body({
        kind: "question",
        key: "sym_cold",
        question: "Do you feel cold?",
        why: "It's been 4 months since you said No.",
        options: [{ label: "No" }, { label: "Yes" }],
      }),
    );
    expect(html).toContain("Do you feel cold?");
    expect(html).toContain("It&#x27;s been 4 months since you said No.");
  });

  it("has Ask later, Skip this round and 2 of 5, and no progress bar", () => {
    const html = render(body(q, { at: 1, of: 5 }));
    expect(html).toContain("Ask later");
    expect(html).toContain("Skip this round");
    expect(html).toContain("2 of 5");
    expect(html).not.toContain('role="progressbar"');
  });

  it("prints each option and what it moves, and the picture", () => {
    const html = render(
      body(q, { at: 0, of: 3 }, [{ id: "a", name: "Hypothyroidism", p: 0.2 }]),
    );
    expect(html).toContain(">No<");
    expect(html).toContain("Yes moves Hypothyroidism 20 → 34");
    expect(html).toContain("Your picture so far");
    expect(html).toContain("20%");
  });

  it("shows what moved and why on since", () => {
    const html = render(since());
    expect(html).toContain(
      "Iron deficiency 43% → 61%, from your tiredness answer",
    );
  });

  it("hides Ask later and Skip this round on since", () => {
    const html = render(since());
    expect(html).not.toContain("Ask later");
    expect(html).not.toContain("Skip this round");
    expect(html).not.toContain("5 of 5");
    expect(html).toContain("Open my home");
  });

  it("prints hunches that got stronger or weaker, and the next test", () => {
    const html = render(
      since({
        moved: [],
        hunches: [
          { id: "h1", title: "Low iron stores", from: 30, to: 45 },
          { id: "h2", title: "A slow thyroid", from: 40, to: 22 },
        ],
        test: { label: "Ferritin", price: "€9" },
      }),
    );
    expect(html).toContain("Low iron stores got stronger, 30% → 45%");
    expect(html).toContain("A slow thyroid got weaker, 40% → 22%");
    expect(html).toContain("Ferritin");
    expect(html).toContain("€9");
  });

  it("says when nothing moved", () => {
    expect(render(since({ moved: [] }))).toContain("Nothing moved much");
  });
});
