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
import { Check, Loader2, Play, Search, Sparkles } from "lucide-react";
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
      <Button
        job="text"
        size="sm"
        title="Override this rule"
        onClick={() => setOpen(true)}
      >
        …
      </Button>
    );

  const send = (extra: Record<string, unknown>) =>
    post({ action: "override", id, note: note.trim() || undefined, ...extra });

  return (
    <span className="block">
      <span className="fields">
        <span className="field">
          <label htmlFor={`lrpos-${id}`}>LR+</label>
          <input
            id={`lrpos-${id}`}
            className="inp num"
            value={pos}
            inputMode="decimal"
            onChange={(e) => setPos(e.target.value)}
          />
        </span>
        <span className="field">
          <label htmlFor={`lrneg-${id}`}>LR−</label>
          <input
            id={`lrneg-${id}`}
            className="inp num"
            value={neg}
            inputMode="decimal"
            placeholder="—"
            onChange={(e) => setNeg(e.target.value)}
          />
        </span>
        <span className="field">
          <label htmlFor={`grade-${id}`}>Grade</label>
          <select
            id={`grade-${id}`}
            className="sel"
            value={g}
            onChange={(e) => setG(e.target.value)}
          >
            {["A", "B", "C", "D", "E"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </span>
        <span className="field">
          <label htmlFor={`why-${id}`}>Why</label>
          <input
            id={`why-${id}`}
            className="inp"
            value={note}
            placeholder="why"
            onChange={(e) => setNote(e.target.value)}
          />
        </span>
      </span>
      <span className="rowh mt-[var(--s13)]">
        <Button
          size="sm"
          job="ink"
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
          {busy ? <Loader2 className="spin" /> : <Check />}
          Write the override
        </Button>
        <Button
          size="sm"
          job="quiet"
          disabled={busy}
          onClick={async () => {
            const ok = await send({ exclude: status !== "rejected" });
            if (ok) setOpen(false);
          }}
        >
          {status === "rejected" ? "put back" : "exclude"}
        </Button>
        <Button size="sm" job="text" onClick={() => setOpen(false)}>
          Reset
        </Button>
        {error && <span className="err">{error}</span>}
      </span>
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
        job="quiet"
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
        {busy ? <Loader2 className="spin" /> : <Search />}
        {busy ? "Reading…" : "Research"}
      </Button>
      {result && <span className="t-num">{result}</span>}
      {error && <span className="err">{error}</span>}
    </span>
  );
}

interface Filed {
  claim: {
    intervention: string;
    markers: string[];
    direction: string;
    sourceKind: string;
    text: string;
  };
  conditionId: string;
  conditionName: string;
  horizonId: string;
  horizonNew: boolean;
  science: { name: string; grade: string; effect: string | null }[];
  scienceWritten: number;
  plan: string | null;
}

/**
 * "Drop a claim": the trends inbox, in one box.
 *
 * A claim does not have to be true to enter. What comes back says which half of
 * it landed where — the science the engine went and read, and the popular form
 * itself as a grade E horizon row with a measurement plan.
 */
export function ClaimBox() {
  const { post, busy, error } = useWrite();
  const [text, setText] = useState("");
  const [filed, setFiled] = useState<Filed | null>(null);
  const [note, setNote] = useState("");

  const send = async () => {
    if (text.trim().length < 4) return;
    setFiled(null);
    setNote("");
    const data = (await post({ action: "claim", text, maxPapers: 3 })) as {
      filed?: Filed | null;
      note?: string;
    } | null;
    if (!data) return;
    setFiled(data.filed ?? null);
    setNote(data.note ?? "");
  };

  return (
    <div className="space-y-2">
      <div className="rowh flex-nowrap">
        <div className="searchbox min-w-0 flex-1">
          <Sparkles className="ic" />
          <input
            placeholder="Drop a claim — “sardines are everywhere right now, people eat 3 tins a week”"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
        </div>
        <Button size="sm" job="quiet" disabled={busy} onClick={send}>
          {busy ? <Loader2 className="spin" /> : null}
          {busy ? "Reading…" : "File it"}
        </Button>
      </div>

      {error && <p className="err">{error}</p>}
      {note && <p className="t-meta">{note}</p>}

      {filed && (
        <div className="space-y-1 border-l-2 border-[var(--hair)] pl-3">
          <p className="t-body">
            <span className="c-label">claim</span> {filed.claim.intervention}
            {filed.claim.markers.length
              ? ` → ${filed.claim.markers.join(", ")} ${filed.claim.direction}`
              : " → no marker we measure"}
          </p>
          <p className="t-meta">
            horizon · grade E · anecdotal · from {filed.claim.sourceKind} ·
            filed under {filed.conditionId}
            {filed.horizonNew ? "" : " (already on the shelf)"}
          </p>
          {filed.science.length > 0 ? (
            <p className="t-body">
              the science inside it:{" "}
              {filed.science
                .map(
                  (s) =>
                    `${s.name} (grade ${s.grade}${s.effect ? `, ${s.effect}` : ""})`,
                )
                .join(" · ")}
            </p>
          ) : (
            <p className="t-meta">
              no graded row for that marker yet
              {filed.scienceWritten
                ? `; the search just added ${filed.scienceWritten}`
                : ""}
            </p>
          )}
          {filed.plan && <p className="t-body">{filed.plan}</p>}
        </div>
      )}
    </div>
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
    <Button
      job="text"
      size="sm"
      disabled={busy}
      onClick={() =>
        void post({ action: "in_catalog", id, inCatalog: !inCatalog })
      }
    >
      {busy ? "…" : inCatalog ? "in" : "out"}
    </Button>
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
        job="quiet"
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
        {busy ? <Loader2 className="spin" /> : <Play />}
        {busy ? "Running…" : label}
      </Button>
      {result && <span className="t-num">{result}</span>}
      {error && <span className="err">{error}</span>}
    </span>
  );
}
