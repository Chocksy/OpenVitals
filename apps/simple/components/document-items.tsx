"use client";

/**
 * What one medical document proposed, grouped by kind, with Accept, Reject and
 * Edit per row and an "Accept all" per group. Nothing here writes: every
 * button posts to `/api/uploads/[id]/items`, which is the only place a
 * document turns into a reading, a fact, an evidence row or a life event.
 */
import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useAction } from "./client";
import { Button } from "./ui-kit";

export interface DocItem {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  excerpt: string | null;
  status: string;
}

const KIND_ORDER = [
  "diagnosis",
  "measurement",
  "medication",
  "event",
  "finding",
  "recommendation",
];

const KIND_NOTE: Record<string, string> = {
  diagnosis:
    "Accepting adds it to your conditions and writes one evidence row for the matching catalog condition.",
  measurement:
    "Accepting writes a reading, unit-normalised and flagged as coming from a document.",
  medication: "Accepting adds it to your medications.",
  event: "Accepting adds it to your timeline.",
  finding: "Kept as text on the document; the plan reads the abnormal ones.",
  recommendation: "Kept as text on the document.",
};

/** The one-line title of an item, whatever kind it is. */
function title(item: DocItem): string {
  const p = item.payload as Record<string, any>;
  if (item.kind === "measurement")
    return `${p.name}: ${p.value}${p.unit ? ` ${p.unit}` : ""}${
      p.refLow != null || p.refHigh != null
        ? ` (ref ${p.refLow ?? "?"}–${p.refHigh ?? "?"})`
        : ""
    }`;
  if (item.kind === "medication")
    return [p.name, p.dose, p.schedule].filter(Boolean).join(" ");
  return String(p.text ?? p.name ?? "");
}

/** The chips after the title: status, code, polarity, confidence. */
function tags(item: DocItem): string[] {
  const p = item.payload as Record<string, any>;
  const out: string[] = [];
  if (p.status) out.push(String(p.status));
  if (p.polarity) out.push(String(p.polarity));
  if (item.kind === "measurement")
    out.push(p.code ? `code ${p.code}` : "no catalog code");
  if (p.icd10) out.push(`ICD-10 ${p.icd10}`);
  if (p.mondoGuess) out.push(String(p.mondoGuess));
  if (p.date) out.push(String(p.date));
  if (typeof p.confidence === "number")
    out.push(`confidence ${Math.round(p.confidence * 100)}%`);
  return out;
}

export function DocumentItems({
  uploadId,
  items,
}: {
  uploadId: string;
  items: DocItem[];
}) {
  const { run, busy, error } = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const kinds = KIND_ORDER.filter((k) => items.some((i) => i.kind === k));
  const post = (body: Record<string, unknown>) =>
    run(`/api/uploads/${uploadId}/items`, body);

  if (!items.length)
    return (
      <p className="card border-dashed p-6 text-center font-body text-[13px] text-neutral-500">
        Nothing was read out of this document.
      </p>
    );

  return (
    <div className="space-y-5">
      {error && (
        <p className="font-mono text-[11px] text-[var(--color-health-critical)]">
          {error}
        </p>
      )}
      {kinds.map((kind) => {
        const mine = items.filter((i) => i.kind === kind);
        const open = mine.filter((i) => i.status === "proposed");
        return (
          <section key={kind} className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
                {kind} ({mine.length})
              </h2>
              {open.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline-subtle"
                    disabled={busy}
                    onClick={() => post({ action: "accept", kind })}
                  >
                    Accept all {open.length}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => post({ action: "reject", kind })}
                  >
                    Reject all
                  </Button>
                </>
              )}
              <span className="font-body text-[11px] text-neutral-400">
                {KIND_NOTE[kind]}
              </span>
            </div>

            <div className="card divide-y divide-neutral-100">
              {mine.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-[13px] text-neutral-800">
                        {title(item)}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                        {[item.status, ...tags(item)].join(" · ")}
                      </p>
                      {item.excerpt && (
                        <p className="mt-1 border-l-2 border-neutral-200 pl-2 font-body text-[11px] italic text-neutral-500">
                          “{item.excerpt}”
                        </p>
                      )}
                    </div>
                    {item.status === "proposed" && (
                      <div className="flex items-center gap-2">
                        <button
                          className="font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600 hover:underline disabled:opacity-40"
                          disabled={busy}
                          onClick={() => {
                            setEditing(item.id);
                            setDraft(JSON.stringify(item.payload, null, 2));
                          }}
                        >
                          <Pencil className="inline size-3" /> Edit
                        </button>
                        <button
                          className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--color-health-normal)] hover:underline disabled:opacity-40"
                          disabled={busy}
                          onClick={() =>
                            post({ action: "accept", itemId: item.id })
                          }
                        >
                          <Check className="inline size-3" /> Accept
                        </button>
                        <button
                          className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--color-health-critical)] hover:underline disabled:opacity-40"
                          disabled={busy}
                          onClick={() =>
                            post({ action: "reject", itemId: item.id })
                          }
                        >
                          <X className="inline size-3" /> Reject
                        </button>
                      </div>
                    )}
                  </div>

                  {editing === item.id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={Math.min(12, draft.split("\n").length + 1)}
                        className="w-full border border-neutral-200 bg-neutral-0 p-2 font-mono text-[11px]"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline-subtle"
                          disabled={busy}
                          onClick={() => {
                            let payload: Record<string, unknown>;
                            try {
                              payload = JSON.parse(draft);
                            } catch {
                              return;
                            }
                            setEditing(null);
                            void post({
                              action: "accept",
                              itemId: item.id,
                              payload,
                            });
                          }}
                        >
                          Save and accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
