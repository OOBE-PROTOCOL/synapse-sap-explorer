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

// Monitored cursor keys — only these affect exit code
const MONITORED_KEYS = new Set([...ENTITY_KEYS, ...TX_KEYS]);

// One-time / legacy cursors that should never cause a failure.
// Add entries here for backfill jobs or other one-shot operations.
const IGNORED_CURSORS = new Set(
  (process.env.HEALTH_IGNORED_CURSORS ?? 'transactions_backfill')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

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

    const ageSec = (ageMs / 1000).toFixed(0);
    const maxSec = (maxAge / 1000).toFixed(0);
    const slotInfo = row.lastSlot ? `  slot=${row.lastSlot}` : '';

    // Skip ignored cursors (one-time backfills, legacy entries, etc.)
    if (IGNORED_CURSORS.has(row.entity)) {
      console.log(`⏭️  SKIP   ${row.entity.padEnd(20)} last_sync=${ageSec}s ago  (ignored)${slotInfo}`);
      continue;
    }

    // Unknown cursors that aren't monitored: warn but don't fail
    if (!MONITORED_KEYS.has(row.entity)) {
      const status = stale ? '⚠️  STALE' : '✅ OK';
      console.log(`${status}  ${row.entity.padEnd(20)} last_sync=${ageSec}s ago  (max=${maxSec}s, unmonitored)${slotInfo}`);
      continue;
    }

    const status = stale ? '❌ STALE' : '✅ OK';
    console.log(
      `${status}  ${row.entity.padEnd(20)} last_sync=${ageSec}s ago  (max=${maxSec}s)${slotInfo}`,
    );

    if (stale) healthy = false;
  }

  // Check for missing cursors (entities that should exist)
  const existing = new Set(rows.map((r) => r.entity));
  for (const key of [...ENTITY_KEYS, ...TX_KEYS]) {
    if (!existing.has(key)) {
      console.log(`⚠️  MISSING  ${key.padEnd(20)} (never synced)`);
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

