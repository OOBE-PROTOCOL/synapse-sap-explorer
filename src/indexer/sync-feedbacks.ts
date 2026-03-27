// src/indexer/sync-feedbacks.ts — Fetch all feedbacks → upsert DB
import { db } from '~/db';
import { feedbacks } from '~/db/schema';
import { findAllFeedbacks } from '~/lib/sap/discovery';
import { log, logErr, withRetry, pk, num, bnToDate, hashToHex, conflictUpdateSet } from './utils';
import { setCursor } from './cursor';

export async function syncFeedbacks(): Promise<number> {
  log('feedbacks', 'Fetching all feedbacks from RPC...');

  const raw = await withRetry(() => findAllFeedbacks(), 'feedbacks:fetch');
  log('feedbacks', `Fetched ${raw.length} feedbacks`);

  if (raw.length === 0) {
    await setCursor('feedbacks', {});
    return 0;
  }

  let upserted = 0;

  for (const f of raw) {
    const d = f.account;
    const row = {
      pda: pk(f.pda),
      agentPda: pk(d.agent),
      reviewer: pk(d.reviewer),
      score: num(d.score),
      tag: d.tag ?? '',
      isRevoked: Boolean(d.isRevoked),
      commentHash: d.commentHash ? (typeof d.commentHash === 'string' ? d.commentHash : hashToHex(d.commentHash)) : null,
      createdAt: bnToDate(d.createdAt) ?? new Date(),
      updatedAt: bnToDate(d.updatedAt) ?? new Date(),
      indexedAt: new Date(),
    };

    try {
      await db.insert(feedbacks).values(row).onConflictDoUpdate({
        target: feedbacks.pda,
        set: conflictUpdateSet(feedbacks, ['pda']),
      });
      upserted++;
    } catch (e: any) {
      logErr('feedbacks', `Failed pda=${row.pda.slice(0, 8)}: ${e.message}`);
    }
  }

  await setCursor('feedbacks', {});
  log('feedbacks', `Done: ${upserted} feedbacks upserted`);
  return upserted;
}

