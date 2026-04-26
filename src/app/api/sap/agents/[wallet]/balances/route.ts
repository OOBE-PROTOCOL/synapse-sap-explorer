export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getSynapseConnection, getRpcConfig, getSapClient } from '~/lib/sap/discovery';

export interface TokenMeta {
  name: string;
  symbol: string;
  logo: string | null;
}

export interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  meta: TokenMeta | null;
  /** True if wallet is the mint/update authority (i.e. wallet deployed this token) */
  isDeployer?: boolean;
}

export interface WalletBalancesResponse {
  wallet: string;
  sol: number;
  solUsd: number | null;
  usdc: number;
  tokens: TokenBalance[];
  /** Total estimated USD value (SOL + USDC + recognized tokens) */
  totalUsd: number | null;
  /** Tokens deployed by this wallet (mint authority or update authority) */
  deployedTokens: { mint: string; name: string; symbol: string }[];
}

const USDC_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
]);

const KNOWN_TOKENS: Record<string, TokenMeta> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': { symbol: 'USDC', name: 'USD Coin', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg' },
  So11111111111111111111111111111111111111112: { symbol: 'WSOL', name: 'Wrapped SOL', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
};

const METAPLEX_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/* ── On-chain metadata resolution ─────────────────────────── */

async function fetchLogoFromUri(uri: string | undefined | null): Promise<string | null> {
  if (!uri) return null;
  try {
    let fetchUrl = uri;
    if (fetchUrl.startsWith('ipfs://')) fetchUrl = 'https://ipfs.io/ipfs/' + fetchUrl.slice(7);
    if (!fetchUrl.startsWith('http')) return null;
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json() as { image?: string };
    const img = json?.image;
    if (!img || typeof img !== 'string') return null;
    if (img.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + img.slice(7);
    return img.startsWith('http') ? img : null;
  } catch { return null; }
}

interface MintMetaResult {
  meta: TokenMeta;
  updateAuthority?: string | null;
}

async function resolveOnChainMeta(mint: string): Promise<MintMetaResult | null> {
  try {
    const { url, headers } = getRpcConfig();
    const res = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [mint, { encoding: 'jsonParsed' }] }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as { result?: { value?: { data?: { parsed?: { info?: { extensions?: { extension: string; state?: { name?: string; symbol?: string; uri?: string; updateAuthority?: string } }[] } } } } } };
    const value = data?.result?.value;
    if (!value) return null;

    const extensions = value.data?.parsed?.info?.extensions;
    if (extensions) {
      const meta = extensions.find((e) => e.extension === 'tokenMetadata');
      if (meta?.state) {
        const { name, symbol, uri, updateAuthority } = meta.state;
        if (name || symbol) {
          const logo = await fetchLogoFromUri(uri);
          return {
            meta: { symbol: symbol || mint.slice(0, 4) + '…', name: name || 'Unknown', logo },
            updateAuthority: updateAuthority || null,
          };
        }
      }
    }

    // Metaplex PDA fallback for standard SPL tokens
    return resolveViaMetaplex(mint);
  } catch { return null; }
}

async function resolveViaMetaplex(mint: string): Promise<MintMetaResult | null> {
  try {
    const mintPk = new PublicKey(mint);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METAPLEX_METADATA_PROGRAM.toBuffer(), mintPk.toBuffer()],
      METAPLEX_METADATA_PROGRAM,
    );
    const { url, headers } = getRpcConfig();
    const res = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAccountInfo', params: [pda.toBase58(), { encoding: 'base64' }] }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as { result?: { value?: { data?: [string, string] } } };
    const raw = data?.result?.value?.data?.[0];
    if (!raw) return null;

    const buf = Buffer.from(raw, 'base64');
    const updateAuth = new PublicKey(buf.subarray(1, 33)).toBase58();
    const nameLen = buf.readUInt32LE(65);
    const name = buf.subarray(69, 69 + nameLen).toString('utf8').replace(/\0/g, '').trim();
    const symOff = 69 + nameLen;
    const symLen = buf.readUInt32LE(symOff);
    const symbol = buf.subarray(symOff + 4, symOff + 4 + symLen).toString('utf8').replace(/\0/g, '').trim();
    const uriOff = symOff + 4 + symLen;
    const uriLen = buf.readUInt32LE(uriOff);
    const uri = buf.subarray(uriOff + 4, uriOff + 4 + uriLen).toString('utf8').replace(/\0/g, '').trim();

    if (!name && !symbol) return null;
    const logo = await fetchLogoFromUri(uri);
    return {
      meta: { symbol: symbol || mint.slice(0, 4) + '…', name: name || 'Unknown', logo },
      updateAuthority: updateAuth,
    };
  } catch { return null; }
}

async function fetchTokenMetaBatch(
  mints: string[],
  wallet: string,
): Promise<{ metaMap: Record<string, TokenMeta>; deployerMints: Map<string, { name: string; symbol: string }> }> {
  const metaMap: Record<string, TokenMeta> = {};
  const deployerMints = new Map<string, { name: string; symbol: string }>();

  const CHUNK = 10;
  for (let i = 0; i < mints.length; i += CHUNK) {
    const chunk = mints.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map((m) => resolveOnChainMeta(m).then((r) => [m, r] as const)));
    for (const [m, result] of results) {
      if (result) {
        metaMap[m] = result.meta;
        if (result.updateAuthority === wallet) {
          deployerMints.set(m, { name: result.meta.name, symbol: result.meta.symbol });
        }
      }
    }
  }
  return { metaMap, deployerMints };
}

/* ── SOL price ────────────────────────────────────────────── */

let solPriceCache: { price: number | null; ts: number } = { price: null, ts: 0 };

async function fetchSolPrice(): Promise<number | null> {
  if (Date.now() - solPriceCache.ts < 60_000) return solPriceCache.price;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return solPriceCache.price;
    const data = await res.json();
    solPriceCache = { price: data?.solana?.usd ?? null, ts: Date.now() };
    return solPriceCache.price;
  } catch { return solPriceCache.price; }
}

/* ── Route handler ───────────────────────────────────────── */

interface TokenAccountInfo {
  mint: string;
  tokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number;
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ wallet: string }> },
) {
  const emptyResponse = (wallet: string): WalletBalancesResponse => ({
    wallet,
    sol: 0,
    solUsd: null,
    usdc: 0,
    tokens: [],
    totalUsd: null,
    deployedTokens: [],
  });

  try {
    const { wallet: walletOrId } = await params;
    const { url: rpcUrl } = getRpcConfig();
    const resolved = await getSapClient().metaplex.resolveAgentIdentifier({
      identifier: walletOrId,
      rpcUrl,
    }).catch(() => null);
    const wallet = resolved?.wallet?.toBase58() ?? walletOrId;

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(wallet);
    } catch {
      return NextResponse.json(emptyResponse(walletOrId), {
        headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
      });
    }

    const connection = getSynapseConnection();

    const [solBalance, tokenAccounts, solPrice] = await Promise.all([
      connection.getBalance(pubkey).catch(() => 0),
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      }).catch(() => null),
      fetchSolPrice(),
    ]);

    const rawTokens: { mint: string; amount: string; decimals: number; uiAmount: number }[] = [];
    let usdc = 0;

    for (const ta of tokenAccounts?.value ?? []) {
      const info = ta.account.data.parsed?.info as TokenAccountInfo | undefined;
      if (!info || !info.tokenAmount?.amount || info.tokenAmount.amount === '0') continue;
      if (USDC_MINTS.has(info.mint)) {
        usdc += info.tokenAmount.uiAmount ?? 0;
        continue;
      }
      rawTokens.push({
        mint: info.mint,
        amount: info.tokenAmount.amount,
        decimals: info.tokenAmount.decimals,
        uiAmount: info.tokenAmount.uiAmount ?? 0,
      });
    }

    // Also scan Token-2022
    try {
      const t22Accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
      });
      for (const ta of t22Accounts.value) {
        const info = ta.account.data.parsed?.info as TokenAccountInfo | undefined;
        if (!info || !info.tokenAmount?.amount || info.tokenAmount.amount === '0') continue;
        if (USDC_MINTS.has(info.mint)) {
          usdc += info.tokenAmount.uiAmount ?? 0;
          continue;
        }
        rawTokens.push({
          mint: info.mint,
          amount: info.tokenAmount.amount,
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmount ?? 0,
        });
      }
    } catch { /* Token-2022 not available */ }

    // Resolve metadata for all unknown mints + detect deployer
    const unknownMints = rawTokens.filter((t) => !KNOWN_TOKENS[t.mint]).map((t) => t.mint);
    const { metaMap, deployerMints } = unknownMints.length > 0
      ? await fetchTokenMetaBatch(unknownMints, wallet)
      : { metaMap: {} as Record<string, TokenMeta>, deployerMints: new Map<string, { name: string; symbol: string }>() };

    const tokens: TokenBalance[] = rawTokens
      .map((t) => ({
        ...t,
        meta: KNOWN_TOKENS[t.mint] ?? metaMap[t.mint] ?? null,
        isDeployer: deployerMints.has(t.mint),
      }))
      .sort((a, b) => b.uiAmount - a.uiAmount);

    const sol = solBalance / LAMPORTS_PER_SOL;
    const solUsd = solPrice ? sol * solPrice : null;
    const totalUsd = solPrice ? (sol * solPrice) + usdc : null;

    const deployedTokens = [...deployerMints.entries()].map(([mint, info]) => ({
      mint,
      name: info.name,
      symbol: info.symbol,
    }));

    const response: WalletBalancesResponse = {
      wallet,
      sol,
      solUsd,
      usdc,
      tokens,
      totalUsd,
      deployedTokens,
    };

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[balances] Error fetching wallet balances:', err);
    return NextResponse.json(
      emptyResponse((await params).wallet),
      { headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' } },
    );
  }
}
