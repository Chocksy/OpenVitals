/**
 * The ask-answer eval: which model should answer a question?
 *
 *   pnpm --filter simple eval:ask [caseId ...] [--models a,b] [--user email]
 *
 * Principle 6: model choice by score, not by vibes. Eight questions a person
 * actually asked the app, run against this account's real data through the
 * real `answerQuestion`, then checked twice — in code for the things code can
 * see (six sentences, no filler, labelled actions, no action the context never
 * offered) and by a fixed independent judge for the rest.
 *
 * The candidates are listed from the OpenRouter models endpoint at run time,
 * so the "strongest under about five dollars a million output tokens" is
 * whatever that is today rather than whatever it was when this was written.
 * Three models at most, eight cases each: twenty-four answers is enough to
 * separate them and cheap enough to re-run.
 *
 * Results land in `evals/results/ask-<date>.json`. Exits non-zero when the
 * winner scores under the floor.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/auth-schema";
import { actionsFor } from "@/lib/actions";
import { chatContext } from "@/lib/ai";
import { model } from "@/lib/extract";
import { answerQuestion } from "@/lib/lookup";

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
  reply: string;
  sentences: number;
  /** every bracketed label the answer printed */
  labels: string[];
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
): string[] {
  const failed: string[] = [];
  const count = sentencesIn(reply);
  if (count > MAX_SENTENCES) failed.push(`${count} sentences, wanted 6`);

  const filler = reply.match(FILLER);
  if (filler) failed.push(`filler: "${filler[0]}"`);

  const labels = labelsIn(reply);
  if (!labels.length && allowed.titles.length)
    failed.push("no labelled action");
  for (const label of labels)
    if (!allowed.labels.includes(label))
      failed.push(`label ${label} is not one the context gave`);

  /**
   * The answer may only name actions the context offered. Checked by asking
   * whether any allowed title shares a word with the reply — a weak test on
   * its own, which is why the judge is also asked the same question.
   */
  if (allowed.titles.length && labels.length) {
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

const JUDGE_SYSTEM = `You are grading one answer a health app gave to one question from the person whose data it holds.

An "action" here is a treatment, supplement, food, habit or test it tells the person to start. The closing line that names a marker to remeasure and when is not an action and is required: never count it against the answer.

Answer in exactly six lines, nothing else:
numbers: yes|no — it uses that person's own values, with the numbers
actions: yes|no — every action it names is one of the ALLOWED ACTIONS, with that source's dose where there is one. "yes" when it names no action at all because the list is empty.
labels: yes|no — every action it names carries a bracketed label. "yes" when it names no action.
invented: yes|no — it invents a lab value, a dose, a probability or a diagnosis that is not in the context (yes means it DID invent something). A remeasurement interval is not an invented value.
answers: yes|no — it answers the question that was asked, plainly
worst: <one sentence on the worst thing about it>`;

async function judge(
  c: AskCase,
  reply: string,
  allowed: string,
  data: string,
): Promise<{ judgeScore: number; judgeNote: string }> {
  const { text } = await generateText({
    // ponytail: one fixed independent judge, so candidates are comparable.
    model: model(process.env.EVAL_JUDGE_MODEL ?? "openai/gpt-5.6-sol"),
    system: JUDGE_SYSTEM,
    prompt: `THE QUESTION: ${c.q}

WHAT A GOOD ANSWER DOES: ${c.judge}

THEIR DATA (every value and band the answer was written from):
${data || "- none"}

ALLOWED ACTIONS (the only ones that exist for this person):
${allowed || "- none"}

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
  try {
    // The judge sees the same numbers the answer was written from, or every
    // value in every answer looks invented to it.
    const data = (await chatContext(userId).catch(() => "")).slice(0, 6000);
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
    const failed = codeChecks(reply, allowed);
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
        ).catch(() => ({ judgeScore: 0, judgeNote: "judge failed" }))
      : { judgeScore: 0, judgeNote: "no answer" };

    return {
      id: c.id,
      reply,
      sentences: sentencesIn(reply),
      labels: labelsIn(reply),
      failed,
      ...graded,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    return {
      id: c.id,
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
          : `judge ${scored.judgeScore}/5, ${scored.sentences} sentences, ${
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
    console.log(`── ${c.id}: ${c.reply}`);
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
}

await main();
