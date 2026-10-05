"use client";

/**
 * The two writes on the Research tab.
 *
 * Phase 32a section 1, `docs/mockups/v4/research.html` section 03. The run is
 * slow and it costs tokens, so the button says what it will do before it does
 * it, and a run inside the cooldown comes back as a receipt with the day it
 * last read rather than as a failure.
 *
 * "Ask about this" opens the full-page chat with the paper's question, the
 * same `/chat?ask=…&about=…` every other question goes to. The chat cannot see
 * the paper, so the question carries what the row knows (`askAbout` in
 * `lib/research-watch.ts`), and `about` is the condition the row was filed
 * for, so the answer reads that condition's evidence.
 *
 * "Add to plan" is the same `/api/plan/adopt` the Act-on-it chips post, and it
 * only exists on a row whose paper is behind an accepted intervention.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Plus, Search } from "lucide-react";
import { toast } from "./motion";
import { Button, StateWord } from "./ui-kit";

export interface PickCondition {
  id: string;
  name: string;
  probability: number | null;
}

/** "Hashimoto's thyroiditis · 95 %", or the name when there is no number. */
const optionLabel = (c: PickCondition) =>
  c.probability == null
    ? c.name
    : `${c.name} · ${Math.round(c.probability * 100)} %`;

export function ResearchNow({ conditions }: { conditions: PickCondition[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [id, setId] = useState(conditions[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");

  const run = async () => {
    setBusy(true);
    setSaid("");
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conditionId: id }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      cooldown?: boolean;
      lastRun?: string | null;
      found?: number;
      stored?: number;
      moved?: number;
    };
    setBusy(false);
    if (res.status === 429 && data.cooldown) {
      setSaid(
        data.lastRun
          ? `Read on ${data.lastRun} already. The watch runs again when this condition goes 90 days without a read.`
          : "Inside the cooldown; nothing was read.",
      );
      return;
    }
    if (!res.ok) {
      setSaid(data.error ?? "The run failed.");
      return;
    }
    setSaid(
      `${data.found ?? 0} read · ${data.stored ?? 0} new · ${data.moved ?? 0} moved something.`,
    );
    start(() => router.refresh());
  };

  return (
    <div className="space-y-3">
      <div className="fields">
        <div className="field">
          <label htmlFor="research-condition">Condition</label>
          <select
            id="research-condition"
            className="sel"
            value={id}
            onChange={(e) => setId(e.target.value)}
          >
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {optionLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="rowh">
        <Button disabled={busy || pending || !id} onClick={() => void run()}>
          <Search /> {busy ? "Reading…" : "Research now"}
        </Button>
        <span className="t-meta text-[length:var(--type-sm)]">
          Europe PMC · it reads and grades the papers, and nothing it finds
          moves a number until a human accepts the rule.
        </span>
      </div>
      {said && <p className="cap">{said}</p>}
    </div>
  );
}

/** `/chat?ask=…&about=…`, the one door every question goes through. */
export const paperChatHref = (ask: string, about?: string | null): string => {
  const params = new URLSearchParams({ ask });
  if (about) params.set("about", about);
  return `/chat?${params}`;
};

export function DiscussPaper({
  title,
  ask,
  about,
}: {
  title: string;
  /** the row's own question; a title-only one when the caller has none */
  ask?: string;
  about?: string | null;
}) {
  return (
    <Link
      className="b b-text b-sm"
      href={paperChatHref(
        ask ?? `What does this paper mean for me? “${title}”.`,
        about,
      )}
    >
      <MessageSquare className="size-3.5" aria-hidden="true" /> Ask about this
    </Link>
  );
}

/**
 * "Add to plan" for the action a paper stands behind. One post, the toast
 * with its undo, and the word "added" in the button's place, exactly as the
 * Act-on-it chip does it.
 */
export function AddPaperAction({
  id,
  title,
}: {
  /** `int:<intervention id>`, as `adoptBodyOf` reads it */
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const post = async (body: unknown) => {
    const res = await fetch("/api/plan/adopt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };
  };

  const add = async () => {
    setBusy(true);
    const res = await post({ id });
    setBusy(false);
    if (res.error) {
      toast(`${title} was not added: ${res.error}`);
      return;
    }
    setAdded(res.id ?? "");
    toast(`Added ${title} to your protocol`, {
      label: "undo",
      run: async () => {
        if (res.id) await post({ removeIds: [res.id] });
        setAdded(null);
        router.refresh();
      },
    });
    router.refresh();
  };

  if (added != null)
    return (
      <StateWord tone="on" data-act="added">
        added
      </StateWord>
    );
  return (
    <Button size="sm" job="quiet" disabled={busy} onClick={() => void add()}>
      {busy ? (
        <Loader2 className="ic spin" aria-hidden="true" />
      ) : (
        <Plus className="ic" aria-hidden="true" />
      )}
      Add to plan
    </Button>
  );
}

/**
 * 42D: the rows the Research tab shows are seen once it opens, the same
 * `PATCH /api/research/[id]` the phone sends. Never fatal: a row left unseen
 * shows again tomorrow.
 */
export const markSeen = (ids: string[], send: typeof fetch = fetch) =>
  Promise.all(
    ids.map((id) =>
      send(`/api/research/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seen: true }),
      }).catch(() => null),
    ),
  );

export function SeenOnOpen({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  useEffect(() => {
    if (key) void markSeen(key.split(","));
  }, [key]);
  return null;
}
