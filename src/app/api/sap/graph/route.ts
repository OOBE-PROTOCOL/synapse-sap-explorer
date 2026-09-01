export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/graph — Network graph data for visualization
 *
 * SWR cached (60s fresh, 5min stale window)
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import type { DiscoveredAgent } from '~/lib/sap/discovery';
import {
  findAgentsByProtocol,
  findAgentsByCapability,
  findAllAgents,
  findAllTools,
  fetchIndexedAgents,
  fetchIndexedTools,
  buildGraphData,
} from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';
import type { GraphData } from '~/types/sap';

function dedupeAgents(agents: DiscoveredAgent[]) {
  const seen = new Set<string>();
  return agents.filter((agent) => {
    const key = agent.pda.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function filterAgentsBySelection(agents: DiscoveredAgent[], capability: string | null, protocol: string | null) {
  let filtered = agents;
  if (capability) {
    filtered = filtered.filter((agent) => (agent.identity?.capabilities ?? []).some((cap) => cap.id === capability || cap.protocolId === capability));
  }
  if (protocol) {
    filtered = filtered.filter((agent) => (agent.identity?.protocols ?? []).includes(protocol));
  }
  return filtered;
}

async function rpcFetchGraph(capability: string | null, protocol: string | null) {
  let agents: DiscoveredAgent[];
  if (capability) {
    agents = await findAgentsByCapability(capability);
  } else if (protocol) {
    agents = await findAgentsByProtocol(protocol);
  } else {
    agents = await findAllAgents();
  }
  const unique = dedupeAgents(agents);
  const tools = await findAllTools();
  return buildGraphData(filterAgentsBySelection(unique, capability, protocol), tools);
}

async function dbFetchGraph(capability: string | null, protocol: string | null) {
  const [indexedAgents, indexedTools] = await Promise.all([
    fetchIndexedAgents(),
    fetchIndexedTools(),
  ]);
  if (indexedAgents.length === 0 && indexedTools.length === 0) {
    return rpcFetchGraph(capability, protocol);
  }
  const filtered = filterAgentsBySelection(dedupeAgents(indexedAgents), capability, protocol);
  return buildGraphData(filtered, indexedTools);
}

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const protocol = searchParams.get('protocol');
  const capability = searchParams.get('capability');
  const cacheKey = `graph:${protocol ?? ''}:${capability ?? ''}`;

  // Instant return if cache warm
  const cached = peek<GraphData>(cacheKey);
  if (cached) {
    swr(cacheKey, () => dbFetchGraph(capability, protocol), { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  // Cold start
  const data = await dbFetchGraph(capability, protocol);
  swr(cacheKey, () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
