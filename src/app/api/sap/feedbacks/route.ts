export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/feedbacks — Fetch all feedback accounts
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllFeedbacks } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';
import { selectAllFeedbacks, upsertFeedbacks } from '~/lib/db/queries';
import { dbFeedbackToApi, apiFeedbackToDb } from '~/lib/db/mappers';

export const GET = withSynapseError(async () => {
  const data = await swr('feedbacks', async () => {
    // 1. Try DB
    try {
      const dbRows = await selectAllFeedbacks();
      if (dbRows.length > 0) {
        const mapped = dbRows.map(dbFeedbackToApi);
        return { feedbacks: mapped, total: mapped.length };
      }
    } catch (e) {
      console.warn('[feedbacks] DB read failed:', (e as Error).message);
    }

    // 2. Fallback to RPC
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

    // 3. Write to DB
    upsertFeedbacks(serialized.map(apiFeedbackToDb)).catch((e) =>
      console.warn('[feedbacks] DB write failed:', (e as Error).message),
    );

    return { feedbacks: serialized, total: serialized.length };
  }, { ttl: 60_000, swr: 300_000 });

  return synapseResponse(data);
});
