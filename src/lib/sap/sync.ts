/* x402 direct payment scan every 60s (agent ATA polling) */

import { Pool } from 'pg';
import {
  SapPostgres,
  SapSyncEngine,
} from '@oobe-protocol-labs/synapse-sap-sdk';
import { getSapClient } from './discovery';
import { markDbUp } from '~/db';
import { syncAllX402DirectPayments, reclassifyX402Payments } from './x402-scanner';
import { backfillEventsFromLogs } from '~/indexer/event-extractor';

// Persist on globalThis to survive HMR reloads
const _g = globalThis as unknown as {
  __sapSync?: SapSyncEngine;
  __sapPg?: SapPostgres;
  __sapSyncStarted?: boolean;
  __sapGrpcAbort?: AbortController;
  __sapEntityInterval?: ReturnType<typeof setInterval>;
  __sapTxPollInterval?: ReturnType<typeof setInterval>;
};

const ENTITY_SYNC_MS = 60_000;  // re-sync entities every 60s
const TX_POLL_MS = 20_000;      // RPC poll for SAP TXs every 20s

// Dedup map: suppress repeated identical errors for 5 min
const _warnSeen = new Map<string, number>();
function warnDedup(key: string, msg: string, cooldownMs = 5 * 60_000) {
  const now = Date.now();
  if ((now - (_warnSeen.get(key) ?? 0)) > cooldownMs) {
    _warnSeen.set(key, now);
    console.warn(msg);
  }
}

/**
 * Get or create the SapPostgres instance (raw pg Pool, NOT Drizzle).
 */
function getSapPg(): SapPostgres {
  if (!_g.__sapPg) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });
    const client = getSapClient();
    _g.__sapPg = new SapPostgres(pool, client, false);
  }
  return _g.__sapPg;
}

/* ── gRPC live stream (replaces WebSocket) ────────────── */

async function startGrpcStream(): Promise<void> {
  // Lazy-import to avoid loading gRPC in every Next.js route
  try {
    const { startGrpcTransactionStream } = await import('~/indexer/stream-transactions');
    const abort = new AbortController();

    // Clean up previous stream if any (HMR)
    if (_g.__sapGrpcAbort) {
      _g.__sapGrpcAbort.abort();
    }
    _g.__sapGrpcAbort = abort;

    // Non-blocking — runs in background with its own backoff loop
    startGrpcTransactionStream(abort.signal).catch((err) => {
      console.warn('[sap-sync] gRPC stream exited permanently:', (err as Error).message);
      console.warn('[sap-sync] RPC polling continues as primary data source');
    });

    console.log('[sap-sync] gRPC live stream started (native Geyser Subscribe)');
  } catch (err) {
    console.warn('[sap-sync] gRPC stream unavailable:', (err as Error).message);
    console.warn('[sap-sync] Using RPC polling as primary data source');
  }
}

/* ── RPC polling for SAP program TXs ─────────────────── */

async function pollSapTransactions(): Promise<void> {
  try {
    const { syncTransactions } = await import('~/indexer/sync-transactions');
    const count = await syncTransactions();
    if (count > 0) {
      console.log(`[sap-sync] RPC poll: ${count} new SAP transactions`);
    }
  } catch (err) {
    console.warn('[sap-sync] RPC tx poll failed:', (err as Error).message);
  }
}

/**
 * Start the sync engine (idempotent — safe to call multiple times).
 *
 * 1. Runs a one-shot full sync (backfill)
 * 2. Starts gRPC live stream for SAP TXs
 * 3. Starts RPC polling for SAP TXs (gap-fill)
 * 4. Periodically re-syncs entities every 60s
 * 5. Scans x402 direct payments every 60s
 */
export async function startSapSync(): Promise<void> {
  if (_g.__sapSyncStarted) return;
  _g.__sapSyncStarted = true;

  const pg = getSapPg();

  try {
    // Run individual sync steps — skip toolCategoryIndexes (enum mismatch in SDK)
    const syncSteps: [string, () => Promise<number>][] = [
      ['agents', () => pg.syncAgents()],
      ['agentStats', () => pg.syncAgentStats()],
      ['feedbacks', () => pg.syncFeedbacks()],
      ['tools', () => pg.syncTools()],
      ['escrows', () => pg.syncEscrows()],
      ['attestations', () => pg.syncAttestations()],
      ['vaults', () => pg.syncVaults()],
      ['sessions', () => pg.syncSessions()],
      ['ledgers', () => pg.syncLedgers()],
      ['ledgerPages', () => pg.syncLedgerPages()],
      ['epochPages', () => pg.syncEpochPages()],
      ['delegates', () => pg.syncDelegates()],
      ['checkpoints', () => pg.syncCheckpoints()],
    ];

    let total = 0;
    for (const [name, fn] of syncSteps) {
      try {
        const count = await fn();
        total += count;
      } catch (e) {
        console.warn(`[sap-sync] ${name} failed:`, (e as Error).message);
      }
    }
    console.log(`[sap-sync] Initial sync complete: ${total} records`);
    markDbUp();

    // ── gRPC live stream for SAP txs ──
    await startGrpcStream();

    // ── RPC polling for SAP TXs (gap-fill every 20s) ──
    if (_g.__sapTxPollInterval) clearInterval(_g.__sapTxPollInterval);
    _g.__sapTxPollInterval = setInterval(pollSapTransactions, TX_POLL_MS);
    // Immediate first poll
    pollSapTransactions().catch(() => {});
    console.log(`[sap-sync] RPC tx polling started (every ${TX_POLL_MS / 1000}s)`);

    // ── Entity re-sync every 60s ──
    if (_g.__sapEntityInterval) clearInterval(_g.__sapEntityInterval);
    _g.__sapEntityInterval = setInterval(async () => {
      for (const [stepName, fn] of syncSteps) {
        try { await fn(); } catch (e) {
          const errMsg = ((e as Error).message ?? '').slice(0, 120);
          warnDedup(`periodic:${stepName}`, `[sap-sync] periodic ${stepName} failed: ${errMsg}`);
        }
      }
      // x402 direct payment scan (piggyback on periodic sync)
      try { await syncAllX402DirectPayments(); } catch (e) {
        warnDedup('x402-scan', `[sap-sync] x402 scan failed: ${((e as Error).message ?? '').slice(0, 120)}`);
      }
    }, ENTITY_SYNC_MS);
    console.log(`[sap-sync] Entity sync started (every ${ENTITY_SYNC_MS / 1000}s)`);

    // Initial x402 scan (after agents are synced)
    syncAllX402DirectPayments().catch(() => { /* non-blocking */ });

    // Reclassify any previously misclassified x402 transactions
    reclassifyX402Payments().catch(() => { /* non-blocking */ });

    // Backfill SAP events from already-indexed transaction logs
    backfillEventsFromLogs()
      .then((n) => { if (n > 0) console.log(`[sap-sync] Backfilled ${n} events from tx logs`); })
      .catch(() => { /* non-blocking */ });
  } catch (err) {
    console.error('[sap-sync] Failed to start:', (err as Error).message);
    _g.__sapSyncStarted = false;
  }
}

/**
 * Get the SapPostgres instance for direct queries (e.g. getRecentEvents).
 */
export function getSapPostgres(): SapPostgres {
  return getSapPg();
}
