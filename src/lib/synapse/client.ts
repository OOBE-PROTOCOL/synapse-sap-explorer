
import * as synapseNext from '@oobe-protocol-labs/synapse-client-sdk/next';

import {
  SynapseNetwork,
  SynapseRegion,
  resolveEndpoint,
} from '@oobe-protocol-labs/synapse-client-sdk';

import { env } from '~/lib/env';

const {
  createSynapseProvider,
  synapseResponse: sdkSynapseResponse,
  withSynapseError: sdkWithSynapseError,
} = synapseNext as typeof import('@oobe-protocol-labs/synapse-client-sdk/next');

type SynapseResponseInit = ResponseInit & {
  headers?: Record<string, string>;
};

export function synapseResponse<T>(data: T, init?: ResponseInit) {
  if (typeof sdkSynapseResponse === 'function') {
    return sdkSynapseResponse(data, init as SynapseResponseInit | undefined);
  }
  return Response.json(data, init ?? { status: 200 });
}

export function withSynapseError<T extends (...args: never[]) => Promise<Response>>(handler: T) {
  const sdkWithSynapseErrorCompat =
    sdkWithSynapseError as
      | ((wrapped: (...args: unknown[]) => Promise<Response>) => (...args: unknown[]) => Promise<Response>)
      | undefined;

  if (typeof sdkWithSynapseErrorCompat === 'function') {
    return sdkWithSynapseErrorCompat(handler as unknown as (...args: unknown[]) => Promise<Response>);
  }

  return async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Response.json({ error: message }, { status: 500 });
    }
  };
}

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

export { SynapseNetwork, SynapseRegion };
