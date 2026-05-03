/**
 * Persistent SWR store for the heavy /agents enrichment slice.
 *
 * What lives here:
 *   • balances (RPC + Token + Token-2022 + Jupiter metadata)
 *   • wellKnown (`.well-known/agent.json`)
 *   • metadata  (the agent's own `agentUri` JSON)
 *   • staking   (on-chain `AgentStake` PDA)
 *   • deployedTokenCount (count of mints whose updateAuthority === wallet)
 *
 * What does NOT live here (kept in their own dedicated stores):
 *   • logos    — `agent-logo-store.ts`
 *   • metaplex — `metaplex-snapshot-store.ts`
 *   • on-chain agent identity + tool count — fetched fresh every list request
 *
 * Why a dedicated cache?
 *   The /agents listing was waiting 10–30s on cold RPC + N HTTP fetches
 *   (well-known + agent.json) + Jupiter metadata resolution. We persist the
 *   slice that is effectively static for minutes (balances) or hours
 *   (well-known, metadata, staking) so the listing serves instantly from
 *   Postgres and refreshes in background — Solscan-style.
 *
 * Server-only.
 */

import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  selectAgentEnrichment,
  selectAgentEnrichmentBatch,
  upsertAgentEnrichment,
} from '~/lib/db/queries';
import { isDbDown } from '~/db';
import {
  getSynapseConnection,
  getSapClient,
} from '~/lib/sap/discovery';
import {
  fetchAgentWellKnown,
  type AgentWellKnown,
} from '~/lib/sap/well-known';
import { resolveTokens } from '~/lib/sap/token-metadata';

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

export interface AgentStakeSummary {
  stakedSol: number;
  slashedSol: number;
  unstakeAmountSol: number;
  unstakeAvailableAt: number | null;
  lastStakeAt: number | null;
  totalDisputesWon: number;
  totalDisputesLost: number;
  createdAt: number | null;
}

export interface AgentEnrichmentSnapshot {
  wallet: string;
  balances: AgentBalanceSummary | null;
  wellKnown: AgentWellKnown | null;
  metadata: AgentMetadata | null;
  staking: AgentStakeSummary | null;
  deployedTokenCount: number;
}

/* ── TTLs ─────────────────────────────────────────────── */

const STALE_MS = 60_000;             // 1 min: serve, refresh in background
const HARD_TTL_MS = 30 * 60_000;     // 30 min: block on refresh
const EMPTY_STALE_MS = 30_000;
const EMPTY_HARD_TTL_MS = 5 * 60_000;

/* ── Shared SOL price cache (60s) ─────────────────────── */
let solPriceCache: { price: number | null; ts: number } = { price: null, ts: 0 };
async function fetchSolPrice(): Promise<number | null> {
  if (Date.now() - solPriceCache.ts < 60_000) return solPriceCache.price;
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return solPriceCache.price;
    const data = await res.json();
    const price = data?.solana?.usd ?? null;
    solPriceCache = { price, ts: Date.now() };
    return price;
  } catch {
    return solPriceCache.price;
  }
}

/* ── Constants ────────────────────────────────────────── */

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

/* ── Per-wallet HTTP metadata cache (in-process) ──────── */
const metadataCache = new Map<string, { data: AgentMetadata | null; ts: number }>();
const META_TTL = 5 * 60_000;

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

/* ── Raw balance fetch (no Jupiter) ───────────────────── */

interface TokenAccountInfo {
  mint: string;
  tokenAmount: { amount: string; decimals: number; uiAmount: number };
}
interface RawToken { mint: string; uiAmount: number; decimals: number }
interface RawBalanceData { solLamports: number; usdc: number; rawTokens: RawToken[] }

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
      if (USDC_MINTS.has(info.mint)) { usdc += info.tokenAmount.uiAmount ?? 0; continue; }
      rawTokens.push({ mint: info.mint, uiAmount: info.tokenAmount.uiAmount ?? 0, decimals: info.tokenAmount.decimals });
    }

    try {
      const t22 = await connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
      });
      for (const ta of t22.value) {
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

/* ── Staking fetch ────────────────────────────────────── */

async function fetchStaking(agentPda: string): Promise<AgentStakeSummary | null> {
  try {
    const stake = await getSapClient().staking.fetchNullable(new PublicKey(agentPda));
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
    };
  } catch {
    return null;
  }
}

/* ── Resolver ─────────────────────────────────────────── */

export interface ResolveInput {
  wallet: string;
  agentPda: string | null;
  endpoint: string | null;
  agentUri: string | null;
}

const inflight = new Map<string, Promise<AgentEnrichmentSnapshot>>();

async function resolveOne(input: ResolveInput): Promise<AgentEnrichmentSnapshot> {
  const { wallet, agentPda, endpoint, agentUri } = input;

  const [solPrice, raw, wkResult, meta, staking] = await Promise.all([
    fetchSolPrice(),
    fetchRawBalances(wallet),
    endpoint ? fetchAgentWellKnown(endpoint).catch(() => null) : Promise.resolve(null),
    fetchAgentMetadata(agentUri),
    agentPda ? fetchStaking(agentPda) : Promise.resolve(null),
  ]);

  let balances: AgentBalanceSummary | null = null;
  let deployedTokenCount = 0;
  if (raw) {
    const unknownMints = raw.rawTokens
      .map((t) => t.mint)
      .filter((m) => !KNOWN_TOKENS[m]);
    const metaMap = unknownMints.length > 0
      ? await resolveTokens(unknownMints).catch(() => new Map<string, { symbol: string; name: string; logo: string | null }>())
      : new Map<string, { symbol: string; name: string; logo: string | null }>();
    balances = finalizeBalances(raw, solPrice, metaMap);
    for (const t of raw.rawTokens) {
      const m = metaMap.get(t.mint);
      if (m && 'updateAuthority' in m && (m as { updateAuthority?: string }).updateAuthority === wallet) {
        deployedTokenCount++;
      }
    }
  }

  return {
    wallet,
    balances,
    wellKnown: wkResult,
    metadata: meta,
    staking,
    deployedTokenCount,
  };
}

async function resolveAndPersist(input: ResolveInput): Promise<AgentEnrichmentSnapshot> {
  const existing = inflight.get(input.wallet);
  if (existing) return existing;

  const task = (async () => {
    const snap = await resolveOne(input);
    if (!isDbDown()) {
      try {
        await upsertAgentEnrichment({ wallet: input.wallet, data: snap });
      } catch { /* best-effort */ }
    }
    inflight.delete(input.wallet);
    return snap;
  })();

  inflight.set(input.wallet, task);
  return task;
}

function rowToSnapshot(row: { wallet: string; data: unknown }): AgentEnrichmentSnapshot {
  const d = (row.data ?? {}) as Partial<AgentEnrichmentSnapshot>;
  return {
    wallet: row.wallet,
    balances: d.balances ?? null,
    wellKnown: d.wellKnown ?? null,
    metadata: d.metadata ?? null,
    staking: d.staking ?? null,
    deployedTokenCount: d.deployedTokenCount ?? 0,
  };
}

function isEmpty(snap: AgentEnrichmentSnapshot): boolean {
  return !snap.balances && !snap.wellKnown && !snap.metadata && !snap.staking;
}

/* ── Public API ───────────────────────────────────────── */

/** Single-wallet SWR getter. Returns cached snapshot, refreshes on stale. */
export async function getCachedAgentEnrichment(
  input: ResolveInput,
): Promise<AgentEnrichmentSnapshot> {
  if (isDbDown()) return resolveOne(input);

  const row = await selectAgentEnrichment(input.wallet).catch(() => null);
  if (!row) return resolveAndPersist(input);

  const snap = rowToSnapshot(row);
  const empty = isEmpty(snap);
  const ageMs = Date.now() - new Date(row.refreshedAt).getTime();
  const staleMs = empty ? EMPTY_STALE_MS : STALE_MS;
  const hardMs = empty ? EMPTY_HARD_TTL_MS : HARD_TTL_MS;

  if (ageMs >= hardMs) return resolveAndPersist(input);
  if (ageMs >= staleMs) {
    void resolveAndPersist(input).catch(() => undefined);
  }
  return snap;
}

/** Batch SWR getter for the listing page. */
export async function getCachedAgentEnrichmentBatch(
  inputs: ResolveInput[],
): Promise<Map<string, AgentEnrichmentSnapshot>> {
  const map = new Map<string, AgentEnrichmentSnapshot>();
  if (inputs.length === 0) return map;
  if (isDbDown()) return map;

  const wallets = inputs.map((i) => i.wallet);
  const rows = await selectAgentEnrichmentBatch(wallets).catch(
    () => [] as Array<{ wallet: string; data: unknown; refreshedAt: Date }>,
  );

  const byWallet = new Map(rows.map((r) => [r.wallet, r]));
  const now = Date.now();

  for (const input of inputs) {
    const row = byWallet.get(input.wallet);
    if (!row) {
      // Cold: kick off background resolve, listing gets null this round.
      void resolveAndPersist(input).catch(() => undefined);
      continue;
    }
    const snap = rowToSnapshot(row);
    map.set(input.wallet, snap);
    const empty = isEmpty(snap);
    const ageMs = now - new Date(row.refreshedAt).getTime();
    const staleMs = empty ? EMPTY_STALE_MS : STALE_MS;
    const hardMs = empty ? EMPTY_HARD_TTL_MS : HARD_TTL_MS;
    if (ageMs >= staleMs) {
      void resolveAndPersist(input).catch(() => undefined);
    }
    // hardMs reached → still serve cached, background refresh kicked above
    void hardMs;
  }

  return map;
}
