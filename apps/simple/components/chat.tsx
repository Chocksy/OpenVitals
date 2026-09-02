"use client";

/**
 * Ask and discuss, as a conversation.
 *
 * Phase 28c. The old chat was one stateless exchange with no persistence and
 * no buttons: a reload started over and nothing the answer said could be acted
 * on. A thread is now rows in our own Postgres, the answer's structured half
 * arrives as the `offer` tool part, and the chips under it are the same ones
 * the composer already renders, through `ActOnIt` and the same routes.
 *
 * Phase 30e draws it on `docs/mockups/v4/chat.html`: the question line, the
 * panel the answer sits in, the receipt a written fact leaves behind, the fold
 * that keeps "question — verdict" for older turns, and the ask pill above the
 * tab bar. Nothing about the transport, the routes or the writes moved.
 *
 * Nothing here decides anything. A chip acts through the engine's own routes;
 * a chip click never goes back through the model.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";
import { ActOnIt, type Acts } from "./act-on-it";
import { Sources, type AskSource } from "./ask-answer";
import { LabelledProse } from "./evidence-chip";
import { Button } from "./ui-kit";

/** One thread in "Everything you asked". */
export interface ThreadRow {
  id: string;
  title: string;
  about: string | null;
  lastTurnAt: string | null;
}

/** What the `offer` tool hands back: the guard's result plus ask-back options. */
interface Offered extends Acts {
  sources?: AskSource[];
  options?: Record<string, string[]>;
}

/** A tool part on a message, whatever the tool was. */
interface ToolPart {
  type: string;
  state?: string;
  output?: unknown;
}

const DAY = 86_400_000;

/** "Sep 1", or "today" for the last day. */
function when(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Date.now() - at.getTime() < DAY) return "today";
  return at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export function ThreadList({ threads }: { threads: ThreadRow[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const left = threads.filter((t) => !gone.includes(t.id));

  if (!left.length)
    return (
      <div className="empty">
        <p>
          Nothing yet. Ask a question above and it becomes a thread you can come
          back to.
        </p>
      </div>
    );

  return (
    <div className="rowlist">
      {left.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <a href={`/chat/${t.id}`} className="threadrow min-w-0 flex-1">
            <span className="d">{when(t.lastTurnAt)}</span>
            <span className="t">{t.title}</span>
            <ChevronRight className="ic" aria-hidden="true" />
          </a>
          <Button
            job="text"
            size="icon"
            aria-label={`Delete ${t.title}`}
            className="shrink-0"
            onClick={async () => {
              await fetch(`/api/chat/threads?id=${t.id}`, { method: "DELETE" });
              setGone((was) => [...was, t.id]);
              router.refresh();
            }}
          >
            <Trash2 className="ic" aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
}

/** The receipt a written fact leaves behind: the green check and the sentence. */
function Receipt({ children }: { children: React.ReactNode }) {
  return (
    <div className="receipt">
      <p className="m-0 flex items-start gap-1.5">
        <Check
          className="ic mt-[3px] text-[var(--ok)]"
          aria-hidden="true"
        />
        <span>{children}</span>
      </p>
    </div>
  );
}

/**
 * The engine asking back.
 *
 * A question the answer put in `offer.questions` is a fact that would change
 * what it just said. Picking an option writes the fact through `/api/facts` and
 * then sends the answer back into the thread, so the next turn's facts block
 * has it.
 */
function AskBack({
  question,
  options,
  onAnswered,
}: {
  question: { key: string; question: string };
  options: string[];
  onAnswered: (text: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState("");

  if (done)
    return (
      <Receipt>
        Recorded: {question.question} — <b>{done}</b>
      </Receipt>
    );

  return (
    <div className="receipt mt-3">
      <p className="m-0">{question.question}</p>
      <div className="chips mt-2">
        {(options.length ? options : ["Yes", "No", "Not sure"]).map((o) => (
          <button
            key={o}
            className="chip"
            disabled={!!busy}
            onClick={async () => {
              setBusy(o);
              const res = await post("/api/facts", {
                key: question.key,
                value: o,
              });
              setBusy("");
              if (!res.ok) return;
              setDone(o);
              onAnswered(`${question.question}: ${o}`);
            }}
          >
            {busy === o && <Loader2 className="ic spin" aria-hidden="true" />}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Everything one assistant turn put on the screen, part by part. */
function Turn({
  message,
  onAnswered,
}: {
  message: UIMessage;
  onAnswered: (text: string) => void;
}) {
  return (
    <>
      {message.parts.map((raw, i) => {
        const part = raw as ToolPart & { text?: string };
        if (part.type === "text")
          return (
            <p key={i} className="answer whitespace-pre-line">
              <LabelledProse text={part.text ?? ""} />
            </p>
          );
        if (!part.type.startsWith("tool-")) return null;
        if (part.state !== "output-available") return null;

        if (part.type === "tool-offer") {
          const acts = part.output as Offered;
          return (
            <div key={i}>
              <Sources sources={acts.sources} />
              <ActOnIt acts={{ ...acts, questions: [] }} />
              {acts.questions.map((q) => (
                <AskBack
                  key={q.key}
                  question={q}
                  options={acts.options?.[q.key] ?? []}
                  onAnswered={onAnswered}
                />
              ))}
            </div>
          );
        }

        const receipt = (part.output as { receipt?: string })?.receipt;
        if (!receipt) return null;
        return (
          <div key={i} className="mt-3">
            <Receipt>{receipt}</Receipt>
          </div>
        );
      })}
    </>
  );
}

/** The words a message says, whatever else it carries. */
const textOf = (m: UIMessage): string =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { text: string }).text)
    .join("");

/**
 * The one sentence an older turn folds down to.
 *
 * Never invented: it is the first sentence the answer itself wrote, cut at
 * the first full stop and then at 64 characters, so the fold reads
 * "question — verdict" without the reader having to open it.
 */
function verdict(replies: UIMessage[]): string {
  const said = replies.map(textOf).join(" ").trim();
  if (!said) return "";
  const first = said.split(/(?<=[.!?])\s/)[0] ?? said;
  const cut = first.replace(/[.!?]+$/, "");
  return cut.length > 64 ? `${cut.slice(0, 63).trimEnd()}…` : cut;
}

/** One exchange: what was asked, and everything that came back. */
interface Exchange {
  key: string;
  asked: UIMessage | null;
  replies: UIMessage[];
}

/** The messages, grouped into exchanges in the order they arrived. */
function exchanges(messages: UIMessage[]): Exchange[] {
  const out: Exchange[] = [];
  for (const m of messages) {
    if (m.role === "user" || !out.length)
      out.push({
        key: m.id,
        asked: m.role === "user" ? m : null,
        replies: m.role === "user" ? [] : [m],
      });
    else out[out.length - 1]!.replies.push(m);
  }
  return out;
}

function Answered({
  turn,
  onAnswered,
}: {
  turn: Exchange;
  onAnswered: (text: string) => void;
}) {
  return (
    <>
      {turn.asked && <p className="qline">{textOf(turn.asked)}</p>}
      {turn.replies.map((m) => (
        <div key={m.id} className="panel hi">
          <Turn message={m} onAnswered={onAnswered} />
        </div>
      ))}
    </>
  );
}

/** How many exchanges stay open at the bottom of the thread. */
const OPEN = 2;

export function Thread({
  id,
  about,
  initial = [],
}: {
  /** absent for a thread that does not exist yet */
  id?: string;
  about?: string;
  initial?: UIMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  /** the id the server gave a brand new thread, read off `x-thread-id` */
  const threadId = useRef(id);

  const { messages, sendMessage, status, error } = useChat({
    messages: initial,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ messages: all }) => ({
        body: {
          threadId: threadId.current,
          about,
          message: all[all.length - 1],
        },
      }),
      fetch: async (url, init) => {
        const res = await fetch(url as string, init);
        const given = res.headers.get("x-thread-id");
        if (given) threadId.current = given;
        return res;
      },
    }),
    onFinish: () => {
      if (!id && threadId.current) router.replace(`/chat/${threadId.current}`);
      router.refresh();
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    void sendMessage({ text });
  };

  /**
   * The fold, and why it is a `<details>`: everything above the last two
   * answered exchanges is still rendered, still keyed the same, and the
   * browser hides it. Nothing here touches the DOM.
   */
  const turns = exchanges(messages);
  const answered = turns.filter((t) => t.replies.length);
  const keepFrom = answered.length > OPEN ? answered[answered.length - OPEN]! : null;
  const foldTo = keepFrom ? turns.indexOf(keepFrom) : 0;

  return (
    <div className="thread">
      {turns.map((t, i) =>
        i < foldTo ? (
          <details key={t.key}>
            <summary className="fold cursor-pointer list-none">
              <b>{t.asked ? textOf(t.asked) : "Earlier"}</b>
              <span>— {verdict(t.replies)}</span>
              <ChevronDown className="ic" aria-hidden="true" />
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Answered turn={t} onAnswered={send} />
            </div>
          </details>
        ) : (
          <div key={t.key} className="flex flex-col gap-3">
            <Answered turn={t} onAnswered={send} />
          </div>
        ),
      )}

      {busy && <p className="t-meta">Thinking…</p>}
      {error && <p className="t-meta text-[var(--bad)]">{error.message}</p>}

      <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] bg-[color-mix(in_srgb,var(--canvas)_85%,transparent)] py-2 backdrop-blur-[13px] md:bottom-0">
        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <AudioLines className="ic" aria-hidden="true" />
          <textarea
            className="q"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask a follow-up, or tell me something"
          />
          <button
            type="submit"
            className="askbtn"
            disabled={busy || !input.trim()}
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
