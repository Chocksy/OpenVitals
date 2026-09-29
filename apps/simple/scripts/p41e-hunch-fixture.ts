/**
 * `fixtures/api/hunch.json` as a `cause:` case with its differential. Phase
 * 41E. `scripts/p32a-fixtures.ts` still writes every other fixture from the
 * owner's account; this one comes from the account whose iron cause is open.
 *
 *   pnpm exec tsx --env-file=.env scripts/p41e-hunch-fixture.ts <email> [--overlay file.json | --research] [--fixture-case]
 *
 * It refreshes the person's hunches first (the upload path's own call), so
 * the stored `cause:` row carries its differential, then writes the route's
 * body for it.
 *
 * The overlay path: a local copy with no case research on file lists only
 * the catalog's causes. `--research` runs one case research dry run (41C,
 * `researchCase`, capped at $0.30), saves its `catalogOverlay` next to the
 * fixture as `/tmp/41e/overlay.json`, and scores the differential on the
 * catalog with the overlay laid over it, as `eval:replay` does.
 * `--overlay file.json` re-reads a saved one and calls no model. Nothing is
 * written to the knowledge base either way; the overlay lives in memory.
 *
 * File names in the series are replaced with "lab report, 18 Aug 2026": the
 * uploads' own names carry the person's name.
 *
 * `--fixture-case` is the fallback when research cannot run (Europe PMC down
 * on 2026-09-29): it adds one hand-written third option, `fixture_case_*`,
 * whose share comes out of "other". It is labelled as such in its name and
 * source, so no screen can mistake it for engine output.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { getDb, hunches, pool } from "@/db";
import { users } from "@/db/auth-schema";
import { hunchBody } from "@/lib/api-contract";
import { researchCase, withOverlay } from "@/lib/cases";
import { buildModelInput } from "@/lib/coverage";
import { catalogFor } from "@/lib/hkb";
import {
  differentialLine,
  refreshHunches,
  type Differential,
  type DifferentialOption,
  type HunchOverlay,
} from "@/lib/hunches";
import { scoreHypotheses } from "@/lib/hypotheses";

/** "2026-08-18" as "18 Aug 2026". */
const neutralDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const OUT = path.join(process.cwd(), "fixtures/api/hunch.json");
const SAVED = "/tmp/41e/overlay.json";

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  if (!email || email.startsWith("--"))
    throw new Error(
      "usage: p41e-hunch-fixture.ts <email> [--overlay f | --research] [--fixture-case]",
    );
  const [who] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!who) throw new Error("no such account on this database");

  await refreshHunches(who.id);
  const [h] = await getDb()
    .select()
    .from(hunches)
    .where(and(eq(hunches.userId, who.id), eq(hunches.kind, "cause")));
  if (!h) throw new Error("no cause: hunch for this account");
  const stored = (h.signal as { differential?: Differential }).differential;
  if (stored) console.log(`stored: ${differentialLine(stored)}`);

  let overlay: unknown = null;
  const at = args.indexOf("--overlay");
  if (at !== -1) overlay = JSON.parse(readFileSync(args[at + 1]!, "utf8"));
  else if (args.includes("--research")) {
    const run = await researchCase(who.id, { dryRun: true, budgetUsd: 0.3 });
    console.log(
      `research: ${run.proposals.length} proposals, ${run.accepted} accepted, $${run.costUsd.toFixed(3)}${run.failed ? `, failed: ${run.failed}` : ""}`,
    );
    overlay = run.catalogOverlay ?? null;
    if (overlay) {
      mkdirSync(path.dirname(SAVED), { recursive: true });
      writeFileSync(SAVED, `${JSON.stringify(overlay, null, 2)}\n`);
      console.log(`saved the overlay to ${SAVED}`);
    }
  }

  let differential: Differential | undefined;
  if (overlay) {
    const catalog = withOverlay(await catalogFor(who.id), overlay as never);
    const input = await buildModelInput(who.id);
    const beliefs = Object.fromEntries(
      scoreHypotheses(input, { catalog }).map((r) => [
        r.id,
        {
          p: r.score,
          state: r.state,
          ...(r.mixture
            ? { given: { [r.mixture.given]: r.mixture.posterior } }
            : {}),
        },
      ]),
    );
    const dry = await refreshHunches(who.id, input.today, {
      dryRun: true,
      beliefs,
      overlay: overlay as HunchOverlay,
      catalog,
    });
    differential =
      dry.drafts?.find((d) => d.key === h.key)?.differential ?? undefined;
    if (differential) console.log(`overlay: ${differentialLine(differential)}`);
  }

  if (args.includes("--fixture-case")) {
    const d = differential ?? stored;
    if (!d) throw new Error("no differential to extend");
    // ponytail: fixture only, never written to the database
    const share = 0.12;
    const extra: DifferentialOption = {
      id: "fixture_case_menstrual_loss",
      name: "Menstrual blood loss (fixture case)",
      share,
      p: share,
      belief: share * d.p,
      basis: "belief",
      source:
        "FIXTURE CASE: hand-added third option for the 41E screens, not engine output (grade C)",
      grade: "C",
      origin: "catalog",
      test: { name: "Ferritin after the next cycle", codes: [] },
    };
    const next: Differential = {
      ...d,
      other: d.other - share,
      options: [...d.options, extra].sort((a, b) => b.share - a.share),
    };
    differential = next;
    console.log(`fixture case: ${differentialLine(next)}`);
  }

  const body = await hunchBody(who.id, h.id, { differential });
  // the fixture ships in the repo: a lab PDF's own name carries a person's
  // name, so each draw's file is named by its date instead
  for (const p of body?.series ?? [])
    if (p.file) p.file = `lab report, ${neutralDay(p.date)}`;
  writeFileSync(OUT, `${JSON.stringify(body, null, 2)}\n`);
  console.log(
    `wrote fixtures/api/hunch.json (${h.key}, ${body?.differential?.options.length ?? 0} options, ${args.includes("--fixture-case") ? "fixture-case" : differential ? "overlay" : "stored"} differential)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
