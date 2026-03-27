// src/indexer/worker.ts — Indexer entry point
//
// Usage:
//   pnpm indexer          → continuous loop
//   pnpm indexer:once     → single run, then exit
//
// Must be first import — loads .env before any module-level code
import 'dotenv/config';

import { syncAgents } from './sync-agents';
import { syncTools } from './sync-tools';
import { syncEscrows } from './sync-escrows';
import { syncAttestations } from './sync-attestations';
import { syncFeedbacks } from './sync-feedbacks';
import { syncVaults } from './sync-vaults';
import { syncTransactions } from './sync-transactions';
import { syncSnapshots } from './sync-snapshots';
import { startGrpcTransactionStream } from './stream-transactions';
import { log, logErr, sleep } from './utils';

/* ── Config ───────────────────────────────────────────── */

const ENTITY_INTERVAL_MS = 60_000;       // 60s — agents, tools, escrows, etc.
const TX_INTERVAL_MS = 30_000;           // 30s — transactions
const TX_FALLBACK_INTERVAL_MS = 300_000; // 5min — fallback when in stream mode
const SNAPSHOT_INTERVAL_MS = 300_000;    // 5min — network snapshots
const INTER_ENTITY_DELAY_MS = 2_000;     // 2s pause between entity fetches

const ONCE = process.argv.includes('--once');
const INDEXER_MODE = (process.env.INDEXER_MODE ?? 'hybrid').toLowerCase() as 'polling' | 'stream' | 'hybrid';

/* ── Graceful shutdown ────────────────────────────────── */

let running = true;

process.on('SIGINT', () => {
  log('worker', 'SIGINT received, shutting down...');
  running = false;
});
process.on('SIGTERM', () => {
  log('worker', 'SIGTERM received, shutting down...');
  running = false;
});

process.on('unhandledRejection', (reason: any) => {
  logErr('worker', `Unhandled rejection: ${reason?.message ?? String(reason)}`);
});

process.on('uncaughtException', (err: any) => {
  logErr('worker', `Uncaught exception: ${err?.message ?? String(err)}`);
});

/* ── Sync cycles ──────────────────────────────────────── */

async function syncAllEntities() {
  log('worker', '── Entity sync cycle starting ──');
  const t0 = Date.now();

  try {
    // Agents FIRST (FK parent for everything else)
    await syncAgents();
    await sleep(INTER_ENTITY_DELAY_MS);

    // FK children — order doesn't matter between these
    await syncTools();
    await sleep(INTER_ENTITY_DELAY_MS);

    await syncEscrows();
    await sleep(INTER_ENTITY_DELAY_MS);

    await syncAttestations();
    await sleep(INTER_ENTITY_DELAY_MS);

    await syncFeedbacks();
    await sleep(INTER_ENTITY_DELAY_MS);

    await syncVaults();
  } catch (e: any) {
    logErr('worker', `Entity cycle failed: ${e.message}`);
  }

  log('worker', `── Entity sync cycle done in ${((Date.now() - t0) / 1000).toFixed(1)}s ──`);
}

async function syncTx() {
  try {
    await syncTransactions();
  } catch (e: any) {
    logErr('worker', `Transaction cycle failed: ${e.message}`);
  }
}

async function syncSnap() {
  try {
    await syncSnapshots();
  } catch (e: any) {
    logErr('worker', `Snapshot cycle failed: ${e.message}`);
  }
}

/* ── Main ─────────────────────────────────────────────── */

async function main() {
  log('worker', '═══════════════════════════════════════');
  log('worker', '  SAP Indexer Worker starting');
  log('worker', `  Run: ${ONCE ? 'SINGLE RUN' : 'CONTINUOUS'}`);
  log('worker', `  Indexer mode: ${INDEXER_MODE.toUpperCase()}`);
  log('worker', `  DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@') ?? 'NOT SET'}`);
  log('worker', '═══════════════════════════════════════');

  if (!process.env.DATABASE_URL) {
    logErr('worker', 'DATABASE_URL not set! Exiting.');
    process.exit(1);
  }

  if (ONCE) {
    // Single run always executes polling sync (deterministic smoke/cron run)
    await syncAllEntities();
    await sleep(1000);
    await syncTx();
    await sleep(1000);
    await syncSnap();
    log('worker', 'Single run complete. Exiting.');
    process.exit(0);
  }

  // Continuous mode: initial full baseline
  log('worker', 'Running initial baseline sync (entities + snapshots)...');
  await syncAllEntities();
  await syncSnap();

  // gRPC stream setup (Option B)
  let streamAbort: AbortController | null = null;
  if (INDEXER_MODE === 'stream' || INDEXER_MODE === 'hybrid') {
    streamAbort = new AbortController();
    startGrpcTransactionStream(streamAbort.signal).catch((e) => {
      logErr('worker', `gRPC stream fatal: ${e.message}`);
    });
  } else {
    // polling-only mode keeps old tx loop cadence
    await syncTx();
  }

  // Schedule recurring cycles (entities + snapshots always on)
  const entityTimer = setInterval(async () => {
    if (!running) return;
    await syncAllEntities();
  }, ENTITY_INTERVAL_MS);

  // tx timer differs by mode:
  // - polling: main mechanism every 30s
  // - stream: light fallback every 5m (keeps data flowing if stream auth is blocked)
  // - hybrid: light fallback every 5m for gap healing
  const txTimer = setInterval(async () => {
    if (!running) return;
    if (INDEXER_MODE === 'polling') {
      await syncTx();
      return;
    }
    if (INDEXER_MODE === 'hybrid' || INDEXER_MODE === 'stream') {
      await syncTx();
    }
  }, INDEXER_MODE === 'polling' ? TX_INTERVAL_MS : TX_FALLBACK_INTERVAL_MS);

  const snapTimer = setInterval(async () => {
    if (!running) return;
    await syncSnap();
  }, SNAPSHOT_INTERVAL_MS);

  // Wait for shutdown signal
  while (running) {
    await sleep(1000);
  }

  clearInterval(entityTimer);
  clearInterval(txTimer);
  clearInterval(snapTimer);
  if (streamAbort) streamAbort.abort();

  log('worker', 'Worker stopped.');
  process.exit(0);
}

main().catch((e) => {
  logErr('worker', `Fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});

