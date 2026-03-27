// src/indexer/sync-transactions.ts — Incremental polling transaction sync
import { PublicKey } from '@solana/web3.js';
import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { getSynapseConnection, getRpcConfig } from '~/lib/sap/discovery';
import { log, logErr, withRetry, sleep } from './utils';
import { getCursor, setCursor } from './cursor';
import { hydrateTx, upsertHydratedTx } from './tx-pipeline';

let _rpcId = 0;

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

/* ── Main sync function ──────────────────────────────── */

export async function syncTransactions(): Promise<number> {
  log('tx', 'Starting incremental transaction sync...');

  const cursor = await getCursor('transactions');
  const conn = getSynapseConnection();
  const { url: rpcUrl, headers: rpcHeaders } = getRpcConfig();

  // Fetch signatures (newest first). If we have a cursor, only fetch newer ones.
  const fetchOpts: any = { limit: 50 };
  if (cursor.lastSignature) {
    fetchOpts.until = cursor.lastSignature;
  }

  const signatures = await withRetry(
    () => conn.getSignaturesForAddress(new PublicKey(SAP_PROGRAM_ADDRESS), fetchOpts),
    'tx:signatures',
  );

  if (signatures.length === 0) {
    log('tx', 'No new transactions');
    return 0;
  }

  log('tx', `Found ${signatures.length} new signatures to process`);

  let inserted = 0;

  // Process oldest first so cursor advances correctly
  for (const sig of signatures.reverse()) {
    try {
      const tx = await withRetry(
        () => rawGetTransaction(sig.signature, rpcUrl, rpcHeaders),
        sig.signature.slice(0, 8),
      );

      const sigLike = {
        signature: sig.signature,
        slot: sig.slot,
        blockTime: sig.blockTime ?? null,
        err: sig.err,
        memo: sig.memo ?? null,
      };

      const { txRow, detailRow } = hydrateTx(sigLike, tx);
      await upsertHydratedTx(txRow, detailRow);

      inserted++;

      // Update cursor after each successful insert
      await setCursor('transactions', {
        lastSlot: sig.slot,
        lastSignature: sig.signature,
      });
    } catch (e: any) {
      logErr('tx', `Failed ${sig.signature.slice(0, 12)}: ${e.message}`);
    }

    // Pacing: 200ms between RPC calls
    await sleep(200);
  }

  log('tx', `Done: ${inserted} transactions inserted`);
  return inserted;
}

