export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getSynapseConnection,
  findAllTools,
  getSapClient,
  findAllAgents,
  serializeDiscoveredAgent,
} from '~/lib/sap/discovery';
import { fetchAgentWellKnownBatch, type AgentWellKnown } from '~/lib/sap/well-known';
import { resolveTokens } from '~/lib/sap/token-metadata';
import { getMetaplexLinkSnapshot } from '~/lib/sap/metaplex-link';
import { listRegistryAgentsForWallet } from '~/lib/metaplex/registry';
import { swr, peek } from '~/lib/cache';
import type { SerializedDiscoveredAgent } from '~/types/sap';

/* ── Types ────────────────────────────────────────────── */

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  logo: string | null;
  uiAmount: number;
  decimals: number;
}

export interface AgentBalanceSummary {
  sol: number;
  solUsd: number | null;
  usdc: number;
  tokens: TokenBalance[];
}

export interface AgentStakeSummary {
  stakedSol: number;
  slashedSol: number;
  unstakeAmountSol: number;
  unstakeAvailableAt: number | null; // Unix timestamp or null
  lastStakeAt: number | null;
  totalDisputesWon: number;
  totalDisputesLost: number;
  createdAt: number | null;
}

export interface AgentMetadata {
  name?: string;
  description?: string;
  agentId?: string;
  protocols?: string[];
  tools?: { name: string; description?: string; category?: string }[];
  endpoints?: Record<string, string>;
  services?: { type: string; protocol: string; url: string }[];
  [key: string]: unknown;
}

export interface EnrichedAgent {
  agent: SerializedDiscoveredAgent;
  balances: AgentBalanceSummary | null;
  wellKnown: AgentWellKnown | null;
  metadata: AgentMetadata | null;
  /** On-chain tool count from toolDescriptor accounts */
  onChainToolCount: number;
  /** Number of tokens this wallet deployed (update authority match) */
  deployedTokenCount: number;
  /** Agent staking collateral (null if no stake account) */
  staking: AgentStakeSummary | null;
  /** Metaplex Core link snapshot (SDK 0.9.0). Null when discovery fails. */
  metaplex: AgentMetaplexBadge | null;
}

/** Compact MPL Core link summary for list/card surfaces. */
export interface AgentMetaplexBadge {
  /** SAP-bound MPL Core asset address (linked === true), or null. */
  asset: string | null;
  /** True iff `AgentIdentity.uri` resolves to this SAP host's canonical URL. */
  linked: boolean;
  /** Number of owned MPL Core assets carrying *any* AgentIdentity plugin. */
  pluginCount: number;
  /** Number of agents this wallet has on api.metaplex.com Agents Registry. */
  registryCount: number;
}

export interface EnrichedAgentsResponse {
  agents: EnrichedAgent[];
  total: number;
  solPrice: number | null;
}

/* ── Well-known token mints ─────────────────────────────── */
const USDC_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
]);

const KNOWN_TOKENS: Record<string, { symbol: string; name: string; logo: string | null }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': { symbol: 'USDC', name: 'USD Coin', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg' },
  So11111111111111111111111111111111111111112: { symbol: 'WSOL', name: 'Wrapped SOL', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
};

/* ── SOL price (cached 60s) ──────────────────────────── */
let solPriceCache: { price: number | null; ts: number } = { price: null, ts: 0 };

async function fetchSolPrice(): Promise<number | null> {
  if (Date.now() - solPriceCache.ts < 60_000) return solPriceCache.price;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return solPriceCache.price;
    const data = await res.json();
    const price = data?.solana?.usd ?? null;
    solPriceCache = { price, ts: Date.now() };
    return price;
  } catch {
    return solPriceCache.price;
  }
}

/* ── Agent metadata fetch (from agentUri) ────────────── */
const metadataCache = new Map<string, { data: AgentMetadata | null; ts: number }>();
const META_TTL = 5 * 60 * 1000;

async function fetchAgentMetadata(agentUri: string | null | undefined): Promise<AgentMetadata | null> {
  if (!agentUri) return null;
  const cached = metadataCache.get(agentUri);
  if (cached && Date.now() - cached.ts < META_TTL) return cached.data;
  try {
    const res = await fetch(agentUri, {
      signal: AbortSignal.timeout(3000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      metadataCache.set(agentUri, { data: null, ts: Date.now() });
      return null;
    }
    const json = (await res.json()) as AgentMetadata;
    metadataCache.set(agentUri, { data: json, ts: Date.now() });
    return json;
  } catch {
    metadataCache.set(agentUri, { data: null, ts: Date.now() });
    return null;
  }
}

/* ── Balance fetching ────────────────────────────────── */

interface TokenAccountInfo {
  mint: string;
  tokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number;
  };
}

interface RawToken { mint: string; uiAmount: number; decimals: number }
interface RawBalanceData { solLamports: number; usdc: number; rawTokens: RawToken[] }

/** Phase 1: fetch raw balance data from RPC only (no Jupiter calls) */
async function fetchRawBalances(wallet: string): Promise<RawBalanceData | null> {
  try {
    const connection = getSynapseConnection();
    const pubkey = new PublicKey(wallet);

    const [solLamports, tokenAccounts] = await Promise.all([
      connection.getBalance(pubkey),
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      }),
    ]);

    const rawTokens: RawToken[] = [];
    let usdc = 0;

    for (const ta of tokenAccounts.value) {
      const info = ta.account.data.parsed?.info as TokenAccountInfo | undefined;
      if (!info || (info.tokenAmount?.uiAmount ?? 0) === 0) continue;
      if (USDC_MINTS.has(info.mint)) {
        usdc += info.tokenAmount.uiAmount ?? 0;
        continue;
      }
      rawTokens.push({ mint: info.mint, uiAmount: info.tokenAmount.uiAmount ?? 0, decimals: info.tokenAmount.decimals });
    }

    // Also try Token-2022
    try {
      const t22Accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
      });
      for (const ta of t22Accounts.value) {
        const info = ta.account.data.parsed?.info as TokenAccountInfo | undefined;
        if (!info || (info.tokenAmount?.uiAmount ?? 0) === 0) continue;
        rawTokens.push({ mint: info.mint, uiAmount: info.tokenAmount.uiAmount ?? 0, decimals: info.tokenAmount.decimals });
      }
    } catch { /* Token-2022 not available */ }

    return { solLamports, usdc, rawTokens };
  } catch {
    return null;
  }
}

/** Phase 2: finalize balances using a pre-resolved global metadata map */
function finalizeBalances(
  raw: RawBalanceData,
  solPrice: number | null,
  metaMap: Map<string, { symbol: string; name: string; logo: string | null }>,
): AgentBalanceSummary {
  const tokens: TokenBalance[] = raw.rawTokens.map((t) => {
    const meta = KNOWN_TOKENS[t.mint] ?? metaMap.get(t.mint) ?? { symbol: t.mint.slice(0, 6) + '…', name: 'Unknown Token', logo: null };
    return { mint: t.mint, symbol: meta.symbol, name: meta.name, logo: meta.logo, uiAmount: t.uiAmount, decimals: t.decimals };
  });
  tokens.sort((a, b) => b.uiAmount - a.uiAmount);
  const sol = raw.solLamports / LAMPORTS_PER_SOL;
  return { sol, solUsd: solPrice ? sol * solPrice : null, usdc: raw.usdc, tokens };
}

/* ── Route handler ──────────────────────────────────────── */

export async function fetchEnrichedAgents(): Promise<EnrichedAgentsResponse> {
    // Fetch agents directly in-process (avoid self-fetch over HTTPS which can
    // hit ERR_SSL_PACKET_LENGTH_TOO_LONG when Node loops back through nginx).
    const [rawAgents, solPrice] = await Promise.all([
      findAllAgents(),
      fetchSolPrice(),
    ]);

    // Deduplicate by PDA (parity with /api/sap/agents) and cap at 100.
    const seen = new Set<string>();
    const unique = rawAgents.filter((a) => {
      const key = a.pda.toBase58();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const agents: SerializedDiscoveredAgent[] = unique.slice(0, 100).map(serializeDiscoveredAgent);

    // Collect unique data to fetch
    const endpoints = agents.map((a) => a.identity?.x402Endpoint);
    const agentUris = agents.map((a) => a.identity?.agentUri).filter(Boolean) as string[];
    const wallets = agents.map((a) => a.identity?.wallet).filter(Boolean) as string[];

    // Fetch well-known, metadata, raw balances, on-chain tools, and staking in parallel
    const [wellKnownMap, allTools, stakingResults, metaplexResults, registryResults, ...rest] = await Promise.all([
      fetchAgentWellKnownBatch(endpoints),
      findAllTools().catch(() => [] as Awaited<ReturnType<typeof findAllTools>>),
      // Batch fetch staking for all agents
      Promise.all(
        agents.map(async (a) => {
          try {
            const stake = await getSapClient().staking.fetchNullable(new PublicKey(a.pda));
            if (!stake) return null;
            const bnToNum = (v: { toNumber?: () => number; toString?: () => string }) =>
              typeof v.toNumber === 'function' ? v.toNumber() : Number(v.toString?.() ?? 0);
            return {
              stakedSol: bnToNum(stake.stakedAmount) / LAMPORTS_PER_SOL,
              slashedSol: bnToNum(stake.slashedAmount) / LAMPORTS_PER_SOL,
              unstakeAmountSol: bnToNum(stake.unstakeAmount) / LAMPORTS_PER_SOL,
              unstakeAvailableAt: bnToNum(stake.unstakeAvailableAt) || null,
              lastStakeAt: bnToNum(stake.lastStakeAt) || null,
              totalDisputesWon: stake.totalDisputesWon,
              totalDisputesLost: stake.totalDisputesLost,
              createdAt: bnToNum(stake.createdAt) || null,
            } satisfies AgentStakeSummary;
          } catch {
            return null;
          }
        }),
      ),
      // Batch resolve Metaplex Core link via DAS — one call per wallet,
      // never throws (metaplex-link helper captures errors).
      Promise.all(
        wallets.map((w) =>
          getMetaplexLinkSnapshot(w).catch(() => null),
        ),
      ),
      // Batch resolve api.metaplex.com Agents Registry presence — one call
      // per wallet, never throws (helper returns empty list on failure).
      Promise.all(
        wallets.map((w) =>
          listRegistryAgentsForWallet(w).catch(() => null),
        ),
      ),
      ...agentUris.map((uri) => fetchAgentMetadata(uri)),
      ...wallets.map((w) => fetchRawBalances(w)),
    ]);

    // Build agentPDA → tool count map from on-chain tools
    const toolCountByAgent = new Map<string, number>();
    for (const tool of allTools) {
      const agentPda = (tool.descriptor as { agent?: { toBase58?: () => string; toString?: () => string } })?.agent;
      if (agentPda) {
        const key = typeof agentPda === 'string' ? agentPda : (agentPda.toBase58?.() ?? agentPda.toString?.() ?? String(agentPda));
        toolCountByAgent.set(key, (toolCountByAgent.get(key) ?? 0) + 1);
      }
    }

    // Build uri→metadata map
    const metadataResults = rest.slice(0, agentUris.length) as (AgentMetadata | null)[];
    const metadataMap = new Map<string, AgentMetadata>();
    agentUris.forEach((uri, i) => {
      const m = metadataResults[i];
      if (m) metadataMap.set(uri, m);
    });

    // Build wallet→rawBalance map
    const rawBalanceResults = rest.slice(agentUris.length) as (RawBalanceData | null)[];
    const rawBalanceMap = new Map<string, RawBalanceData>();
    wallets.forEach((w, i) => {
      const b = rawBalanceResults[i];
      if (b) rawBalanceMap.set(w, b);
    });

    // Collect ALL unique unknown mints across ALL agents → single batch resolve
    const allUnknownMints = new Set<string>();
    for (const raw of rawBalanceMap.values()) {
      for (const t of raw.rawTokens) {
        if (!KNOWN_TOKENS[t.mint]) allUnknownMints.add(t.mint);
      }
    }
    const globalMetaMap = allUnknownMints.size > 0
      ? await resolveTokens([...allUnknownMints])
      : new Map<string, { symbol: string; name: string; logo: string | null }>();

    // Finalize balances with resolved metadata + detect deployers per wallet
    const balanceMap = new Map<string, AgentBalanceSummary>();
    const deployerCountMap = new Map<string, number>();
    for (const [w, raw] of rawBalanceMap) {
      balanceMap.set(w, finalizeBalances(raw, solPrice, globalMetaMap));
      // Count tokens where this wallet is the updateAuthority
      let deployerCount = 0;
      for (const t of raw.rawTokens) {
        const meta = globalMetaMap.get(t.mint);
        if (meta && 'updateAuthority' in meta && meta.updateAuthority === w) {
          deployerCount++;
        }
      }
      deployerCountMap.set(w, deployerCount);
    }

    // Combine
    const enriched: EnrichedAgent[] = agents.map((agent, agentIdx) => {
      const wallet = agent.identity?.wallet;
      const ep = agent.identity?.x402Endpoint;
      const uri = agent.identity?.agentUri;

      let wk: AgentWellKnown | null = null;
      if (ep) {
        try {
          const origin = new URL(ep).origin;
          wk = wellKnownMap.get(origin) ?? null;
        } catch { /* skip */ }
      }

      return {
        agent,
        balances: wallet ? (balanceMap.get(wallet) ?? null) : null,
        wellKnown: wk,
        metadata: uri ? (metadataMap.get(uri) ?? null) : null,
        onChainToolCount: toolCountByAgent.get(agent.pda) ?? 0,
        deployedTokenCount: wallet ? (deployerCountMap.get(wallet) ?? 0) : 0,
        staking: (stakingResults as (AgentStakeSummary | null)[])[agentIdx] ?? null,
        metaplex: ((): AgentMetaplexBadge | null => {
          const snap = (metaplexResults as Array<Awaited<ReturnType<typeof getMetaplexLinkSnapshot>> | null>)[agentIdx];
          const reg = (registryResults as Array<Awaited<ReturnType<typeof listRegistryAgentsForWallet>> | null>)[agentIdx];
          const pluginCount = snap?.pluginCount ?? 0;
          const registryCount = reg?.agents.length ?? 0;
          if (!snap && registryCount === 0) return null;
          return {
            asset: snap?.asset ?? null,
            linked: !!snap?.linked,
            pluginCount,
            registryCount,
          };
        })(),
      };
    });

    const response: EnrichedAgentsResponse = {
      agents: enriched,
      total: enriched.length,
      solPrice,
    };

    return response;
}

export async function GET() {
  try {
    const cacheKey = 'agents:enriched';
    const cached = peek<EnrichedAgentsResponse>(cacheKey);
    if (cached) {
      swr(cacheKey, () => fetchEnrichedAgents(), { ttl: 30_000, swr: 180_000 }).catch(() => {});
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=180' },
      });
    }

    const data = await swr(cacheKey, () => fetchEnrichedAgents(), { ttl: 30_000, swr: 180_000 });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=180' },
    });
  } catch (err) {
    console.error('[enriched] Error:', err);
    return NextResponse.json({ error: 'Failed to enrich agents' }, { status: 500 });
  }
}
