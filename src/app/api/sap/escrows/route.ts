export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/escrows — Fetch all escrow accounts
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * Now preserves closed escrows in DB and tracks status.
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllEscrows } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllEscrows, upsertEscrows, markEscrowClosed } from '~/lib/db/queries';
import { dbEscrowToApi, apiEscrowToDb } from '~/lib/db/mappers';

async function rpcFetchEscrows() {
  const escrows = await findAllEscrows();
  const serialized = escrows.map((e) => {
    const a = e.account;
    return {
      pda: e.pda.toBase58(),
      agent: a.agent?.toBase58?.() ?? String(a.agent ?? ''),
      depositor: a.depositor?.toBase58?.() ?? String(a.depositor ?? ''),
      agentWallet: a.agentWallet?.toBase58?.() ?? String(a.agentWallet ?? ''),
      balance: a.balance?.toString?.() ?? '0',
      totalDeposited: a.totalDeposited?.toString?.() ?? '0',
      totalSettled: a.totalSettled?.toString?.() ?? '0',
      totalCallsSettled: a.totalCallsSettled?.toString?.() ?? '0',
      pricePerCall: a.pricePerCall?.toString?.() ?? '0',
      maxCalls: a.maxCalls?.toString?.() ?? '0',
      createdAt: a.createdAt?.toString?.() ?? '0',
      lastSettledAt: a.lastSettledAt?.toString?.() ?? '0',
      expiresAt: a.expiresAt?.toString?.() ?? '0',
      tokenMint: a.tokenMint?.toBase58?.() ?? null,
      tokenDecimals: a.tokenDecimals ?? 9,
      volumeCurve: (a.volumeCurve ?? []).map((bp: any) => ({
        afterCalls: bp.afterCalls ?? 0,
        pricePerCall: bp.pricePerCall?.toString?.() ?? '0',
      })),
      status: 'active', // On-chain escrows are always active
    };
  });

  // Detect closed escrows: PDAs in DB but NOT on-chain anymore
  try {
    const dbRows = await selectAllEscrows();
    const onChainPdas = new Set(serialized.map((e) => e.pda));
    const closedPdas = dbRows
      .filter((row) => row.status !== 'closed' && !onChainPdas.has(row.pda))
      .map((row) => row.pda);

    // Mark missing PDAs as closed
    for (const pda of closedPdas) {
      markEscrowClosed(pda).catch((err) =>
        console.warn(`[escrows] Failed to mark ${pda.slice(0, 8)} as closed:`, err.message),
      );
    }
  } catch (e) {
    console.warn('[escrows] Closed detection failed:', (e as Error).message);
  }

  // Upsert active escrows
  upsertEscrows(serialized.map(apiEscrowToDb)).catch((e) =>
    console.warn('[escrows] DB write failed:', (e as Error).message),
  );

  // Return ALL escrows (active + closed from DB)
  try {
    const allDbRows = await selectAllEscrows();
    const mergedMap = new Map<string, any>();
    // DB rows first (includes closed)
    for (const row of allDbRows) {
      mergedMap.set(row.pda, dbEscrowToApi(row));
    }
    // On-chain data overrides for active escrows
    for (const e of serialized) {
      mergedMap.set(e.pda, e);
    }
    const allEscrows = Array.from(mergedMap.values());
    return { escrows: allEscrows, total: allEscrows.length };
  } catch {
    return { escrows: serialized, total: serialized.length };
  }
}

export const GET = withSynapseError(async () => {
  const cached = peek<any>('escrows');
  if (cached && cached.escrows?.length > 0) {
    swr('escrows', rpcFetchEscrows, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  try {
    const dbRows = await selectAllEscrows();
    if (dbRows.length > 0) {
      const result = { escrows: dbRows.map(dbEscrowToApi), total: dbRows.length };
      swr('escrows', rpcFetchEscrows, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[escrows] DB read failed:', (e as Error).message, '| cause:', (e as any).cause?.message ?? 'none');
  }

  const data = await rpcFetchEscrows();
  swr('escrows', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
