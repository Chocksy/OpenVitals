import { MARKERS } from "./markers";

/**
 * The draw sheet in Romanian, for a person whose country is RO: what a lab
 * desk at Synevo or Regina Maria reads. Names are keyed by the code the plan
 * page puts on a row (a vector's first code, `lib/recheck.ts`), and come from
 * `MARKERS[].ro`.
 *
 * ponytail: only the yearly core and the common serology are translated; an
 * engine test outside it keeps its English name. Add a `ro` line in
 * `lib/markers.ts` when one shows up on a real sheet.
 */
export const RO: Record<string, string> = Object.fromEntries(
  MARKERS.filter((m) => m.ro).map((m) => [m.code, m.ro!]),
);

const day = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function romanianSheet(
  due: string,
  items: { code: string; name: string; lastDrawn?: string | null }[],
): string {
  return [
    `Analize de sânge · ${day(due)}`,
    "Recoltare dimineața, înainte de ora 10, după 10–12 ore de post (doar apă).",
    "",
    ...items.map(
      (c) =>
        `- ${RO[c.code] ?? c.name}${c.lastDrawn ? ` (ultima recoltare ${day(c.lastDrawn)})` : ""}`,
    ),
  ].join("\n");
}
