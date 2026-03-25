/* ──────────────────────────────────────────────
 * GET /api/sap/transactions — Recent SAP program transactions
 *
 * Fetches recent transaction signatures for the SAP program,
 * then hydrates each with full parsed data via raw JSON-RPC
 * (bypasses web3.js deserialization to avoid superstruct issues).
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { getSynapseConnection, getRpcConfig } from '~/lib/sap/discovery';

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

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg: string = err?.message ?? '';
      const isTransient =
        msg.includes('EOF') ||
        msg.includes('ECONNRESET') ||
        msg.includes('socket hang up') ||
        msg.includes('getaddrinfo') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('429') ||
        msg.includes('cooldown') ||
        msg.includes('timeout');

      if (!isTransient || attempt === MAX_RETRIES) throw err;

      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 100;
      console.warn(
        `[tx retry] ${label} attempt ${attempt + 1}/${MAX_RETRIES} — ${msg.slice(0, 80)} — retrying in ${Math.round(delay)}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/* ── In-memory tx cache (avoids re-fetching on page reload) ── */
const _txCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 60_000;           // 60 seconds

/* ── Response-level cache + inflight dedup ── */
let _responseCache: { data: any; ts: number; limit: number } | null = null;
const RESPONSE_TTL_MS = 15_000;        // 15 seconds
let _inflight: Promise<any[]> | null = null;

/* ── Raw JSON-RPC getTransaction (bypasses web3.js validation) ── */
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

  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: rpcHeaders,
    body,
  });

  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();

  if (json.error) {
    throw new Error(json.error.message ?? JSON.stringify(json.error));
  }

  return json.result ?? null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? '30'), 100);

    // Response-level cache — serve immediately if fresh
    if (_responseCache && _responseCache.limit === limit &&
        Date.now() - _responseCache.ts < RESPONSE_TTL_MS) {
      const res = NextResponse.json({ transactions: _responseCache.data });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.headers.set('X-Cache', 'HIT');
      return res;
    }

    // Dedup: if another request is already fetching, wait for it
    if (_inflight) {
      const data = await _inflight;
      const res = NextResponse.json({ transactions: data.slice(0, limit) });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.headers.set('X-Cache', 'DEDUP');
      return res;
    }

    const conn = getSynapseConnection();
    const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

    // Wrap the actual fetch in a dedup-able promise
    _inflight = (async () => {

    // 1) Get signatures from Synapse node (web3.js works fine for this)
    const signatures = await withRetry(
      () => conn.getSignaturesForAddress(
        new PublicKey(SAP_PROGRAM_ADDRESS),
        { limit },
      ),
      'getSignaturesForAddress',
    );

    // 2) Hydrate each tx sequentially (avoids 429/502 rate-limit on history pool)
    const hydrated: any[] = [];

    for (const sig of signatures) {
      // Check cache first
      const cached = _txCache.get(sig.signature);
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        hydrated.push(cached.data);
        continue;
      }

      const base = {
        signature: sig.signature,
        slot: sig.slot,
        blockTime: sig.blockTime ?? null,
        err: sig.err !== null,
        memo: sig.memo ?? null,
        signer: null as string | null,
        fee: 0,
        feeSol: 0,
        programs: [] as Array<{ id: string; name: string | null }>,
        sapInstructions: [] as string[],
        instructionCount: 0,
        innerInstructionCount: 0,
        computeUnitsConsumed: null as number | null,
        signerBalanceChange: 0,
        version: 'unknown' as string,
      };

      try {
        const tx = await withRetry(
          () => rawGetTransaction(sig.signature, rpcUrl, rpcHeaders),
          sig.signature.slice(0, 12),
        );
        if (!tx) {
          hydrated.push(base);
          _txCache.set(sig.signature, { data: base, ts: Date.now() });
          continue;
        }

        const meta = tx.meta;
        const message = tx.transaction?.message;
        if (!message) {
          hydrated.push(base);
          continue;
        }

        // Account keys — raw JSON returns string arrays
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
        // Add loaded addresses from meta (v0 lookup tables)
        if (meta?.loadedAddresses) {
          const w = meta.loadedAddresses.writable ?? [];
          const r = meta.loadedAddresses.readonly ?? [];
          for (const k of [...w, ...r]) {
            const s = typeof k === 'string' ? k : String(k);
            if (!accountKeys.includes(s)) accountKeys.push(s);
          }
        }

        // Signer = first account
        const signer = accountKeys[0] ?? null;

        // Programs invoked
        const programIds = new Set<string>();

        // Top-level instructions
        const ixs = message.instructions ?? message.compiledInstructions ?? [];
        for (const ix of ixs) {
          const pid = ix.programId ?? accountKeys[ix.programIdIndex];
          if (pid) programIds.add(typeof pid === 'string' ? pid : String(pid));
        }

        // Inner instructions
        const innerIxs = meta?.innerInstructions ?? [];
        for (const inner of innerIxs) {
          for (const ix of inner.instructions ?? []) {
            const pid = ix.programId ?? accountKeys[ix.programIdIndex];
            if (pid) programIds.add(typeof pid === 'string' ? pid : String(pid));
          }
        }

        // Build programs array with names
        const programs = Array.from(programIds).map((pid) => ({
          id: pid,
          name: identifyProgram(pid),
        }));

        // SAP instruction types (parse from logs)
        const logs: string[] = meta?.logMessages ?? [];
        const sapInstructions: string[] = [];
        for (const log of logs) {
          const m = log.match(/Instruction:\s+(\w+)/);
          if (m) sapInstructions.push(m[1]);
          const m2 = log.match(/Program log:\s*Instruction:\s+(\w+)/);
          if (m2 && !sapInstructions.includes(m2[1])) sapInstructions.push(m2[1]);
        }
        if (sapInstructions.length === 0) {
          const sapInvoke = logs.some(l => l.includes(SAP_PROGRAM_ADDRESS) && l.includes('invoke'));
          if (sapInvoke) sapInstructions.push('SAPCall');
        }

        // Fee
        const fee = meta?.fee ?? 0;

        // Balance change for signer
        const preBalances = meta?.preBalances ?? [];
        const postBalances = meta?.postBalances ?? [];
        const signerBalanceChange = (postBalances[0] ?? 0) - (preBalances[0] ?? 0);

        const enriched = {
          ...base,
          signer,
          fee,
          feeSol: fee / 1e9,
          programs,
          sapInstructions,
          instructionCount: ixs.length,
          innerInstructionCount: innerIxs.reduce(
            (sum: number, inner: any) => sum + (inner.instructions?.length ?? 0),
            0,
          ),
          computeUnitsConsumed: meta?.computeUnitsConsumed ?? null,
          signerBalanceChange,
          version: tx.version ?? 'legacy',
        };

        hydrated.push(enriched);
        _txCache.set(sig.signature, { data: enriched, ts: Date.now() });
      } catch (e) {
        console.warn(`[tx enrich] Failed for ${sig.signature.slice(0,12)}:`, (e as Error).message);
        hydrated.push(base);
      }

      // Gentle pacing — 200ms between requests to stay under rate limit
      await new Promise(resolve => setTimeout(resolve, 200));
    }

      return hydrated;
    })();

    let finalData: any[];
    try {
      finalData = await _inflight;
    } finally {
      _inflight = null;
    }

    // Update response cache
    _responseCache = { data: finalData, ts: Date.now(), limit };

    const res = NextResponse.json({ transactions: finalData });
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
