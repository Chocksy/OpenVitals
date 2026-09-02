/**
 * The ask-answer eval: which model should answer a question?
 *
 *   pnpm --filter simple eval:ask [caseId ...] [--models a,b] [--user email]
 *
 * Principle 6: model choice by score, not by vibes. Twelve questions a person
 * actually asked the app, of the six kinds `lib/ask-intent.ts` decides between,
 * run against this account's real data through the real `answerQuestion`, then
 * checked twice — in code for the things code can see (six sentences, no
 * filler, an action only when the question asked for one, no action the context
 * never offered, no paper the context never gave) and by a fixed independent
 * judge for the rest.
 *
 * The candidates are listed from the OpenRouter models endpoint at run time,
 * so the "strongest under about five dollars a million output tokens" is
 * whatever that is today rather than whatever it was when this was written.
 * Three models at most, twelve cases each: enough to separate them and cheap
 * enough to re-run.
 *
 * Results land in `evals/results/ask-<date>.json`. Exits non-zero when the
 * winner scores under the floor.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { getDb, pool } from "@/db";
import { users } from "@/db/auth-schema";
import { actionsFor } from "@/lib/actions";
import { ACTS_KINDS, questionKind, type QuestionKind } from "@/lib/ask-intent";
import { chatContext } from "@/lib/ai";
import { model } from "@/lib/extract";
import { answerQuestion } from "@/lib/brief";
import { type Acts } from "@/lib/lookup";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The account the questions are asked from. */
const DEFAULT_EMAIL = "test-newuser@example.com";

/** About five dollars per million output tokens, as the endpoint prices it. */
const OUTPUT_CAP = 5 / 1_000_000;

/** Prod's default before this phase; always a candidate, for comparison. */
const INCUMBENT = "x-ai/grok-4.20";

/** Six sentences at most: the prompt's own rule. */
const MAX_SENTENCES = 6;

/** What the answer may never say. The old prompt said all of it. */
const FILLER =
  /(healthcare provider|health care provider|consult (a|your)|speak (to|with) (a|your)|individuali[sz]ed plan|it (is|'s) (important|best) to|may help|might help)/i;

interface AskCase {
  id: string;
  q: string;
  about?: string;
  judge: string;
}

interface Scored {
  id: string;
  /** phase 28a: which shape the question asked for, decided in code */
  kind: QuestionKind;
  reply: string;
  sentences: number;
  /** every bracketed label the answer printed */
  labels: string[];
  /** phase 27: what the row under the answer would offer */
  acts?: { actions: string[]; tests: string[]; questions: string[] };
  /** ids the model returned that the engine never offered */
  dropped?: string[];
  /** phase 28a: the papers the answer cited, after the guard */
  sources?: string[];
  /** code checks that failed */
  failed: string[];
  judgeScore?: number;
  judgeNote?: string;
  latencyMs: number;
  error?: string;
}

interface ModelRun {
  modelId: string;
  /** dollars per million output tokens, from the models endpoint */
  outPerM: number | null;
  inPerM: number | null;
  cases: Scored[];
  score: number;
}

/* ── the candidates ───────────────────────────────────────────────────── */

interface ORModel {
  id: string;
  name: string;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { output_modalities?: string[] };
}

const price = (v: string | undefined): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The families a frontier answer could come from, strongest first.
 *
 * The models endpoint prices every model and rates none of them, so "the
 * strongest under about five dollars a million output tokens" cannot be read
 * off it. What can be read off it is which of these families are live and what
 * they cost today, which is the half that goes stale. The order is this
 * project's own judgement and is printed with the prices, so a reader can
 * disagree with it in one run.
 */
const STRONG_FIRST = [
  /claude-(opus|sonnet)/,
  /gpt-5(\.\d+)?(-sol|-pro)?$/,
  /gemini-[\d.]+-pro/,
  /grok-4/,
  /deepseek-v[45]-pro/,
  /qwen3[\d.]*-max/,
  /glm-[45]/,
  /claude-haiku/,
];

/** Aliases, batch endpoints and the picture models are not candidates. */
const CHAT_ONLY = /(:|^~|-image|-vision|-codex|-audio|-embed)/;

/**
 * The three models this run compares: the strongest live family under the
 * cap, the model the app runs today, and the one prod ran before this phase.
 */
async function candidates(): Promise<Map<string, ORModel | null>> {
  const current = process.env.AI_DEFAULT_MODEL ?? "google/gemini-3.7-flash";
  const picked = new Map<string, ORModel | null>();

  let live: ORModel[] = [];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    live = ((await res.json()) as { data: ORModel[] }).data ?? [];
  } catch (e) {
    console.error("[ask] could not list models:", e);
  }

  const byId = new Map(live.map((m) => [m.id, m]));
  const affordable = live
    .filter((m) => {
      const out = price(m.pricing?.completion);
      const modes = m.architecture?.output_modalities;
      return (
        out != null &&
        out <= OUTPUT_CAP &&
        !CHAT_ONLY.test(m.id) &&
        (!modes || modes.includes("text"))
      );
    })
    .sort(
      (a, b) =>
        (price(b.pricing?.completion) ?? 0) -
        (price(a.pricing?.completion) ?? 0),
    );

  for (const family of STRONG_FIRST) {
    const hit = affordable.find((m) => family.test(m.id));
    if (hit) {
      picked.set(hit.id, hit);
      break;
    }
  }
  picked.set(current, byId.get(current) ?? null);
  if (picked.size < 3) picked.set(INCUMBENT, byId.get(INCUMBENT) ?? null);

  return new Map([...picked].slice(0, 3));
}

/** The models a `--models` flag asked for, with their prices attached. */
async function named(ids: string[]): Promise<Map<string, ORModel | null>> {
  let live: ORModel[] = [];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    live = ((await res.json()) as { data: ORModel[] }).data ?? [];
  } catch {
    live = [];
  }
  const byId = new Map(live.map((m) => [m.id, m]));
  return new Map(ids.map((id) => [id, byId.get(id) ?? null]));
}

/* ── the checks ───────────────────────────────────────────────────────── */

const sentencesIn = (text: string): number =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1).length;

const labelsIn = (text: string): string[] => [
  ...new Set([...text.matchAll(/\[[^\]\n]{1,40}\]/g)].map((m) => m[0])),
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Every check code can make on its own, so a judge never has to be trusted
 * with an arithmetic question.
 */
function codeChecks(
  reply: string,
  allowed: { titles: string[]; labels: string[] },
  kind: QuestionKind,
): string[] {
  const failed: string[] = [];
  const count = sentencesIn(reply);
  if (count > MAX_SENTENCES) failed.push(`${count} sentences, wanted 6`);

  const filler = reply.match(FILLER);
  if (filler) failed.push(`filler: "${filler[0]}"`);

  /**
   * Phase 28a: only some kinds are allowed to tell anybody to do anything.
   * "What does the research say?" answered with a labelled action used to
   * pass this check and fail the question.
   */
  const acting = ACTS_KINDS.includes(kind);
  const labels = labelsIn(reply);
  if (acting && !labels.length && allowed.titles.length)
    failed.push("no labelled action");
  if (!acting && labels.length)
    failed.push(`a ${kind} answer named an action (${labels.join(", ")})`);
  for (const label of labels)
    if (!allowed.labels.includes(label))
      failed.push(`label ${label} is not one the context gave`);

  /**
   * The answer may only name actions the context offered. Checked by asking
   * whether any allowed title shares a word with the reply — a weak test on
   * its own, which is why the judge is also asked the same question.
   */
  if (acting && allowed.titles.length && labels.length) {
    const text = norm(reply);
    const named = allowed.titles.some((t) =>
      norm(t)
        .split(" ")
        .filter((w) => w.length > 3)
        .some((w) => text.includes(w)),
    );
    if (!named) failed.push("named no action from the context");
  }
  return failed;
}

/**
 * The first three words of an action's title that are worth matching on: a
 * dose is written "200 µg/day" by the plan and "200 mcg daily" by an answer,
 * and neither of those is the name of the thing.
 */
const keyWords = (title: string): string[] =>
  norm(title)
    .split(" ")
    .filter((w) => w.length > 3)
    .slice(0, 3);

/** Does the paragraph name this action at all? */
const names = (text: string, title: string): boolean => {
  const words = keyWords(title);
  return words.length
    ? words.every((w) => text.includes(w))
    : text.includes(norm(title));
};

/**
 * Phase 27: the buttons have to match the words.
 *
 * The answer now returns the ids it used and the engine renders one chip per
 * id, so two things can go wrong that never could before — the row can offer
 * something the paragraph never said, and the paragraph can name something the
 * row does not offer. Both are failures here, and so is any id the guard had
 * to throw away, because that is the model inventing a button.
 */
function actChecks(
  reply: string,
  acts: Acts | undefined,
  candidates: { id: string; title: string }[],
  kind: QuestionKind,
): string[] {
  if (!acts) return ["no acts came back"];
  const failed: string[] = [];
  // phase 28a: a status or research answer offers nothing; a prognosis
  // answer is allowed one action and no more.
  const room = ACTS_KINDS.includes(kind) ? (kind === "prognosis" ? 1 : 99) : 0;
  if (acts.actions.length > room)
    failed.push(
      `a ${kind} answer offered ${acts.actions.length} action(s), room for ${room}`,
    );
  if (acts.dropped.length)
    failed.push(
      `invented ${acts.dropped.length} id(s): ${acts.dropped.slice(0, 3).join(", ")}`,
    );
  const text = norm(reply);
  for (const a of acts.actions)
    if (!names(text, a.title))
      failed.push(`the row offers "${a.title}" and the answer never names it`);
  for (const c of candidates)
    if (names(text, c.title) && !acts.actions.some((a) => a.id === c.id))
      failed.push(`the answer names "${c.title}" and the row does not offer it`);
  return failed;
}

const JUDGE_SYSTEM = `You are grading one answer a health app gave to one question from the person whose data it holds.

An "action" here is a treatment, supplement, food, habit or test it tells the person to start. The closing line that names a marker to remeasure and when is not an action and is never counted against the answer; it is only expected of an answer to a question about what to do.

Answers come in six kinds and each kind has its own shape, which is given to you as THE KIND OF QUESTION IT IS. A status answer gives their values and stops. A howto answer gives numbers, then actions, then what to remeasure. A prognosis answer says how the condition goes from here, from the papers, and may name at most one action. A research answer reports the papers and names no action. A why answer explains a mechanism and names no action. A next-test answer names the tests worth doing and what each would settle. An answer that names no action because its kind forbids one is doing the right thing.

Answer in exactly six lines, nothing else:
numbers: yes|no — it uses that person's own values, with the numbers. "yes" when the question asked about the literature or about the condition in general rather than about this person's own readings, and the answer stayed on the literature.
actions: yes|no — every action it names is one of the ALLOWED ACTIONS, with that source's dose where there is one. "yes" when it names no action at all because the list is empty.
labels: yes|no — every action it names carries a bracketed label. "yes" when it names no action.
invented: yes|no — it invents a lab value, a dose, a probability or a diagnosis that is not in the context (yes means it DID invent something). A remeasurement interval is not an invented value.
answers: yes|no — it answers the question that was asked, plainly, in the shape that question asked for. "no" when it fell back on the app's template (their numbers, then do this, then measure that) instead of answering what was asked: a question about the research wants what the papers found and how sure the field is, a question about whether this ever goes away wants the course of the condition, a question about why wants the mechanism, a question about what to test next wants what each test would settle.
worst: <one sentence on the worst thing about it>`;

async function judge(
  c: AskCase,
  reply: string,
  allowed: string,
  data: string,
  kind: QuestionKind,
  sources: string,
  settles: string,
): Promise<{ judgeScore: number; judgeNote: string }> {
  const { text } = await generateText({
    // ponytail: one fixed independent judge, so candidates are comparable.
    model: model(process.env.EVAL_JUDGE_MODEL ?? "openai/gpt-5.6-sol"),
    system: JUDGE_SYSTEM,
    prompt: `THE QUESTION: ${c.q}
THE KIND OF QUESTION IT IS: ${kind}

WHAT A GOOD ANSWER DOES: ${c.judge}

THEIR DATA (every value and band the answer was written from):
${data || "- none"}

ALLOWED ACTIONS (the only ones that exist for this person):
${allowed || "- none"}

ALLOWED SOURCES (the only papers and guidelines the answer was given; citing one of these is correct, citing anything else is inventing):
${sources || "- none"}

WHAT EACH OFFERED TEST WOULD SETTLE (the engine's own numbers, handed to the answer; repeating one of these is correct, not invention):
${settles || "- none"}

THE ANSWER:
${reply}`,
  });
  const yes = (key: string) =>
    new RegExp(`${key}\\s*:\\s*yes`, "i").test(text) ? 1 : 0;
  const score =
    yes("numbers") +
    yes("actions") +
    yes("labels") +
    (yes("invented") ? 0 : 1) +
    yes("answers");
  return {
    judgeScore: score,
    judgeNote: text.match(/worst\s*:\s*(.+)/i)?.[1]?.trim() ?? "",
  };
}

/* ── the run ──────────────────────────────────────────────────────────── */

async function runCase(
  userId: string,
  c: AskCase,
  modelId: string,
): Promise<Scored> {
  const started = Date.now();
  const kind = questionKind(c.q);
  try {
    // The judge sees the same numbers the answer was written from, or every
    // value in every answer looks invented to it.
    /**
     * The judge is shown the same context the answer was written from. It used
     * to be cut at 6000 characters, which stopped just before the marker
     * table, so the judge marked "invented" against real values: it called a
     * TPO of 320 IU/mL a fabrication in the phase 28a run. The whole thing is
     * about 11 k, so the cut is now above it.
     */
    const data = (await chatContext(userId).catch(() => "")).slice(0, 16000);
    const rows = await actionsFor(userId, c.about ?? null, 6);
    const answer = await answerQuestion(userId, c.q, {
      ...(c.about ? { about: c.about } : {}),
      modelId,
    });
    const reply = answer.reply ?? "";
    const allowed = {
      titles: (answer.actions ?? rows).map((a) => a.title),
      labels: [...new Set((answer.actions ?? rows).map((a) => a.label))],
    };
    const failed = [
      ...codeChecks(reply, allowed, kind),
      ...actChecks(
        reply,
        answer.acts,
        (answer.actions ?? rows).map((a) => ({ id: a.id, title: a.title })),
        kind,
      ),
    ];
    const graded = reply
      ? await judge(
          c,
          reply,
          (answer.actions ?? rows)
            .map(
              (a) => `- ${a.title}${a.dose ? ` · ${a.dose}` : ""} ${a.label}`,
            )
            .join("\n"),
          data,
          kind,
          (answer.sourcesOffered ?? [])
            .map((s) => `- ${s.name}${s.year ? ` (${s.year})` : ""} · grade ${s.grade ?? "?"} · ${s.says}`)
            .join("\n"),
          (answer.settlesOffered ?? []).map((l) => `- ${l}`).join("\n"),
        ).catch(() => ({ judgeScore: 0, judgeNote: "judge failed" }))
      : { judgeScore: 0, judgeNote: "no answer" };

    return {
      id: c.id,
      kind,
      reply,
      sentences: sentencesIn(reply),
      labels: labelsIn(reply),
      ...(answer.sources?.length
        ? { sources: answer.sources.map((s) => `${s.name} ${s.year ?? "?"}`) }
        : {}),
      ...(answer.acts
        ? {
            acts: {
              actions: answer.acts.actions.map((a) => a.title),
              tests: answer.acts.tests.map((t) => `${t.code}/${t.weeks}w`),
              questions: answer.acts.questions.map((q) => q.key),
            },
            dropped: answer.acts.dropped,
          }
        : {}),
      failed,
      ...graded,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return {
      id: c.id,
      kind,
      reply: "",
      sentences: 0,
      labels: [],
      failed: ["threw"],
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 0..1: the judge's five, minus a fifth for each code check that failed. */
const scoreOf = (rows: Scored[]): number => {
  if (!rows.length) return 0;
  const total = rows.reduce(
    (sum, r) => sum + Math.max(0, (r.judgeScore ?? 0) - r.failed.length) / 5,
    0,
  );
  return Math.round((total / rows.length) * 100) / 100;
};

/** The winner has to be at least this good, or the phase is not done. */
const FLOOR = 0.7;

async function main() {
  const argv = process.argv.slice(2);
  const ids: string[] = [];
  let only: string[] | null = null;
  let email = process.env.EVAL_ASK_EMAIL ?? DEFAULT_EMAIL;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--models") only = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (arg.startsWith("--models=")) only = arg.slice(9).split(",");
    else if (arg === "--user") email = argv[++i] ?? email;
    else ids.push(arg);
  }

  const cases = (
    JSON.parse(
      await readFile(path.join(HERE, "ask", "cases.json"), "utf8"),
    ) as AskCase[]
  ).filter((c) => !ids.length || ids.includes(c.id));
  if (!cases.length) {
    console.error("no cases matched", ids.join(", "));
    process.exitCode = 1;
    return;
  }

  const [user] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!user) {
    console.error(`no account for ${email}`);
    process.exitCode = 1;
    return;
  }

  const models = only ? await named(only) : await candidates();
  console.log(`asking as ${email}, ${cases.length} cases\n`);

  const runs: ModelRun[] = [];
  for (const [modelId, meta] of models) {
    console.log(`── ${modelId}`);
    const rows: Scored[] = [];
    for (const c of cases) {
      process.stdout.write(`· ${c.id} … `);
      const scored = await runCase(user.id, c, modelId);
      rows.push(scored);
      console.log(
        scored.error
          ? `error: ${scored.error.slice(0, 90)}`
          : `${scored.kind}, judge ${scored.judgeScore}/5, ${scored.sentences} sentences, ${
              scored.failed.length ? scored.failed.join("; ") : "clean"
            } (${Math.round(scored.latencyMs / 1000)}s)`,
      );
    }
    runs.push({
      modelId,
      outPerM: meta?.pricing?.completion
        ? Number(meta.pricing.completion) * 1_000_000
        : null,
      inPerM: meta?.pricing?.prompt
        ? Number(meta.pricing.prompt) * 1_000_000
        : null,
      cases: rows,
      score: scoreOf(rows),
    });
    console.log("");
  }

  runs.sort((a, b) => b.score - a.score);
  console.table(
    runs.map((r) => ({
      model: r.modelId,
      score: r.score,
      judge: (
        r.cases.reduce((s, c) => s + (c.judgeScore ?? 0), 0) / r.cases.length
      ).toFixed(2),
      clean: `${r.cases.filter((c) => !c.failed.length).length}/${r.cases.length}`,
      chips: r.cases.reduce(
        (s, c) =>
          s +
          (c.acts
            ? c.acts.actions.length + c.acts.tests.length + c.acts.questions.length
            : 0),
        0,
      ),
      invented: r.cases.reduce((s, c) => s + (c.dropped?.length ?? 0), 0),
      "$/M in": r.inPerM == null ? "-" : r.inPerM.toFixed(2),
      "$/M out": r.outPerM == null ? "-" : r.outPerM.toFixed(2),
      seconds: Math.round(
        r.cases.reduce((s, c) => s + c.latencyMs, 0) / 1000 / r.cases.length,
      ),
    })),
  );

  const winner = runs[0]!;
  console.log(`\nwinner: ${winner.modelId} (${winner.score})`);
  console.log(`set AI_ASK_MODEL=${winner.modelId}\n`);

  for (const c of winner.cases) {
    console.log(`── ${c.id} (${c.kind}): ${c.reply}`);
    if (c.sources) console.log(`   sources: ${c.sources.join(" | ")}`);
    if (c.acts)
      console.log(
        `   row: ${[...c.acts.actions.map((a) => `add ${a}`), ...c.acts.tests.map((t) => `retest ${t}`), ...c.acts.questions.map((q) => `answer ${q}`)].join(" | ") || "nothing"}`,
      );
    if (c.failed.length) console.log(`   failed: ${c.failed.join("; ")}`);
    if (c.judgeNote) console.log(`   judge: ${c.judgeNote}`);
  }

  const file = path.join(
    HERE,
    "results",
    `ask-${new Date().toISOString().slice(0, 10)}.json`,
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      { ranAt: new Date().toISOString(), email, winner: winner.modelId, runs },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${path.relative(process.cwd(), file)}`);

  if (winner.score < FLOOR) process.exitCode = 1;
  // The pool holds the event loop open, and a CLI that never exits is a CLI
  // nobody puts in a script.
  await pool().end();
}

await main();
