import Link from "next/link";
import { ListChecks } from "lucide-react";
import { requireUserId } from "@/lib/auth";
import { bootstrapProtocol, getProtocol } from "@/lib/daily-data";
import { getMetricNames } from "@/lib/data";
import {
  AddProtocolItem,
  AdherenceStrip,
  ArchiveButton,
} from "@/components/tracker";

export const dynamic = "force-dynamic";

export default async function ProtocolPage() {
  const userId = await requireUserId();
  await bootstrapProtocol(userId);
  const [items, names] = await Promise.all([
    getProtocol(userId),
    getMetricNames(),
  ]);

  const active = items.filter((i) => i.active);
  const archived = items.filter((i) => !i.active);
  const nameOf = (code: string) => names.get(code) ?? code.replace(/_/g, " ");

  const row = (item: (typeof items)[number]) => (
    <div key={item.id} className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[14px] font-medium">{item.text}</p>
          {item.why && (
            <p className="mt-1 font-body text-[12px] text-neutral-500">
              {item.why}
            </p>
          )}
        </div>
        <ArchiveButton id={item.id} active={item.active} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
          {item.cadence}
        </span>
        {item.metricCodes.map((code) => (
          <Link
            key={code}
            href={`/blood/m/${code}`}
            className="inline-flex items-center border border-neutral-200 bg-neutral-50 px-2 py-1 font-body text-[11px] font-medium text-neutral-700 hover:border-accent-300"
          >
            {nameOf(code)}
          </Link>
        ))}
        <span className="ml-auto">
          <AdherenceStrip pct={item.adherence30} values={item.strip30} />
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-medium tracking-[-0.03em]">
            Protocol
          </h1>
          <p className="mt-1 font-body text-[13px] text-neutral-500">
            What you have decided to do. Tick it off every day on{" "}
            <Link href="/today" className="underline">
              Today
            </Link>
            .
          </p>
        </div>
        <AddProtocolItem
          metricNames={[...names].map(([code, name]) => ({ code, name }))}
        />
      </div>

      {active.length === 0 ? (
        <div className="card border-dashed p-10 text-center">
          <ListChecks className="mx-auto mb-3 size-8 text-neutral-300" />
          <p className="font-display text-[15px] font-medium">
            Nothing in your protocol yet
          </p>
          <p className="mt-1 font-body text-[13px] text-neutral-500">
            Generate a lifestyle plan on{" "}
            <Link href="/insights" className="underline">
              Insights
            </Link>{" "}
            and adopt the items you want to keep, or add one by hand.
          </p>
        </div>
      ) : (
        <div className="space-y-2">{active.map(row)}</div>
      )}

      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
            Archived ({archived.length})
          </summary>
          <div className="mt-2 space-y-2 opacity-60">{archived.map(row)}</div>
        </details>
      )}
    </div>
  );
}
