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
        // 20 connections leaves headroom for parallel route handlers
        // (each agent page fans out 8–10 endpoints concurrently).
        max: Number(process.env.DATABASE_POOL_MAX ?? 20),
        idleTimeoutMillis: 30_000,
        // 3s was too aggressive: cold acquires under load (parallel
        // hooks fanning out from one page) routinely blew past it.
        // 10s gives the pool time to spin up new connections without
        // surfacing 500s to the UI.
        connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 10_000),
        ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
}

/**
 * Some deployments have partial SQL migration history.
 * Ensure optional explorer tables exist before sync/indexers write to them.
 */
async function ensureOptionalSapTables(p: Pool): Promise<void> {
  await p.query('CREATE SCHEMA IF NOT EXISTS sap_exp');

  await p.query(`
    CREATE TABLE IF NOT EXISTS sap_exp.token_metadata (
      mint        TEXT PRIMARY KEY,
      symbol      TEXT NOT NULL,
      name        TEXT NOT NULL,
      logo        TEXT,
      uri         TEXT,
      source      TEXT NOT NULL DEFAULT 'onchain',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await p.query(`
    ALTER TABLE sap_exp.token_metadata
      ADD COLUMN IF NOT EXISTS logo TEXT,
      ADD COLUMN IF NOT EXISTS uri TEXT,
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'onchain',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS sap_exp.x402_direct_payments (
      id               BIGSERIAL PRIMARY KEY,
      signature        TEXT NOT NULL UNIQUE,
      agent_wallet     TEXT NOT NULL,
      agent_ata        TEXT NOT NULL,
      payer_wallet     TEXT NOT NULL,
      payer_ata        TEXT NOT NULL,
      amount           NUMERIC NOT NULL,
      amount_raw       NUMERIC NOT NULL,
      mint             TEXT NOT NULL,
      decimals         SMALLINT NOT NULL DEFAULT 6,
      memo             TEXT,
      has_x402_memo    BOOLEAN NOT NULL DEFAULT false,
      settlement_data  JSONB,
      slot             BIGINT NOT NULL,
      block_time       TIMESTAMPTZ,
      indexed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await p.query(`
    ALTER TABLE sap_exp.x402_direct_payments
      ADD COLUMN IF NOT EXISTS agent_ata TEXT,
      ADD COLUMN IF NOT EXISTS payer_wallet TEXT,
      ADD COLUMN IF NOT EXISTS payer_ata TEXT,
      ADD COLUMN IF NOT EXISTS amount_raw NUMERIC,
      ADD COLUMN IF NOT EXISTS mint TEXT,
      ADD COLUMN IF NOT EXISTS decimals SMALLINT NOT NULL DEFAULT 6,
      ADD COLUMN IF NOT EXISTS memo TEXT,
      ADD COLUMN IF NOT EXISTS has_x402_memo BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS settlement_data JSONB,
      ADD COLUMN IF NOT EXISTS slot BIGINT,
      ADD COLUMN IF NOT EXISTS block_time TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  `);

  await p.query('CREATE UNIQUE INDEX IF NOT EXISTS x402_direct_payments_signature_key ON sap_exp.x402_direct_payments (signature)');
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
      ensureOptionalSapTables(pool).catch((e) => {
        console.warn('[db] optional table bootstrap failed:', (e as Error).message);
      });
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

export type Database = typeof db;

