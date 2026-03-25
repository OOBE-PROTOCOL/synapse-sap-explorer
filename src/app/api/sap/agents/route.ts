/* ──────────────────────────────────────────────
 * GET /api/sap/agents — Discover agents on-chain
 *
 * Query params:
 *   capability  — filter by capability id
 *   protocol    — filter by protocol
 *   limit       — max results (default 50)
 * ────────────────────────────────────────────── */

import { synapseResponse, withSynapseError } from '~/lib/synapse/client';
import type { DiscoveredAgent } from '~/lib/sap/discovery';
import {
  findAgentsByCapability,
  findAgentsByProtocol,
  findAllAgents,
  serializeDiscoveredAgent,
} from '~/lib/sap/discovery';

export const GET = withSynapseError(async (req: Request) => {
  const { searchParams } = new URL(req.url);

  const capability = searchParams.get('capability');
  const protocol = searchParams.get('protocol');
  const limit = Math.min(Number(searchParams.get('limit') ?? '50'), 200);

  let agents: DiscoveredAgent[];

  if (capability) {
    agents = await findAgentsByCapability(capability);
  } else if (protocol) {
    agents = await findAgentsByProtocol(protocol);
  } else {
    // Fetch ALL agents via program.account.agentAccount.all()
    agents = await findAllAgents();
  }

  // Deduplicate by PDA
  const seen = new Set<string>();
  const unique = agents.filter((a) => {
    const key = a.pda.toBase58();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const limited = unique.slice(0, limit);

  return synapseResponse({
    agents: limited.map(serializeDiscoveredAgent),
    total: limited.length,
  });
});
