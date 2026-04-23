// src/indexer/utils.ts

import { getTableColumns, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { BNLike, NumLike, PKLike, AnchorEnum } from '~/types';

export function log(label: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [indexer:${label}] ${msg}`);
}

export function logErr(label: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] [indexer:${label}] ❌ ${msg}`);
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


/**
 * Build the `set` object for onConflictDoUpdate using `excluded.*` references.
 * Excludes the specified columns (typically the PK) from the update.
 */
export function conflictUpdateSet<T extends PgTable>(
  table: T,
  exclude: string[] = [],
): Record<string, ReturnType<typeof sql.raw>> {
  const cols = getTableColumns(table);
  const set: Record<string, ReturnType<typeof sql.raw>> = {};
  for (const [tsKey, col] of Object.entries(cols)) {
    if (exclude.includes(tsKey)) continue;
    set[tsKey] = sql.raw(`excluded."${(col as { name: string }).name}"`);
  }
  return set;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

