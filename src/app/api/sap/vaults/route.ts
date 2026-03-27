export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/vaults — Fetch all memory vault accounts
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllVaults } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllVaults, upsertVaults } from '~/lib/db/queries';
import { dbVaultToApi, apiVaultToDb } from '~/lib/db/mappers';

async function rpcFetchVaults() {
  const vaults = await findAllVaults();
  const serialized = vaults.map((v) => {
    const d = v.account;
    return {
      pda: v.pda.toBase58(),
      agent: d.agent?.toBase58?.() ?? String(d.agent ?? ''),
      wallet: d.wallet?.toBase58?.() ?? String(d.wallet ?? ''),
      totalSessions: d.totalSessions ?? 0,
      totalInscriptions: d.totalInscriptions?.toString?.() ?? '0',
      totalBytesInscribed: d.totalBytesInscribed?.toString?.() ?? '0',
      createdAt: d.createdAt?.toString?.() ?? '0',
      nonceVersion: d.nonceVersion ?? 0,
      protocolVersion: d.protocolVersion ?? 0,
    };
  });
  upsertVaults(serialized.map(apiVaultToDb)).catch((e) =>
    console.warn('[vaults] DB write failed:', (e as Error).message),
  );
  return { vaults: serialized, total: serialized.length };
}

export const GET = withSynapseError(async () => {
  const cached = peek<any>('vaults');
  if (cached && cached.vaults?.length > 0) {
    swr('vaults', rpcFetchVaults, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  try {
    const dbRows = await selectAllVaults();
    if (dbRows.length > 0) {
      const result = { vaults: dbRows.map(dbVaultToApi), total: dbRows.length };
      swr('vaults', rpcFetchVaults, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[vaults] DB read failed:', (e as Error).message);
  }

  const data = await rpcFetchVaults();
  swr('vaults', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
