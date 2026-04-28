/* ──────────────────────────────────────────────────────────
 * useSap — Client-side hooks to fetch SAP data from API routes
 *
 * Powered by TanStack Query via useSapQuery for caching,
 * deduplication, retry, and window-focus refetch.
 * ────────────────────────────────────────────────────────── */

'use client';

import { useSapQuery } from '~/hooks/use-sap-query';
import type {
  SerializedDiscoveredAgent,
  SerializedAgentProfile,
  SerializedNetworkOverview,
  SerializedDiscoveredTool,
  SerializedEscrow,
  SerializedAttestation,
  SerializedFeedback,
  GraphData,
} from '~/types/sap';
import type {
  SapEvent,
  ToolEvent,
  InscribedSchema,
  ReceiptBatch,
  Dispute,
  AgentRevenueResponse,
  X402PaymentRow,
  X402Stats,
  SearchResult,
  ApiEscrowEvent,
} from '~/types/api';

/* ── Generic fetcher — delegates to TanStack Query ──── */

type FetchState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
};

type FetchOptions = {
  /** Auto-poll interval in ms. 0 = no polling (default). */
  pollInterval?: number;
  /** (kept for API compat — TanStack handles stale data automatically) */
  keepStale?: boolean;
};

/** Derive a stable query key from the URL. */
function urlToKey(url: string): readonly unknown[] {
  const u = new URL(url, 'http://localhost');
  const parts = u.pathname.split('/').filter(Boolean);
  const params = Object.fromEntries(u.searchParams.entries());
  return Object.keys(params).length > 0 ? [...parts, params] : parts;
}

function useFetch<T>(url: string | null, opts?: FetchOptions): FetchState<T> {
  return useSapQuery<T>({
    queryKey: url ? urlToKey(url) : ['__disabled'],
    url,
    pollInterval: opts?.pollInterval,
  });
}

/* ── Re-export types for consumers importing from hooks ── */

export type {
  SapEvent,
  ToolEvent,
  InscribedSchema,
  ReceiptBatch,
  Dispute,
  AgentRevenueSeriesEntry,
  AgentRevenueResponse,
  X402PaymentRow,
  X402Stats,
  SearchResult,
} from '~/types/api';

/* ── Typed hooks ──────────────────────────────────────── */

/** Response from /api/sap/agents */
type AgentsResponse = {
  agents: SerializedDiscoveredAgent[];
  total: number;
};

/** Response from /api/sap/agents/[wallet] */
type AgentProfileResponse = {
  profile: SerializedAgentProfile;
};

/** Response from /api/sap/tools */
type ToolsResponse = {
  tools: SerializedDiscoveredTool[];
  categories: Array<{ category: string; categoryNum: number; toolCount: number }>;
  total: number;
};

/** Default polling intervals (ms). 0 = off. */
const POLL = {
  // Lowered from 120s \u2192 30s so the UI re-renders soon after the indexer
  // invalidates the server SWR cache on a new tx / agent registration.
  agents: 30_000,
  transactions: 10_000,
  escrows: 15_000,
  vaults: 30_000,
  vaultDetail: 15_000,
  metrics: 30_000,
  events: 10_000,
} as const;

export function useAgents(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useFetch<AgentsResponse>(`/api/sap/agents${qs}`, { pollInterval: POLL.agents, keepStale: true });
}

export type { EnrichedAgentsResponse, EnrichedAgent, TokenBalance, AgentBalanceSummary, AgentMetadata, AgentStakeSummary, AgentMetaplexBadge } from '~/app/api/sap/agents/enriched/route';

type EnrichedAgentsRes = import('~/app/api/sap/agents/enriched/route').EnrichedAgentsResponse;

export function useEnrichedAgents() {
  return useFetch<EnrichedAgentsRes>('/api/sap/agents/enriched', { pollInterval: POLL.agents, keepStale: true });
}

export function useAgent(wallet: string | null) {
  const url = wallet ? `/api/sap/agents/${wallet}` : null;
  return useFetch<AgentProfileResponse>(url);
}

export function useAgentStaking(agentPda: string | null) {
  const url = agentPda ? `/api/sap/agents/${agentPda}/staking` : null;
  return useFetch<import('~/app/api/sap/agents/enriched/route').AgentStakeSummary | null>(url);
}

export type { WalletBalancesResponse, TokenBalance as WalletTokenBalance } from '~/app/api/sap/agents/[wallet]/balances/route';

type WalletBalancesRes = import('~/app/api/sap/agents/[wallet]/balances/route').WalletBalancesResponse;

export function useAgentBalances(wallet: string | null) {
  const url = wallet ? `/api/sap/agents/${wallet}/balances` : null;
  return useFetch<WalletBalancesRes>(url, { pollInterval: 30_000, keepStale: true });
}

/* ── Metaplex Core link (SDK 0.9.0 — AgentIdentity + EIP-8004) ── */

export type AgentMetaplexLink = {
  sapAgentPda: string;
  asset: string | null;
  expectedUrl: string;
  linked: boolean;
  agentIdentityUri: string | null;
  registration: {
    schema?: string;
    synapseAgent?: string;
    owner?: string;
    name?: string;
    description?: string;
    capabilities?: string[];
    executives?: Array<{ address: string; permissions?: number; expiresAt?: number | null }>;
    services?: Array<{ id: string; type: string; url?: string }>;
    issuedAt?: number;
    version?: string;
  } | null;
  error: string | null;
};

/**
 * Resolve the SAP × Metaplex Core link for an agent wallet.
 * Returns `linked: false` and `asset: null` when no MPL Core asset
 * carries an AgentIdentity URI pointing at this SAP agent's PDA.
 */
export function useAgentMetaplex(wallet: string | null) {
  const url = wallet ? `/api/sap/agents/${wallet}/metaplex` : null;
  return useFetch<AgentMetaplexLink>(url, { keepStale: true });
}

/* ── Canonical EIP-8004 hybrid card ──────────────────────
 * Served at /agents/<sapPda>/eip-8004.json — single source of
 * truth merging SAP on-chain state, MPL Core plugin and the
 * Metaplex public registry. Surfaced in the UI as the
 * authoritative agent card. */
export type CanonicalEip8004Card = {
  schema: string;
  version: string;
  type: string;
  name: string;
  description: string | null;
  synapseAgent: string;
  owner: string;
  issuedAt: string | null;
  updatedAt: string | null;
  agentUri: string | null;
  x402Endpoint: string | null;
  capabilities: Array<{
    id: string;
    version: string | null;
    protocolId: string | null;
    description: string | null;
  }>;
  protocols: string[];
  services: Array<{ id: string; type: string; url?: string }>;
  reputation: { score: number; totalFeedbacks: number; isActive: boolean };
  sources: {
    sap: { program: string; pda: string; wallet: string; version: number | null };
    metaplex: {
      linked: boolean;
      asset: string | null;
      agentIdentityUri: string | null;
      registration: unknown;
      registry: {
        host: string;
        network: string;
        agents: unknown[];
        error: string | null;
      };
    };
  };
  diagnostics?: {
    sap: 'ok' | 'error' | string;
    metaplexLink: 'ok' | 'error' | string;
    metaplexRegistry: 'ok' | 'error' | string;
    notes: string[];
  };
};

/**
 * Fetch the canonical EIP-8004 hybrid card for an agent.
 * Hits the same-origin `/agents/<wallet>/eip-8004.json` route so the
 * UI shows exactly what third-party consumers see.
 */
export function useCanonicalEip8004(wallet: string | null) {
  const url = wallet ? `/agents/${wallet}/eip-8004.json` : null;
  return useFetch<CanonicalEip8004Card>(url, { keepStale: true });
}

/* ── MPL Core / EIP-8004 NFT inventory ───────────────────── */

export type AgentEip8004Registration = {
  schema?: string | null;
  type?: string | null;
  name?: string | null;
  version?: string | null;
  description?: string | null;
  image?: string | null;
  synapseAgent?: string | null;
  owner?: string | null;
  authority?: string | null;
  address?: string | null;
  walletAddress?: string | null;
  capabilities?: unknown;
  /** Metaplex schema: `{ name, endpoint, version? }`. Older SAP cards used `{ id, type, url }`. */
  services?: Array<{ name?: string; endpoint?: string; version?: string; id?: string; type?: string; url?: string }>;
  /** Cross-chain registration pointers (Solana / EVM). */
  registrations?: Array<{ agentId: string; agentRegistry: string }>;
  supportedTrust?: string[];
  x402Support?: boolean;
  active?: boolean;
  tokens?: unknown[];
  issuedAt?: number | null;
  [k: string]: unknown;
};

export type AgentNftItem = {
  asset: string;
  name: string | null;
  description: string | null;
  image: string | null;
  updateAuthority: string | null;
  agentIdentityUri: string | null;
  linkedToThisAgent: boolean;
  hasAgentIdentity: boolean;
  /** Hostname of the AgentIdentity URI (e.g. 'api.metaplex.com', 'explorer.oobeprotocol.ai'). */
  identityHost: string | null;
  /** Decoded EIP-8004 / agent-card JSON for any AgentIdentity-bearing asset. */
  registration: AgentEip8004Registration | null;
  ownedByWallet: boolean;
  currentOwner: string | null;
  wasTransferred: boolean;
  salePriceSol: number | null;
  source: 'wallet' | 'registry';
};

export type AgentNftsResponse = {
  sapAgentPda: string;
  expectedUrl: string;
  total: number;
  withAgentIdentity: number;
  linkedToThisAgent: number;
  items: AgentNftItem[];
  error: string | null;
};

/** All MPL Core NFTs owned by the wallet, with EIP-8004 AgentIdentity flags. */
export function useAgentNfts(wallet: string | null) {
  const url = wallet ? `/api/sap/agents/${wallet}/nfts` : null;
  return useFetch<AgentNftsResponse>(url, { keepStale: true });
}

/* ── Metaplex Agents Registry (api.metaplex.com) ─────────── */

export type MetaplexRegistryAgent = {
  id: string;
  mintAddress: string;
  network: string;
  name: string | null;
  description: string | null;
  image: string | null;
  walletAddress: string;
  authority: string | null;
  agentToken: string | null;
  agentMetadataUri: string;
  metadata?: Record<string, unknown> | null;
};

export type MetaplexRegistryResponse = {
  agents: MetaplexRegistryAgent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  walletAddress: string;
  network: string;
  fetchedAt: number;
  clientSideFiltered: boolean;
  error: string | null;
};

/** Lists all agents the wallet has registered on api.metaplex.com. */
export function useMetaplexRegistry(wallet: string | null) {
  const url = wallet ? `/api/sap/agents/${wallet}/metaplex-registry` : null;
  return useFetch<MetaplexRegistryResponse>(url, { keepStale: true });
}

/* ── Validated Genesis launch tokens ──────────────────── */

export type AgentLaunchTokenEntry = {
  mint: string;
  name: string;
  symbol: string | null;
  image: string | null;
  registryAgentMint: string;
  tokenProgram: 'spl-token' | 'token-2022';
  launchCount: number;
  primaryLaunchStatus: 'upcoming' | 'live' | 'graduated' | 'ended' | null;
};

export type AgentLaunchTokensResponse = {
  wallet: string;
  tokens: AgentLaunchTokenEntry[];
  candidatesConsidered: number;
  error?: string;
};

/**
 * Returns ONLY the wallet's real Metaplex Genesis launches — every entry
 * is validated server-side against `api.metaplex.com/v1/tokens/{mint}`.
 * Does not include MPL Core identity NFTs.
 */
export function useAgentLaunchTokens(wallet: string | null) {
  const url = wallet ? `/api/sap/agents/${wallet}/launch-tokens` : null;
  return useFetch<AgentLaunchTokensResponse>(url, { keepStale: true });
}

/* ── Token metadata (shared, DB-cached) ───────────────── */

export type TokenMetaEntry = {
  mint: string;
  symbol: string;
  name: string;
  logo: string | null;
  source: string;
};

type TokenMetaResponse = {
  tokens: Record<string, TokenMetaEntry>;
};

/**
 * Resolve metadata (name, symbol, logo) for a list of token mints.
 * Uses the shared DB-cached endpoint. Skips fetch if mints is empty.
 */
export function useTokenMetadata(mints: string[]) {
  const dedupedMints = [...new Set(mints.filter(Boolean))];
  const url = dedupedMints.length > 0
    ? `/api/sap/tokens/metadata?mints=${dedupedMints.join(',')}`
    : null;
  const { data, loading, error } = useFetch<TokenMetaResponse>(url, { keepStale: true });
  return { tokens: data?.tokens ?? {}, loading, error };
}

export function useMetrics() {
  return useFetch<SerializedNetworkOverview>('/api/sap/metrics', { pollInterval: POLL.metrics, keepStale: true });
}

export function useGraph(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `/api/sap/graph${qs}`;
  return useSapQuery<GraphData>({
    queryKey: urlToKey(url),
    url,
    queryOptions: {
      // Keep previous graph visible while new data loads — prevents flash to empty
      placeholderData: (prev: GraphData | undefined) => prev,
      staleTime: 3 * 60_000,  // graph topology rarely changes — stay fresh for 3 min
    },
  });
}

export function useTools(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return useFetch<ToolsResponse>(`/api/sap/tools${qs}`);
}

type ToolSchemasResponse = {
  schemas: InscribedSchema[];
  total: number;
};

/** Fetch inscribed schemas for a tool PDA (from TX logs) */
export function useToolSchemas(pda: string | null) {
  return useFetch<ToolSchemasResponse>(pda ? `/api/sap/tools/${pda}/schemas` : null);
}

type ToolEventsResponse = {
  events: ToolEvent[];
  total: number;
};

/** Fetch lifecycle events for a tool PDA */
export function useToolEvents(pda: string | null, limit = 50) {
  return useFetch<ToolEventsResponse>(
    pda ? `/api/sap/tools/${pda}/events?limit=${limit}` : null,
  );
}

/* ── Entity response types ────────────────────────────── */

/** Response from /api/sap/escrows */
type EscrowsResponse = {
  escrows: SerializedEscrow[];
  total: number;
};

/** Response from /api/sap/attestations */
type AttestationsResponse = {
  attestations: SerializedAttestation[];
  total: number;
};

/** Response from /api/sap/feedbacks */
type FeedbacksResponse = {
  feedbacks: SerializedFeedback[];
  total: number;
};

type VaultsResponse = {
  vaults: import('~/hooks/use-sap-vaults').EnrichedVault[];
  total: number;
};

/* ── Vault hooks — re-exported from domain file ───────── */

export {
  useVaults,
  useAgentMemory,
} from '~/hooks/use-sap-vaults';

export type {
  EnrichedVault,
  RingEntry,
  VaultDetailLedgerPage,
  VaultDetailLedger,
  VaultDetailEpochPage,
  VaultDetailCheckpoint,
  VaultDetailDelegate,
  VaultDetailEvent,
  VaultDetailSession,
  VaultMemorySummary,
  VaultDetailResponse,
  ParsedInscription,
  ParsedLedgerEntry,
  InscriptionResult,
  AgentMemoryVaultSummary,
  AgentMemoryResponse,
} from '~/hooks/use-sap-vaults';

export function useEscrows() {
  return useFetch<EscrowsResponse>('/api/sap/escrows', { pollInterval: POLL.escrows, keepStale: true });
}

/** Single escrow by PDA — no N+1 */
export function useEscrow(pda: string | null) {
  const url = pda ? `/api/sap/escrows/${pda}` : null;
  return useFetch<{ escrow: SerializedEscrow }>(url, { keepStale: true });
}

/* ── v0.7 entity hooks ────────────────────────────────── */

type ReceiptBatchesResponse = {
  receipts: ReceiptBatch[];
  total: number;
};

export function useReceiptBatches(escrowPda?: string) {
  const qs = escrowPda ? `?escrow=${encodeURIComponent(escrowPda)}` : '';
  return useFetch<ReceiptBatchesResponse>(`/api/sap/receipts${qs}`, { pollInterval: 30_000, keepStale: true });
}

type DisputesResponse = {
  disputes: Dispute[];
  total: number;
};

export function useDisputes() {
  return useFetch<DisputesResponse>('/api/sap/disputes', { pollInterval: 15_000, keepStale: true });
}

type EscrowEventsResponse = {
  events: ApiEscrowEvent[];
  total: number;
};

export function useEscrowEvents(escrowPda?: string) {
  const qs = escrowPda ? `?escrow=${encodeURIComponent(escrowPda)}` : '';
  return useFetch<EscrowEventsResponse>(`/api/sap/escrows/events${qs}`, { pollInterval: POLL.events, keepStale: true });
}

export function useAttestations() {
  return useFetch<AttestationsResponse>('/api/sap/attestations', { pollInterval: 60_000, keepStale: true });
}

export function useFeedbacks() {
  return useFetch<FeedbacksResponse>('/api/sap/feedbacks', { pollInterval: 60_000, keepStale: true });
}

/* ── SSE stream hooks — re-exported from domain file ──── */

export { useAllEvents } from '~/hooks/use-sap-stream';
export type { StreamEvent } from '~/hooks/use-sap-stream';

/* ── Agent memory — re-exported from vault domain ─────── */
// (AgentMemory types already re-exported above from use-sap-vaults)

/* ── Address event timeline ───────────────────────────── */

type AddressEventsResponse = {
  events: SapEvent[];
  total: number;
  scanned: number;
};

/**
 * Fetch all SAP events for a PDA (tool, agent, escrow, etc.)
 * from /api/sap/address/[addr]/events
 */
export function useAddressEvents(
  addr: string | null,
  opts?: { limit?: number; filter?: string },
) {
  const qs = new URLSearchParams();
  if (opts?.limit) qs.set('limit', String(opts.limit));
  if (opts?.filter) qs.set('filter', opts.filter);
  const query = qs.toString();
  const url = addr ? `/api/sap/address/${addr}/events${query ? `?${query}` : ''}` : null;
  return useFetch<AddressEventsResponse>(url);
}

/* ── Agent revenue series ─────────────────────────────── */

export function useAgentRevenue(wallet: string | null, days = 30) {
  const url = wallet ? `/api/sap/agents/${wallet}/revenue?days=${days}` : null;
  return useFetch<AgentRevenueResponse>(url);
}

/* ── Batched overview (single call for homepage) ──────── */

type OverviewResponse = {
  metrics: SerializedNetworkOverview & {
    totalVolumeLamports: string;
    totalCallsSettled: string;
    totalDeposited: string;
    totalEscrowBalance: string;
    activeEscrows: number;
    fundedEscrows: number;
    totalEscrows: number;
    topAgentsByRevenue: Array<{
      agentPda: string;
      totalSettled: string;
      totalCalls: string;
      escrowCount: number;
    }>;
  };
  agents: AgentsResponse;
  tools: ToolsResponse;
  escrows: EscrowsResponse;
  attestations: AttestationsResponse;
  feedbacks: FeedbacksResponse;
  vaults: VaultsResponse;
  escrowEvents: EscrowEventsResponse;
};

export function useOverview() {
  return useFetch<OverviewResponse>('/api/sap/overview');
}

/* ── x402 Direct Payments ─────────────────────────────── */

type X402PaymentsResponse = {
  wallet: string;
  payments: X402PaymentRow[];
  total: number;
  stats: X402Stats;
};

export function useX402Payments(wallet: string | null, opts?: { limit?: number; scan?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.scan) params.set('scan', 'true');
  const qs = params.toString();
  const url = wallet ? `/api/sap/agents/${wallet}/x402${qs ? `?${qs}` : ''}` : null;
  return useFetch<X402PaymentsResponse>(url, { pollInterval: POLL.escrows, keepStale: true });
}

/* ── Global Search ────────────────────────────────────── */

type SearchResponse = { results: SearchResult[]; total: number };

export function useGlobalSearch(query: string) {
  const url = query.length >= 2 ? `/api/sap/search?q=${encodeURIComponent(query)}` : null;
  return useFetch<SearchResponse>(url);
}
