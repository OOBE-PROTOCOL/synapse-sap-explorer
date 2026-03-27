/* ──────────────────────────────────────────────
 * DB ↔ API Mappers
 *
 * Converts between DB row shapes and the API response
 * shapes the frontend expects.
 * ────────────────────────────────────────────── */

import type { InferSelectModel } from 'drizzle-orm';
import type {
  agents,
  tools,
  escrows,
  attestations,
  feedbacks,
  vaults,
  transactions,
} from '~/db/schema';

/* ── Types ────────────────────────────────────── */
type AgentRow = InferSelectModel<typeof agents>;
type ToolRow = InferSelectModel<typeof tools>;
type EscrowRow = InferSelectModel<typeof escrows>;
type AttestationRow = InferSelectModel<typeof attestations>;
type FeedbackRow = InferSelectModel<typeof feedbacks>;
type VaultRow = InferSelectModel<typeof vaults>;
type TxRow = InferSelectModel<typeof transactions>;

/* ── Agents ───────────────────────────────────── */

export function dbAgentToApi(row: AgentRow) {
  const capabilities = (row.capabilities ?? []) as any[];
  const pricing = (row.pricing ?? []) as any[];
  const protocols = (row.protocols ?? []) as string[];

  return {
    pda: row.pda,
    identity: {
      bump: row.bump,
      version: row.version,
      wallet: row.wallet,
      name: row.name,
      description: row.description,
      agentId: row.agentId,
      agentUri: row.agentUri,
      x402Endpoint: row.x402Endpoint,
      isActive: row.isActive,
      createdAt: row.createdAt?.toISOString?.() ?? '0',
      updatedAt: row.updatedAt?.toISOString?.() ?? '0',
      reputationScore: row.reputationScore,
      totalFeedbacks: row.totalFeedbacks,
      reputationSum: row.reputationSum,
      totalCallsServed: row.totalCallsServed,
      avgLatencyMs: row.avgLatencyMs,
      uptimePercent: row.uptimePercent,
      capabilities,
      pricing,
      protocols,
      activePlugins: row.activePlugins ?? [],
    },
    stats: null,
    computed: {
      isActive: row.isActive ?? false,
      totalCalls: String(row.totalCallsServed ?? '0'),
      reputationScore: row.reputationScore ?? 0,
      hasX402: !!row.x402Endpoint,
      capabilityCount: capabilities.length,
      pricingTierCount: pricing.length,
      protocols,
    },
  };
}

/** Convert serialized API agent to DB insert shape */
export function apiAgentToDb(agent: any): {
  pda: string;
  wallet: string;
  name: string;
  description: string;
  agentId: string | null;
  agentUri: string | null;
  x402Endpoint: string | null;
  isActive: boolean;
  bump: number;
  version: number;
  reputationScore: number;
  reputationSum: string;
  totalFeedbacks: number;
  totalCallsServed: string;
  avgLatencyMs: number;
  uptimePercent: number;
  capabilities: any[];
  pricing: any[];
  protocols: string[];
  activePlugins: any[];
} {
  const id = agent.identity ?? {};
  return {
    pda: agent.pda,
    wallet: id.wallet ?? '',
    name: id.name ?? '',
    description: id.description ?? '',
    agentId: id.agentId ?? null,
    agentUri: id.agentUri ?? null,
    x402Endpoint: id.x402Endpoint ?? null,
    isActive: id.isActive ?? false,
    bump: id.bump ?? 0,
    version: id.version ?? 0,
    reputationScore: id.reputationScore ?? 0,
    reputationSum: String(id.reputationSum ?? '0'),
    totalFeedbacks: id.totalFeedbacks ?? 0,
    totalCallsServed: String(id.totalCallsServed ?? '0'),
    avgLatencyMs: id.avgLatencyMs ?? 0,
    uptimePercent: id.uptimePercent ?? 0,
    capabilities: id.capabilities ?? [],
    pricing: id.pricing ?? [],
    protocols: id.protocols ?? [],
    activePlugins: id.activePlugins ?? [],
  };
}

/* ── Tools ────────────────────────────────────── */

export function dbToolToApi(row: ToolRow) {
  return {
    pda: row.pda,
    descriptor: {
      bump: row.bump,
      agent: row.agentPda,
      toolNameHash: [],
      toolName: row.toolName,
      protocolHash: row.protocolHash ? [row.protocolHash] : [],
      version: row.version,
      descriptionHash: row.descriptionHash ? [row.descriptionHash] : [],
      inputSchemaHash: row.inputSchemaHash ? [row.inputSchemaHash] : [],
      outputSchemaHash: row.outputSchemaHash ? [row.outputSchemaHash] : [],
      httpMethod: row.httpMethod ?? 'GET',
      category: row.category ?? 'custom',
      paramsCount: row.paramsCount,
      requiredParams: row.requiredParams,
      isCompound: row.isCompound,
      isActive: row.isActive,
      totalInvocations: row.totalInvocations,
      createdAt: row.createdAt?.toISOString?.() ?? '0',
      updatedAt: row.updatedAt?.toISOString?.() ?? '0',
      previousVersion: row.previousVersion ?? '',
    },
  };
}

export function apiToolToDb(tool: any) {
  const d = tool.descriptor ?? {};
  return {
    pda: tool.pda,
    agentPda: typeof d.agent === 'string' ? d.agent : (d.agent?.toBase58?.() ?? ''),
    toolName: d.toolName ?? '',
    toolNameHash: Array.isArray(d.toolNameHash)
      ? Buffer.from(d.toolNameHash).toString('hex')
      : null,
    protocolHash: Array.isArray(d.protocolHash)
      ? Buffer.from(d.protocolHash).toString('hex')
      : null,
    descriptionHash: Array.isArray(d.descriptionHash)
      ? Buffer.from(d.descriptionHash).toString('hex')
      : null,
    inputSchemaHash: Array.isArray(d.inputSchemaHash)
      ? Buffer.from(d.inputSchemaHash).toString('hex')
      : null,
    outputSchemaHash: Array.isArray(d.outputSchemaHash)
      ? Buffer.from(d.outputSchemaHash).toString('hex')
      : null,
    httpMethod: typeof d.httpMethod === 'object' ? Object.keys(d.httpMethod)[0] ?? 'GET' : String(d.httpMethod ?? 'GET'),
    category: typeof d.category === 'object' ? Object.keys(d.category)[0] ?? 'custom' : String(d.category ?? 'custom'),
    paramsCount: d.paramsCount ?? 0,
    requiredParams: d.requiredParams ?? 0,
    isCompound: d.isCompound ?? false,
    isActive: d.isActive ?? true,
    totalInvocations: String(d.totalInvocations ?? '0'),
    version: d.version ?? 0,
    previousVersion: d.previousVersion ?? null,
    bump: d.bump ?? 0,
  };
}

/* ── Escrows ──────────────────────────────────── */

export function dbEscrowToApi(row: EscrowRow) {
  return {
    pda: row.pda,
    agent: row.agentPda,
    depositor: row.depositor,
    agentWallet: row.agentWallet,
    balance: row.balance,
    totalDeposited: row.totalDeposited,
    totalSettled: row.totalSettled,
    totalCallsSettled: row.totalCallsSettled,
    pricePerCall: row.pricePerCall,
    maxCalls: row.maxCalls,
    createdAt: row.createdAt?.toISOString?.() ?? '0',
    lastSettledAt: row.lastSettledAt?.toISOString?.() ?? '0',
    expiresAt: row.expiresAt?.toISOString?.() ?? '0',
    tokenMint: row.tokenMint,
    tokenDecimals: row.tokenDecimals,
    volumeCurve: row.volumeCurve ?? [],
  };
}

export function apiEscrowToDb(e: any) {
  return {
    pda: e.pda,
    agentPda: e.agent ?? '',
    depositor: e.depositor ?? '',
    agentWallet: e.agentWallet ?? '',
    balance: String(e.balance ?? '0'),
    totalDeposited: String(e.totalDeposited ?? '0'),
    totalSettled: String(e.totalSettled ?? '0'),
    totalCallsSettled: String(e.totalCallsSettled ?? '0'),
    pricePerCall: String(e.pricePerCall ?? '0'),
    maxCalls: String(e.maxCalls ?? '0'),
    tokenMint: e.tokenMint ?? null,
    tokenDecimals: e.tokenDecimals ?? 9,
    volumeCurve: e.volumeCurve ?? [],
    createdAt: e.createdAt && e.createdAt !== '0' ? new Date(Number(e.createdAt) * 1000) : new Date(),
    lastSettledAt: e.lastSettledAt && e.lastSettledAt !== '0' ? new Date(Number(e.lastSettledAt) * 1000) : null,
    expiresAt: e.expiresAt && e.expiresAt !== '0' ? new Date(Number(e.expiresAt) * 1000) : null,
  };
}

/* ── Attestations ─────────────────────────────── */

export function dbAttestationToApi(row: AttestationRow) {
  return {
    pda: row.pda,
    agent: row.agentPda,
    attester: row.attester,
    attestationType: row.attestationType,
    isActive: row.isActive,
    createdAt: row.createdAt?.toISOString?.() ?? '0',
    expiresAt: row.expiresAt?.toISOString?.() ?? '0',
    metadataHash: row.metadataHash ?? '',
  };
}

export function apiAttestationToDb(a: any) {
  return {
    pda: a.pda,
    agentPda: a.agent ?? '',
    attester: a.attester ?? '',
    attestationType: a.attestationType ?? '',
    isActive: a.isActive ?? false,
    metadataHash: a.metadataHash ?? null,
    createdAt: a.createdAt && a.createdAt !== '0' ? new Date(Number(a.createdAt) * 1000) : new Date(),
    expiresAt: a.expiresAt && a.expiresAt !== '0' ? new Date(Number(a.expiresAt) * 1000) : null,
  };
}

/* ── Feedbacks ────────────────────────────────── */

export function dbFeedbackToApi(row: FeedbackRow) {
  return {
    pda: row.pda,
    agent: row.agentPda,
    reviewer: row.reviewer,
    score: row.score,
    tag: row.tag,
    isRevoked: row.isRevoked,
    createdAt: row.createdAt?.toISOString?.() ?? '0',
    updatedAt: row.updatedAt?.toISOString?.() ?? '0',
    commentHash: row.commentHash,
  };
}

export function apiFeedbackToDb(f: any) {
  return {
    pda: f.pda,
    agentPda: f.agent ?? '',
    reviewer: f.reviewer ?? '',
    score: f.score ?? 0,
    tag: f.tag ?? '',
    isRevoked: f.isRevoked ?? false,
    commentHash: f.commentHash ?? null,
    createdAt: f.createdAt && f.createdAt !== '0' ? new Date(Number(f.createdAt) * 1000) : new Date(),
    updatedAt: f.updatedAt && f.updatedAt !== '0' ? new Date(Number(f.updatedAt) * 1000) : new Date(),
  };
}

/* ── Vaults ───────────────────────────────────── */

export function dbVaultToApi(row: VaultRow) {
  return {
    pda: row.pda,
    agent: row.agentPda,
    wallet: row.wallet,
    totalSessions: row.totalSessions,
    totalInscriptions: row.totalInscriptions,
    totalBytesInscribed: row.totalBytesInscribed,
    createdAt: row.createdAt?.toISOString?.() ?? '0',
    nonceVersion: row.nonceVersion,
    protocolVersion: row.protocolVersion,
  };
}

export function apiVaultToDb(v: any) {
  return {
    pda: v.pda,
    agentPda: v.agent ?? '',
    wallet: v.wallet ?? '',
    totalSessions: v.totalSessions ?? 0,
    totalInscriptions: String(v.totalInscriptions ?? '0'),
    totalBytesInscribed: String(v.totalBytesInscribed ?? '0'),
    nonceVersion: v.nonceVersion ?? 0,
    protocolVersion: v.protocolVersion ?? 0,
    createdAt: v.createdAt && v.createdAt !== '0' ? new Date(Number(v.createdAt) * 1000) : new Date(),
  };
}

/* ── Transactions ─────────────────────────────── */

export function dbTxToApi(row: TxRow) {
  return {
    signature: row.signature,
    slot: row.slot,
    blockTime: row.blockTime ? Math.floor(row.blockTime.getTime() / 1000) : null,
    err: row.err,
    memo: row.memo,
    signer: row.signer,
    fee: row.fee,
    feeSol: row.feeSol,
    programs: row.programs ?? [],
    sapInstructions: row.sapInstructions ?? [],
    instructionCount: row.instructionCount,
    innerInstructionCount: row.innerInstructionCount,
    computeUnitsConsumed: row.computeUnits,
    signerBalanceChange: row.signerBalanceChange,
    version: row.version,
  };
}

export function apiTxToDb(tx: any) {
  return {
    signature: tx.signature,
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    err: tx.err ?? false,
    memo: tx.memo ?? null,
    signer: tx.signer ?? null,
    fee: tx.fee ?? 0,
    feeSol: tx.feeSol ?? 0,
    programs: tx.programs ?? [],
    sapInstructions: tx.sapInstructions ?? [],
    instructionCount: tx.instructionCount ?? 0,
    innerInstructionCount: tx.innerInstructionCount ?? 0,
    computeUnits: tx.computeUnitsConsumed ?? null,
    signerBalanceChange: tx.signerBalanceChange ?? 0,
    version: tx.version ?? 'legacy',
  };
}
