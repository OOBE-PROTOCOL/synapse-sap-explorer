/* ──────────────────────────────────────────────────────────
 * Lightweight in-memory cache with TTL + stale-while-revalidate
 * + inflight dedup for SAP API routes.
 *
 * Two variants:
 *   • createRouteCache<T>()       — single-value (no params)
 *   • createKeyedRouteCache<T>()  — keyed by string (e.g. wallet, query)
 *
 * Both prevent parallel "thundering herd" by sharing an
 * in-flight promise when a fetch is already running.
 *
 * Stale-while-revalidate: when data is older than `ttlMs` but
 * younger than `staleTtlMs` (default 10× TTL), the stale data
 * is returned immediately and a background refresh is triggered.
 * ────────────────────────────────────────────────────────── */

interface CacheEntry<T> {
  data: T;
  ts: number;
}

/* ═══════════════════════════════════════════════
 * Single-value cache (for routes without params)
 * ═══════════════════════════════════════════════ */

export function createRouteCache<T>(ttlMs = 60_000, staleTtlMs?: number) {
  const maxStale = staleTtlMs ?? ttlMs * 10;
  let entry: CacheEntry<T> | null = null;
  let inflight: Promise<T> | null = null;

  const doFetch = (fetcher: () => Promise<T>): Promise<T> => {
    if (inflight) return inflight;
    inflight = fetcher()
      .then((data) => { entry = { data, ts: Date.now() }; return data; })
      .finally(() => { inflight = null; });
    return inflight;
  };

  return {
    async get(fetcher: () => Promise<T>): Promise<{ data: T; hit: boolean }> {
      const age = entry ? Date.now() - entry.ts : Infinity;

      // 1. Fresh — return cached
      if (entry && age < ttlMs) {
        return { data: entry.data, hit: true };
      }
      // 2. Stale but within SWR window — return stale, refresh background
      if (entry && age < maxStale) {
        doFetch(fetcher).catch(() => {}); // fire-and-forget
        return { data: entry.data, hit: true };
      }
      // 3. Expired or empty — must wait for fetch
      return { data: await doFetch(fetcher), hit: false };
    },
    invalidate() {
      entry = null;
    },
  };
}

/* ═══════════════════════════════════════════════
 * Keyed cache (for routes with params / dynamic segments)
 * ═══════════════════════════════════════════════ */

const MAX_KEYS = 200;

export function createKeyedRouteCache<T>(ttlMs = 60_000, staleTtlMs?: number) {
  const maxStale = staleTtlMs ?? ttlMs * 10;
  const entries = new Map<string, CacheEntry<T>>();
  const inflights = new Map<string, Promise<T>>();

  function evict() {
    if (entries.size <= MAX_KEYS) return;
    const sorted = [...entries.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const toRemove = sorted.slice(0, entries.size - MAX_KEYS);
    for (const [k] of toRemove) entries.delete(k);
  }

  const doFetch = (key: string, fetcher: () => Promise<T>): Promise<T> => {
    const running = inflights.get(key);
    if (running) return running;
    const p = fetcher()
      .then((data) => { entries.set(key, { data, ts: Date.now() }); evict(); return data; })
      .finally(() => inflights.delete(key));
    inflights.set(key, p);
    return p;
  };

  return {
    async get(key: string, fetcher: () => Promise<T>): Promise<{ data: T; hit: boolean }> {
      const cached = entries.get(key);
      const age = cached ? Date.now() - cached.ts : Infinity;

      // 1. Fresh — return cached
      if (cached && age < ttlMs) {
        return { data: cached.data, hit: true };
      }
      // 2. Stale but within SWR window — return stale, refresh background
      if (cached && age < maxStale) {
        doFetch(key, fetcher).catch(() => {}); // fire-and-forget
        return { data: cached.data, hit: true };
      }
      // 3. Expired or empty — must wait for fetch
      return { data: await doFetch(key, fetcher), hit: false };
    },
    invalidate(key?: string) {
      if (key) entries.delete(key);
      else entries.clear();
    },
  };
}
