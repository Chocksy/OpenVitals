/**
 * The genome catalog with this person's call on every row, as the system's
 * own table: `docs/mockups/v4/blood.html` section 05.
 *
 * Gene, the rsids it needed, the genotype it read, the evidence grade, what
 * the call actually moved, and the named source. Rows the array does not
 * carry read "not in this array"; nothing outside the catalog is ever
 * printed, so a raw file never leaks onto the page.
 *
 * A variant shifts a starting point; your numbers decide the rest. When a
 * marker and a variant disagree the marker wins, because it is what your body
 * is doing today — so a row that moved nothing says so in words.
 */
import { movesAnything } from "@/lib/genome-catalog";
import type { GenomeResult } from "@/lib/genome";
import { StateWord } from "./ui-kit";

export function GenomeTable({ results }: { results: GenomeResult[] }) {
  return (
    <div className="tblwrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Gene</th>
            <th>rsID</th>
            <th>Genotype</th>
            <th>Grade</th>
            <th>What it moved</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {results.map(({ row, result, absent }) => {
            const moved = result ? movesAnything(row, result) : false;
            return (
              <tr key={row.id}>
                <td className="k">{row.gene}</td>
                <td className="n">{row.rsids.join(" · ")}</td>
                <td className="n">
                  {result ? result.call : `not in this array`}
                </td>
                <td className="n">{row.grade}</td>
                <td>
                  {result ? (
                    <StateWord tone={moved ? "border" : "none"} dot={moved}>
                      {moved ? row.effect : `nothing · ${result.meaning}`}
                    </StateWord>
                  ) : (
                    <StateWord tone="none">
                      no call{absent.length ? ` · ${absent.join(", ")} absent` : ""}
                    </StateWord>
                  )}
                </td>
                <td>{row.source}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
