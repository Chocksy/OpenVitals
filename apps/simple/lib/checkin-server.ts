/**
 * Phase 44B: `/api/checkin` as functions. `lib/checkin.ts` decides when a
 * round is due and which questions it holds; this reads the person, runs the
 * engine for the candidates and the picture, and writes every answer through
 * `saveFact` (or `habit_logs` for "Every day"). Web and iOS draw the same
 * JSON. Spec: docs/plans/2026-09-30-phase44-checkin-spec.md, part B.
 */
import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import {
  getDb,
  goals,
  habitLogs,
  metrics,
  profileFactHistory,
  protocolItems,
  type HunchExplanation,
} from "@/db";
import { users } from "@/db/auth-schema";
import {
  checkinDue,
  firstState,
  laterOf,
  nextDueOf,
  pickRound,
  REPEAT_DAYS,
  type CheckinState,
  type FollowupCandidate,
  type HunchLead,
  type RoundInput,
  type RoundItem,
} from "./checkin";
import { buildModelInput, saveFact, type ModelInput } from "./coverage";
import { lastDays, localDay, shiftDay } from "./daily";
import { factAt } from "./facts";
import { catalogFor } from "./hkb";
import { hunchRows, refreshHunches } from "./hunches";
import {
  scoreHypotheses,
  type Catalog,
  type Faded,
  type HypothesisResult,
} from "./hypotheses";
import {
  beliefsOf,
  nextMoves,
  QUIET_BELIEF,
  type Belief,
  type Move,
} from "./infogain";
import { recordBeliefs } from "./ledger";
import {
  optionsOf,
  pictureOf,
  setupDue,
  treatmentsNow,
  type PictureRow,
  type QuestionOption,
  type Treatment,
} from "./setup-server";
import type { SetupState } from "./setup";
import { symptomByKey } from "./symptoms";
import { PROFILE_QUESTIONS } from "./vectors";

export type CheckinScreen =
  | {
      kind: "question";
      key: string;
      question: string;
      why: string;
      options: QuestionOption[];
    }
  | {
      kind: "since";
      moved: {
        id: string;
        name: string;
        from: number;
        to: number;
        by: string | null;
      }[];
      hunches: { id: string; title: string; from: number; to: number }[];
      test: { label: string; price: string | null } | null;
    };

export interface CheckinBody {
  due: boolean;
  /** ISO: `snoozedUntil` if later, else `nextDue` */
  dueAt: string;
  /** null when not due */
  screen: CheckinScreen | null;
  progress: { at: number; of: number };
  picture: PictureRow[];
}

export type CheckinPost =
  | { screen: "question"; key: string; value?: string; skip?: true }
  | { later: true; offsetMin: number }
  | { skip: true }
  | { done: true };

// ponytail: the ship day is a constant; the real deploy day moves it by a few
// days at most, and only for accounts that never ran setup.
const SHIP_DAY = "2026-10-01";

export const ADHERENCE = ["Every day", "Most days", "Some days", "Not at all"];
export const EFFECT = ["Better", "Same", "Worse"];
const ADHERENCE_Q = "How often did you do it this week?";
const FOLLOWUP_DAYS = 14;

/* ── pure helpers ─────────────────────────────────────────────────────── */

const pct = (p: number) => Math.round(p * 100);
const DAY_MS = 86_400_000;

/** The fixed answers a key takes: follow-ups have their own, facts their options. */
function optionsFor(key: string): string[] | null {
  if (key.startsWith("followup_adherence:")) return ADHERENCE;
  if (key.startsWith("followup_effect:")) return EFFECT;
  return PROFILE_QUESTIONS[key]?.options ?? null;
}

/**
 * A POST checked before anything is written. Null means all good. The key
 * matching the round's current question is checked against the stored state
 * in `checkinPost`, not here.
 */
export function checkPost(body: CheckinPost): string | null {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object") return "no body";
  if (b.later === true) {
    const off = b.offsetMin;
    return typeof off === "number" &&
      Number.isFinite(off) &&
      Math.abs(off) <= 840
      ? null
      : "later needs offsetMin, minutes east of UTC";
  }
  if (b.screen === "question") {
    if (typeof b.key !== "string") return "unknown question";
    const options = optionsFor(b.key);
    if (!options?.length) return "unknown question";
    if (b.skip === true) return null;
    return typeof b.value === "string" && options.includes(b.value)
      ? null
      : "not one of the options";
  }
  if (b.skip === true || b.done === true) return null;
  return "unknown post";
}

/**
 * The bars that moved since the round started, with the answer that moved
 * each. `asked` is the round's answered items; a bar none of them names moved
 * for another reason (a hunch refresh, a new reading) and says so with null.
 * A condition with no start value (woken during the round) is left out: its
 * "from" would be a 0 the engine never printed.
 */
export function sinceOf(
  startBeliefs: Record<string, number>,
  after: Belief[],
  asked: RoundItem[],
  names: Map<string, string>,
  labels: Map<string, string>,
): Extract<CheckinScreen, { kind: "since" }>["moved"] {
  return after
    .filter((b) => startBeliefs[b.id] != null)
    .map((b) => ({
      id: b.id,
      from: pct(startBeliefs[b.id]!),
      to: pct(b.p),
    }))
    .filter(
      (x) =>
        Math.abs(x.to - x.from) >= 2 &&
        Math.max(x.from, x.to) >= pct(QUIET_BELIEF),
    )
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .map((x) => {
      // The answer that was expected to move this bar most gets the credit.
      const item = asked
        .filter((i) => i.ids.includes(x.id))
        .sort((a, b) => (b.swings?.[x.id] ?? 0) - (a.swings?.[x.id] ?? 0))[0];
      return {
        id: x.id,
        name: names.get(x.id) ?? x.id,
        from: x.from,
        to: x.to,
        by: item ? (labels.get(item.key) ?? null) : null,
      };
    });
}

/** "your cold intolerance answer": what the `since` screen credits a move to. */
export function labelOf(key: string): string {
  const s = symptomByKey(key);
  const what = s
    ? s.name.toLowerCase()
    : key.replace(/^sym_/, "").replace(/_/g, " ");
  return `your ${what} answer`;
}

/**
 * A follow-up screen's question names what it is about: the plan item or the
 * treatment. Without a name it falls back to the spec's fixed copy.
 */
export function followupQuestion(item: RoundItem): string {
  if (item.kind === "adherence")
    return item.text
      ? `${item.text}: how often in the last week?`
      : ADHERENCE_Q;
  const target = item.target ?? "How you feel";
  return item.text
    ? `${target} since you started ${item.text}`
    : `${target} since you started`;
}

/**
 * "Vitamin D3 (2000 IU)" -> "vitamin-d3-2000-iu": a treatment's follow-up id.
 * A name with no Latin letters or digits ("Левотироксин") would slug to
 * nothing, so it takes a short stable hash of the lowercased name instead.
 */
export function slugOf(what: string): string {
  const lower = what.trim().toLowerCase();
  const slug = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (
    slug || `h${createHash("sha1").update(lower).digest("hex").slice(0, 8)}`
  );
}

/**
 * Phase 44B (spec B2.3): each current treatment started 7 or more days ago
 * and not stopped. `started` is a month, read as its first day. The id is
 * `t:<slug>`, so its keys never collide with a plan item's uuid.
 */
export function treatmentFollowups(
  treatments: Treatment[],
  today: string,
): FollowupCandidate[] {
  const weekAgo = shiftDay(today, -7);
  return treatments
    .filter((t) => !t.stopped && `${t.started}-01` <= weekAgo)
    .map((t) => ({
      itemId: `t:${slugOf(t.what)}`,
      text: t.what,
      target: "How you feel",
      startedAt: `${t.started}-01T00:00:00Z`,
    }));
}

const within = (iso: string, now: string, days: number) =>
  Date.parse(now) - Date.parse(iso) < days * DAY_MS;

/**
 * Follow-ups not answered, skipped or skipped-with-their-round in the last
 * 14 days (`followupAt`, which every follow-up post stamps).
 */
export function followupsDue(
  candidates: FollowupCandidate[],
  s: CheckinState,
  now: string,
): FollowupCandidate[] {
  const at = s.followupAt ?? {};
  return candidates.filter(
    (c) => !at[c.itemId] || !within(at[c.itemId]!, now, FOLLOWUP_DAYS),
  );
}

/** Keys skipped in the last REPEAT_DAYS: the repeat rule keeps them out. */
export function recentSkips(s: CheckinState, now: string): string[] {
  return Object.entries(s.skippedAt ?? {})
    .filter(([, iso]) => within(iso, now, REPEAT_DAYS))
    .map(([k]) => k);
}

/** The first item this round has neither answered nor skipped. */
export const headOf = (s: CheckinState): RoundItem | null =>
  s.queue.find((i) => !s.asked.includes(i.key) && !s.skipped.includes(i.key)) ??
  null;

/** What an answer writes: a fact, or `habit_logs` for a plan item done every day. */
export type CheckinSave =
  | { fact: string; value: string }
  | { habit: string } // protocol_items.id
  | null;

const prune = (m: Record<string, string> | undefined, now: string) =>
  Object.fromEntries(
    Object.entries(m ?? {}).filter(([, iso]) => within(iso, now, REPEAT_DAYS)),
  );

/**
 * One POST applied to the state, pure. Null means nothing changes: an answer
 * for a key that is not the current question (a double tap or a stale
 * screen), a round skip with no round, or `done` before the last answer.
 * `trying` sets the next due date when the round closes.
 */
export function transition(
  s: CheckinState,
  body: CheckinPost,
  now: string,
  trying: boolean,
): { next: CheckinState; save: CheckinSave } | null {
  const b = body as Partial<Record<string, unknown>>;
  const stamp = (
    m: Record<string, string> | undefined,
    items: RoundItem[],
  ) => ({
    ...prune(m, now),
    ...Object.fromEntries(
      items.filter((i) => i.itemId).map((i) => [i.itemId!, now]),
    ),
  });

  if (b.later === true)
    return {
      next: {
        ...s,
        snoozedUntil: laterOf(now, (body as { offsetMin: number }).offsetMin),
      },
      save: null,
    };

  if (b.screen === "question") {
    const q = body as Extract<CheckinPost, { screen: "question" }>;
    const head = headOf(s);
    if (!s.started || !head || head.key !== q.key) return null;
    if (q.skip === true)
      return {
        next: {
          ...s,
          skipped: [...s.skipped, head.key],
          skippedAt: { ...prune(s.skippedAt, now), [head.key]: now },
          followupAt: head.itemId ? stamp(s.followupAt, [head]) : s.followupAt,
        },
        save: null,
      };
    const value = q.value!;
    // A treatment (`t:` id) has no habit row, so its "Every day" is a fact.
    const habit =
      head.kind === "adherence" &&
      value === "Every day" &&
      head.itemId &&
      !head.itemId.startsWith("t:");
    return {
      next: {
        ...s,
        asked: [...s.asked, head.key],
        followupAt: head.itemId ? stamp(s.followupAt, [head]) : s.followupAt,
      },
      save: habit ? { habit: head.itemId! } : { fact: head.key, value },
    };
  }

  const skip = b.skip === true;
  const done = b.done === true;
  if (!s.started) return null;
  if (done && headOf(s)) return null;
  if (!skip && !done) return null;
  return {
    next: {
      ...s,
      started: null,
      queue: [],
      asked: [],
      skipped: [],
      skippedAt: prune(s.skippedAt, now),
      // A skipped round counts as its follow-ups' check: they wait 14 days.
      followupAt: stamp(
        s.followupAt,
        s.queue.filter((i) => i.itemId),
      ),
      snoozedUntil: null,
      lastDone: now,
      nextDue: nextDueOf(now, trying),
      startBeliefs: null,
      recent: [s.queue.map((i) => i.key), ...s.recent].slice(0, 2),
    },
    save: null,
  };
}

/** The hunch fields the check-in reads. */
export interface HunchLike {
  id: string;
  state: string;
  explanations: HunchExplanation[] | null;
  /** a hunch's own title, when the row has one; else the lead's name shows */
  title?: string | null;
}

/**
 * What a round watches: the beliefs on the picture, plus each open hunch's
 * lead condition (its heaviest explanation that names one); and the answers
 * on those rows that now count for less than half.
 */
export function watchOf(
  rows: HypothesisResult[],
  hunches: HunchLike[],
): { watched: Set<string>; leads: HunchLead[]; faded: Map<string, Faded> } {
  const p = new Map(rows.map((r) => [r.id, r.score]));
  const leads: HunchLead[] = [];
  for (const h of hunches) {
    if (h.state === "closed") continue;
    const top = (h.explanations ?? [])
      .filter((e) => e.conditionId)
      .sort((a, b) => b.weight - a.weight)[0];
    if (top?.conditionId)
      leads.push({
        hunchId: h.id,
        conditionId: top.conditionId,
        p: p.get(top.conditionId) ?? 0,
      });
  }
  const watched = new Set([
    ...rows.filter((r) => r.score >= QUIET_BELIEF).map((r) => r.id),
    ...leads.map((l) => l.conditionId),
  ]);
  const faded = new Map<string, Faded>();
  for (const r of rows) {
    if (!watched.has(r.id)) continue;
    for (const e of [...r.for, ...r.against]) {
      const f = e.faded;
      if (!f || f.weight >= 0.5) continue;
      const was = faded.get(f.key);
      if (!was || f.weight < was.weight) faded.set(f.key, f);
    }
  }
  return { watched, leads, faded };
}

/**
 * The input with `keys` unanswered, so `nextMoves` simulates a fresh answer
 * to a faded question instead of skipping it as already known.
 */
export function probeOf(input: ModelInput, keys: Iterable<string>): ModelInput {
  const drop = new Set(keys);
  const keep = <T>(o: Record<string, T>) =>
    Object.fromEntries(Object.entries(o).filter(([k]) => !drop.has(k)));
  return {
    ...input,
    profile: keep(input.profile),
    ...(input.profileAt ? { profileAt: keep(input.profileAt) } : {}),
  };
}

/** A stored answer as the option the question offers ("no" → "No"). */
function shown(key: string, v: unknown): string | null {
  if (v == null) return null;
  const s = Array.isArray(v) ? v.join(", ") : String(v);
  if (!s.trim()) return null;
  return (
    PROFILE_QUESTIONS[key]?.options?.find(
      (o) => o.toLowerCase() === s.toLowerCase(),
    ) ?? s
  );
}

/**
 * Everything `pickRound` reads, from engine output and a few lists the
 * caller loaded. Pure, so the eval (Task 8) builds rounds the way the server
 * does. `moves` is `nextMoves` on `probeOf(input, watchOf(...).faded.keys())`.
 */
export function roundInputOf(a: {
  rows: HypothesisResult[];
  hunches: HunchLike[];
  moves: Move[];
  followups: FollowupCandidate[];
  recentKeys: Set<string>;
  lastRounds: string[][];
  catalog: Catalog;
  profile: Record<string, unknown>;
  nowIso: string;
}): RoundInput {
  const { watched, leads, faded } = watchOf(a.rows, a.hunches);
  const missing = new Set(
    a.rows
      .filter((r) => watched.has(r.id))
      .flatMap((r) => r.missing.map((m) => m.input))
      .filter((k) => PROFILE_QUESTIONS[k]),
  );
  // Only a question with tap options can be a check-in screen.
  const moves = a.moves.filter(
    (m) =>
      m.kind === "question" &&
      m.featureId.startsWith("fact:") &&
      (PROFILE_QUESTIONS[m.featureId.slice(5)]?.options?.length ?? 0) > 0,
  );
  const siblings = new Map<string, Set<string>>();
  for (const h of a.catalog)
    for (const e of h.evidence) {
      const k = e.input.fact;
      if (!k) continue;
      if (!siblings.has(k)) siblings.set(k, new Set());
      siblings.get(k)!.add(h.id);
    }
  const values = new Map<string, string>();
  for (const k of faded.keys()) {
    const v = shown(k, a.profile[k]);
    if (v) values.set(k, v);
  }
  return {
    moves,
    watched,
    faded: new Map([...faded].map(([k, f]) => [k, f.weight])),
    missing,
    followups: a.followups,
    hunches: leads,
    recentKeys: a.recentKeys,
    lastRounds: a.lastRounds,
    siblings,
    names: new Map([
      ...a.catalog.map((h) => [h.id, h.name] as const),
      ...a.rows.map((r) => [r.id, r.name] as const),
    ]),
    ages: new Map([...faded].map(([k, f]) => [k, f.days])),
    values,
    nowIso: a.nowIso,
  };
}

/**
 * A started round stays due until it is finished, skipped or snoozed, even
 * when setup is open again: it was either due when it started or forced by
 * `/checkin?now=1`. Between rounds the calendar and setup decide.
 */
async function dueNow(
  userId: string,
  s: CheckinState,
  setupDone: string | null,
  now: string,
): Promise<boolean> {
  if (s.started)
    return !(s.snoozedUntil && Date.parse(now) < Date.parse(s.snoozedUntil));
  return checkinDue(s, await setupDue(userId), setupDone, now);
}

const dueAtOf = (s: CheckinState) =>
  s.snoozedUntil && Date.parse(s.snoozedUntil) > Date.parse(s.nextDue)
    ? s.snoozedUntil
    : s.nextDue;

/* ── the database side ────────────────────────────────────────────────── */

async function stored(userId: string) {
  const [row] = await getDb()
    .select({ checkin: users.checkin, setup: users.setup })
    .from(users)
    .where(eq(users.id, userId));
  return {
    checkin: (row?.checkin ?? null) as CheckinState | null,
    setup: (row?.setup ?? null) as SetupState | null,
  };
}

async function save(userId: string, s: CheckinState) {
  await getDb().update(users).set({ checkin: s }).where(eq(users.id, userId));
}

/** The stored state, or the first one, written on first read. */
async function stateOf(userId: string) {
  const { checkin, setup } = await stored(userId);
  const setupDone = setup?.done ?? null;
  if (checkin) return { state: checkin, setupDone };
  const state = firstState(setupDone, SHIP_DAY);
  await save(userId, state);
  return { state, setupDone };
}

/**
 * Something is being tried, so the next round comes in a week: a plan item
 * started in the last 60 days, an open hunch, or a goal not yet reached.
 */
async function tryingNow(userId: string): Promise<boolean> {
  const db = getDb();
  const since = shiftDay(localDay(), -60);
  const [items, open, goal] = await Promise.all([
    db
      .select({ id: protocolItems.id })
      .from(protocolItems)
      .where(
        and(
          eq(protocolItems.userId, userId),
          eq(protocolItems.active, true),
          gte(protocolItems.startedAt, since),
        ),
      )
      .limit(1),
    hunchRows(userId),
    db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.userId, userId), isNull(goals.achievedAt)))
      .limit(1),
  ]);
  return (
    items.length > 0 ||
    open.some((h) => h.state !== "closed") ||
    goal.length > 0
  );
}

/**
 * Plan items and treatments started a week or more ago whose follow-up was
 * not asked in the last 14 days. A plan item's `target` is the first marker
 * it names, else "How you feel".
 */
async function followupsOf(
  userId: string,
  s: CheckinState,
  now: string,
): Promise<FollowupCandidate[]> {
  const db = getDb();
  const today = localDay();
  const weekAgo = shiftDay(today, -7);
  const [items, treatments] = await Promise.all([
    db
      .select()
      .from(protocolItems)
      .where(
        and(eq(protocolItems.userId, userId), eq(protocolItems.active, true)),
      ),
    factAt(userId, "treatments", today),
  ]);
  const due = items.filter((i) => i.startedAt && i.startedAt <= weekAgo);
  const codes = [
    ...new Set(due.map((i) => i.metricCodes?.[0]).filter(Boolean)),
  ] as string[];
  const named = codes.length
    ? await db
        .select({ code: metrics.code, name: metrics.name })
        .from(metrics)
        .where(inArray(metrics.code, codes))
    : [];
  const nameOf = new Map(named.map((m) => [m.code, m.name]));
  return followupsDue(
    [
      ...due.map((i) => ({
        itemId: i.id,
        text: i.text,
        target: nameOf.get(i.metricCodes?.[0] ?? "") ?? "How you feel",
        startedAt: `${i.startedAt}T00:00:00Z`,
      })),
      ...treatmentFollowups(treatmentsNow(treatments), today),
    ],
    s,
    now,
  );
}

/** Keys answered or confirmed in the last REPEAT_DAYS, plus the skips in it. */
async function recentKeysOf(userId: string, s: CheckinState, now: string) {
  const since = shiftDay(localDay(), -REPEAT_DAYS);
  const rows = await getDb()
    .select({
      key: profileFactHistory.key,
      validFrom: profileFactHistory.validFrom,
      confirmations: profileFactHistory.confirmations,
    })
    .from(profileFactHistory)
    .where(eq(profileFactHistory.userId, userId));
  const out = new Set(recentSkips(s, now));
  for (const r of rows)
    if (r.validFrom >= since || (r.confirmations ?? []).some((d) => d >= since))
      out.add(r.key);
  return out;
}

const idle = (s: CheckinState): CheckinBody => ({
  due: false,
  dueAt: dueAtOf(s),
  screen: null,
  progress: { at: 0, of: 0 },
  picture: [],
});

export async function checkinBody(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<CheckinBody> {
  const now = new Date().toISOString();
  const first = await stateOf(userId);
  let state = first.state;
  const { setupDone } = first;
  if (!opts.force && !(await dueNow(userId, state, setupDone, now)))
    return idle(state);

  const input = await buildModelInput(userId);
  let catalog = await catalogFor(userId);
  const rows = scoreHypotheses(input, { catalog });
  const before = beliefsOf(rows);

  if (state.started == null) {
    const hunches = await hunchRows(userId);
    const { faded } = watchOf(rows, hunches);
    const [followups, recentKeys, trying] = await Promise.all([
      followupsOf(userId, state, now),
      recentKeysOf(userId, state, now),
      tryingNow(userId),
    ]);
    const queue = pickRound(
      roundInputOf({
        rows,
        hunches,
        moves: nextMoves(probeOf(input, faded.keys()), catalog),
        followups,
        recentKeys,
        lastRounds: state.recent,
        catalog,
        profile: input.profile,
        nowIso: now,
      }),
    );
    // A round with nothing worth asking never shows; it only moves the date.
    if (!queue.length) {
      state = {
        ...state,
        lastDone: now,
        nextDue: nextDueOf(now, trying),
        snoozedUntil: null,
      };
      await save(userId, state);
      return idle(state);
    }
    state = {
      ...state,
      round: state.round + 1,
      started: now,
      queue,
      asked: [],
      skipped: [],
      snoozedUntil: null,
      startBeliefs: Object.fromEntries(before.map((b) => [b.id, b.p])),
    };
    await save(userId, state);
  }

  const names = new Map(catalog.map((h) => [h.id, h.name]));
  const progress = {
    at: state.asked.length + state.skipped.length,
    of: state.queue.length,
  };
  const head = headOf(state);

  if (head) {
    let screen: CheckinScreen;
    if (head.kind === "adherence" || head.kind === "effect")
      screen = {
        kind: "question",
        key: head.key,
        question: followupQuestion(head),
        why: head.why,
        options: (head.kind === "adherence" ? ADHERENCE : EFFECT).map(
          (label) => ({ label, moves: null }),
        ),
      };
    else {
      // The key is unanswered in the probe, so its simulation is a fresh
      // answer's, faded or not.
      const move = nextMoves(probeOf(input, [head.key]), catalog).find(
        (m) => m.featureId === `fact:${head.key}`,
      );
      screen = {
        kind: "question",
        key: head.key,
        question: PROFILE_QUESTIONS[head.key]?.question ?? head.key,
        why: head.why,
        options: move
          ? optionsOf(move, names, before)
          : (optionsFor(head.key) ?? []).map((label) => ({
              label,
              moves: null,
            })),
      };
    }
    return {
      due: true,
      dueAt: dueAtOf(state),
      screen,
      progress,
      picture: pictureOf(before, names),
    };
  }

  // Every item answered or skipped: what moved. The hunches and the ledger
  // are refreshed as a Home load would; a failed refresh (a model call inside
  // a wake) must not hide the screen, so the engine's own scores stand.
  try {
    await refreshHunches(userId);
    await recordBeliefs(userId);
  } catch (e) {
    console.error("checkin since refresh", e);
  }
  catalog = await catalogFor(userId);
  const allNames = new Map(catalog.map((h) => [h.id, h.name]));
  const afterRows = scoreHypotheses(input, { catalog });
  const after = beliefsOf(afterRows);
  const start = state.startBeliefs ?? {};
  const asked = state.queue.filter((i) => state.asked.includes(i.key));
  const moved = sinceOf(
    start,
    after,
    asked,
    allNames,
    new Map(asked.map((i) => [i.key, labelOf(i.key)])),
  );
  const afterP = new Map(after.map((b) => [b.id, b.p]));
  const hunchList: HunchLike[] = await hunchRows(userId);
  const titleOf = new Map(hunchList.map((h) => [h.id, h.title ?? null]));
  const hunchesMoved = watchOf(afterRows, hunchList)
    .leads.filter((l) => start[l.conditionId] != null)
    .map((l) => ({
      id: l.hunchId,
      title:
        titleOf.get(l.hunchId) ?? allNames.get(l.conditionId) ?? l.conditionId,
      from: pct(start[l.conditionId]!),
      to: pct(afterP.get(l.conditionId) ?? 0),
    }))
    .filter((h) => Math.abs(h.to - h.from) >= 2);
  const m = nextMoves(input, catalog).find(
    (x) => x.kind === "test" && x.priced,
  );
  return {
    due: true,
    dueAt: dueAtOf(state),
    screen: {
      kind: "since",
      moved,
      hunches: hunchesMoved,
      test: m ? { label: m.label, price: `€${Math.round(m.cost)}` } : null,
    },
    progress,
    picture: pictureOf(after, allNames),
  };
}

/**
 * One answer (or later, skip, done), written, then the next body. A bad POST
 * returns `{ error }` and writes nothing. A question POST for any key but the
 * current one (a double tap) changes nothing.
 */
export async function checkinPost(
  userId: string,
  body: CheckinPost,
): Promise<CheckinBody | { error: string }> {
  const error = checkPost(body);
  if (error) return { error };
  const now = new Date().toISOString();
  const b = body as Partial<Record<string, unknown>>;
  // Read before the lock: only a closing post needs it, and it takes three
  // connections the locked transaction should not wait on.
  const closing =
    b.screen !== "question" && (b.skip === true || b.done === true);
  const trying = closing ? await tryingNow(userId) : false;

  // Phase 44B: the head check, the write and the state update happen in one
  // transaction under a row lock, so a double tap's second request waits,
  // then finds the key already asked and writes nothing. Every write runs on
  // `tx`: a second pool connection inside the lock could starve the pool
  // (max 5) with the row held. The answer and the state commit or roll back
  // together, so a failed save can simply be sent again.
  await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select({ checkin: users.checkin, setup: users.setup })
      .from(users)
      .where(eq(users.id, userId))
      .for("no key update");
    const setup = (row?.setup ?? null) as SetupState | null;
    const state =
      (row?.checkin as CheckinState | null) ??
      firstState(setup?.done ?? null, SHIP_DAY);
    const t = transition(state, body, now, trying);
    if (!t) return;
    if (t.save && "habit" in t.save) {
      const itemId = t.save.habit;
      await tx
        .insert(habitLogs)
        .values(lastDays(7).map((day) => ({ userId, itemId, day, done: true })))
        .onConflictDoNothing();
    } else if (t.save)
      await saveFact(userId, t.save.fact, t.save.value, {}, tx);
    await tx.update(users).set({ checkin: t.next }).where(eq(users.id, userId));
  });
  return checkinBody(userId);
}

/** `/checkin?now=1`: due now, whatever the calendar says. */
export async function forceCheckin(userId: string): Promise<void> {
  const { state } = await stateOf(userId);
  await save(userId, {
    ...state,
    nextDue: new Date().toISOString(),
    snoozedUntil: null,
    started: null,
  });
}

/** Reads state only; never starts a round (Home and the iOS launch call it). */
export async function checkinDueFor(userId: string): Promise<boolean> {
  const { checkin, setup } = await stored(userId);
  const setupDone = setup?.done ?? null;
  const state = checkin ?? firstState(setupDone, SHIP_DAY);
  return dueNow(userId, state, setupDone, new Date().toISOString());
}
