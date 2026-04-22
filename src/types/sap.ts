/* ══════════════════════════════════════════════════════════
 * SAP Types — SDK re-exports + serialized (JSON-safe) shapes
 * ══════════════════════════════════════════════════════════ */

/* ── SDK re-exports ───────────────────────────────────── */

export type {
  AgentAccountData,
  AgentStatsData,
  Capability as SdkCapability,
  PricingTier as SdkPricingTier,
  VolumeCurveBreakpoint,
  PluginRef,
} from '@oobe-protocol-labs/synapse-sap-sdk/types';

export type {
  DiscoveredAgent,
  AgentProfile,
  NetworkOverview,
  DiscoveredTool,
} from '@oobe-protocol-labs/synapse-sap-sdk/registries/discovery';

/* ── Anchor enum discriminants (JSON-serialized form) ─── */
// Anchor enums serialize as { VariantName: {} } objects.
// After JSON round-trip they become Record<string, object> or string.

/** Serialized Anchor enum — either `{ "Sol": {} }` object or plain string key */
export type AnchorEnum = Record<string, object> | string;

/* ── Serialized types (JSON-safe for API responses) ───── */

export type SerializedCapability = {
  id: string;
  description: string | null;
  protocolId: string | null;
  version: string | null;
};

export type SerializedVolumeCurveEntry = {
  afterCalls: number;
  pricePerCall: string;
};

export type SerializedPricingTier = {
  tierId: string;
  pricePerCall: string;
  minPricePerCall: string | null;
  maxPricePerCall: string | null;
  rateLimit: number;
  maxCallsPerSession: number;
  burstLimit: number | null;
  tokenType: AnchorEnum;
  tokenMint: string | null;
  tokenDecimals: number | null;
  settlementMode: AnchorEnum;
  minEscrowDeposit: string | null;
  batchIntervalSec: number | null;
  volumeCurve: SerializedVolumeCurveEntry[] | null;
};

export type SerializedPluginRef = {
  pluginType: AnchorEnum;
  pda: string;
};

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
  capabilities: SerializedCapability[];
  pricing: SerializedPricingTier[];
  protocols: string[];
  activePlugins: SerializedPluginRef[];
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
  httpMethod: AnchorEnum;
  category: AnchorEnum;
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
  hasInscribedSchema?: boolean;
  inscribedSchemaCount?: number;
};

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
  status?: string;
  createdAt: string;
  closedAt?: string | null;
  lastSettledAt: string;
  expiresAt: string;
  tokenMint: string | null;
  tokenDecimals: number;
  volumeCurve: SerializedVolumeCurveEntry[];
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

/* ── Graph visualization types ────────────────────────── */

export type GraphNode = {
  id: string;
  name: string;
  type: 'agent' | 'protocol' | 'capability' | 'tool';
  isActive: boolean;
  score: number;
  calls: string;
  radius: number;
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

/* ── Utility: extract enum key from Anchor enum object ── */

export function anchorEnumKey(val: AnchorEnum | null | undefined): string | null {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    return keys[0] ?? null;
  }
  return String(val);
}
