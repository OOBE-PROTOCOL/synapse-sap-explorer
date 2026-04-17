// src/indexer/utils.ts — Shared helpers for the indexer worker

import type { PublicKey } from '@solana/web3.js';
import { getTableColumns, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/* ── Logger ───────────────────────────────────────────── */

export function log(label: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [indexer:${label}] ${msg}`);
}

export function logErr(label: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] [indexer:${label}] ❌ ${msg}`);
}

/* ── Retry with exponential backoff ───────────────────── */

const MAX_RETRIES     = Number(process.env.INDEXER_MAX_RETRIES ?? 6);
const BASE_DELAY_MS   = 1_000;
const MAX_DELAY_MS    = 30_000;   // cap so we don't wait forever on a single attempt

const TRANSIENT_PATTERNS = [
  'EOF', 'ECONNRESET', 'ECONNREFUSED', 'socket hang up',
  'getaddrinfo', 'ETIMEDOUT', 'EPIPE',
  '502', '503', '504', '429',
  'cooldown', 'timeout', 'upstream',
  'shared memory',            // PG 58P01
  'connection terminated',    // PG pool eviction
];

function isTransientError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return TRANSIENT_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg: string = err?.message ?? String(err);
      const cause: string = err?.cause?.message ?? '';

      if (!isTransientError(msg) && !isTransientError(cause)) throw err;
      if (attempt === MAX_RETRIES) throw err;

      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS) + Math.random() * 500;
      logErr(label, `attempt ${attempt + 1}/${MAX_RETRIES} — ${msg.slice(0, 120)} — retry in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/* ── Serialization helpers ────────────────────────────── */

/** PublicKey → base58 string, handles null/undefined/already-string */
export function pk(val: PublicKey | string | null | undefined): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val.toBase58 === 'function') return val.toBase58();
  return String(val);
}

/** BN / number / bigint → string, handles null/undefined */
export function bn(val: any): string {
  if (val == null) return '0';
  if (typeof val === 'string') return val;
  if (typeof val.toString === 'function') return val.toString();
  return String(val);
}

/** BN / number → number, handles null/undefined */
export function num(val: any): number {
  if (val == null) return 0;
  return Number(val);
}

/** BN (unix seconds) → Date, returns null for 0/null */
export function bnToDate(val: any): Date | null {
  if (val == null) return null;
  const n = Number(val);
  if (n === 0) return null;
  return new Date(n * 1000);
}

/** Byte array → hex string, handles null/undefined */
export function hashToHex(val: number[] | Uint8Array | null | undefined): string | null {
  if (!val || (Array.isArray(val) && val.length === 0)) return null;
  return Buffer.from(val).toString('hex');
}

/** Enum object { key: {} } → first key string (Anchor enum representation) */
export function enumKey(val: any): string | null {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    return keys[0] ?? null;
  }
  return String(val);
}

/* ── Drizzle upsert helper ────────────────────────────── */

/**
 * Build the `set` object for onConflictDoUpdate using `excluded.*` references.
 * Excludes the specified columns (typically the PK) from the update.
 */
export function conflictUpdateSet<T extends PgTable>(
  table: T,
  exclude: string[] = [],
): Record<string, any> {
  const cols = getTableColumns(table);
  const set: Record<string, any> = {};
  for (const [tsKey, col] of Object.entries(cols)) {
    if (exclude.includes(tsKey)) continue;
    set[tsKey] = sql.raw(`excluded."${(col as any).name}"`);
  }
  return set;
}

/* ── Pacing ───────────────────────────────────────────── */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

