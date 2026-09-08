// src/indexer/healthcheck.ts — Indexer health check
//
// Checks sync_cursors to verify the indexer is running and up-to-date.
// Exit code 0 = healthy, 1 = stale/unhealthy.
//
// Usage:
//   pnpm indexer:health
//   # or: npx tsx src/indexer/healthcheck.ts

import 'dotenv/config';

import { sql } from 'drizzle-orm';
import { db } from '~/db';
import { agents, attestations, escrows, feedbacks, syncCursors, tools, vaults } from '~/db/schema';

// Max age (ms) before a cursor is considered stale
const ENTITY_HEALING_INTERVAL_MS = Number(
  process.env.ENTITY_HEALING_INTERVAL_MS
  ?? process.env.ENTITY_INTERVAL_MS
  ?? 6 * 60 * 60 * 1000,
);
const ENTITY_MAX_AGE_MS = Number(
  process.env.HEALTH_ENTITY_MAX_AGE_MS
  ?? (ENTITY_HEALING_INTERVAL_MS + 15 * 60_000),
);
const TX_MAX_AGE_MS     = Number(process.env.HEALTH_TX_MAX_AGE_MS     ?? 10 * 60_000); // 10 min
const ENTITY_DELTA_MAX_AGE_MS = Number(process.env.HEALTH_ENTITY_DELTA_MAX_AGE_MS ?? ENTITY_MAX_AGE_MS);
const HEALTH_DB_FIRST = (process.env.HEALTH_DB_FIRST ?? 'true').toLowerCase() !== 'false';
const HEALTH_STRICT_ENTITY_FRESHNESS = (process.env.HEALTH_STRICT_ENTITY_FRESHNESS ?? 'false').toLowerCase() === 'true';
const ENTITY_TABLE_MAX_AGE_MS = Number(process.env.HEALTH_ENTITY_TABLE_MAX_AGE_MS ?? 7 * 24 * 60 * 60 * 1000); // 7d

const ENTITY_KEYS = ['agents', 'tools', 'escrows', 'attestations', 'feedbacks', 'vaults'];
const TX_KEYS     = ['transactions'];
const SKIP_KEYS = new Set(['transactions_backfill_v2']);

function isBackfillComplete(row: { entity: string; lastSlot: number | null; lastSignature: string | null }): boolean {
  return row.entity === 'transactions_backfill' && row.lastSlot === -1 && row.lastSignature === 'COMPLETE';
}

type CursorRow = {
  entity: string;
  lastSyncedAt: Date;
  lastSlot: number | null;
  lastSignature: string | null;
};

function printCursorStatus(prefix: string, row: CursorRow, ageMs: number, maxAgeMs: number) {
  const ageSec = (ageMs / 1000).toFixed(0);
  const maxSec = (maxAgeMs / 1000).toFixed(0);
  console.log(
    `${prefix}  ${row.entity.padEnd(16)} last_sync=${ageSec}s ago  (max=${maxSec}s)` +
    (row.lastSlot ? `  slot=${row.lastSlot}` : ''),
  );
}

async function readEntityFreshness(table: typeof agents | typeof tools | typeof escrows | typeof attestations | typeof feedbacks | typeof vaults) {
  const rows = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      maxIndexedAt: sql<Date | null>`MAX(${table.indexedAt})`,
    })
    .from(table);
  return rows[0] ?? { count: 0, maxIndexedAt: null };
}

async function main() {
  const rows = await db.select().from(syncCursors) as CursorRow[];

  if (rows.length === 0) {
    console.error('❌ No sync cursors found — indexer has never run.');
    process.exit(1);
  }

  const now = Date.now();
  let healthy = true;
  const byEntity = new Map(rows.map((row) => [row.entity, row]));

  const txCursor = byEntity.get('transactions');
  if (!txCursor) {
    console.log('❌ STALE  transactions     missing cursor');
    healthy = false;
  } else {
    const txAgeMs = now - new Date(txCursor.lastSyncedAt).getTime();
    const txStale = txAgeMs > TX_MAX_AGE_MS;
    printCursorStatus(txStale ? '❌ STALE' : '✅ OK', txCursor, txAgeMs, TX_MAX_AGE_MS);
    if (txStale) healthy = false;
  }

  if (HEALTH_DB_FIRST) {
    const entityDelta = byEntity.get('entity_delta');
    if (!entityDelta) {
      console.log('⚠️ WARN  entity_delta     missing cursor (no account-delta heartbeat yet)');
      if (HEALTH_STRICT_ENTITY_FRESHNESS) healthy = false;
    } else {
      const ageMs = now - new Date(entityDelta.lastSyncedAt).getTime();
      const stale = ageMs > ENTITY_DELTA_MAX_AGE_MS;
      printCursorStatus(stale ? '⚠️ WARN' : '✅ OK', entityDelta, ageMs, ENTITY_DELTA_MAX_AGE_MS);
      if (stale && HEALTH_STRICT_ENTITY_FRESHNESS) healthy = false;
    }

    const [agentsFresh, toolsFresh, escrowsFresh, attestationsFresh, feedbacksFresh, vaultsFresh] = await Promise.all([
      readEntityFreshness(agents),
      readEntityFreshness(tools),
      readEntityFreshness(escrows),
      readEntityFreshness(attestations),
      readEntityFreshness(feedbacks),
      readEntityFreshness(vaults),
    ]);

    const freshness = [
      ['agents', agentsFresh],
      ['tools', toolsFresh],
      ['escrows', escrowsFresh],
      ['attestations', attestationsFresh],
      ['feedbacks', feedbacksFresh],
      ['vaults', vaultsFresh],
    ] as const;

    for (const [entity, data] of freshness) {
      if (!data.maxIndexedAt) {
        console.log(`⚠️ WARN  ${entity.padEnd(16)} empty table`);
        if (HEALTH_STRICT_ENTITY_FRESHNESS) healthy = false;
        continue;
      }

      const ageMs = now - new Date(data.maxIndexedAt).getTime();
      const stale = ageMs > ENTITY_TABLE_MAX_AGE_MS;
      const status = stale ? '⚠️ WARN' : '✅ OK';
      const ageSec = (ageMs / 1000).toFixed(0);
      const maxSec = (ENTITY_TABLE_MAX_AGE_MS / 1000).toFixed(0);
      console.log(`${status}  ${entity.padEnd(16)} last_indexed=${ageSec}s ago  (max=${maxSec}s)  rows=${data.count}`);
      if (stale && HEALTH_STRICT_ENTITY_FRESHNESS) healthy = false;
    }
  } else {
    for (const row of rows) {
      if (SKIP_KEYS.has(row.entity)) continue;

      if (isBackfillComplete(row)) {
        console.log(`✅ OK  ${row.entity.padEnd(16)} status=complete`);
        continue;
      }

      const ageMs = now - new Date(row.lastSyncedAt).getTime();
      const maxAge = TX_KEYS.includes(row.entity) ? TX_MAX_AGE_MS : ENTITY_MAX_AGE_MS;
      const stale = ageMs > maxAge;

      printCursorStatus(stale ? '❌ STALE' : '✅ OK', row, ageMs, maxAge);

      if (stale) healthy = false;
    }
  }

  // Check for missing cursors (entities that should exist)
  const existing = new Set(rows.map((r) => r.entity));
  for (const key of [...ENTITY_KEYS, ...TX_KEYS]) {
    if (!existing.has(key)) {
      console.log(`⚠️  MISSING  ${key.padEnd(16)} (never synced)`);
      // Don't fail on missing — first deploy won't have all cursors yet
    }
  }

  console.log('');
  console.log(healthy ? '✅ Indexer is healthy.' : '❌ Indexer has stale data — check logs.');

  process.exit(healthy ? 0 : 1);
}

main().catch((e) => {
  console.error(`Health check failed: ${e.message}`);
  process.exit(1);
});
