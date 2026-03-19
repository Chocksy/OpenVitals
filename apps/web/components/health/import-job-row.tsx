import Link from "next/link";
import { Trash2 } from "lucide-react";
import { StatusBadge, type HealthStatus } from "./status-badge";

interface ImportJobRowProps {
  id: string;
  fileName: string;
  status: "completed" | "parsing" | "review_needed" | "failed";
  docType: string;
  confidence: string;
  extractions: string;
  time: string;
  onDelete?: () => void;
}

const statusMap: Record<string, { label: string; badge: HealthStatus }> = {
  completed: { label: "Completed", badge: "normal" },
  parsing: { label: "Parsing...", badge: "info" },
  review_needed: { label: "Needs review", badge: "warning" },
  failed: { label: "Failed", badge: "critical" },
};

export function ImportJobRow({
  id,
  fileName,
  status,
  docType,
  confidence,
  extractions,
  time,
  onDelete,
}: ImportJobRowProps) {
  const s = statusMap[status] ?? statusMap.completed!;
  return (
    <Link
      href={`/uploads/${id}`}
      className="group grid grid-cols-[1.8fr_1fr_0.8fr_0.6fr_0.8fr_auto] items-center gap-3 border-b border-neutral-100 px-5 py-3.5 hover:bg-neutral-50 transition-colors cursor-pointer"
    >
      <div>
        <div className="text-sm font-medium text-neutral-900 font-body">
          {fileName}
        </div>
        <div className="mt-0.5 text-[11px] text-neutral-400 font-mono">
          {time}
        </div>
      </div>
      <div className="text-xs text-neutral-600 font-mono">{docType}</div>
      <div>
        <StatusBadge status={s.badge} label={s.label} />
      </div>
      <div className="text-xs text-neutral-500 font-mono">{confidence}</div>
      <div className="text-right text-[13px] font-semibold text-accent-600 font-mono">
        {extractions} records
      </div>
      <div className="w-8 flex justify-center">
        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Link>
  );
}

export function ImportJobHeader() {
  return (
    <div className="grid grid-cols-[1.8fr_1fr_0.8fr_0.6fr_0.8fr_auto] gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-2.5">
      {["File", "Document type", "Status", "Confidence", "Extracted"].map(
        (h) => (
          <div
            key={h}
            className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono"
          >
            {h}
          </div>
        ),
      )}
      <div className="w-8" />
    </div>
  );
}
