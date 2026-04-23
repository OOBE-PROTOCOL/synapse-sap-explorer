
import type { RpcTransaction } from '~/types/indexer';

let _rpcId = 0;

/** Raw JSON-RPC getTransaction — avoids web3.js deserialization for max compat */
export async function rawGetTransaction(
  signature: string,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<RpcTransaction | null> {
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
