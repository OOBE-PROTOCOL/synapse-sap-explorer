export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/transactions — Recent SAP program transactions
 *
 * Data flow (fast):
 *   1. DB read → instant (~10ms) → return to client
 *   2. Background: RPC fetch new sigs → hydrate → merge into DB
 *
 * Query params:
 *   ?limit=30       — max rows (default 30, max 100)
 *   ?after=SLOT     — only return txs newer than this slot (for polling)
 *   ?refresh=1      — force RPC refresh (non-blocking, returns DB data first)
 *
 * Performance:
 *   - DB-first: page loads in <100ms with historical data
 *   - Polling: client sends ?after=maxSlot every 12s → gets only new txs
 *   - Background RPC: runs in swr cache, never blocks response
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import { SAP_IDL } from '@oobe-protocol-labs/synapse-sap-sdk/idl';
import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { getSynapseConnection, getRpcConfig } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectTransactions, upsertTransactions } from '~/lib/db/queries';
import { dbTxToApi, apiTxToDb } from '~/lib/db/mappers';

/* ── SAP instruction decoder (discriminator-based) ── */
const sapCoder = new BorshInstructionCoder(SAP_IDL as any);

/** Snake_case → PascalCase display name */
function snakeToPascal(s: string): string {
  return s.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
}

/** Base58 decode (minimal, no deps) */
const BS58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function decodeBase58(str: string): Buffer {
  const bytes: number[] = [];
  for (const c of str) {
    const idx = BS58.indexOf(c);
    if (idx < 0) return Buffer.alloc(0);
    let carry = idx;
    for (let j = bytes.length - 1; j >= 0; j--) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.unshift(carry & 0xff); carry >>= 8; }
  }
  for (const c of str) { if (c !== '1') break; bytes.unshift(0); }
  return Buffer.from(bytes);
}

/** Decode SAP instruction data → human-readable name */
function decodeSapInstruction(data: string | null): string | null {
  if (!data) return null;
  try {
    const buf = decodeBase58(data);
    const decoded = sapCoder.decode(buf);
    if (decoded) return snakeToPascal(decoded.name);
  } catch { /* ignore */ }
  return null;
}

/* ── Program map ─────────────────────────────── */
const PROGRAMS: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'Token Program',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb': 'Token-2022',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'Associated Token',
  'ComputeBudget111111111111111111111111111111': 'Compute Budget',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': 'Memo Program',
  'Memo1UhkJBfCR7GnRtJ5UcRPEMkY2DGqMGYAS8sEy6P': 'Memo v1',
  [SAP_PROGRAM_ADDRESS]: 'SAP Program',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter v6',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
};

function identifyProgram(pubkey: string): string | null {
  return PROGRAMS[pubkey] ?? null;
}

/* ── Retry with exponential backoff ──────────────────── */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 300;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg: string = err?.message ?? '';
      const isTransient =
        msg.includes('EOF') || msg.includes('ECONNRESET') ||
        msg.includes('socket hang up') || msg.includes('getaddrinfo') ||
        msg.includes('ETIMEDOUT') || msg.includes('502') ||
        msg.includes('503') || msg.includes('504') ||
        msg.includes('429') || msg.includes('cooldown') ||
        msg.includes('timeout');
      if (!isTransient || attempt === MAX_RETRIES) throw err;
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 100;
      console.warn(`[tx retry] ${label} attempt ${attempt + 1}/${MAX_RETRIES} — ${msg.slice(0, 80)} — retrying in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/* ── Per-tx memory cache ── */
const _txCache = new Map<string, { data: any; ts: number }>();
const TX_CACHE_TTL = 120_000; // 2 minutes

/* ── Raw JSON-RPC getTransaction ── */
let _rpcId = 0;

async function rawGetTransaction(
  signature: string,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<any | null> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: ++_rpcId,
    method: 'getTransaction',
    params: [signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
  });
  const resp = await fetch(rpcUrl, { method: 'POST', headers: rpcHeaders, body });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result ?? null;
}

/* ── Hydrate a single tx from raw RPC result ── */
function hydrateTx(sig: any, tx: any): any {
  const base = {
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime ?? null,
    err: sig.err !== null,
    memo: sig.memo ?? null,
    signer: null as string | null,
    fee: 0, feeSol: 0,
    programs: [] as Array<{ id: string; name: string | null }>,
    sapInstructions: [] as string[],
    instructionCount: 0, innerInstructionCount: 0,
    computeUnitsConsumed: null as number | null,
    signerBalanceChange: 0,
    version: 'unknown' as string,
  };

  if (!tx) return base;

  const meta = tx.meta;
  const message = tx.transaction?.message;
  if (!message) return base;

  let accountKeys: string[] = [];
  if (message.accountKeys) {
    accountKeys = message.accountKeys.map((k: any) =>
      typeof k === 'string' ? k : (k.pubkey ?? k.toBase58?.() ?? String(k)),
    );
  } else if (message.staticAccountKeys) {
    accountKeys = message.staticAccountKeys.map((k: any) =>
      typeof k === 'string' ? k : String(k),
    );
  }
  if (meta?.loadedAddresses) {
    const w = meta.loadedAddresses.writable ?? [];
    const r = meta.loadedAddresses.readonly ?? [];
    for (const k of [...w, ...r]) {
      const s = typeof k === 'string' ? k : String(k);
      if (!accountKeys.includes(s)) accountKeys.push(s);
    }
  }

  const signer = accountKeys[0] ?? null;
  const programIds = new Set<string>();

  const ixs = message.instructions ?? message.compiledInstructions ?? [];
  for (const ix of ixs) {
    const pid = ix.programId ?? accountKeys[ix.programIdIndex];
    if (pid) programIds.add(typeof pid === 'string' ? pid : String(pid));
  }

  const innerIxs = meta?.innerInstructions ?? [];
  for (const inner of innerIxs) {
    for (const ix of inner.instructions ?? []) {
      // JSON encoding: programIdIndex into accountKeys
      // jsonParsed encoding: programId as string
      let pid: string | undefined;
      if (typeof ix.programId === 'string') {
        pid = ix.programId;
      } else if (ix.programId?.toBase58) {
        pid = ix.programId.toBase58();
      } else if (ix.programIdIndex != null && accountKeys[ix.programIdIndex]) {
        pid = accountKeys[ix.programIdIndex];
      }
      if (pid) programIds.add(pid);
    }
  }

  const programs = Array.from(programIds).map((pid) => ({
    id: pid, name: identifyProgram(pid),
  }));

  // Decode SAP instructions using IDL discriminator (not logs)
  const sapInstructions: string[] = [];
  for (const ix of ixs) {
    const pid = ix.programId ?? accountKeys[ix.programIdIndex];
    const pidStr = typeof pid === 'string' ? pid : String(pid);
    if (pidStr === SAP_PROGRAM_ADDRESS && ix.data) {
      const name = decodeSapInstruction(ix.data);
      if (name && !sapInstructions.includes(name)) sapInstructions.push(name);
    }
  }
  // Also check inner instructions
  for (const inner of innerIxs) {
    for (const ix of inner.instructions ?? []) {
      const pid = ix.programId ?? accountKeys[ix.programIdIndex];
      const pidStr = typeof pid === 'string' ? pid : String(pid);
      if (pidStr === SAP_PROGRAM_ADDRESS && ix.data) {
        const name = decodeSapInstruction(ix.data);
        if (name && !sapInstructions.includes(name)) sapInstructions.push(name);
      }
    }
  }

  const fee = meta?.fee ?? 0;
  const preBalances = meta?.preBalances ?? [];
  const postBalances = meta?.postBalances ?? [];
  const signerBalanceChange = (postBalances[0] ?? 0) - (preBalances[0] ?? 0);

  return {
    ...base,
    signer, fee, feeSol: fee / 1e9, programs, sapInstructions,
    accountKeys,
    instructionCount: ixs.length,
    innerInstructionCount: innerIxs.reduce(
      (sum: number, inner: any) => sum + (inner.instructions?.length ?? 0), 0,
    ),
    computeUnitsConsumed: meta?.computeUnitsConsumed ?? null,
    signerBalanceChange,
    version: tx.version ?? 'legacy',
  };
}

/* ── Parallel batch helper ── */
const BATCH_SIZE = 5;

async function fetchTxBatch(
  sigs: any[],
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<any[]> {
  const results: any[] = [];

  for (let i = 0; i < sigs.length; i += BATCH_SIZE) {
    const batch = sigs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (sig) => {
        // Check per-tx cache
        const cached = _txCache.get(sig.signature);
        if (cached && Date.now() - cached.ts < TX_CACHE_TTL) return cached.data;

        try {
          const tx = await withRetry(
            () => rawGetTransaction(sig.signature, rpcUrl, rpcHeaders),
            sig.signature.slice(0, 12),
          );
          const enriched = hydrateTx(sig, tx);
          _txCache.set(sig.signature, { data: enriched, ts: Date.now() });
          return enriched;
        } catch (e) {
          console.warn(`[tx enrich] Failed for ${sig.signature.slice(0, 12)}:`, (e as Error).message);
          return hydrateTx(sig, null);
        }
      }),
    );

    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : null);
    }

    // Small pause between batches (50ms) to avoid rate limits
    if (i + BATCH_SIZE < sigs.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return results.filter(Boolean);
}

/* ── Main handler ── */

/**
 * Background RPC refresh — runs in swr cache with 30s TTL.
 * Fetches latest sigs from RPC, hydrates, writes to DB, returns hydrated list.
 * This is called in the background so it never blocks the response.
 */
async function backgroundRpcRefresh(limit: number): Promise<any[]> {
  const conn = getSynapseConnection();
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  const signatures = await withRetry(
    () => conn.getSignaturesForAddress(
      new PublicKey(SAP_PROGRAM_ADDRESS),
      { limit },
    ),
    'getSignaturesForAddress',
  );

  const hydrated = await fetchTxBatch(signatures, rpcUrl, rpcHeaders);

  // Write to DB (non-blocking)
  upsertTransactions(hydrated.map(apiTxToDb)).catch((e) =>
    console.warn('[transactions] DB write failed:', (e as Error).message),
  );

  return hydrated;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? '30'), 100);
    const afterSlot = searchParams.get('after') ? Number(searchParams.get('after')) : null;

    const cacheKey = `transactions:${limit}`;

    // ── Step 1: Synchronous cache peek (0ms) ──
    const cached = peek<any[]>(cacheKey);
    if (cached && cached.length > 0) {
      // Cache warm — return instantly, trigger background revalidation
      let result = cached;
      if (afterSlot !== null) result = result.filter((tx: any) => tx.slot > afterSlot);
      // Fire-and-forget revalidation (swr handles stale window internally)
      swr(cacheKey, () => backgroundRpcRefresh(limit), { ttl: 30_000, swr: 300_000 }).catch(() => {});
      const res = NextResponse.json({ transactions: result, source: 'cache' });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res;
    }

    // ── Step 2: DB read (~10ms) ──
    let dbRows: any[] = [];
    try {
      dbRows = (await selectTransactions(limit)).map(dbTxToApi);
    } catch (e) {
      console.warn('[transactions] DB read failed:', (e as Error).message);
    }

    if (dbRows.length > 0) {
      // DB has data — return instantly, warm cache in background
      let result = dbRows;
      if (afterSlot !== null) result = result.filter((tx: any) => tx.slot > afterSlot);
      // Fire-and-forget: warm the SWR cache for the next request
      swr(cacheKey, () => backgroundRpcRefresh(limit), { ttl: 30_000, swr: 300_000 }).catch(() => {});
      const res = NextResponse.json({ transactions: result, source: 'db' });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res;
    }

    // ── Step 3: True cold start — no cache, no DB. Must await RPC. ──
    console.log('[transactions] Cold start — fetching from RPC synchronously');
    let result: any[] = [];
    try {
      result = await backgroundRpcRefresh(limit);
      // Also seed the SWR cache so next request is instant
      swr(cacheKey, () => Promise.resolve(result), { ttl: 30_000, swr: 300_000 }).catch(() => {});
    } catch (e) {
      console.error('[transactions] RPC cold start failed:', (e as Error).message);
    }

    if (afterSlot !== null) result = result.filter((tx: any) => tx.slot > afterSlot);

    const res = NextResponse.json({ transactions: result, source: 'rpc' });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  } catch (err: any) {
    console.error('[transactions]', err);
    return NextResponse.json(
      { error: err.message ?? 'Failed to fetch transactions' },
      { status: 500 },
    );
  }
}
