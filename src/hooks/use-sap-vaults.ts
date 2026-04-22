'use client';


import { useSapQuery } from '~/hooks/use-sap-query';

const POLL_VAULTS = 30_000;
const POLL_VAULT_DETAIL = 30_000;


type FetchState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
};

function useFetch<T>(url: string | null, opts?: { pollInterval?: number }): FetchState<T> {
  const key = url
    ? (() => {
        const u = new URL(url, 'http://localhost');
        const parts = u.pathname.split('/').filter(Boolean);
        const params = Object.fromEntries(u.searchParams.entries());
        return Object.keys(params).length > 0 ? [...parts, params] : parts;
      })()
    : ['__disabled'];
  return useSapQuery<T>({ queryKey: key, url, pollInterval: opts?.pollInterval });
}


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

type VaultsResponse = {
  vaults: EnrichedVault[];
  total: number;
};

export function useVaults() {
  return useFetch<VaultsResponse>('/api/sap/vaults', { pollInterval: POLL_VAULTS });
}


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

export function useVaultDetail(pda: string | undefined) {
  return useFetch<VaultDetailResponse>(pda ? `/api/sap/vaults/${pda}` : null, { pollInterval: POLL_VAULT_DETAIL });
}


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

export function useInscriptions(vaultPda: string | undefined, sessionPda?: string) {
  const qs = sessionPda ? `?session=${encodeURIComponent(sessionPda)}` : '';
  return useFetch<InscriptionResult>(
    vaultPda ? `/api/sap/vaults/${vaultPda}/inscriptions${qs}` : null,
    { pollInterval: POLL_VAULT_DETAIL },
  );
}


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

export function useAgentMemory(agentPda: string | undefined) {
  return useFetch<AgentMemoryResponse>(agentPda ? `/api/sap/agents/${agentPda}/memory` : null);
}
