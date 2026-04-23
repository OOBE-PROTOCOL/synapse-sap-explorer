/* ══════════════════════════════════════════════════════════
 * API Types — Request/response shapes for API routes
 * ══════════════════════════════════════════════════════════ */

import type {
  SerializedDiscoveredAgent,
  SerializedAgentProfile,
  SerializedNetworkOverview,
  SerializedDiscoveredTool,
  SerializedEscrow,
  SerializedAttestation,
  SerializedFeedback,
  SerializedVault,
  SerializedCapability,
  SerializedPricingTier,
  SerializedPluginRef,
  SerializedVolumeCurveEntry,
  AnchorEnum,
} from './sap';

/* ── Agent API shapes ─────────────────────────────────── */

export type ApiAgent = SerializedDiscoveredAgent & {
  settlementStats?: {
    totalSettled: string;
    totalCalls: string;
    totalDeposited: string;
    escrowCount: number;
    activeEscrows: number;
  };
};

export type ApiAgentProfile = SerializedAgentProfile;
export type ApiNetworkOverview = SerializedNetworkOverview;
export type ApiTool = SerializedDiscoveredTool;
export type ApiEscrow = SerializedEscrow;
export type ApiAttestation = SerializedAttestation;
export type ApiFeedback = SerializedFeedback;
export type ApiVault = SerializedVault;

/* ── Transaction API shapes ───────────────────────────── */

export type ApiTransaction = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
  memo: string | null;
  signer: string | null;
  fee: number;
  feeSol: number;
  programs: Array<{ id: string; name: string | null }>;
  sapInstructions: string[];
  accountKeys: string[];
  instructionCount: number;
  innerInstructionCount: number;
  computeUnitsConsumed: number | null;
  signerBalanceChange: number;
  version: string;
  value: { amount: number; symbol: string } | null;
};

export type ApiTxInstruction = {
  programId: string;
  program: string | null;
  type: string | null;
  data: string | null;
  accounts: string[];
  innerInstructions: ApiTxInstruction[];
};

export type ApiTxDetail = {
  signature: string;
  slot: number | null;
  blockTime: number | null;
  fee: number;
  status: string;
  version: string;
  error: { code?: string; message?: string; logs?: string[] } | null;
  instructions: ApiTxInstruction[];
  logs: string[];
  accountKeys: string[];
  balanceChanges: Array<{ account: string; pre: number; post: number; change: number }>;
  tokenBalanceChanges: Array<{
    account: string;
    mint: string;
    preAmount: string;
    postAmount: string;
    change: string;
    decimals: number;
  }>;
  computeUnitsConsumed: number | null;
  programs: Array<{ id: string; name: string | null }>;
  sapInstructions: string[];
  innerInstructionCount: number;
};

/* ── Escrow Events API ────────────────────────────────── */

export type ApiEscrowEvent = {
  id: number;
  escrowPda: string;
  txSignature: string;
  eventType: string;
  slot: number;
  blockTime: string | null;
  signer: string | null;
  balanceBefore: string | null;
  balanceAfter: string | null;
  amountChanged: string | null;
  callsSettled: string | null;
  agentPda: string | null;
  depositor: string | null;
  indexedAt: string;
};

/* ── Tool Descriptor (incoming from SDK) ──────────────── */

export type ApiToolDescriptorPayload = {
  pda: string;
  descriptor?: {
    bump?: number;
    agent?: string | { toBase58?: () => string };
    toolName?: string;
    toolNameHash?: number[];
    protocolHash?: number[];
    descriptionHash?: number[];
    inputSchemaHash?: number[];
    outputSchemaHash?: number[];
    httpMethod?: AnchorEnum;
    category?: AnchorEnum;
    paramsCount?: number;
    requiredParams?: number;
    isCompound?: boolean;
    isActive?: boolean;
    totalInvocations?: string | number;
    version?: number;
    previousVersion?: string | null;
  };
};

/* ── Agent Payload (incoming from SDK) ────────────────── */

export type ApiAgentPayload = {
  pda: string;
  identity?: {
    bump?: number;
    version?: number;
    wallet?: string;
    name?: string;
    description?: string;
    agentId?: string | null;
    agentUri?: string | null;
    x402Endpoint?: string | null;
    isActive?: boolean;
    createdAt?: string | number;
    updatedAt?: string | number;
    reputationScore?: number;
    totalFeedbacks?: number;
    reputationSum?: string | number;
    totalCallsServed?: string | number;
    avgLatencyMs?: number;
    uptimePercent?: number;
    capabilities?: SerializedCapability[];
    pricing?: SerializedPricingTier[];
    protocols?: string[];
    activePlugins?: SerializedPluginRef[];
  };
};

/* ── Escrow Payload (incoming from SDK) ───────────────── */

export type ApiEscrowPayload = {
  pda: string;
  agent?: string;
  depositor?: string;
  agentWallet?: string;
  balance?: string | number;
  totalDeposited?: string | number;
  totalSettled?: string | number;
  totalCallsSettled?: string | number;
  pricePerCall?: string | number;
  maxCalls?: string | number;
  tokenMint?: string | null;
  tokenDecimals?: number;
  volumeCurve?: SerializedVolumeCurveEntry[];
  status?: string;
  createdAt?: string | number;
  closedAt?: string | null;
  lastSettledAt?: string | number;
  expiresAt?: string | number;
};

/* ── Attestation Payload (incoming from SDK) ──────────── */

export type ApiAttestationPayload = {
  pda: string;
  agent?: string;
  attester?: string;
  attestationType?: string;
  isActive?: boolean;
  metadataHash?: string | null;
  createdAt?: string | number;
  expiresAt?: string | number;
};

/* ── Feedback Payload (incoming from SDK) ─────────────── */

export type ApiFeedbackPayload = {
  pda: string;
  agent?: string;
  reviewer?: string;
  score?: number;
  tag?: string;
  isRevoked?: boolean;
  commentHash?: string | null;
  createdAt?: string | number;
  updatedAt?: string | number;
};

/* ── Vault Payload (incoming from SDK) ────────────────── */

export type ApiVaultPayload = {
  pda: string;
  agent?: string;
  wallet?: string;
  totalSessions?: number;
  totalInscriptions?: string | number;
  totalBytesInscribed?: string | number;
  nonceVersion?: number;
  protocolVersion?: number;
  createdAt?: string | number;
};

/* ── Transaction Payload (incoming from RPC) ──────────── */

export type ApiTxPayload = {
  signature: string;
  slot: number;
  blockTime?: number | null;
  err?: boolean;
  memo?: string | null;
  signer?: string | null;
  fee?: number;
  feeSol?: number;
  programs?: Array<{ id: string; name: string | null }>;
  sapInstructions?: string[];
  instructionCount?: number;
  innerInstructionCount?: number;
  computeUnitsConsumed?: number | null;
  signerBalanceChange?: number;
  version?: string;
};

/* ── Address lookup response ──────────────────────────── */

export type AddressLookupResult = {
  address: string;
  type: 'agent' | 'tool' | 'escrow' | 'attestation' | 'feedback' | 'vault' | 'wallet' | 'unknown';
  agents: ApiAgent[];
  tools: ApiTool[];
  escrows: ApiEscrow[];
  attestations: ApiAttestation[];
  feedbacks: ApiFeedback[];
  vaults: ApiVault[];
  recentTxs: ApiTransaction[];
  solBalance: number;
  dataSize: number;
};

/* ── Parsed event (from Borsh/IDL coder) ──────────────── */

export type ParsedAnchorEvent = {
  name: string;
  data: Record<string, unknown>;
};

/* ── Tool schemas ─────────────────────────────────────── */

export type ApiToolSchema = {
  toolPda: string;
  toolName: string;
  schemaType: number;
  schemaTypeLabel: string;
  schemaData: string | null;
  schemaJson: unknown;
  schemaHash: string | null;
  computedHash: string | null;
  verified: boolean;
  compression: number;
  version: number;
  blockTime: Date | null;
};

/* ── Metrics response ─────────────────────────────────── */

export type ApiMetrics = SerializedNetworkOverview & {
  escrowAggregates?: {
    totalVolume: string;
    totalDeposited: string;
    totalBalance: string;
    totalCalls: string;
    totalEscrows: number;
    activeEscrows: number;
    fundedEscrows: number;
  } | null;
  agentRevenue?: Array<{
    agentPda: string;
    totalSettled: string;
    totalCalls: string;
    escrowCount: number;
  }>;
  x402Stats?: {
    totalPayments: number;
    totalX402: number;
    totalSplTransfers: number;
    totalAmount: string;
    uniqueAgents: number;
    uniquePayers: number;
  } | null;
  networkHealth?: {
    agents: { total: number; active: number; avgRep: number; withX402: number; recent7d: number };
    escrows: { total: number; active: number; totalVol: string; totalDep: string; expiringSoon: number };
    tools: number;
    vaults: number;
  };
  protocolGrowth?: {
    agents: { thisWeek: number; lastWeek: number; deltaPercent: number };
    tools: { thisWeek: number; lastWeek: number; deltaPercent: number };
    escrows: { thisWeek: number; lastWeek: number; deltaPercent: number };
  };
  dailyVolume?: Array<{
    day: string;
    totalLamports: string;
    totalCalls: string;
    txCount: number;
  }>;
  hourlyVolume?: Array<{
    hour: string;
    totalLamports: string;
    totalCalls: string;
    txCount: number;
  }>;
};

/* ── Search result ────────────────────────────────────── */

export type SearchResult = {
  pda: string;
  name: string | null;
  wallet: string | null;
  type: string;
};

/* ══════════════════════════════════════════════════════════
 * Hook response & domain types
 * (moved from hooks for cross-file reuse)
 * ══════════════════════════════════════════════════════════ */

/* ── SSE stream event ─────────────────────────────────── */

export type StreamEvent = {
  type: 'sap_event' | 'escrow_event' | 'transaction' | 'connected' | 'close';
  payload: Record<string, unknown>;
};

/* ── Decoded SAP event ────────────────────────────────── */

export type SapEvent = {
  name: string;
  data: Record<string, unknown>;
  txSignature: string;
  blockTime: number | null;
  slot: number;
};

/* ── Tool lifecycle event ─────────────────────────────── */

export type ToolEvent = {
  id: number;
  toolPda: string;
  agentPda: string;
  txSignature: string;
  eventType: string;
  slot: number;
  blockTime: string | null;
  toolName: string | null;
  oldVersion: number | null;
  newVersion: number | null;
  invocations: string | null;
  totalInvocations: string | null;
  schemaType: number | null;
  indexedAt: string | null;
};

/* ── Inscribed schema ─────────────────────────────────── */

export type InscribedSchema = {
  schemaType: string;
  schemaTypeRaw: number;
  schemaData: string;
  schemaJson: Record<string, unknown> | null;
  schemaHash: string;
  computedHash: string;
  verified: boolean;
  compression: number;
  version: number;
  toolName: string;
  agent: string;
  txSignature: string;
  blockTime: number | null;
};

/* ── Receipt batch (v0.7) ─────────────────────────────── */

export type ReceiptBatch = {
  pda: string;
  escrowPda: string;
  batchIndex: number;
  callsMerkleRoot: string;
  callCount: number;
  totalAmount: string | null;
  reporter: string;
  txSignature: string | null;
  slot: number | null;
  blockTime: string | null;
  createdAt: string;
};

/* ── Dispute ──────────────────────────────────────────── */

export type Dispute = {
  pda: string;
  escrowPda: string;
  disputant: string;
  agentPda: string;
  disputeType: string;
  resolutionLayer: string;
  outcome: string;
  disputeBond: string | null;
  provenCalls: number | null;
  claimedCalls: number | null;
  proofDeadline: string | null;
  reason: string | null;
  txSignature: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

/* ── Pending settlement ───────────────────────────────── */

export type PendingSettlement = {
  pda: string;
  escrowPda: string;
  agentPda: string;
  amount: string | null;
  callsCount: number | null;
  receiptMerkleRoot: string | null;
  status: string;
  txSignature: string | null;
  createdAt: string;
  settledAt: string | null;
};

/* ── Depositor ────────────────────────────────────────── */

export type Depositor = {
  rank: number;
  depositor: string;
  totalDepositedLamports: string;
  totalDepositedSol: string;
  totalSettledLamports: string;
  totalSettledSol: string;
  lockedBalance: string;
  lockedBalanceSol: string;
  totalCalls: string;
  escrowCount: number;
};

/* ── Volume bucket ────────────────────────────────────── */

export type VolumeBucket = {
  bucket: string;
  lamports: string;
  sol: string;
  calls: string;
  txCount: number;
};

/* ── Volume response ──────────────────────────────────── */

export type VolumeResponse = {
  totalSettledLamports: string;
  totalSettledSol: string;
  totalCallsSettled: string;
  totalDeposited: string;
  utilizationPercent: number;
  lockedBalance: string;
  activeEscrows: number;
  fundedEscrows: number;
  totalEscrows: number;
  topAgentsByRevenue: Array<{
    agentPda: string;
    agentName: string | null;
    isActive: boolean;
    totalSettled: string;
    totalSettledSol: string;
    totalCalls: string;
    escrowCount: number;
    sharePercent: number;
  }>;
};

/* ── Network health response ──────────────────────────── */

export type NetworkHealthResponse = {
  agents: {
    total: number;
    active: number;
    activePercent: number;
    avgReputation: number;
    withX402: number;
    active7d: number;
  };
  escrows: {
    total: number;
    active: number;
    totalVolumeSettled: string;
    totalVolumeSettledSol: string;
    totalDeposited: string;
    totalDepositedSol: string;
    utilisationPercent: number;
    expiringSoon: number;
  };
  tools: number;
  vaults: number;
  growth: {
    agents:  { thisWeek: number; lastWeek: number; deltaPercent: number };
    tools:   { thisWeek: number; lastWeek: number; deltaPercent: number };
    escrows: { thisWeek: number; lastWeek: number; deltaPercent: number };
  };
  expiringEscrows: Array<{
    pda: string;
    agentPda: string;
    depositor: string;
    balance: string;
    expiresAt: string | null;
  }>;
};

/* ── Escrow alert ─────────────────────────────────────── */

export type EscrowAlert = {
  pda: string;
  agentPda: string;
  depositor: string;
  balanceLamports: string;
  balanceSol: string;
  pricePerCall: string | null;
  expiresAt: string | null;
  status: string;
};

/* ── Agent revenue ────────────────────────────────────── */

export type AgentRevenueSeriesEntry = {
  day: string;
  lamports: string;
  sol: string;
  calls: string;
  txCount: number;
};

export type AgentRevenueResponse = {
  agentPda: string;
  wallet: string;
  days: number;
  totalSettledLamports: string;
  totalSettledSol: string;
  totalCalls: string;
  escrowCount: number;
  series: AgentRevenueSeriesEntry[];
};

/* ── x402 payments ────────────────────────────────────── */

export type X402PaymentRow = {
  signature: string;
  agentWallet: string;
  agentAta: string;
  payerWallet: string;
  payerAta: string;
  amount: string;
  amountRaw: string;
  mint: string;
  decimals: number;
  memo: string | null;
  hasX402Memo: boolean;
  settlementData: string | null;
  slot: number;
  blockTime: string | null;
};

export type X402Stats = {
  totalPayments: number;
  totalAmountRaw: string;
  totalAmount: string;
  uniquePayers: number;
  withMemo: number;
  latestSlot: number;
};

export type GlobalX402Stats = {
  totalPayments: number;
  totalAmountRaw: string;
  totalAmount: string;
  uniquePayers: number;
  uniqueAgents: number;
  withMemo: number;
};

/* ── Token / wallet balances ──────────────────────────── */

export interface TokenMeta {
  name: string;
  symbol: string;
  logo: string | null;
}

export interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  meta: TokenMeta | null;
}

export interface WalletBalancesResponse {
  wallet: string;
  sol: number;
  tokens: TokenBalance[];
}

/* ── Agent map ────────────────────────────────────────── */

export type AgentMapEntry = { name: string; pda: string; score: number };
export type AgentMap = Record<string, AgentMapEntry>;

/* ── Parsed inscription types (shared server+client) ─── */

export type ParsedInscription = {
  txSignature: string;
  slot: number;
  blockTime: number | null;
  sequence: number;
  epochIndex: number;
  encryptedData: string;
  nonce: string;
  contentHash: string;
  totalFragments: number;
  fragmentIndex: number;
  compression: number;
  dataLen: number;
  nonceVersion: number;
  timestamp: number;
  vault: string;
  session: string;
};

export type ParsedLedgerEntry = {
  txSignature: string;
  slot: number;
  blockTime: number | null;
  entryIndex: number;
  data: string;
  contentHash: string;
  dataLen: number;
  merkleRoot: string;
  timestamp: number;
  session: string;
  ledger: string;
};

export type InscriptionResult = {
  inscriptions: ParsedInscription[];
  ledgerEntries: ParsedLedgerEntry[];
  totalTxScanned: number;
  totalTxFromDb: number;
  totalTxFromRpc: number;
};

/* ── Vault types ──────────────────────────────────────── */

export type EnrichedVault = {
  pda: string;
  agent: string;
  wallet: string;
  totalSessions: number;
  totalInscriptions: string;
  totalBytesInscribed: string;
  createdAt: string;
  nonceVersion: number;
  protocolVersion: number;
  vaultNonce: string | null;
  lastNonceRotation: number | null;
  memoryLayers: {
    hasInscriptions: boolean;
    hasLedger: boolean;
    hasEpochPages: boolean;
    hasDelegates: boolean;
    hasCheckpoints: boolean;
  };
  sessionsSummary: Array<{
    pda: string;
    isClosed: boolean;
    sequenceCounter: number;
    totalBytes: number;
    currentEpoch: number;
    createdAt: number;
    lastInscribedAt: number | null;
  }>;
  delegateCount: number;
  latestTxSignature: string | null;
  latestTxSlot: number | null;
  latestTxTime: number | null;
  latestTxEvent: string | null;
};

export type RingEntry = {
  index: number;
  size: number;
  data: string;
  text: string | null;
};

export type VaultDetailLedgerPage = {
  pda: string;
  pageIndex: number;
  sealedAt: number;
  entriesInPage: number;
  dataSize: number;
  merkleRootAtSeal: string;
  entries: RingEntry[];
};

export type VaultDetailLedger = {
  pda: string;
  authority: string;
  numEntries: number;
  numPages: number;
  totalDataSize: number;
  merkleRoot: string;
  latestHash: string;
  createdAt: number;
  updatedAt: number;
  ringEntries: RingEntry[];
  pages: VaultDetailLedgerPage[];
};

export type VaultDetailEpochPage = {
  pda: string;
  epochIndex: number;
  startSequence: number;
  inscriptionCount: number;
  totalBytes: number;
  firstTs: number;
  lastTs: number;
};

export type VaultDetailCheckpoint = {
  pda: string;
  checkpointIndex: number;
  merkleRoot: string;
  sequenceAt: number;
  epochAt: number;
  totalBytesAt: number;
  inscriptionsAt: number;
  createdAt: number;
};

export type VaultDetailDelegate = {
  pda: string;
  delegate: string;
  permissions: number;
  permissionLabels: string[];
  expiresAt: number;
  createdAt: number;
};

export type VaultDetailEvent = {
  id: number;
  name: string;
  txSignature: string;
  slot: number;
  blockTime: number | null;
  data: Record<string, unknown>;
};

export type VaultDetailSession = {
  pda: string;
  vault: string;
  sessionHash: string;
  sequenceCounter: number;
  totalBytes: number;
  currentEpoch: number;
  totalEpochs: number;
  createdAt: number;
  lastInscribedAt: number | null;
  isClosed: boolean;
  merkleRoot: string;
  totalCheckpoints: number;
  tipHash: string;
  ledger: VaultDetailLedger | null;
  epochPages: VaultDetailEpochPage[];
  checkpoints: VaultDetailCheckpoint[];
};

export type VaultMemorySummary = {
  hasVaultInscriptions: boolean;
  hasLedger: boolean;
  hasEpochPages: boolean;
  hasDelegates: boolean;
  hasCheckpoints: boolean;
  totalLedgerEntries: number;
  totalSealedPages: number;
  totalEpochPages: number;
  totalDelegates: number;
  totalCheckpoints: number;
};

export type VaultDetailResponse = {
  pda: string;
  agent: string;
  wallet: string;
  vaultNonce: string;
  totalSessions: number;
  totalInscriptions: number;
  totalBytesInscribed: number;
  createdAt: number;
  nonceVersion: number;
  lastNonceRotation: number | null;
  protocolVersion: number;
  sessions: VaultDetailSession[];
  delegates: VaultDetailDelegate[];
  events: VaultDetailEvent[];
  memorySummary: VaultMemorySummary;
};

export type AgentMemoryVaultSummary = {
  pda: string;
  wallet: string;
  vaultNonce: string;
  totalSessions: number;
  totalInscriptions: number;
  totalBytesInscribed: number;
  nonceVersion: number;
  protocolVersion: number;
  createdAt: number;
  lastNonceRotation: number | null;
  sessionCount: number;
  delegateCount: number;
  sessions: Array<{
    pda: string;
    sessionHash: string;
    sequenceCounter: number;
    totalBytes: number;
    currentEpoch: number;
    totalEpochs: number;
    isClosed: boolean;
    createdAt: number;
    lastInscribedAt: number | null;
  }>;
};

export type AgentMemoryResponse = {
  agentPda: string;
  stats: {
    vaultCount: number;
    totalSessions: number;
    totalInscriptions: number;
    totalBytesInscribed: number;
  };
  vaults: AgentMemoryVaultSummary[];
};

/* ── Settlement ledger ────────────────────────────────── */

export type SettlementEntry = {
  id: number;
  signature: string;
  eventType: string;
  amountLamports: string;
  callsSettled: string;
  agentPda: string;
  depositor: string;
  escrowPda: string;
  blockTime: string | null;
  slot: number;
};

export type SettlementStats = {
  totalEntries: number;
  totalLamports: string;
  totalCalls: string;
  uniqueAgents: number;
  uniqueDepositors: number;
  uniqueEscrows: number;
  singleSettles: number;
  batchSettles: number;
};

/* ── Network snapshots ────────────────────────────────── */

export type SnapshotPoint = {
  capturedAt: string;
  totalAgents: number;
  activeAgents: number;
  totalTools: number;
  totalVaults: number;
  totalAttestations: number;
  totalFeedbacks: number;
  totalCapabilities: number;
  totalProtocols: number;
};

/* ── Endpoint health ──────────────────────────────────── */

export type EndpointHealth = {
  agentPda: string;
  name: string | null;
  wallet: string;
  endpoint: string;
  status: 'up' | 'down' | 'timeout' | 'no-endpoint';
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
};

/* ── Agent name map ───────────────────────────────────── */

export type AgentNameMap = Record<string, { name: string; pda: string; wallet: string }>;
