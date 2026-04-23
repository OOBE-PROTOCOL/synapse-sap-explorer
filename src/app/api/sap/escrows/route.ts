export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/escrows — Fetch all escrow accounts
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * Now preserves closed escrows in DB and tracks status.
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllEscrows, serialize } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllEscrows, upsertEscrows, markEscrowClosed } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbEscrowToApi, apiEscrowToDb } from '~/lib/db/mappers';

async function rpcFetchEscrows() {
  const escrows = await findAllEscrows();
  const serialized = escrows.map((e) => ({
    pda: e.pda.toBase58(),
    ...serialize(e.account),
    status: 'active', // On-chain escrows are always active
  }));

  if (!isDbDown()) {
    // Detect closed escrows: PDAs in DB but NOT on-chain anymore
    try {
      const dbRows = await selectAllEscrows();
      const onChainPdas = new Set(serialized.map((e) => e.pda));
      const closedPdas = dbRows
        .filter((row) => row.status !== 'closed' && !onChainPdas.has(row.pda))
        .map((row) => row.pda);

      // Mark missing PDAs as closed — await so the final selectAllEscrows sees them
      await Promise.all(
        closedPdas.map((pda) =>
          markEscrowClosed(pda).catch((err) =>
            console.warn(`[escrows] Failed to mark ${pda.slice(0, 8)} as closed:`, err.message),
          ),
        ),
      );
    } catch (e) {
      console.warn('[escrows] Closed detection failed:', (e as Error).message);
      markDbDown();
    }

    // Upsert active escrows
    upsertEscrows(serialized.map(apiEscrowToDb)).catch((e) => {
      console.warn('[escrows] DB write failed:', (e as Error).message);
      markDbDown();
    });

    // Return ALL escrows (active + closed from DB)
    try {
      const allDbRows = await selectAllEscrows();
      const mergedMap = new Map<string, ReturnType<typeof dbEscrowToApi> | typeof serialized[number]>();
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
      markDbDown();
      // DB failed: preserve closed escrows from the previous cache to avoid losing them
      const prev = peek<{ escrows: Array<{ pda: string; status?: string }>; total: number }>('escrows');
      if (prev?.escrows) {
        const mergedMap = new Map<string, unknown>();
        for (const e of prev.escrows) {
          if (e.status === 'closed') mergedMap.set(e.pda, e);
        }
        for (const e of serialized) mergedMap.set(e.pda, e);
        const merged = Array.from(mergedMap.values());
        return { escrows: merged, total: merged.length };
      }
    }
  }

  return { escrows: serialized, total: serialized.length };
}

export const GET = withSynapseError(async () => {
  const cached = peek<{ escrows: unknown[]; total: number }>('escrows');
  if (cached && cached.escrows?.length > 0) {
    swr('escrows', rpcFetchEscrows, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  if (!isDbDown()) {
    try {
      const dbRows = await selectAllEscrows();
      if (dbRows.length > 0) {
        const result = { escrows: dbRows.map(dbEscrowToApi), total: dbRows.length };
        swr('escrows', rpcFetchEscrows, { ttl: 60_000, swr: 300_000 }).catch(() => {});
        return synapseResponse(result);
      }
    } catch (e) {
      console.warn('[escrows] DB read failed:', (e as Error).message);
      markDbDown();
    }
  }

  const data = await rpcFetchEscrows();
  swr('escrows', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
