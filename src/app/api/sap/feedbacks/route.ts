export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/feedbacks — Fetch all feedback accounts
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllFeedbacks } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllFeedbacks, upsertFeedbacks } from '~/lib/db/queries';
import { dbFeedbackToApi, apiFeedbackToDb } from '~/lib/db/mappers';

async function rpcFetchFeedbacks() {
  const feedbacks = await findAllFeedbacks();
  const serialized = feedbacks.map((f) => {
    const d = f.account;
    return {
      pda: f.pda.toBase58(),
      agent: d.agent?.toBase58?.() ?? String(d.agent ?? ''),
      reviewer: d.reviewer?.toBase58?.() ?? String(d.reviewer ?? ''),
      score: d.score ?? 0,
      tag: d.tag ?? '',
      isRevoked: d.isRevoked ?? false,
      createdAt: d.createdAt?.toString?.() ?? '0',
      updatedAt: d.updatedAt?.toString?.() ?? '0',
      commentHash: d.commentHash
        ? Buffer.from(d.commentHash).toString('hex')
        : null,
    };
  });
  upsertFeedbacks(serialized.map(apiFeedbackToDb)).catch((e) =>
    console.warn('[feedbacks] DB write failed:', (e as Error).message),
  );
  return { feedbacks: serialized, total: serialized.length };
}

export const GET = withSynapseError(async () => {
  const cached = peek<any>('feedbacks');
  if (cached && cached.feedbacks?.length > 0) {
    swr('feedbacks', rpcFetchFeedbacks, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  try {
    const dbRows = await selectAllFeedbacks();
    if (dbRows.length > 0) {
      const result = { feedbacks: dbRows.map(dbFeedbackToApi), total: dbRows.length };
      swr('feedbacks', rpcFetchFeedbacks, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[feedbacks] DB read failed:', (e as Error).message);
  }

  const data = await rpcFetchFeedbacks();
  swr('feedbacks', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
