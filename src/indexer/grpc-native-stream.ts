// Uses Geyser .proto directly with custom x-api-key metadata,
// bypassing Yellowstone's hardcoded x-token auth.

import * as path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { log } from './utils';

const PROTO_DIR = path.resolve(__dirname, '../../proto');
const GEYSER_PROTO = path.join(PROTO_DIR, 'geyser.proto');

let _geyserPkg: { Geyser?: grpc.ServiceClientConstructor } | null = null;

function loadGeyserPackage(): { Geyser: grpc.ServiceClientConstructor } {
  if (_geyserPkg) return _geyserPkg as { Geyser: grpc.ServiceClientConstructor };

  const definition = protoLoader.loadSync(GEYSER_PROTO, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_DIR],
  });

  const root = grpc.loadPackageDefinition(definition);
  _geyserPkg = (root as Record<string, { Geyser?: grpc.ServiceClientConstructor }>).geyser ?? null;
  if (!_geyserPkg?.Geyser) {
    throw new Error('Failed to load geyser.Geyser service from proto definition');
  }
  return _geyserPkg as { Geyser: grpc.ServiceClientConstructor };
}


/** Mirrors CommitmentLevel enum in geyser.proto */
export const GeyserCommitment = {
  PROCESSED: 0,
  CONFIRMED: 1,
  FINALIZED: 2,
} as const;

export type GeyserCommitmentLevel = (typeof GeyserCommitment)[keyof typeof GeyserCommitment];

/** Minimal subscribe request shape matching geyser.proto SubscribeRequest */
export interface NativeSubscribeRequest {
  accounts?: Record<string, unknown>;
  slots?: Record<string, unknown>;
  transactions?: Record<string, {
    vote?: boolean;
    failed?: boolean;
    signature?: string;
    account_include?: string[];
    account_exclude?: string[];
    account_required?: string[];
  }>;
  transactions_status?: Record<string, unknown>;
  blocks?: Record<string, unknown>;
  blocks_meta?: Record<string, unknown>;
  entry?: Record<string, unknown>;
  commitment?: GeyserCommitmentLevel;
  accounts_data_slice?: Array<{ offset: string; length: string }>;
  ping?: { id: number } | undefined;
  from_slot?: string | undefined;
}


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

  // Parse the endpoint URL properly
  const rawEndpoint = opts.endpoint;
  const isHttps = rawEndpoint.startsWith('https://') || rawEndpoint.startsWith('grpcs://');

  // Strip protocol prefix and path (gRPC uses host:port only, no paths)
  let endpoint = rawEndpoint
    .replace(/^https?:\/\//, '')
    .replace(/^grpcs?:\/\//, '');

  // Strip path component (e.g. /grpc) — gRPC doesn't support path-based routing
  const pathIdx = endpoint.indexOf('/');
  if (pathIdx > 0) endpoint = endpoint.slice(0, pathIdx);

  // Ensure port is present
  if (!endpoint.includes(':')) {
    endpoint += isHttps ? ':443' : ':80';
  }

  // Determine TLS vs insecure
  const useTls = opts.tls ?? (isHttps || endpoint.endsWith(':443'));
  const creds = useTls
    ? grpc.credentials.createSsl()
    : grpc.credentials.createInsecure();

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
export function closeNativeClient(client: { close?: () => void } | null) {
  try {
    client?.close?.();
  } catch {}
}

