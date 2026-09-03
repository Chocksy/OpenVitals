/**
 * The genome catalog with this person's call on every row, as the system's
 * own table: `docs/mockups/v4/blood.html` section 05.
 *
 * Phase 31a item 9. The table used to lead with "rs429358 · rs7412" and
 * "e2/e3" and put a likelihood-ratio sentence under "what it moved", which is
 * laboratory bookkeeping standing in for an answer. Every row now leads with
 * the verdict the catalogue already wrote — "Coeliac disease is essentially
 * excluded: over 99 % of people with it carry one of these two haplotypes." —
 * and the rsids, the genotype and the citation sit behind one disclosure,
 * where somebody who wants them can still have them. Four columns became
 * three: on a phone the citation column was setting the height of every row,
 * so a table of one-line answers scrolled for a screen and a half.
 *
 * A variant shifts a starting point; your numbers decide the rest. When a
 * marker and a variant disagree the marker wins, because it is what your body
 * is doing today — so a row that moved nothing says so in words.
 */
import { genomeVerdict } from "@/lib/genome-catalog";
import type { GenomeResult } from "@/lib/genome";
import { StateWord } from "./ui-kit";

export function GenomeTable({ results }: { results: GenomeResult[] }) {
  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Gene</th>
            <th>What it settles</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const v = genomeVerdict(r);
            return (
              <tr key={v.id}>
                <td className="k">{v.gene}</td>
                <td>
                  <StateWord tone={v.moved ? "border" : "none"} dot={v.moved}>
                    {v.verdict}
                  </StateWord>
                  {v.detail && (
                    <p className="t-meta mt-[var(--s5)]">{v.detail}</p>
                  )}
                  <details className="disclose mt-[var(--s5)]">
                    <summary>What it read, and where it comes from</summary>
                    <div className="inner">
                      <p className="t-meta">
                        {v.rsids.join(" · ")}
                        {v.genotype ? ` → ${v.genotype}` : ""}
                        {v.call ? ` · ${v.call}` : ""}
                      </p>
                      <p className="t-meta mt-[var(--s5)]">{v.source}</p>
                    </div>
                  </details>
                </td>
                <td className="n">{v.grade}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
