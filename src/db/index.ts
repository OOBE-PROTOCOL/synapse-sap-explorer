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
    const pool = new Pool({
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
    pool.on('error', (error) => {
        markDbDown();
        console.warn('[db] idle client error — circuit breaker tripped:', error.message);
    });
    return pool;
}

/**
 * Some deployments have partial SQL migration history.
 * Ensure optional explorer tables exist before sync/indexers write to them.
 */
async function ensureOptionalSapTables(p: Pool): Promise<void> {
  const safe = async (label: string, statement: string) => {
    try {
      await p.query(statement);
    } catch (e) {
      const message = (e as Error).message;
      if (/must be owner|permission denied|insufficient privilege/i.test(message)) {
        if (process.env.SAP_DB_BOOTSTRAP_LOGS === 'true') {
          console.info(`[db] optional ${label} bootstrap skipped: insufficient privileges`);
        }
        return;
      }
      console.warn(`[db] optional ${label} bootstrap failed:`, message);
    }
  };

  await p.query('CREATE SCHEMA IF NOT EXISTS sap_exp');

  try {
    await safe('token_metadata table', `
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

    await safe('token_metadata columns', `
    ALTER TABLE sap_exp.token_metadata
      ADD COLUMN IF NOT EXISTS logo TEXT,
      ADD COLUMN IF NOT EXISTS uri TEXT,
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'onchain',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  `);

    await safe('x402_direct_payments table', `
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

    await safe('x402_direct_payments columns', `
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

    await safe('x402_direct_payments signature index', 'CREATE UNIQUE INDEX IF NOT EXISTS x402_direct_payments_signature_key ON sap_exp.x402_direct_payments (signature)');
  } finally {
    await safe('truth layer entity_aliases', `
      CREATE TABLE IF NOT EXISTS sap_exp.entity_aliases (
        alias          TEXT PRIMARY KEY,
        entity_type    TEXT NOT NULL,
        canonical      TEXT NOT NULL,
        relation       TEXT NOT NULL,
        source         TEXT NOT NULL DEFAULT 'indexer',
        confidence     SMALLINT NOT NULL DEFAULT 100,
        metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
        first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await safe('truth layer entity_aliases indexes', `
      CREATE INDEX IF NOT EXISTS entity_aliases_canonical_idx
      ON sap_exp.entity_aliases (canonical)
    `);
    await safe('truth layer agent_directory_snapshots', `
      CREATE TABLE IF NOT EXISTS sap_exp.agent_directory_snapshots (
        agent_pda                TEXT PRIMARY KEY,
        wallet                   TEXT NOT NULL,
        name                     TEXT NOT NULL DEFAULT '',
        is_active                BOOLEAN NOT NULL DEFAULT false,
        is_merchant              BOOLEAN NOT NULL DEFAULT false,
        has_metaplex             BOOLEAN NOT NULL DEFAULT false,
        tool_count               INTEGER NOT NULL DEFAULT 0,
        volume_24h_lamports      NUMERIC NOT NULL DEFAULT '0',
        volume_7d_lamports       NUMERIC NOT NULL DEFAULT '0',
        total_settled_lamports   NUMERIC NOT NULL DEFAULT '0',
        calls_7d                 NUMERIC NOT NULL DEFAULT '0',
        total_calls              NUMERIC NOT NULL DEFAULT '0',
        health_score             SMALLINT NOT NULL DEFAULT 0,
        activity_score           NUMERIC NOT NULL DEFAULT '0',
        payload                  JSONB NOT NULL,
        sources                  JSONB NOT NULL,
        verified_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await safe('truth layer agent_directory_snapshots indexes', `
      CREATE INDEX IF NOT EXISTS agent_directory_snapshots_activity_idx
      ON sap_exp.agent_directory_snapshots (activity_score DESC, tool_count DESC, total_settled_lamports DESC)
    `);
    await safe('truth layer data_health_checks', `
      CREATE TABLE IF NOT EXISTS sap_exp.data_health_checks (
        id          SERIAL PRIMARY KEY,
        scope       TEXT NOT NULL,
        check_name  TEXT NOT NULL,
        status      TEXT NOT NULL,
        expected    TEXT,
        actual      TEXT,
        details     JSONB NOT NULL DEFAULT '{}'::jsonb,
        checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await safe('v2 agent snapshots', `
      CREATE TABLE IF NOT EXISTS sap_exp.agent_snapshots_v2 (
        id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        agent_pda    TEXT NOT NULL REFERENCES sap_exp.agents(pda) ON DELETE CASCADE,
        slot         BIGINT NOT NULL,
        captured_at  TIMESTAMPTZ NOT NULL,
        payload      JSONB NOT NULL,
        indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await safe('v2 agent snapshots indexes', `
      CREATE INDEX IF NOT EXISTS agent_snapshots_v2_agent_time_idx
      ON sap_exp.agent_snapshots_v2 (agent_pda, captured_at DESC)
    `);
    await safe('v2 tool snapshots', `
      CREATE TABLE IF NOT EXISTS sap_exp.tool_snapshots_v2 (
        id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tool_pda     TEXT NOT NULL REFERENCES sap_exp.tools(pda) ON DELETE CASCADE,
        slot         BIGINT NOT NULL,
        captured_at  TIMESTAMPTZ NOT NULL,
        payload      JSONB NOT NULL,
        indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await safe('v2 tool snapshots indexes', `
      CREATE INDEX IF NOT EXISTS tool_snapshots_v2_tool_time_idx
      ON sap_exp.tool_snapshots_v2 (tool_pda, captured_at DESC)
    `);
    await safe('rich tool schemas compat', `
      ALTER TABLE sap_exp.tool_schemas
        ADD COLUMN IF NOT EXISTS agent_pda TEXT,
        ADD COLUMN IF NOT EXISTS tx_signature TEXT,
        ADD COLUMN IF NOT EXISTS schema_type SMALLINT,
        ADD COLUMN IF NOT EXISTS schema_type_label TEXT,
        ADD COLUMN IF NOT EXISTS schema_data TEXT,
        ADD COLUMN IF NOT EXISTS computed_hash TEXT,
        ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS compression SMALLINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS version SMALLINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tool_name TEXT,
        ADD COLUMN IF NOT EXISTS block_time TIMESTAMPTZ
    `);
    await safe('rich tool schemas indexes', `
      CREATE UNIQUE INDEX IF NOT EXISTS tool_schemas_tool_type_version_key
      ON sap_exp.tool_schemas (tool_pda, schema_type, version)
    `);
  }
}

export function getSharedPool(): Pool {
    if (!_g.__sapSharedPool) {
        _g.__sapSharedPool = makePool();
    }
    return _g.__sapSharedPool;
}

const pool = getSharedPool();

// Probe DB in the background, but do not start with the breaker tripped.
// Critical routes such as /transactions must be allowed to try the DB on
// cold boot; otherwise the first request can fall through to RPC and render
// an empty explorer while the async probe is still succeeding.
const _probeKey = '__dbProbed';
const _gg = globalThis as unknown as Record<string, boolean>;
if (!_gg[_probeKey]) {
  _gg[_probeKey] = true;
  if (process.env.DATABASE_URL) {
    pool.query('SELECT 1').then(() => {
      ensureOptionalSapTables(pool).catch((e) => {
        console.warn('[db] optional table bootstrap failed:', (e as Error).message);
      });
      markDbUp();
      console.log('[db] connection OK — circuit breaker closed');
      // The web app must not compete with UI queries by default. Run the
      // indexer/sync worker explicitly, or opt in with SAP_SYNC_AUTOSTART=true.
      if (process.env.SAP_SYNC_AUTOSTART === 'true') {
        import('~/lib/sap/sync').then(m => m.startSapSync()).catch(err =>
          console.warn('[db] sync engine startup failed:', err.message),
        );
      }
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
