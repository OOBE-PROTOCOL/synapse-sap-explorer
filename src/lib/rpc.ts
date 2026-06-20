
import type { RpcTransaction, TransactionError } from '~/types/indexer';

let _rpcId = 0;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Raw JSON-RPC getTransaction with exponential backoff retry logic
 * Handles rate limits (429), timeouts (504), and server errors (5xx)
 */
export async function rawGetTransaction(
  signature: string,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<RpcTransaction | null> {
  let lastError: Error | null = null;
  let delay = INITIAL_DELAY_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
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
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });

      // Handle rate limiting
      if (resp.status === 429) {
        const retryAfter = resp.headers.get('Retry-After');
        const waitTime = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : delay + Math.random() * 500;
        
        console.log(`[RPC] Rate limited (429). Retrying after ${Math.round(waitTime)}ms... (attempt ${attempt}/${MAX_RETRIES})`);
        await sleep(waitTime);
        delay = Math.min(delay * 2, MAX_DELAY_MS);
        continue;
      }

      // Handle server errors
      if (!resp.ok) {
        throw new Error(`RPC HTTP ${resp.status}`);
      }

      const json = await resp.json();
      if (json.error) {
        // Handle 504 Gateway Timeout specifically
        if (json.error.code === 504 || json.error.message?.includes('timeout')) {
          const waitTime = delay + Math.random() * 500;
          console.log(`[RPC] Timeout (504). Retrying after ${Math.round(waitTime)}ms... (attempt ${attempt}/${MAX_RETRIES})`);
          await sleep(waitTime);
          delay = Math.min(delay * 2, MAX_DELAY_MS);
          continue;
        }
        throw new Error(json.error.message ?? JSON.stringify(json.error));
      }

      return json.result ?? null;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client errors (4xx except 429)
      if (lastError.message.includes('HTTP 4') && !lastError.message.includes('429')) {
        break;
      }

      if (attempt === MAX_RETRIES) {
        break;
      }

      const waitTime = delay + Math.random() * 500;
      console.log(`[RPC] Request failed. Retrying after ${Math.round(waitTime)}ms... (attempt ${attempt}/${MAX_RETRIES})`);
      await sleep(waitTime);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }
  }

  if (lastError) {
    console.error(`[RPC] Failed after ${MAX_RETRIES} attempts:`, lastError.message);
    throw lastError;
  }

  return null;
}

/** Raw JSON-RPC getSignaturesForAddress with normalized optional fields. */
export async function rawGetSignaturesForAddress(
  address: string,
  opts: { limit?: number; before?: string; until?: string },
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<Array<{ signature: string; slot: number; blockTime: number | null; err: TransactionError; memo: string | null }>> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: ++_rpcId,
    method: 'getSignaturesForAddress',
    params: [
      address,
      {
        limit: opts.limit ?? 50,
        ...(opts.before ? { before: opts.before } : {}),
        ...(opts.until ? { until: opts.until } : {}),
      },
    ],
  });

  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: rpcHeaders,
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));

  return (json.result ?? []).map((sig: Record<string, unknown>) => ({
    signature: String(sig.signature),
    slot: Number(sig.slot),
    blockTime: typeof sig.blockTime === 'number' ? sig.blockTime : null,
    err: (sig.err ?? null) as TransactionError,
    memo: typeof sig.memo === 'string' ? sig.memo : null,
  }));
}

/** Serialize Anchor event data for JSON (PublicKey→base58, BN→string, Buffer→hex) */
export function serializeEventData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (v === null || v === undefined) {
      out[k] = null;
    } else if (typeof v === 'object' && 'toBase58' in v) {
      out[k] = (v as { toBase58: () => string }).toBase58();
    } else if (typeof v === 'object' && 'toNumber' in v) {
      try { out[k] = (v as { toNumber: () => number }).toNumber(); } catch { out[k] = (v as { toString: () => string }).toString(); }
    } else if (Buffer.isBuffer(v)) {
      out[k] = (v as Buffer).toString('hex');
    } else if (v instanceof Uint8Array) {
      out[k] = Buffer.from(v).toString('hex');
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        typeof item === 'object' && item !== null ? serializeEventData(item) : item,
      );
    } else if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 1 && typeof (v as Record<string, unknown>)[keys[0]] === 'object') {
        const inner = (v as Record<string, unknown>)[keys[0]];
        if (inner && Object.keys(inner as object).length === 0) {
          out[k] = keys[0]; // Anchor enum variant
        } else {
          out[k] = serializeEventData(v);
        }
      } else {
        out[k] = serializeEventData(v);
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}
