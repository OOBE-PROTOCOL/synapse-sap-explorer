export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/metrics — Network overview (GlobalRegistry)
 *
 * SWR cached (60s fresh, 5min stale window)
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { getNetworkOverview, serializeOverview } from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';

async function fetchMetrics() {
  const overview = await getNetworkOverview();
  return serializeOverview(overview);
}

export const GET = withSynapseError(async () => {
  // Instant return if cache warm
  const cached = peek<any>('metrics');
  if (cached) {
    swr('metrics', fetchMetrics, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  // Cold start — must await RPC
  const data = await fetchMetrics();
  swr('metrics', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
