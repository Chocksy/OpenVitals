"use client";

/**
 * The three buttons on /hkb that write: accept or reject a proposed rule, take
 * a condition in or out of the catalog, and run an importer.
 *
 * Everything else on that page is server-rendered. These post to /api/hkb and
 * refresh, so there is no client-side copy of the tables to keep in step.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, X } from "lucide-react";
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

export function EvidenceButtons({ id }: { id: string }) {
  const { post, busy, error } = useWrite();
  return (
    <span className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          void post({ action: "evidence", id, status: "accepted" })
        }
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Check className="size-3.5" />
        )}
        Accept
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          void post({ action: "evidence", id, status: "rejected" })
        }
      >
        <X className="size-3.5" /> Reject
      </Button>
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
