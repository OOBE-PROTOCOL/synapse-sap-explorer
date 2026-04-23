// src/db/index.ts — Database client singleton (server-only)
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import * as relations from './relations';

/**
 * Track DB health: after repeated failures, skip DB queries entirely
 * and go straight to RPC. Recheck every 2min.
 * Persisted on globalThis to survive HMR reloads in dev.
 */
const _g = globalThis as unknown as {
  __dbDown?: boolean;
  __dbDownSince?: number;
  __sapSharedPool?: Pool;
};
const DB_RECHECK_MS = 120_000;

export function isDbDown(): boolean {
  if (!_g.__dbDown) return false;
  if (Date.now() - (_g.__dbDownSince ?? 0) > DB_RECHECK_MS) {
    _g.__dbDown = false;
    return false;
  }
  return true;
}

export function markDbDown(): void {
  _g.__dbDown = true;
  _g.__dbDownSince = Date.now();
}

export function markDbUp(): void {
  _g.__dbDown = false;
}

/**
 * Single shared pg.Pool for the entire app. Cached on globalThis so HMR
 * reloads in dev don't leak connections (Next.js re-evaluates modules on
 * every save). All raw-pg consumers MUST import this via getSharedPool()
 * — never instantiate `new Pool()` elsewhere.
 */
function makePool(): Pool {
    return new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 3000,
        ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
}

export function getSharedPool(): Pool {
    if (!_g.__sapSharedPool) {
        _g.__sapSharedPool = makePool();
    }
    return _g.__sapSharedPool;
}

const pool = getSharedPool();

// Start with circuit breaker TRIPPED so no route wastes 3s on a doomed
// connection.  A background probe flips it open only if DB is reachable.
const _probeKey = '__dbProbed';
const _gg = globalThis as unknown as Record<string, boolean>;
if (!_gg[_probeKey]) {
  _gg[_probeKey] = true;
  if (!_g.__dbDown) {
    // First time ever (cold boot): trip immediately, probe async
    markDbDown();
  }
  if (process.env.DATABASE_URL) {
    pool.query('SELECT 1').then(() => {
      markDbUp();
      console.log('[db] connection OK — circuit breaker open');
      // Kick off SDK sync engine (backfill + event stream)
      import('~/lib/sap/sync').then(m => m.startSapSync()).catch(err =>
        console.warn('[db] sync engine startup failed:', err.message),
      );
    }).catch(() => {
      markDbDown();
      console.log('[db] unreachable — circuit breaker stays tripped, skipping DB for 2min');
    });
  }
}

export const db = drizzle(pool, {
    schema: { ...schema, ...relations },
});

/**
 * One-shot connection test — call from API health endpoints or startup scripts.
 * Resolves with true if the connection works, throws with the real PG error otherwise.
 */
export async function testConnection(): Promise<boolean> {
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        return true;
    } finally {
        client.release();
    }
}

export type Database = typeof db;

