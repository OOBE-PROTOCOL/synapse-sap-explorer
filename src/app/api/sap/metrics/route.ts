export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/metrics — Network overview (GlobalRegistry) + protocol volume
 *
 * Merges GlobalRegistry data with DB escrow aggregates for a complete
 * protocol health snapshot (agents, tools, volume, calls, escrows).
 *
 * SWR cached (60s fresh, 5min stale window)
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { getNetworkOverview, serializeOverview } from '~/lib/sap/discovery';
import { getEscrowAggregates, getAgentRevenueRanking } from '~/lib/db/queries';
import { swr, peek } from '~/lib/cache';
import type { ApiMetrics } from '~/types';

async function fetchMetrics() {
  // Parallel: GlobalRegistry RPC + escrow DB aggregates
  const [overview, agg, topAgents] = await Promise.allSettled([
    getNetworkOverview(),
    getEscrowAggregates(),
    getAgentRevenueRanking(5),
  ]);

  const base = serializeOverview(overview.status === 'fulfilled' ? overview.value : {} as Parameters<typeof serializeOverview>[0]);
  const volume = agg.status === 'fulfilled' ? agg.value : null;
  const ranking = topAgents.status === 'fulfilled' ? topAgents.value : [];

  return {
    ...base,
    // Protocol net volume (authoritative: sum of escrow.totalSettled)
    totalVolumeLamports:  volume?.totalVolume       ?? '0',
    totalCallsSettled:    volume?.totalCalls         ?? '0',
    totalDeposited:       volume?.totalDeposited     ?? '0',
    totalEscrowBalance:   volume?.totalBalance       ?? '0',
    activeEscrows:        volume?.activeEscrows      ?? 0,
    fundedEscrows:        volume?.fundedEscrows      ?? 0,
    totalEscrows:         volume?.totalEscrows       ?? 0,
    // Top agents by revenue (escrow.totalSettled)
    topAgentsByRevenue: ranking.map((r) => ({
      agentPda:     r.agentPda,
      totalSettled: r.totalSettled,
      totalCalls:   r.totalCalls,
      escrowCount:  r.escrowCount,
    })),
  };
}

export const GET = withSynapseError(async () => {
  const cached = peek<ApiMetrics>('metrics');
  if (cached) {
    swr('metrics', fetchMetrics, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  const data = await fetchMetrics();
  swr('metrics', () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
