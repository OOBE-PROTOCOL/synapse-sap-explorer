// src/indexer/stream-transactions.ts — gRPC transactionSubscribe realtime ingestion
import Client, {
  CommitmentLevel,
  type SubscribeUpdate,
  type SubscribeRequest,
  txEncode,
} from '@triton-one/yellowstone-grpc';
import { resolveEndpoint, SynapseNetwork, SynapseRegion } from '@oobe-protocol-labs/synapse-client-sdk';
import { SAP_PROGRAM_ADDRESS } from '@oobe-protocol-labs/synapse-sap-sdk/constants';
import { env } from '~/lib/env';
import { hydrateTx, upsertHydratedTx, type SignatureLike } from './tx-pipeline';
import { inferTouchedEntities } from './entity-impact';
import { enqueueEntityRefreshMany } from '../../refresh-queue';
import { setCursor } from './cursor';
import { log, logErr, sleep } from './utils';

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

function commitmentFromEnv(): CommitmentLevel {
  const raw = env.INDEXER_GRPC_COMMITMENT.toLowerCase();
  if (raw === 'processed') return CommitmentLevel.PROCESSED;
  if (raw === 'finalized') return CommitmentLevel.FINALIZED;
  return CommitmentLevel.CONFIRMED;
}

function buildSubscribeRequest(): SubscribeRequest {
  return {
    accounts: {},
    slots: {},
    transactions: {
      sap: {
        vote: false,
        failed: undefined,
        signature: undefined,
        accountInclude: [SAP_PROGRAM_ADDRESS],
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    commitment: commitmentFromEnv(),
    accountsDataSlice: [],
    ping: undefined,
    fromSlot: undefined,
  };
}

function makeSignatureLike(update: SubscribeUpdate, parsedTx: any): SignatureLike | null {
  const tx = update.transaction?.transaction;
  if (!tx) return null;

  const signature = parsedTx?.transaction?.signatures?.[0] ?? null;
  if (!signature) return null;

  const slotRaw = update.transaction?.slot ?? parsedTx?.slot ?? '0';
  const slot = Number(slotRaw);

  const blockTime = parsedTx?.blockTime != null ? Number(parsedTx.blockTime) : null;
  const err = parsedTx?.meta?.err ?? null;

  return {
    signature,
    slot,
    blockTime,
    err,
    memo: null,
  };
}

async function handleStreamUpdate(update: SubscribeUpdate): Promise<void> {
  const txInfo = update.transaction?.transaction;
  if (!txInfo) return;

  // 3 = Json encoding (typed in map as WasmUiTransactionEncoding.Json)
  const parsed = txEncode.encode(txInfo, 3 as any, 0, false);
  const sigLike = makeSignatureLike(update, parsed);
  if (!sigLike) return;

  // Convert stream payload into an RPC-like shape expected by hydrateTx
  const txLike = {
    meta: parsed.meta ?? null,
    transaction: parsed.transaction ?? null,
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
}

export async function startGrpcTransactionStream(signal?: AbortSignal): Promise<void> {
  const ep = resolveEndpoint(resolveNetwork(), resolveRegion());
  const endpointBase = ep.grpc;
  const apiKey = env.SYNAPSE_API_KEY;

  if (!endpointBase) throw new Error('Missing gRPC endpoint from Synapse resolver');

  // Synapse gRPC may require x-api-key auth; Yellowstone client supports x-token.
  // We also pass api_key as query param to maximize compatibility.
  const endpoint = endpointBase.includes('?')
    ? `${endpointBase}&api_key=${encodeURIComponent(apiKey)}`
    : `${endpointBase}?api_key=${encodeURIComponent(apiKey)}`;

  const req = buildSubscribeRequest();

  let backoffMs = 1000;

  while (!signal?.aborted) {
    let client: Client | null = null;
    let stream: any = null;

    try {
      const safeEndpoint = endpoint.replace(/([?&]api_key=)[^&]+/i, '$1***');
      log('grpc', `Connecting to gRPC stream: ${safeEndpoint}`);

      client = new Client(endpoint, apiKey, undefined);
      await client.connect();

      stream = await client.subscribe();

      stream.on('error', (e: any) => {
        logErr('grpc', `Stream error: ${e?.message ?? String(e)}`);
      });

      // Start subscription
      stream.write(req);
      log('grpc', 'Subscribed to SAP transactions via transactionSubscribe');

      backoffMs = 1000; // reset on successful connection

      for await (const update of stream) {
        if (signal?.aborted) break;
        try {
          await handleStreamUpdate(update as SubscribeUpdate);
        } catch (e: any) {
          logErr('grpc', `Update handling failed: ${e.message}`);
        }
      }

      logErr('grpc', 'Stream ended, reconnecting...');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      logErr('grpc', `Connection failed: ${msg}`);

      // Auth mismatch on provider side (expects x-api-key metadata).
      // Slow down retries to avoid hot-loop log spam until transport is patched.
      if (msg.toLowerCase().includes('missing x-api-key metadata')) {
        backoffMs = Math.max(backoffMs, 60_000);
      }
    } finally {
      try { stream?.destroy?.(); } catch {}
      try { (client as any)?.close?.(); } catch {}
    }

    if (signal?.aborted) break;
    await sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  }

  log('grpc', 'Stream loop stopped');
}

