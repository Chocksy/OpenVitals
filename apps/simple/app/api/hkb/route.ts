import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { getDb, hkbConditions, hkbEvidence } from "@/db";
import { recordRevision } from "@/lib/hkb";
import { extractClaim, fileClaim } from "@/lib/trends";

export const maxDuration = 300;

type Body =
  | {
      action: "override";
      id: string;
      lrPos?: number;
      lrNeg?: number | null;
      grade?: string;
      /** Take the rule out of the engine, or put it back in. */
      exclude?: boolean;
      note?: string;
    }
  | { action: "in_catalog"; id: string; inCatalog: boolean }
  | { action: "import"; script: "ontology" | "priors" | "prices" }
  | { action: "research"; conditionId: string; maxPapers?: number }
  /** The trends inbox: free text about something popular, filed as a claim. */
  | { action: "claim"; text: string; maxPapers?: number };

/** The importers, named statically so the bundler can see them. */
const SCRIPTS = {
  ontology: () => import("@/scripts/hkb-import-ontology"),
  priors: () => import("@/scripts/hkb-import-priors"),
  prices: () => import("@/scripts/hkb-import-prices"),
};

/** Everything /hkb writes. Admin only, and it never touches a user's data. */
export async function POST(request: Request) {
  if (!(await isAdmin()))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as Body;
  const db = getDb();

  try {
    if (body.action === "override") {
      const set: Record<string, unknown> = {
        reviewedAt: new Date(),
        reviewNote: body.note?.trim()
          ? `override: ${body.note.trim()}`
          : "override on /hkb",
        // a human looked, so the policy's own flag comes off
        needsLook: false,
      };
      if (body.lrPos != null) {
        const lrPos = Number(body.lrPos);
        if (!Number.isFinite(lrPos) || lrPos <= 0)
          return Response.json({ error: "bad LR+" }, { status: 400 });
        set.lrPos = lrPos;
      }
      if (body.lrNeg !== undefined) {
        const lrNeg = body.lrNeg == null ? null : Number(body.lrNeg);
        if (lrNeg != null && (!Number.isFinite(lrNeg) || lrNeg <= 0))
          return Response.json({ error: "bad LR-" }, { status: 400 });
        set.lrNeg = lrNeg;
      }
      if (body.grade) {
        if (!["A", "B", "C", "D", "E"].includes(body.grade))
          return Response.json({ error: "bad grade" }, { status: 400 });
        set.grade = body.grade;
      }
      if (body.exclude != null)
        set.status = body.exclude ? "rejected" : "accepted";

      const [row] = await db
        .update(hkbEvidence)
        .set(set)
        .where(eq(hkbEvidence.id, body.id))
        .returning();
      if (!row)
        return Response.json({ error: "no such rule" }, { status: 404 });
      await recordRevision(
        `override on /hkb: ${row.conditionId} rule ${row.id} is now ` +
          `LR+ ${row.lrPos}${row.lrNeg == null ? "" : ` / LR- ${row.lrNeg}`}, grade ${row.grade}, ` +
          `${row.status}${body.note?.trim() ? ` — ${body.note.trim()}` : ""}`,
      );
      return Response.json({ ok: true, id: row.id, status: row.status });
    }

    if (body.action === "in_catalog") {
      const [row] = await db
        .update(hkbConditions)
        .set({ inCatalog: body.inCatalog })
        .where(eq(hkbConditions.id, body.id))
        .returning();
      if (!row)
        return Response.json({ error: "no such condition" }, { status: 404 });
      await recordRevision(
        `${row.id} (${row.name}) taken ${row.inCatalog ? "into" : "out of"} the catalog on /hkb`,
      );
      return Response.json({ ok: true, id: row.id, inCatalog: row.inCatalog });
    }

    if (body.action === "import") {
      const load = SCRIPTS[body.script];
      if (!load)
        return Response.json({ error: "no such script" }, { status: 400 });
      const mod = await load();
      const run =
        "importOntology" in mod
          ? mod.importOntology
          : "importPriors" in mod
            ? mod.importPriors
            : mod.importPrices;
      return Response.json({ ok: true, result: await run() });
    }

    if (body.action === "claim") {
      const text = String(body.text ?? "").trim();
      if (text.length < 4)
        return Response.json(
          { error: "write the claim first" },
          { status: 400 },
        );
      const claim = await extractClaim(text);
      if (!claim)
        return Response.json({
          ok: true,
          filed: null,
          note: "that is not a claim about the world, so nothing was filed",
        });
      const filed = await fileClaim(claim, {
        maxPapers: body.maxPapers ?? 3,
      });
      await recordRevision(
        `claim filed from /hkb: "${claim.intervention}" → ` +
          `${claim.markers.join(", ") || "no marker we track"} as grade E horizon ` +
          `under ${filed.conditionId}${filed.scienceWritten ? `, ${filed.scienceWritten} graded rows from the search` : ""}`,
      );
      return Response.json({ ok: true, filed });
    }

    if (body.action === "research") {
      const { researchRun } = await import("@/scripts/hkb-research");
      const { rows, tokens } = await researchRun({
        conditionIds: [body.conditionId],
        maxPapers: body.maxPapers ?? 10,
      });
      const [row] = rows;
      return Response.json({
        ok: true,
        result: row
          ? {
              hits: row.hits,
              verified: row.verified,
              proposed: row.proposed,
              new: row.written,
              tokens,
            }
          : { hits: 0, verified: 0, proposed: 0, new: 0, tokens },
      });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[hkb] failed:", e);
    return Response.json({ error }, { status: 500 });
  }

  return Response.json({ error: "no action" }, { status: 400 });
}
