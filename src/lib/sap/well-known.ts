/* ──────────────────────────────────────────────────────────
 * .well-known/agent.json fetcher
 *
 * Fetches the Solana Agent Protocol well-known metadata from
 * an agent's x402 endpoint. Cached in memory for 5 minutes.
 * ────────────────────────────────────────────────────────── */

export interface AgentWellKnown {
  name?: string;
  description?: string;
  logo?: string;
  website?: string;
  twitter?: string;
  github?: string;
  discord?: string;
  telegram?: string;
  docs?: string;
  version?: string;
  capabilities?: string[];
  [key: string]: unknown;
}

const cache = new Map<string, { data: AgentWellKnown | null; ts: number }>();
const TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch /.well-known/agent.json from an agent's endpoint.
 * Returns null if the endpoint is missing, unreachable, or invalid.
 */
export async function fetchAgentWellKnown(
  x402Endpoint: string | null | undefined,
): Promise<AgentWellKnown | null> {
  if (!x402Endpoint) return null;

  let baseUrl: string;
  try {
    const u = new URL(x402Endpoint);
    baseUrl = u.origin;
  } catch {
    return null;
  }

  const cached = cache.get(baseUrl);
  if (cached && Date.now() - cached.ts < TTL) return cached.data;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${baseUrl}/.well-known/agent.json`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      cache.set(baseUrl, { data: null, ts: Date.now() });
      return null;
    }

    const json = (await res.json()) as AgentWellKnown;
    cache.set(baseUrl, { data: json, ts: Date.now() });
    return json;
  } catch {
    cache.set(baseUrl, { data: null, ts: Date.now() });
    return null;
  }
}

/**
 * Batch fetch .well-known for multiple endpoints.
 * Returns a map of endpoint origin → AgentWellKnown.
 */
export async function fetchAgentWellKnownBatch(
  endpoints: (string | null | undefined)[],
): Promise<Map<string, AgentWellKnown>> {
  const unique = [...new Set(endpoints.filter(Boolean) as string[])];
  const results = await Promise.allSettled(
    unique.map(async (ep) => {
      const data = await fetchAgentWellKnown(ep);
      return { ep, data };
    }),
  );

  const map = new Map<string, AgentWellKnown>();
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.data) {
      try {
        const origin = new URL(r.value.ep).origin;
        map.set(origin, r.value.data);
      } catch { /* skip */ }
    }
  }
  return map;
}
