import * as path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import {
  resolveEndpoint,
  SynapseNetwork,
  SynapseRegion,
} from '@oobe-protocol-labs/synapse-client-sdk';
import { SAP_PROGRAM_ADDRESS } from '~/lib/sap/sdk-compat';
import { env } from '~/lib/env';
import { hydrateTx, upsertHydratedTx, type SignatureLike } from './tx-pipeline';
import { applyGrpcAccountUpdate } from './entity-delta';
import { enqueuePdaRefreshMany } from '../../refresh-queue';
import { setCursor } from './cursor';
import { log, logErr, sleep } from './utils';
import { RpcTransaction } from '~/types';
import type { TransactionError } from '~/types/indexer';

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
  switch (env.SYNAPSE_REGION.toUpperCase()) {
    case 'EU':
    case 'EU-1':
      return SynapseRegion.EU;
    case 'US':
    case 'US-1':
      return SynapseRegion.US;
    default: return SynapseRegion.US;
  }
}

function commitmentFromEnv(): number {
  const raw = (env.INDEXER_GRPC_COMMITMENT ?? 'confirmed').toLowerCase();
  if (raw === 'processed') return 0;
  if (raw === 'finalized') return 2;
  return 1; // CONFIRMED
}

/**
 * Clean the SDK endpoint URL to just host:port for @grpc/grpc-js.
 * Input:  "https://us-1-mainnet.oobeprotocol.ai/grpc" or "grpc://host/grpc-native"
 * Output: "us-1-mainnet.oobeprotocol.ai:443" (with TLS flag)
 */
function parseGrpcEndpoint(rawUrl: string): { host: string; tls: boolean } {
  const isSecure = rawUrl.startsWith('https://') || rawUrl.startsWith('grpcs://');
  let host = rawUrl
    .replace(/^https?:\/\//, '')
    .replace(/^grpcs?:\/\//, '');
  // Strip path
  const slashIdx = host.indexOf('/');
  if (slashIdx > 0) host = host.slice(0, slashIdx);
  // Ensure port
  if (!host.includes(':')) host += isSecure ? ':443' : ':80';
  return { host, tls: isSecure || host.endsWith(':443') };
}

/**
 * Build a Geyser SubscribeRequest for SAP program transactions.
 * Optionally include account updates (owner=SAP program) for delta indexing.
 */
function buildSubscribeRequest(includeAccounts: boolean) {
  return {
    accounts: includeAccounts ? {
      sap_accounts: {
        owner: [SAP_PROGRAM_ADDRESS],
        account: [],
        filters: [],
        nonempty_txn_signature: false,
      },
    } : {},
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
function extractSignatureLike(update: Record<string, unknown>): SignatureLike | null {
  const txUpdate = (update as { transaction?: { transaction?: Record<string, unknown> } }).transaction;
  if (!txUpdate?.transaction) return null;

  const txInfo = txUpdate.transaction;

  // Signature is a Buffer (bytes field) — encode as base58
  const sigBuf: Buffer | Uint8Array | undefined = txInfo.signature as Buffer | Uint8Array | undefined;
  if (!sigBuf || sigBuf.length === 0) return null;

  const signature = encodeBase58(sigBuf);
  if (!signature) return null;

  const slot = Number((txUpdate.transaction as Record<string, unknown>)?.slot ?? '0');
  const metaObj = txInfo.meta as Record<string, unknown> | undefined;
  const err = (metaObj?.err ?? null) as TransactionError;

  return {
    signature,
    slot,
    blockTime: null, // gRPC stream doesn't include blockTime per-tx
    err,
    memo: null,
  };
}

function extractTransactionAccountKeys(message: Record<string, unknown> | null): string[] {
  if (!message) return [];
  const rawKeys = (message.account_keys as Buffer[]) ?? [];
  const out: string[] = [];
  for (const key of rawKeys) {
    if (!key || key.length === 0) continue;
    out.push(encodeBase58(key));
  }
  return out;
}

function extractGrpcAccountUpdate(update: Record<string, unknown>): {
  pda: string;
  owner: string;
  data: Buffer;
  lamports: number;
  slot: number;
} | null {
  const accountUpdate = (update as {
    account?: {
      slot?: number | string;
      account?: {
        pubkey?: Buffer | Uint8Array;
        owner?: Buffer | Uint8Array;
        data?: Buffer | Uint8Array;
        lamports?: number | string;
      };
    };
  }).account;

  const info = accountUpdate?.account;
  if (!info) return null;
  const pubkeyBytes = info.pubkey;
  const ownerBytes = info.owner;
  if (!pubkeyBytes || !ownerBytes) return null;

  const pda = encodeBase58(Buffer.from(pubkeyBytes));
  const owner = encodeBase58(Buffer.from(ownerBytes));
  const data = Buffer.from(info.data ?? []);
  const lamports = Number(info.lamports ?? 0);
  const slot = Number(accountUpdate?.slot ?? 0);

  return { pda, owner, data, lamports, slot };
}

/**
 * Process a single gRPC SubscribeUpdate from the native stream.
 */
async function handleNativeUpdate(update: Record<string, unknown>): Promise<void> {
  const updateType = update.update_oneof;
  if (updateType === 'account') {
    const acct = extractGrpcAccountUpdate(update);
    if (!acct) return;
    await applyGrpcAccountUpdate(acct);
    return;
  }
  if (updateType !== 'transaction') return;

  const sigLike = extractSignatureLike(update);
  if (!sigLike) return;

  const txInfo = (update as { transaction?: { transaction?: Record<string, unknown> } }).transaction?.transaction;
  if (!txInfo) return;

  const meta = (txInfo.meta ?? null) as Record<string, unknown> | null;
  const txInner = (txInfo.transaction ?? null) as Record<string, unknown> | null;
  const message = (txInner?.message ?? null) as Record<string, unknown> | null;

  // Build an RPC-like shape that hydrateTx expects
  const txLike: RpcTransaction = {
    meta: meta ? {
      err: meta.err && Object.keys(meta.err as object).length > 0 ? meta.err as Record<string, unknown> : null,
      fee: Number(meta.fee ?? 0),
      logMessages: (meta.log_messages as string[]) ?? [],
      preBalances: ((meta.pre_balances as number[]) ?? []).map(Number),
      postBalances: ((meta.post_balances as number[]) ?? []).map(Number),
    } : undefined,
    transaction: message ? {
      signatures: [sigLike.signature],
      message: {
        accountKeys: ((message.account_keys as Buffer[]) ?? []).map((k: Buffer) => encodeBase58(k)),
        instructions: ((message.instructions as Array<{ program_id_index?: number; accounts?: Uint8Array; data?: Uint8Array }>) ?? []).map((ix) => ({
          programIdIndex: ix.program_id_index,
          accounts: Array.from(ix.accounts ?? []),
          data: ix.data ? Buffer.from(ix.data).toString('base64') : '',
        })),
      },
    } : undefined,
    version: 'legacy',
  };

  const { txRow, detailRow } = hydrateTx(sigLike, txLike);
  await upsertHydratedTx(txRow, detailRow);

  await setCursor('transactions', {
    lastSlot: sigLike.slot,
    lastSignature: sigLike.signature,
  });

  const txAccountKeys = extractTransactionAccountKeys(message);
  enqueuePdaRefreshMany(txAccountKeys);

  log('grpc', `📡 TX ${sigLike.signature.slice(0, 12)}… slot=${sigLike.slot}`);
}


let _geyserService: grpc.ServiceClientConstructor | null = null;

function getGeyserServiceCtor(): grpc.ServiceClientConstructor {
  if (_geyserService) return _geyserService;
  const protoPath = path.resolve(__dirname, '../../proto/geyser.proto');
  const definition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [path.dirname(protoPath)],
  });
  const root = grpc.loadPackageDefinition(definition);
  _geyserService = (root as Record<string, { Geyser?: grpc.ServiceClientConstructor }>).geyser?.Geyser ?? null;
  if (!_geyserService) throw new Error('Failed to load geyser.Geyser from proto');
  return _geyserService;
}

export async function startGrpcTransactionStream(signal?: AbortSignal): Promise<void> {
  const ep = resolveEndpoint(resolveNetwork(), resolveRegion());
  const rawGrpcUrl = ep.grpc;
  const apiKey = env.SYNAPSE_API_KEY;

  if (!rawGrpcUrl) throw new Error('Missing gRPC endpoint from Synapse resolver');

  const { host, tls } = parseGrpcEndpoint(rawGrpcUrl);
  log('grpc', `Resolved gRPC endpoint: ${host} (TLS=${tls})`);

  const GeyserCtor = getGeyserServiceCtor();
  let includeAccounts = (process.env.INDEXER_DISABLE_ACCOUNT_STREAM ?? 'false').toLowerCase() !== 'true';
  let backoffMs = 1_000;
  let failures = 0;
  const MAX_FAILURES = 10;

  while (!signal?.aborted) {
    let client: InstanceType<grpc.ServiceClientConstructor> | null = null;
    let stream: grpc.ClientDuplexStream<unknown, Record<string, unknown>> | null = null;

    try {
      const creds = tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
      client = new GeyserCtor(host, creds, {
        'grpc.max_receive_message_length': 64 * 1024 * 1024,
        'grpc.max_send_message_length': 16 * 1024 * 1024,
        'grpc.keepalive_time_ms': 30_000,
        'grpc.keepalive_timeout_ms': 10_000,
        'grpc.keepalive_permit_without_calls': 1,
      });

      const meta = new grpc.Metadata();
      meta.set('x-api-key', apiKey);
      meta.set('x-token', apiKey);

      log('grpc', `Connecting to ${host}...`);
      stream = client.Subscribe(meta);

      if (!stream) {
        throw new Error('Failed to create gRPC stream');
      }

      const req = buildSubscribeRequest(includeAccounts);
      // Send subscribe request
      stream.write(req);
      log('grpc', `Subscribed to SAP stream (tx + ${includeAccounts ? 'accounts' : 'tx-only'})`);

      // Reset backoff on successful connect + first data
      let gotData = false;

      // Consume updates
      await new Promise<void>((resolve, reject) => {
        stream!.on('data', async (update: Record<string, unknown>) => {
          if (signal?.aborted) { resolve(); return; }
          if (!gotData) {
            gotData = true;
            backoffMs = 1_000;
            failures = 0;
            log('grpc', '✅ Stream active — receiving data');
          }
          try {
            await handleNativeUpdate(update);
          } catch (e: unknown) {
            logErr('grpc', `Update handling failed: ${(e as Error).message}`);
          }
        });

        stream!.on('end', () => {
          log('grpc', 'Stream ended by server');
          resolve();
        });

        stream!.on('error', (e: Error) => {
          reject(e);
        });

        const checkAbort = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(checkAbort);
            resolve();
          }
        }, 2_000);
      });

      log('grpc', 'Stream ended, reconnecting...');
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? String(e);
      if (includeAccounts && /(INVALID_ARGUMENT|failed to create filter|account)/i.test(msg)) {
        logErr('grpc', `Account stream rejected by gateway (${msg.slice(0, 120)}), falling back to tx-only stream`);
        includeAccounts = false;
        failures = 0;
        backoffMs = 1_000;
        continue;
      }
      logErr('grpc', `Connection failed: ${msg}`);
      failures++;

      if (failures >= MAX_FAILURES) {
        logErr('grpc', `gRPC failed ${MAX_FAILURES} times — giving up. RPC polling continues.`);
        break;
      }
    } finally {
      try { stream?.cancel?.(); } catch {}
      try { stream?.destroy?.(); } catch {}
      try { client?.close?.(); } catch {}
    }

    if (signal?.aborted) break;
    await sleep(backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  }

  log('grpc', 'Stream loop stopped');
}
