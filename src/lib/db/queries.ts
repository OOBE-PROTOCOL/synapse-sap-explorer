import { eq, desc, sql, and, count } from 'drizzle-orm';
import { db } from '~/db';
import {
  agents,
  agentStats,
  tools,
  toolEvents,
  toolSchemas,
  escrows,
  escrowEvents,
  attestations,
  feedbacks,
  vaults,
  transactions,
  txDetails,
  networkSnapshots,
  syncCursors,
  settlementLedger,
  x402DirectPayments,
  agentMetaplex,
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

export async function selectEscrowByPda(pda: string) {
  const rows = await db.select().from(escrows).where(eq(escrows.pda, pda)).limit(1);
  return rows[0] ?? null;
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
        status: data.status,
        closedAt: data.closedAt,
        lastSettledAt: data.lastSettledAt,
        expiresAt: data.expiresAt,
        indexedAt: new Date(),
      },
    });
}

/** Mark an escrow as closed (preserves the row in DB even though PDA is deleted on-chain) */
export async function markEscrowClosed(pda: string) {
  return db
    .update(escrows)
    .set({ status: 'closed', closedAt: new Date(), indexedAt: new Date() })
    .where(eq(escrows.pda, pda));
}

export async function upsertEscrows(dataArr: (typeof escrows.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertEscrow(d)));
}

/* ── Escrow Events ────────────────────────────── */

export async function selectEscrowEvents(escrowPda?: string, limit = 100) {
  if (escrowPda) {
    return db
      .select()
      .from(escrowEvents)
      .where(eq(escrowEvents.escrowPda, escrowPda))
      .orderBy(desc(escrowEvents.slot))
      .limit(limit);
  }
  return db
    .select()
    .from(escrowEvents)
    .orderBy(desc(escrowEvents.slot))
    .limit(limit);
}

export async function upsertEscrowEvent(data: typeof escrowEvents.$inferInsert) {
  // Use txSignature + eventType as natural dedup — prevent duplicate events
  const existing = await db
    .select({ id: escrowEvents.id })
    .from(escrowEvents)
    .where(
      and(
        eq(escrowEvents.txSignature, data.txSignature),
        eq(escrowEvents.eventType, data.eventType!),
        eq(escrowEvents.escrowPda, data.escrowPda),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];
  return db.insert(escrowEvents).values(data).returning({ id: escrowEvents.id });
}

export async function upsertEscrowEvents(dataArr: (typeof escrowEvents.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertEscrowEvent(d)));
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

export async function selectTransactions(limit = 50, offset = 0) {
  return db
    .select({
      signature: transactions.signature,
      slot: transactions.slot,
      blockTime: transactions.blockTime,
      err: transactions.err,
      memo: transactions.memo,
      signer: transactions.signer,
      fee: transactions.fee,
      feeSol: transactions.feeSol,
      programs: transactions.programs,
      sapInstructions: transactions.sapInstructions,
      instructionCount: transactions.instructionCount,
      innerInstructionCount: transactions.innerInstructionCount,
      computeUnits: transactions.computeUnits,
      signerBalanceChange: transactions.signerBalanceChange,
      version: transactions.version,
      indexedAt: transactions.indexedAt,
      accountKeys: txDetails.accountKeys,
      tokenBalanceChanges: txDetails.tokenBalanceChanges,
      balanceChanges: txDetails.balanceChanges,
    })
    .from(transactions)
    .leftJoin(txDetails, eq(transactions.signature, txDetails.signature))
    .orderBy(desc(transactions.slot))
    .limit(limit)
    .offset(offset);
}

export async function countTransactions() {
  const result = await db.select({ count: count() }).from(transactions);
  return result[0]?.count ?? 0;
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

/* ── Protocol Volume Aggregates ───────────────── */

/**
 * Sum all escrow settlement/deposit/balance data across the protocol.
 * Used for protocol net volume metric.
 */
export async function getEscrowAggregates() {
  const rows = await db.select({
    totalVolume:    sql<string>`COALESCE(SUM(${escrows.totalSettled}), '0')`,
    totalDeposited: sql<string>`COALESCE(SUM(${escrows.totalDeposited}), '0')`,
    totalBalance:   sql<string>`COALESCE(SUM(${escrows.balance}), '0')`,
    totalCalls:     sql<string>`COALESCE(SUM(${escrows.totalCallsSettled}), '0')`,
    totalEscrows:   sql<number>`COUNT(*)::int`,
    activeEscrows:  sql<number>`COUNT(*) FILTER (WHERE ${escrows.balance}::numeric > 0)::int`,
    fundedEscrows:  sql<number>`COUNT(*) FILTER (WHERE ${escrows.totalDeposited}::numeric > 0)::int`,
  }).from(escrows);
  return rows[0] ?? null;
}

/**
 * Per-agent settlement totals derived from escrow accounts.
 * Returns agents ranked by total SOL settled (authoritative revenue metric).
 */
export async function getAgentRevenueRanking(limit = 10) {
  return db.select({
    agentPda:     escrows.agentPda,
    totalSettled: sql<string>`SUM(${escrows.totalSettled})`,
    totalCalls:   sql<string>`SUM(${escrows.totalCallsSettled})`,
    escrowCount:  sql<number>`COUNT(*)::int`,
  })
    .from(escrows)
    .where(sql`${escrows.totalSettled}::numeric > 0`)
    .groupBy(escrows.agentPda)
    .orderBy(sql`SUM(${escrows.totalSettled}) DESC`)
    .limit(limit);
}

/**
 * Per-agent settlement stats for ALL agents (for data unification).
 * Key = agentPda, Value = { totalSettled, totalCalls, escrowCount }
 */
export async function getAgentSettlementMap() {
  const rows = await db.select({
    agentPda:     escrows.agentPda,
    totalSettled: sql<string>`COALESCE(SUM(${escrows.totalSettled}), '0')`,
    totalCalls:   sql<string>`COALESCE(SUM(${escrows.totalCallsSettled}), '0')`,
    totalDeposited: sql<string>`COALESCE(SUM(${escrows.totalDeposited}), '0')`,
    escrowCount:  sql<number>`COUNT(*)::int`,
    activeEscrows: sql<number>`COUNT(*) FILTER (WHERE ${escrows.balance}::numeric > 0)::int`,
  })
    .from(escrows)
    .groupBy(escrows.agentPda);

  const map: Record<string, {
    totalSettled: string;
    totalCalls: string;
    totalDeposited: string;
    escrowCount: number;
    activeEscrows: number;
  }> = {};
  for (const r of rows) {
    if (r.agentPda) map[r.agentPda] = r;
  }
  return map;
}

/* ── Settlement Ledger ────────────────────────── */

export async function upsertSettlementEntry(data: typeof settlementLedger.$inferInsert) {
  return db
    .insert(settlementLedger)
    .values(data)
    .onConflictDoNothing();       // unique constraint handled at INSERT level
}

export async function upsertSettlementEntries(dataArr: (typeof settlementLedger.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertSettlementEntry(d)));
}

/* ── Daily / Hourly Volume ────────────────────── */

/**
 * Returns daily settlement volume bucketed by UTC day.
 * Falls back to escrow-level data when settlement_ledger is empty.
 */
export async function getDailyVolume(days = 30) {
  return db.select({
    day:           sql<string>`DATE_TRUNC('day', ${settlementLedger.blockTime}) AT TIME ZONE 'UTC'`,
    totalLamports: sql<string>`COALESCE(SUM(${settlementLedger.amountLamports}), '0')`,
    totalCalls:    sql<string>`COALESCE(SUM(${settlementLedger.callsSettled}), '0')`,
    txCount:       sql<number>`COUNT(DISTINCT ${settlementLedger.signature})::int`,
  })
    .from(settlementLedger)
    .where(sql`${settlementLedger.blockTime} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`)
    .groupBy(sql`DATE_TRUNC('day', ${settlementLedger.blockTime})`)
    .orderBy(sql`DATE_TRUNC('day', ${settlementLedger.blockTime}) ASC`);
}

export async function getHourlyVolume(hours = 24) {
  return db.select({
    hour:          sql<string>`DATE_TRUNC('hour', ${settlementLedger.blockTime}) AT TIME ZONE 'UTC'`,
    totalLamports: sql<string>`COALESCE(SUM(${settlementLedger.amountLamports}), '0')`,
    totalCalls:    sql<string>`COALESCE(SUM(${settlementLedger.callsSettled}), '0')`,
    txCount:       sql<number>`COUNT(DISTINCT ${settlementLedger.signature})::int`,
  })
    .from(settlementLedger)
    .where(sql`${settlementLedger.blockTime} >= NOW() - INTERVAL '${sql.raw(String(hours))} hours'`)
    .groupBy(sql`DATE_TRUNC('hour', ${settlementLedger.blockTime})`)
    .orderBy(sql`DATE_TRUNC('hour', ${settlementLedger.blockTime}) ASC`);
}

/* ── Top Depositors ───────────────────────────── */

/**
 * Returns the top depositors ranked by total SOL deposited (from escrow accounts).
 */
export async function getTopDepositors(limit = 10) {
  return db.select({
    depositor:      escrows.depositor,
    totalDeposited: sql<string>`SUM(${escrows.totalDeposited})`,
    totalSettled:   sql<string>`SUM(${escrows.totalSettled})`,
    totalBalance:   sql<string>`SUM(${escrows.balance})`,
    totalCalls:     sql<string>`SUM(${escrows.totalCallsSettled})`,
    escrowCount:    sql<number>`COUNT(*)::int`,
  })
    .from(escrows)
    .where(sql`${escrows.totalDeposited}::numeric > 0`)
    .groupBy(escrows.depositor)
    .orderBy(sql`SUM(${escrows.totalDeposited}) DESC`)
    .limit(limit);
}

/* ── Agent Revenue Series ─────────────────────── */

/**
 * Time-series revenue for a single agent from settlement ledger.
 * Buckets by UTC day for the given look-back window.
 */
export async function getAgentRevenueSeries(agentPda: string, days = 30) {
  return db.select({
    day:           sql<string>`DATE_TRUNC('day', ${settlementLedger.blockTime}) AT TIME ZONE 'UTC'`,
    totalLamports: sql<string>`COALESCE(SUM(${settlementLedger.amountLamports}), '0')`,
    totalCalls:    sql<string>`COALESCE(SUM(${settlementLedger.callsSettled}), '0')`,
    txCount:       sql<number>`COUNT(*)::int`,
  })
    .from(settlementLedger)
    .where(
      and(
        eq(settlementLedger.agentPda, agentPda),
        sql`${settlementLedger.blockTime} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`,
      ),
    )
    .groupBy(sql`DATE_TRUNC('day', ${settlementLedger.blockTime})`)
    .orderBy(sql`DATE_TRUNC('day', ${settlementLedger.blockTime}) ASC`);
}

/* ── Network Health ───────────────────────────── */

/**
 * Returns protocol-wide health metrics:
 * active agent %, escrow utilisation, avg. reputation, recent activity.
 */
export async function getNetworkHealth() {
  const agentMetrics = await db.select({
    total:        sql<number>`COUNT(*)::int`,
    active:       sql<number>`COUNT(*) FILTER (WHERE ${agents.isActive} = true)::int`,
    avgRep:       sql<number>`COALESCE(AVG(${agents.reputationScore}), 0)::float`,
    withX402:     sql<number>`COUNT(*) FILTER (WHERE ${agents.x402Endpoint} IS NOT NULL)::int`,
    recent7d:     sql<number>`COUNT(*) FILTER (WHERE ${agents.updatedAt} >= NOW() - INTERVAL '7 days')::int`,
  }).from(agents);

  const escrowMetrics = await db.select({
    total:        sql<number>`COUNT(*)::int`,
    active:       sql<number>`COUNT(*) FILTER (WHERE ${escrows.balance}::numeric > 0)::int`,
    totalVol:     sql<string>`COALESCE(SUM(${escrows.totalSettled}), '0')`,
    totalDep:     sql<string>`COALESCE(SUM(${escrows.totalDeposited}), '0')`,
    expiringSoon: sql<number>`COUNT(*) FILTER (WHERE ${escrows.expiresAt} IS NOT NULL AND ${escrows.expiresAt} BETWEEN NOW() AND NOW() + INTERVAL '48 hours')::int`,
  }).from(escrows);

  const toolCount = await db.select({ count: sql<number>`COUNT(*)::int` }).from(tools);
  const vaultCount = await db.select({ count: sql<number>`COUNT(*)::int` }).from(vaults);

  return {
    agents: agentMetrics[0] ?? { total: 0, active: 0, avgRep: 0, withX402: 0, recent7d: 0 },
    escrows: escrowMetrics[0] ?? { total: 0, active: 0, totalVol: '0', totalDep: '0', expiringSoon: 0 },
    tools: toolCount[0]?.count ?? 0,
    vaults: vaultCount[0]?.count ?? 0,
  };
}

/* ── Expiring Escrows ─────────────────────────── */

export async function getExpiringEscrows(hoursAhead = 48) {
  return db.select()
    .from(escrows)
    .where(
      and(
        sql`${escrows.expiresAt} IS NOT NULL`,
        sql`${escrows.expiresAt} > NOW()`,
        sql`${escrows.expiresAt} <= NOW() + INTERVAL '${sql.raw(String(hoursAhead))} hours'`,
        sql`${escrows.balance}::numeric > 0`,
      ),
    )
    .orderBy(escrows.expiresAt);
}

/* ── Protocol Growth Rate ─────────────────────── */

/**
 * Compares registered entity counts between two 7-day windows.
 * Returns week-over-week deltas for agents, tools, escrows.
 */
export async function getProtocolGrowthRate() {
  const agentGrowth = await db.select({
    thisWeek: sql<number>`COUNT(*) FILTER (WHERE ${agents.createdAt} >= NOW() - INTERVAL '7 days')::int`,
    lastWeek: sql<number>`COUNT(*) FILTER (WHERE ${agents.createdAt} >= NOW() - INTERVAL '14 days' AND ${agents.createdAt} < NOW() - INTERVAL '7 days')::int`,
  }).from(agents);

  const toolGrowth = await db.select({
    thisWeek: sql<number>`COUNT(*) FILTER (WHERE ${tools.createdAt} >= NOW() - INTERVAL '7 days')::int`,
    lastWeek: sql<number>`COUNT(*) FILTER (WHERE ${tools.createdAt} >= NOW() - INTERVAL '14 days' AND ${tools.createdAt} < NOW() - INTERVAL '7 days')::int`,
  }).from(tools);

  const escrowGrowth = await db.select({
    thisWeek: sql<number>`COUNT(*) FILTER (WHERE ${escrows.createdAt} >= NOW() - INTERVAL '7 days')::int`,
    lastWeek: sql<number>`COUNT(*) FILTER (WHERE ${escrows.createdAt} >= NOW() - INTERVAL '14 days' AND ${escrows.createdAt} < NOW() - INTERVAL '7 days')::int`,
  }).from(escrows);

  function delta(thisW: number, lastW: number) {
    if (lastW === 0) return thisW > 0 ? 100 : 0;
    return Math.round(((thisW - lastW) / lastW) * 100);
  }

  const ag = agentGrowth[0] ?? { thisWeek: 0, lastWeek: 0 };
  const tg = toolGrowth[0] ?? { thisWeek: 0, lastWeek: 0 };
  const eg = escrowGrowth[0] ?? { thisWeek: 0, lastWeek: 0 };

  return {
    agents:  { thisWeek: ag.thisWeek, lastWeek: ag.lastWeek, deltaPercent: delta(ag.thisWeek, ag.lastWeek) },
    tools:   { thisWeek: tg.thisWeek, lastWeek: tg.lastWeek, deltaPercent: delta(tg.thisWeek, tg.lastWeek) },
    escrows: { thisWeek: eg.thisWeek, lastWeek: eg.lastWeek, deltaPercent: delta(eg.thisWeek, eg.lastWeek) },
  };
}

/* ── Settlement Ledger Queries ────────────────── */

/** Paginated settlement ledger with optional filters */
export async function selectSettlementLedger(opts?: {
  agentPda?: string;
  depositor?: string;
  escrowPda?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts?.agentPda) conditions.push(eq(settlementLedger.agentPda, opts.agentPda));
  if (opts?.depositor) conditions.push(eq(settlementLedger.depositor, opts.depositor));
  if (opts?.escrowPda) conditions.push(eq(settlementLedger.escrowPda, opts.escrowPda));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const [rows, countResult] = await Promise.all([
    db.select()
      .from(settlementLedger)
      .where(where)
      .orderBy(desc(settlementLedger.blockTime))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`COUNT(*)::int` })
      .from(settlementLedger)
      .where(where),
  ]);

  return { rows, total: countResult[0]?.count ?? 0 };
}

/** Settlement ledger aggregate stats */
export async function getSettlementLedgerStats() {
  const rows = await db.select({
    totalEntries:    sql<number>`COUNT(*)::int`,
    totalLamports:   sql<string>`COALESCE(SUM(${settlementLedger.amountLamports}), '0')`,
    totalCalls:      sql<string>`COALESCE(SUM(${settlementLedger.callsSettled}), '0')`,
    uniqueAgents:    sql<number>`COUNT(DISTINCT ${settlementLedger.agentPda})::int`,
    uniqueDepositors: sql<number>`COUNT(DISTINCT ${settlementLedger.depositor})::int`,
    uniqueEscrows:   sql<number>`COUNT(DISTINCT ${settlementLedger.escrowPda})::int`,
    singleSettles:   sql<number>`COUNT(*) FILTER (WHERE ${settlementLedger.eventType} = 'PaymentSettledEvent')::int`,
    batchSettles:    sql<number>`COUNT(*) FILTER (WHERE ${settlementLedger.eventType} = 'BatchSettledEvent')::int`,
  }).from(settlementLedger);
  return rows[0] ?? null;
}

/* ── x402 Global Payments Queries ─────────────── */

/** Paginated x402 direct payments (global) */
export async function selectX402Payments(opts?: {
  agentWallet?: string;
  payerWallet?: string;
  hasX402Memo?: boolean;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (opts?.agentWallet) conditions.push(eq(x402DirectPayments.agentWallet, opts.agentWallet));
  if (opts?.payerWallet) conditions.push(eq(x402DirectPayments.payerWallet, opts.payerWallet));
  if (opts?.hasX402Memo !== undefined) conditions.push(eq(x402DirectPayments.hasX402Memo, opts.hasX402Memo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const [rows, countResult] = await Promise.all([
    db.select()
      .from(x402DirectPayments)
      .where(where)
      .orderBy(desc(x402DirectPayments.blockTime))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`COUNT(*)::int` })
      .from(x402DirectPayments)
      .where(where),
  ]);

  return { rows, total: countResult[0]?.count ?? 0 };
}

/* ── Network Snapshots History ────────────────── */

/** Returns snapshot history for growth charts */
export async function selectSnapshotHistory(days = 30) {
  return db.select()
    .from(networkSnapshots)
    .where(sql`${networkSnapshots.capturedAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`)
    .orderBy(networkSnapshots.capturedAt);
}

/* ── Depositor Profile ────────────────────────── */

/** Get full depositor portfolio — all escrows for a given depositor */
export async function getDepositorProfile(depositor: string) {
  const escrowRows = await db.select()
    .from(escrows)
    .where(eq(escrows.depositor, depositor))
    .orderBy(desc(escrows.createdAt));

  const settleRows = await db.select({
    totalSettled: sql<string>`COALESCE(SUM(${settlementLedger.amountLamports}), '0')`,
    totalCalls:   sql<string>`COALESCE(SUM(${settlementLedger.callsSettled}), '0')`,
    txCount:      sql<number>`COUNT(DISTINCT ${settlementLedger.signature})::int`,
  })
    .from(settlementLedger)
    .where(eq(settlementLedger.depositor, depositor));

  return {
    depositor,
    escrows: escrowRows,
    settlements: settleRows[0] ?? { totalSettled: '0', totalCalls: '0', txCount: 0 },
  };
}

/* ── Global Search ────────────────────────────── */

/** Search across agents, tools, escrows by name/PDA/wallet */
export async function globalSearch(query: string, limit = 20) {
  const pattern = `%${query}%`;

  const [agentResults, toolResults, escrowResults] = await Promise.all([
    db.select({ pda: agents.pda, name: agents.name, wallet: agents.wallet, type: sql<string>`'agent'` })
      .from(agents)
      .where(sql`${agents.name} ILIKE ${pattern} OR ${agents.pda} ILIKE ${pattern} OR ${agents.wallet} ILIKE ${pattern}`)
      .limit(limit),
    db.select({ pda: tools.pda, name: tools.toolName, wallet: sql<string>`NULL`, type: sql<string>`'tool'` })
      .from(tools)
      .where(sql`${tools.toolName} ILIKE ${pattern} OR ${tools.pda} ILIKE ${pattern}`)
      .limit(limit),
    db.select({ pda: escrows.pda, name: sql<string>`NULL`, wallet: escrows.depositor, type: sql<string>`'escrow'` })
      .from(escrows)
      .where(sql`${escrows.pda} ILIKE ${pattern} OR ${escrows.depositor} ILIKE ${pattern} OR ${escrows.agentPda} ILIKE ${pattern}`)
      .limit(limit),
  ]);

  return [...agentResults, ...toolResults, ...escrowResults].slice(0, limit);
}

/* ── Tool Events ──────────────────────────────── */

export async function selectToolEvents(toolPda: string, limit = 50) {
  return db
    .select()
    .from(toolEvents)
    .where(eq(toolEvents.toolPda, toolPda))
    .orderBy(desc(toolEvents.slot))
    .limit(limit);
}

export async function selectToolEventsByAgent(agentPda: string, limit = 100) {
  return db
    .select()
    .from(toolEvents)
    .where(eq(toolEvents.agentPda, agentPda))
    .orderBy(desc(toolEvents.slot))
    .limit(limit);
}

export async function insertToolEvent(data: typeof toolEvents.$inferInsert) {
  // Dedup via unique constraint: (tx_signature, event_type, tool_pda)
  try {
    return await db.insert(toolEvents).values(data).returning({ id: toolEvents.id });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === '23505') return null; // duplicate — skip
    throw e;
  }
}

export async function insertToolEvents(dataArr: (typeof toolEvents.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => insertToolEvent(d)));
}

/* ── Tool Schemas ─────────────────────────────── */

export async function selectToolSchemas(toolPda: string) {
  return db
    .select()
    .from(toolSchemas)
    .where(eq(toolSchemas.toolPda, toolPda))
    .orderBy(desc(toolSchemas.version), desc(toolSchemas.schemaType));
}

export async function selectToolSchemasByAgent(agentPda: string) {
  return db
    .select()
    .from(toolSchemas)
    .where(eq(toolSchemas.agentPda, agentPda))
    .orderBy(desc(toolSchemas.version));
}

export async function selectToolSchemaCounts() {
  return db
    .select({
      toolPda: toolSchemas.toolPda,
      count: count(toolSchemas.id),
    })
    .from(toolSchemas)
    .groupBy(toolSchemas.toolPda);
}

export async function upsertToolSchema(data: typeof toolSchemas.$inferInsert) {
  // Unique on (tool_pda, schema_type, version)
  try {
    const existing = await db
      .select({ id: toolSchemas.id })
      .from(toolSchemas)
      .where(
        and(
          eq(toolSchemas.toolPda, data.toolPda),
          eq(toolSchemas.schemaType, data.schemaType),
          eq(toolSchemas.version, data.version ?? 0),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return await db
        .update(toolSchemas)
        .set({
          schemaData: data.schemaData,
          schemaJson: data.schemaJson,
          schemaHash: data.schemaHash,
          computedHash: data.computedHash,
          verified: data.verified,
          compression: data.compression,
          txSignature: data.txSignature,
          blockTime: data.blockTime,
          indexedAt: new Date(),
        })
        .where(eq(toolSchemas.id, existing[0].id));
    }
    return await db.insert(toolSchemas).values(data);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === '23505') return null;
    throw e;
  }
}

export async function upsertToolSchemas(dataArr: (typeof toolSchemas.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertToolSchema(d)));
}

/** Mark a tool as closed in DB (PDA reclaimed on-chain) */
export async function markToolClosed(pda: string) {
  return db
    .update(tools)
    .set({ isActive: false, indexedAt: new Date() })
    .where(eq(tools.pda, pda));
}

/** Select tools by agent PDA */
export async function selectToolsByAgent(agentPda: string) {
  return db
    .select()
    .from(tools)
    .where(eq(tools.agentPda, agentPda))
    .orderBy(desc(tools.updatedAt));
}

/* ── Agent Metaplex Snapshot ──────────────────── */

export async function selectAgentMetaplex(wallet: string) {
  const rows = await db
    .select()
    .from(agentMetaplex)
    .where(eq(agentMetaplex.wallet, wallet))
    .limit(1);
  return rows[0] ?? null;
}

export async function selectAllAgentMetaplex() {
  return db.select().from(agentMetaplex);
}

export async function upsertAgentMetaplex(data: typeof agentMetaplex.$inferInsert) {
  const now = new Date();
  return db
    .insert(agentMetaplex)
    .values({ ...data, refreshedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: agentMetaplex.wallet,
      set: {
        sapAgentPda: data.sapAgentPda ?? null,
        asset: data.asset ?? null,
        linked: data.linked ?? false,
        pluginCount: data.pluginCount ?? 0,
        registryCount: data.registryCount ?? 0,
        agentIdentityUri: data.agentIdentityUri ?? null,
        registration: data.registration ?? null,
        registryAgents: data.registryAgents ?? [],
        source: data.source ?? 'unknown',
        error: data.error ?? null,
        refreshedAt: now,
        updatedAt: now,
      },
    });
}
