import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { getRpcConfig } from '~/lib/sap/discovery';
import type { TransactionError } from '~/types/indexer';
import { log, logErr, withRetry, sleep } from './utils';
import { getCursor, setCursor } from './cursor';
import { hydrateTx, upsertHydratedTx, type SignatureLike } from './tx-pipeline';
import { extractAndInsertEvents } from './event-extractor';

let _rpcId = 0;

/** Raw getSignaturesForAddress — bypasses web3.js superstruct validation */
async function rawGetSignaturesForAddress(
  address: string,
  opts: { limit?: number; before?: string; until?: string },
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<Array<{ signature: string; slot: number; blockTime: number | null; err: TransactionError; memo: string | null }>> {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: rpcHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++_rpcId,
      method: 'getSignaturesForAddress',
      params: [address, { limit: opts.limit ?? 50, ...(opts.before ? { before: opts.before } : {}), ...(opts.until ? { until: opts.until } : {}) }],
    }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return (json.result ?? []).map((s: Record<string, unknown>) => ({
    signature: s.signature as string,
    slot: s.slot as number,
    blockTime: (s.blockTime as number) ?? null,
    err: (s.err ?? null) as TransactionError,
    memo: (s.memo as string) ?? null,
  }));
}

async function rawGetTransaction(signature: string, rpcUrl: string, rpcHeaders: Record<string, string>) {
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: rpcHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++_rpcId,
      method: 'getTransaction',
      params: [signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }],
    }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result ?? null;
}

/** Process a single transaction: hydrate → upsert → extract events */
async function processTx(
  sig: SignatureLike,
  rpcUrl: string,
  rpcHeaders: Record<string, string>,
): Promise<boolean> {
  const tx = await withRetry(
    () => rawGetTransaction(sig.signature, rpcUrl, rpcHeaders),
    sig.signature.slice(0, 8),
  );

  const { txRow, detailRow } = hydrateTx(sig, tx);
  await upsertHydratedTx(txRow, detailRow);

  if (detailRow?.logs && detailRow.logs.length > 0) {
    try {
      const evtCount = await extractAndInsertEvents(
        detailRow.logs,
        sig.signature,
        sig.slot,
        sig.blockTime ?? null,
        txRow.signer ?? null,
      );
      if (evtCount > 0) log('tx', `  → ${evtCount} events from ${sig.signature.slice(0, 12)}`);
    } catch (e) { console.warn(`[tx] event extraction failed for ${sig.signature.slice(0, 12)}:`, (e as Error).message); }
  }

  return true;
}

async function syncForward(): Promise<number> {
  const cursor = await getCursor('transactions');
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  const fetchOpts: { limit: number; until?: string } = { limit: 50 };
  if (cursor.lastSignature) {
    fetchOpts.until = cursor.lastSignature;
  }

  const signatures = await withRetry(
    () => rawGetSignaturesForAddress(SAP_PROGRAM_ADDRESS, fetchOpts, rpcUrl, rpcHeaders),
    'tx:signatures:forward',
  );

  if (signatures.length === 0) {
    await setCursor('transactions', {
      lastSlot: cursor.lastSlot,
      lastSignature: cursor.lastSignature,
    });
    return 0;
  }

  log('tx', `[forward] ${signatures.length} new signatures`);
  let inserted = 0;

  // Process oldest first so cursor advances correctly
  for (const sig of signatures.reverse()) {
    try {
      await processTx(
        { signature: sig.signature, slot: sig.slot, blockTime: sig.blockTime ?? null, err: sig.err, memo: sig.memo ?? null },
        rpcUrl, rpcHeaders,
      );
      inserted++;
      await setCursor('transactions', { lastSlot: sig.slot, lastSignature: sig.signature });
    } catch (e: unknown) {
      logErr('tx', `Failed ${sig.signature.slice(0, 12)}: ${(e as Error).message}`);
    }
    await sleep(200);
  }

  return inserted;
}

async function syncBackfill(): Promise<number> {
  const backfillCursor = await getCursor('transactions_backfill');

  // If backfill is already marked complete, skip
  if (backfillCursor.lastSlot === -1) return 0;

  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  log('tx', '[backfill] Starting backward pagination…');

  let totalInserted = 0;
  let pageCount = 0;
  let beforeSig = backfillCursor.lastSignature ?? undefined;
  const MAX_PAGES_PER_CYCLE = 10; // Limit per cycle to avoid blocking

  while (pageCount < MAX_PAGES_PER_CYCLE) {
    const fetchOpts: { limit: number; before?: string } = { limit: 100 };
    if (beforeSig) fetchOpts.before = beforeSig;

    const signatures = await withRetry(
      () => rawGetSignaturesForAddress(SAP_PROGRAM_ADDRESS, fetchOpts, rpcUrl, rpcHeaders),
      `tx:signatures:backfill:p${pageCount}`,
    );

    if (signatures.length === 0) {
      // Reached the beginning — mark backfill complete
      log('tx', `[backfill] Complete! No more signatures. Total inserted this run: ${totalInserted}`);
      await setCursor('transactions_backfill', { lastSlot: -1, lastSignature: 'COMPLETE' });
      return totalInserted;
    }

    log('tx', `[backfill] Page ${pageCount + 1}: ${signatures.length} signatures (oldest: slot ${signatures[signatures.length - 1].slot})`);

    // Process in order (newest in page first is fine since we're going backwards)
    for (const sig of signatures) {
      try {
        await processTx(
          { signature: sig.signature, slot: sig.slot, blockTime: sig.blockTime ?? null, err: sig.err, memo: sig.memo ?? null },
          rpcUrl, rpcHeaders,
        );
        totalInserted++;
      } catch (e: unknown) {
        logErr('tx', `[backfill] Failed ${sig.signature.slice(0, 12)}: ${(e as Error).message}`);
      }
      await sleep(150);
    }

    // Update cursor to the oldest signature in this page
    const oldest = signatures[signatures.length - 1];
    beforeSig = oldest.signature;
    await setCursor('transactions_backfill', {
      lastSlot: oldest.slot,
      lastSignature: oldest.signature,
    });

    pageCount++;
  }

  log('tx', `[backfill] Paused after ${pageCount} pages, ${totalInserted} txs. Will resume next cycle.`);
  return totalInserted;
}

/* ── Main sync function ──────────────────────────────── */

export async function syncTransactions(): Promise<number> {
  log('tx', 'Starting incremental transaction sync...');

  // 1. Forward: get new transactions
  const forward = await syncForward();
  if (forward > 0) log('tx', `[forward] Done: ${forward} new transactions`);
  else log('tx', 'No new transactions');

  // 2. Backfill: paginate backwards to genesis
  const backfill = await syncBackfill();
  if (backfill > 0) log('tx', `[backfill] Done: ${backfill} historical transactions`);

  return forward + backfill;
}

