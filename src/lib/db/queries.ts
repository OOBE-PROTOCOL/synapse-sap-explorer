/* ──────────────────────────────────────────────
 * DB Query Layer — Read/Write for all SAP entities
 *
 * Provides typed select + upsert functions for each table.
 * Used by API routes as the primary data source (DB → RPC fallback).
 * ────────────────────────────────────────────── */

import { eq, desc, sql } from 'drizzle-orm';
import { db } from '~/db';
import {
  agents,
  agentStats,
  tools,
  escrows,
  attestations,
  feedbacks,
  vaults,
  transactions,
  txDetails,
  networkSnapshots,
  syncCursors,
} from '~/db/schema';

/* ── Agents ───────────────────────────────────── */

export async function selectAllAgents() {
  return db.select().from(agents).orderBy(desc(agents.updatedAt));
}

export async function selectAgentByWallet(wallet: string) {
  const rows = await db.select().from(agents).where(eq(agents.wallet, wallet)).limit(1);
  return rows[0] ?? null;
}

export async function selectAgentByPda(pda: string) {
  const rows = await db.select().from(agents).where(eq(agents.pda, pda)).limit(1);
  return rows[0] ?? null;
}

export async function upsertAgent(data: typeof agents.$inferInsert) {
  return db
    .insert(agents)
    .values(data)
    .onConflictDoUpdate({
      target: agents.pda,
      set: {
        wallet: data.wallet,
        name: data.name,
        description: data.description,
        agentId: data.agentId,
        agentUri: data.agentUri,
        x402Endpoint: data.x402Endpoint,
        isActive: data.isActive,
        bump: data.bump,
        version: data.version,
        reputationScore: data.reputationScore,
        reputationSum: data.reputationSum,
        totalFeedbacks: data.totalFeedbacks,
        totalCallsServed: data.totalCallsServed,
        avgLatencyMs: data.avgLatencyMs,
        uptimePercent: data.uptimePercent,
        capabilities: data.capabilities,
        pricing: data.pricing,
        protocols: data.protocols,
        activePlugins: data.activePlugins,
        updatedAt: new Date(),
        indexedAt: new Date(),
      },
    });
}

export async function upsertAgents(dataArr: (typeof agents.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  const promises = dataArr.map((d) => upsertAgent(d));
  await Promise.allSettled(promises);
}

/* ── Agent Stats ──────────────────────────────── */

export async function selectAgentStats(agentPda: string) {
  const rows = await db.select().from(agentStats).where(eq(agentStats.agentPda, agentPda)).limit(1);
  return rows[0] ?? null;
}

export async function upsertAgentStats(data: typeof agentStats.$inferInsert) {
  return db
    .insert(agentStats)
    .values(data)
    .onConflictDoUpdate({
      target: agentStats.agentPda,
      set: {
        wallet: data.wallet,
        totalCallsServed: data.totalCallsServed,
        isActive: data.isActive,
        bump: data.bump,
        updatedAt: new Date(),
      },
    });
}

/* ── Tools ────────────────────────────────────── */

export async function selectAllTools() {
  return db.select().from(tools).orderBy(desc(tools.updatedAt));
}

export async function selectToolByPda(pda: string) {
  const rows = await db.select().from(tools).where(eq(tools.pda, pda)).limit(1);
  return rows[0] ?? null;
}

export async function upsertTool(data: typeof tools.$inferInsert) {
  return db
    .insert(tools)
    .values(data)
    .onConflictDoUpdate({
      target: tools.pda,
      set: {
        agentPda: data.agentPda,
        toolName: data.toolName,
        toolNameHash: data.toolNameHash,
        protocolHash: data.protocolHash,
        descriptionHash: data.descriptionHash,
        inputSchemaHash: data.inputSchemaHash,
        outputSchemaHash: data.outputSchemaHash,
        httpMethod: data.httpMethod,
        category: data.category,
        paramsCount: data.paramsCount,
        requiredParams: data.requiredParams,
        isCompound: data.isCompound,
        isActive: data.isActive,
        totalInvocations: data.totalInvocations,
        version: data.version,
        previousVersion: data.previousVersion,
        bump: data.bump,
        updatedAt: new Date(),
        indexedAt: new Date(),
      },
    });
}

export async function upsertTools(dataArr: (typeof tools.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertTool(d)));
}

/* ── Escrows ──────────────────────────────────── */

export async function selectAllEscrows() {
  return db.select().from(escrows).orderBy(desc(escrows.indexedAt));
}

export async function upsertEscrow(data: typeof escrows.$inferInsert) {
  return db
    .insert(escrows)
    .values(data)
    .onConflictDoUpdate({
      target: escrows.pda,
      set: {
        agentPda: data.agentPda,
        depositor: data.depositor,
        agentWallet: data.agentWallet,
        balance: data.balance,
        totalDeposited: data.totalDeposited,
        totalSettled: data.totalSettled,
        totalCallsSettled: data.totalCallsSettled,
        pricePerCall: data.pricePerCall,
        maxCalls: data.maxCalls,
        tokenMint: data.tokenMint,
        tokenDecimals: data.tokenDecimals,
        volumeCurve: data.volumeCurve,
        lastSettledAt: data.lastSettledAt,
        expiresAt: data.expiresAt,
        indexedAt: new Date(),
      },
    });
}

export async function upsertEscrows(dataArr: (typeof escrows.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertEscrow(d)));
}

/* ── Attestations ─────────────────────────────── */

export async function selectAllAttestations() {
  return db.select().from(attestations).orderBy(desc(attestations.indexedAt));
}

export async function upsertAttestation(data: typeof attestations.$inferInsert) {
  return db
    .insert(attestations)
    .values(data)
    .onConflictDoUpdate({
      target: attestations.pda,
      set: {
        agentPda: data.agentPda,
        attester: data.attester,
        attestationType: data.attestationType,
        isActive: data.isActive,
        metadataHash: data.metadataHash,
        expiresAt: data.expiresAt,
        indexedAt: new Date(),
      },
    });
}

export async function upsertAttestations(dataArr: (typeof attestations.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertAttestation(d)));
}

/* ── Feedbacks ────────────────────────────────── */

export async function selectAllFeedbacks() {
  return db.select().from(feedbacks).orderBy(desc(feedbacks.indexedAt));
}

export async function upsertFeedback(data: typeof feedbacks.$inferInsert) {
  return db
    .insert(feedbacks)
    .values(data)
    .onConflictDoUpdate({
      target: feedbacks.pda,
      set: {
        agentPda: data.agentPda,
        reviewer: data.reviewer,
        score: data.score,
        tag: data.tag,
        isRevoked: data.isRevoked,
        commentHash: data.commentHash,
        updatedAt: new Date(),
        indexedAt: new Date(),
      },
    });
}

export async function upsertFeedbacks(dataArr: (typeof feedbacks.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertFeedback(d)));
}

/* ── Vaults ───────────────────────────────────── */

export async function selectAllVaults() {
  return db.select().from(vaults).orderBy(desc(vaults.indexedAt));
}

export async function upsertVault(data: typeof vaults.$inferInsert) {
  return db
    .insert(vaults)
    .values(data)
    .onConflictDoUpdate({
      target: vaults.pda,
      set: {
        agentPda: data.agentPda,
        wallet: data.wallet,
        totalSessions: data.totalSessions,
        totalInscriptions: data.totalInscriptions,
        totalBytesInscribed: data.totalBytesInscribed,
        nonceVersion: data.nonceVersion,
        protocolVersion: data.protocolVersion,
        indexedAt: new Date(),
      },
    });
}

export async function upsertVaults(dataArr: (typeof vaults.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertVault(d)));
}

/* ── Transactions ─────────────────────────────── */

export async function selectTransactions(limit = 50) {
  return db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.slot))
    .limit(limit);
}

export async function selectTransactionBySignature(signature: string) {
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.signature, signature))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertTransaction(data: typeof transactions.$inferInsert) {
  return db
    .insert(transactions)
    .values(data)
    .onConflictDoUpdate({
      target: transactions.signature,
      set: {
        slot: data.slot,
        blockTime: data.blockTime,
        err: data.err,
        memo: data.memo,
        signer: data.signer,
        fee: data.fee,
        feeSol: data.feeSol,
        programs: data.programs,
        sapInstructions: data.sapInstructions,
        instructionCount: data.instructionCount,
        innerInstructionCount: data.innerInstructionCount,
        computeUnits: data.computeUnits,
        signerBalanceChange: data.signerBalanceChange,
        version: data.version,
        indexedAt: new Date(),
      },
    });
}

export async function upsertTransactions(dataArr: (typeof transactions.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertTransaction(d)));
}

/* ── Tx Details ───────────────────────────────── */

export async function selectTxDetails(signature: string) {
  const rows = await db
    .select({
      signature: txDetails.signature,
      status: txDetails.status,
      errorData: txDetails.errorData,
      accountKeys: txDetails.accountKeys,
      instructions: txDetails.instructions,
      logs: txDetails.logs,
      balanceChanges: txDetails.balanceChanges,
      tokenBalanceChanges: txDetails.tokenBalanceChanges,
      computeUnits: txDetails.computeUnits,
      // From parent transactions table
      slot: transactions.slot,
      blockTime: transactions.blockTime,
      fee: transactions.fee,
      version: transactions.version,
    })
    .from(txDetails)
    .leftJoin(transactions, eq(txDetails.signature, transactions.signature))
    .where(eq(txDetails.signature, signature))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertTxDetail(data: typeof txDetails.$inferInsert) {
  return db
    .insert(txDetails)
    .values(data)
    .onConflictDoUpdate({
      target: txDetails.signature,
      set: {
        status: data.status,
        errorData: data.errorData,
        accountKeys: data.accountKeys,
        instructions: data.instructions,
        logs: data.logs,
        balanceChanges: data.balanceChanges,
        tokenBalanceChanges: data.tokenBalanceChanges,
        computeUnits: data.computeUnits,
        indexedAt: new Date(),
      },
    });
}

/* ── Network Snapshots ────────────────────────── */

export async function selectLatestSnapshot() {
  const rows = await db
    .select()
    .from(networkSnapshots)
    .orderBy(desc(networkSnapshots.capturedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertSnapshot(data: typeof networkSnapshots.$inferInsert) {
  return db.insert(networkSnapshots).values(data);
}

/* ── Sync Cursors ─────────────────────────────── */

export async function getSyncCursor(entity: string) {
  const rows = await db
    .select()
    .from(syncCursors)
    .where(eq(syncCursors.entity, entity))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertSyncCursor(entity: string, lastSlot?: number, lastSignature?: string) {
  return db
    .insert(syncCursors)
    .values({ entity, lastSlot, lastSignature, lastSyncedAt: new Date() })
    .onConflictDoUpdate({
      target: syncCursors.entity,
      set: {
        lastSlot: lastSlot,
        lastSignature: lastSignature,
        lastSyncedAt: new Date(),
      },
    });
}
