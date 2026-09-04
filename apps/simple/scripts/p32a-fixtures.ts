/**
 * One JSON fixture per contract endpoint, written from the owner's local
 * account. Phase 32a section 6.
 *
 * `apps/ios` decodes these files in its unit tests and
 * `lib/api-contract.test.ts` validates them against the shape in the spec, so
 * a change to a body that the phone cannot decode fails on this side first.
 *
 * It calls the same functions the routes call, with the same user id, so the
 * file is the route's own output and not a hand-written sample. Nothing here
 * is a secret: the fixtures carry no email, no session and no user id.
 *
 *   pnpm exec tsx --env-file=.env scripts/p32a-fixtures.ts <email> [bodyEmail] [day]
 *
 * The body account and the day default to the phase-23 HealthKit account and
 * the last day it synced, so re-running with one argument cannot quietly turn
 * the Body fixture into an empty page.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/auth-schema";
import {
  bodyBody,
  genomeBody,
  markersBody,
  planTodayBody,
  todayBody,
  topicBody,
  topicsBody,
} from "@/lib/api-contract";
import type { CaptureExtract } from "@/lib/capture";
import { localDay } from "@/lib/daily";
import { dayTotals, mealRowOf, toApiMeal } from "@/lib/meals";
import type { Meal } from "@/db";
import { listWatch, toApiPaper } from "@/lib/research-watch";
import { topicLabels } from "@/lib/topic-watch";

const OUT = path.join(process.cwd(), "fixtures/api");

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: p32a-fixtures.ts <email>");
  const [owner] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!owner) throw new Error("no such account on this database");

  /**
   * The owner's account has never synced a phone, so `/api/body` off it is an
   * empty day: an honest body, and useless to a client that has to decode a
   * populated row. The Body fixture therefore comes from the local
   * HealthKit account phase 23 left behind, named on the command line, and
   * says so here rather than in a footnote nobody reads.
   */
  const bodyEmail = process.argv[3] ?? "p24f-local@example.com";
  const [bodyOwner] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, bodyEmail));
  if (!bodyOwner) throw new Error("no such body account on this database");

  mkdirSync(OUT, { recursive: true });
  const day = process.argv[4] ?? "2026-08-31";
  const write = (name: string, body: unknown) => {
    const file = path.join(OUT, `${name}.json`);
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
    console.log(`wrote fixtures/api/${name}.json`);
  };

  write("today", await todayBody(owner.id));
  write("body", await bodyBody(bodyOwner.id, day));
  write("plan-today", await planTodayBody(owner.id, day));
  const labels = await topicLabels(owner.id);
  write("research", {
    rows: (await listWatch(owner.id)).map((r) => toApiPaper(r, labels)),
  });
  write("research-topics", await topicsBody(owner.id));
  /* The first topic on the list, whichever it is: a fixture of an empty topic
     page decodes nothing, and phase 35's whole point is the rows. */
  const [first] = (await topicsBody(owner.id)).topics;
  if (first) write("research-topic", await topicBody(owner.id, first.topic));
  write("genome", await genomeBody(owner.id));
  /* Phase 34 section 2. A year is what the Markers tab's own charts draw, and
     it is what the phone's Blood tab asks for. */
  write("markers", await markersBody(owner.id, 365));
  write("meals", mealsFixture(day));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

/**
 * `GET /api/meals`, the one fixture that is not read out of the database.
 *
 * The local `meals` table is empty — the table is new in this phase and no
 * photo has been confirmed since the migration ran — so the body is the second
 * thing the spec allows: the real `CaptureExtract` from `lib/capture.test.ts`
 * put through `mealRowOf` and `toApiMeal`, with a made-up id and no photo. It
 * is the route's own arithmetic over a real reading, and it carries no user id
 * and no email. Regenerate it from a real meal as soon as there is one.
 */
function mealsFixture(day: string) {
  const plate: CaptureExtract = {
    kind: "meal",
    basis: "grilled salmon, white rice, green beans",
    confidence: 0.7,
    items: [
      { name: "grilled salmon", portion: "150 g", kcal: 310, proteinG: 34, carbsG: 0, fatG: 19, confidence: 0.7 },
      { name: "white rice", portion: "200 g cooked", kcal: 260, proteinG: 5, carbsG: 57, fatG: 1, confidence: 0.6 },
      { name: "green beans", portion: "100 g", kcal: 35, proteinG: 2, carbsG: 7, fatG: 0, confidence: 0.8 },
    ],
  };
  const row = mealRowOf(plate, { day, time: "13:05", photoKey: null })!;
  const meal = toApiMeal({
    ...row,
    id: "0f6c1b3a-7d24-4a1e-9c58-2b8f5d0e4a71",
    userId: "",
    createdAt: new Date(`${day}T13:05:00Z`),
  } as Meal);
  return { day, meals: [meal], totals: dayTotals([meal]) };
}
