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
      <p className="never">Nothing was read out of this document.</p>
    );

  return (
    <div className="space-y-5">
      {error && (
        <p className="t-meta text-[var(--bad)]">{error}</p>
      )}
      {kinds.map((kind) => {
        const mine = items.filter((i) => i.kind === kind);
        const open = mine.filter((i) => i.status === "proposed");
        return (
          <section key={kind} className="space-y-2">
            <div className="rowh">
              <h2 className="src">
                {kind} ({mine.length})
              </h2>
              {open.length > 0 && (
                <>
                  <Button
                    size="sm"
                    job="quiet"
                    disabled={busy}
                    onClick={() => post({ action: "accept", kind })}
                  >
                    Accept all {open.length}
                  </Button>
                  <Button
                    size="sm"
                    job="text"
                    disabled={busy}
                    onClick={() => post({ action: "reject", kind })}
                  >
                    Reject all
                  </Button>
                </>
              )}
              <span className="cap m-0">{KIND_NOTE[kind]}</span>
            </div>

            <div className="rowlist">
              {mine.map((item) => (
                <div key={item.id}>
                  <div className="rowh items-start">
                    <div className="min-w-0 flex-1">
                      <p className="t-body">{title(item)}</p>
                      <p className="src">
                        {[item.status, ...tags(item)].join(" · ")}
                      </p>
                      {item.excerpt && (
                        <p className="disclose">
                          <span className="inner block italic">
                            “{item.excerpt}”
                          </span>
                        </p>
                      )}
                    </div>
                    {item.status === "proposed" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            post({ action: "accept", itemId: item.id })
                          }
                        >
                          <Check className="ic" /> Accept
                        </Button>
                        <Button
                          size="sm"
                          job="quiet"
                          disabled={busy}
                          onClick={() => {
                            setEditing(item.id);
                            setDraft(JSON.stringify(item.payload, null, 2));
                          }}
                        >
                          <Pencil className="ic" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          job="text"
                          className="text-[var(--bad)]"
                          disabled={busy}
                          onClick={() =>
                            post({ action: "reject", itemId: item.id })
                          }
                        >
                          <X className="ic" /> Reject
                        </Button>
                      </div>
                    )}
                  </div>

                  {editing === item.id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={Math.min(12, draft.split("\n").length + 1)}
                        className="ta font-mono text-[length:var(--type-xs)]"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          job="quiet"
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
                          job="text"
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
