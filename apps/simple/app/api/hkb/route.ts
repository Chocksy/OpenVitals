import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { getDb, hkbConditions, hkbEvidence } from "@/db";

export const maxDuration = 300;

type Body =
  | { action: "evidence"; id: string; status: "accepted" | "rejected" }
  | { action: "in_catalog"; id: string; inCatalog: boolean }
  | { action: "import"; script: "ontology" | "priors" | "prices" };

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
    if (body.action === "evidence") {
      if (!["accepted", "rejected"].includes(body.status))
        return Response.json({ error: "bad status" }, { status: 400 });
      const [row] = await db
        .update(hkbEvidence)
        .set({ status: body.status })
        .where(eq(hkbEvidence.id, body.id))
        .returning();
      if (!row) return Response.json({ error: "no such rule" }, { status: 404 });
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
      return Response.json({ ok: true, id: row.id, inCatalog: row.inCatalog });
    }

    if (body.action === "import") {
      const load = SCRIPTS[body.script];
      if (!load) return Response.json({ error: "no such script" }, { status: 400 });
      const mod = await load();
      const run =
        "importOntology" in mod
          ? mod.importOntology
          : "importPriors" in mod
            ? mod.importPriors
            : mod.importPrices;
      return Response.json({ ok: true, result: await run() });
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[hkb] failed:", e);
    return Response.json({ error }, { status: 500 });
  }

  return Response.json({ error: "no action" }, { status: 400 });
}
