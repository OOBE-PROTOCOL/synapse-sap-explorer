export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/analytics — Tool category summary
 *
 * SWR cached (60s fresh, 5min stale window)
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { getToolCategorySummary } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';

export const GET = withSynapseError(async () => {
  const data = await swr('analytics', async () => {
    const summary = await getToolCategorySummary();
    return { categories: summary };
  }, { ttl: 60_000, swr: 300_000 });

  return synapseResponse(data);
});
