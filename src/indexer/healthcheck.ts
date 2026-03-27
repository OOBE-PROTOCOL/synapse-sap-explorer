// src/indexer/healthcheck.ts — Indexer health check
//
// Checks sync_cursors to verify the indexer is running and up-to-date.
// Exit code 0 = healthy, 1 = stale/unhealthy.
//
// Usage:
//   pnpm indexer:health
//   # or: npx tsx src/indexer/healthcheck.ts

import 'dotenv/config';

import { db } from '~/db';
import { syncCursors } from '~/db/schema';

// Max age (ms) before a cursor is considered stale
const ENTITY_MAX_AGE_MS = Number(process.env.HEALTH_ENTITY_MAX_AGE_MS ?? 15 * 60_000); // 15 min
const TX_MAX_AGE_MS     = Number(process.env.HEALTH_TX_MAX_AGE_MS     ?? 10 * 60_000); // 10 min

const ENTITY_KEYS = ['agents', 'tools', 'escrows', 'attestations', 'feedbacks', 'vaults'];
const TX_KEYS     = ['transactions'];

async function main() {
  const rows = await db.select().from(syncCursors);

  if (rows.length === 0) {
    console.error('❌ No sync cursors found — indexer has never run.');
    process.exit(1);
  }

  const now = Date.now();
  let healthy = true;

  for (const row of rows) {
    const ageMs = now - new Date(row.lastSyncedAt).getTime();
    const maxAge = TX_KEYS.includes(row.entity) ? TX_MAX_AGE_MS : ENTITY_MAX_AGE_MS;
    const stale = ageMs > maxAge;

    const status = stale ? '❌ STALE' : '✅ OK';
    const ageSec = (ageMs / 1000).toFixed(0);
    const maxSec = (maxAge / 1000).toFixed(0);

    console.log(
      `${status}  ${row.entity.padEnd(16)} last_sync=${ageSec}s ago  (max=${maxSec}s)` +
      (row.lastSlot ? `  slot=${row.lastSlot}` : ''),
    );

    if (stale) healthy = false;
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

