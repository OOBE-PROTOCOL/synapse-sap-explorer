export const dynamic = 'force-dynamic';

/* ──────────────────────────────────────────────
 * GET /api/sap/graph — Network graph data for visualization
 *
 * Returns nodes (agents, protocols, capabilities)
 * and links for the bubble map / force graph.
 *
 * Query params:
 *   protocol — optional protocol filter
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

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const protocol = searchParams.get('protocol');
  const capability = searchParams.get('capability');

  let agents: DiscoveredAgent[];
  if (capability) {
    agents = await findAgentsByCapability(capability);
  } else if (protocol) {
    agents = await findAgentsByProtocol(protocol);
  } else {
    // Fetch ALL agents for the network graph
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

  // Also fetch tools to include in the graph
  const tools = await findAllTools();

  const graph = buildGraphData(unique, tools);
  return synapseResponse(graph);
});
