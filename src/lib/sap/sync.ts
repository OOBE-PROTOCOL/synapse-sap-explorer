/* x402 direct payment scan every 60s (agent ATA polling) */

import {
  SapPostgres,
  SapSyncEngine,
} from '@oobe-protocol-labs/synapse-sap-sdk';
import { getSapClient, getFallbackSapClient } from './discovery';
import { markDbUp, getSharedPool } from '~/db';
import { syncAllX402DirectPayments, reclassifyX402Payments } from './x402-scanner';
import { backfillEventsFromLogs } from '~/indexer/event-extractor';
import { invalidate, invalidatePrefix } from '~/lib/cache';

/**
 * Invalidate every read-side cache that depends on the agent set.
 * Cheap (in-memory map deletes) — call whenever new on-chain state is
 * detected so the next API hit forces a fresh `fetchEnrichedAgents()`.
 */
function invalidateAgentCaches(reason: string): void {
  invalidate('agents:enriched');
  invalidatePrefix('agents:');
  invalidatePrefix('graph:');
  invalidate('analytics');
  invalidate('volume');
  console.log(`[sap-sync] cache invalidated (${reason})`);
}

// Persist on globalThis to survive HMR reloads
const _g = globalThis as unknown as {
  __sapSync?: SapSyncEngine;
  __sapPg?: SapPostgres;
  __sapPgFallback?: SapPostgres | null;
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
    const pool = getSharedPool();
    const client = getSapClient();
    _g.__sapPg = new SapPostgres(pool, client, false);
  }
  return _g.__sapPg;
}

/**
 * Get or create a fallback SapPostgres backed by `SAP_FALLBACK_RPC_URL`
 * (e.g. Helius). Returns null when no fallback is configured.
 *
 * Used to retry sync steps when Synapse RPC returns 502 / upstream errors
 * on heavy calls like `getProgramAccounts`.
 */
function getSapPgFallback(): SapPostgres | null {
  if (_g.__sapPgFallback === undefined) {
    const fb = getFallbackSapClient();
    _g.__sapPgFallback = fb ? new SapPostgres(getSharedPool(), fb, false) : null;
    if (_g.__sapPgFallback) {
      console.log('[sap-sync] Fallback RPC configured (SAP_FALLBACK_RPC_URL)');
    }
  }
  return _g.__sapPgFallback ?? null;
}

/**
 * Heuristic: is this an upstream/network error worth retrying on the
 * fallback RPC? Matches the 502/no-upstream pattern reported by Synapse RPC.
 */
function isUpstreamError(err: unknown): boolean {
  const msg = ((err as Error)?.message ?? '').toLowerCase();
  return (
    msg.includes('502') ||
    msg.includes('no upstream') ||
    msg.includes('upstream error') ||
    msg.includes('bad gateway') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
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
      // Any new SAP tx may carry a registerAgent / updateAgent / vault op:
      // re-sync entities immediately + drop read caches so /agents reflects it.
      try {
        const pg = getSapPg();
        await pg.syncAgents();
        await pg.syncAgentStats().catch(() => {});
      } catch (e) {
        warnDedup('post-tx-resync', `[sap-sync] post-tx agent re-sync failed: ${((e as Error).message ?? '').slice(0, 120)}`);
      }
      invalidateAgentCaches(`${count} new tx`);
      // Warm `agents:enriched` synchronously so the very next /api/sap/agents/enriched
      // call returns the rebuilt payload (instead of serving the just-deleted
      // stale entry from `peek()` and only revalidating in background).
      try {
        const { swr } = await import('~/lib/cache');
        const route = await import('~/app/api/sap/agents/enriched/route');
        const fetcher = (route as unknown as { fetchEnrichedAgents?: () => Promise<unknown> }).fetchEnrichedAgents;
        if (fetcher) {
          await swr('agents:enriched', () => fetcher(), { ttl: 30_000, swr: 180_000 });
        }
      } catch (e) {
        warnDedup('warm-enriched', `[sap-sync] warm enriched cache failed: ${((e as Error).message ?? '').slice(0, 120)}`);
      }
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
  const pgFallback = getSapPgFallback();

  /**
   * Run one sync step on the primary RPC; if it fails with an upstream
   * error and a fallback is configured, retry on the fallback.
   */
  const runStep = async (
    name: string,
    fn: (p: SapPostgres) => Promise<number>,
  ): Promise<number> => {
    try {
      return await fn(pg);
    } catch (e) {
      if (pgFallback && isUpstreamError(e)) {
        warnDedup(
          `fallback:${name}`,
          `[sap-sync] ${name} primary RPC failed (${((e as Error).message ?? '').slice(0, 80)}); retrying on fallback`,
        );
        return await fn(pgFallback);
      }
      throw e;
    }
  };

  try {
    // Run individual sync steps — skip toolCategoryIndexes (enum mismatch in SDK)
    const syncSteps: [string, (p: SapPostgres) => Promise<number>][] = [
      ['agents', (p) => p.syncAgents()],
      ['agentStats', (p) => p.syncAgentStats()],
      ['feedbacks', (p) => p.syncFeedbacks()],
      ['tools', (p) => p.syncTools()],
      ['escrows', (p) => p.syncEscrows()],
      ['attestations', (p) => p.syncAttestations()],
      ['vaults', (p) => p.syncVaults()],
      ['sessions', (p) => p.syncSessions()],
      ['ledgers', (p) => p.syncLedgers()],
      ['ledgerPages', (p) => p.syncLedgerPages()],
      ['epochPages', (p) => p.syncEpochPages()],
      ['delegates', (p) => p.syncDelegates()],
      ['checkpoints', (p) => p.syncCheckpoints()],
    ];

    let total = 0;
    for (const [name, fn] of syncSteps) {
      try {
        const count = await runStep(name, fn);
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
      let touched = 0;
      for (const [stepName, fn] of syncSteps) {
        try {
          const n = await runStep(stepName, fn);
          if (typeof n === 'number') touched += n;
        } catch (e) {
          const errMsg = ((e as Error).message ?? '').slice(0, 120);
          warnDedup(`periodic:${stepName}`, `[sap-sync] periodic ${stepName} failed: ${errMsg}`);
        }
      }
      if (touched > 0) invalidateAgentCaches(`periodic +${touched}`);
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
