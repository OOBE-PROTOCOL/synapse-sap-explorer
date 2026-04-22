export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/feedbacks — Fetch all feedback accounts
 *
 * Data flow: SWR cache → DB → RPC → write-back
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllFeedbacks, serialize } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import { selectAllFeedbacks, upsertFeedbacks } from '~/lib/db/queries';
import { isDbDown, markDbDown } from '~/db';
import { dbFeedbackToApi, apiFeedbackToDb } from '~/lib/db/mappers';
import type { ApiFeedback } from '~/types';

async function rpcFetchFeedbacks() {
  const feedbacks = await findAllFeedbacks();
  const serialized = feedbacks.map((f) => ({
    pda: f.pda.toBase58(),
    ...serialize(f.account),
  })) as ApiFeedback[];
  upsertFeedbacks(serialized.map(apiFeedbackToDb)).catch((e) =>
    console.warn('[feedbacks] DB write failed:', (e as Error).message),
  );
  return { feedbacks: serialized, total: serialized.length };
}

export const GET = withSynapseError(async () => {
  const cached = peek<{ feedbacks: ApiFeedback[]; total: number }>('feedbacks');
  if (cached && cached.feedbacks?.length > 0) {
    swr('feedbacks', rpcFetchFeedbacks, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  if (!isDbDown()) try {
    const dbRows = await selectAllFeedbacks();
    if (dbRows.length > 0) {
      const result = { feedbacks: dbRows.map(dbFeedbackToApi), total: dbRows.length };
      swr('feedbacks', rpcFetchFeedbacks, { ttl: 60_000, swr: 300_000 }).catch(() => {});
      return synapseResponse(result);
    }
  } catch (e) {
    console.warn('[feedbacks] DB read failed:', (e as Error).message);
    markDbDown();
  }

  const data = await rpcFetchFeedbacks();
  swr('feedbacks', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
