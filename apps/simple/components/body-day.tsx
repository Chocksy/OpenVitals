/**
 * "The day": one row per HealthKit type, per `docs/mockups/v4/body.html`
 * section 01 and the fixed `.markerrow.day` columns in `system.css`.
 *
 * Every number is named, sourced and dated: the name, then the HealthKit
 * identifier, the device that wrote it and the day it is for, then a note
 * that compares it with its own ninety days, then the value right-aligned on
 * the digits with the unit in a fixed slot, then one word.
 *
 * A server component. Nothing here holds state.
 */
import { ChevronDown } from "lucide-react";
import { StateWord, toneOf } from "./ui-kit";
import { formatDate } from "@/lib/utils";
import type { BodyDay, DayRow } from "@/lib/body-data";

const when = (date: string | null, day: string) =>
  date == null ? "never sent" : date === day ? "today" : formatDate(date);

function Row({ row, day }: { row: DayRow; day: string }) {
  return (
    <div className="markerrow day said">
      <div className="nm">
        <b>{row.name}</b>
        <span>
          {row.identifier}
          {row.device ? ` · ${row.device}` : ""} · {when(row.date, day)}
        </span>
      </div>
      <div className="note">{row.note}</div>
      <div className="val">
        {row.value}
        <em>{row.unit}</em>
      </div>
      <div className="wd">
        {row.word && (
          <StateWord tone={toneOf(row.status)}>{row.word}</StateWord>
        )}
      </div>
    </div>
  );
}

export function BodyDayList({ view }: { view: BodyDay }) {
  if (view.rows.length === 0)
    return (
      <div className="empty">
        <span className="k">Nothing from a phone yet</span>
        <p>
          The iOS app sends Apple Health to this account. Until it does, every
          number on this page is one you typed.
        </p>
      </div>
    );

  const sent = view.rows.filter((r) => r.date != null);
  const never = view.rows.filter((r) => r.date == null);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>The day</h3>
        <span className="r">{formatDate(view.day)}</span>
      </div>
      <div className="rowlist">
        {sent.map((row) => (
          <Row key={row.key} row={row} day={view.day} />
        ))}
      </div>
      {never.length > 0 && (
        <details className="disclose">
          <summary>
            {never.length} types the phone has never sent
            <ChevronDown className="ic" aria-hidden="true" />
          </summary>
          <div className="inner">
            <div className="rowlist">
              {never.map((row) => (
                <Row key={row.key} row={row} day={view.day} />
              ))}
            </div>
          </div>
        </details>
      )}
      <p className="cap">
        Every row names the HealthKit type it came from, so a blank one reads as
        a type that never arrived and not as a zero. Sync is the phone's job:
        the iOS app posts whole days, and this page has no button that can pull
        them.
      </p>
    </div>
  );
}

/** The phone summary the tab bar carries: source, last sync, coverage. */
export function SyncLine({ view }: { view: BodyDay }) {
  const at = view.syncedAt?.slice(11, 16);
  return (
    <span className="t-meta">
      {view.source ?? "no phone"}
      {at ? ` · synced ${at}` : ""} · {view.typesSeen} of {view.typesKnown}{" "}
      types have ever sent a value
    </span>
  );
}
