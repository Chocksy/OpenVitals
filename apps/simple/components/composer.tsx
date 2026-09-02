"use client";

/**
 * The composer: one "+" that is always there, and a modal like a post box.
 *
 * Phase 20. While the person types, the server says what it understood as
 * chips; each chip is editable and removable before anything is written, so a
 * wrong reading of a sentence is a tap to fix and never a silent fact. Posting
 * writes the chips, asks at most one question back and shows the reply.
 *
 * ponytail: a native `<dialog>` with `showModal()`, opened from anywhere by
 * `openComposer()` through the DOM. No portal library, no context, no store.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Circle, Loader2, Plus, X } from "lucide-react";
import { autoAskToken, openingMode, showsBox } from "@/lib/ask-intent";
import type { ActionRead, ActionSubject } from "@/lib/compose";
import { AskAnswer, type Answer } from "./ask-answer";
import { toast } from "./motion";
import { Button } from "./ui-kit";

export const COMPOSER_ID = "composer";

/**
 * What posting an action statement will do, in the words of the button that
 * already does it. Phase 27 addendum: nothing new is written anywhere — a
 * stance is a route the app has had since phase 19.
 */
const WILL_DO: Record<string, string> = {
  doing: "Post puts it on your protocol, dated when you started.",
  started: "Post puts it on your protocol from that day.",
  stopped: "Post takes it off your plan.",
  refused: "Post hides it from your plan.",
  done: "Post puts it on your protocol and ticks today off.",
};
const DRAFT_KEY = "composer-draft";

/**
 * The one box, opened with words already in it.
 *
 * Home's ask line, a card's "Discuss" and the mobile bar all start the same
 * conversation from a different place, so they pass the opening words here.
 * The dialog is rendered once by the layout and this module is the only copy
 * of itself, so a module-level slot plus a listener is the whole store: no
 * context, no provider, and nothing written into anyone else's DOM.
 */
/**
 * What a card's "Discuss" is about: a name to print, and — when the card is a
 * condition the engine scores — the id the answer is grounded in. A plan
 * action has a name and no condition, and still opens the box as a question.
 */
export interface About {
  id?: string;
  label: string;
  /**
   * The plan action this card is, when it is one. A condition travels as an
   * id the engine scores; an action travels as the report row it is, which is
   * what `/api/plan/adopt` and `/api/plan/dismiss` already take. Phase 27:
   * "i already do this" is then an adopt, not an ontology lookup.
   */
  action?: ActionSubject;
}

/**
 * One opening, with a token so the composer can tell a second open from a
 * re-render. Phase 26: a prefilled question submits itself, and it does it
 * exactly once — the token is what makes "once" checkable.
 */
export interface ComposerOpening {
  token: number;
  text: string;
  about?: About;
}

/** Any subject at all puts the box in question mode; the id is optional. */
const aboutKey = (about?: About | null): string | undefined =>
  about ? (about.id ?? about.label) : undefined;

let prefill: ComposerOpening | null = null;
let tokens = 0;
const openers = new Set<(opening: ComposerOpening) => void>();

export function openComposer(text?: string, about?: About) {
  if (typeof text === "string" || about) {
    prefill = {
      token: ++tokens,
      text: text ?? "",
      ...(about ? { about } : {}),
    };
    for (const fn of openers) fn(prefill);
  }
  const el = document.getElementById(COMPOSER_ID);
  if (el instanceof HTMLDialogElement && !el.open) el.showModal();
}

export interface Chip {
  kind: string;
  key: string;
  label: string;
  value: unknown;
  date: string;
  quote: string;
  confidence: number;
  by: string;
  unit?: string;
}

interface FollowUp {
  key: string;
  question: string;
  options?: string[];
  answer?: string;
}

/**
 * The chip is one shape (`.gchip`, system section 11): mono, uppercase, on
 * the hair border. A guess is dashed and posting draws it solid. The kind
 * only ever moves the text colour, because the spectrum is never a surface.
 */
const KIND_TONE: Record<string, string> = {
  fact: "text-[var(--ink)]",
  symptom: "text-[var(--ink)]",
  reading: "text-[var(--ink)]",
  event: "text-[var(--ink-2)]",
  phenotype: "text-[var(--warn)]",
  // Hearsay: it is about the world and writes nothing here.
  claim: "text-[var(--ink-3)]",
  // Food off a photo: an estimate, and the chip says so in its own label.
  nutrition: "text-[var(--ink-2)]",
  unknown: "text-[var(--ink-3)]",
};

const field = "inp mini";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A timestamp in the browser's own wall clock, offset attached.
 *
 * `toISOString` would say 18:40 for a meal eaten at 21:40 in Bucharest, and
 * "dinner at 18:40" is a different fact. The server reads the clock in the
 * string, so the string has to be the one the person was living in.
 */
function localIso(ms: number): string {
  const d = new Date(ms);
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  );
}

function ChipEditor({
  chip,
  options,
  today,
  onChange,
  onRemove,
  onClose,
}: {
  chip: Chip;
  options: string[];
  today: string;
  onChange: (chip: Chip) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="chipedit mt-[var(--s5)]">
      <span className="c-label self-center">{chip.key}</span>
      {options.length ? (
        <select
          className={field}
          value={String(chip.value)}
          onChange={(e) => onChange({ ...chip, value: e.target.value })}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={`${field} w-28`}
          inputMode={chip.kind === "reading" ? "decimal" : "text"}
          value={String(chip.value)}
          onChange={(e) =>
            onChange({
              ...chip,
              value:
                chip.kind === "reading"
                  ? Number(e.target.value) || 0
                  : e.target.value,
            })
          }
        />
      )}
      <label className="field">
        <span>from</span>
        <input
          type="date"
          max={today}
          className={field}
          value={chip.date}
          onChange={(e) => onChange({ ...chip, date: e.target.value })}
        />
      </label>
      <div className="flex items-center gap-[var(--s8)] self-center">
        <button className="asklink text-[var(--bad)]" onClick={onRemove}>
          Remove
        </button>
        <button className="asklink" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/**
 * `app` is true inside the iOS webview, where the site renders no bottom bar:
 * the floating "+" is then the only way in, so it shows at every width.
 */
export function Composer({
  today,
  app = false,
}: {
  today: string;
  app?: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  /** 18: the chips rise in, 40 ms apart, every time the reading changes. */
  const chipBox = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<{
    id: string;
    reply: string | null;
    followUp: FollowUp | null;
  } | null>(null);
  const [error, setError] = useState("");
  // Phase 23: a photo is its own little flow inside the same box. Its chips
  // are kept apart from the text ones because they are written by
  // `/api/capture`, not by `/api/compose`.
  const photoInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{
    kind: string;
    basis: string;
    label: string | null;
    chips: Chip[];
    note: string | null;
    saved: boolean;
    at: string | null;
  } | null>(null);
  const [reading, setReading] = useState(false);
  /** the grounded answer, when what was typed turned out to be a question */
  const [asked, setAsked] = useState<Answer | null>(null);
  /** the question the answer on screen belongs to, printed above it */
  const [question, setQuestion] = useState("");
  /** the condition a card's "Discuss" opened the box about */
  const [about, setAbout] = useState<About | null>(null);
  /** what the words say about that action: the phase 27 addendum's chip */
  const [read, setRead] = useState<ActionRead | null>(null);
  /** the last opening that was auto-submitted, so it can only happen once */
  const autoAsked = useRef(0);

  // An unsent draft survives a reload; a posted one is cleared.
  useEffect(() => {
    setText(sessionStorage.getItem(DRAFT_KEY) ?? "");
  }, []);

  /**
   * Somebody opened the box with words in it, or about a condition.
   *
   * Phase 26: a question does not wait for a second click. The opening decides
   * (`openingMode`), the ask fires from here with the opening's own words —
   * `text` is state and would still be the old value inside this tick — and
   * the token makes sure one opening only ever posts once.
   */
  useEffect(() => {
    const fn = (next: ComposerOpening) => {
      setPosted(null);
      setAsked(null);
      setChips([]);
      setRead(null);
      setError("");
      setText(next.text);
      setAbout(next.about ?? null);
      setQuestion("");
      const mode = openingMode({
        text: next.text,
        about: aboutKey(next.about),
      });
      const token = autoAskToken(mode, next.token, autoAsked.current);
      if (token != null) {
        autoAsked.current = token;
        void askIt(next.text, next.about?.id);
      }
    };
    openers.add(fn);
    if (prefill) fn(prefill);
    return () => {
      openers.delete(fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (text) sessionStorage.setItem(DRAFT_KEY, text);
    else sessionStorage.removeItem(DRAFT_KEY);
  }, [text]);

  const post = useCallback(async (body: unknown) => {
    const res = await fetch("/api/compose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => ({ error: "no answer" }))) as {
      chips?: Chip[];
      options?: Record<string, string[]>;
      id?: string;
      reply?: string;
      followUp?: FollowUp | null;
      /** what the words said about the plan action the box is about */
      action?: ActionRead | null;
      error?: string;
    };
  }, []);

  // Live chips: 400 ms after the typing stops, and never under six characters.
  useEffect(() => {
    if (posted) return;
    // A question is not a fact, and neither is a Discuss: nothing is read.
    if (!openingMode({ text, about: aboutKey(about) }).drafts) {
      setChips([]);
      return;
    }
    const id = setTimeout(async () => {
      setThinking(true);
      const data = await post({
        text,
        draft: true,
        ...(about?.action ? { about: about.action } : {}),
      });
      setThinking(false);
      setRead(data.action ?? null);
      if (data.chips) {
        setChips(data.chips);
        setOptions(data.options ?? {});
      }
    }, 400);
    return () => clearTimeout(id);
  }, [text, about, posted, post]);

  useEffect(() => {
    const el = chipBox.current;
    if (!el || chips.length === 0) return;
    el.classList.remove("is-shown");
    void el.offsetHeight; // force reflow so the stagger replays
    el.classList.add("is-shown");
  }, [chips]);

  /** "Ask another": empty the box, keep the subject, put the cursor back. */
  const reset = () => {
    prefill = null;
    setText("");
    setChips([]);
    setPosted(null);
    setAsked(null);
    setRead(null);
    setQuestion("");
    setError("");
    setOpen(null);
    setPhoto(null);
    window.setTimeout(() => box.current?.focus(), 0);
  };

  /**
   * The same box answers questions. `openingMode` decides which it was,
   * exactly as `/api/ask` does, so what the button says and what the server
   * does can never disagree.
   */
  const isQuestion = openingMode({ text, about: aboutKey(about) }).ask;

  const askIt = async (q: string, aboutId?: string) => {
    const asking = q.trim();
    if (asking.length < 2 && !aboutId) return;
    setPosting(true);
    setError("");
    setQuestion(asking);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "ask",
        q: asking,
        ...(aboutId ? { about: aboutId } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as Answer;
    setPosting(false);
    sessionStorage.removeItem(DRAFT_KEY);
    setAsked(data);
  };

  /** A photo up, chips back. Nothing is written until "Save these" is tapped. */
  const readPhoto = async (file: File) => {
    setReading(true);
    setError("");
    const form = new FormData();
    form.append("photo", file);
    if (text.trim()) form.append("caption", text.trim());
    // The phone knows when the picture was taken; the browser has the file's
    // own timestamp, which is the same thing for a photo just taken.
    form.append("takenAt", localIso(file.lastModified));
    const res = await fetch("/api/capture", { method: "POST", body: form });
    const data = (await res.json().catch(() => ({ error: "no answer" }))) as {
      kind?: string;
      basis?: string;
      label?: string | null;
      chips?: Chip[];
      routedTo?: string;
      count?: number;
      note?: string;
      error?: string;
    };
    setReading(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    setPhoto({
      kind: data.kind ?? "other",
      basis: data.basis ?? "",
      label: data.label ?? null,
      chips: data.chips ?? [],
      note: data.routedTo
        ? `sent to the ${data.routedTo} reader: ${data.note ?? `${data.count ?? 0} items`}`
        : null,
      saved: false,
      at: localIso(file.lastModified),
    });
  };

  const savePhoto = async () => {
    if (!photo?.chips.length) return;
    setPosting(true);
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chips: photo.chips,
        label: photo.label ?? photo.basis,
        at: photo.at,
      }),
    });
    const data = (await res.json().catch(() => ({ error: "no answer" }))) as {
      error?: string;
    };
    setPosting(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    setPhoto({ ...photo, saved: true });
    router.refresh();
  };

  /**
   * The confirm behind an action chip. Every line of this is a route that
   * already existed before phase 27: adopt, dismiss, tick a habit, answer a
   * profile question. Nothing here invents a write path.
   */
  const applyAction = async (r: ActionRead, subject: ActionSubject) => {
    if (!subject.reportId || typeof subject.index !== "number") return;
    const at = { reportId: subject.reportId, actionIndex: subject.index };
    const call = async (url: string, body: unknown) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
    };

    if (r.stance === "refused" || r.stance === "stopped") {
      await call("/api/plan/dismiss", at);
      toast(
        r.stance === "stopped"
          ? "Taken off your plan"
          : "Hidden from your plan",
        {
          label: "undo",
          run: async () => {
            await call("/api/plan/dismiss", { ...at, undo: true });
            router.refresh();
          },
        },
      );
    } else {
      const res = await call("/api/plan/adopt", {
        ...at,
        ...(r.since ? { startedAt: r.since } : {}),
      });
      if (r.stance === "done" && res.id)
        await call("/api/habits", { itemId: res.id, day: today });
      toast(
        r.stance === "done"
          ? "On your protocol, and ticked off for today"
          : "On your protocol",
      );
    }

    if (r.exerciseDays)
      await call("/api/facts", {
        key: "exercise_days_week",
        value: r.exerciseDays,
        ...(r.since ? { date: r.since } : {}),
        note: r.quote,
      });
  };

  const send = async () => {
    setPosting(true);
    setError("");
    const data = await post({
      text,
      chips,
      ...(about?.action ? { about: about.action } : {}),
    });
    if (data.action && about?.action)
      await applyAction(data.action, about.action);
    setPosting(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    sessionStorage.removeItem(DRAFT_KEY);
    setPosted({
      id: data.id!,
      reply: data.reply ?? null,
      followUp: data.followUp ?? null,
    });
    router.refresh();
  };

  const answer = async (option: string) => {
    if (!posted?.followUp) return;
    setPosting(true);
    const data = await post({
      postId: posted.id,
      followUpKey: posted.followUp.key,
      followUpAnswer: option,
    });
    setPosting(false);
    if (data.error) {
      setError(data.error);
      return;
    }
    setPosted({ ...posted, reply: data.reply ?? posted.reply, followUp: null });
    router.refresh();
  };

  return (
    <>
      <button
        aria-label="Post something"
        title="Post a symptom, a habit, a number"
        onClick={() => dialog.current?.showModal()}
        className={`plusbtn fixed bottom-6 right-6 z-40 size-14 ${app ? "grid" : "hidden"}`}
      >
        <Plus className="ic i24" />
      </button>

      <dialog
        id={COMPOSER_ID}
        ref={dialog}
        data-app={app ? "" : undefined}
        onClose={() => setOpen(null)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="sheet m-auto w-[min(560px,92vw)] p-0"
      >
        <div className="sheet-head">
          <h3>Ask or tell</h3>
          <button
            aria-label="Close"
            className="b b-text b-sm"
            onClick={() => dialog.current?.close()}
          >
            <X className="ic" />
          </button>
        </div>

        <div className="sheet-body">
          {about && (
            <p className="t-meta">
              About <span className="text-[var(--ink)]">{about.label}</span>
            </p>
          )}

          {question && (
            <p className="t-body border-l-2 border-[var(--ink)] pl-[var(--s13)] text-[var(--ink)]">
              {question}
            </p>
          )}

          {question && posting && !asked && (
            <p className="t-meta flex items-center gap-[var(--s5)]">
              <Loader2 className="ic spin" /> Thinking
            </p>
          )}

          {showsBox({ question, answered: !!asked }) && (
            <textarea
              ref={box}
              autoFocus
              rows={3}
              value={text}
              disabled={!!posted}
              placeholder={
                about
                  ? "What do you want to know about it?"
                  : "a symptom, a habit, a number — or a question"
              }
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 260)}px`;
              }}
              onKeyDown={(e) => {
                // Enter sends it. Shift+Enter is still a new line.
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                if (posting || text.trim().length < 2) return;
                void (isQuestion ? askIt(text, about?.id) : send());
              }}
              className="ta resize-none"
            />
          )}

          <div
            ref={chipBox}
            className="t-stagger flex min-h-6 flex-wrap items-start gap-[var(--s8)]"
          >
            {thinking && <Loader2 className="ic spin text-[var(--ink-3)]" />}
            {chips.map((chip, i) => (
              <div
                key={`${chip.kind}:${chip.key}`}
                className={`t-stagger-line w-full t-stagger-line--${Math.min(i + 1, 8)}`}
              >
                <button
                  onClick={() => setOpen(open === chip.key ? null : chip.key)}
                  className={`gchip ${KIND_TONE[chip.kind] ?? KIND_TONE.unknown} ${posted ? "" : "guess"}`}
                >
                  {/* 09: a dashed chip is a guess; posting draws it solid and
                      swaps the open circle for a tick in the same slot. */}
                  <span
                    className="t-icon-swap size-2.5"
                    data-state={posted ? "b" : "a"}
                    aria-hidden="true"
                  >
                    <span className="t-icon" data-icon="a">
                      <Circle className="size-2.5" />
                    </span>
                    <span className="t-icon" data-icon="b">
                      <Check className="size-2.5" />
                    </span>
                  </span>
                  {chip.label}
                  {chip.date !== today && (
                    <span className="text-[var(--ink-3)]">· {chip.date}</span>
                  )}
                  {chip.by === "model" && (
                    <span className="text-[var(--ink-3)]">· ai</span>
                  )}
                </button>
                {open === chip.key && !posted && chip.kind !== "claim" && (
                  <ChipEditor
                    chip={chip}
                    options={options[chip.key] ?? []}
                    today={today}
                    onChange={(next) =>
                      setChips((all) =>
                        all.map((c) => (c.key === chip.key ? next : c)),
                      )
                    }
                    onRemove={() => {
                      setChips((all) => all.filter((c) => c.key !== chip.key));
                      setOpen(null);
                    }}
                    onClose={() => setOpen(null)}
                  />
                )}
              </div>
            ))}
            {!isQuestion &&
              !chips.length &&
              !read &&
              !thinking &&
              text.trim().length >= 6 && (
                <span className="t-meta">Nothing understood yet.</span>
              )}
          </div>

          {read && !posted && (
            <div
              data-action-read={read.stance}
              className="border-l-2 border-[var(--ink)] pl-[var(--s13)]"
            >
              <p className="t-body text-[var(--ink)]">{read.label}</p>
              <p className="t-meta">{WILL_DO[read.stance]}</p>
            </div>
          )}

          {(reading || photo) && (
            <div className="chipedit block">
              {reading ? (
                <p className="c-label flex items-center gap-[var(--s8)]">
                  <Loader2 className="ic spin" /> reading the photo
                </p>
              ) : (
                photo && (
                  <>
                    <p className="c-label">
                      {photo.kind.replace(/_/g, " ")}
                      {photo.chips.length ? " · estimate, tap to fix" : ""}
                    </p>
                    {photo.basis && (
                      <p className="t-body mt-[var(--s5)]">{photo.basis}</p>
                    )}
                    <div className="mt-[var(--s8)] flex flex-wrap items-start gap-[var(--s8)]">
                      {photo.chips.map((chip) => (
                        <div key={`p:${chip.key}`} className="w-full">
                          <button
                            onClick={() =>
                              setOpen(
                                open === `p:${chip.key}`
                                  ? null
                                  : `p:${chip.key}`,
                              )
                            }
                            className={`gchip ${KIND_TONE[chip.kind] ?? KIND_TONE.unknown} ${photo.saved ? "" : "guess"}`}
                          >
                            {chip.label}
                            {chip.date !== today && (
                              <span className="text-[var(--ink-3)]">
                                · {chip.date}
                              </span>
                            )}
                          </button>
                          {open === `p:${chip.key}` && !photo.saved && (
                            <ChipEditor
                              chip={chip}
                              options={[]}
                              today={today}
                              onChange={(next) =>
                                setPhoto({
                                  ...photo,
                                  chips: photo.chips.map((c) =>
                                    c.key === chip.key ? next : c,
                                  ),
                                })
                              }
                              onRemove={() => {
                                setPhoto({
                                  ...photo,
                                  chips: photo.chips.filter(
                                    (c) => c.key !== chip.key,
                                  ),
                                });
                                setOpen(null);
                              }}
                              onClose={() => setOpen(null)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {photo.note && (
                      <p className="c-label mt-[var(--s8)]">{photo.note}</p>
                    )}
                    {!!photo.chips.length && (
                      <div className="mt-[var(--s8)]">
                        {photo.saved ? (
                          <span className="c-label">saved</span>
                        ) : (
                          <Button
                            size="sm"
                            job="quiet"
                            disabled={posting}
                            onClick={() => void savePhoto()}
                          >
                            Save these
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          )}

          {posted?.followUp && (
            <div className="border-l-2 border-[var(--ink)] pl-[var(--s13)]">
              <p className="t-body text-[var(--ink)]">
                {posted.followUp.question}
              </p>
              <div className="mt-[var(--s8)] flex flex-wrap gap-[var(--s8)]">
                {(posted.followUp.options ?? []).map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    job="quiet"
                    disabled={posting}
                    onClick={() => void answer(o)}
                  >
                    {o}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {asked && (
            <AskAnswer answer={asked} onLeave={() => dialog.current?.close()} />
          )}

          {asked?.threadable && (
            <button
              className="asklink"
              onClick={async () => {
                const res = await fetch("/api/chat/threads", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    question,
                    answer: asked,
                    ...(about?.id ? { about: about.id } : {}),
                  }),
                });
                const { id } = (await res.json()) as { id?: string };
                if (!id) return;
                dialog.current?.close();
                router.push(`/chat/${id}`);
              }}
            >
              Continue this
            </button>
          )}

          {posted?.reply && (
            <p className="t-body border-l-2 border-[var(--ink)] pl-[var(--s13)]">
              {posted.reply}
            </p>
          )}

          {error && <p className="err">{error}</p>}
        </div>

        <div className="sheet-foot">
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void readPhoto(file);
            }}
          />
          {!posted && !asked && (
            <button
              title="A plate, a supplement label, a lab sheet"
              disabled={reading}
              onClick={() => photoInput.current?.click()}
              className="b b-text"
            >
              <Camera className="ic" /> Photo
            </button>
          )}
          <span className="grow" />
          {posted || asked ? (
            <>
              <Button job="quiet" onClick={reset}>
                {asked ? "Ask another" : "Write another"}
              </Button>
              <Button
                onClick={() => {
                  reset();
                  dialog.current?.close();
                }}
              >
                Done
              </Button>
            </>
          ) : (
            <Button
              busy={posting}
              disabled={posting || text.trim().length < 2}
              onClick={() =>
                void (isQuestion ? askIt(text, about?.id) : send())
              }
            >
              {posting ? <Loader2 className="ic spin" /> : null}
              {isQuestion ? "Ask" : "Post"}
            </Button>
          )}
        </div>
      </dialog>
    </>
  );
}
