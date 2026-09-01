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
import { Button } from "./ui-kit";

export const COMPOSER_ID = "composer";
const DRAFT_KEY = "composer-draft";

/** The mobile bar and anything else that wants the box open calls this. */
export function openComposer() {
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

const KIND_TONE: Record<string, string> = {
  fact: "border-neutral-400 text-neutral-700",
  symptom: "border-accent-500 text-accent-600",
  reading: "border-[var(--color-health-info)] text-[var(--color-health-info)]",
  event: "border-neutral-300 text-neutral-500",
  phenotype:
    "border-[var(--color-health-warning)] text-[var(--color-health-warning)]",
  // Hearsay: dotted, because it is about the world and writes nothing here.
  claim: "border-dashed border-neutral-400 text-neutral-500",
  // Food off a photo: an estimate, and the chip says so in its own label.
  nutrition: "border-[var(--color-health-info)] text-neutral-600",
  unknown: "border-neutral-300 text-neutral-400",
};

const field =
  "border border-neutral-300 bg-neutral-0 px-1.5 py-0.5 font-mono text-[11px]";

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
    <div className="mt-1 flex flex-wrap items-center gap-1.5 border border-neutral-200 bg-neutral-50 p-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
        {chip.key}
      </span>
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
      <label className="flex items-center gap-1 font-mono text-[10px] text-neutral-500">
        from
        <input
          type="date"
          max={today}
          className={field}
          value={chip.date}
          onChange={(e) => onChange({ ...chip, date: e.target.value })}
        />
      </label>
      <button
        className="cursor-pointer font-mono text-[10px] uppercase text-[var(--color-health-critical)] hover:underline"
        onClick={onRemove}
      >
        remove
      </button>
      <button
        className="cursor-pointer font-mono text-[10px] uppercase text-neutral-500 hover:underline"
        onClick={onClose}
      >
        done
      </button>
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

  // An unsent draft survives a reload; a posted one is cleared.
  useEffect(() => {
    setText(sessionStorage.getItem(DRAFT_KEY) ?? "");
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
      error?: string;
    };
  }, []);

  // Live chips: 400 ms after the typing stops, and never under six characters.
  useEffect(() => {
    if (posted) return;
    if (text.trim().length < 6) {
      setChips([]);
      return;
    }
    const id = setTimeout(async () => {
      setThinking(true);
      const data = await post({ text, draft: true });
      setThinking(false);
      if (data.chips) {
        setChips(data.chips);
        setOptions(data.options ?? {});
      }
    }, 400);
    return () => clearTimeout(id);
  }, [text, posted, post]);

  useEffect(() => {
    const el = chipBox.current;
    if (!el || chips.length === 0) return;
    el.classList.remove("is-shown");
    void el.offsetHeight; // force reflow so the stagger replays
    el.classList.add("is-shown");
  }, [chips]);

  const reset = () => {
    setText("");
    setChips([]);
    setPosted(null);
    setError("");
    setOpen(null);
    setPhoto(null);
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

  const send = async () => {
    setPosting(true);
    setError("");
    const data = await post({ text, chips });
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
        className={`fixed bottom-6 right-6 z-40 size-14 cursor-pointer items-center justify-center rounded-full bg-neutral-900 text-neutral-0 shadow-lg transition-[background-color,scale] duration-150 ease-out hover:bg-accent-600 active:scale-[0.96] ${app ? "flex" : "hidden md:flex"}`}
      >
        <Plus className="size-6" />
      </button>

      <dialog
        id={COMPOSER_ID}
        ref={dialog}
        data-app={app ? "" : undefined}
        onClose={() => setOpen(null)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        className="m-auto w-[min(560px,92vw)] rounded-sm border border-neutral-200 bg-neutral-0 p-0 text-neutral-900 backdrop:bg-neutral-900/40"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
          <h2 className="font-display text-[15px] font-medium tracking-[-0.02em]">
            What&rsquo;s new?
          </h2>
          <button
            aria-label="Close"
            className="cursor-pointer text-neutral-400 hover:text-neutral-900"
            onClick={() => dialog.current?.close()}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-4">
          <textarea
            ref={box}
            autoFocus
            rows={3}
            value={text}
            disabled={!!posted}
            placeholder="a symptom, a habit, a number, something a doctor said…"
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 260)}px`;
            }}
            className="w-full resize-none border-b border-neutral-200 bg-transparent py-1 font-body text-[15px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-neutral-400 disabled:text-neutral-500"
          />

          <div
            ref={chipBox}
            className="t-stagger mt-3 flex min-h-6 flex-wrap items-start gap-1.5"
          >
            {thinking && (
              <Loader2 className="size-3.5 animate-spin text-neutral-300" />
            )}
            {chips.map((chip, i) => (
              <div
                key={`${chip.kind}:${chip.key}`}
                className={`t-stagger-line w-full t-stagger-line--${Math.min(i + 1, 8)}`}
              >
                <button
                  onClick={() => setOpen(open === chip.key ? null : chip.key)}
                  className={`inline-flex h-10 cursor-pointer items-center gap-1.5 border px-2 font-mono text-[10px] uppercase tracking-[0.04em] transition-[color,border-color] duration-150 ease-out active:scale-[0.96] ${
                    KIND_TONE[chip.kind] ?? KIND_TONE.unknown
                  } ${posted ? "" : "border-dashed"}`}
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
                    <span className="text-neutral-400">· {chip.date}</span>
                  )}
                  {chip.by === "model" && (
                    <span className="text-neutral-300">· ai</span>
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
            {!chips.length && !thinking && text.trim().length >= 6 && (
              <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-300">
                nothing understood yet
              </span>
            )}
          </div>

          {(reading || photo) && (
            <div className="mt-3 border border-neutral-200 bg-neutral-50 p-2">
              {reading ? (
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                  <Loader2 className="size-3.5 animate-spin" /> reading the
                  photo
                </p>
              ) : (
                photo && (
                  <>
                    <p className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                      {photo.kind.replace(/_/g, " ")}
                      {photo.chips.length ? " · estimate, tap to fix" : ""}
                    </p>
                    {photo.basis && (
                      <p className="mt-1 font-body text-[12px] text-neutral-600">
                        {photo.basis}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-start gap-1.5">
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
                            className={`inline-flex cursor-pointer items-center gap-1 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] ${
                              KIND_TONE[chip.kind] ?? KIND_TONE.unknown
                            } ${photo.saved ? "" : "border-dashed"}`}
                          >
                            {chip.label}
                            {chip.date !== today && (
                              <span className="text-neutral-400">
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
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-500">
                        {photo.note}
                      </p>
                    )}
                    {!!photo.chips.length && (
                      <div className="mt-2">
                        {photo.saved ? (
                          <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                            saved
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline-subtle"
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
            <div className="mt-4 border-l-2 border-accent-500 bg-accent-50 px-3 py-2">
              <p className="font-body text-[13px] text-neutral-800">
                {posted.followUp.question}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(posted.followUp.options ?? []).map((o) => (
                  <Button
                    key={o}
                    size="sm"
                    variant="outline-subtle"
                    disabled={posting}
                    onClick={() => void answer(o)}
                  >
                    {o}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {posted?.reply && (
            <p className="mt-4 border-l-2 border-neutral-900 pl-3 font-body text-[13px] leading-relaxed text-neutral-700">
              {posted.reply}
            </p>
          )}

          {error && (
            <p className="mt-3 font-mono text-[11px] text-[var(--color-health-critical)]">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
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
            {!posted && (
              <button
                title="A plate, a supplement label, a lab sheet"
                disabled={reading}
                onClick={() => photoInput.current?.click()}
                className="mr-auto flex cursor-pointer items-center gap-1 font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-500 hover:text-neutral-900 disabled:text-neutral-300"
              >
                <Camera className="size-3.5" /> photo
              </button>
            )}
            {posted ? (
              <>
                <Button variant="outline-subtle" size="sm" onClick={reset}>
                  Write another
                </Button>
                <Button
                  size="sm"
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
                size="sm"
                disabled={posting || text.trim().length < 2}
                onClick={() => void send()}
              >
                {posting ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Post
              </Button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
