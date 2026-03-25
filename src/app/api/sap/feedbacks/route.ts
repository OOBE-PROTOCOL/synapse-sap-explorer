export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/feedbacks — Fetch all feedback accounts
 *
 * Returns serialized feedback data from program.account.feedbackAccount.all()
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { findAllFeedbacks } from '~/lib/sap/discovery';

export const GET = withSynapseError(async () => {
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

  return synapseResponse({ feedbacks: serialized, total: serialized.length });
});
