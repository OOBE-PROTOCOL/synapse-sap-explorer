/**
 * Typed client for the public Metaplex Agents Registry at api.metaplex.com.
 *
 * Surfaces agents minted through Metaplex Core's AgentIdentity bridge so the
 * SAP explorer can show — for any wallet — how many agents are registered on
 * Metaplex, their canonical metadata URIs, and full EIP-8004 cards.
 *
 * Endpoints discovered (no auth required):
 *   GET /v1/agents?walletAddress=<wallet>&network=<solana-mainnet|solana-devnet>
 *     → { success, data: { agents: RegistryAgent[], total, page, pageSize, totalPages } }
 *   GET /v1/agents/<mintAddress>?network=<...>
 *     → EIP-8004 card (RegistryAgentCard)
 *
 * All fetches: 6s timeout, never throw, return null/[] on failure.
 */

const BASE_URL = 'https://api.metaplex.com/v1';
const DEFAULT_TIMEOUT_MS = 4000;
const PAGE_SIZE = 100; // max we attempt; API default is 24

// In-memory cache + 429 cooldown to protect upstream + UX latency.
const LIST_CACHE_TTL_MS = 5 * 60_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const listCache = new Map<string, { at: number; value: MetaplexRegistryListResponse }>();
let rateLimitedUntil = 0;

/**
 * Shared raw-pages cache. The upstream `walletAddress=` filter is
 * unreliable (returns the global agent set). Rather than letting every
 * wallet lookup walk all 7 pages independently — which causes 429
 * thundering herd in batch contexts — we fetch the global list once and
 * filter client-side for every wallet from a shared snapshot.
 */
const GLOBAL_PAGES_TTL_MS = 5 * 60_000;
const globalPagesCache = new Map<MetaplexRegistryNetwork, {
  at: number;
  agents: MetaplexRegistryAgent[];
}>();
const globalPagesInflight = new Map<MetaplexRegistryNetwork, Promise<MetaplexRegistryAgent[]>>();

async function fetchAllRegistryAgents(
  network: MetaplexRegistryNetwork,
): Promise<MetaplexRegistryAgent[]> {
  const cached = globalPagesCache.get(network);
  if (cached && Date.now() - cached.at < GLOBAL_PAGES_TTL_MS) return cached.agents;
  if (Date.now() < rateLimitedUntil) return cached?.agents ?? [];

  const inflight = globalPagesInflight.get(network);
  if (inflight) return inflight;

  const task = (async () => {
    const all: MetaplexRegistryAgent[] = [];
    const firstUrl = `${BASE_URL}/agents?network=${network}&pageSize=${PAGE_SIZE}&page=1`;
    const firstRes = await timedFetch(firstUrl);
    if (!firstRes) return cached?.agents ?? [];
    if (firstRes.status === 429) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
      return cached?.agents ?? [];
    }
    if (!firstRes.ok) return cached?.agents ?? [];
    let firstJson: {
      success?: boolean;
      data?: { agents?: MetaplexRegistryAgent[]; totalPages?: number };
    };
    try {
      firstJson = await firstRes.json();
    } catch {
      return cached?.agents ?? [];
    }
    if (!firstJson?.success || !Array.isArray(firstJson.data?.agents)) {
      return cached?.agents ?? [];
    }
    all.push(...firstJson.data.agents);
    const totalPages = Math.min(firstJson.data.totalPages ?? 1, 20);

    for (let page = 2; page <= totalPages; page++) {
      if (Date.now() < rateLimitedUntil) break;
      const url = `${BASE_URL}/agents?network=${network}&pageSize=${PAGE_SIZE}&page=${page}`;
      const r = await timedFetch(url);
      if (!r) break;
      if (r.status === 429) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        break;
      }
      if (!r.ok) break;
      try {
        const j = (await r.json()) as { success?: boolean; data?: { agents?: MetaplexRegistryAgent[] } };
        if (j?.success && Array.isArray(j.data?.agents)) all.push(...j.data.agents);
      } catch {
        break;
      }
    }

    globalPagesCache.set(network, { at: Date.now(), agents: all });
    return all;
  })();

  globalPagesInflight.set(network, task);
  try {
    return await task;
  } finally {
    globalPagesInflight.delete(network);
  }
}

export type MetaplexRegistryNetwork = 'solana-mainnet' | 'solana-devnet';

export type MetaplexRegistryAgent = {
  id: string;
  mintAddress: string;
  network: MetaplexRegistryNetwork | string;
  name: string | null;
  description: string | null;
  image: string | null;
  walletAddress: string;
  authority: string | null;
  agentToken: string | null;
  agentMetadataUri: string;
  metadata?: Record<string, unknown> | null;
};

export type MetaplexRegistryListResponse = {
  agents: MetaplexRegistryAgent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  walletAddress: string;
  network: MetaplexRegistryNetwork;
  fetchedAt: number;
  /** True when the upstream filter was unreliable and we filtered client-side. */
  clientSideFiltered: boolean;
  error: string | null;
};

export type MetaplexRegistryAgentCard = {
  type?: string;
  name?: string;
  description?: string;
  image?: string;
  services?: Array<{ name?: string; endpoint?: string; version?: string }>;
  x402Support?: boolean;
  active?: boolean;
  registrations?: Array<{ agentId: string; agentRegistry: string }>;
  supportedTrust?: unknown[];
  address?: string;
  walletAddress?: string;
  authority?: string;
  agentMetadataUri?: string;
  owner?: string;
  tokens?: unknown[];
  [k: string]: unknown;
};

async function timedFetch(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}

/**
 * List Metaplex Registry agents owned by the given wallet.
 *
 * The upstream filter (`walletAddress=`) is treated as advisory: we always
 * filter the returned list client-side to defend against the filter being
 * silently ignored by the API.
 */
export async function listRegistryAgentsForWallet(
  wallet: string,
  network: MetaplexRegistryNetwork = 'solana-mainnet',
): Promise<MetaplexRegistryListResponse> {
  const empty = (error: string | null): MetaplexRegistryListResponse => ({
    agents: [],
    total: 0,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 0,
    walletAddress: wallet,
    network,
    fetchedAt: Date.now(),
    clientSideFiltered: false,
    error,
  });

  const cacheKey = `${network}:${wallet}`;
  const cached = listCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) {
    return cached.value;
  }

  const all = await fetchAllRegistryAgents(network);
  if (all.length === 0) {
    const reason = Date.now() < rateLimitedUntil
      ? 'api.metaplex.com rate-limited (cooldown)'
      : 'Registry snapshot unavailable';
    return empty(reason);
  }

  // Match across walletAddress / authority / owner — Metaplex stores
  // the holder in walletAddress while the SAP-side wallet usually
  // appears as `authority` (or `owner` for some agent types).
  const matches = (a: MetaplexRegistryAgent & { authority?: string | null; owner?: string | null }) =>
    a.walletAddress === wallet || a.authority === wallet || (a as { owner?: string }).owner === wallet;
  let filtered = all.filter(matches);

  // De-duplicate by mintAddress to keep stable counts/UI.
  if (filtered.length > 1) {
    const seen = new Set<string>();
    filtered = filtered.filter((a) => {
      if (seen.has(a.mintAddress)) return false;
      seen.add(a.mintAddress);
      return true;
    });
  }

  const result: MetaplexRegistryListResponse = {
    agents: filtered,
    total: filtered.length,
    page: 1,
    pageSize: PAGE_SIZE,
    totalPages: 1,
    walletAddress: wallet,
    network,
    fetchedAt: Date.now(),
    clientSideFiltered: true,
    error: null,
  };
  listCache.set(cacheKey, { at: Date.now(), value: result });
  return result;
}

/**
 * Fetch the canonical EIP-8004 agent card for a Metaplex Registry mint.
 * Returns null on any failure.
 */
export async function getRegistryAgentCard(
  mintAddress: string,
  network: MetaplexRegistryNetwork = 'solana-mainnet',
): Promise<MetaplexRegistryAgentCard | null> {
  if (Date.now() < rateLimitedUntil) return null;
  const url = `${BASE_URL}/agents/${encodeURIComponent(mintAddress)}?network=${network}`;
  const res = await timedFetch(url);
  if (!res) return null;
  if (res.status === 429) {
    rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    return null;
  }
  if (!res.ok) return null;
  try {
    const json = await res.json();
    if (!json || typeof json !== 'object') return null;
    return json as MetaplexRegistryAgentCard;
  } catch {
    return null;
  }
}

/**
 * Resolve a list of candidate MPL Core mint addresses against the Metaplex
 * Registry by direct per-mint lookup, returning only those that exist in the
 * registry and whose `walletAddress | authority | owner` matches `wallet`.
 *
 * This is the authoritative path: it bypasses the upstream `walletAddress=`
 * filter (which is frequently broken) by querying each mint individually.
 *
 * Returns the same shape as `listRegistryAgentsForWallet` so the route can
 * swap implementations transparently.
 */
export async function getRegistryAgentsByMints(
  wallet: string,
  mintAddresses: string[],
  network: MetaplexRegistryNetwork = 'solana-mainnet',
): Promise<MetaplexRegistryListResponse> {
  const empty: MetaplexRegistryListResponse = {
    agents: [],
    total: 0,
    page: 1,
    pageSize: mintAddresses.length,
    totalPages: 1,
    walletAddress: wallet,
    network,
    fetchedAt: Date.now(),
    clientSideFiltered: true,
    error: null,
  };
  if (mintAddresses.length === 0) return empty;

  const cards = await Promise.all(
    mintAddresses.map(async (mint) => {
      const card = await getRegistryAgentCard(mint, network);
      return card ? { mint, card } : null;
    }),
  );

  const agents: MetaplexRegistryAgent[] = [];
  for (const entry of cards) {
    if (!entry) continue;
    const c = entry.card as Record<string, unknown>;
    const walletAddress = String(c.walletAddress ?? '');
    const authority = c.authority == null ? null : String(c.authority);
    const owner = c.owner == null ? null : String(c.owner);
    // Only keep cards that actually belong to this wallet.
    if (walletAddress !== wallet && authority !== wallet && owner !== wallet) continue;
    agents.push({
      id: String(c.id ?? entry.mint),
      mintAddress: entry.mint,
      network,
      name: (c.name as string | undefined) ?? null,
      description: (c.description as string | undefined) ?? null,
      image: (c.image as string | undefined) ?? null,
      walletAddress,
      authority,
      agentToken: (c.agentToken as string | undefined) ?? null,
      agentMetadataUri:
        (c.agentMetadataUri as string | undefined) ??
        `${BASE_URL}/agents/${entry.mint}?network=${network}`,
      metadata: (c.metadata as Record<string, unknown> | undefined) ?? null,
    });
  }

  return {
    ...empty,
    agents,
    total: agents.length,
  };
}
