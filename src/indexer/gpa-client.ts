import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  SapClient,
  SAP_PROGRAM_ID,
  SAP_PROGRAM_ADDRESS,
  type CoreSapClient,
} from '~/lib/sap/sdk-compat';
import type {
  AgentAccountData,
  AgentStatsData,
  DiscoveredAgent,
  AgentProfile,
  NetworkOverview,
  DiscoveredTool,
  Capability,
  PricingTier,
} from '~/lib/sap/sdk-compat';
import { SynapseNetwork, SynapseRegion, resolveEndpoint } from '@oobe-protocol-labs/synapse-client-sdk';
import { env } from '~/lib/env';
import { log, maskSecret, redactRpcUrl } from './utils';

const SENSITIVE_HEADER_KEYS = new Set(['x-token', 'authorization', 'x-api-key', 'api-key']);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? maskSecret(value) : value;
  }
  return out;
}

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

function makeReadOnlyWallet() {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey,
    signTransaction: async <T>(tx: T): Promise<T> => tx,
    signAllTransactions: async <T>(txs: T[]): Promise<T[]> => txs,
  };
}

function resolveIndexerGpaUrl(): string {
  const explicit = env.INDEXER_GPA_URL.trim();
  if (explicit) return explicit;

  const indexerUrl = env.INDEXER_RPC_URL.trim();
  if (indexerUrl) return indexerUrl;

  const ep = resolveEndpoint(resolveNetwork(), resolveRegion());
  return ep.rpc;
}

export function getIndexerGpaConfig(): { url: string; headers: Record<string, string> } {
  const url = resolveIndexerGpaUrl();
  const useDedicatedToken = Boolean(env.INDEXER_GPA_URL.trim());
  return {
    url,
    headers: useDedicatedToken
      ? {
          'Content-Type': 'application/json',
          'x-token': env.INDEXER_GPA_TOKEN.trim() || env.SYNAPSE_API_KEY,
        }
      : {
          'Content-Type': 'application/json',
          'x-api-key': env.SYNAPSE_API_KEY,
        },
  };
}

function logIndexerGpaRequest(label: string, accountKind: string, rpcUrl: string, headers: Record<string, string>): void {
  const body = {
    jsonrpc: '2.0',
    id: '<client-generated>',
    method: 'getProgramAccounts',
    params: [
      SAP_PROGRAM_ADDRESS,
      {
        encoding: 'base64',
        commitment: 'confirmed',
        withContext: true,
        dataSlice: { offset: 0, length: 0 },
      },
    ],
  };

  log(label, `RPC getProgramAccounts(${accountKind}) -> ${JSON.stringify({
    url: redactRpcUrl(rpcUrl),
    headers: redactHeaders(headers),
    body,
  })}`);
}

let _gpaSap: CoreSapClient | null = null;
let _gpaConnection: Connection | null = null;

function getIndexerGpaSap(): CoreSapClient {
  if (!_gpaSap) {
    const { url: rpcUrl, headers: rpcHeaders } = getIndexerGpaConfig();

    _gpaConnection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      httpHeaders: rpcHeaders,
    });

    const wallet = makeReadOnlyWallet();
    const provider = new AnchorProvider(_gpaConnection, wallet, {
      commitment: 'confirmed',
    });

    _gpaSap = SapClient.from(provider, SAP_PROGRAM_ID);
  }
  return _gpaSap;
}

function accounts(sap: SapClient) {
  return sap.program.account as Record<
    string,
    { all: () => Promise<Array<{ publicKey: PublicKey; account: Record<string, unknown> }>> }
  >;
}

export type {
  AgentAccountData,
  AgentStatsData,
  DiscoveredAgent,
  AgentProfile,
  NetworkOverview,
  DiscoveredTool,
  Capability,
  PricingTier,
};

export async function findAllAgents(): Promise<DiscoveredAgent[]> {
  const { url, headers } = getIndexerGpaConfig();
  logIndexerGpaRequest('agents', 'agentAccount', url, headers);
  const raw = await accounts(getIndexerGpaSap()).agentAccount.all();
  return raw.map((a) => ({
    pda: a.publicKey,
    identity: a.account as unknown as DiscoveredAgent['identity'],
    stats: null,
  }));
}

export async function findAllTools(): Promise<DiscoveredTool[]> {
  const { url, headers } = getIndexerGpaConfig();
  logIndexerGpaRequest('tools', 'toolDescriptor', url, headers);
  const raw = await accounts(getIndexerGpaSap()).toolDescriptor.all();
  return raw.map((t) => ({
    pda: t.publicKey,
    descriptor: t.account as unknown as DiscoveredTool['descriptor'],
  }));
}

export async function findAllAgentStats(): Promise<Array<{ pda: PublicKey; stats: AgentStatsData }>> {
  const { url, headers } = getIndexerGpaConfig();
  logIndexerGpaRequest('agents', 'agentStats', url, headers);
  const raw = await accounts(getIndexerGpaSap()).agentStats.all();
  return raw.map((s) => ({
    pda: s.publicKey,
    stats: s.account as unknown as AgentStatsData,
  }));
}

export type RawAccount<T = Record<string, unknown>> = { pda: PublicKey; account: T };

export async function findAllEscrows(): Promise<RawAccount[]> {
  const { url, headers } = getIndexerGpaConfig();
  logIndexerGpaRequest('escrows', 'escrowAccount', url, headers);
  const raw = await accounts(getIndexerGpaSap()).escrowAccount.all();
  return raw.map((e) => ({ pda: e.publicKey, account: e.account }));
}

export async function findAllAttestations(): Promise<RawAccount[]> {
  const { url, headers } = getIndexerGpaConfig();
  logIndexerGpaRequest('attestations', 'agentAttestation', url, headers);
  const raw = await accounts(getIndexerGpaSap()).agentAttestation.all();
  return raw.map((a) => ({ pda: a.publicKey, account: a.account }));
}

export async function findAllFeedbacks(): Promise<RawAccount[]> {
  const { url, headers } = getIndexerGpaConfig();
  logIndexerGpaRequest('feedbacks', 'feedbackAccount', url, headers);
  const raw = await accounts(getIndexerGpaSap()).feedbackAccount.all();
  return raw.map((f) => ({ pda: f.publicKey, account: f.account }));
}

export async function findAllVaults(): Promise<RawAccount[]> {
  const { url, headers } = getIndexerGpaConfig();
  logIndexerGpaRequest('vaults', 'memoryVault', url, headers);
  const raw = await accounts(getIndexerGpaSap()).memoryVault.all();
  return raw.map((v) => ({ pda: v.publicKey, account: v.account }));
}
