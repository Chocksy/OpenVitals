/**
 * Phase 44B: the weekly check-in.
 *
 * Every week or two the app asks up to five questions it actually needs:
 * answers that have faded or were never given for a condition on the
 * picture, how a plan item is going, and one sharp question for a weak
 * hunch. This file is the pure half: when a round is due, when "ask later"
 * comes back, and which questions a round holds. The caller reads the
 * database and runs the engine; nothing here touches either, or the clock.
 */
import type { Move } from "./infogain";

export const ROUND_MAX = 5;
export const POOL1_MAX = 3;
export const POOL2_MAX = 2;
export const REPEAT_DAYS = 30;
export const FLOOR = 0.02; // 2 points

export type ItemKind = "fact" | "adherence" | "effect";

export interface RoundItem {
  key: string; // fact key, or followup_adherence:<itemId> / followup_effect:<itemId>
  kind: ItemKind;
  itemId?: string; // protocol_items.id for follow-ups
  pool: 1 | 2;
  why: string;
  /** condition ids this answer is expected to move, for the `since` screen */
  ids: string[];
}

export interface CheckinState {
  round: number;
  started: string | null; // ISO, round start; null between rounds
  queue: RoundItem[]; // picked once at round start
  asked: string[]; // keys answered this round
  skipped: string[]; // keys skipped this round
  snoozedUntil: string | null; // ISO
  lastDone: string | null; // ISO
  nextDue: string; // ISO
  startBeliefs: Record<string, number> | null; // p per condition at round start
  recent: string[][]; // keys of the last 2 finished rounds
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const plusDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * DAY_MS).toISOString();

/** A week while something is being tried, so its effect is asked in time; else two. */
export function nextDueOf(lastDone: string, trying: boolean): string {
  return plusDays(lastDone, trying ? 7 : 14);
}

/**
 * "Ask later": three hours on, unless that lands at or after 18:00 local (or
 * past midnight), then 09:00 local the next day. `offsetMin` is minutes east
 * of UTC.
 */
export function laterOf(nowIso: string, offsetMin: number): string {
  const now = Date.parse(nowIso);
  const off = offsetMin * 60_000;
  const local = new Date(now + off);
  const later = new Date(now + off + 3 * HOUR_MS);
  if (later.getUTCDate() === local.getUTCDate() && later.getUTCHours() < 18) {
    return new Date(now + 3 * HOUR_MS).toISOString();
  }
  const nextMorning = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1,
    9,
  );
  return new Date(nextMorning - off).toISOString();
}

/**
 * The state before any round: due a week after setup finished, or a week
 * after this phase shipped (`shipDay`, YYYY-MM-DD) for an account that never
 * ran setup.
 */
export function firstState(
  setupDone: string | null,
  shipDay: string,
): CheckinState {
  return {
    round: 0,
    started: null,
    queue: [],
    asked: [],
    skipped: [],
    snoozedUntil: null,
    lastDone: null,
    nextDue: plusDays(setupDone ?? `${shipDay}T00:00:00Z`, 7),
    startBeliefs: null,
    recent: [],
  };
}

/**
 * Setup comes first and gets a week to settle. A round already started stays
 * due until it is finished or skipped; a snooze holds either.
 */
export function checkinDue(
  s: CheckinState,
  setupDue: boolean,
  setupDone: string | null,
  nowIso: string,
): boolean {
  if (setupDue) return false;
  const now = Date.parse(nowIso);
  if (setupDone && now < Date.parse(setupDone) + 7 * DAY_MS) return false;
  if (s.snoozedUntil && now < Date.parse(s.snoozedUntil)) return false;
  if (s.started) return true;
  return now >= Date.parse(s.nextDue);
}

export interface Candidate {
  move: Move;
  key: string;
}

export interface FollowupCandidate {
  itemId: string;
  text: string;
  target: string;
  startedAt: string;
}

export interface HunchLead {
  hunchId: string;
  conditionId: string;
  p: number;
}

export interface RoundInput {
  moves: Move[]; // question moves only, from nextMoves on the probe input
  watched: Set<string>; // condition ids: shown beliefs (p >= QUIET_BELIEF) and open hunch leads
  faded: Map<string, number>; // key -> weight, weight < 0.5, read by a watched condition
  missing: Set<string>; // fact keys missing for a watched condition
  followups: FollowupCandidate[];
  hunches: HunchLead[];
  recentKeys: Set<string>; // answered or skipped in the last REPEAT_DAYS
  lastRounds: string[][];
  siblings: Map<string, Set<string>>; // key -> condition ids its rules feed
  names: Map<string, string>; // condition id -> name, for `why`
  ages: Map<string, number>; // key -> days since answered, for `why`
  values: Map<string, string>; // key -> the stored answer, for a faded key's `why`
  nowIso: string; // the caller's clock, for a follow-up's "weeks ago"
}

/** The biggest move this question makes on any of `ids`. */
function swing(m: Move, ids: Set<string>): number {
  let best = 0;
  for (const x of m.moves) {
    if (ids.has(x.id)) best = Math.max(best, Math.abs(x.to - x.from));
  }
  return best;
}

/** The conditions among `ids` this move shifts by at least the floor. */
const idsMoved = (m: Move, ids: Set<string>): string[] =>
  m.moves
    .filter((x) => ids.has(x.id) && Math.abs(x.to - x.from) >= FLOOR)
    .map((x) => x.id);

function candidates(moves: Move[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const move of moves) {
    if (move.kind !== "question" || !move.featureId.startsWith("fact:")) {
      continue;
    }
    const key = move.featureId.slice(5);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ move, key });
  }
  return out;
}

/**
 * "Other angle": a key from either of the last two rounds moves behind every
 * fresh key that feeds a condition it feeds, so the same condition is asked
 * about from a different side.
 */
function otherAngle(
  ranked: Candidate[],
  lastRounds: string[][],
  siblings: Map<string, Set<string>>,
): Candidate[] {
  const asked = new Set(lastRounds.flat());
  const shares = (a: string, b: string) => {
    const sa = siblings.get(a);
    const sb = siblings.get(b);
    if (!sa || !sb) return false;
    for (const id of sa) if (sb.has(id)) return true;
    return false;
  };
  const out = [...ranked];
  for (const c of ranked.filter((c) => asked.has(c.key))) {
    const from = out.indexOf(c);
    let to = -1;
    for (let i = from + 1; i < out.length; i++) {
      if (!asked.has(out[i].key) && shares(c.key, out[i].key)) to = i;
    }
    if (to < 0) continue;
    out.splice(from, 1);
    out.splice(to, 0, c);
  }
  return out;
}

/**
 * The questions for one round, pool 1 (updates) then pool 2 (hunches).
 *
 * Phase 44B: a follow-up item skips the floor, since the spec's ranking has
 * no swing for keys no rule reads. Its two screens take two places, so a
 * round never holds more than ROUND_MAX questions.
 */
export function pickRound(r: RoundInput): RoundItem[] {
  const all = candidates(r.moves);
  const nameOf = (id: string) => r.names.get(id) ?? id;

  // Pool 1: one follow-up (two screens, two places), then faded and missing
  // keys by how far they move a watched condition.
  const followup = [...r.followups].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  )[0];
  const pool1Facts = otherAngle(
    all
      .filter(
        (c) =>
          (r.faded.has(c.key) || r.missing.has(c.key)) &&
          !r.recentKeys.has(c.key) &&
          swing(c.move, r.watched) >= FLOOR,
      )
      .sort((a, b) => swing(b.move, r.watched) - swing(a.move, r.watched)),
    r.lastRounds,
    r.siblings,
  );

  const factWhy = (c: Candidate): string => {
    if (r.faded.has(c.key)) {
      const months = Math.max(1, Math.round((r.ages.get(c.key) ?? 0) / 30));
      const value = r.values.get(c.key);
      const span = `${months} month${months === 1 ? "" : "s"}`;
      return value
        ? `It's been ${span} since you said ${value}.`
        : `It's been ${span} since you answered this.`;
    }
    const top = [...c.move.moves]
      .filter((x) => r.watched.has(x.id))
      .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))[0];
    return `This answer moves ${nameOf(top.id)}.`;
  };

  // Pool 2: hunches between 5% and 40%, weakest first, each with the free
  // question that pulls its lead condition furthest apart.
  const taken = new Set(
    pool1Facts.slice(0, POOL1_MAX - (followup ? 2 : 0)).map((c) => c.key),
  );
  const pool2: RoundItem[] = [];
  for (const h of [...r.hunches]
    .filter((h) => h.p >= 0.05 && h.p <= 0.4)
    .sort((a, b) => a.p - b.p)) {
    if (pool2.length >= POOL2_MAX) break;
    const lead = new Set([h.conditionId]);
    const best = all
      .filter((c) => !taken.has(c.key) && !r.recentKeys.has(c.key))
      .map((c) => ({ c, s: swing(c.move, lead) }))
      .sort((a, b) => b.s - a.s)[0];
    if (!best || best.s < FLOOR) continue;
    taken.add(best.c.key);
    pool2.push({
      key: best.c.key,
      kind: "fact",
      pool: 2,
      why: `The app has a weak hunch about ${nameOf(h.conditionId)}. This answer tells it more.`,
      ids: idsMoved(best.c.move, new Set([...r.watched, h.conditionId])),
    });
  }

  // Fill: pool 1 up to 3 places, pool 2 up to 2, then pool 1 takes whatever
  // pool 2 left.
  // Pool 2 never tops up pool 1: the spec's "two hunches at most" is the more specific rule.
  const places1 = ROUND_MAX - pool2.length;
  const pool1: RoundItem[] = [];
  let used = 0;
  if (followup && used + 2 <= places1) {
    const weeks = Math.max(
      1,
      Math.round(
        (Date.parse(r.nowIso) - Date.parse(followup.startedAt)) / (7 * DAY_MS),
      ),
    );
    pool1.push(
      {
        key: `followup_adherence:${followup.itemId}`,
        kind: "adherence",
        itemId: followup.itemId,
        pool: 1,
        why: `You started this ${weeks} week${weeks === 1 ? "" : "s"} ago.`,
        ids: [],
      },
      {
        key: `followup_effect:${followup.itemId}`,
        kind: "effect",
        itemId: followup.itemId,
        pool: 1,
        why: "This tells the app if it helped.",
        ids: [],
      },
    );
    used += 2;
  }
  const inPool2 = new Set(pool2.map((i) => i.key));
  for (const c of pool1Facts) {
    if (used >= places1) break;
    if (inPool2.has(c.key)) continue;
    pool1.push({
      key: c.key,
      kind: "fact",
      pool: 1,
      why: factWhy(c),
      ids: idsMoved(c.move, r.watched),
    });
    used++;
  }
  return [...pool1, ...pool2];
}
