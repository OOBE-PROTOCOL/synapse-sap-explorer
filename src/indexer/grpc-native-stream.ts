// src/indexer/grpc-native-stream.ts — gRPC stream via @grpc/grpc-js (bypasses Yellowstone napi)
//
// Uses Geyser .proto directly with custom metadata, allowing us to
// send `x-api-key` instead of the hardcoded `x-token` that Yellowstone sends.
// This solves the auth mismatch with the Synapse gRPC endpoint.

import * as path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { log } from './utils';

/* ── Proto loading ─────────────────────────────────────── */

const PROTO_DIR = path.resolve(__dirname, '../../proto');
const GEYSER_PROTO = path.join(PROTO_DIR, 'geyser.proto');

let _geyserPkg: any = null;

function loadGeyserPackage(): any {
  if (_geyserPkg) return _geyserPkg;

  const definition = protoLoader.loadSync(GEYSER_PROTO, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_DIR],
  });

  const root = grpc.loadPackageDefinition(definition);
  _geyserPkg = (root as any).geyser;
  if (!_geyserPkg?.Geyser) {
    throw new Error('Failed to load geyser.Geyser service from proto definition');
  }
  return _geyserPkg;
}

/* ── Types (minimal subset for subscribe) ──────────────── */

/** Mirrors CommitmentLevel enum in geyser.proto */
export const GeyserCommitment = {
  PROCESSED: 0,
  CONFIRMED: 1,
  FINALIZED: 2,
} as const;

export type GeyserCommitmentLevel = (typeof GeyserCommitment)[keyof typeof GeyserCommitment];

/** Minimal subscribe request shape matching geyser.proto SubscribeRequest */
export interface NativeSubscribeRequest {
  accounts?: Record<string, any>;
  slots?: Record<string, any>;
  transactions?: Record<string, {
    vote?: boolean;
    failed?: boolean;
    signature?: string;
    account_include?: string[];
    account_exclude?: string[];
    account_required?: string[];
  }>;
  transactions_status?: Record<string, any>;
  blocks?: Record<string, any>;
  blocks_meta?: Record<string, any>;
  entry?: Record<string, any>;
  commitment?: GeyserCommitmentLevel;
  accounts_data_slice?: Array<{ offset: string; length: string }>;
  ping?: { id: number } | undefined;
  from_slot?: string | undefined;
}

/* ── Stream creation ───────────────────────────────────── */

export interface NativeGrpcStreamOptions {
  /** gRPC endpoint (e.g. "grpc.synapse.oobe.me:443") */
  endpoint: string;
  /** API key — will be sent as `x-api-key` gRPC metadata */
  apiKey: string;
  /** Use TLS (default: true if endpoint is port 443) */
  tls?: boolean;
  /** Additional metadata headers */
  extraMetadata?: Record<string, string>;
}

/**
 * Creates a bidirectional gRPC stream to Geyser's Subscribe RPC,
 * authenticated with `x-api-key` metadata (compatible with Synapse endpoints).
 *
 * Returns an object with { stream, client } — call stream.write(request) to subscribe,
 * iterate with stream.on('data', ...) to consume updates.
 */
export function createNativeGeyserStream(opts: NativeGrpcStreamOptions) {
  const pkg = loadGeyserPackage();
  const GeyserService = pkg.Geyser;

  // Determine TLS vs insecure
  const useTls = opts.tls ?? (opts.endpoint.includes(':443') || !opts.endpoint.includes(':'));
  const creds = useTls
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();

  // Strip protocol prefix if present
  let endpoint = opts.endpoint
    .replace(/^https?:\/\//, '')
    .replace(/^grpc:\/\//, '');

  log('grpc-native', `Creating gRPC client → ${endpoint} (TLS=${useTls})`);

  const client = new GeyserService(endpoint, creds, {
    'grpc.max_receive_message_length': 64 * 1024 * 1024, // 64 MB
    'grpc.max_send_message_length': 16 * 1024 * 1024,    // 16 MB
    'grpc.keepalive_time_ms': 30_000,
    'grpc.keepalive_timeout_ms': 10_000,
    'grpc.keepalive_permit_without_calls': 1,
  });

  // Build metadata with x-api-key (the key Synapse expects)
  const metadata = new grpc.Metadata();
  metadata.set('x-api-key', opts.apiKey);

  // Also set x-token for compatibility with Triton-native endpoints
  metadata.set('x-token', opts.apiKey);

  if (opts.extraMetadata) {
    for (const [k, v] of Object.entries(opts.extraMetadata)) {
      metadata.set(k, v);
    }
  }

  log('grpc-native', 'Opening Subscribe bidi stream with x-api-key metadata');
  const stream = client.Subscribe(metadata);

  return { stream, client };
}

/**
 * Gracefully close a gRPC client stub.
 */
export function closeNativeClient(client: any) {
  try {
    client?.close?.();
  } catch {}
}

