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
  if (Date.now() < rateLimitedUntil) {
    return empty('api.metaplex.com rate-limited (cooldown)');
  }

  const url = `${BASE_URL}/agents?walletAddress=${encodeURIComponent(wallet)}&network=${network}&pageSize=${PAGE_SIZE}`;
  const res = await timedFetch(url);
  if (!res) return empty('Network error contacting api.metaplex.com');
  if (res.status === 429) {
    rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    return empty('api.metaplex.com responded 429');
  }
  if (!res.ok) return empty(`api.metaplex.com responded ${res.status}`);

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return empty('Invalid JSON from api.metaplex.com');
  }

  const body = parsed as {
    success?: boolean;
    data?: {
      agents?: unknown[];
      total?: number;
      page?: number;
      pageSize?: number;
      totalPages?: number;
    };
  };
  if (!body?.success || !Array.isArray(body.data?.agents)) {
    return empty('Unexpected response shape');
  }

  const upstream = body.data.agents as MetaplexRegistryAgent[];
  // Defensive client-side filter. The upstream `walletAddress=` filter is
  // unreliable (frequently ignored by api.metaplex.com — returns the whole
  // global page). We accept any of `walletAddress`, `authority`, `owner`
  // matching, because Metaplex stores the *holder* in walletAddress while
  // the SAP-side wallet usually appears as `authority` / `owner`.
  const matches = (a: MetaplexRegistryAgent & { authority?: string | null; owner?: string | null }) =>
    a.walletAddress === wallet || a.authority === wallet || (a as { owner?: string }).owner === wallet;
  let filtered = upstream.filter(matches);
  const clientSideFiltered = filtered.length !== upstream.length;

  // The upstream `walletAddress=` filter is unreliable, so when page 1 yields
  // no matches we walk subsequent pages up to MAX_PAGE_SCAN. We bail
  // immediately on 429 to avoid amplifying rate-limit pressure.
  const totalPages = body.data.totalPages ?? 1;
  const MAX_PAGE_SCAN = 10;
  if (filtered.length === 0 && totalPages > 1) {
    const pagesToScan = Math.min(totalPages, MAX_PAGE_SCAN);
    for (let page = 2; page <= pagesToScan; page++) {
      if (Date.now() < rateLimitedUntil) break;
      const pageUrl = `${BASE_URL}/agents?walletAddress=${encodeURIComponent(wallet)}&network=${network}&pageSize=${PAGE_SIZE}&page=${page}`;
      const pageRes = await timedFetch(pageUrl);
      if (!pageRes) break;
      if (pageRes.status === 429) {
        rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        break;
      }
      if (!pageRes.ok) break;
      try {
        const pageJson = (await pageRes.json()) as {
          success?: boolean;
          data?: { agents?: unknown[] };
        };
        if (pageJson?.success && Array.isArray(pageJson.data?.agents)) {
          const pageAgents = (pageJson.data.agents as MetaplexRegistryAgent[]).filter(matches);
          if (pageAgents.length > 0) {
            filtered = filtered.concat(pageAgents);
            break; // Match found — stop scanning.
          }
        }
      } catch {
        // Best effort only.
      }
    }
  }

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
    page: body.data.page ?? 1,
    pageSize: body.data.pageSize ?? PAGE_SIZE,
    totalPages,
    walletAddress: wallet,
    network,
    fetchedAt: Date.now(),
    clientSideFiltered,
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
