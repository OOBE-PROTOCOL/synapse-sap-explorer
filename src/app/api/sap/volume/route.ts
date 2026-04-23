export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/volume — Protocol Net Volume
 *
 * Implements the "Protocol Net Volume" metric from the SDK Cookbook §6:
 *   Protocol Net Volume = Sum of all PaymentSettledEvent.amount
 *                       + Sum of all BatchSettledEvent.totalAmount
 *
 * Approximated from EscrowAccount.totalSettled (fast, DB-only).
 * This represents total value transferred from consumers → agents.
 *
 * Response:
 *   totalSettledLamports   — all-time SOL paid to agents (lamports)
 *   totalSettledSol        — human-readable SOL
 *   totalCallsSettled      — all-time number of calls settled
 *   totalDeposited         — all-time deposited (lamports)
 *   lockedBalance          — current SOL locked in active escrows
 *   activeEscrows          — escrows with balance > 0
 *   fundedEscrows          — escrows that ever received a deposit
 *   totalEscrows           — all escrow accounts
 *   topAgentsByRevenue     — top 10 agents by lifetime earnings
 *   escrowBreakdown        — status distribution
 *
 * SWR cached (30s fresh, 2min stale)
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import {
  getEscrowAggregates,
  getAgentRevenueRanking,
  selectAllAgents,
} from '~/lib/db/queries';
import { swr } from '~/lib/cache';

export const GET = withSynapseError(async () => {
  const data = await swr('volume', async () => {
    const [agg, ranking, allAgents] = await Promise.allSettled([
      getEscrowAggregates(),
      getAgentRevenueRanking(10),
      selectAllAgents(),
    ]);

    const volume   = agg.status === 'fulfilled' ? agg.value : null;
    const topAgents = ranking.status === 'fulfilled' ? ranking.value : [];
    const agents   = allAgents.status === 'fulfilled' ? allAgents.value : [];

    const agentMap = new Map(agents.map((a) => [a.pda, { name: a.name, isActive: a.isActive }]));

    const totalSettled = Number(volume?.totalVolume ?? '0');

    return {
      // Core protocol volume metrics
      totalSettledLamports: volume?.totalVolume    ?? '0',
      totalSettledSol:      (totalSettled / 1e9).toFixed(9),
      totalCallsSettled:    volume?.totalCalls     ?? '0',
      totalDeposited:       volume?.totalDeposited ?? '0',
      utilizationPercent: volume?.totalDeposited && Number(volume.totalDeposited) > 0
        ? Math.round((totalSettled / Number(volume.totalDeposited)) * 100 * 10) / 10
        : 0,

      // Current state
      lockedBalance:  volume?.totalBalance   ?? '0',
      activeEscrows:  volume?.activeEscrows  ?? 0,
      fundedEscrows:  volume?.fundedEscrows  ?? 0,
      totalEscrows:   volume?.totalEscrows   ?? 0,

      // Top earners (authoritative revenue ranking)
      topAgentsByRevenue: topAgents.map((r) => ({
        agentPda:        r.agentPda,
        agentName:       agentMap.get(r.agentPda)?.name ?? null,
        isActive:        agentMap.get(r.agentPda)?.isActive ?? false,
        totalSettled:    r.totalSettled,
        totalSettledSol: (Number(r.totalSettled) / 1e9).toFixed(6),
        totalCalls:      r.totalCalls,
        escrowCount:     r.escrowCount,
        // Revenue share %
        sharePercent: totalSettled > 0
          ? Math.round((Number(r.totalSettled) / totalSettled) * 100 * 10) / 10
          : 0,
      })),
    };
  }, { ttl: 30_000, swr: 120_000 });

  return synapseResponse(data);
});
