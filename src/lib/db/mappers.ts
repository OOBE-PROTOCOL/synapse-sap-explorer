import type { InferSelectModel } from 'drizzle-orm';
import type {
  agents,
  tools,
  escrows,
  escrowEvents,
  attestations,
  feedbacks,
  vaults,
  transactions,
  Capability,
  PricingTier,
  ActivePlugin,
} from '~/db/schema';
import type {
  ApiAgentPayload,
  ApiToolDescriptorPayload,
  ApiEscrowPayload,
  ApiAttestationPayload,
  ApiFeedbackPayload,
  ApiVaultPayload,
  ApiTxPayload,
} from '~/types/api';
import type { SerializedDiscoveredAgent, SerializedDiscoveredTool, SerializedPluginRef } from '~/types/sap';
import { asPublicKeyText } from '~/lib/format';

/* ── Types ────────────────────────────────────── */
type AgentRow = InferSelectModel<typeof agents>;
type ToolRow = InferSelectModel<typeof tools>;
type EscrowRow = InferSelectModel<typeof escrows>;
type EscrowEventRow = InferSelectModel<typeof escrowEvents>;
type AttestationRow = InferSelectModel<typeof attestations>;
type FeedbackRow = InferSelectModel<typeof feedbacks>;
type VaultRow = InferSelectModel<typeof vaults>;
type TxRow = InferSelectModel<typeof transactions>;

function chainDate(value: unknown): Date | undefined {
  if (value == null || value === '0' || value === 0) return undefined;
  if (value instanceof Date) return value;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    return new Date((n > 1e12 ? n : n * 1000));
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return undefined;
}

/* ── Agents ───────────────────────────────────── */

export function dbAgentToApi(row: AgentRow) {
  const capabilities = (row.capabilities ?? []) as Capability[];
  const pricing = (row.pricing ?? []) as PricingTier[];
  const protocols = (row.protocols ?? []) as string[];
  const pda = asPublicKeyText(row.pda);
  const wallet = asPublicKeyText(row.wallet);

  return {
    pda,
    identity: {
      bump: row.bump,
      version: row.version,
      wallet,
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
      activePlugins: (row.activePlugins ?? []) as unknown as SerializedPluginRef[],
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
export function apiAgentToDb(agent: ApiAgentPayload | SerializedDiscoveredAgent): {
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
  capabilities: Capability[];
  pricing: PricingTier[];
	  protocols: string[];
	  activePlugins: ActivePlugin[];
	  createdAt?: Date;
	  updatedAt?: Date;
	  indexedAt?: Date;
	} {
	  const id = agent.identity ?? {};
	  const createdAt = chainDate((id as { createdAt?: unknown }).createdAt);
	  const updatedAt = chainDate((id as { updatedAt?: unknown }).updatedAt);
	  return {
	    pda: asPublicKeyText(agent.pda),
	    wallet: asPublicKeyText(id.wallet),
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
    capabilities: (id.capabilities ?? []) as unknown as Capability[],
	    pricing: (id.pricing ?? []) as unknown as PricingTier[],
	    protocols: id.protocols ?? [],
	    activePlugins: (id.activePlugins ?? []) as unknown as ActivePlugin[],
	    ...(createdAt ? { createdAt } : {}),
	    ...(updatedAt ? { updatedAt } : {}),
	    indexedAt: new Date(),
	  };
	}

/* ── Tools ────────────────────────────────────── */

export function dbToolToApi(row: ToolRow) {
  const pda = asPublicKeyText(row.pda);
  const agentPda = asPublicKeyText(row.agentPda);
  return {
    pda,
    descriptor: {
      bump: row.bump,
      agent: agentPda,
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

export function apiToolToDb(tool: ApiToolDescriptorPayload | SerializedDiscoveredTool) {
  const d = tool.descriptor ?? {};
  return {
    pda: asPublicKeyText(tool.pda),
    agentPda: asPublicKeyText((d as { agent?: unknown }).agent),
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
    pda: asPublicKeyText(row.pda),
    agent: asPublicKeyText(row.agentPda),
    depositor: asPublicKeyText(row.depositor),
    agentWallet: asPublicKeyText(row.agentWallet),
    balance: row.balance,
    totalDeposited: row.totalDeposited,
    totalSettled: row.totalSettled,
    totalCallsSettled: row.totalCallsSettled,
    pricePerCall: row.pricePerCall,
    maxCalls: row.maxCalls,
    status: row.status,
    createdAt: row.createdAt?.toISOString?.() ?? '0',
    closedAt: row.closedAt?.toISOString?.() ?? null,
    lastSettledAt: row.lastSettledAt?.toISOString?.() ?? '0',
    expiresAt: row.expiresAt?.toISOString?.() ?? '0',
    tokenMint: row.tokenMint ? asPublicKeyText(row.tokenMint) : row.tokenMint,
    tokenDecimals: row.tokenDecimals,
    volumeCurve: row.volumeCurve ?? [],
    metadata: null,
  };
}

export function apiEscrowToDb(e: ApiEscrowPayload) {
  return {
    pda: asPublicKeyText(e.pda),
    agentPda: asPublicKeyText(e.agent),
    depositor: asPublicKeyText(e.depositor),
    agentWallet: asPublicKeyText(e.agentWallet),
    balance: String(e.balance ?? '0'),
    totalDeposited: String(e.totalDeposited ?? '0'),
    totalSettled: String(e.totalSettled ?? '0'),
    totalCallsSettled: String(e.totalCallsSettled ?? '0'),
    pricePerCall: String(e.pricePerCall ?? '0'),
    maxCalls: String(e.maxCalls ?? '0'),
    status: e.status ?? 'active',
    tokenMint: e.tokenMint ? asPublicKeyText(e.tokenMint) : null,
    tokenDecimals: e.tokenDecimals ?? 9,
    volumeCurve: e.volumeCurve ?? [],
    createdAt: chainDate(e.createdAt),
    closedAt: chainDate(e.closedAt),
    lastSettledAt: chainDate(e.lastSettledAt),
    expiresAt: chainDate(e.expiresAt),
    indexedAt: new Date(),
  };
}

/* ── Escrow Events ────────────────────────────── */

export function dbEscrowEventToApi(row: EscrowEventRow) {
  return {
    id: row.id,
    escrowPda: asPublicKeyText(row.escrowPda),
    txSignature: row.txSignature,
    eventType: row.eventType,
    slot: row.slot,
    blockTime: row.blockTime?.toISOString?.() ?? null,
    signer: row.signer ? asPublicKeyText(row.signer) : null,
    balanceBefore: row.balanceBefore,
    balanceAfter: row.balanceAfter,
    amountChanged: row.amountChanged,
    callsSettled: row.callsSettled,
    agentPda: row.agentPda ? asPublicKeyText(row.agentPda) : null,
    depositor: row.depositor ? asPublicKeyText(row.depositor) : null,
    indexedAt: row.indexedAt?.toISOString?.() ?? new Date().toISOString(),
  };
}

/* ── Attestations ─────────────────────────────── */

export function dbAttestationToApi(row: AttestationRow) {
  return {
    pda: asPublicKeyText(row.pda),
    agent: asPublicKeyText(row.agentPda),
    attester: asPublicKeyText(row.attester),
    attestationType: row.attestationType,
    isActive: row.isActive,
    createdAt: row.createdAt?.toISOString?.() ?? '0',
    expiresAt: row.expiresAt?.toISOString?.() ?? '0',
    metadataHash: row.metadataHash ?? '',
  };
}

export function apiAttestationToDb(a: ApiAttestationPayload) {
  return {
    pda: asPublicKeyText(a.pda),
    agentPda: asPublicKeyText(a.agent),
    attester: asPublicKeyText(a.attester),
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
    pda: asPublicKeyText(row.pda),
    agent: asPublicKeyText(row.agentPda),
    reviewer: asPublicKeyText(row.reviewer),
    score: row.score,
    tag: row.tag,
    isRevoked: row.isRevoked,
    createdAt: row.createdAt?.toISOString?.() ?? '0',
    updatedAt: row.updatedAt?.toISOString?.() ?? '0',
    commentHash: row.commentHash,
  };
}

export function apiFeedbackToDb(f: ApiFeedbackPayload) {
  return {
    pda: asPublicKeyText(f.pda),
    agentPda: asPublicKeyText(f.agent),
    reviewer: asPublicKeyText(f.reviewer),
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
    pda: asPublicKeyText(row.pda),
    agent: asPublicKeyText(row.agentPda),
    wallet: asPublicKeyText(row.wallet),
    totalSessions: row.totalSessions,
    totalInscriptions: row.totalInscriptions,
    totalBytesInscribed: row.totalBytesInscribed,
    createdAt: row.createdAt?.toISOString?.() ?? '0',
    nonceVersion: row.nonceVersion,
    protocolVersion: row.protocolVersion,
  };
}

export function apiVaultToDb(v: ApiVaultPayload) {
  return {
    pda: asPublicKeyText(v.pda),
    agentPda: asPublicKeyText(v.agent),
    wallet: asPublicKeyText(v.wallet),
    totalSessions: v.totalSessions ?? 0,
    totalInscriptions: String(v.totalInscriptions ?? '0'),
    totalBytesInscribed: String(v.totalBytesInscribed ?? '0'),
    nonceVersion: v.nonceVersion ?? 0,
    protocolVersion: v.protocolVersion ?? 0,
    createdAt: v.createdAt && v.createdAt !== '0' ? new Date(Number(v.createdAt) * 1000) : new Date(),
  };
}

/* ── Transactions ─────────────────────────────── */

/* ── Well-known mints ── */
const KNOWN_MINTS: Record<string, { symbol: string; decimals: number }> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', decimals: 6 },
  'So11111111111111111111111111111111111111112':    { symbol: 'SOL',  decimals: 9 },
};

/** Derive the primary transfer value from balance changes */
function computeTxValue(
  tokenChanges: { account: string; mint: string; change: string }[] | null | undefined,
  balanceChanges: { account: string; change: number }[] | null | undefined,
  signerBalanceChange: number,
  fee: number,
): { amount: number; symbol: string } | null {
  // 1. Token transfers (USDC, USDT, etc.) — take the positive (received) side
  if (tokenChanges && tokenChanges.length > 0) {
    // Find the largest positive token change (the "received" side)
    let best: { amount: number; symbol: string } | null = null;
    for (const tc of tokenChanges) {
      const raw = parseFloat(tc.change);
      if (isNaN(raw) || raw <= 0) continue;
      const known = KNOWN_MINTS[tc.mint];
      const symbol = known?.symbol ?? tc.mint.slice(0, 4) + '…';
      if (!best || raw > best.amount) best = { amount: raw, symbol };
    }
    if (best) return best;
  }
  // 2. SOL balance changes — exclude fee, take largest absolute move
  const solMove = Math.abs(signerBalanceChange + fee) / 1e9;
  if (solMove > 0.000001) return { amount: solMove, symbol: 'SOL' };
  return null;
}

export function dbTxToApi(row: TxRow & {
  accountKeys?: { pubkey: string }[] | null;
  tokenBalanceChanges?: { account: string; mint: string; change: string }[] | null;
  balanceChanges?: { account: string; change: number }[] | null;
}) {
  const keys = (row.accountKeys ?? []).map((k) =>
    typeof k === 'string' ? k : k.pubkey ?? String(k),
  );
  const value = computeTxValue(
    row.tokenBalanceChanges,
    row.balanceChanges,
    row.signerBalanceChange,
    row.fee,
  );
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
    accountKeys: keys,
    instructionCount: row.instructionCount,
    innerInstructionCount: row.innerInstructionCount,
    computeUnitsConsumed: row.computeUnits,
    signerBalanceChange: row.signerBalanceChange,
    version: row.version,
    value,
  };
}

export function apiTxToDb(tx: ApiTxPayload) {
  const cleanText = (value: string | null | undefined): string | null => {
    if (typeof value !== 'string') return null;
    // Strip null bytes and control characters that can break Postgres text columns.
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  };

  return {
    signature: tx.signature,
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    err: tx.err ?? false,
    memo: cleanText(tx.memo),
    signer: tx.signer ?? null,
    fee: tx.fee ?? 0,
    feeSol: tx.feeSol ?? 0,
    programs: (tx.programs ?? []).map((p) => ({
      id: p.id,
      name: cleanText(p.name),
    })),
    sapInstructions: (tx.sapInstructions ?? []).map((ix) => cleanText(ix) ?? ''),
    instructionCount: tx.instructionCount ?? 0,
    innerInstructionCount: tx.innerInstructionCount ?? 0,
    computeUnits: tx.computeUnitsConsumed ?? null,
    signerBalanceChange: tx.signerBalanceChange ?? 0,
    version: tx.version ?? 'legacy',
  };
}
