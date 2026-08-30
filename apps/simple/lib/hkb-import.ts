/**
 * The three things every importer needs: a cached download, a CSV reader, and
 * a row in `hkb_import_runs` when it is done.
 *
 * ponytail: Node 22 has `fetch`, `zlib` and streams, so there is no HTTP
 * client, no CSV library and no queue here. Downloads land in
 * `apps/simple/data/hkb/` (gitignored) and are reused until they are deleted,
 * because these files change once a year at most.
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, hkbImportRuns } from "@/db";

/** `apps/simple/data/hkb`, wherever the process was started from. */
export const CACHE = path.resolve(process.cwd(), "data/hkb");

/** The small copies the tests and `--offline` read. */
export const FIXTURES = path.resolve(process.cwd(), "evals/fixtures/hkb");

export const offline = (argv = process.argv) => argv.includes("--offline");

/**
 * The file, from the cache if it is there and from the network if it is not.
 *
 * ncdrisc.org sits behind a front end that answers 421 to about one request in
 * three when the Referer is missing, so both are set and the call is retried.
 */
export async function download(
  url: string,
  name: string,
  referer?: string,
): Promise<string> {
  const file = path.join(CACHE, name);
  const cached = await stat(file).catch(() => null);
  if (cached && cached.size > 0) return file;

  await mkdir(CACHE, { recursive: true });
  let last = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      headers: referer ? { referer } : {},
      redirect: "follow",
    });
    if (res.ok && res.body) {
      await pipeline(
        Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(file),
      );
      return file;
    }
    last = `${res.status} ${res.statusText}`;
    await new Promise((r) => setTimeout(r, attempt * 500));
  }
  throw new Error(`could not download ${url}: ${last}`);
}

/** The cached file, or the fixture of the same name when `--offline`. */
export const source = async (
  url: string,
  name: string,
  referer?: string,
): Promise<string> =>
  offline() ? path.join(FIXTURES, name) : download(url, name, referer);

/**
 * One CSV row at a time, as string arrays. Handles quoted fields with commas
 * in them, which every one of these files has, and nothing else, which none of
 * them need.
 */
export function* parseCsv(text: string): Generator<string[]> {
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') ((field += '"'), i++);
      else quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") (row.push(field), (field = ""));
    else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((f) => f !== "")) yield row;
      ((row = []), (field = ""));
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) yield row;
}

/** The file as rows keyed by its own header line. */
export async function readCsv(
  file: string,
): Promise<{ header: string[]; rows: string[][] }> {
  const text = (await readFile(file, "utf8")).replace(/^﻿/, "");
  const rows = [...parseCsv(text)];
  return { header: rows[0] ?? [], rows: rows.slice(1) };
}

/** Column index by exact header name, or by the first header that starts with it. */
export const columnOf = (header: string[], name: string): number => {
  const exact = header.indexOf(name);
  return exact === -1 ? header.findIndex((h) => h.startsWith(name)) : exact;
};

/** One line in `hkb_import_runs`, so /hkb can say when this last ran. */
export async function recordRun(
  script: string,
  rows: Record<string, number>,
  notes?: string,
) {
  await getDb().insert(hkbImportRuns).values({ script, rows, notes });
}

/** When this importer last ran, optionally only for one condition's line. */
export async function lastRun(
  script: string,
  notesPrefix?: string,
): Promise<Date | null> {
  const [row] = await getDb()
    .select({ ranAt: hkbImportRuns.ranAt })
    .from(hkbImportRuns)
    .where(
      notesPrefix
        ? and(
            eq(hkbImportRuns.script, script),
            sql`${hkbImportRuns.notes} like ${`${notesPrefix}%`}`,
          )
        : eq(hkbImportRuns.script, script),
    )
    .orderBy(desc(hkbImportRuns.ranAt))
    .limit(1);
  return row?.ranAt ?? null;
}

const DAY_MS = 86_400_000;

/** Has this importer not run for `days`? Never having run counts as yes. */
export async function dueAgain(
  script: string,
  days: number,
  notesPrefix?: string,
): Promise<boolean> {
  const at = await lastRun(script, notesPrefix);
  return !at || Date.now() - at.getTime() > days * DAY_MS;
}

/** "1.2s", "3m 04s": how the report prints a duration. */
export const took = (ms: number) =>
  ms < 60_000
    ? `${(ms / 1000).toFixed(1)}s`
    : `${Math.floor(ms / 60_000)}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
