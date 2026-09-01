import {
  SynapseNetwork,
  SynapseRegion,
  resolveEndpoint,
} from '@oobe-protocol-labs/synapse-client-sdk';

import { env } from '~/lib/env';

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

export function getSynapseRpcConfig(): { url: string; headers: Record<string, string> } {
  const ep = resolveEndpoint(resolveNetwork(), resolveRegion());
  return {
    url: ep.rpc,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.SYNAPSE_API_KEY,
    },
  };
}
