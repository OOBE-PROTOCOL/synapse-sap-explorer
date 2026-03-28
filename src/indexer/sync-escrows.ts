// src/indexer/sync-escrows.ts — Fetch all escrows → upsert DB
import { db } from '~/db';
import { escrows } from '~/db/schema';
import { findAllEscrows } from '~/lib/sap/discovery';
import { log, logErr, withRetry, pk, bn, num, bnToDate, conflictUpdateSet } from './utils';
import { setCursor } from './cursor';

export async function syncEscrows(): Promise<number> {
  log('escrows', 'Fetching all escrows from RPC...');

  const raw = await withRetry(() => findAllEscrows(), 'escrows:fetch');
  log('escrows', `Fetched ${raw.length} escrows`);

  if (raw.length === 0) {
    await setCursor('escrows', {});
    return 0;
  }

  let upserted = 0;

  for (const e of raw) {
    const a = e.account;
    const row = {
      pda: pk(e.pda),
      agentPda: pk(a.agent),
      depositor: pk(a.depositor),
      agentWallet: pk(a.agentWallet),
      balance: bn(a.balance),
      totalDeposited: bn(a.totalDeposited),
      totalSettled: bn(a.totalSettled),
      totalCallsSettled: bn(a.totalCallsSettled),
      pricePerCall: bn(a.pricePerCall),
      maxCalls: bn(a.maxCalls),
      tokenMint: a.tokenMint ? pk(a.tokenMint) : null,
      tokenDecimals: num(a.tokenDecimals ?? 9),
      volumeCurve: (a.volumeCurve ?? []).map((bp: any) => ({
        afterCalls: num(bp.afterCalls),
        pricePerCall: bn(bp.pricePerCall),
      })),
      status: 'active' as const,
      createdAt: bnToDate(a.createdAt) ?? new Date(),
      closedAt: null,
      lastSettledAt: bnToDate(a.lastSettledAt),
      expiresAt: bnToDate(a.expiresAt),
      indexedAt: new Date(),
    };

    try {
      await db.insert(escrows).values(row).onConflictDoUpdate({
        target: escrows.pda,
        set: conflictUpdateSet(escrows, ['pda']),
      });
      upserted++;
    } catch (e2: any) {
      logErr('escrows', `Failed pda=${row.pda.slice(0, 8)}: ${e2.message}`);
    }
  }

  await setCursor('escrows', {});
  log('escrows', `Done: ${upserted} escrows upserted`);
  return upserted;
}

