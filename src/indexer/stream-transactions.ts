// src/indexer/stream-transactions.ts — gRPC realtime ingestion via @grpc/grpc-js
//
// Uses the native @grpc/grpc-js transport (NOT the Yellowstone napi client)
// so we can send `x-api-key` metadata required by Synapse gRPC endpoints.
// The Yellowstone napi client hardcodes `x-token` which Synapse rejects.

import { resolveEndpoint, SynapseNetwork, SynapseRegion } from '@oobe-protocol-labs/synapse-client-sdk';
import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { env } from '~/lib/env';
import { hydrateTx, upsertHydratedTx, type SignatureLike } from './tx-pipeline';
import { inferTouchedEntities } from './entity-impact';
import { enqueueEntityRefreshMany } from '../../refresh-queue';
import { setCursor } from './cursor';
import { log, logErr, sleep } from './utils';
import {
  createNativeGeyserStream,
  closeNativeClient,
  GeyserCommitment,
  type GeyserCommitmentLevel,
  type NativeSubscribeRequest,
} from './grpc-native-stream';

/* ── Helpers ──────────────────────────────────────────── */

function resolveNetwork(): SynapseNetwork {
  switch (env.SYNAPSE_NETWORK) {
    case 'mainnet': return SynapseNetwork.Mainnet;
    case 'testnet': return SynapseNetwork.Testnet;
    case 'devnet':
    default: return SynapseNetwork.Devnet;
  }
}

function resolveRegion(): SynapseRegion {
  switch (env.SYNAPSE_REGION) {
    case 'EU': return SynapseRegion.EU;
    case 'US':
    default: return SynapseRegion.US;
  }
}

function commitmentFromEnv(): GeyserCommitmentLevel {
  const raw = env.INDEXER_GRPC_COMMITMENT.toLowerCase();
  if (raw === 'processed') return GeyserCommitment.PROCESSED;
  if (raw === 'finalized') return GeyserCommitment.FINALIZED;
  return GeyserCommitment.CONFIRMED;
}

/**
 * Build a Geyser SubscribeRequest in proto-native field naming (snake_case).
 * Filters for SAP program transactions only.
 */
function buildSubscribeRequest(): NativeSubscribeRequest {
  return {
    accounts: {},
    slots: {},
    transactions: {
      sap: {
        vote: false,
        failed: false,
        account_include: [SAP_PROGRAM_ADDRESS],
        account_exclude: [],
        account_required: [],
      },
    },
    transactions_status: {},
    blocks: {},
    blocks_meta: {},
    entry: {},
    commitment: commitmentFromEnv(),
    accounts_data_slice: [],
    ping: undefined,
    from_slot: undefined,
  };
}

/* ── Update handler ──────────────────────────────────── */

/**
 * Minimal base58 encoder for signature bytes.
 */
function encodeBase58(bytes: Buffer | Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt(0);
  for (const byte of bytes) {
    num = num * 256n + BigInt(byte);
  }
  let str = '';
  while (num > 0n) {
    str = ALPHABET[Number(num % 58n)] + str;
    num = num / 58n;
  }
  // Leading zeros → leading '1's
  for (const byte of bytes) {
    if (byte !== 0) break;
    str = '1' + str;
  }
  return str;
}

/**
 * Extract a SignatureLike from a raw gRPC SubscribeUpdate.
 * The wire format from @grpc/grpc-js uses Buffer objects for bytes fields.
 */
function extractSignatureLike(update: any): SignatureLike | null {
  const txUpdate = update.transaction;
  if (!txUpdate?.transaction) return null;

  const txInfo = txUpdate.transaction;

  // Signature is a Buffer (bytes field) — encode as base58
  const sigBuf: Buffer | Uint8Array | undefined = txInfo.signature;
  if (!sigBuf || sigBuf.length === 0) return null;

  const signature = encodeBase58(sigBuf);
  if (!signature) return null;

  const slot = Number(txUpdate.slot ?? '0');
  const err = txInfo.meta?.err ?? null;

  return {
    signature,
    slot,
    blockTime: null, // gRPC stream doesn't include blockTime per-tx
    err: err && Object.keys(err).length > 0 ? err : null,
    memo: null,
  };
}

/**
 * Process a single gRPC SubscribeUpdate from the native stream.
 */
async function handleNativeUpdate(update: any): Promise<void> {
  // The proto oneof field — check which update type it is
  const updateType = update.update_oneof;
  if (updateType !== 'transaction') return;

  const sigLike = extractSignatureLike(update);
  if (!sigLike) return;

  const txInfo = update.transaction?.transaction;
  if (!txInfo) return;

  const meta = txInfo.meta ?? null;
  const message = txInfo.transaction?.message ?? null;

  // Build an RPC-like shape that hydrateTx expects
  const txLike = {
    meta: meta ? {
      err: meta.err && Object.keys(meta.err).length > 0 ? meta.err : null,
      fee: Number(meta.fee ?? 0),
      logMessages: meta.log_messages ?? [],
      preBalances: (meta.pre_balances ?? []).map(Number),
      postBalances: (meta.post_balances ?? []).map(Number),
    } : null,
    transaction: message ? {
      signatures: [sigLike.signature],
      message: {
        accountKeys: (message.account_keys ?? []).map((k: Buffer) => encodeBase58(k)),
        instructions: (message.instructions ?? []).map((ix: any) => ({
          programIdIndex: ix.program_id_index,
          accounts: Array.from(ix.accounts ?? []),
          data: ix.data ? Buffer.from(ix.data).toString('base64') : '',
        })),
      },
    } : null,
    version: 'legacy',
  };

  const { txRow, detailRow } = hydrateTx(sigLike, txLike);
  await upsertHydratedTx(txRow, detailRow);

  await setCursor('transactions', {
    lastSlot: sigLike.slot,
    lastSignature: sigLike.signature,
  });

  const touched = inferTouchedEntities(txRow.sapInstructions ?? []);
  enqueueEntityRefreshMany(touched);

  log('grpc', `📡 TX ${sigLike.signature.slice(0, 12)}… slot=${sigLike.slot}`);
}

/* ── Main stream loop ────────────────────────────────── */

export async function startGrpcTransactionStream(signal?: AbortSignal): Promise<void> {
  const ep = resolveEndpoint(resolveNetwork(), resolveRegion());
  const endpointBase = ep.grpc;
  const apiKey = env.SYNAPSE_API_KEY;

  if (!endpointBase) throw new Error('Missing gRPC endpoint from Synapse resolver');

  const req = buildSubscribeRequest();
  let backoffMs = 1000;

  while (!signal?.aborted) {
    let nativeClient: any = null;
    let stream: any = null;

    try {
      log('grpc', `Connecting to native gRPC stream: ${endpointBase.replace(/\/\/[^:]+:[^@]+@/, '//***@')}`);

      const { stream: s, client: c } = createNativeGeyserStream({
        endpoint: endpointBase,
        apiKey,
      });
      stream = s;
      nativeClient = c;

      // Error handler
      stream.on('error', (e: any) => {
        logErr('grpc', `Stream error: ${e?.message ?? String(e)}`);
      });

      // Send the subscribe request
      stream.write(req);
      log('grpc', `Subscribed to SAP txs (program=${SAP_PROGRAM_ADDRESS.slice(0, 12)}…) via native gRPC`);

      backoffMs = 1000; // reset on successful connection

      // Consume updates
      await new Promise<void>((resolve, reject) => {
        stream.on('data', async (update: any) => {
          if (signal?.aborted) { resolve(); return; }
          try {
            await handleNativeUpdate(update);
          } catch (e: any) {
            logErr('grpc', `Update handling failed: ${e.message}`);
          }
        });

        stream.on('end', () => {
          log('grpc', 'Stream ended by server');
          resolve();
        });

        stream.on('error', (e: any) => {
          reject(e);
        });

        // Check abort signal periodically
        const checkAbort = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(checkAbort);
            resolve();
          }
        }, 1000);
      });

      logErr('grpc', 'Stream ended, reconnecting...');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      logErr('grpc', `Connection failed: ${msg}`);

      if (msg.toLowerCase().includes('unauthenticated') || msg.toLowerCase().includes('x-api-key')) {
        logErr('grpc', 'Auth hint: Synapse endpoint may require different auth. Check SYNAPSE_API_KEY.');
      }
    } finally {
      try { stream?.cancel?.(); } catch {}
      try { stream?.destroy?.(); } catch {}
      closeNativeClient(nativeClient);
    }

    if (signal?.aborted) break;
    await sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  }

  log('grpc', 'Stream loop stopped');
}
