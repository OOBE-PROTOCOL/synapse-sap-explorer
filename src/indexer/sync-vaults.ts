// src/indexer/sync-vaults.ts — Fetch all vaults → upsert DB
import { db } from '~/db';
import { vaults } from '~/db/schema';
import { findAllVaults } from '~/lib/sap/discovery';
import { log, logErr, withRetry, pk, bn, num, bnToDate, conflictUpdateSet } from './utils';
import { setCursor } from './cursor';

export async function syncVaults(): Promise<number> {
  log('vaults', 'Fetching all vaults from RPC...');

  const raw = await withRetry(() => findAllVaults(), 'vaults:fetch');
  log('vaults', `Fetched ${raw.length} vaults`);

  if (raw.length === 0) {
    await setCursor('vaults', {});
    return 0;
  }

  let upserted = 0;

  for (const v of raw) {
    const d = v.account;
    const row = {
      pda: pk(v.pda),
      agentPda: pk(d.agent),
      wallet: pk(d.wallet),
      totalSessions: num(d.totalSessions),
      totalInscriptions: bn(d.totalInscriptions),
      totalBytesInscribed: bn(d.totalBytesInscribed),
      nonceVersion: num(d.nonceVersion),
      protocolVersion: num(d.protocolVersion),
      createdAt: bnToDate(d.createdAt) ?? new Date(),
      indexedAt: new Date(),
    };

    try {
      await db.insert(vaults).values(row).onConflictDoUpdate({
        target: vaults.pda,
        set: conflictUpdateSet(vaults, ['pda']),
      });
      upserted++;
    } catch (e: any) {
      logErr('vaults', `Failed pda=${row.pda.slice(0, 8)}: ${e.message}`);
    }
  }

  await setCursor('vaults', {});
  log('vaults', `Done: ${upserted} vaults upserted`);
  return upserted;
}

