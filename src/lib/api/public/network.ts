import { peek, swr } from '~/lib/cache';
import {
  buildGraphData,
  findAgentsByCapability,
  findAgentsByProtocol,
  findAllAgents,
  findAllTools,
  getNetworkOverview,
  serializeOverview,
  type DiscoveredAgent,
} from '~/lib/sap/discovery';
import { getAgentRevenueRanking, getEscrowAggregates, selectSnapshotHistory } from '~/lib/db/queries';
import { isDbDown } from '~/db';
import type { GraphData } from '~/types/sap';
import type { PublicDataSource } from '~/types';

export type PublicMetricsResult = {
  metrics: Record<string, unknown>;
  source: PublicDataSource;
};

export type PublicGraphResult = {
  graph: GraphData;
  source: PublicDataSource;
};

export type PublicSnapshotsResult = {
  snapshots: Array<Record<string, unknown>>;
  total: number;
  source: PublicDataSource;
};

async function fetchMetrics() {
  const [overview, agg, topAgents] = await Promise.allSettled([
    getNetworkOverview(),
    getEscrowAggregates(),
    getAgentRevenueRanking(5),
  ]);

  const base = serializeOverview(
    overview.status === 'fulfilled'
      ? overview.value
      : ({} as Parameters<typeof serializeOverview>[0]),
  );
  const volume = agg.status === 'fulfilled' ? agg.value : null;
  const ranking = topAgents.status === 'fulfilled' ? topAgents.value : [];

  return {
    ...base,
    totalVolumeLamports: volume?.totalVolume ?? '0',
    totalCallsSettled: volume?.totalCalls ?? '0',
    totalDeposited: volume?.totalDeposited ?? '0',
    totalEscrowBalance: volume?.totalBalance ?? '0',
    activeEscrows: volume?.activeEscrows ?? 0,
    fundedEscrows: volume?.fundedEscrows ?? 0,
    totalEscrows: volume?.totalEscrows ?? 0,
    topAgentsByRevenue: ranking.map((r) => ({
      agentPda: r.agentPda,
      totalSettled: r.totalSettled,
      totalCalls: r.totalCalls,
      escrowCount: r.escrowCount,
    })),
  };
}

export async function getPublicMetrics(): Promise<PublicMetricsResult> {
  const cached = peek<Record<string, unknown>>('metrics');
  if (cached) {
    swr('metrics', fetchMetrics, { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return { metrics: cached, source: 'cache' };
  }

  const metrics = await fetchMetrics();
  swr('metrics', () => Promise.resolve(metrics), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return { metrics, source: 'mixed' };
}

async function fetchGraph(protocol?: string, capability?: string): Promise<GraphData> {
  let agents: DiscoveredAgent[];
  if (capability) {
    agents = await findAgentsByCapability(capability);
  } else if (protocol) {
    agents = await findAgentsByProtocol(protocol);
  } else {
    agents = await findAllAgents();
  }

  const seen = new Set<string>();
  const unique = agents.filter((a) => {
    const key = a.pda.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const tools = await findAllTools();
  return buildGraphData(unique, tools);
}

export async function getPublicGraph(input: { protocol?: string; capability?: string }): Promise<PublicGraphResult> {
  const { protocol, capability } = input;
  const cacheKey = `graph:${protocol ?? ''}:${capability ?? ''}`;

  const cached = peek<GraphData>(cacheKey);
  if (cached) {
    swr(cacheKey, () => fetchGraph(protocol, capability), { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return { graph: cached, source: 'cache' };
  }

  const graph = await fetchGraph(protocol, capability);
  swr(cacheKey, () => Promise.resolve(graph), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return { graph, source: 'rpc' };
}

async function buildSnapshotBackfill(): Promise<PublicSnapshotsResult> {
  const overview = await getNetworkOverview();
  const s = serializeOverview(overview);
  const snapshots = [
    {
      capturedAt: new Date().toISOString(),
      totalAgents: Number(s.totalAgents),
      activeAgents: Number(s.activeAgents),
      totalTools: s.totalTools,
      totalVaults: s.totalVaults,
      totalAttestations: s.totalAttestations,
      totalFeedbacks: Number(s.totalFeedbacks),
      totalCapabilities: s.totalCapabilities,
      totalProtocols: s.totalProtocols,
    },
  ];
  return {
    snapshots,
    total: snapshots.length,
    source: 'rpc',
  };
}

export async function getPublicSnapshots(days: number): Promise<PublicSnapshotsResult> {
  if (isDbDown()) {
    return buildSnapshotBackfill();
  }

  try {
    const rows = await selectSnapshotHistory(days);
    const snapshots = rows.map((s) => ({
      capturedAt: s.capturedAt.toISOString(),
      totalAgents: s.totalAgents,
      activeAgents: s.activeAgents,
      totalTools: s.totalTools,
      totalVaults: s.totalVaults,
      totalAttestations: s.totalAttestations,
      totalFeedbacks: s.totalFeedbacks,
      totalCapabilities: s.totalCapabilities,
      totalProtocols: s.totalProtocols,
    }));

    return {
      snapshots,
      total: snapshots.length,
      source: 'db',
    };
  } catch {
    return buildSnapshotBackfill();
  }
}

