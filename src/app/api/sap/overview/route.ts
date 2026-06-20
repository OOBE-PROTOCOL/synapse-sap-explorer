export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/overview — Batched homepage data
 *
 * Returns metrics, agents, tools, escrows, attestations, feedbacks,
 * vaults, and escrow events in a single response.
 * Eliminates 8 parallel API calls from the homepage.
 *
 * SWR cached (30s fresh, 5min stale window)
 * ────────────────────────────────────────────── */

import { NextResponse } from 'next/server';
import { swr, peek } from '~/lib/cache';
import { isDbDown, markDbDown } from '~/db';
import type { DiscoveredAgent } from '~/lib/sap/discovery';
import {
  getNetworkOverview,
  serializeOverview,
  serializeDiscoveredAgent,
  serializeDiscoveredTool,
  findAllAgents,
  findAllTools,
  findAllEscrows,
  findAllAttestations,
  findAllFeedbacks,
  findAllVaults,
  serialize,
} from '~/lib/sap/discovery';
import {
  getEscrowAggregates,
  getAgentRevenueRanking,
  getAgentSettlementMap,
  selectEscrowEvents,
} from '~/lib/db/queries';
import { withTimeout } from '~/lib/async-timeout';
import type { SerializedDiscoveredAgent } from '~/types';

const OVERVIEW_DB_TIMEOUT_MS = 1_500;
const OVERVIEW_RPC_TIMEOUT_MS = 5_000;

function serializeEscrow(e: { pda: { toBase58?: () => string }; account: Record<string, unknown> }) {
  return {
    pda: e.pda?.toBase58?.() ?? String(e.pda ?? ''),
    ...serialize(e.account),
    status: 'active',
  };
}

async function fetchOverview() {
  const dbTimed = <T>(factory: () => Promise<T>, label: string): Promise<T> => {
    if (isDbDown()) return Promise.reject(new Error('db circuit breaker open'));
    return withTimeout(factory(), OVERVIEW_DB_TIMEOUT_MS, label).catch((error) => {
      markDbDown();
      throw error;
    });
  };
  const rpcTimed = <T>(factory: () => Promise<T>, label: string): Promise<T> =>
    withTimeout(factory(), OVERVIEW_RPC_TIMEOUT_MS, label);

  const [
    overviewRes,
    aggRes,
    topAgentsRes,
    agentsRes,
    toolsRes,
    escrowsRes,
    attestationsRes,
    feedbacksRes,
    vaultsRes,
    eventsRes,
    settlementMapRes,
  ] = await Promise.allSettled([
    rpcTimed(() => getNetworkOverview(), 'overview network read'),
    dbTimed(() => getEscrowAggregates(), 'overview escrow aggregates db read'),
    dbTimed(() => getAgentRevenueRanking(5), 'overview agent revenue db read'),
    rpcTimed(() => findAllAgents(), 'overview agents rpc read'),
    rpcTimed(() => findAllTools(), 'overview tools rpc read'),
    rpcTimed(() => findAllEscrows(), 'overview escrows rpc read'),
    rpcTimed(() => findAllAttestations(), 'overview attestations rpc read'),
    rpcTimed(() => findAllFeedbacks(), 'overview feedbacks rpc read'),
    rpcTimed(() => findAllVaults(), 'overview vaults rpc read'),
    dbTimed(() => selectEscrowEvents(undefined, 50), 'overview escrow events db read'),
    dbTimed(() => getAgentSettlementMap(), 'overview settlement map db read'),
  ]);

  const overview = overviewRes.status === 'fulfilled' ? overviewRes.value : ({} as Parameters<typeof serializeOverview>[0]);
  const base = serializeOverview(overview);
  const agg = aggRes.status === 'fulfilled' ? aggRes.value : null;
  const topAgents = topAgentsRes.status === 'fulfilled' ? topAgentsRes.value : [];

  const metrics = {
    ...base,
    totalVolumeLamports: agg?.totalVolume ?? '0',
    totalCallsSettled:   agg?.totalCalls ?? '0',
    totalDeposited:      agg?.totalDeposited ?? '0',
    totalEscrowBalance:  agg?.totalBalance ?? '0',
    activeEscrows:       agg?.activeEscrows ?? 0,
    fundedEscrows:       agg?.fundedEscrows ?? 0,
    totalEscrows:        agg?.totalEscrows ?? 0,
    topAgentsByRevenue: topAgents.map((r) => ({
      agentPda:     r.agentPda,
      totalSettled: r.totalSettled,
      totalCalls:   r.totalCalls,
      escrowCount:  r.escrowCount,
    })),
  };

  const agentsRaw = agentsRes.status === 'fulfilled' ? agentsRes.value : [];
  const agents = Array.isArray(agentsRaw)
    ? agentsRaw.map(serializeDiscoveredAgent)
    : (agentsRaw as { agents?: DiscoveredAgent[] }).agents?.map(serializeDiscoveredAgent) ?? [];

  // Merge settlement stats (data unification)
  const settlementMap = settlementMapRes.status === 'fulfilled' ? settlementMapRes.value : {};
  for (const agent of agents) {
    const stats = settlementMap[agent.pda];
    if (stats) {
      (agent as SerializedDiscoveredAgent & { settlementStats?: unknown }).settlementStats = {
        totalSettled: stats.totalSettled,
        totalCalls: stats.totalCalls,
        totalDeposited: stats.totalDeposited,
        escrowCount: stats.escrowCount,
        activeEscrows: stats.activeEscrows,
      };
    }
  }

  const toolsRaw = toolsRes.status === 'fulfilled' ? toolsRes.value : [];
  const tools = Array.isArray(toolsRaw) ? toolsRaw.map(serializeDiscoveredTool) : [];
  const escrowsRaw = escrowsRes.status === 'fulfilled' ? escrowsRes.value : [];
  const escrows = escrowsRaw.map(serializeEscrow);
  const attestationsRaw = attestationsRes.status === 'fulfilled' ? attestationsRes.value : [];
  const attestations = attestationsRaw.map((a) => ({ pda: a.pda?.toBase58?.() ?? String(a.pda), ...serialize(a.account) }));
  const feedbacksRaw = feedbacksRes.status === 'fulfilled' ? feedbacksRes.value : [];
  const feedbacks = feedbacksRaw.map((f) => ({ pda: f.pda?.toBase58?.() ?? String(f.pda), ...serialize(f.account) }));
  const vaultsRaw = vaultsRes.status === 'fulfilled' ? vaultsRes.value : [];
  const vaults = vaultsRaw.map((v) => ({ pda: v.pda?.toBase58?.() ?? String(v.pda), ...serialize(v.account) }));
  const events = eventsRes.status === 'fulfilled' ? eventsRes.value : [];

  return {
    metrics,
    agents: { agents, total: agents.length },
    tools: { tools, categories: [], total: tools.length },
    escrows: { escrows, total: escrows.length },
    attestations: { attestations, total: attestations.length },
    feedbacks: { feedbacks, total: feedbacks.length },
    vaults: { vaults, total: vaults.length },
    escrowEvents: { events, total: events.length },
  };
}

export async function GET() {
  try {
    const cacheKey = 'overview-batch';
    const cached = peek<Awaited<ReturnType<typeof fetchOverview>>>(cacheKey);
    if (cached) {
      swr(cacheKey, fetchOverview, { ttl: 30_000, swr: 300_000 }).catch(() => {});
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' },
      });
    }

    const data = await swr(cacheKey, fetchOverview, { ttl: 30_000, swr: 300_000 });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' },
    });
  } catch (err: unknown) {
    console.error('[overview]', err);
    return NextResponse.json({ error: (err as Error).message ?? 'Failed to fetch overview' }, { status: 500 });
  }
}
