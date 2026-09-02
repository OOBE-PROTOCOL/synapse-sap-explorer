// src/indexer/utils.ts

import type { BNLike, NumLike, PKLike, AnchorEnum } from '~/types';
import { asPublicKeyText } from '~/lib/format';
export { conflictUpdateSet, conflictUpdateWhere } from '~/lib/db/upsert';

export function log(label: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [indexer:${label}] ${msg}`);
}

export function logErr(label: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] [indexer:${label}] ❌ ${msg}`);
}

const SENSITIVE_QUERY_KEYS = new Set(['api-key', 'apikey', 'key', 'token', 'x-api-key']);

export function maskSecret(value: string | null | undefined): string {
  if (!value) return '(empty)';
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-1)}`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export function redactRpcUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.username) u.username = maskSecret(u.username);
    if (u.password) u.password = maskSecret(u.password);
    for (const key of Array.from(u.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        u.searchParams.set(key, maskSecret(u.searchParams.get(key)));
      }
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

function rpcDebugEnabled(): boolean {
  return (process.env.INDEXER_RPC_DEBUG ?? 'false').toLowerCase() === 'true';
}

export function logRpcTarget(
  label: string,
  method: string,
  rpcUrl: string,
  rpcHeaders?: Record<string, string>,
): void {
  if (!rpcDebugEnabled()) return;
  const apiKey = rpcHeaders?.['x-api-key'] ?? rpcHeaders?.['X-API-Key'] ?? process.env.SYNAPSE_API_KEY ?? '';
  log(label, `RPC ${method} -> ${redactRpcUrl(rpcUrl)} x-api-key=${maskSecret(apiKey)}`);
}

export function formatError(err: unknown): string {
  const error = err as Error & {
    cause?: unknown;
    code?: string;
    detail?: string;
    constraint?: string;
    table?: string;
    schema?: string;
  };
  const cause = error.cause as
    | (Error & {
        code?: string;
        detail?: string;
        constraint?: string;
        table?: string;
        schema?: string;
      })
    | undefined;

  const parts = [
    error.message,
    cause?.message && `cause=${cause.message}`,
    (cause?.code ?? error.code) && `code=${cause?.code ?? error.code}`,
    (cause?.schema ?? error.schema) && `schema=${cause?.schema ?? error.schema}`,
    (cause?.table ?? error.table) && `table=${cause?.table ?? error.table}`,
    (cause?.constraint ?? error.constraint) && `constraint=${cause?.constraint ?? error.constraint}`,
    (cause?.detail ?? error.detail) && `detail=${cause?.detail ?? error.detail}`,
  ].filter(Boolean);

  return parts.join(' | ');
}


const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg: string = (err as Error)?.message ?? '';
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

      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 200;
      logErr(label, `attempt ${attempt + 1}/${MAX_RETRIES} — ${msg.slice(0, 80)} — retry in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}


/** PublicKey → base58 string, handles null/undefined/already-string */
export function pk(val: PKLike | unknown): string {
  if (!val) return '';
  const normalized = asPublicKeyText(val);
  if (normalized) return normalized;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && 'toBase58' in val && typeof val.toBase58 === 'function') return val.toBase58();
  return String(val);
}

/** BN / number / bigint → string, handles null/undefined */
export function bn(val: BNLike | unknown): string {
  if (val == null) return '0';
  if (typeof val === 'string') return val;
  return val.toString();
}

/** BN / number → number, handles null/undefined */
export function num(val: NumLike | unknown): number {
  if (val == null) return 0;
  return Number(val);
}

/** BN (unix seconds) → Date, returns null for 0/null */
export function bnToDate(val: BNLike | unknown): Date | null {
  if (val == null) return null;
  const n = Number(val);
  if (n === 0) return null;
  return new Date(n * 1000);
}

/** Byte array → hex string, handles null/undefined */
export function hashToHex(val: number[] | Uint8Array | unknown): string | null {
  if (!val || (Array.isArray(val) && val.length === 0)) return null;
  return Buffer.from(val as number[] | Uint8Array).toString('hex');
}

/** Enum object { key: {} } → first key string (Anchor enum representation) */
export function enumKey(val: AnchorEnum | null | undefined | unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    return keys[0] ?? null;
  }
  return String(val);
}


export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
