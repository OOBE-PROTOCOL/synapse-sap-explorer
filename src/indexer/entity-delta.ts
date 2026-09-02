import { eq } from 'drizzle-orm';
import { PublicKey } from '@solana/web3.js';
import { db } from '~/db';
import {
  agents,
  agentStats,
  tools,
  escrows,
  attestations,
  feedbacks,
  vaults,
} from '~/db/schema';
import type { ActivePlugin, Capability, PricingTier } from '~/db/schema';
import { getSapClient, getSynapseConnection } from '~/lib/sap/discovery';
import {
  bn,
  bnToDate,
  conflictUpdateSet,
  conflictUpdateWhere,
  enumKey,
  formatError,
  hashToHex,
  log,
  logErr,
  num,
  pk,
} from './utils';
import { serializeAccount } from '~/lib/sap/sdk-compat';

type Decoded = {
  kind:
    | 'agentAccount'
    | 'agentStats'
    | 'toolDescriptor'
    | 'escrowAccount'
    | 'agentAttestation'
    | 'feedbackAccount'
    | 'memoryVault';
  account: Record<string, unknown>;
};

const KNOWN_ACCOUNT_KINDS: ReadonlyArray<Decoded['kind']> = [
  'agentAccount',
  'agentStats',
  'toolDescriptor',
  'escrowAccount',
  'agentAttestation',
  'feedbackAccount',
  'memoryVault',
];

function decodeSapAccount(data: Buffer): Decoded | null {
  const sap = getSapClient();
  const coder = (sap.program as unknown as { coder?: { accounts?: { decode: (name: string, bytes: Buffer) => unknown } } })
    .coder?.accounts;
  if (!coder || data.length < 8) return null;

  for (const kind of KNOWN_ACCOUNT_KINDS) {
    try {
      const account = coder.decode(kind, data);
      if (account && typeof account === 'object') {
        return { kind, account: account as Record<string, unknown> };
      }
    } catch {
      // try next discriminator
    }
  }
  return null;
}

async function upsertAgentFromDecoded(pda: string, account: Record<string, unknown>) {
  const id = serializeAccount(account as Record<string, unknown>);
  const row = {
    pda,
    wallet: pk(account.wallet),
    name: String(id.name ?? ''),
    description: String(id.description ?? ''),
    agentId: id.agentId ? String(id.agentId) : null,
    agentUri: id.agentUri ? String(id.agentUri) : null,
    x402Endpoint: id.x402Endpoint ? String(id.x402Endpoint) : null,
    isActive: Boolean(account.isActive),
    bump: num(account.bump),
    version: num(account.version),
    reputationScore: num(account.reputationScore),
    reputationSum: bn(account.reputationSum),
    totalFeedbacks: num(account.totalFeedbacks),
    totalCallsServed: bn(account.totalCallsServed),
    avgLatencyMs: num(account.avgLatencyMs),
    uptimePercent: num(account.uptimePercent),
    capabilities: Array.isArray(id.capabilities) ? (id.capabilities as unknown as Capability[]) : [],
    pricing: Array.isArray(id.pricing) ? (id.pricing as unknown as PricingTier[]) : [],
    protocols: Array.isArray(id.protocols) ? (id.protocols as string[]) : [],
    activePlugins: Array.isArray(id.activePlugins) ? (id.activePlugins as unknown as ActivePlugin[]) : [],
    createdAt: bnToDate(account.createdAt) ?? new Date(),
    updatedAt: bnToDate(account.updatedAt) ?? new Date(),
    indexedAt: new Date(),
  };

  await db.insert(agents).values(row).onConflictDoUpdate({
    target: agents.pda,
    set: conflictUpdateSet(agents, ['pda']),
    setWhere: conflictUpdateWhere(agents, ['pda', 'indexedAt']),
  });
}

async function upsertAgentStatsFromDecoded(pda: string, account: Record<string, unknown>) {
  const row = {
    agentPda: pk(account.agent ?? pda),
    wallet: pk(account.wallet),
    totalCallsServed: bn(account.totalCallsServed),
    isActive: Boolean(account.isActive),
    bump: num(account.bump),
    updatedAt: bnToDate(account.updatedAt) ?? new Date(),
  };

  await db.insert(agentStats).values(row).onConflictDoUpdate({
    target: agentStats.agentPda,
    set: conflictUpdateSet(agentStats, ['agentPda']),
    setWhere: conflictUpdateWhere(agentStats, ['agentPda']),
  });
}

async function upsertToolFromDecoded(pda: string, account: Record<string, unknown>) {
  const row = {
    pda,
    agentPda: pk(account.agent),
    toolName: String(account.toolName ?? ''),
    toolNameHash: hashToHex(account.toolNameHash as number[] | Uint8Array | unknown),
    protocolHash: hashToHex(account.protocolHash as number[] | Uint8Array | unknown),
    descriptionHash: hashToHex(account.descriptionHash as number[] | Uint8Array | unknown),
    inputSchemaHash: hashToHex(account.inputSchemaHash as number[] | Uint8Array | unknown),
    outputSchemaHash: hashToHex(account.outputSchemaHash as number[] | Uint8Array | unknown),
    httpMethod: enumKey(account.httpMethod),
    category: enumKey(account.category),
    paramsCount: num(account.paramsCount),
    requiredParams: num(account.requiredParams),
    isCompound: Boolean(account.isCompound),
    isActive: account.isActive == null ? true : Boolean(account.isActive),
    totalInvocations: bn(account.totalInvocations),
    version: num(account.version),
    previousVersion: account.previousVersion ? pk(account.previousVersion) : null,
    bump: num(account.bump),
    createdAt: bnToDate(account.createdAt) ?? new Date(),
    updatedAt: bnToDate(account.updatedAt) ?? new Date(),
    indexedAt: new Date(),
  };

  await db.insert(tools).values(row).onConflictDoUpdate({
    target: tools.pda,
    set: conflictUpdateSet(tools, ['pda', 'createdAt']),
    setWhere: conflictUpdateWhere(tools, ['pda', 'createdAt', 'indexedAt']),
  });
}

async function upsertEscrowFromDecoded(pda: string, account: Record<string, unknown>) {
  const volumeCurve = Array.isArray(account.volumeCurve)
    ? account.volumeCurve.map((bp) => {
        const rec = bp as Record<string, unknown>;
        return {
          afterCalls: num(rec.afterCalls),
          pricePerCall: bn(rec.pricePerCall),
        };
      })
    : [];

  const row = {
    pda,
    agentPda: pk(account.agent),
    depositor: pk(account.depositor),
    agentWallet: pk(account.agentWallet),
    balance: bn(account.balance),
    totalDeposited: bn(account.totalDeposited),
    totalSettled: bn(account.totalSettled),
    totalCallsSettled: bn(account.totalCallsSettled),
    pricePerCall: bn(account.pricePerCall),
    maxCalls: bn(account.maxCalls),
    tokenMint: account.tokenMint ? pk(account.tokenMint) : null,
    tokenDecimals: num(account.tokenDecimals ?? 9),
    volumeCurve,
    status: 'active' as const,
    createdAt: bnToDate(account.createdAt) ?? new Date(),
    closedAt: null,
    lastSettledAt: bnToDate(account.lastSettledAt),
    expiresAt: bnToDate(account.expiresAt),
    indexedAt: new Date(),
  };

  await db.insert(escrows).values(row).onConflictDoUpdate({
    target: escrows.pda,
    set: conflictUpdateSet(escrows, ['pda', 'createdAt']),
    setWhere: conflictUpdateWhere(escrows, ['pda', 'createdAt', 'indexedAt']),
  });
}

async function upsertAttestationFromDecoded(pda: string, account: Record<string, unknown>) {
  const row = {
    pda,
    agentPda: pk(account.agent),
    attester: pk(account.attester),
    attestationType: String(account.attestationType ?? ''),
    isActive: Boolean(account.isActive),
    metadataHash: account.metadataHash
      ? (typeof account.metadataHash === 'string' ? account.metadataHash : hashToHex(account.metadataHash as number[] | Uint8Array | unknown))
      : null,
    createdAt: bnToDate(account.createdAt) ?? new Date(),
    expiresAt: bnToDate(account.expiresAt),
    indexedAt: new Date(),
  };

  await db.insert(attestations).values(row).onConflictDoUpdate({
    target: attestations.pda,
    set: conflictUpdateSet(attestations, ['pda', 'createdAt']),
    setWhere: conflictUpdateWhere(attestations, ['pda', 'createdAt', 'indexedAt']),
  });
}

async function upsertFeedbackFromDecoded(pda: string, account: Record<string, unknown>) {
  const row = {
    pda,
    agentPda: pk(account.agent),
    reviewer: pk(account.reviewer),
    score: num(account.score),
    tag: String(account.tag ?? ''),
    isRevoked: Boolean(account.isRevoked),
    commentHash: account.commentHash
      ? (typeof account.commentHash === 'string' ? account.commentHash : hashToHex(account.commentHash as number[] | Uint8Array | unknown))
      : null,
    createdAt: bnToDate(account.createdAt) ?? new Date(),
    updatedAt: bnToDate(account.updatedAt) ?? new Date(),
    indexedAt: new Date(),
  };

  await db.insert(feedbacks).values(row).onConflictDoUpdate({
    target: feedbacks.pda,
    set: conflictUpdateSet(feedbacks, ['pda', 'createdAt']),
    setWhere: conflictUpdateWhere(feedbacks, ['pda', 'createdAt', 'indexedAt']),
  });
}

async function upsertVaultFromDecoded(pda: string, account: Record<string, unknown>) {
  const row = {
    pda,
    agentPda: pk(account.agent),
    wallet: pk(account.wallet),
    totalSessions: num(account.totalSessions),
    totalInscriptions: bn(account.totalInscriptions),
    totalBytesInscribed: bn(account.totalBytesInscribed),
    nonceVersion: num(account.nonceVersion),
    protocolVersion: num(account.protocolVersion),
    createdAt: bnToDate(account.createdAt) ?? new Date(),
    indexedAt: new Date(),
  };

  await db.insert(vaults).values(row).onConflictDoUpdate({
    target: vaults.pda,
    set: conflictUpdateSet(vaults, ['pda', 'createdAt']),
    setWhere: conflictUpdateWhere(vaults, ['pda', 'createdAt', 'indexedAt']),
  });
}

async function markEscrowPossiblyClosed(pda: string) {
  await db.update(escrows)
    .set({ status: 'closed', closedAt: new Date(), indexedAt: new Date() })
    .where(eq(escrows.pda, pda));
}

async function applyDecodedAccount(pda: string, data: Buffer): Promise<boolean> {
  const decoded = decodeSapAccount(data);
  if (!decoded) return false;

  switch (decoded.kind) {
    case 'agentAccount':
      await upsertAgentFromDecoded(pda, decoded.account);
      break;
    case 'agentStats':
      await upsertAgentStatsFromDecoded(pda, decoded.account);
      break;
    case 'toolDescriptor':
      await upsertToolFromDecoded(pda, decoded.account);
      break;
    case 'escrowAccount':
      await upsertEscrowFromDecoded(pda, decoded.account);
      break;
    case 'agentAttestation':
      await upsertAttestationFromDecoded(pda, decoded.account);
      break;
    case 'feedbackAccount':
      await upsertFeedbackFromDecoded(pda, decoded.account);
      break;
    case 'memoryVault':
      await upsertVaultFromDecoded(pda, decoded.account);
      break;
  }

  return true;
}

export async function applyGrpcAccountUpdate(input: {
  pda: string;
  owner: string;
  lamports: number;
  data: Buffer;
  slot?: number;
}): Promise<boolean> {
  if (!input.pda || !input.owner) return false;
  if (input.owner !== getSapClient().program.programId.toBase58()) return false;

  if (input.lamports === 0 || input.data.length === 0) {
    await markEscrowPossiblyClosed(input.pda);
    log('delta', `Account tombstone observed pda=${input.pda.slice(0, 10)} slot=${input.slot ?? 0}`);
    return true;
  }

  const ok = await applyDecodedAccount(input.pda, input.data);
  if (ok) {
    log('delta', `Account delta applied pda=${input.pda.slice(0, 10)} slot=${input.slot ?? 0}`);
  }
  return ok;
}

export async function refreshAccountsByPdas(pdas: Iterable<string>): Promise<number> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const pda of pdas) {
    if (!pda || seen.has(pda)) continue;
    seen.add(pda);
    unique.push(pda);
  }
  if (unique.length === 0) return 0;

  const valid: { text: string; key: PublicKey }[] = [];
  for (const pda of unique) {
    try {
      valid.push({ text: pda, key: new PublicKey(pda) });
    } catch {
      // skip
    }
  }
  if (valid.length === 0) return 0;

  const conn = getSynapseConnection();
  const sapProgram = getSapClient().program.programId.toBase58();
  let applied = 0;
  const BATCH = 100;

  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    let infos: Awaited<ReturnType<typeof conn.getMultipleAccountsInfo>>;
    try {
      infos = await conn.getMultipleAccountsInfo(batch.map((b) => b.key), 'confirmed');
    } catch (e) {
      logErr('delta', `getMultipleAccountsInfo failed: ${formatError(e)}`);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const info = infos[j];

      if (!info) {
        await markEscrowPossiblyClosed(item.text);
        continue;
      }

      if (info.owner.toBase58() !== sapProgram) continue;
      if (!info.data || info.data.length < 8) continue;

      try {
        const ok = await applyDecodedAccount(item.text, Buffer.from(info.data));
        if (ok) applied++;
      } catch (e) {
        logErr('delta', `PDA refresh failed pda=${item.text.slice(0, 10)}: ${formatError(e)}`);
      }
    }
  }

  if (applied > 0) {
    log('delta', `Targeted PDA refresh applied=${applied} requested=${valid.length}`);
  }
  return applied;
}
