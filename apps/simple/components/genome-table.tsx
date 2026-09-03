/**
 * The genome catalogue with this person's call on every row, as the system's
 * own table: `docs/mockups/v4/genome.html` section 02.
 *
 * Phase 31a item 9 put the verdict first and hid the rsids behind a
 * disclosure. Phase 32a item 3 gives the row the six columns the mockup draws
 * — Verdict, Gene, Your call, Grade, What it moved, Source — because "what it
 * moved" now has somewhere to come from: `genomeVerdicts` keeps the rule that
 * matched instead of throwing it away, so a row can print "Type 2 diabetes
 * ×1.4" rather than a paragraph of likelihood-ratio prose.
 *
 * A server component with no state. The verdicts come in as a prop so the page
 * computes them once; when a caller has not computed them the component does
 * it, so the same table still drops into the upload detail unchanged.
 *
 * A variant shifts a starting point; your numbers decide the rest. When a
 * marker and a variant disagree the marker wins, because it is what your body
 * is doing today — so a row that moved nothing says so in words.
 */
import { genomeVerdict } from "@/lib/genome-catalog";
import {
  genomeVerdicts,
  movedLine,
  type ConditionVerdict,
  type GenomeResult,
} from "@/lib/genome";
import { StateWord, type StateTone } from "./ui-kit";

/** The verdict word, in the mockup's own vocabulary. */
const WORD: Record<ConditionVerdict["direction"], [StateTone, string]> = {
  up: ["border", "moved up"],
  down: ["on", "closed it"],
  none: ["none", "no change"],
};

/** Up beats down beats none: one word for a gene that speaks to several. */
const rank = (d: ConditionVerdict["direction"]) =>
  d === "up" ? 2 : d === "down" ? 1 : 0;

export function GenomeTable({
  results,
  verdicts,
}: {
  results: GenomeResult[];
  /** computed once by the page; recomputed here when a caller has not */
  verdicts?: ConditionVerdict[];
}) {
  const all =
    verdicts ??
    genomeVerdicts(
      results.map((r) => r.row),
      results,
    );

  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Verdict</th>
            <th>Gene</th>
            <th>Your call</th>
            <th>Grade</th>
            <th>What it moved</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const v = genomeVerdict(r);
            const mine = all.filter((c) => c.geneIds.includes(v.id));
            const direction = mine.reduce<ConditionVerdict["direction"]>(
              (best, c) => (rank(c.direction) > rank(best) ? c.direction : best),
              "none",
            );
            const [tone, word] = WORD[direction];
            return (
              <tr key={v.id}>
                <td className="k">
                  <StateWord tone={tone} dot={direction !== "none"}>
                    {word}
                  </StateWord>
                </td>
                <td className="k">{v.gene}</td>
                <td>
                  {v.call ?? "not read"}
                  <details className="disclose">
                    <summary>rsids</summary>
                    <div className="inner">
                      <span className="mono">
                        {v.rsids.join(" · ")}
                        {v.genotype ? ` → ${v.genotype}` : ""}
                      </span>
                      {v.detail && <p className="t-meta">{v.detail}</p>}
                    </div>
                  </details>
                </td>
                <td className="n">{v.grade}</td>
                <td>
                  {mine.length
                    ? mine.map(movedLine).join(" · ")
                    : "nothing · no condition in the catalogue reads this gene"}
                </td>
                <td className="t-meta">{v.source}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
