/* ──────────────────────────────────────────────────────────
 * SAP Discovery — Server-side data layer
 *
 * Creates a SapClient directly (bypassing the SynapseAnchorSap bridge)
 * so we can inject the API key as an HTTP header on the underlying
 * @solana/web3.js Connection.
 *
 * Uses the real on-chain DiscoveryRegistry for agent/tool queries
 * and serializeAccount() from the SAP SDK for JSON serialization.
 *
 * All functions are server-only. Call them from API routes / RSCs.
 * ────────────────────────────────────────────────────────── */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AnchorProvider } from '@coral-xyz/anchor';

import {
  SapClient,
  SAP_PROGRAM_ID,
} from '@oobe-protocol-labs/synapse-sap-sdk';

import {
  SAP_PROGRAM_ADDRESS,
  GLOBAL_REGISTRY_ADDRESS,
} from '@oobe-protocol-labs/synapse-sap-sdk/constants';

import { serializeAccount } from '@oobe-protocol-labs/synapse-sap-sdk/utils';

import type {
  AgentAccountData,
  AgentStatsData,
} from '@oobe-protocol-labs/synapse-sap-sdk/types';

import type {
  DiscoveredAgent,
  AgentProfile,
  NetworkOverview,
  DiscoveredTool,
} from '@oobe-protocol-labs/synapse-sap-sdk/registries/discovery';

import type { Capability, PricingTier } from '@oobe-protocol-labs/synapse-sap-sdk/types';

import {
  SynapseNetwork,
  SynapseRegion,
  resolveEndpoint,
} from '@oobe-protocol-labs/synapse-client-sdk';

import { env } from '~/lib/env';

/* ── Re-export types for consumers ────────────────────── */

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

/* ── Program ID ───────────────────────────────────────── */

export const PROGRAM_ADDRESS = SAP_PROGRAM_ADDRESS; // SAPpUhsWLJG1FfkGRcXagEDMrMsWGjbky7AyhGpFETZ

/* ── SAP client singleton ─────────────────────────────── */

/**
 * Read-only server wallet — no signing needed for discovery.
 * Anchor Provider requires a wallet even for reads, so we use
 * a random keypair with zero balance.
 */
function makeReadOnlyWallet() {
  const kp = Keypair.generate();
  return {
    publicKey: kp.publicKey,
    signTransaction: async <T>(tx: T): Promise<T> => tx,
    signAllTransactions: async <T>(txs: T[]): Promise<T[]> => txs,
  };
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
  switch (env.SYNAPSE_REGION) {
    case 'EU':
      return SynapseRegion.EU;
    case 'US':
    default:
      return SynapseRegion.US;
  }
}

let _sap: SapClient | null = null;
let _sapConnection: Connection | null = null;

function getSap(): SapClient {
  if (!_sap) {
    const ep = resolveEndpoint(resolveNetwork(), resolveRegion());

    // Create Connection with API key header for Synapse RPC auth
    _sapConnection = new Connection(ep.rpc, {
      commitment: 'confirmed',
      httpHeaders: { 'x-api-key': env.SYNAPSE_API_KEY },
    });

    const wallet = makeReadOnlyWallet();
    const provider = new AnchorProvider(_sapConnection, wallet, {
      commitment: 'confirmed',
    });

    _sap = SapClient.from(provider, SAP_PROGRAM_ID);
  }
  return _sap;
}

/**
 * The Synapse-routed Connection (with API key, for account reads).
 */
export function getSynapseConnection(): Connection {
  getSap(); // ensure singleton is initialized
  return _sapConnection!;
}

/**
 * Returns the raw RPC URL and headers for direct fetch calls.
 * Useful when web3.js deserialization has issues with node responses.
 */
export function getRpcConfig(): { url: string; headers: Record<string, string> } {
  const ep = resolveEndpoint(resolveNetwork(), resolveRegion());
  return {
    url: ep.rpc,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.SYNAPSE_API_KEY,
    },
  };
}

/* ── Discovery queries ────────────────────────────────── */

/** Find agents by capability (e.g. "jupiter:swap") */
export async function findAgentsByCapability(
  capabilityId: string,
  opts?: { hydrate?: boolean },
): Promise<DiscoveredAgent[]> {
  return getSap().discovery.findAgentsByCapability(capabilityId, opts);
}

/** Find agents by protocol (e.g. "jupiter", "raydium") */
export async function findAgentsByProtocol(
  protocolId: string,
  opts?: { hydrate?: boolean },
): Promise<DiscoveredAgent[]> {
  return getSap().discovery.findAgentsByProtocol(protocolId, opts);
}

/** Find agents matching multiple capabilities at once */
export async function findAgentsByCapabilities(
  capabilityIds: string[],
  opts?: { hydrate?: boolean },
): Promise<DiscoveredAgent[]> {
  return getSap().discovery.findAgentsByCapabilities(capabilityIds, opts);
}

/** Full agent profile (identity + stats + computed fields) */
export async function getAgentProfile(
  walletPubkey: string,
): Promise<AgentProfile | null> {
  const { PublicKey } = await import('@solana/web3.js');
  return getSap().discovery.getAgentProfile(new PublicKey(walletPubkey));
}

/** Check if an agent is active */
export async function isAgentActive(
  walletPubkey: string,
): Promise<boolean> {
  const { PublicKey } = await import('@solana/web3.js');
  return getSap().discovery.isAgentActive(new PublicKey(walletPubkey));
}

/** Network-wide stats from GlobalRegistry */
export async function getNetworkOverview(): Promise<NetworkOverview> {
  return getSap().discovery.getNetworkOverview();
}

/** Find tools by category (e.g. "swap", "data", "lending") */
export async function findToolsByCategory(
  category: string,
  opts?: { hydrate?: boolean },
): Promise<DiscoveredTool[]> {
  return getSap().discovery.findToolsByCategory(category as any, opts);
}

/** Get tool category summary (counts per category) */
export async function getToolCategorySummary(): Promise<
  Array<{ category: string; categoryNum: number; toolCount: number }>
> {
  return getSap().discovery.getToolCategorySummary();
}

/* ── Fetch-all queries (via Anchor program.account.X.all()) ── */

/**
 * Fetch ALL agent accounts registered on-chain.
 * Uses the underlying Anchor `program.account.agentAccount.all()`
 * which performs a getProgramAccounts RPC call — no index needed.
 */
export async function findAllAgents(): Promise<DiscoveredAgent[]> {
  const sap = getSap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (sap.program.account as any).agentAccount;
  const raw: Array<{ publicKey: PublicKey; account: any }> = await accounts.all();
  return raw.map((a) => ({
    pda: a.publicKey,
    identity: a.account as unknown as DiscoveredAgent['identity'],
    stats: null,
  }));
}

/**
 * Fetch ALL tool descriptor accounts registered on-chain.
 * Uses `program.account.toolDescriptor.all()` — no category index needed.
 */
export async function findAllTools(): Promise<DiscoveredTool[]> {
  const sap = getSap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (sap.program.account as any).toolDescriptor;
  const raw: Array<{ publicKey: PublicKey; account: any }> = await accounts.all();
  return raw.map((t) => ({
    pda: t.publicKey,
    descriptor: t.account as unknown as DiscoveredTool['descriptor'],
  }));
}

/**
 * Fetch ALL agent stats accounts.
 * Uses `program.account.agentStats.all()` for full enumeration.
 */
export async function findAllAgentStats() {
  const sap = getSap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (sap.program.account as any).agentStats;
  const raw: Array<{ publicKey: PublicKey; account: any }> = await accounts.all();
  return raw.map((s) => ({
    pda: s.publicKey,
    stats: s.account,
  }));
}

/**
 * Fetch ALL escrow accounts on-chain.
 * Uses `program.account.escrowAccount.all()`.
 */
export async function findAllEscrows(): Promise<Array<{ pda: PublicKey; account: any }>> {
  const sap = getSap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (sap.program.account as any).escrowAccount;
  if (!accounts) return [];
  try {
    const raw: Array<{ publicKey: PublicKey; account: any }> = await accounts.all();
    return raw.map((e) => ({ pda: e.publicKey, account: e.account }));
  } catch { return []; }
}

/**
 * Fetch ALL attestation accounts on-chain.
 * Uses `program.account.agentAttestation.all()`.
 */
export async function findAllAttestations(): Promise<Array<{ pda: PublicKey; account: any }>> {
  const sap = getSap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (sap.program.account as any).agentAttestation;
  if (!accounts) return [];
  try {
    const raw: Array<{ publicKey: PublicKey; account: any }> = await accounts.all();
    return raw.map((a) => ({ pda: a.publicKey, account: a.account }));
  } catch { return []; }
}

/**
 * Fetch ALL feedback accounts on-chain.
 * Uses `program.account.feedbackAccount.all()`.
 */
export async function findAllFeedbacks(): Promise<Array<{ pda: PublicKey; account: any }>> {
  const sap = getSap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (sap.program.account as any).feedbackAccount;
  if (!accounts) return [];
  try {
    const raw: Array<{ publicKey: PublicKey; account: any }> = await accounts.all();
    return raw.map((f) => ({ pda: f.publicKey, account: f.account }));
  } catch { return []; }
}

/**
 * Fetch ALL memory vault accounts on-chain.
 * Uses `program.account.memoryVault.all()`.
 */
export async function findAllVaults(): Promise<Array<{ pda: PublicKey; account: any }>> {
  const sap = getSap();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (sap.program.account as any).memoryVault;
  if (!accounts) return [];
  try {
    const raw: Array<{ publicKey: PublicKey; account: any }> = await accounts.all();
    return raw.map((v) => ({ pda: v.publicKey, account: v.account }));
  } catch { return []; }
}

/* ── Agent module (direct) ────────────────────────────── */

/** Fetch raw agent account data by using agent.fetch() */
export async function fetchAgentRaw() {
  return getSap().agent.fetch();
}

/* ── Serialization ────────────────────────────────────── */

/**
 * Convert any on-chain account (AgentAccountData, etc.) to JSON-safe shape.
 * PublicKey → base58, BN → string, Uint8Array → hex.
 */
export function serialize<T extends Record<string, any>>(obj: T): Record<string, any> {
  return serializeAccount(obj);
}

/** Serialize a DiscoveredAgent for API response */
export function serializeDiscoveredAgent(agent: DiscoveredAgent): SerializedDiscoveredAgent {
  return {
    pda: agent.pda.toBase58(),
    identity: agent.identity ? (serializeAccount(agent.identity as any) as SerializedAgentIdentity) : null,
    stats: agent.stats ? (serializeAccount(agent.stats as any) as SerializedAgentStats) : null,
  };
}

/** Serialize an AgentProfile for API response */
export function serializeAgentProfile(profile: AgentProfile): SerializedAgentProfile {
  return {
    pda: profile.pda.toBase58(),
    identity: serializeAccount(profile.identity as any) as SerializedAgentIdentity,
    stats: profile.stats ? (serializeAccount(profile.stats as any) as SerializedAgentStats) : null,
    computed: {
      isActive: profile.computed.isActive,
      totalCalls: profile.computed.totalCalls,
      reputationScore: profile.computed.reputationScore,
      hasX402: profile.computed.hasX402,
      capabilityCount: profile.computed.capabilityCount,
      pricingTierCount: profile.computed.pricingTierCount,
      protocols: profile.computed.protocols,
    },
  };
}

/** Serialize NetworkOverview for API response */
export function serializeOverview(overview: NetworkOverview): SerializedNetworkOverview {
  return {
    totalAgents: overview.totalAgents,
    activeAgents: overview.activeAgents,
    totalFeedbacks: overview.totalFeedbacks,
    totalTools: overview.totalTools,
    totalVaults: overview.totalVaults,
    totalAttestations: overview.totalAttestations,
    totalCapabilities: overview.totalCapabilities,
    totalProtocols: overview.totalProtocols,
    authority: overview.authority.toBase58(),
  };
}

/** Serialize DiscoveredTool for API response */
export function serializeDiscoveredTool(tool: DiscoveredTool): SerializedDiscoveredTool {
  return {
    pda: tool.pda.toBase58(),
    descriptor: tool.descriptor ? (serializeAccount(tool.descriptor as any) as any) : null,
  };
}

/* ── Graph data (for bubblemap/network visualization) ─── */

export type GraphNode = {
  id: string;
  name: string;
  type: 'agent' | 'protocol' | 'capability' | 'tool';
  isActive: boolean;
  score: number;
  calls: string;
  radius: number;
  /** Extra metadata for tooltips / detail panels */
  meta?: Record<string, string | number | boolean | null>;
};

export type GraphLink = {
  source: string;
  target: string;
  type?: 'protocol' | 'capability' | 'tool' | 'shared-protocol';
  label?: string;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

/** Build rich graph data from agents + tools for BubbleMaps v2 visualization */
export function buildGraphData(agents: DiscoveredAgent[], tools?: DiscoveredTool[]): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const protocolSet = new Set<string>();
  // capability → { description, protocolId, version, ownerAgents[] }
  const capabilityMap = new Map<string, { description: string | null; protocolId: string | null; version: string | null; agents: string[] }>();

  for (const a of agents) {
    if (!a.identity) continue;

    const pda = a.pda.toBase58();
    const identity = a.identity;
    const totalCalls = identity.totalCallsServed?.toString() ?? '0';
    const score = identity.reputationScore ?? 0;

    // Collect protocol list for display
    const protoList = (identity.protocols ?? []).join(', ');
    const capList = (identity.capabilities ?? []).map((c: any) => c.id).join(', ');

    nodes.push({
      id: pda,
      name: identity.name,
      type: 'agent',
      isActive: identity.isActive,
      score,
      calls: totalCalls,
      radius: Math.max(24, Math.min(56, 24 + score / 20)),
      meta: {
        pda,
        wallet: identity.wallet?.toBase58?.() ?? String(identity.wallet ?? ''),
        description: identity.description ?? '',
        agentId: identity.agentId ?? null,
        agentUri: identity.agentUri ?? null,
        version: identity.version ?? 0,
        createdAt: identity.createdAt?.toString?.() ?? '',
        updatedAt: identity.updatedAt?.toString?.() ?? '',
        avgLatencyMs: identity.avgLatencyMs ?? 0,
        uptimePercent: identity.uptimePercent ?? 0,
        x402: identity.x402Endpoint ?? null,
        totalFeedbacks: identity.totalFeedbacks ?? 0,
        reputationSum: identity.reputationSum?.toString?.() ?? '0',
        capCount: identity.capabilities?.length ?? 0,
        protoCount: identity.protocols?.length ?? 0,
        protocols: protoList,
        capabilities: capList,
      },
    });

    // Protocols
    for (const proto of identity.protocols ?? []) {
      protocolSet.add(proto);
      links.push({ source: pda, target: `proto:${proto}`, type: 'protocol' });
    }

    // Capabilities
    for (const cap of identity.capabilities ?? []) {
      const existing = capabilityMap.get(cap.id);
      if (existing) {
        existing.agents.push(pda);
      } else {
        capabilityMap.set(cap.id, {
          description: cap.description ?? null,
          protocolId: cap.protocolId ?? null,
          version: cap.version ?? null,
          agents: [pda],
        });
      }
      links.push({ source: pda, target: `cap:${cap.id}`, type: 'capability', label: cap.description ?? undefined });

      if (cap.protocolId && !protocolSet.has(cap.protocolId)) {
        protocolSet.add(cap.protocolId);
        links.push({ source: pda, target: `proto:${cap.protocolId}`, type: 'protocol' });
      }
    }
  }

  // Add shared-protocol links between agents that share the same protocol
  const agentsByProto = new Map<string, string[]>();
  for (const a of agents) {
    if (!a.identity) continue;
    const pda = a.pda.toBase58();
    for (const proto of a.identity.protocols ?? []) {
      if (!agentsByProto.has(proto)) agentsByProto.set(proto, []);
      agentsByProto.get(proto)!.push(pda);
    }
  }
  for (const [proto, pdas] of agentsByProto) {
    for (let i = 0; i < pdas.length; i++) {
      for (let j = i + 1; j < pdas.length; j++) {
        links.push({ source: pdas[i], target: pdas[j], type: 'shared-protocol', label: proto });
      }
    }
  }

  // Protocol nodes — enriched with linked agent count / names
  for (const p of protocolSet) {
    const linkedAgents = agentsByProto.get(p) ?? [];
    nodes.push({
      id: `proto:${p}`,
      name: p,
      type: 'protocol',
      isActive: true,
      score: 0,
      calls: '0',
      radius: 16,
      meta: {
        protocolId: p,
        agentCount: linkedAgents.length,
        agents: linkedAgents.map((a) => a.slice(0, 8)).join(', '),
      },
    });
  }

  // Capability nodes — enriched with description, protocol, version, owner agents
  for (const [capId, capData] of capabilityMap) {
    nodes.push({
      id: `cap:${capId}`,
      name: capId,
      type: 'capability',
      isActive: true,
      score: 0,
      calls: '0',
      radius: 11,
      meta: {
        capabilityId: capId,
        description: capData.description ?? '',
        protocolId: capData.protocolId ?? '',
        version: capData.version ?? '',
        ownerCount: capData.agents.length,
        owners: capData.agents.map((a) => a.slice(0, 8)).join(', '),
      },
    });
  }

  // Tool nodes — enriched with full on-chain descriptor data
  if (tools) {
    for (const t of tools) {
      if (!t.descriptor) continue;
      const desc = t.descriptor as any;
      const toolPda = t.pda.toBase58();
      const agentPda = desc.agent?.toBase58?.() ?? String(desc.agent ?? '');
      const category = typeof desc.category === 'object' ? Object.keys(desc.category)[0] ?? 'custom' : String(desc.category);
      const method = typeof desc.httpMethod === 'object' ? Object.keys(desc.httpMethod)[0] ?? 'GET' : String(desc.httpMethod);

      nodes.push({
        id: `tool:${toolPda}`,
        name: desc.toolName ?? toolPda.slice(0, 8),
        type: 'tool',
        isActive: desc.isActive ?? true,
        score: 0,
        calls: String(desc.totalInvocations ?? 0),
        radius: 13,
        meta: {
          toolPda,
          agentPda,
          toolName: desc.toolName ?? '',
          category,
          method,
          paramsCount: desc.paramsCount ?? 0,
          requiredParams: desc.requiredParams ?? 0,
          isCompound: desc.isCompound ?? false,
          version: desc.version ?? 0,
          totalInvocations: desc.totalInvocations?.toString?.() ?? '0',
          createdAt: desc.createdAt?.toString?.() ?? '',
          updatedAt: desc.updatedAt?.toString?.() ?? '',
        },
      });

      // Link tool → agent
      if (agentPda) {
        links.push({ source: `tool:${toolPda}`, target: agentPda, type: 'tool', label: desc.toolName });
      }
    }
  }

  return { nodes, links };
}

/* ── Serialized types (JSON-safe for API responses) ───── */

export type SerializedAgentIdentity = {
  bump: number;
  version: number;
  wallet: string;
  name: string;
  description: string;
  agentId: string | null;
  agentUri: string | null;
  x402Endpoint: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  reputationScore: number;
  totalFeedbacks: number;
  reputationSum: string;
  totalCallsServed: string;
  avgLatencyMs: number;
  uptimePercent: number;
  capabilities: Array<{
    id: string;
    description: string | null;
    protocolId: string | null;
    version: string | null;
  }>;
  pricing: Array<{
    tierId: string;
    pricePerCall: string;
    minPricePerCall: string | null;
    maxPricePerCall: string | null;
    rateLimit: number;
    maxCallsPerSession: number;
    burstLimit: number | null;
    tokenType: any;
    tokenMint: string | null;
    tokenDecimals: number | null;
    settlementMode: any;
    minEscrowDeposit: string | null;
    batchIntervalSec: number | null;
    volumeCurve: any;
  }>;
  protocols: string[];
  activePlugins: Array<{ pluginType: any; pda: string }>;
};

export type SerializedAgentStats = {
  bump: number;
  agent: string;
  wallet: string;
  totalCallsServed: string;
  isActive: boolean;
  updatedAt: string;
};

export type SerializedDiscoveredAgent = {
  pda: string;
  identity: SerializedAgentIdentity | null;
  stats: SerializedAgentStats | null;
};

export type SerializedAgentProfile = {
  pda: string;
  identity: SerializedAgentIdentity;
  stats: SerializedAgentStats | null;
  computed: {
    isActive: boolean;
    totalCalls: string;
    reputationScore: number;
    hasX402: boolean;
    capabilityCount: number;
    pricingTierCount: number;
    protocols: string[];
  };
};

export type SerializedNetworkOverview = {
  totalAgents: string;
  activeAgents: string;
  totalFeedbacks: string;
  totalTools: number;
  totalVaults: number;
  totalAttestations: number;
  totalCapabilities: number;
  totalProtocols: number;
  authority: string;
};

export type SerializedToolDescriptor = {
  bump: number;
  agent: string;
  toolNameHash: number[];
  toolName: string;
  protocolHash: number[];
  version: number;
  descriptionHash: number[];
  inputSchemaHash: number[];
  outputSchemaHash: number[];
  httpMethod: any;
  category: any;
  paramsCount: number;
  requiredParams: number;
  isCompound: boolean;
  isActive: boolean;
  totalInvocations: string;
  createdAt: string;
  updatedAt: string;
  previousVersion: string;
};

export type SerializedDiscoveredTool = {
  pda: string;
  descriptor: SerializedToolDescriptor | null;
};

/* ── Additional entity types (Escrow, Attestation, Feedback, Vault) ── */

export type SerializedEscrow = {
  pda: string;
  agent: string;
  depositor: string;
  agentWallet: string;
  balance: string;
  totalDeposited: string;
  totalSettled: string;
  totalCallsSettled: string;
  pricePerCall: string;
  maxCalls: string;
  createdAt: string;
  lastSettledAt: string;
  expiresAt: string;
  tokenMint: string | null;
  tokenDecimals: number;
  volumeCurve: Array<{ afterCalls: number; pricePerCall: string }>;
};

export type SerializedAttestation = {
  pda: string;
  agent: string;
  attester: string;
  attestationType: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string;
  metadataHash: string;
};

export type SerializedFeedback = {
  pda: string;
  agent: string;
  reviewer: string;
  score: number;
  tag: string;
  isRevoked: boolean;
  createdAt: string;
  updatedAt: string;
  commentHash: string | null;
};

export type SerializedVault = {
  pda: string;
  agent: string;
  wallet: string;
  totalSessions: number;
  totalInscriptions: string;
  totalBytesInscribed: string;
  createdAt: string;
  nonceVersion: number;
  protocolVersion: number;
};
