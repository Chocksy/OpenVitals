/**
 * Genome, phase 32a section 3. `docs/mockups/v4/genome.html`.
 *
 * One page, three parts: the answers, the genes behind them, and the rows that
 * are read but can never be a risk. The verdicts are computed once here and
 * handed to both the cards and the table, so the two can never disagree about
 * what moved.
 *
 * A server component with no state. The 390 px layout is the stylesheet's own
 * media queries on `.verdict` and `.markerrow`, so there is no phone markup.
 */
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb, uploads } from "@/db";
import { requireUserId } from "@/lib/auth";
import { genomeVerdicts, loadGenome, movedIds } from "@/lib/genome";
import { genomeCounts, genomeNotes, orderVerdicts } from "@/lib/genome-view";
import { dayLabel, plural } from "@/lib/utils";
import { GenomeTable } from "@/components/genome-table";
import { VerdictCard } from "@/components/verdict-card";
import { StateWord } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

export default async function GenomePage() {
  const userId = await requireUserId();
  const counts = genomeCounts();

  const [file] = await getDb()
    .select({ name: uploads.fileName, at: uploads.createdAt })
    .from(uploads)
    .where(and(eq(uploads.userId, userId), eq(uploads.kind, "genome")))
    .orderBy(desc(uploads.createdAt))
    .limit(1);

  const results = file ? await loadGenome(userId) : [];
  const called = results.filter((r) => r.result != null);
  const verdicts = orderVerdicts(
    genomeVerdicts(
      results.map((r) => r.row),
      results,
    ),
  );
  const moved = movedIds(verdicts);
  const notes = genomeNotes();
  /** the rows the table is about: a row with no condition is a note below it */
  const risks = results.filter((r) => r.row.conditions.length > 0);
  const readAt = file?.at ? file.at.toISOString().slice(0, 10) : null;

  return (
    <div className="stackv gap-[var(--s21)]">
      <div>
        <h1 className="c-title">Genome</h1>
        <p className="t-meta mt-[var(--s3)]">
          What the file settles, what it only nudges, and the genes behind both.
          A variant shifts a starting point; your numbers decide the rest.
        </p>
      </div>

      {!file || !called.length ? (
        <div className="empty">
          <span className="k">No genome</span>
          <b className="text-[length:var(--type-md)] font-normal">
            No genome file yet
          </b>
          <p>
            {plural(counts.genes, "gene")} are worth reading, over{" "}
            {plural(counts.rsids, "variant")}. {counts.conditions} of them point
            at a condition the engine scores; the rest are read as notes and
            never as a risk. A 23andMe or AncestryDNA export is enough.
          </p>
          <Link href="/blood?tab=uploads">Add a genome export</Link>
        </div>
      ) : (
        <>
          <div className="panel">
            <div className="panel-head">
              <h3>What your genome answers</h3>
              <span className="r">
                {file.name ?? "one file"}
                {readAt ? ` · read ${dayLabel(readAt, true)}` : ""}
              </span>
            </div>
            <div className="rowlist">
              {verdicts.map((v) => (
                <VerdictCard key={v.conditionId} v={v} />
              ))}
            </div>
            <p className="cap">
              A card only appears when a gene in the catalogue points at that
              condition; the genome never opens a question on its own. If a
              marker and a variant disagree, the marker wins, because it is what
              your body is doing today.
            </p>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>The genes behind the answers</h3>
              <span className="r">
                {plural(called.length, "gene")} read · {moved.size} moved
                something
              </span>
            </div>
            <GenomeTable results={risks} verdicts={verdicts} />

            <div className="sub">
              <h3>Read, but never a risk</h3>
              <span>
                catalogue rows that point at no condition and land as a note
                instead
              </span>
            </div>
            <div className="rowlist">
              {notes.map((n) => (
                <div className="markerrow said" key={n.id}>
                  <div className="nm">
                    <b>{n.gene}</b>
                    <span>{n.says}</span>
                  </div>
                  <div className="t-meta text-[length:var(--type-xs)]">
                    no condition in the catalogue
                  </div>
                  <div />
                  <div className="wd">
                    <StateWord tone="none">a note</StateWord>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
