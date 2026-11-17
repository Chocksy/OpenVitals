import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A per-request memo for route handlers, where React's `cache` is a no-op.
 *
 * `withRequestMemo` runs a handler with a fresh store; inside it, `memo` hands
 * every caller with the same key the same promise, so `GET /api/today` reads a
 * person's metric rows once instead of once per helper. Outside a store (pages,
 * scripts, tests) `memo` just calls the loader.
 */
const store = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export function withRequestMemo<T>(fn: () => Promise<T>): Promise<T> {
  return store.run(new Map(), fn);
}

export function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const map = store.getStore();
  if (!map) return load();
  let hit = map.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = load();
    map.set(key, hit);
  }
  return hit;
}
