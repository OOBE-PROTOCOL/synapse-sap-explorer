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
import { log, logErr, sleep } from './utils';

/* ── Config ───────────────────────────────────────────── */

const ENTITY_INTERVAL_MS = 60_000;       // 60s — agents, tools, escrows, etc.
const TX_INTERVAL_MS = 30_000;           // 30s — transactions
const SNAPSHOT_INTERVAL_MS = 300_000;    // 5min — network snapshots
const INTER_ENTITY_DELAY_MS = 2_000;     // 2s pause between entity fetches

const ONCE = process.argv.includes('--once');

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
  log('worker', `  Mode: ${ONCE ? 'SINGLE RUN' : 'CONTINUOUS'}`);
  log('worker', `  DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ':***@') ?? 'NOT SET'}`);
  log('worker', '═══════════════════════════════════════');

  if (!process.env.DATABASE_URL) {
    logErr('worker', 'DATABASE_URL not set! Exiting.');
    process.exit(1);
  }

  if (ONCE) {
    // Single run: all syncs sequentially, then exit
    await syncAllEntities();
    await sleep(1000);
    await syncTx();
    await sleep(1000);
    await syncSnap();
    log('worker', 'Single run complete. Exiting.');
    process.exit(0);
  }

  // Continuous mode: staggered interval loops
  log('worker', `Intervals — entities: ${ENTITY_INTERVAL_MS / 1000}s, tx: ${TX_INTERVAL_MS / 1000}s, snapshots: ${SNAPSHOT_INTERVAL_MS / 1000}s`);

  // Initial run
  await syncAllEntities();
  await syncTx();
  await syncSnap();

  // Schedule recurring cycles
  const entityTimer = setInterval(async () => {
    if (!running) return;
    await syncAllEntities();
  }, ENTITY_INTERVAL_MS);

  const txTimer = setInterval(async () => {
    if (!running) return;
    await syncTx();
  }, TX_INTERVAL_MS);

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

  log('worker', 'Worker stopped.');
  process.exit(0);
}

main().catch((e) => {
  logErr('worker', `Fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});

