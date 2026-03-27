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
  buildGraphData,
} from '~/lib/sap/discovery';
import { swr, peek } from '~/lib/cache';

async function rpcFetchGraph(capability: string | null, protocol: string | null) {
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

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const protocol = searchParams.get('protocol');
  const capability = searchParams.get('capability');
  const cacheKey = `graph:${protocol ?? ''}:${capability ?? ''}`;

  // Instant return if cache warm
  const cached = peek<any>(cacheKey);
  if (cached) {
    swr(cacheKey, () => rpcFetchGraph(capability, protocol), { ttl: 60_000, swr: 300_000 }).catch(() => {});
    return synapseResponse(cached);
  }

  // Cold start
  const data = await rpcFetchGraph(capability, protocol);
  swr(cacheKey, () => Promise.resolve(data), { ttl: 60_000, swr: 300_000 }).catch(() => {});
  return synapseResponse(data);
});
