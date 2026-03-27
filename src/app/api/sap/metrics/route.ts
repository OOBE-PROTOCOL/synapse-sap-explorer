export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/metrics — Network overview (GlobalRegistry)
 *
 * SWR cached (60s fresh, 5min stale window)
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { getNetworkOverview, serializeOverview } from '~/lib/sap/discovery';
import { swr } from '~/lib/cache';

export const GET = withSynapseError(async () => {
  const data = await swr('metrics', async () => {
    const overview = await getNetworkOverview();
    return serializeOverview(overview);
  }, { ttl: 60_000, swr: 300_000 });

  return synapseResponse(data);
});
