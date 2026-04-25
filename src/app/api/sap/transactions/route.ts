export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { utils } from '@coral-xyz/anchor';
import type { BorshInstructionCoder } from '@coral-xyz/anchor';
import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { getSynapseConnection, getSapClient, getRpcConfig } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectTransactions, countTransactions, upsertTransactions } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbTxToApi, apiTxToDb } from '~/lib/db/mappers';
import { rawGetTransaction } from '~/lib/rpc';
import type { ApiTransaction, ParsedAnchorEvent } from '~/types';
import type { RpcTransaction, RpcTransactionMeta, RpcTransactionMessage, RpcTokenBalance, RpcSignatureInfo, TransactionError } from '~/types/indexer';

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
    } catch (err: unknown) {
      lastErr = err;
      const msg: string = (err as Error)?.message ?? '';
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
const _txCache = new Map<string, { data: HydratedTransaction; ts: number }>();
const TX_CACHE_TTL = 120_000; // 2 minutes

/* ── Hydrate a single tx from raw RPC result ── */
type HydratedTransaction = ApiTransaction & { sapEvents?: string[] };
function hydrateTx(sig: RpcSignatureInfo, tx: RpcTransaction | null): HydratedTransaction {
  const base: HydratedTransaction = {
    signature: sig.signature,
    slot: sig.slot,
    blockTime: sig.blockTime ?? null,
    err: sig.err !== null,
    memo: sig.memo ?? null,
    signer: null,
    fee: 0, feeSol: 0,
    programs: [] as Array<{ id: string; name: string }>,
    sapInstructions: [],
    accountKeys: [],
    instructionCount: 0, innerInstructionCount: 0,
    computeUnitsConsumed: null,
    signerBalanceChange: 0,
    version: 'unknown',
    value: null,
  };

  if (!tx) return base;

  const meta: RpcTransactionMeta | undefined = tx.meta;
  const message: RpcTransactionMessage | undefined = tx.transaction?.message;
  if (!message) return base;

  type AccountKeyEntry = string | { pubkey?: string; toBase58?(): string };
  let accountKeys: string[] = [];
  if (message.accountKeys) {
    accountKeys = message.accountKeys.map((k: AccountKeyEntry) =>
      typeof k === 'string' ? k : (k.pubkey ?? k.toBase58?.() ?? String(k)),
    );
  } else if (message.staticAccountKeys) {
    accountKeys = message.staticAccountKeys.map((k: AccountKeyEntry) =>
      typeof k === 'string' ? k : (k.toBase58?.() ?? String(k)),
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
    const ixAny = ix as Record<string, unknown>;
    const pid = (ixAny.programId as string | undefined) ?? accountKeys[ixAny.programIdIndex as number];
    if (pid) programIds.add(typeof pid === 'string' ? pid : String(pid));
  }

  const innerIxs = meta?.innerInstructions ?? [];
  for (const inner of innerIxs) {
    for (const ix of inner.instructions ?? []) {
      // JSON encoding: programIdIndex into accountKeys
      // jsonParsed encoding: programId as string
      let pid: string | undefined;
      const ixAny = ix as Record<string, unknown>;
      if (typeof ixAny.programId === 'string') {
        pid = ixAny.programId;
      } else if (ixAny.programId && typeof ixAny.programId === 'object' && 'toBase58' in ixAny.programId) {
        pid = (ixAny.programId as { toBase58(): string }).toBase58();
      } else if (ixAny.programIdIndex != null && accountKeys[ixAny.programIdIndex as number]) {
        pid = accountKeys[ixAny.programIdIndex as number];
      }
      if (pid) programIds.add(pid);
    }
  }

  const programs = Array.from(programIds).map((pid) => ({
    id: pid, name: identifyProgram(pid) ?? '',
  }));

  // Decode instruction names by matching data discriminators against the IDL coder
  const sapInstructions: string[] = [];
  let sapEvents: string[] = [];
  try {
    const sap = getSapClient();
    const coder = sap.program.coder.instruction as BorshInstructionCoder;
    const sapPid = SAP_PROGRAM_ADDRESS;

    // Outer instructions targeting the SAP program
    for (const ix of ixs) {
      const ixAny = ix as Record<string, unknown>;
      const pid = ixAny.programId
        ? (typeof ixAny.programId === 'string' ? ixAny.programId : String(ixAny.programId))
        : accountKeys[ixAny.programIdIndex as number];
      if (pid !== sapPid) continue;
      const raw = ixAny.data as string | Uint8Array | undefined;
      if (!raw) continue;
      try {
        const buf = typeof raw === 'string'
          ? Buffer.from(utils.bytes.bs58.decode(raw))
          : Buffer.from(raw as Uint8Array);
        const decoded = coder.decode(buf);
        if (decoded?.name && !sapInstructions.includes(decoded.name)) {
          sapInstructions.push(decoded.name);
        }
      } catch { /* not decodable — skip */ }
    }

    // Also try inner instructions
    for (const inner of innerIxs) {
      for (const iix of inner.instructions ?? []) {
        let pid: string | undefined;
        const iixAny = iix as Record<string, unknown>;
        if (typeof iixAny.programId === 'string') pid = iixAny.programId;
        else if (iixAny.programId && typeof iixAny.programId === 'object' && 'toBase58' in iixAny.programId)
          pid = (iixAny.programId as { toBase58(): string }).toBase58();
        else if (iixAny.programIdIndex != null) pid = accountKeys[iixAny.programIdIndex as number];
        if (pid !== sapPid) continue;
        const raw = iixAny.data as string | Uint8Array | undefined;
        if (!raw) continue;
        try {
          const buf = typeof raw === 'string'
            ? Buffer.from(utils.bytes.bs58.decode(raw))
            : Buffer.from(raw as Uint8Array);
          const decoded = coder.decode(buf);
          if (decoded?.name && !sapInstructions.includes(decoded.name)) {
            sapInstructions.push(decoded.name);
          }
        } catch { /* skip */ }
      }
    }

    // Fallback: if still nothing but SAP program is present
    if (sapInstructions.length === 0 && accountKeys.includes(sapPid)) {
      sapInstructions.push('SapTransaction');
    }
  } catch {
    if (accountKeys.includes(SAP_PROGRAM_ADDRESS)) {
      sapInstructions.push('SapTransaction');
    }
  }

  // Parse events from logs
  const logMessages: string[] = meta?.logMessages ?? [];
  if (logMessages.length > 0) {
    try {
      const sap = getSapClient();
      const evts: ParsedAnchorEvent[] = sap.events.parseLogs(logMessages);
      sapEvents = evts.map((e) => e.name);
    } catch { /* EventParser can fail on malformed logs */ }
  }

  const fee = meta?.fee ?? 0;
  const preBalances = meta?.preBalances ?? [];
  const postBalances = meta?.postBalances ?? [];
  const signerBalanceChange = (postBalances[0] ?? 0) - (preBalances[0] ?? 0);

  // Compute transfer value from token balance changes
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
  const WSOL_MINT = 'So11111111111111111111111111111111111111112';
  const MINT_SYMBOLS: Record<string, string> = { [USDC_MINT]: 'USDC', [USDT_MINT]: 'USDT', [WSOL_MINT]: 'SOL' };

  let value: { amount: number; symbol: string } | null = null;
  const preTokenBals: RpcTokenBalance[] = meta?.preTokenBalances ?? [];
  const postTokenBals: RpcTokenBalance[] = meta?.postTokenBalances ?? [];
  if (postTokenBals.length > 0) {
    // Build map of account index → { mint, pre, post }
    const tokenMap = new Map<number, { mint: string; pre: number; post: number }>();
    for (const ptb of preTokenBals) {
      const amt = parseFloat(ptb.uiTokenAmount?.uiAmountString ?? '0');
      tokenMap.set(ptb.accountIndex, { mint: ptb.mint, pre: amt, post: 0 });
    }
    for (const ptb of postTokenBals) {
      const existing = tokenMap.get(ptb.accountIndex);
      const post = parseFloat(ptb.uiTokenAmount?.uiAmountString ?? '0');
      if (existing) { existing.post = post; }
      else { tokenMap.set(ptb.accountIndex, { mint: ptb.mint, pre: 0, post }); }
    }
    let best: { amount: number; symbol: string } | null = null;
    for (const [, entry] of tokenMap) {
      const change = entry.post - entry.pre;
      if (change <= 0) continue;
      const sym = MINT_SYMBOLS[entry.mint] ?? entry.mint.slice(0, 4) + '…';
      if (!best || change > best.amount) best = { amount: change, symbol: sym };
    }
    value = best;
  }
  if (!value) {
    const solMove = Math.abs(signerBalanceChange + fee) / 1e9;
    if (solMove > 0.000001) value = { amount: solMove, symbol: 'SOL' };
  }

  return {
    ...base,
    signer, fee, feeSol: fee / 1e9, programs, sapInstructions, sapEvents,
    accountKeys,
    instructionCount: ixs.length,
    innerInstructionCount: innerIxs.reduce(
      (sum: number, inner: { instructions?: unknown[] }) => sum + (inner.instructions?.length ?? 0), 0,
    ),
    computeUnitsConsumed: meta?.computeUnitsConsumed ?? null,
    signerBalanceChange,
    version: String(tx.version ?? 'legacy'),
    value,
  };
}

/* ── Parallel batch helper ── */
const BATCH_SIZE = 5;

async function fetchTxBatch(
  sigs: RpcSignatureInfo[],
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<HydratedTransaction[]> {
  const results: HydratedTransaction[] = [];

  for (let i = 0; i < sigs.length; i += BATCH_SIZE) {
    const batch = sigs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (sig: RpcSignatureInfo) => {
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
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }

    // Small pause between batches (50ms) to avoid rate limits
    if (i + BATCH_SIZE < sigs.length) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return results;
}

/* ── Main handler ── */

/**
 * Background RPC refresh — runs in swr cache with 30s TTL.
 * Fetches latest sigs from RPC, hydrates, writes to DB, returns hydrated list.
 * This is called in the background so it never blocks the response.
 */
async function backgroundRpcRefresh(limit: number): Promise<HydratedTransaction[]> {
  const conn = getSynapseConnection();
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  const signatures: Awaited<ReturnType<typeof conn.getSignaturesForAddress>> = [];
  const programPk = new PublicKey(SAP_PROGRAM_ADDRESS);
  let before: string | undefined;
  let remaining = Math.max(1, limit);

  // Solana RPC hard-cap: getSignaturesForAddress limit <= 1000.
  while (remaining > 0) {
    const chunk = Math.min(remaining, 1000);
    const page = await withRetry(
      () => conn.getSignaturesForAddress(programPk, { limit: chunk, ...(before ? { before } : {}) }),
      'getSignaturesForAddress',
    );
    if (!page.length) break;
    signatures.push(...page);
    remaining -= page.length;
    if (page.length < chunk) break;
    before = page[page.length - 1]?.signature;
  }

  const sigs: RpcSignatureInfo[] = signatures.map((s) => ({
    signature: s.signature,
    slot: s.slot,
    blockTime: s.blockTime ?? null,
    err: s.err as TransactionError,
    memo: s.memo ?? null,
  }));

  const hydrated = await fetchTxBatch(sigs, rpcUrl, rpcHeaders);

  // Write to DB (non-blocking)
  upsertTransactions(hydrated.map(apiTxToDb)).catch((e) =>
    console.warn('[transactions] DB write failed:', (e as Error).message),
  );

  return hydrated;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const perPage = Math.min(Math.max(1, Number(searchParams.get('perPage') ?? '25')), 5000);
    const afterSlot = searchParams.get('after') ? Number(searchParams.get('after')) : null;

    const limit = perPage;
    const offset = (page - 1) * perPage;

    const fetchLimit = Math.max(offset + limit, 50);
    const cacheKey = `transactions:${fetchLimit}`;

    // ── Step 1: DB read (~10ms) — always primary source ──
    let dbRows: HydratedTransaction[] = [];
    let total = 0;
    if (!isDbDown()) {
      try {
        const rows = await selectTransactions(limit, offset);
        dbRows = rows.map(dbTxToApi);
      } catch (e) {
        console.warn('[transactions] DB page read failed:', (e as Error).message);
        markDbDown();
      }

      if (dbRows.length > 0) {
        try {
          total = await countTransactions();
        } catch (e) {
          // Do not fail pagination if only count query fails.
          console.warn('[transactions] DB count failed, using fallback total:', (e as Error).message);
          total = Math.max(offset + dbRows.length, dbRows.length);
        }
      }
    }

    if (dbRows.length > 0) {
      let result = dbRows;
      if (afterSlot !== null) result = result.filter((tx) => (tx.slot as number) > afterSlot);
      // Fire-and-forget refresh only for first page without incremental filter.
      if (page === 1 && afterSlot === null) {
        swr(cacheKey, () => backgroundRpcRefresh(fetchLimit), { ttl: 30_000, swr: 300_000 }).catch(() => {});
      }
      const res = NextResponse.json({ transactions: result, total, page, perPage: limit, source: 'db' });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res;
    }

    // True cold start — no DB data. Must await RPC.
    let result: HydratedTransaction[] = [];
    try {
      result = await swr(cacheKey, () => backgroundRpcRefresh(fetchLimit), { ttl: 30_000, swr: 300_000 });
    } catch (e) {
      console.error('[transactions] RPC cold start failed:', (e as Error).message);
    }

    if (afterSlot !== null) {
      result = result.filter((tx) => (tx.slot as number) > afterSlot);
      result = result.slice(0, limit);
      const res = NextResponse.json({ transactions: result, total: result.length, page: 1, perPage: limit, source: 'rpc' });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res;
    }

    const totalRpc = result.length;
    const paged = result.slice(offset, offset + limit);

    const res = NextResponse.json({ transactions: paged, total: totalRpc, page, perPage: limit, source: 'rpc' });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  } catch (err: unknown) {
    console.error('[transactions]', err);
    return NextResponse.json(
      { error: (err as Error).message ?? 'Failed to fetch transactions' },
      { status: 500 },
    );
  }
}
