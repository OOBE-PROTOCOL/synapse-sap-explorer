export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/analytics — Protocol analytics
 *
 * Returns:
 *   - Tool category summary
 *   - Top agents by revenue (escrow settled)
 *   - Escrow status breakdown
 *   - Protocol net volume snapshot
 *
 * SWR cached (60s fresh, 5min stale window)
 * ────────────────────────────────────────────── */

import { NextRequest } from 'next/server';
import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import { getToolCategorySummary } from '~/lib/sap/discovery';
import {
  getEscrowAggregates,
  getAgentRevenueRanking,
  selectAllEscrows,
  selectAllAgents,
} from '~/lib/db/queries';
import { swr } from '~/lib/cache';
import type { AgentRow, EscrowRow } from '~/types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const GET = withSynapseError(async (_req: NextRequest) => {
  const data = await swr('analytics', async () => {
    const [summary, agg, ranking, allEscrows, allAgents] = await Promise.allSettled([
      getToolCategorySummary(),
      getEscrowAggregates(),
      getAgentRevenueRanking(10),
      selectAllEscrows(),
      selectAllAgents(),
    ]);

    const categories = summary.status === 'fulfilled' ? summary.value : [];
    const volume     = agg.status === 'fulfilled' ? agg.value : null;
    const topAgents  = ranking.status === 'fulfilled' ? ranking.value : [];
    const escrows: EscrowRow[]  = allEscrows.status === 'fulfilled' ? allEscrows.value : [];
    const agents: AgentRow[]    = allAgents.status === 'fulfilled' ? allAgents.value : [];

    // Build agent name lookup from DB
    const agentNameMap = new Map<string, string | null>(agents.map((a) => [a.pda, a.name]));

    // Escrow status breakdown
    const escrowBreakdown = { active: 0, depleted: 0, expired: 0, closed: 0, unfunded: 0 };
    for (const e of escrows) {
      const bal = Number(e.balance ?? 0);
      const dep = Number(e.totalDeposited ?? 0);
      const exp = e.expiresAt ? Number(e.expiresAt) * 1000 : 0;
      if (e.status === 'closed') escrowBreakdown.closed++;
      else if (exp > 0 && exp < Date.now()) escrowBreakdown.expired++;
      else if (bal > 0) escrowBreakdown.active++;
      else if (dep > 0) escrowBreakdown.depleted++;
      else escrowBreakdown.unfunded++;
    }

    return {
      categories,
      // Protocol net volume
      volume: {
        totalSettledLamports: volume?.totalVolume     ?? '0',
        totalCallsSettled:    volume?.totalCalls      ?? '0',
        totalDeposited:       volume?.totalDeposited  ?? '0',
        lockedBalance:        volume?.totalBalance    ?? '0',
        activeEscrows:        volume?.activeEscrows   ?? 0,
        totalEscrows:         volume?.totalEscrows    ?? 0,
      },
      // Top agents by revenue (escrow-derived — authoritative)
      topAgentsByRevenue: topAgents.map((r) => ({
        agentPda:     r.agentPda,
        agentName:    agentNameMap.get(r.agentPda) ?? null,
        totalSettled: r.totalSettled,
        totalCalls:   r.totalCalls,
        escrowCount:  r.escrowCount,
        // SOL value
        totalSettledSol: (Number(r.totalSettled) / 1e9).toFixed(6),
      })),
      // Escrow health summary
      escrowBreakdown,
    };
  }, { ttl: 60_000, swr: 300_000 });

  return synapseResponse(data);
});
