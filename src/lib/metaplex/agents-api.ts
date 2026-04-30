/* ──────────────────────────────────────────────
 * Metaplex Agents REST API helper.
 *
 * Mirrors https://api.metaplex.com/v1/agents/{address}. A Metaplex Agent
 * is an MPL Core asset (the `address` is the Core asset pubkey) that
 * Metaplex's hosted indexer enriches with `agentToken` (the fungible
 * token coordinated by the agent), `owner` (controlling SAP/wallet
 * pubkey), `walletAddress` (the deployer wallet — separate from the
 * SAP agent wallet for security reasons) and `authority`.
 *
 * Why we need this: Metaplex Genesis launches store the *deployer*
 * wallet in `GenesisAccount.authority`, not the SAP agent wallet that
 * actually owns the launch. Our existing on-chain GPA-by-authority
 * discovery therefore misses every Metaplex-Agent-coordinated launch.
 * The Metaplex Agents API closes that gap by linking SAP wallet →
 * Metaplex Agent → agentToken in O(1) per asset.
 *
 * The public endpoint has no real `?owner=` filter (it accepts the
 * param but ignores it server-side and returns the full 700+ page).
 * Caller must therefore enumerate the wallet's MPL Core assets first
 * (we do via DAS in `metaplex-link`) and probe each address here.
 * ────────────────────────────────────────────── */

const METAPLEX_API_BASE = 'https://api.metaplex.com';

/** Subset we actually consume — the API returns more fields. */
export type MetaplexAgentRecord = {
  /** MPL Core asset address (the Metaplex Agent NFT). */
  address: string;
  name: string | null;
  description: string | null;
  /** Owner SAP/wallet that controls the agent. */
  owner: string | null;
  /** Deployer wallet that actually signs token-launch txs. Distinct
   *  from `owner` for security separation. */
  walletAddress: string | null;
  authority: string | null;
  agentMetadataUri: string | null;
  /** Pinned fungible token launched by this agent (mint pubkey). */
  agentToken: string | null;
  agentTokenInfo: {
    address: string;
    name?: string | null;
    symbol?: string | null;
    image?: string | null;
    description?: string | null;
  } | null;
  /** All tokens associated to the agent. Includes `agentToken` plus
   *  any sibling launches (rare). */
  tokens: Array<{
    address: string;
    name?: string | null;
    symbol?: string | null;
    image?: string | null;
    description?: string | null;
  }>;
};

type MetaplexAgentApiResponse =
  | ({ success: true } & MetaplexAgentRecord)
  | { success: false; error: string };

/**
 * Fetch a single Metaplex Agent record by MPL Core asset address.
 * Returns null on 404, network failure, or `success: false`. Never
 * throws — callers loop over many candidates and a transient miss
 * must not poison the whole agent-token lookup.
 */
export async function fetchMetaplexAgent(
  address: string,
  network: 'solana-mainnet' | 'solana-devnet' = 'solana-mainnet',
): Promise<MetaplexAgentRecord | null> {
  const url = `${METAPLEX_API_BASE}/v1/agents/${encodeURIComponent(address)}?network=${network}`;
  let res: Response;
  try {
    res = await fetch(url, {
      // Short timeout — this is on the hot path of the agent page.
      signal: AbortSignal.timeout(4_000),
      // Public CDN; cache hits are fine.
      next: { revalidate: 60 },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json: MetaplexAgentApiResponse;
  try {
    json = (await res.json()) as MetaplexAgentApiResponse;
  } catch {
    return null;
  }
  if (!json || !('success' in json) || json.success !== true) return null;
  // Strip the success flag so the rest of the codebase works with the
  // pure record shape.
  const { success: _success, ...record } = json;
  void _success;
  return record;
}

/**
 * Resolve every Metaplex Agent owned by `wallet` from a list of MPL
 * Core asset candidates. Filters out records whose `owner` does not
 * match — Metaplex's API has no server-side owner filter so we must
 * verify client-side. Bounded parallel (default 8) to avoid hammering
 * the public endpoint.
 */
export async function fetchMetaplexAgentsByOwner(
  wallet: string,
  candidateAssetAddresses: string[],
  options: { concurrency?: number; network?: 'solana-mainnet' | 'solana-devnet' } = {},
): Promise<MetaplexAgentRecord[]> {
  const concurrency = Math.max(1, options.concurrency ?? 8);
  const network = options.network ?? 'solana-mainnet';
  const out: MetaplexAgentRecord[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, candidateAssetAddresses.length) }, async () => {
    while (cursor < candidateAssetAddresses.length) {
      const idx = cursor++;
      const addr = candidateAssetAddresses[idx];
      if (!addr) continue;
      const record = await fetchMetaplexAgent(addr, network);
      if (record && record.owner === wallet) out.push(record);
    }
  });
  await Promise.all(workers);
  return out;
}
