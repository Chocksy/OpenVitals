# Why the `simple` dev server eats RAM, and how to rebuild it lighter

Measured on 2026-10-05 against a dev server that had been up for 3.6 days.

## What the 3.2 GB was

| Part | Size | Why |
|---|---|---|
| Turbopack (Rust, outside the JS heap) | ~2.5 GB | `next dev` keeps every compiled module in memory. It evicts only when it reaches `turbopackMemoryLimit`, which was 4 GB. Now 1.5 GB. |
| JS heap | ~690 MB | Mostly the Monarch knowledge graph (255k edges) in `globalThis.__kgGraph`, plus Next and React. |
| `.next/dev` on disk | 7 GB | Turbopack's persistent cache. Disk only, safe to delete. |

Small apps sit under 500 MB because they compile a few thousand lines and hold no data in memory. This one is different:

- **It's big.** About 97k lines of TypeScript in `lib/` and `scripts/`, 18 pages and 60 API routes. Turbopack compiles and caches all of it, once per layer (RSC, SSR, route handlers).
- **It holds a database in memory.** `lib/kg.ts` loads every `kg_nodes` and `kg_edges` row into one object. The cache lives for 60 s, so the whole graph gets re-read from Postgres every minute while the app is in use.
- **The web server is also the batch worker.** `instrumentation-node.ts` runs the curator, plan reports, weekly reviews, literature research, the Monarch import and the yearly priors and prices imports inside the same process. Those jobs pull in large modules (`scripts/hkb-*`, `kg-import-monarch`) and big inputs (`data/hkb` is 220 MB: `mondo.json` 103 MB, `phenotype.hpoa` 34 MB) that the UI never needs.
- **Dev mode multiplies all of it.** HMR keeps old module copies around until GC. Before commit `61414e7` every copy held its own graph, and the server reached 7 GB.

## How the server got left running

Nothing in `Procfile.dev` starts `simple`. It was a `next dev -p 3001` started by hand or by an agent session, and nobody stopped it. Start it only when you need it:

```bash
pnpm --filter simple dev      # from the repo root, http://localhost:3001
# Ctrl+C when done
```

## Rebuild plan, cheapest wins first

1. **Query the graph, don't hold it.** Replace `loadGraph()` with SQL that fetches only the edges a request touches (by condition id, phenotype id, or a recursive CTE for two hops). Postgres already has the tables. This drops hundreds of MB and ends the reload every 60 s. `kg.ts` already names this as the upgrade path.
2. **Move the jobs out of the web process.** Turn `instrumentation-node.ts` into a `worker` script (`tsx scripts/worker.ts`) run by cron or a Coolify scheduled task. The web server then never imports the importers, the research pipeline or `data/hkb`.
3. **Keep import data out of the app tree.** `data/hkb` belongs next to the import scripts (or in object storage), so nothing in `app/` can reach it by accident.
4. **Split `lib/`.** Huge files like `hkb-interventions.ts`, `hkb-catalog.ts` and `hypotheses.ts` end up in every route that imports them. Smaller modules with narrow imports mean less for Turbopack to compile and cache.
5. **Keep the Turbopack cap low.** 1.5 GB in `next.config.ts`. Raise it only if hot reload gets noticeably slow.
6. **Check the result.** A production build (`next build && next start`) of the same app should idle well under 500 MB once steps 1 and 2 are done. If it doesn't, take a heap snapshot (`node --inspect`, then Chrome DevTools > Memory) and look at the biggest retainers.

## Measuring it again

```bash
footprint <pid>                     # real memory, includes swapped pages
vmmap --summary <pid>               # big 128 MB "IOAccelerator" chunks were most likely Turbopack's allocator
kill -USR1 <pid>                    # opens the inspector on 127.0.0.1:9229
# then in DevTools: process.memoryUsage()  -> heapUsed is the JS side
```
