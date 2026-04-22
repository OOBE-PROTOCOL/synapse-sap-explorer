// src/indexer/sync-attestations.ts — Fetch all attestations → upsert DB
import { db } from '~/db';
import { attestations } from '~/db/schema';
import { findAllAttestations } from '~/lib/sap/discovery';
import { log, logErr, withRetry, pk, bnToDate, hashToHex, conflictUpdateSet } from './utils';
import { setCursor } from './cursor';

export async function syncAttestations(): Promise<number> {
  log('attestations', 'Fetching all attestations from RPC...');

  const raw = await withRetry(() => findAllAttestations(), 'attestations:fetch');
  log('attestations', `Fetched ${raw.length} attestations`);

  if (raw.length === 0) {
    await setCursor('attestations', {});
    return 0;
  }

  let upserted = 0;

  for (const a of raw) {
    const d = a.account as Record<string, unknown>;
    const row = {
      pda: pk(a.pda),
      agentPda: pk(d.agent),
      attester: pk(d.attester),
      attestationType: (d.attestationType ?? '') as string,
      isActive: Boolean(d.isActive),
      metadataHash: d.metadataHash ? (typeof d.metadataHash === 'string' ? d.metadataHash : hashToHex(d.metadataHash)) : null,
      createdAt: bnToDate(d.createdAt) ?? new Date(),
      expiresAt: bnToDate(d.expiresAt),
      indexedAt: new Date(),
    };

    try {
      await db.insert(attestations).values(row).onConflictDoUpdate({
        target: attestations.pda,
        set: conflictUpdateSet(attestations, ['pda']),
      });
      upserted++;
    } catch (e: unknown) {
      logErr('attestations', `Failed pda=${row.pda.slice(0, 8)}: ${(e as Error).message}`);
    }
  }

  await setCursor('attestations', {});
  log('attestations', `Done: ${upserted} attestations upserted`);
  return upserted;
}

