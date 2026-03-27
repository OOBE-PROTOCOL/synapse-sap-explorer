/* ──────────────────────────────────────────────
 * Shared in-memory SWR cache for API routes
 *
 * Pattern:
 *   const data = await swr('agents', fetchFromDB, fetchFromRPC, { ttl, swr });
 *
 * 1. Cache HIT (< ttl) → return instantly
 * 2. Stale HIT (< ttl + swr) → return stale, revalidate in background
 * 3. Cache MISS → call primary (DB), fallback to secondary (RPC)
 * ────────────────────────────────────────────── */

type CacheEntry<T> = {
  data: T;
  ts: number;
};

const _store = new Map<string, CacheEntry<any>>();
const _inflight = new Map<string, Promise<any>>();

type SwrOpts = {
  /** Fresh TTL in ms (default 60s) */
  ttl?: number;
  /** Stale-while-revalidate window in ms (default 5min) */
  swr?: number;
};

const DEFAULT_TTL = 60_000;     // 1 minute
const DEFAULT_SWR = 300_000;    // 5 minutes

/**
 * SWR cache with inflight deduplication.
 *
 * @param key   - Unique cache key
 * @param fetch - Async data fetcher (called on miss or revalidation)
 * @param opts  - TTL / SWR config
 */
export async function swr<T>(
  key: string,
  fetchFn: () => Promise<T>,
  opts?: SwrOpts,
): Promise<T> {
  const ttl = opts?.ttl ?? DEFAULT_TTL;
  const swrWindow = opts?.swr ?? DEFAULT_SWR;
  const now = Date.now();
  const entry = _store.get(key) as CacheEntry<T> | undefined;

  // 1. Fresh cache hit
  if (entry && now - entry.ts < ttl) {
    return entry.data;
  }

  // 2. Stale — return immediately, revalidate background
  if (entry && now - entry.ts < ttl + swrWindow) {
    if (!_inflight.has(key)) {
      const revalidate = fetchFn()
        .then((data) => {
          _store.set(key, { data, ts: Date.now() });
          return data;
        })
        .catch((err) => {
          console.warn(`[cache] Background revalidation failed for "${key}":`, err?.message);
          return entry.data; // keep stale
        })
        .finally(() => _inflight.delete(key));
      _inflight.set(key, revalidate);
    }
    return entry.data;
  }

  // 3. Cache miss — fetch with inflight dedup
  if (_inflight.has(key)) {
    return _inflight.get(key)! as Promise<T>;
  }

  const promise = fetchFn()
    .then((data) => {
      _store.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => _inflight.delete(key));

  _inflight.set(key, promise);
  return promise;
}

/** Synchronous peek — returns cached data if present (any age), undefined otherwise */
export function peek<T>(key: string): T | undefined {
  const entry = _store.get(key) as CacheEntry<T> | undefined;
  return entry?.data;
}

/** Invalidate a specific cache key */
export function invalidate(key: string): void {
  _store.delete(key);
}

/** Invalidate all keys matching a prefix */
export function invalidatePrefix(prefix: string): void {
  for (const key of _store.keys()) {
    if (key.startsWith(prefix)) _store.delete(key);
  }
}
