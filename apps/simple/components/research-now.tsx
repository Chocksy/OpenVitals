"use client";

/**
 * The two writes on the Research tab.
 *
 * Phase 32a section 1, `docs/mockups/v4/research.html` section 03. The run is
 * slow and it costs tokens, so the button says what it will do before it does
 * it, and a run inside the cooldown comes back as a receipt with the day it
 * last read rather than as a failure.
 *
 * Discuss opens the composer about the paper. `POST /api/plan/discuss` cannot
 * take one — it wants a `reportId` and an `actionIndex` and appends the reply
 * to that action's notes — so the paper travels as the composer's subject, the
 * same way `ActionButtons` sends an action.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Search } from "lucide-react";
import { openComposer } from "./composer";
import { Button } from "./ui-kit";

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

export function DiscussPaper({ title }: { title: string }) {
  return (
    <Button
      size="sm"
      job="text"
      onClick={() => openComposer("", { label: `the paper “${title}”` })}
    >
      <MessageSquare className="size-3.5" /> Discuss
    </Button>
  );
}
