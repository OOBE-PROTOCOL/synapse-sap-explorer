
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
  switch (env.SYNAPSE_REGION.toUpperCase()) {
    case 'EU':
    case 'EU-1':
      return SynapseRegion.EU;
    case 'US':
    case 'US-1':
    default:
      return SynapseRegion.US;
  }
}


const ep = resolveEndpoint(resolveNetwork(), resolveRegion());

export const getSynapseClient = createSynapseProvider({
  endpoint: ep.rpc,
  wsEndpoint: ep.wss,
  grpcEndpoint: ep.grpc,
  apiKey: env.SYNAPSE_API_KEY,
});


export { SynapseNetwork, SynapseRegion, synapseResponse, withSynapseError };
