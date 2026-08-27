# Phase 7a: uploads that show their state, re-analyze, delete

User feedback: `/uploads` says "No uploads yet" after the prod copy, and there
is no way to re-analyze, remove or update an upload. Cause: the legacy import
creates readings from `observations` but never creates `uploads` rows, and
the new upload route keeps the PDF only in memory.

Facts from the prod copy: 37 legacy `source_artifacts` (16 Razvan, 21
Ramona), each with `file_name`, `created_at`, `blob_path`
(`file:///data/blobs/uploads/<user>/<hash>/<name>` on the Coolify volume, not
available locally), `raw_text_extracted` (present for 33 of 37; four scanned
PDFs have 2 to 4 chars), and an `import_jobs.status` (`completed` or
`review_needed`). 1187 of 1267 observations carry `source_artifact_id`.

## 1. Data (migration 0004, additive)

`uploads` gains: `rawText text`, `blobPath text`, `sha256 text`, `pages int`,
`readingsCount int` (denormalised, updated after extraction), `source text
default 'upload'` (`upload` | `legacy`). Keep `status`: `pending` |
`extracting` | `done` | `needs_review` | `failed` | `deleted`.

`readings.uploadId` already exists; the legacy import must fill it.

## 2. Legacy import (`lib/import-legacy.ts`)

- Upsert one `uploads` row per `source_artifacts` row, `id` = the legacy
  uuid (so it is idempotent), `source = 'legacy'`, `fileName`, `createdAt`,
  `rawText = raw_text_extracted`, `blobPath`, `sha256 = content_hash`,
  `status` = `done` for `completed`, `needs_review` for `review_needed`,
  `failed` otherwise.
- When inserting a reading from an observation, set `uploadId =
source_artifact_id` when present.
- After the loop, set `readingsCount` per upload.
- `--reset` keeps truncating only `readings` and `metrics`; uploads are
  upserted, never truncated (a re-run must not lose files stored later).

## 3. File storage for new uploads (`app/api/upload/route.ts`)

Write the PDF to `${UPLOAD_DIR ?? "./data/uploads"}/<userId>/<uploadId>.pdf`
(`UPLOAD_DIR` env, add to `.env.example`, `docker-compose.simple.yml` mounts
a named volume `simple_uploads:/app/data/uploads` and sets `UPLOAD_DIR`).
Store `blobPath`, `sha256`, `rawText` (the text `extractFromPdf` produced,
or the OCR text), `pages`, `readingsCount`. Status goes `pending` →
`extracting` → `done` / `failed`, with `error` on failure.

Dedupe: if a `uploads` row for this user has the same `sha256` and status
not `deleted`, return 409 with that upload's id and file name.

## 4. Re-analyze (`POST /api/uploads/[id]/reanalyze`)

Order of sources: the stored file at `blobPath` if it exists locally; else
`rawText` if longer than 200 chars; else 422 "no source to re-analyze; the
original PDF is not on this machine". Refactor `extractFromPdf` so the
"text → readings" step (`extractFromText(text, known)`) is callable on its
own; the PDF path calls it after pdf.js / OCR.

Steps: set status `extracting`; delete this upload's readings (and their
`review_items` whose subject.readingId points at them); run extraction;
insert readings with `uploadId`; update `readingsCount`, `rawText` (if
re-extracted from the file), status `done`; fire `runCurator(userId,
"upload", { uploadId })` fire-and-forget. Return the row. Errors set
`failed` with `error`.

## 5. Delete (`DELETE /api/uploads/[id]`, exists)

Keep: deletes readings for the upload. Add: delete review items pointing at
those readings, remove the stored file if `blobPath` is local, set status
`deleted` instead of removing the row (so the list can show "deleted, 44
readings removed" for a day; hide rows deleted more than 24 h ago).

## 6. `/uploads` page

One row per upload, newest first: file name, date, `source` chip (legacy /
upload), status chip (done green, needs_review amber, extracting accent
with a pulse, failed red with the error in deep view), readings count,
flagged count (readings with `flags` containing `foreign_reading` or
`implausible`, computed in SQL), and the observed date range of its
readings. Row actions: **Readings** (expands an inline list: code, value,
unit, ref range, observed date, flags), **Re-analyze**, **Delete** (confirm
with `window.confirm`). Rows with no local file and short `rawText` show
Re-analyze disabled with the tooltip "original PDF not on this machine".
Keep the CSV export buttons and the Upload button.

Top of page: a one-line summary "37 files · 1198 readings · 4 need review ·
2 without a source".

## 7. Tests

- `import-legacy` gets a unit test for the upload upsert mapping (status
  mapping, id reuse) using a stubbed row, no DB.
- `extractFromText` is tested with the existing extract fixtures.
- Route handlers: one test each for the 409 dedupe and the 422 no-source
  path by calling the exported handler with a mocked db (follow the style of
  existing tests; if there is none for routes, test the pure helpers only and
  say so).

## 8. Verification

```
command pnpm --filter simple typecheck
command pnpm --filter simple test
command pnpm --filter simple db:generate   # CREATE/ALTER ADD only
command pnpm --filter simple db:migrate
command pnpm --filter simple import-legacy  # idempotent: run twice, counts equal
```

Then, logged in as the test user test-newuser@example.com (created in the
parallel task; if it does not exist yet, sign up with password Test1234!):
upload `docs/fixtures/*.pdf` if any exists in the repo, else any small lab
PDF found under `apps/web` test fixtures (`command find . -name "*.pdf" -not
-path "*/node_modules/*" | head`); confirm the row appears with status,
readings count and the file on disk; press Re-analyze and confirm the
readings count is stable and a curator run row appears; press Delete and
confirm status `deleted` and readings gone. Then via SQL confirm the two
production users show 16 and 21 upload rows with readings linked
(`select count(*) from readings where upload_id is not null` ≈ 1187).
Screenshot `/uploads` for the test user to `/tmp/uploads.png`.
