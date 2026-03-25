/* ──────────────────────────────────────────────────────────
 * Synapse SDK v2.0.5 — Server-side singleton (Next.js provider)
 *
 * Uses createSynapseProvider() from the ./next module for
 * HMR-safe singleton management in development.
 * ────────────────────────────────────────────────────────── */

import {
  createSynapseProvider,
  synapseResponse,
  withSynapseError,
} from '@oobe-protocol-labs/synapse-client-sdk/next';

import {
  SynapseNetwork,
  SynapseRegion,
  resolveEndpoint,
} from '@oobe-protocol-labs/synapse-client-sdk';

import { env } from '~/lib/env';

/* ── Helpers ──────────────────────────────────────────── */

function resolveNetwork(): SynapseNetwork {
  switch (env.SYNAPSE_NETWORK) {
    case 'mainnet':
      return SynapseNetwork.Mainnet;
    case 'testnet':
      return SynapseNetwork.Testnet;
    case 'devnet':
    default:
      return SynapseNetwork.Devnet;
  }
}

function resolveRegion(): SynapseRegion {
  switch (env.SYNAPSE_REGION) {
    case 'EU':
      return SynapseRegion.EU;
    case 'US':
    default:
      return SynapseRegion.US;
  }
}

/* ── Singleton ────────────────────────────────────────── */

const ep = resolveEndpoint(resolveNetwork(), resolveRegion());

export const getSynapseClient = createSynapseProvider({
  endpoint: ep.rpc,
  wsEndpoint: ep.wss,
  grpcEndpoint: ep.grpc,
  apiKey: env.SYNAPSE_API_KEY,
});

/* ── Re-exports ───────────────────────────────────────── */

export { SynapseNetwork, SynapseRegion, synapseResponse, withSynapseError };
