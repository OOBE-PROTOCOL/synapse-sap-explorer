export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/agents/[wallet]/launch-tokens
 *
 * Returns the wallet's agent fungible launch tokens — i.e. SPL/Token-2022
 * mints that are *real fungibles* (not MPL Core identity NFTs nor
 * supply-1 collectibles). Sources are merged and de-duplicated:
 *
 *   1. `registry.agentToken`            — the canonical pin if set
 *   2. Mints embedded in registry agent `metadata.services[].endpoint`
 *      URLs (e.g. `birdeye.so/token/<mint>`, `dexscreener.com/solana/<mint>`,
 *      `<launchpad>/token/<mint>`). Many agents launch on Meteora DBC,
 *      Pump.fun, etc. and pin the mint there instead of `agentToken`.
 *
 * Each candidate is validated via RPC: owner must be SPL or Token-2022,
 * AND the mint must NOT be a supply-1/decimals-0 NFT. We also enrich with
 * Metaplex Genesis API metadata (icon, symbol, launch status) when the
 * mint happens to be a Genesis launch — but Genesis is *not* required.
 *
 * Caching: 60s fresh / 5m stale via swr().
 * Failure mode: never throws — returns `{ tokens: [] }` with `error` set
 * on upstream failure so the UI can degrade gracefully.
 * ────────────────────────────────────────────── */

import { Connection, PublicKey } from '@solana/web3.js';
import { synapseResponse } from '~/lib/synapse/client';
import { swr } from '~/lib/cache';
import {
  listRegistryAgentsForWallet,
  getRegistryAgentsByMints,
  type MetaplexRegistryAgent,
} from '~/lib/metaplex/registry';
import { getGenesisTokenLaunches } from '~/lib/metaplex/genesis';
import { fetchGenesisLaunchesByAuthority } from '~/lib/metaplex/genesis-onchain';
import { getMetaplexAssetsForWallet } from '~/lib/sap/metaplex-link';
import { getRpcConfig, getSapClient, getSynapseConnection } from '~/lib/sap/discovery';

export type AgentLaunchTokenEntry = {
  /** Fungible mint address (validated via RPC). */
  mint: string;
  /** Display name from Genesis baseToken / registry / fallback. */
  name: string;
  /** Symbol from Genesis baseToken when available. */
  symbol: string | null;
  /** Image URL from Genesis baseToken when available. */
  image: string | null;
  /** SAP profile PDA — used by the swap UI for signer/PDA lookups. */
  registryAgentMint: string;
  /** Owning token program — drives UI badge. */
  tokenProgram: 'spl-token' | 'token-2022';
  /** Number of Genesis launches associated (0 = not on Genesis). */
  launchCount: number;
  /** Most relevant launch (live > graduated > first), null if not on Genesis. */
  primaryLaunchStatus: 'upcoming' | 'live' | 'graduated' | 'ended' | null;
};

export type AgentLaunchTokensResponse = {
  wallet: string;
  tokens: AgentLaunchTokenEntry[];
  /** Diagnostics: number of candidate mints considered before validation. */
  candidatesConsidered: number;
  /** Set when an upstream call partially failed; result is best-effort. */
  error?: string;
};

const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJsyFbPVwwQQfq5x5nnwrA8Cuu';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
/** Solana base58 pubkey shape — exactly 32–44 chars, no 0/O/I/l. */
const BASE58_PUBKEY_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
/** Mint addresses we never surface as agent launch tokens. */
const STABLECOINS_AND_NATIVE = new Set<string>([
  'So11111111111111111111111111111111111111112',  // wSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    const { wallet: walletOrId } = await params;
    const { url: rpcUrl } = getRpcConfig();
    const resolved = await getSapClient().metaplex.resolveAgentIdentifier({
      identifier: walletOrId,
      rpcUrl,
    }).catch(() => null);
    const wallet = resolved?.wallet?.toBase58() ?? walletOrId;
    const profilePda = resolved?.sapAgentPda?.toBase58() ?? wallet;

    // Derive an absolute base for in-process API fan-out (we call our
    // own /balances endpoint to inherit its mint-authority detection).
    const baseUrl = new URL(req.url).origin;

    const payload = await swr<AgentLaunchTokensResponse>(
      `agent:${wallet}:launch-tokens:v5`,
      () => buildLaunchTokens(wallet, profilePda, baseUrl),
      { ttl: 60_000, swr: 300_000 },
    );
    return synapseResponse(payload);
  } catch (err: unknown) {
    console.error('[agent/launch-tokens]', err);
    return synapseResponse(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

type Candidate = {
  mint: string;
  name: string;
  registryAgentMint: string;
};

async function buildLaunchTokens(
  wallet: string,
  profilePda: string,
  baseUrl: string,
): Promise<AgentLaunchTokensResponse> {
  // 1. Gather registry agents for this wallet.
  let registryAgents: MetaplexRegistryAgent[] = [];
  try {
    const assets = await getMetaplexAssetsForWallet(wallet);
    const candidateAssetMints = assets.items
      .filter((i) => i.hasAgentIdentity)
      .map((i) => i.asset);

    const direct = await getRegistryAgentsByMints(wallet, candidateAssetMints, 'solana-mainnet');
    registryAgents = direct.agents.length > 0
      ? direct.agents
      : (await listRegistryAgentsForWallet(wallet, 'solana-mainnet')).agents;
  } catch (err) {
    console.warn('[launch-tokens] registry lookup failed', err);
  }

  // 2. Collect candidate mints.
  const candidatesByMint = new Map<string, Candidate>();
  const addCandidate = (mint: string, name: string, registryAgentMint: string) => {
    if (!mint || STABLECOINS_AND_NATIVE.has(mint)) return;
    if (candidatesByMint.has(mint)) return;
    if (!isPlausiblePubkey(mint)) return;
    candidatesByMint.set(mint, { mint, name, registryAgentMint });
  };

  // 2a. CANONICAL — Metaplex Genesis on-chain GPA by authority.
  //     This is the protocol-level source-of-truth: every Genesis
  //     launch's `GenesisAccountV2` (and legacy V1) stores the launch
  //     creator in `authority`. We query getProgramAccounts via the
  //     SDK's GpaBuilder filtered by that field, exactly as Metaplex
  //     prescribes. Each match is a real Genesis launch; the baseMint
  //     becomes a candidate. We seed candidates here BEFORE any
  //     heuristics so this signal always wins on de-dup.
  const profileFallbackMint = profilePda;
  const genesisGpaMints = new Set<string>();
  try {
    const launches = await fetchGenesisLaunchesByAuthority(wallet);
    for (const l of launches) {
      // Name comes from Genesis API enrichment downstream; placeholder
      // here is fine — it gets overwritten in step 4.
      addCandidate(l.baseMint, 'Genesis launch', profileFallbackMint);
      genesisGpaMints.add(l.baseMint);
    }
  } catch (err) {
    console.warn('[launch-tokens] genesis GPA query failed', err);
  }

  for (const a of registryAgents) {
    const fallbackName = a.name ?? 'Agent token';

    // 2b. Pinned `agentToken`.
    if (a.agentToken && a.agentToken !== a.mintAddress) {
      addCandidate(a.agentToken, fallbackName, a.mintAddress);
    }

    // 2c. Mints embedded in service endpoint URLs. Many agents (Idolly,
    //     pump.fun launches, etc.) point to their token via launchpad
    //     URLs but leave `agentToken` null on the registry. We extract
    //     base58 segments from each URL and let RPC validation gate them.
    for (const mint of extractMintsFromMetadata(a.metadata)) {
      if (mint === a.mintAddress) continue; // identity NFT
      addCandidate(mint, fallbackName, a.mintAddress);
    }
  }

  // 2d. Wallet-deployer + name-similarity fallback. For non-Genesis
  //     launches (pump.fun graduations, raw SPL mints) the canonical
  //     GPA above won't match. We still try two heuristics on the held
  //     wallet balances:
  //       (a) authority still set → balances `isDeployer` flags it;
  //       (b) authority revoked post-graduation (classic pump.fun) →
  //           no on-chain link survives, but the wallet still HOLDS
  //           the token and the symbol/name overlaps the agent name
  //           ("XONA AGENT" ↔ "XONA"). We use that as a fallback.
  //     NFT identity assets (SAID, Core asset, supply≤1 + decimals=0)
  //     are dropped downstream by `classifyMints`.
  const primaryRegistryMint = registryAgents[0]?.mintAddress ?? profilePda;
  const agentNameTokens = collectAgentNameTokens(registryAgents);
  try {
    const balancesRes = await fetch(
      `${baseUrl}/api/sap/agents/${encodeURIComponent(wallet)}/balances`,
      { cache: 'no-store' },
    );
    if (balancesRes.ok) {
      const balances = (await balancesRes.json()) as {
        deployedTokens?: Array<{ mint: string; name?: string; symbol?: string }>;
        tokens?: Array<{
          mint: string;
          isDeployer?: boolean;
          meta?: { name?: string; symbol?: string } | null;
        }>;
      };
      for (const t of balances.deployedTokens ?? []) {
        addCandidate(t.mint, t.name ?? t.symbol ?? 'Agent token', primaryRegistryMint);
      }
      for (const t of balances.tokens ?? []) {
        const meta = t.meta ?? null;
        const name = meta?.name ?? meta?.symbol ?? 'Agent token';
        if (t.isDeployer) {
          addCandidate(t.mint, name, primaryRegistryMint);
          continue;
        }
        if (agentNameTokens.size > 0 && tokenMatchesAgentName(meta, agentNameTokens)) {
          addCandidate(t.mint, name, primaryRegistryMint);
        }
      }
    }
  } catch (err) {
    console.warn('[launch-tokens] balances fetch failed', err);
  }

  const candidates = [...candidatesByMint.values()];
  if (candidates.length === 0) {
    return { wallet, tokens: [], candidatesConsidered: 0 };
  }

  // 3. RPC-validate fungibility in a single batched call. We need an
  //    AUTHENTICATED Connection — most production RPCs reject anonymous
  //    `getMultipleParsedAccounts`. `getSynapseConnection()` carries the
  //    SAP API key for us.
  const connection = getSynapseConnection();
  let upstreamError: string | undefined;
  const fungibleMap = await classifyMints(connection, candidates.map((c) => c.mint))
    .catch((err) => {
      upstreamError = err instanceof Error ? err.message : String(err);
      return new Map<string, MintClassification>();
    });

  // 4. Enrich with Genesis API in parallel (best-effort).
  const enriched = await Promise.all(
    candidates.map(async (c) => {
      const cls = fungibleMap.get(c.mint);
      if (!cls || !cls.isFungible) return null;

      const genesis = await getGenesisTokenLaunches(c.mint, 'solana-mainnet').catch(() => ({
        data: null,
        error: null,
        status: 0,
      }));
      const token = genesis.data ?? null;
      const launches = token?.launches ?? [];
      const live = launches.find((l) => l.status === 'live');
      const graduated = launches.find((l) => l.status === 'graduated');
      const primary = live ?? graduated ?? launches[0] ?? null;

      const entry: AgentLaunchTokenEntry = {
        mint: c.mint,
        name: token?.baseToken?.name?.trim() || c.name,
        symbol: token?.baseToken?.symbol?.trim() || null,
        image: token?.baseToken?.image || null,
        registryAgentMint: c.registryAgentMint || profilePda,
        tokenProgram: cls.tokenProgram,
        launchCount: launches.length,
        primaryLaunchStatus: primary?.status ?? null,
      };
      return entry;
    }),
  );

  // STRICT Genesis-only filter: surface a token under "Agent token ·
  // Genesis" only when it is provably a Metaplex Genesis launch — either
  // the on-chain GPA-by-authority query matched (canonical proof) or the
  // Genesis API returned ≥1 launch for the mint. Pump.fun graduations,
  // raw SPL/Token-2022 mints and other heuristic candidates are dropped
  // here. The empty-state CTA in the UI handles the no-Genesis case.
  const tokens = enriched
    .filter((x): x is AgentLaunchTokenEntry => x !== null)
    .filter((t) => t.launchCount > 0 || genesisGpaMints.has(t.mint));

  // Sort: Genesis-live → Genesis-graduated → other Genesis → non-Genesis,
  // then by launchCount desc.
  tokens.sort((a, b) => {
    const rank = (s: string | null, count: number) => {
      if (s === 'live') return 0;
      if (s === 'graduated') return 1;
      if (count > 0) return 2;
      return 3;
    };
    const r = rank(a.primaryLaunchStatus, a.launchCount) - rank(b.primaryLaunchStatus, b.launchCount);
    if (r !== 0) return r;
    return b.launchCount - a.launchCount;
  });

  return {
    wallet,
    tokens,
    candidatesConsidered: candidates.length,
    ...(upstreamError ? { error: upstreamError } : {}),
  };
}

/* ── Mint classification ───────────────────────────── */

type MintClassification = {
  tokenProgram: 'spl-token' | 'token-2022';
  isFungible: boolean;
};

/**
 * Batches `getMultipleParsedAccounts` for the given mints and decides
 * whether each is a real fungible. Heuristic: owner must be SPL or
 * Token-2022 program, and the mint must NOT be (decimals=0, supply≤1)
 * — that combination is the canonical NFT shape.
 */
async function classifyMints(
  connection: Connection,
  mints: string[],
): Promise<Map<string, MintClassification>> {
  const out = new Map<string, MintClassification>();
  if (mints.length === 0) return out;

  const pubkeys: PublicKey[] = [];
  const indexToMint: string[] = [];
  for (const m of mints) {
    try {
      pubkeys.push(new PublicKey(m));
      indexToMint.push(m);
    } catch {
      // skip invalid base58 segments produced by URL extraction
    }
  }
  if (pubkeys.length === 0) return out;

  const res = await connection.getMultipleParsedAccounts(pubkeys, { commitment: 'confirmed' });
  res.value.forEach((acc, i) => {
    const mint = indexToMint[i];
    if (!acc) return;
    const owner = acc.owner.toBase58();
    if (owner !== SPL_TOKEN_PROGRAM_ID && owner !== TOKEN_2022_PROGRAM_ID) return;

    const data = acc.data as { parsed?: { info?: { decimals?: number; supply?: string }; type?: string } };
    const parsed = data.parsed;
    if (!parsed || parsed.type !== 'mint' || !parsed.info) return;

    const decimals = parsed.info.decimals ?? 0;
    const supply = Number(parsed.info.supply ?? '0');
    // NFT shape: 0 decimals AND supply ≤ 1. Everything else is treated
    // as a fungible (covers DBC, Genesis, pump.fun, regular SPL).
    const isFungible = !(decimals === 0 && supply <= 1);

    out.set(mint, {
      tokenProgram: owner === TOKEN_2022_PROGRAM_ID ? 'token-2022' : 'spl-token',
      isFungible,
    });
  });
  return out;
}

/* ── Metadata mint extraction ─────────────────────── */

/**
 * Pulls plausible Solana mint pubkeys from a registry agent's metadata
 * blob. Walks every string value (URLs, descriptions, custom fields) and
 * runs a base58 regex over it. False positives are dropped later by RPC
 * validation.
 */
function extractMintsFromMetadata(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata) return [];
  const out = new Set<string>();
  walkStrings(metadata, (s) => {
    const matches = s.match(BASE58_PUBKEY_RE);
    if (!matches) return;
    for (const m of matches) {
      if (isPlausiblePubkey(m)) out.add(m);
    }
  });
  return [...out];
}

function walkStrings(value: unknown, visit: (s: string) => void): void {
  if (value == null) return;
  if (typeof value === 'string') {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkStrings(v, visit);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walkStrings(v, visit);
  }
}

function isPlausiblePubkey(s: string): boolean {
  if (s.length < 32 || s.length > 44) return false;
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
}

/* ── Agent name similarity ────────────────────────── */

/** Stop-words ignored when matching token name to agent name. */
const AGENT_NAME_STOP = new Set(['agent', 'sap', 'protocol', 'token', 'ai', 'the', 'official']);

/** Tokenize an agent display name into ≥3-char alphanumeric lowercase words. */
function tokenizeAgentName(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 3 && !AGENT_NAME_STOP.has(w));
}

/** Union of significant tokens across all registry-agent display names. */
function collectAgentNameTokens(agents: MetaplexRegistryAgent[]): Set<string> {
  const out = new Set<string>();
  for (const a of agents) {
    for (const t of tokenizeAgentName(a.name)) out.add(t);
  }
  return out;
}

/** True when the token name OR symbol overlaps the agent name tokens. */
function tokenMatchesAgentName(
  meta: { name?: string; symbol?: string } | null,
  agentTokens: Set<string>,
): boolean {
  if (!meta) return false;
  const candidates = [...tokenizeAgentName(meta.name), ...tokenizeAgentName(meta.symbol)];
  return candidates.some((t) => agentTokens.has(t));
}
