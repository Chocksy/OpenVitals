"use client";

/**
 * The buttons on /hkb that write: override a rule the policy already decided,
 * take a condition in or out of the catalog, and run an importer.
 *
 * Nothing here is a queue. The acceptance policy in `lib/hkb-policy.ts` has
 * already said what scores; Override is how a human disagrees with it, and it
 * always writes a note saying so.
 *
 * Everything else on that page is server-rendered. These post to /api/hkb and
 * refresh, so there is no client-side copy of the tables to keep in step.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, Search } from "lucide-react";
import { Button } from "./ui-kit";

function useWrite() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const post = async (body: unknown) => {
    setBusy(true);
    setError("");
    const res = await fetch("/api/hkb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "failed");
      return null;
    }
    start(() => router.refresh());
    return data;
  };

  return { post, busy: busy || pending, error };
}

/**
 * The one write on an evidence row: retype the likelihood ratios, change the
 * grade, or exclude the rule entirely, with a note saying why. Behind a "…"
 * so the table reads as a window and not as a form.
 */
export function Override({
  id,
  lrPos,
  lrNeg,
  grade,
  status,
}: {
  id: string;
  lrPos: number;
  lrNeg: number | null;
  grade: string;
  status: string;
}) {
  const { post, busy, error } = useWrite();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(String(lrPos));
  const [neg, setNeg] = useState(lrNeg == null ? "" : String(lrNeg));
  const [g, setG] = useState(grade);
  const [note, setNote] = useState("");

  if (!open)
    return (
      <button
        className="cursor-pointer px-1 font-mono text-[13px] leading-none text-neutral-400 hover:text-neutral-900"
        title="Override this rule"
        onClick={() => setOpen(true)}
      >
        …
      </button>
    );

  const field =
    "w-16 border border-neutral-300 px-1 py-0.5 font-mono text-[11px] tabular-nums";
  const send = (extra: Record<string, unknown>) =>
    post({ action: "override", id, note: note.trim() || undefined, ...extra });

  return (
    <span className="flex flex-wrap items-center gap-1">
      <label className="font-mono text-[10px] text-neutral-500">
        LR+
        <input
          className={field}
          value={pos}
          inputMode="decimal"
          onChange={(e) => setPos(e.target.value)}
        />
      </label>
      <label className="font-mono text-[10px] text-neutral-500">
        LR−
        <input
          className={field}
          value={neg}
          inputMode="decimal"
          placeholder="—"
          onChange={(e) => setNeg(e.target.value)}
        />
      </label>
      <select
        className="border border-neutral-300 px-1 py-0.5 font-mono text-[11px]"
        value={g}
        onChange={(e) => setG(e.target.value)}
      >
        {["A", "B", "C", "D", "E"].map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <input
        className="w-40 border border-neutral-300 px-1 py-0.5 font-body text-[11px]"
        value={note}
        placeholder="why"
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          const ok = await send({
            lrPos: Number(pos),
            lrNeg: neg.trim() === "" ? null : Number(neg),
            grade: g,
          });
          if (ok) setOpen(false);
        }}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        Save
      </Button>
      <button
        className="cursor-pointer font-mono text-[10px] text-neutral-400 underline decoration-dotted"
        disabled={busy}
        onClick={async () => {
          const ok = await send({ exclude: status !== "rejected" });
          if (ok) setOpen(false);
        }}
      >
        {status === "rejected" ? "put back" : "exclude"}
      </button>
      <button
        className="cursor-pointer font-mono text-[10px] text-neutral-400 underline decoration-dotted"
        onClick={() => setOpen(false)}
      >
        cancel
      </button>
      {error && (
        <span className="font-mono text-[10px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}

/** One condition through the research job, from the Conditions tab. */
export function ResearchButton({ conditionId }: { conditionId: string }) {
  const { post, busy, error } = useWrite();
  const [result, setResult] = useState("");
  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          const data = (await post({
            action: "research",
            conditionId,
          })) as { result?: Record<string, number> } | null;
          setResult(
            data?.result
              ? Object.entries(data.result)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" ")
              : "",
          );
        }}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Search className="size-3.5" />
        )}
        {busy ? "Reading…" : "Research"}
      </Button>
      {result && (
        <span className="font-mono text-[10px] text-neutral-500">{result}</span>
      )}
      {error && (
        <span className="font-mono text-[10px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}

export function CatalogToggle({
  id,
  inCatalog,
}: {
  id: string;
  inCatalog: boolean;
}) {
  const { post, busy } = useWrite();
  return (
    <button
      disabled={busy}
      onClick={() =>
        void post({ action: "in_catalog", id, inCatalog: !inCatalog })
      }
      className="cursor-pointer font-mono text-[11px] underline decoration-dotted"
    >
      {busy ? "…" : inCatalog ? "in" : "out"}
    </button>
  );
}

export function RunImport({
  script,
  label,
}: {
  script: "ontology" | "priors" | "prices";
  label: string;
}) {
  const { post, busy, error } = useWrite();
  const [result, setResult] = useState("");
  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline-subtle"
        disabled={busy}
        onClick={async () => {
          const data = (await post({ action: "import", script })) as {
            result?: Record<string, unknown>;
          } | null;
          setResult(
            data?.result
              ? Object.entries(data.result)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(" ")
              : "",
          );
        }}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Play className="size-3.5" />
        )}
        {busy ? "Running…" : label}
      </Button>
      {result && (
        <span className="font-mono text-[10px] text-neutral-500">{result}</span>
      )}
      {error && (
        <span className="font-mono text-[10px] text-[var(--color-health-critical)]">
          {error}
        </span>
      )}
    </span>
  );
}
