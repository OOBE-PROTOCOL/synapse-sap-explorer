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
import { swr } from '~/lib/cache';

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const protocol = searchParams.get('protocol');
  const capability = searchParams.get('capability');
  const cacheKey = `graph:${protocol ?? ''}:${capability ?? ''}`;

  const data = await swr(cacheKey, async () => {
    let agents: DiscoveredAgent[];
    if (capability) {
      agents = await findAgentsByCapability(capability);
    } else if (protocol) {
      agents = await findAgentsByProtocol(protocol);
    } else {
      agents = await findAllAgents();
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = agents.filter((a) => {
      const key = a.pda.toBase58();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const tools = await findAllTools();
    return buildGraphData(unique, tools);
  }, { ttl: 60_000, swr: 300_000 });

  return synapseResponse(data);
});
