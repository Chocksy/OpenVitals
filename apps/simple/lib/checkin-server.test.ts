import { describe, expect, it } from "vitest";
import type { HunchExplanation } from "@/db";
import { firstState, type CheckinState, type RoundItem } from "./checkin";
import {
  checkPost,
  followupQuestion,
  followupsDue,
  probeOf,
  recentSkips,
  roundInputOf,
  sinceOf,
  slugOf,
  transition,
  treatmentFollowups,
  watchOf,
} from "./checkin-server";
import type { ModelInput } from "./coverage";
import type { Catalog, HypothesisResult } from "./hypotheses";
import type { Move } from "./infogain";

describe("checkPost", () => {
  it("rejects a later without an offset", () => {
    expect(checkPost({ later: true } as never)).toMatch(/offset/);
  });
  it("rejects an answer that is not one of the options", () => {
    expect(
      checkPost({ screen: "question", key: "sym_cold", value: "Maybe" }),
    ).toMatch(/option/);
  });
  it("takes a listed answer, a skip, and the fixed follow-up answers", () => {
    expect(
      checkPost({ screen: "question", key: "sym_cold", value: "Yes" }),
    ).toBeNull();
    expect(
      checkPost({ screen: "question", key: "sym_cold", skip: true }),
    ).toBeNull();
    expect(
      checkPost({
        screen: "question",
        key: "followup_adherence:item-1",
        value: "Most days",
      }),
    ).toBeNull();
    expect(
      checkPost({
        screen: "question",
        key: "followup_effect:item-1",
        value: "Most days",
      }),
    ).toMatch(/option/);
  });
  it("takes later, skip and done", () => {
    expect(checkPost({ later: true, offsetMin: 120 })).toBeNull();
    expect(checkPost({ skip: true })).toBeNull();
    expect(checkPost({ done: true })).toBeNull();
  });
});

describe("sinceOf", () => {
  it("says which answer moved a bar", () => {
    const out = sinceOf(
      { a: 0.43 },
      [{ id: "a", p: 0.61 }],
      [{ key: "sym_energy", kind: "fact", pool: 1, why: "", ids: ["a"] }],
      new Map([["a", "Iron deficiency"]]),
      new Map([["sym_energy", "your tiredness answer"]]),
    );
    expect(out[0]).toEqual({
      id: "a",
      name: "Iron deficiency",
      from: 43,
      to: 61,
      by: "your tiredness answer",
    });
  });
  it("leaves out a bar that moved under 2 points", () => {
    expect(
      sinceOf(
        { a: 0.43 },
        [{ id: "a", p: 0.44 }],
        [],
        new Map([["a", "A"]]),
        new Map(),
      ),
    ).toEqual([]);
  });
});

/* ── round input from engine output (synthetic) ───────────────────────── */

type Row = Pick<HypothesisResult, "id" | "name" | "score" | "for" | "against"> &
  Partial<Pick<HypothesisResult, "missing">>;
/** A scorer row with only the fields the check-in reads. */
const row = (r: Row): HypothesisResult =>
  ({ missing: [], ...r }) as unknown as HypothesisResult;

const fact = (key: string, weight?: number) => ({
  rule: `r_${key}`,
  input: key,
  value: "No",
  lr: 0.5,
  grade: "B" as const,
  ...(weight != null ? { faded: { key, days: 200, weight } } : {}),
});

const lead = (conditionId: string, weight: number): HunchExplanation => ({
  id: `e_${conditionId}`,
  text: "",
  grade: "C",
  basis: "science",
  source: null,
  conditionId,
  weight,
  predicts: null,
  check: null,
});

function mv(featureId: string, kind: Move["kind"] = "question"): Move {
  return {
    kind,
    featureId,
    label: featureId,
    cost: 0,
    outcomes: [],
    entropyBefore: 0,
    entropyAfter: 0,
    gain: 0,
    ratio: 0,
    shift: 0,
    moves: [],
  };
}

const rows = [
  // on the picture: its old "No" on sym_cold has faded below half
  row({
    id: "hypothyroidism",
    name: "Hypothyroidism",
    score: 0.4,
    for: [],
    against: [fact("sym_cold", 0.3), fact("sym_hair_skin", 0.7)],
    missing: [
      { rule: "r1", input: "sym_energy" },
      { rule: "r2", input: "tsh" },
    ],
  }),
  // off the picture, but an open hunch leads with it
  row({
    id: "coeliac",
    name: "Coeliac disease",
    score: 0.1,
    for: [fact("sym_bloating", 0.2)],
    against: [],
  }),
  // off the picture and no hunch: its faded key is not watched
  row({
    id: "gout",
    name: "Gout",
    score: 0.05,
    for: [],
    against: [fact("sym_joint", 0.1)],
  }),
];

const hunches = [
  {
    id: "h1",
    state: "open",
    explanations: [lead("gout", 0.2), lead("coeliac", 0.6)],
  },
  { id: "h2", state: "closed", explanations: [lead("gout", 0.9)] },
];

describe("watchOf", () => {
  it("watches shown beliefs and open hunch leads, and keeps faded under half", () => {
    const w = watchOf(rows, hunches);
    expect([...w.watched].sort()).toEqual(["coeliac", "hypothyroidism"]);
    expect(w.leads).toEqual([
      { hunchId: "h1", conditionId: "coeliac", p: 0.1 },
    ]);
    expect([...w.faded.keys()].sort()).toEqual(["sym_bloating", "sym_cold"]);
  });
});

describe("probeOf", () => {
  it("drops the faded keys so the engine simulates a fresh answer", () => {
    const input = {
      today: "2026-10-15",
      profile: { sym_cold: "No", sym_bloating: "Yes", sex: "female" },
      profileAt: { sym_cold: "2026-01-01", sex: "2020-01-01" },
    } as unknown as ModelInput;
    const probe = probeOf(input, ["sym_cold", "sym_bloating"]);
    expect(probe.profile).toEqual({ sex: "female" });
    expect(probe.profileAt).toEqual({ sex: "2020-01-01" });
    expect(input.profile.sym_cold).toBe("No");
  });
});

describe("roundInputOf", () => {
  const catalog = [
    {
      id: "hypothyroidism",
      name: "Hypothyroidism",
      evidence: [
        { input: { fact: "sym_cold" } },
        { input: { fact: "sym_hair_skin" } },
      ],
    },
    {
      id: "coeliac",
      name: "Coeliac disease",
      evidence: [
        { input: { fact: "sym_bloating" } },
        { input: { metric: "ttg" } },
      ],
    },
  ] as unknown as Catalog;

  const r = roundInputOf({
    rows,
    hunches,
    moves: [
      mv("fact:sym_cold"),
      mv("fact:sym_bloating"),
      mv("fact:waist_cm"), // a number, no tap options
      mv("tsh", "test"),
    ],
    followups: [],
    recentKeys: new Set(["sym_hair_skin"]),
    lastRounds: [["sym_cold"]],
    catalog,
    profile: { sym_cold: "no", sym_bloating: "Yes" },
    nowIso: "2026-10-15T10:00:00Z",
  });

  it("watches open hunch leads next to the picture", () => {
    expect(r.watched.has("coeliac")).toBe(true);
    expect(r.hunches).toEqual([
      { hunchId: "h1", conditionId: "coeliac", p: 0.1 },
    ]);
  });
  it("keeps only faded keys under half on watched rows", () => {
    expect([...r.faded.entries()].sort()).toEqual([
      ["sym_bloating", 0.2],
      ["sym_cold", 0.3],
    ]);
    expect(r.ages.get("sym_cold")).toBe(200);
  });
  it("keeps missing question keys, not markers", () => {
    expect([...r.missing]).toEqual(["sym_energy"]);
  });
  it("keeps only questions with tap options", () => {
    expect(r.moves.map((m) => m.featureId)).toEqual([
      "fact:sym_cold",
      "fact:sym_bloating",
    ]);
  });
  it("shows a stored answer as its option and maps siblings", () => {
    expect(r.values.get("sym_cold")).toBe("No");
    expect([...(r.siblings.get("sym_hair_skin") ?? [])]).toEqual([
      "hypothyroidism",
    ]);
    expect(r.names.get("coeliac")).toBe("Coeliac disease");
  });
});

/* ── fix round 1 ──────────────────────────────────────────────────────── */

describe("since credit", () => {
  it("credits the answer expected to move the bar most", () => {
    const item = (key: string, swing: number): RoundItem => ({
      key,
      kind: "fact",
      pool: 1,
      why: "",
      ids: ["thy"],
      swings: { thy: swing },
    });
    const out = sinceOf(
      { thy: 0.47 },
      [{ id: "thy", p: 0.39 }],
      [item("sym_cycle", 0.03), item("sym_cold", 0.12)],
      new Map([["thy", "Thyroid"]]),
      new Map([
        ["sym_cycle", "your cycle answer"],
        ["sym_cold", "your cold answer"],
      ]),
    );
    expect(out[0]?.by).toBe("your cold answer");
  });
  it("leaves out a condition with no start value", () => {
    expect(
      sinceOf({}, [{ id: "new", p: 0.4 }], [], new Map(), new Map()),
    ).toEqual([]);
  });
});

const fu = (kind: "adherence" | "effect", itemId: string, text?: string) =>
  ({
    key: `followup_${kind}:${itemId}`,
    kind,
    itemId,
    pool: 1,
    why: "",
    ids: [],
    text,
    target: kind === "effect" ? "Ferritin" : undefined,
  }) as RoundItem;

describe("follow-up copy", () => {
  it("names the item in both questions", () => {
    expect(
      followupQuestion(fu("adherence", "p1", "Iron with orange juice")),
    ).toBe("Iron with orange juice: how often in the last week?");
    expect(followupQuestion(fu("effect", "p1", "Iron with orange juice"))).toBe(
      "Ferritin since you started Iron with orange juice",
    );
  });
  it("falls back to the fixed copy with no name", () => {
    expect(followupQuestion(fu("adherence", "p1"))).toBe(
      "How often did you do it this week?",
    );
  });
});

describe("treatment follow-ups", () => {
  it("slugs the name", () => {
    expect(slugOf("Vitamin D3 (2000 IU)")).toBe("vitamin-d3-2000-iu");
  });
  it("keeps current treatments started a week or more ago", () => {
    const out = treatmentFollowups(
      [
        { what: "Levothyroxine", route: "oral", started: "2026-08" },
        {
          what: "Iron infusion",
          route: "iv",
          started: "2026-06",
          stopped: "2026-07",
        },
        { what: "New pill", route: "oral", started: "2026-10" },
      ],
      "2026-10-05",
    );
    expect(out).toEqual([
      {
        itemId: "t:levothyroxine",
        text: "Levothyroxine",
        target: "How you feel",
        startedAt: "2026-08-01T00:00:00Z",
      },
    ]);
  });
});

/* ── state transitions ────────────────────────────────────────────────── */

const NOW = "2026-10-15T10:00:00.000Z";
const q = (key: string): RoundItem => ({
  key,
  kind: "fact",
  pool: 1,
  why: "",
  ids: [],
});
const started = (queue: RoundItem[], over: Partial<CheckinState> = {}) =>
  ({
    ...firstState(null, "2026-10-01"),
    round: 1,
    started: "2026-10-15T09:00:00.000Z",
    queue,
    startBeliefs: {},
    ...over,
  }) as CheckinState;

describe("transition", () => {
  it("later sets snoozedUntil", () => {
    const t = transition(
      started([q("a")]),
      { later: true, offsetMin: 0 },
      NOW,
      true,
    );
    expect(t?.next.snoozedUntil).toBe("2026-10-15T13:00:00.000Z");
    expect(t?.next.started).not.toBeNull();
  });
  it("skip closes the round and sets nextDue", () => {
    const t = transition(started([q("a"), q("b")]), { skip: true }, NOW, false);
    expect(t?.next).toMatchObject({
      started: null,
      queue: [],
      lastDone: NOW,
      nextDue: "2026-10-29T10:00:00.000Z",
      recent: [["a", "b"]],
    });
  });
  it("done closes the round after the last answer, not before", () => {
    const s = started([q("a")]);
    expect(transition(s, { done: true }, NOW, true)).toBeNull();
    const after = transition(
      s,
      { screen: "question", key: "a", value: "No" },
      NOW,
      true,
    )!;
    expect(after.save).toEqual({ fact: "a", value: "No" });
    const t = transition(after.next, { done: true }, NOW, true);
    expect(t?.next.started).toBeNull();
    expect(t?.next.nextDue).toBe("2026-10-22T10:00:00.000Z");
  });
  it("a stale done or skip with no round is a no-op", () => {
    const idle = firstState(null, "2026-10-01");
    expect(transition(idle, { done: true }, NOW, true)).toBeNull();
    expect(transition(idle, { skip: true }, NOW, true)).toBeNull();
  });
  it("an answer for a key that is not the current one is a no-op", () => {
    const s = started([q("a"), q("b")], { asked: ["a"] });
    expect(
      transition(s, { screen: "question", key: "a", value: "No" }, NOW, true),
    ).toBeNull();
  });
  it("chooses habit_logs only for a plan item done every day", () => {
    const every = { value: "Every day" };
    const post = (item: RoundItem, value: string) =>
      transition(
        started([item]),
        { screen: "question", key: item.key, value },
        NOW,
        true,
      )?.save;
    expect(post(fu("adherence", "uuid-1"), every.value)).toEqual({
      habit: "uuid-1",
    });
    expect(post(fu("adherence", "uuid-1"), "Most days")).toEqual({
      fact: "followup_adherence:uuid-1",
      value: "Most days",
    });
    expect(post(fu("adherence", "t:levothyroxine"), every.value)).toEqual({
      fact: "followup_adherence:t:levothyroxine",
      value: "Every day",
    });
  });
});

describe("repeat rules across rounds", () => {
  it("a skipped key stays out for 30 days, not one round", () => {
    const s = started([q("a"), q("b")]);
    const skipped = transition(
      s,
      { screen: "question", key: "a", skip: true },
      NOW,
      true,
    )!;
    const closed = transition(skipped.next, { skip: true }, NOW, true)!.next;
    // two rounds later (14 days) it is still out
    expect(recentSkips(closed, "2026-10-29T10:00:00.000Z")).toEqual(["a"]);
    expect(recentSkips(closed, "2026-11-15T10:00:00.000Z")).toEqual([]);
  });
  it("a follow-up waits 14 days after it was answered or its round skipped", () => {
    const c = [
      {
        itemId: "uuid-1",
        text: "Walk",
        target: "How you feel",
        startedAt: "2026-09-01T00:00:00Z",
      },
    ];
    const s = started([fu("adherence", "uuid-1"), fu("effect", "uuid-1")]);
    const everyDay = transition(
      s,
      {
        screen: "question",
        key: "followup_adherence:uuid-1",
        value: "Every day",
      },
      NOW,
      true,
    )!.next;
    const closed = transition(everyDay, { skip: true }, NOW, true)!.next;
    expect(followupsDue(c, closed, "2026-10-22T10:00:00.000Z")).toEqual([]);
    expect(followupsDue(c, closed, "2026-10-30T10:00:00.000Z")).toEqual(c);
    const skippedRound = transition(s, { skip: true }, NOW, true)!.next;
    expect(followupsDue(c, skippedRound, "2026-10-22T10:00:00.000Z")).toEqual(
      [],
    );
  });
});
