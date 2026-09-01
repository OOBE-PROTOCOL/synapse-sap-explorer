import { eq, desc, sql, and, count, inArray, or, gte, lte } from 'drizzle-orm';
import { db } from '~/db';
import { conflictUpdateSet, conflictUpdateWhere } from '~/lib/db/upsert';
import { asPublicKeyText } from '~/lib/format';
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
  agentSnapshots,
  toolSnapshots,
  syncCursors,
  settlementLedger,
  x402DirectPayments,
  agentMetaplex,
  agentLogos,
  agentEnrichmentCache,
  entityAliases,
  agentDirectorySnapshots,
  dataHealthChecks,
  apiKeys,
  apiRateWindows,
} from '~/db/schema';

/* ── Agents ───────────────────────────────────── */

export async function selectAllAgents() {
  return db.select().from(agents).orderBy(desc(agents.updatedAt));
}

export async function selectAgentByWallet(wallet: string) {
  const normalized = asPublicKeyText(wallet) || wallet;
  const rows = await db.select().from(agents).where(eq(agents.wallet, normalized)).limit(1);
  if (rows[0]) return rows[0];
  if (normalized !== wallet) {
    const legacyRows = await db.select().from(agents).where(eq(agents.wallet, wallet)).limit(1);
    return legacyRows[0] ?? null;
  }
  return rows[0] ?? null;
}

export async function selectAgentByPda(pda: string) {
  const normalized = asPublicKeyText(pda) || pda;
  const rows = await db.select().from(agents).where(eq(agents.pda, normalized)).limit(1);
  if (rows[0]) return rows[0];
  if (normalized !== pda) {
    const legacyRows = await db.select().from(agents).where(eq(agents.pda, pda)).limit(1);
    return legacyRows[0] ?? null;
  }
  return rows[0] ?? null;
}

export async function upsertAgent(data: typeof agents.$inferInsert) {
  return db
    .insert(agents)
    .values(data)
    .onConflictDoUpdate({
      target: agents.pda,
      set: conflictUpdateSet(agents, ['pda', 'createdAt']),
      setWhere: conflictUpdateWhere(agents, ['pda', 'createdAt', 'indexedAt']),
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
      set: conflictUpdateSet(agentStats, ['agentPda']),
      setWhere: conflictUpdateWhere(agentStats, ['agentPda']),
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

export async function selectAddressEntities(address: string) {
  const normalized = asPublicKeyText(address) || address;

  const agentRows = await db
    .select()
    .from(agents)
    .where(or(eq(agents.pda, normalized), eq(agents.wallet, normalized)))
    .limit(4);

  const agentPdas = Array.from(new Set([
    normalized,
    ...agentRows.map((agent) => agent.pda).filter(Boolean),
  ]));

  const [toolRows, escrowRows, attestationRows, feedbackRows, vaultRows] = await Promise.all([
    db
      .select()
      .from(tools)
      .where(or(eq(tools.pda, normalized), inArray(tools.agentPda, agentPdas)))
      .limit(250),
    db
      .select()
      .from(escrows)
      .where(or(
        eq(escrows.pda, normalized),
        inArray(escrows.agentPda, agentPdas),
        eq(escrows.depositor, normalized),
        eq(escrows.agentWallet, normalized),
      ))
      .orderBy(desc(escrows.indexedAt))
      .limit(250),
    db
      .select()
      .from(attestations)
      .where(or(
        eq(attestations.pda, normalized),
        inArray(attestations.agentPda, agentPdas),
        eq(attestations.attester, normalized),
      ))
      .orderBy(desc(attestations.indexedAt))
      .limit(250),
    db
      .select()
      .from(feedbacks)
      .where(or(
        eq(feedbacks.pda, normalized),
        inArray(feedbacks.agentPda, agentPdas),
        eq(feedbacks.reviewer, normalized),
      ))
      .orderBy(desc(feedbacks.indexedAt))
      .limit(250),
    db
      .select()
      .from(vaults)
      .where(or(eq(vaults.pda, normalized), inArray(vaults.agentPda, agentPdas)))
      .orderBy(desc(vaults.indexedAt))
      .limit(250),
  ]);

  return {
    agents: agentRows,
    tools: toolRows,
    escrows: escrowRows,
    attestations: attestationRows,
    feedbacks: feedbackRows,
    vaults: vaultRows,
  };
}

export async function upsertTool(data: typeof tools.$inferInsert) {
  return db
    .insert(tools)
    .values(data)
    .onConflictDoUpdate({
      target: tools.pda,
      set: conflictUpdateSet(tools, ['pda', 'createdAt']),
      setWhere: conflictUpdateWhere(tools, ['pda', 'createdAt', 'indexedAt']),
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
      set: conflictUpdateSet(escrows, ['pda', 'createdAt']),
      setWhere: conflictUpdateWhere(escrows, ['pda', 'createdAt', 'indexedAt']),
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
      set: conflictUpdateSet(attestations, ['pda', 'createdAt']),
      setWhere: conflictUpdateWhere(attestations, ['pda', 'createdAt', 'indexedAt']),
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
      set: conflictUpdateSet(feedbacks, ['pda', 'createdAt']),
      setWhere: conflictUpdateWhere(feedbacks, ['pda', 'createdAt', 'indexedAt']),
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
      set: conflictUpdateSet(vaults, ['pda', 'createdAt']),
      setWhere: conflictUpdateWhere(vaults, ['pda', 'createdAt', 'indexedAt']),
    });
}

export async function upsertVaults(dataArr: (typeof vaults.$inferInsert)[]) {
  if (dataArr.length === 0) return;
  await Promise.allSettled(dataArr.map((d) => upsertVault(d)));
}

/* ── Transactions ─────────────────────────────── */

export type TransactionTimeRange = '24h' | '7d' | '30d' | '120d' | 'all';

export function resolveTransactionTimeRange(range?: string | null) {
  const normalized = (range ?? 'all') as TransactionTimeRange;
  const now = Date.now();
  const msByRange: Record<TransactionTimeRange, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '120d': 120 * 24 * 60 * 60 * 1000,
    all: 0,
  };

  const windowMs = msByRange[normalized] ?? 0;
  return {
    range: normalized,
    from: windowMs > 0 ? new Date(now - windowMs) : undefined,
    to: new Date(now),
  };
}

export async function selectTransactions(
  limit = 50,
  offset = 0,
  opts: {
    includeDetails?: boolean;
    from?: Date | number | string;
    to?: Date | number | string;
  } = {},
) {
  const whereConditions = [] as ReturnType<typeof and>[];
  const fromDate = opts.from ? new Date(opts.from) : undefined;
  const toDate = opts.to ? new Date(opts.to) : undefined;

  if (fromDate && Number.isFinite(fromDate.getTime())) {
    whereConditions.push(gte(transactions.blockTime, fromDate));
  }
  if (toDate && Number.isFinite(toDate.getTime())) {
    whereConditions.push(lte(transactions.blockTime, toDate));
  }

  const query = db
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
      accountKeys: sql<null>`NULL`,
      tokenBalanceChanges: sql<null>`NULL`,
      balanceChanges: sql<null>`NULL`,
    })
    .from(transactions)
    .orderBy(desc(transactions.slot));

  if (whereConditions.length > 0) {
    query.where(and(...whereConditions));
  }

  const rows = await query.limit(limit).offset(offset);

  if (rows.length === 0 || opts.includeDetails === false) return rows;

  const signatures = rows.map((row) => row.signature);
  const detailRows = await db
    .select({
      signature: txDetails.signature,
      accountKeys: txDetails.accountKeys,
      tokenBalanceChanges: txDetails.tokenBalanceChanges,
      balanceChanges: txDetails.balanceChanges,
    })
    .from(txDetails)
    .where(inArray(txDetails.signature, signatures));

  const detailsBySignature = new Map(detailRows.map((row) => [row.signature, row]));
  return rows.map((row) => {
    const details = detailsBySignature.get(row.signature);
    if (!details) return row;
    return {
      ...row,
      accountKeys: details.accountKeys,
      tokenBalanceChanges: details.tokenBalanceChanges,
      balanceChanges: details.balanceChanges,
    };
  });
}

export async function countTransactions(opts: { from?: Date | number | string; to?: Date | number | string } = {}) {
  const whereConditions = [] as ReturnType<typeof and>[];
  const fromDate = opts.from ? new Date(opts.from) : undefined;
  const toDate = opts.to ? new Date(opts.to) : undefined;

  if (fromDate && Number.isFinite(fromDate.getTime())) {
    whereConditions.push(gte(transactions.blockTime, fromDate));
  }
  if (toDate && Number.isFinite(toDate.getTime())) {
    whereConditions.push(lte(transactions.blockTime, toDate));
  }

  const query = db.select({ count: count() }).from(transactions);
  if (whereConditions.length > 0) {
    query.where(and(...whereConditions));
  }

  const result = await query;
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
      setWhere: sql`${transactions.instructionCount} = 0
        OR ${transactions.signer} IS NULL
        OR ${transactions.computeUnits} IS NULL
        OR ${transactions.programs}::text = '[]'
        OR array_length(${transactions.sapInstructions}, 1) IS NULL`,
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
      setWhere: sql`array_length(${txDetails.logs}, 1) IS NULL
        OR jsonb_array_length(${txDetails.instructions}) = 0
        OR jsonb_array_length(${txDetails.accountKeys}) = 0`,
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

/* ── Public API security ──────────────────────── */

export async function selectApiKeyByHash(keyHash: string) {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);
  return rows[0] ?? null;
}

export async function touchApiKeyLastUsed(id: number) {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, id));
}

export async function incrementApiRateWindow(identityKey: string, tier: string, windowStart: Date): Promise<number> {
  const rows = await db
    .select()
    .from(apiRateWindows)
    .where(
      and(
        eq(apiRateWindows.identityKey, identityKey),
        eq(apiRateWindows.tier, tier),
        eq(apiRateWindows.windowStart, windowStart),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    await db.insert(apiRateWindows).values({
      identityKey,
      tier,
      windowStart,
      requestCount: 1,
      updatedAt: new Date(),
    });
    return 1;
  }

  const nextCount = row.requestCount + 1;
  await db
    .update(apiRateWindows)
    .set({ requestCount: nextCount, updatedAt: new Date() })
    .where(
      and(
        eq(apiRateWindows.identityKey, identityKey),
        eq(apiRateWindows.tier, tier),
        eq(apiRateWindows.windowStart, windowStart),
      ),
    );
  return nextCount;
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

export type AgentRevenueSnapshot = {
  agentPda: string;
  volume24hLamports: string;
  volume7dLamports: string;
  totalSettledLamports: string;
  totalDepositedLamports: string;
  calls24h: string;
  calls7d: string;
  totalCalls: string;
  tx24h: number;
  tx7d: number;
  escrowCount: number;
  activeEscrows: number;
  daily: Array<{
    day: string;
    totalLamports: string;
    totalCalls: string;
    txCount: number;
  }>;
};

/**
 * Batched settlement/revenue snapshots for agent directory cards.
 * Immutable settlement rows are aggregated once per API response so the UI
 * can rank merchants and draw sparklines without N+1 per-card requests.
 */
export async function getAgentRevenueSnapshots(days = 14) {
  const lookbackDays = Math.max(1, Math.min(days, 90));
  const [summaryRes, dailyRes, escrowDailyRes, rankingRes] = await Promise.allSettled([
    db.select({
      agentPda: settlementLedger.agentPda,
      volume24hLamports: sql<string>`COALESCE(SUM(${settlementLedger.amountLamports}) FILTER (WHERE ${settlementLedger.blockTime} >= NOW() - INTERVAL '24 hours'), '0')`,
      volume7dLamports: sql<string>`COALESCE(SUM(${settlementLedger.amountLamports}) FILTER (WHERE ${settlementLedger.blockTime} >= NOW() - INTERVAL '7 days'), '0')`,
      calls24h: sql<string>`COALESCE(SUM(${settlementLedger.callsSettled}) FILTER (WHERE ${settlementLedger.blockTime} >= NOW() - INTERVAL '24 hours'), '0')`,
      calls7d: sql<string>`COALESCE(SUM(${settlementLedger.callsSettled}) FILTER (WHERE ${settlementLedger.blockTime} >= NOW() - INTERVAL '7 days'), '0')`,
      tx24h: sql<number>`COUNT(DISTINCT ${settlementLedger.signature}) FILTER (WHERE ${settlementLedger.blockTime} >= NOW() - INTERVAL '24 hours')::int`,
      tx7d: sql<number>`COUNT(DISTINCT ${settlementLedger.signature}) FILTER (WHERE ${settlementLedger.blockTime} >= NOW() - INTERVAL '7 days')::int`,
    })
      .from(settlementLedger)
      .where(sql`${settlementLedger.blockTime} >= NOW() - INTERVAL '7 days'`)
      .groupBy(settlementLedger.agentPda),
    db.select({
      agentPda: settlementLedger.agentPda,
      day: sql<string>`DATE_TRUNC('day', ${settlementLedger.blockTime}) AT TIME ZONE 'UTC'`,
      totalLamports: sql<string>`COALESCE(SUM(${settlementLedger.amountLamports}), '0')`,
      totalCalls: sql<string>`COALESCE(SUM(${settlementLedger.callsSettled}), '0')`,
      txCount: sql<number>`COUNT(DISTINCT ${settlementLedger.signature})::int`,
    })
      .from(settlementLedger)
      .where(sql`${settlementLedger.blockTime} >= NOW() - INTERVAL '${sql.raw(String(lookbackDays))} days'`)
      .groupBy(settlementLedger.agentPda, sql`DATE_TRUNC('day', ${settlementLedger.blockTime})`)
      .orderBy(settlementLedger.agentPda, sql`DATE_TRUNC('day', ${settlementLedger.blockTime}) ASC`),
    db.select({
      agentPda: escrows.agentPda,
      day: sql<string>`DATE_TRUNC('day', COALESCE(${escrows.lastSettledAt}, ${escrows.createdAt}, ${escrows.indexedAt})) AT TIME ZONE 'UTC'`,
      totalLamports: sql<string>`COALESCE(SUM(${escrows.totalSettled}), '0')`,
      totalCalls: sql<string>`COALESCE(SUM(${escrows.totalCallsSettled}), '0')`,
      txCount: sql<number>`COUNT(*)::int`,
    })
      .from(escrows)
      .where(and(
        sql`${escrows.totalSettled}::numeric > 0`,
        sql`COALESCE(${escrows.lastSettledAt}, ${escrows.createdAt}, ${escrows.indexedAt}) >= NOW() - INTERVAL '${sql.raw(String(lookbackDays))} days'`,
      ))
      .groupBy(escrows.agentPda, sql`DATE_TRUNC('day', COALESCE(${escrows.lastSettledAt}, ${escrows.createdAt}, ${escrows.indexedAt}))`)
      .orderBy(escrows.agentPda, sql`DATE_TRUNC('day', COALESCE(${escrows.lastSettledAt}, ${escrows.createdAt}, ${escrows.indexedAt})) ASC`),
    getAgentRevenueRanking(500),
  ]);
  const summaryRows = summaryRes.status === 'fulfilled' ? summaryRes.value : [];
  const dailyRows = dailyRes.status === 'fulfilled' ? dailyRes.value : [];
  const escrowDailyRows = escrowDailyRes.status === 'fulfilled' ? escrowDailyRes.value : [];
  const revenueRanking = rankingRes.status === 'fulfilled' ? rankingRes.value : [];

  const map = new Map<string, AgentRevenueSnapshot>();
  for (const stats of revenueRanking) {
    const normalized = asPublicKeyText(stats.agentPda);
    if (!normalized) continue;
    map.set(normalized, {
      agentPda: normalized,
      volume24hLamports: '0',
      volume7dLamports: stats.totalSettled,
      totalSettledLamports: stats.totalSettled,
      totalDepositedLamports: '0',
      calls24h: '0',
      calls7d: stats.totalCalls,
      totalCalls: stats.totalCalls,
      tx24h: 0,
      tx7d: 0,
      escrowCount: stats.escrowCount,
      activeEscrows: 0,
      daily: [],
    });
  }

  for (const row of summaryRows) {
    const agentPda = asPublicKeyText(row.agentPda);
    if (!agentPda) continue;
    const current = map.get(agentPda);
    map.set(agentPda, {
      agentPda,
      volume24hLamports: row.volume24hLamports ?? '0',
      volume7dLamports: row.volume7dLamports ?? '0',
      totalSettledLamports: current?.totalSettledLamports ?? row.volume7dLamports ?? '0',
      totalDepositedLamports: current?.totalDepositedLamports ?? '0',
      calls24h: row.calls24h ?? '0',
      calls7d: row.calls7d ?? '0',
      totalCalls: current?.totalCalls ?? row.calls7d ?? '0',
      tx24h: Number(row.tx24h ?? 0),
      tx7d: Number(row.tx7d ?? 0),
      escrowCount: current?.escrowCount ?? 0,
      activeEscrows: current?.activeEscrows ?? 0,
      daily: current?.daily ?? [],
    });
  }

  for (const row of dailyRows) {
    const agentPda = asPublicKeyText(row.agentPda);
    if (!agentPda) continue;
    const current = map.get(agentPda) ?? {
      agentPda,
      volume24hLamports: '0',
      volume7dLamports: '0',
      totalSettledLamports: '0',
      totalDepositedLamports: '0',
      calls24h: '0',
      calls7d: '0',
      totalCalls: '0',
      tx24h: 0,
      tx7d: 0,
      escrowCount: 0,
      activeEscrows: 0,
      daily: [],
    };
    current.daily.push({
      day: String(row.day),
      totalLamports: row.totalLamports ?? '0',
      totalCalls: row.totalCalls ?? '0',
      txCount: Number(row.txCount ?? 0),
    });
    map.set(agentPda, current);
  }

  const agentsWithLedgerDaily = new Set(dailyRows.map((row) => asPublicKeyText(row.agentPda)).filter(Boolean));
  for (const row of escrowDailyRows) {
    const agentPda = asPublicKeyText(row.agentPda);
    if (!agentPda || agentsWithLedgerDaily.has(agentPda)) continue;
    const current = map.get(agentPda) ?? {
      agentPda,
      volume24hLamports: '0',
      volume7dLamports: '0',
      totalSettledLamports: '0',
      totalDepositedLamports: '0',
      calls24h: '0',
      calls7d: '0',
      totalCalls: '0',
      tx24h: 0,
      tx7d: 0,
      escrowCount: 0,
      activeEscrows: 0,
      daily: [],
    };
    current.daily.push({
      day: String(row.day),
      totalLamports: row.totalLamports ?? '0',
      totalCalls: row.totalCalls ?? '0',
      txCount: Number(row.txCount ?? 0),
    });
    map.set(agentPda, current);
  }

  return map;
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

export async function getLowBalanceEscrows(limit = 50) {
  return db.select()
    .from(escrows)
    .where(
      sql`${escrows.balance}::numeric > 0
        AND ${escrows.pricePerCall}::numeric > 0
        AND ${escrows.balance}::numeric / ${escrows.pricePerCall}::numeric < 3`,
    )
    .limit(limit);
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

/* ── Account Snapshot Activity ────────────────── */

export type AgentActivityPoint = {
  agentPda: string;
  capturedAt: Date;
  totalCallsServed: string;
  avgLatencyMs: number;
  uptimePercent: number;
};

export type ToolActivityPoint = {
  toolPda: string;
  capturedAt: Date;
  totalInvocations: string;
};

export type NetworkActivityPoint = {
  capturedAt: Date;
  agents: number;
  activeAgents: number;
  tools: number;
  totalCallsServed: string;
  totalInvocations: string;
  transactions: number;
  feeLamports: string;
};

export async function selectAgentActivity(agentPdas: readonly string[], limit = 200): Promise<AgentActivityPoint[]> {
  const normalized = agentPdas.map((item) => asPublicKeyText(item)).filter((item): item is string => Boolean(item));
  if (normalized.length === 0) return [];
  const rows = await db.select({
    agentPda: agentSnapshots.agentPda,
    capturedAt: agentSnapshots.capturedAt,
    totalCallsServed: sql<string>`COALESCE(NULLIF(${agentSnapshots.payload}->>'totalCallsServed', ''), '0')`,
    avgLatencyMs: sql<number>`COALESCE(NULLIF(${agentSnapshots.payload}->>'avgLatencyMs', '')::numeric, 0)::float`,
    uptimePercent: sql<number>`COALESCE(NULLIF(${agentSnapshots.payload}->>'uptimePercent', '')::numeric, 0)::float`,
  })
    .from(agentSnapshots)
    .where(inArray(agentSnapshots.agentPda, normalized))
    .orderBy(desc(agentSnapshots.capturedAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, capturedAt: dateValue(row.capturedAt) }));
}

export async function selectToolActivity(toolPdas: readonly string[], limit = 200): Promise<ToolActivityPoint[]> {
  const normalized = toolPdas.map((item) => asPublicKeyText(item)).filter((item): item is string => Boolean(item));
  if (normalized.length === 0) return [];
  const rows = await db.select({
    toolPda: toolSnapshots.toolPda,
    capturedAt: toolSnapshots.capturedAt,
    totalInvocations: sql<string>`COALESCE(NULLIF(${toolSnapshots.payload}->>'totalInvocations', ''), '0')`,
  })
    .from(toolSnapshots)
    .where(inArray(toolSnapshots.toolPda, normalized))
    .orderBy(desc(toolSnapshots.capturedAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, capturedAt: dateValue(row.capturedAt) }));
}

export async function selectNetworkActivity(limit = 96): Promise<NetworkActivityPoint[]> {
  const [snapshotRows, toolRows, txRows] = await Promise.all([
    db.select({
      capturedAt: sql<Date>`date_trunc('minute', ${agentSnapshots.capturedAt})`,
      agents: sql<number>`COUNT(*)::int`,
      activeAgents: sql<number>`COUNT(*) FILTER (WHERE (${agentSnapshots.payload}->>'isActive')::boolean = true)::int`,
      totalCallsServed: sql<string>`COALESCE(SUM(NULLIF(${agentSnapshots.payload}->>'totalCallsServed', '')::numeric), 0)::text`,
    })
      .from(agentSnapshots)
      .groupBy(sql`date_trunc('minute', ${agentSnapshots.capturedAt})`)
      .orderBy(desc(sql`date_trunc('minute', ${agentSnapshots.capturedAt})`))
      .limit(limit),
    db.select({
      capturedAt: sql<Date>`date_trunc('minute', ${toolSnapshots.capturedAt})`,
      tools: sql<number>`COUNT(*)::int`,
      totalInvocations: sql<string>`COALESCE(SUM(NULLIF(${toolSnapshots.payload}->>'totalInvocations', '')::numeric), 0)::text`,
    })
      .from(toolSnapshots)
      .groupBy(sql`date_trunc('minute', ${toolSnapshots.capturedAt})`)
      .orderBy(desc(sql`date_trunc('minute', ${toolSnapshots.capturedAt})`))
      .limit(limit),
    db.select({
      capturedAt: sql<Date>`date_trunc('minute', COALESCE(${transactions.blockTime}, ${transactions.indexedAt}))`,
      transactions: sql<number>`COUNT(*)::int`,
      feeLamports: sql<string>`COALESCE(SUM(${transactions.fee}), 0)::text`,
    })
      .from(transactions)
      .groupBy(sql`date_trunc('minute', COALESCE(${transactions.blockTime}, ${transactions.indexedAt}))`)
      .orderBy(desc(sql`date_trunc('minute', COALESCE(${transactions.blockTime}, ${transactions.indexedAt}))`))
      .limit(limit),
  ]);

  const byTime = new Map<string, NetworkActivityPoint>();
  for (const row of snapshotRows) {
    const capturedAt = dateValue(row.capturedAt);
    byTime.set(capturedAt.toISOString(), {
      capturedAt,
      agents: Number(row.agents ?? 0),
      activeAgents: Number(row.activeAgents ?? 0),
      tools: 0,
      totalCallsServed: row.totalCallsServed ?? '0',
      totalInvocations: '0',
      transactions: 0,
      feeLamports: '0',
    });
  }
  for (const row of toolRows) {
    const capturedAt = dateValue(row.capturedAt);
    const key = capturedAt.toISOString();
    const current = byTime.get(key) ?? emptyNetworkActivity(capturedAt);
    byTime.set(key, {
      ...current,
      tools: Number(row.tools ?? 0),
      totalInvocations: row.totalInvocations ?? '0',
    });
  }
  for (const row of txRows) {
    const capturedAt = dateValue(row.capturedAt);
    const key = capturedAt.toISOString();
    const current = byTime.get(key) ?? emptyNetworkActivity(capturedAt);
    byTime.set(key, {
      ...current,
      transactions: Number(row.transactions ?? 0),
      feeLamports: row.feeLamports ?? '0',
    });
  }

  return [...byTime.values()]
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
    .slice(-limit);
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

export async function selectToolStatsByAgent() {
  const schemaRows = await db
    .select({
      agentPda: toolSchemas.agentPda,
      distinctTools: sql<number>`COUNT(DISTINCT ${toolSchemas.toolPda})::int`,
      schemaCount: sql<number>`COUNT(*)::int`,
    })
    .from(toolSchemas)
    .groupBy(toolSchemas.agentPda);

  const eventRows = await db
    .select({
      agentPda: toolEvents.agentPda,
      distinctTools: sql<number>`COUNT(DISTINCT ${toolEvents.toolPda})::int`,
      eventCount: sql<number>`COUNT(*)::int`,
    })
    .from(toolEvents)
    .groupBy(toolEvents.agentPda);

  const byAgent = new Map<string, {
    agentPda: string;
    distinctTools: number;
    schemaCount: number;
    eventCount: number;
  }>();

  for (const row of schemaRows) {
    const agentPda = asPublicKeyText(row.agentPda);
    if (!agentPda) continue;
    byAgent.set(agentPda, {
      agentPda,
      distinctTools: Number(row.distinctTools ?? 0),
      schemaCount: Number(row.schemaCount ?? 0),
      eventCount: 0,
    });
  }

  for (const row of eventRows) {
    const agentPda = asPublicKeyText(row.agentPda);
    if (!agentPda) continue;
    const current = byAgent.get(agentPda) ?? {
      agentPda,
      distinctTools: 0,
      schemaCount: 0,
      eventCount: 0,
    };
    current.distinctTools = Math.max(current.distinctTools, Number(row.distinctTools ?? 0));
    current.eventCount = Number(row.eventCount ?? 0);
    byAgent.set(agentPda, current);
  }

  return Array.from(byAgent.values());
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

export async function selectAgentMetaplexBatch(wallets: string[]) {
  if (wallets.length === 0) return [] as Array<typeof agentMetaplex.$inferSelect>;
  return db
    .select()
    .from(agentMetaplex)
    .where(inArray(agentMetaplex.wallet, wallets));
}

export async function selectAllAgentMetaplex() {
  return db.select().from(agentMetaplex);
}

export async function upsertAgentMetaplex(data: typeof agentMetaplex.$inferInsert) {
  const now = new Date();
  const hasIncomingSignal = Boolean(
    data.linked ||
    data.asset ||
    (data.pluginCount ?? 0) > 0 ||
    (data.registryCount ?? 0) > 0,
  );
  const keepExistingSignal = sql<boolean>`
    ${agentMetaplex.linked}
    OR ${agentMetaplex.asset} IS NOT NULL
    OR ${agentMetaplex.pluginCount} > 0
    OR ${agentMetaplex.registryCount} > 0
  `;
  return db
    .insert(agentMetaplex)
    .values({ ...data, refreshedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: agentMetaplex.wallet,
      set: {
        sapAgentPda: hasIncomingSignal
          ? (data.sapAgentPda ?? null)
          : sql`CASE WHEN ${keepExistingSignal} THEN ${agentMetaplex.sapAgentPda} ELSE ${data.sapAgentPda ?? null} END`,
        asset: hasIncomingSignal
          ? (data.asset ?? null)
          : sql`CASE WHEN ${keepExistingSignal} THEN ${agentMetaplex.asset} ELSE NULL END`,
        linked: hasIncomingSignal
          ? (data.linked ?? false)
          : sql`CASE WHEN ${keepExistingSignal} THEN ${agentMetaplex.linked} ELSE FALSE END`,
        pluginCount: hasIncomingSignal
          ? (data.pluginCount ?? 0)
          : sql`CASE WHEN ${keepExistingSignal} THEN ${agentMetaplex.pluginCount} ELSE 0 END`,
        registryCount: hasIncomingSignal
          ? (data.registryCount ?? 0)
          : sql`CASE WHEN ${keepExistingSignal} THEN ${agentMetaplex.registryCount} ELSE 0 END`,
        agentIdentityUri: hasIncomingSignal
          ? (data.agentIdentityUri ?? null)
          : sql`CASE WHEN ${keepExistingSignal} THEN ${agentMetaplex.agentIdentityUri} ELSE NULL END`,
        registration: hasIncomingSignal
          ? (data.registration ?? null)
          : sql`CASE WHEN ${keepExistingSignal} THEN ${agentMetaplex.registration} ELSE NULL END`,
        registryAgents: hasIncomingSignal
          ? (data.registryAgents ?? [])
          : sql`CASE WHEN ${keepExistingSignal} THEN ${agentMetaplex.registryAgents} ELSE '[]'::jsonb END`,
        source: data.source ?? 'unknown',
        error: data.error ?? null,
        refreshedAt: now,
        updatedAt: now,
      },
    });
}

/* ── Truth Layer: Entity Aliases + Directory Snapshots ─── */

export type EntityAliasInsert = typeof entityAliases.$inferInsert;
export type AgentDirectorySnapshotInsert = typeof agentDirectorySnapshots.$inferInsert;

export async function upsertEntityAliases(rows: EntityAliasInsert[]) {
  if (rows.length === 0) return;
  const now = new Date();
  await db
    .insert(entityAliases)
    .values(rows.map((row) => ({
      ...row,
      firstSeenAt: row.firstSeenAt ?? now,
      lastSeenAt: now,
    })))
    .onConflictDoUpdate({
      target: entityAliases.alias,
      set: {
        entityType: sql`excluded.entity_type`,
        canonical: sql`excluded.canonical`,
        relation: sql`excluded.relation`,
        source: sql`excluded.source`,
        confidence: sql`GREATEST(${entityAliases.confidence}, excluded.confidence)`,
        metadata: sql`${entityAliases.metadata} || excluded.metadata`,
        lastSeenAt: now,
      },
      setWhere: sql`
        ${entityAliases.canonical} IS DISTINCT FROM excluded.canonical
        OR ${entityAliases.relation} IS DISTINCT FROM excluded.relation
        OR ${entityAliases.entityType} IS DISTINCT FROM excluded.entity_type
        OR ${entityAliases.metadata} IS DISTINCT FROM (${entityAliases.metadata} || excluded.metadata)
      `,
    });
}

export async function upsertAgentDirectorySnapshots(rows: AgentDirectorySnapshotInsert[]) {
  if (rows.length === 0) return;
  const now = new Date();
  await db
    .insert(agentDirectorySnapshots)
    .values(rows.map((row) => ({
      ...row,
      verifiedAt: row.verifiedAt ?? now,
      updatedAt: now,
    })))
    .onConflictDoUpdate({
      target: agentDirectorySnapshots.agentPda,
      set: {
        wallet: sql`excluded.wallet`,
        name: sql`excluded.name`,
        isActive: sql`excluded.is_active`,
        isMerchant: sql`excluded.is_merchant`,
        hasMetaplex: sql`excluded.has_metaplex`,
        toolCount: sql`excluded.tool_count`,
        volume24hLamports: sql`excluded.volume_24h_lamports`,
        volume7dLamports: sql`excluded.volume_7d_lamports`,
        totalSettledLamports: sql`excluded.total_settled_lamports`,
        calls7d: sql`excluded.calls_7d`,
        totalCalls: sql`excluded.total_calls`,
        healthScore: sql`excluded.health_score`,
        activityScore: sql`excluded.activity_score`,
        payload: sql`excluded.payload`,
        sources: sql`excluded.sources`,
        verifiedAt: sql`excluded.verified_at`,
        updatedAt: now,
      },
      setWhere: sql`
        ${agentDirectorySnapshots.payload} IS DISTINCT FROM excluded.payload
        OR ${agentDirectorySnapshots.activityScore} IS DISTINCT FROM excluded.activity_score
        OR ${agentDirectorySnapshots.sources} IS DISTINCT FROM excluded.sources
      `,
    });
}

export async function selectAgentDirectorySnapshots(limit = 200) {
  return db
    .select()
    .from(agentDirectorySnapshots)
    .orderBy(
      sql`${agentDirectorySnapshots.activityScore} DESC`,
      desc(agentDirectorySnapshots.verifiedAt),
    )
    .limit(limit);
}

export async function insertDataHealthCheck(data: typeof dataHealthChecks.$inferInsert) {
  return db.insert(dataHealthChecks).values(data).returning({ id: dataHealthChecks.id });
}

/* ── Agent Logos ─────────────────────────────── */

export async function selectAgentLogo(wallet: string) {
  const rows = await db
    .select()
    .from(agentLogos)
    .where(eq(agentLogos.wallet, wallet))
    .limit(1);
  return rows[0] ?? null;
}

export async function selectAgentLogosBatch(wallets: string[]) {
  if (wallets.length === 0) return [] as Array<typeof agentLogos.$inferSelect>;
  return db.select().from(agentLogos).where(inArray(agentLogos.wallet, wallets));
}

export async function upsertAgentLogo(data: typeof agentLogos.$inferInsert) {
  const now = new Date();
  return db
    .insert(agentLogos)
    .values({ ...data, refreshedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: agentLogos.wallet,
      set: {
        wellKnownLogo: data.wellKnownLogo ?? null,
        mplImage: data.mplImage ?? null,
        mplAsset: data.mplAsset ?? null,
        refreshedAt: now,
        updatedAt: now,
      },
    });
}

/* ── Agent enrichment cache ───────────────────── */

export async function selectAgentEnrichment(wallet: string) {
  const rows = await db
    .select()
    .from(agentEnrichmentCache)
    .where(eq(agentEnrichmentCache.wallet, wallet))
    .limit(1);
  return rows[0] ?? null;
}

export async function selectAgentEnrichmentBatch(wallets: string[]) {
  if (wallets.length === 0) return [] as Array<typeof agentEnrichmentCache.$inferSelect>;
  return db
    .select()
    .from(agentEnrichmentCache)
    .where(inArray(agentEnrichmentCache.wallet, wallets));
}

export async function upsertAgentEnrichment(
  data: typeof agentEnrichmentCache.$inferInsert,
) {
  const now = new Date();
  return db
    .insert(agentEnrichmentCache)
    .values({ ...data, refreshedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: agentEnrichmentCache.wallet,
      set: {
        data: data.data,
        refreshedAt: now,
        updatedAt: now,
      },
    });
}

function dateValue(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function emptyNetworkActivity(capturedAt: Date): NetworkActivityPoint {
  return {
    capturedAt,
    agents: 0,
    activeAgents: 0,
    tools: 0,
    totalCallsServed: '0',
    totalInvocations: '0',
    transactions: 0,
    feeLamports: '0',
  };
}
