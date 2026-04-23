/**
 * Shared Token Metadata Service
 *
 * Single source of truth for SPL token metadata resolution.
 * Resolution chain: KNOWN_TOKENS → DB cache → On-chain (Token-2022) → Metaplex PDA → fallback.
 * Resolved metadata is persisted to the `token_metadata` DB table.
 *
 * Usage (server-only):
 *   import { resolveTokens } from '~/lib/sap/token-metadata';
 *   const metaMap = await resolveTokens(['EPjFWdd5...', 'So111...']);
 */

import { PublicKey } from '@solana/web3.js';
import { eq, inArray } from 'drizzle-orm';
import { db, isDbDown } from '~/db';
import { tokenMetadata } from '~/db/schema';
import { getRpcConfig } from '~/lib/sap/discovery';

/* ── Types ────────────────────────────────────── */

export interface TokenMeta {
  mint: string;
  symbol: string;
  name: string;
  logo: string | null;
  uri?: string | null;
  updateAuthority?: string | null;
  source: 'known' | 'onchain' | 'metaplex' | 'fallback';
}

/* ── Well-known tokens (instant, no RPC needed) ─ */

const KNOWN_TOKENS: Record<string, Omit<TokenMeta, 'mint'>> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: 'USDC', name: 'USD Coin', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png', source: 'known' },
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': { symbol: 'USDC', name: 'USD Coin (Devnet)', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png', source: 'known' },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: 'USDT', name: 'Tether USD', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg', source: 'known' },
  So11111111111111111111111111111111111111112: { symbol: 'WSOL', name: 'Wrapped SOL', logo: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', source: 'known' },
};

/* ── In-memory L1 cache (process-level, 10 min TTL) ── */

const memCache = new Map<string, { meta: TokenMeta; ts: number }>();
const MEM_TTL = 10 * 60 * 1000;
/** DB rows are considered fresh for 24h */
const DB_FRESHNESS = 24 * 60 * 60 * 1000;

/* ── Metaplex constant ───────────────────────── */

const METAPLEX_METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/* ── Public API ──────────────────────────────── */

/**
 * Resolve metadata for a list of mints.
 * Returns a Map<mint, TokenMeta>.
 */
export async function resolveTokens(mints: string[]): Promise<Map<string, TokenMeta>> {
  const unique = [...new Set(mints.filter(Boolean))];
  const result = new Map<string, TokenMeta>();
  const toResolve: string[] = [];

  // 1) KNOWN_TOKENS + mem cache
  for (const mint of unique) {
    const known = KNOWN_TOKENS[mint];
    if (known) {
      result.set(mint, { mint, ...known });
      continue;
    }
    const cached = memCache.get(mint);
    if (cached && Date.now() - cached.ts < MEM_TTL) {
      result.set(mint, cached.meta);
      continue;
    }
    toResolve.push(mint);
  }

  if (toResolve.length === 0) return result;

  // 2) DB cache lookup
  const toFetchOnChain: string[] = [];
  if (!isDbDown()) {
    try {
      const rows = await db
        .select()
        .from(tokenMetadata)
        .where(
          toResolve.length === 1
            ? eq(tokenMetadata.mint, toResolve[0])
            : inArray(tokenMetadata.mint, toResolve),
        );

      for (const row of rows) {
        const fresh = Date.now() - new Date(row.updatedAt).getTime() < DB_FRESHNESS;
        if (fresh) {
          const meta: TokenMeta = {
            mint: row.mint,
            symbol: row.symbol,
            name: row.name,
            logo: row.logo,
            uri: row.uri,
            source: row.source as TokenMeta['source'],
          };
          result.set(row.mint, meta);
          memCache.set(row.mint, { meta, ts: Date.now() });
        } else {
          toFetchOnChain.push(row.mint);
        }
      }

      // Mints not found in DB at all
      const foundInDb = new Set(rows.map((r) => r.mint));
      for (const mint of toResolve) {
        if (!foundInDb.has(mint) && !result.has(mint)) {
          toFetchOnChain.push(mint);
        }
      }
    } catch (e) {
      console.warn('[token-meta] DB read failed:', (e as Error).message);
      toFetchOnChain.push(...toResolve.filter((m) => !result.has(m)));
    }
  } else {
    toFetchOnChain.push(...toResolve);
  }

  if (toFetchOnChain.length === 0) return result;

  // 3) On-chain resolution (chunks of 10)
  const CHUNK = 10;
  for (let i = 0; i < toFetchOnChain.length; i += CHUNK) {
    const chunk = toFetchOnChain.slice(i, i + CHUNK);
    const resolved = await Promise.all(chunk.map((m) => resolveOne(m)));
    for (const meta of resolved) {
      result.set(meta.mint, meta);
      memCache.set(meta.mint, { meta, ts: Date.now() });
    }
    // Persist to DB (fire-and-forget)
    persistBatch(resolved).catch((e) =>
      console.warn('[token-meta] DB write failed:', (e as Error).message),
    );
  }

  return result;
}

/**
 * Single-mint convenience wrapper.
 */
export async function resolveToken(mint: string): Promise<TokenMeta> {
  const map = await resolveTokens([mint]);
  return map.get(mint)!;
}

/* ── Internal: single mint resolution chain ──── */

async function resolveOne(mint: string): Promise<TokenMeta> {
  // Token-2022 on-chain metadata
  const onChain = await resolveViaOnChain(mint);
  if (onChain) return onChain;

  // Metaplex PDA fallback
  const metaplex = await resolveViaMetaplex(mint);
  if (metaplex) return metaplex;

  // Final fallback
  return {
    mint,
    symbol: mint.slice(0, 6) + '…',
    name: 'Unknown Token',
    logo: null,
    source: 'fallback',
  };
}

/* ── Token-2022 extension resolution ─────────── */

async function resolveViaOnChain(mint: string): Promise<TokenMeta | null> {
  try {
    const { url, headers } = getRpcConfig();
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAccountInfo',
        params: [mint, { encoding: 'jsonParsed' }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as {
      result?: {
        value?: {
          data?: {
            parsed?: {
              info?: {
                extensions?: { extension: string; state?: { name?: string; symbol?: string; uri?: string; updateAuthority?: string } }[];
              };
            };
          };
        };
      };
    };
    const extensions = data?.result?.value?.data?.parsed?.info?.extensions;
    if (!extensions) return null;

    const meta = extensions.find((e) => e.extension === 'tokenMetadata');
    if (!meta?.state) return null;

    const { name, symbol, uri, updateAuthority } = meta.state;
    if (!name && !symbol) return null;

    const logo = await fetchLogoFromUri(uri);
    return {
      mint,
      symbol: symbol || mint.slice(0, 4) + '…',
      name: name || 'Unknown',
      logo,
      uri,
      updateAuthority: updateAuthority || null,
      source: 'onchain',
    };
  } catch {
    return null;
  }
}

/* ── Metaplex PDA resolution ─────────────────── */

async function resolveViaMetaplex(mint: string): Promise<TokenMeta | null> {
  try {
    const mintPk = new PublicKey(mint);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METAPLEX_METADATA_PROGRAM.toBuffer(), mintPk.toBuffer()],
      METAPLEX_METADATA_PROGRAM,
    );

    const { url, headers } = getRpcConfig();
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAccountInfo',
        params: [pda.toBase58(), { encoding: 'base64' }],
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as {
      result?: { value?: { data?: [string, string] } };
    };
    const raw = data?.result?.value?.data?.[0];
    if (!raw) return null;

    const buf = Buffer.from(raw, 'base64');
    // Metaplex layout: key(1) + updateAuth(32) + mint(32) = offset 65
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
      mint,
      symbol: symbol || mint.slice(0, 4) + '…',
      name: name || 'Unknown',
      logo,
      uri: uri || undefined,
      updateAuthority: updateAuth,
      source: 'metaplex',
    };
  } catch {
    return null;
  }
}

/* ── Off-chain JSON fetch for logos ──────────── */

async function fetchLogoFromUri(uri: string | undefined | null): Promise<string | null> {
  if (!uri) return null;
  try {
    let fetchUrl = uri;
    if (fetchUrl.startsWith('ipfs://')) {
      fetchUrl = 'https://ipfs.io/ipfs/' + fetchUrl.slice(7);
    }
    if (!fetchUrl.startsWith('http')) return null;

    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(4000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json() as { image?: string };
    const img = json?.image;
    if (!img || typeof img !== 'string') return null;
    if (img.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + img.slice(7);
    return img.startsWith('http') ? img : null;
  } catch {
    return null;
  }
}

/* ── DB persistence ──────────────────────────── */

async function persistBatch(metas: TokenMeta[]) {
  if (isDbDown() || metas.length === 0) return;
  for (const meta of metas) {
    await db
      .insert(tokenMetadata)
      .values({
        mint: meta.mint,
        symbol: meta.symbol,
        name: meta.name,
        logo: meta.logo,
        uri: meta.uri ?? null,
        source: meta.source,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: tokenMetadata.mint,
        set: {
          symbol: meta.symbol,
          name: meta.name,
          logo: meta.logo,
          uri: meta.uri ?? null,
          source: meta.source,
          updatedAt: new Date(),
        },
      });
  }
}
